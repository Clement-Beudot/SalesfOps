const { createDarkWindow } = require('../windows/window-utils');
const { shellExec } = require('../utils/shell-exec');

const path = require('path');

class SfdxOrgsCommand {
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
        this.cachedOrgs = null;
    }

    createWindow() {
        if (this.window) {
            this.window.focus();
            return;
        }

        this.window = createDarkWindow({
            width: 300,
            height: 420,
            frame: false,
            transparent: true,
            resizable: false,
            alwaysOnTop: true
        });

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/sfdx-orgs.html'));
        this.window.center();

        this.window.on('closed', () => {
            this.window = null;
        });
    }

    async fetchOrgs() {
        return new Promise((resolve) => {
            shellExec('sf org list --json', (error, stdout) => {
                try {
                    const data = JSON.parse(stdout);
                    const nonScratch = (data.result?.nonScratchOrgs || []).map(org => ({
                        alias: org.alias || '',
                        username: org.username,
                        type: 'non-scratch',
                        connectedStatus: org.connectedStatus,
                        isDefault: org.isDefaultUsername || false,
                        isDevHub: org.isDevHub || false,
                        isSandbox: org.isSandbox || false
                    }));
                    const scratch = (data.result?.scratchOrgs || []).map(org => ({
                        alias: org.alias || '',
                        username: org.username,
                        type: 'scratch',
                        connectedStatus: org.status,
                        isDefault: org.isDefaultUsername || false,
                        expirationDate: org.expirationDate || ''
                    }));
                    resolve({ orgs: [...nonScratch, ...scratch], error: null });
                } catch {
                    resolve({ orgs: [], error: 'Failed to parse org list. Is Salesforce CLI installed?' });
                }
            });
        });
    }

    setupIpc(ipcMain) {
        ipcMain.handle('get-sfdx-orgs', async () => {
            if (this.cachedOrgs !== null) {
                return this.cachedOrgs;
            }
            const result = await this.fetchOrgs();
            this.cachedOrgs = result;
            return result;
        });

        ipcMain.handle('refresh-sfdx-orgs', async () => {
            const result = await this.fetchOrgs();
            this.cachedOrgs = result;
            return result;
        });

        ipcMain.handle('open-sfdx-org', async (event, identifier) => {
            return new Promise((resolve) => {
                shellExec(`sf org open -o "${identifier}"`, (error, stdout, stderr) => {
                    if (error) {
                        const raw = stderr || stdout || '';
                        const match = raw.match(/Error(?:\s*\(\d+\))?:\s*(.+)/i);
                        const message = match ? match[1].trim() : 'Failed to open org.';
                        resolve({ success: false, error: message });
                    } else {
                        resolve({ success: true });
                    }
                });
            });
        });

        ipcMain.on('close-sfdx-orgs', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }
}

module.exports = SfdxOrgsCommand;
