const { spawn } = require('child_process');
const fs = require('fs');
const { createDarkWindow } = require('../windows/window-utils');
const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const { resolveEnv, shellExec } = require('../utils/shell-exec');

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
    flattenValue(val, col, result) {
        if (val === null || val === undefined) {
            result[col] = '';
        } else if (Array.isArray(val)) {
            val.forEach((item, i) => this.flattenValue(item, `${col}_${i}`, result));
        } else if (typeof val === 'object') {
            for (const [k, v] of Object.entries(val)) {
                if (k === 'attributes') continue;
                this.flattenValue(v, `${col}_${k}`, result);
            }
        } else {
            result[col] = String(val);
        }
    }

    flattenRecord(record) {
        const result = {};
        for (const [key, val] of Object.entries(record)) {
            if (key === 'attributes') continue;
            this.flattenValue(val, key, result);
        }
        return result;
    }

    async runSoqlQuery(query, orgIdentifier) {
        return new Promise(async (resolve) => {
            const args = ['data', 'query', '--query', query, '--json'];
            if (orgIdentifier) {
                args.push('-o', orgIdentifier);
            }

            const env = await resolveEnv();

            let stdout = '';
            let stderr = '';

            const child = spawn('sf', args, { env });

            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { stderr += data.toString(); });

            child.on('close', () => {
                try {
                    const data = JSON.parse(stdout);
                    if (data.status !== 0) {
                        resolve({ error: data.message || data.name || 'Query failed.' });
                        return;
                    }
                    const records = data.result?.records || [];
                    if (records.length === 0) {
                        resolve({ columns: [], rows: [], totalSize: 0 });
                        return;
                    }
                    // Scan all records to get the widest column set, then drop bare parent
                    // placeholders that were superseded by sub-columns in other records.
                    const allCols = [...new Set(records.flatMap(r => Object.keys(this.flattenRecord(r))))];
                    const columns = allCols.filter(c => !allCols.some(o => o !== c && o.startsWith(c + '_')));
                    const rows = records.map(r => {
                        const flat = this.flattenRecord(r);
                        return columns.map(c => flat[c] ?? '');
                    });
                    resolve({ columns, rows, totalSize: data.result?.totalSize || records.length });
                } catch {
                    resolve({ error: stderr.trim() || 'Failed to parse query result. Is Salesforce CLI installed?' });
                }
            });

            child.on('error', (err) => {
                if (err.code === 'ENOENT') {
                    resolve({ error: 'Salesforce CLI (sf) not found. Please install it first.' });
                } else {
                    resolve({ error: err.message });
                }
            });
        });
    }

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
        ipcMain.handle('data-workbench-run-soql', async (event, { query, orgIdentifier }) => {
            return await this.runSoqlQuery(query, orgIdentifier);
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

        ipcMain.handle('data-workbench-save-model', async (_event, modelData) => {
            const result = await dialog.showSaveDialog(this.window, {
                title: 'Save Workbench Model',
                defaultPath: 'workbench-model.json',
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (result.canceled || !result.filePath) return { canceled: true };
            try {
                fs.writeFileSync(result.filePath, JSON.stringify(modelData, null, 2), 'utf-8');
                return { success: true };
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
                return { success: true, data: JSON.parse(content) };
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
