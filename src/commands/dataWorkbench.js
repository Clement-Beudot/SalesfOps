const fs = require('fs');
const { createDarkWindow } = require('../windows/window-utils');
const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const { shellExec } = require('../utils/shell-exec');
const { runSoqlQuery } = require('../utils/salesforce-query');
const sfRest = require('../utils/salesforce-rest');
const { runDml, runDmlBatch } = sfRest;

class DataWorkbenchCommand {
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
        this.formulaRefWindow = null;
        this.cachedOrgs = null;
    }

    createWindow() {
        if (this.window) {
            this.window.focus();
            return;
        }

        if (process.platform === 'darwin') {
            this.app.dock.show();
        }

        this.window = createDarkWindow({
            width: 1100,
            height: 700,
            frame: true,
            transparent: false,
            resizable: true,
            alwaysOnTop: false,
            minWidth: 800,
            minHeight: 500,
            titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
            trafficLightPosition: { x: 20, y: 20 },
        });

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/data-workbench.html'));

        this.window.on('closed', () => {
            this.window = null;
            if (process.platform === 'darwin') {
                const hasOpenWindows = BrowserWindow.getAllWindows().some(w => !w.isDestroyed());
                if (!hasOpenWindows) {
                    this.app.dock.hide();
                }
            }
        });
    }

    // Deep-flatten any Salesforce value into leaf columns at a given path.
    // Objects are expanded (attributes skipped), arrays indexed 0, 1, 2…

    fetchOrgs() {
        return new Promise((resolve) => {
            shellExec('sf org list --json', (error, stdout) => {
                try {
                    const data = JSON.parse(stdout);
                    const nonScratch = (data.result?.nonScratchOrgs || []).map(org => ({
                        alias: org.alias || '',
                        username: org.username,
                        connectedStatus: org.connectedStatus,
                        isDefault: org.isDefaultUsername || false,
                        isDevHub: org.isDevHub || false,
                        isSandbox: org.isSandbox || false
                    }));
                    const scratch = (data.result?.scratchOrgs || []).map(org => ({
                        alias: org.alias || '',
                        username: org.username,
                        connectedStatus: org.status,
                        isDefault: org.isDefaultUsername || false
                    }));
                    resolve({ orgs: [...nonScratch, ...scratch], error: null });
                } catch {
                    resolve({ orgs: [], error: 'Failed to load orgs. Is Salesforce CLI installed?' });
                }
            });
        });
    }

    setupIpc(ipcMain) {
        ipcMain.handle('check-sf-cli', () => new Promise(resolve => {
            shellExec('sf --version', (error) => {
                resolve({ available: !error });
            });
        }));

        ipcMain.handle('data-workbench-run-soql', async (_event, { query, orgIdentifier }) => {
            const result = await runSoqlQuery(query, orgIdentifier);
            if (!result.error) {
                try { result.instanceUrl = (await sfRest.getSession(orgIdentifier)).instanceUrl; } catch {}
            }
            return result;
        });

        ipcMain.handle('data-workbench-get-orgs', async () => {
            if (this.cachedOrgs !== null) return this.cachedOrgs;
            const result = await this.fetchOrgs();
            this.cachedOrgs = result;
            return result;
        });

        ipcMain.handle('data-workbench-refresh-orgs', async () => {
            const result = await this.fetchOrgs();
            this.cachedOrgs = result;
            return result;
        });

        ipcMain.handle('data-workbench-save-model', async (_event, { data, defaultPath }) => {
            const result = await dialog.showSaveDialog(this.window, {
                title: 'Save Workbench Model',
                defaultPath: defaultPath || 'workbench-model.json',
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (result.canceled || !result.filePath) return { canceled: true };
            try {
                fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
                return { success: true, filePath: result.filePath };
            } catch (err) {
                return { error: err.message };
            }
        });

        ipcMain.handle('data-workbench-load-model', async () => {
            const result = await dialog.showOpenDialog(this.window, {
                title: 'Load Workbench Model',
                filters: [{ name: 'JSON', extensions: ['json'] }],
                properties: ['openFile']
            });
            if (result.canceled || !result.filePaths.length) return { canceled: true };
            try {
                const content = fs.readFileSync(result.filePaths[0], 'utf-8');
                return { success: true, data: JSON.parse(content), filePath: result.filePaths[0] };
            } catch (err) {
                return { error: err.message };
            }
        });

        ipcMain.handle('data-workbench-download-csv', async (_event, { filename, content }) => {
            const result = await dialog.showSaveDialog(this.window, {
                title: 'Download CSV',
                defaultPath: `${filename}.csv`,
                filters: [{ name: 'CSV', extensions: ['csv'] }]
            });
            if (result.canceled || !result.filePath) return { canceled: true };
            try {
                fs.writeFileSync(result.filePath, content, 'utf-8');
                return { success: true };
            } catch (err) {
                return { error: err.message };
            }
        });

        ipcMain.handle('data-workbench-dml', async (event, params) => {
            try {
                const result = await runDml({
                    ...params,
                    onBatchDone: ({ batchIndex, total, results }) => {
                        if (!event.sender.isDestroyed()) {
                            event.sender.send('data-workbench-dml-progress', { batchIndex, total, results });
                        }
                    }
                });
                return { success: true, ...result };
            } catch (err) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('data-workbench-dml-batch', async (_event, params) => {
            try {
                return await runDmlBatch(params);
            } catch (err) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.on('close-data-workbench', () => {
            if (this.window) {
                this.window.close();
            }
        });

        ipcMain.handle('get-formula-reference-md', () => {
            const mdPath = path.join(this.app.getAppPath(), 'docs/formula-reference.md');
            return fs.readFileSync(mdPath, 'utf8');
        });

        ipcMain.on('open-formula-reference', () => {
            if (this.formulaRefWindow && !this.formulaRefWindow.isDestroyed()) {
                this.formulaRefWindow.focus();
                return;
            }
            this.formulaRefWindow = createDarkWindow({
                width: 860,
                height: 680,
                frame: true,
                transparent: false,
                resizable: true,
                alwaysOnTop: false,
                minWidth: 560,
                minHeight: 400,
                titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
                trafficLightPosition: { x: 20, y: 16 },
            });
            this.formulaRefWindow.loadFile(path.join(this.app.getAppPath(), 'src/windows/formula-reference.html'));
            this.formulaRefWindow.on('closed', () => { this.formulaRefWindow = null; });
        });
    }
}

module.exports = DataWorkbenchCommand;
