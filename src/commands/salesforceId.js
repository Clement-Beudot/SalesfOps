const { shell } = require('electron');
const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');

/**
 * Handles operations related to opening Salesforce IDs
 * @class
 */
class SalesforceIdCommand {
    /**
     * Creates a new SalesforceIdCommand instance
     * @param {Electron.App} app - The main Electron application instance
     * @param {SettingsManager} settingsManager - The settings manager instance
     */
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
    }

    /**
     * Creates and displays the Salesforce ID input window
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

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/id-input.html'));
        this.window.center();

        this.window.on('closed', () => {
            this.window = null;
        });

        this.window.on('blur', () => {
            this.window.close();
        });
    }

    /**
     * Opens a Salesforce URL with the specified ID
     * @param {string} id - The Salesforce ID to open
     * @returns {Promise<void>}
     */
    async openUrl(id) {
        try {
            const baseUrl = await this.settings.get('salesforceInstanceUrl');
            if (baseUrl) {
                const url = `${baseUrl.replace(/\/$/, '')}/${id}`;
                await shell.openExternal(url);
            }
        } catch (error) {
            console.error('Error opening Salesforce URL:', error);
        }
    }

    /**
     * Sets up IPC handlers for Salesforce ID related operations
     * @param {Electron.IpcMain} ipcMain - The Electron IPC main instance
     */
    setupIpc(ipcMain) {
        ipcMain.on('open-salesforce-id', async (event, id) => {
            await this.openUrl(id);
            if (this.window) {
                this.window.close();
            }
        });

        ipcMain.on('close-id-input', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }
}

module.exports = SalesforceIdCommand;
