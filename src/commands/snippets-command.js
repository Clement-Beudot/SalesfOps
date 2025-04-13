const { clipboard } = require('electron');
const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');

/**
 * Handles text snippets operations
 * @class
 */
class SnippetsCommand {
    /**
     * Creates a new SnippetsCommand instance
     * @param {Electron.App} app - The main Electron application instance
     * @param {SettingsManager} settingsManager - The settings manager instance
     */
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
    }

    /**
     * Creates and displays the snippets input window
     * @returns {void}
     */
    createWindow() {
        if (this.window) {
            this.window.focus();
            return;
        }

        this.window = createDarkWindow({
            width: 250,
            height: 110,
            frame: false,
            transparent: true,
            resizable: false,
            alwaysOnTop: true
        });

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/snippets-input.html'));
        this.window.center();

        this.window.on('closed', () => {
            this.window = null;
        });

        this.window.on('blur', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }

    /**
     * Sets up IPC handlers for snippets operations
     * @param {Electron.IpcMain} ipcMain - The Electron IPC main instance
     */
    setupIpc(ipcMain) {
        ipcMain.handle('get-snippets', async () => {
            try {
                return await this.settings.get('snippets') || [];
            } catch (error) {
                console.error('Error getting snippets:', error);
                return [];
            }
        });

        ipcMain.handle('copy-snippet-to-clipboard', async (event, text) => {
            try {
                clipboard.writeText(text);
                return true;
            } catch (error) {
                console.error('Error copying to clipboard:', error);
                return false;
            }
        });

        ipcMain.on('close-snippets', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }
}

module.exports = SnippetsCommand;