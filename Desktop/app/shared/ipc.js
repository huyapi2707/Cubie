"use strict";
/**
 * Typed IPC channel definitions.
 * All IPC communication MUST go through these channels.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
// ─── IPC Channel Names ─────────────────────────────────────────────
exports.IPC_CHANNELS = {
    // Application
    APP_GET_VERSION: 'app:get-version',
    APP_GET_PLATFORM: 'app:get-platform',
    APP_QUIT: 'app:quit',
    APP_MINIMIZE: 'app:minimize',
    APP_MAXIMIZE: 'app:maximize',
    APP_CLOSE: 'app:close',
    // Theme
    THEME_GET: 'theme:get',
    THEME_SET: 'theme:set',
    THEME_CHANGED: 'theme:changed',
    // File System
    FS_READ_FILE: 'fs:read-file',
    FS_WRITE_FILE: 'fs:write-file',
    FS_SELECT_FILE: 'fs:select-file',
    FS_SELECT_DIRECTORY: 'fs:select-directory',
    // System
    SYSTEM_GET_INFO: 'system:get-info',
    SYSTEM_OPEN_EXTERNAL: 'system:open-external',
    SYSTEM_NOTIFICATION: 'system:notification',
};
//# sourceMappingURL=ipc.js.map