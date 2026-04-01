import { app, BrowserWindow, shell, nativeTheme, Tray, Menu, nativeImage, ipcMain, session } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { getSetting } from './services/settings-store';
import { createVoiceService } from './services/voice-service';
import type { VoiceConfig } from '../shared/ipc';

// ─── Constants ─────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const RENDERER_DEV_URL = 'http://localhost:5173';

// Voice server — single source of truth for all connection config.
// In production, change the host and switch to wss:// / https://.
const VOICE_SERVER_HOST = isDev ? 'localhost:3001' : 'localhost:3001';
const VOICE_SERVER_WS = `ws://${VOICE_SERVER_HOST}`;
const VOICE_SERVER_HTTP = `http://${VOICE_SERVER_HOST}`;


const VOICE_CONFIG: VoiceConfig = {
  httpUrl: VOICE_SERVER_HTTP,
  wsUrl: `${VOICE_SERVER_WS}/ws`,
  reconnectDelayMs: 2000,
  maxReconnectAttempts: 5,
  defaultSourceLanguage: 'vi',
  defaultTargetLanguage: 'en',
};

// Voice config is now handled by the VoiceService singleton

// Apply persisted theme before window is created (prevents flash)
nativeTheme.themeSource = getSetting('theme');

// ─── Window & Tray Management ──────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let forceQuit = false;
let isRunning = false; // In-memory only — not persisted

// Renderer notifies main process when running state changes
ipcMain.on('app:set-running', (_event, running: boolean) => {
  isRunning = running;
});

/**
 * Create a 16x16 tray icon programmatically (blue circle).
 * Replace with a real .ico/.png file in production.
 */
function createTrayIcon(): Electron.NativeImage {
  // 16x16 PNG — small blue filled circle
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = 6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        // Blue color (matches primary ~217 91% 60%)
        canvas[offset] = 56;     // R
        canvas[offset + 1] = 132; // G
        canvas[offset + 2] = 244; // B
        canvas[offset + 3] = 255; // A
      } else {
        canvas[offset + 3] = 0; // transparent
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createTray(): void {
  if (tray) return;

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Cubie — Running');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Cubie',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        forceQuit = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click tray icon to restore window
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

// ─── Error Interception ────────────────────────────────────────────
import { reportError } from './services/error-reporter';

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  reportError(error.message, 'Uncaught Exception');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  const msg = reason instanceof Error ? reason.message : String(reason);
  reportError(msg, 'Unhandled Rejection');
});

// ─── Window Creation ───────────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, '..', '..', 'preload', 'index.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0b1120',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Graceful window display
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // ─── Close → tray if running ───────────────────────────────────
  mainWindow.on('close', (event) => {
    if (forceQuit) return; // Allow quit from tray menu or app.quit()

    if (isRunning) {
      event.preventDefault();
      mainWindow?.hide();
      createTray();
    }
  });

  // Security: prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(RENDERER_DEV_URL) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Security: prevent new windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load content
  if (isDev) {
    mainWindow.loadURL(RENDERER_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const rendererPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
    mainWindow.loadFile(rendererPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // When window is shown again (restored from tray), clean up tray
  mainWindow.on('show', () => {
    destroyTray();
  });

  return mainWindow;
}

// ─── Content Security Policy ───────────────────────────────────────
// Set CSP dynamically from the main process so it works in both
// dev and production without hardcoding URLs in the HTML.
function setupCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // In dev, Vite injects inline scripts for HMR — allow them.
    // In production, keep strict script-src 'self' only.
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"
      : "script-src 'self' 'wasm-unsafe-eval'";

    // WS is handled in the main process, but the renderer fetches `/auth/login` over HTTP
    const connectSrc = isDev
      ? `connect-src 'self' ws://localhost:5173 ${VOICE_SERVER_HTTP}`
      : `connect-src 'self' ${VOICE_SERVER_HTTP}`;

    const csp = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      connectSrc,
      "img-src 'self' data:",
      "worker-src 'self' blob:",
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────────
app.whenReady().then(() => {
  setupCSP();
  registerIpcHandlers();

  // Initialize the main-process voice service (owns WS connection)
  createVoiceService(VOICE_CONFIG);

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit if we're hiding to tray
  if (process.platform !== 'darwin' && !isRunning) {
    app.quit();
  }
});

// Force quit — ensure tray is cleaned up
app.on('before-quit', () => {
  forceQuit = true;
  destroyTray();
});

// ─── Security: Restrict permissions and features ───────────────────
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

export { mainWindow };
