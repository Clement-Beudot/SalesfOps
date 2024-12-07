const { shell, dialog } = require('electron');
const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');

/**
 * Handles operations for opening multiple Salesforce IDs simultaneously
 * @class
 */
class SalesforceMultipleIdsCommand {
    /**
     * Creates a new SalesforceMultipleIdsCommand instance
     * @param {Electron.App} app - The main Electron application instance
     * @param {SettingsManager} settingsManager - The settings manager instance
     */
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
    }

    /**
     * Creates and displays the multiple IDs input window
     * @returns {void}
     */
    createWindow() {
        if (this.window) {
            this.window.focus();
            return;
        }

        this.window = createDarkWindow({
            width: 450,
            height: 250,
            frame: false,
            transparent: true,
            resizable: false,
            alwaysOnTop: true
        });

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/multiple-ids-input.html'));
        this.window.center();

        this.window.webContents.on('did-finish-load', () => {
            this.window.webContents.focus();
        });

        this.window.on('closed', () => {
            this.window = null;
        });

        this.window.on('blur', () => {
            this.window.close();
        });
    }

    /**
     * Opens multiple Salesforce URLs for the given IDs
     * @param {string} ids - Space or newline separated list of Salesforce IDs
     * @returns {Promise<void>}
     * @throws {Error} When Salesforce URL is not configured
     */
    async openUrls(ids) {
        try {
            const baseUrl = await this.settings.get('salesforceInstanceUrl');
            const maxTabs = await this.settings.get('maxOpeningTabs') || 10;
            
            if (!baseUrl) {
                console.error('Salesforce URL not configured');
                return;
            }

            const validIds = ids
                .split(/[\s\n]+/)
                .filter(id => id.trim())
                .slice(0, 1000);

            if (validIds.length > maxTabs) {
                const choice = await dialog.showMessageBox(this.window, {
                    type: 'warning',
                    buttons: ['Continue', 'Cancel'],
                    defaultId: 1,
                    title: 'Warning',
                    message: `You are going to open ${validIds.length} new tabs, do you want to continue?`
                });

                if (choice.response === 1) {
                    return;
                }
            }

            for (const id of validIds) {
                const url = `${baseUrl.replace(/\/$/, '')}/${id.trim()}`;
                await shell.openExternal(url);
            }
        } catch (error) {
            console.error('Error opening Salesforce URLs:', error);
        }
    }

    /**
     * Sets up IPC handlers for multiple IDs operations
     * @param {Electron.IpcMain} ipcMain - The Electron IPC main instance
     */
    setupIpc(ipcMain) {
        ipcMain.on('open-multiple-salesforce-ids', async (event, ids) => {
            await this.openUrls(ids);
            if (this.window) {
                this.window.close();
            }
        });

        ipcMain.on('close-multiple-ids-input', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }
}

module.exports = SalesforceMultipleIdsCommand;
