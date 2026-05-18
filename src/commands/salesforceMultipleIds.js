const { shell, dialog } = require('electron');
const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');

class SalesforceMultipleIdsCommand {
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
    }

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

    async openUrls(ids) {
        try {
            const baseUrl = await this.settings.get('salesforceInstanceUrl');
            const maxTabs = (await this.settings.get('maxOpeningTabs')) || 10;

            if (!baseUrl) return;

            const validIds = ids.split(/[\s\n]+/).filter(id => id.trim()).slice(0, 1000);
            if (!validIds.length) return;

            if (validIds.length > maxTabs) {
                // Show dialog without a parent window — avoids triggering the blur handler
                const { response } = await dialog.showMessageBox({
                    type: 'warning',
                    buttons: ['Continue', 'Cancel'],
                    defaultId: 1,
                    title: 'Warning',
                    message: `You are about to open ${validIds.length} tabs. Continue?`
                });
                if (response === 1) return; // cancelled — leave window open so user can edit
            }

            // Close before the browser steals focus, so the blur handler can't race
            if (this.window) this.window.close();

            const base = baseUrl.replace(/\/$/, '');
            await Promise.all(validIds.map(id => shell.openExternal(`${base}/${id.trim()}`)));
        } catch (error) {
            console.error('Error opening Salesforce URLs:', error);
        }
    }

    setupIpc(ipcMain) {
        ipcMain.on('open-multiple-salesforce-ids', async (event, ids) => {
            await this.openUrls(ids);
        });

        ipcMain.on('close-multiple-ids-input', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }
}

module.exports = SalesforceMultipleIdsCommand;
