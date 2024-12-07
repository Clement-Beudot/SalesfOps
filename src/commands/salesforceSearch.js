const { shell } = require('electron');
const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');

/**
 * Handles Salesforce search operations
 * @class
 */
class SalesforceSearchCommand {
    /**
     * Creates a new SalesforceSearchCommand instance
     * @param {Electron.App} app - The main Electron application instance
     * @param {SettingsManager} settingsManager - The settings manager instance
     */
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
    }

    /**
     * Creates and displays the Salesforce search window
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

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/search-input.html'));
        this.window.center();

        this.window.on('closed', () => {
            this.window = null;
        });

        this.window.on('blur', () => {
            this.window.close();
        });
    }

    /**
     * Opens a Salesforce search with the specified query
     * @param {string} query - The search query to execute
     * @returns {Promise<void>}
     * @throws {Error} When Salesforce URL is not configured
     */
    async openSearch(query) {
        try {
            const baseUrl = await this.settings.get('salesforceInstanceUrl');
            if (baseUrl) {
                const url = `${baseUrl.replace(/\/$/, '')}/one/one.app?source=alohaHeader#${query}`;
                await shell.openExternal(url);
            }
        } catch (error) {
            console.error('Error opening Salesforce search URL:', error);
        }
    }

    /**
     * Sets up IPC handlers for Salesforce search operations
     * @param {Electron.IpcMain} ipcMain - The Electron IPC main instance
     */
    setupIpc(ipcMain) {
        ipcMain.on('search-in-salesforce', async (event, query) => {
            await this.openSearch(query);
            if (this.window) {
                this.window.close();
            }
        });

        ipcMain.on('close-search-input', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }
}

module.exports = SalesforceSearchCommand;
