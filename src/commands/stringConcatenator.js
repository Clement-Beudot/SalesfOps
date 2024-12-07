const { clipboard } = require('electron');
const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');

/**
 * Handles string concatenation operations
 * @class
 */
class StringConcatenatorCommand {
    /**
     * Creates a new StringConcatenatorCommand instance
     * @param {Electron.App} app - The main Electron application instance
     * @param {SettingsManager} settingsManager - The settings manager instance
     */
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
    }

    /**
     * Creates and displays the string concatenation window
     * @returns {void}
     */
    createWindow() {
        if (this.window) {
            this.window.focus();
            return;
        }

        this.window = createDarkWindow({
            width: 450,
            height: 260,
            frame: false,
            resizable: false,
            alwaysOnTop: true
        });

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/id-concatenate.html'));
        this.window.center();

        this.window.on('closed', () => {
            this.window = null;
        });

        this.window.on('blur', () => {
            this.window.close();
        });
    }

    /**
     * Sets up IPC handlers for string concatenation operations
     * @param {Electron.IpcMain} ipcMain - The Electron IPC main instance
     */
    setupIpc(ipcMain) {
        ipcMain.handle('copy-to-clipboard', async (event, text) => {
            clipboard.writeText(text);
            return true;
        });

        ipcMain.on('close-string-concatenator', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }
}

module.exports = StringConcatenatorCommand;
