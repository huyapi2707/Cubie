# Cubie

A **production-ready Electron desktop application** built with React, TypeScript, shadcn/ui, and TailwindCSS.

## Tech Stack

| Layer          | Technology                          |
| -------------- | ----------------------------------- |
| Runtime        | Electron (latest stable)            |
| Frontend       | React 18 + TypeScript               |
| Bundler        | Vite                                |
| Styling        | TailwindCSS + shadcn/ui             |
| State          | Zustand (global) + React Query (async) |
| Packaging      | Electron Builder                    |
| Linting        | ESLint + Prettier                   |

---

## Project Structure

```
app/
├── main/                    # Electron main process
│   ├── index.ts             # Window creation, app lifecycle
│   └── ipc-handlers.ts      # IPC handler implementations
├── preload/                 # Secure IPC bridge
│   └── index.ts             # contextBridge API
├── renderer/                # React application
│   ├── components/
│   │   ├── layout/          # AppLayout, TitleBar, Sidebar
│   │   ├── pages/           # Dashboard, Activity, Documents, System, Settings
│   │   └── ui/              # shadcn/ui primitives (Button, Card, Badge, etc.)
│   ├── hooks/               # useTheme, useElectron
│   ├── lib/                 # Utilities (cn)
│   ├── services/            # IPC service wrappers
│   ├── store/               # Zustand stores
│   ├── types/               # TypeScript declarations
│   ├── App.tsx              # Root component + React Query provider
│   ├── main.tsx             # Entry point
│   ├── index.css            # Global styles + design tokens
│   └── index.html           # HTML template
└── shared/                  # Shared types (main ↔ renderer)
    └── ipc.ts               # Typed IPC channels & payloads
```

---

## Security Architecture

This application follows Electron security best practices:

- **`contextIsolation: true`** — Renderer runs in an isolated JS context.
- **`nodeIntegration: false`** — No Node.js APIs in the renderer.
- **`sandbox: true`** — Main process sandbox enabled.
- **Preload bridge** — All IPC goes through `contextBridge.exposeInMainWorld()`.
- **Typed channels** — Every IPC channel and payload is centrally typed in `app/shared/ipc.ts`.
- **Navigation guards** — External URLs are opened in the system browser, not in the app window.
- **No webview** — `will-attach-webview` is blocked.

---

## IPC Communication Layer

The typed IPC flow:

```
Renderer  →  window.electronAPI.system.getInfo()
    ↓
Preload   →  ipcRenderer.invoke('system:get-info')
    ↓
Main      →  ipcMain.handle('system:get-info', handler)
    ↓
Response  →  SystemInfo object returned to renderer
```

All channels are defined in `app/shared/ipc.ts` with full TypeScript types.

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install

```bash
npm install
```

### Development

```bash
# Start Vite dev server + Electron
npm run dev
```

This runs:
- **Vite** dev server on `http://localhost:5173` (hot reload)
- **Electron** main process with file watching

### Build

```bash
# Build all (renderer + main + preload)
npm run build
```

### Package

```bash
# Package for current platform
npm run package

# Package for specific platform
npm run package:win
npm run package:mac
npm run package:linux
```

---

## Scripts Reference

| Script             | Description                        |
| ------------------ | ---------------------------------- |
| `npm run dev`      | Start development environment      |
| `npm run build`    | Build all processes                |
| `npm run package`  | Build + package with Electron Builder |
| `npm run lint`     | Run ESLint                         |
| `npm run lint:fix` | Run ESLint with auto-fix           |
| `npm run format`   | Format code with Prettier          |
| `npm run typecheck`| TypeScript type checking           |

---

## Features

- **Custom frameless title bar** with window controls
- **Collapsible sidebar** with animated navigation
- **Dark / Light / System** theme support via IPC
- **Dashboard** with stat cards, activity log, and quick actions
- **System Info** page — live IPC demo fetching OS data
- **Documents** page — file picker IPC integration
- **Settings** page — theme selector + app metadata
- **Activity** timeline with status indicators

---

## Design System

- **Fonts**: Instrument Sans (body), Cabinet Grotesk (display), JetBrains Mono (code)
- **Colors**: Custom HSL palette with purple primary, dark/light theme tokens
- **Components**: shadcn/ui primitives (Button, Card, Badge, Separator, ScrollArea)
- **Animations**: Fade-in, scale-in, slide-in-left, shimmer
- **Utilities**: Glassmorphism, gradient text, drag regions

---

## License

MIT
