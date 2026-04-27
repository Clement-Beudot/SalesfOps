const fs = require('fs');
const path = require('path');
const { createDarkWindow } = require('../windows/window-utils');

class DocsCommand {
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
    }

    createWindow() {
        if (this.window && !this.window.isDestroyed()) {
            this.window.focus();
            return;
        }
        this.window = createDarkWindow({
            width: 980,
            height: 700,
            frame: true,
            transparent: false,
            resizable: true,
            alwaysOnTop: false,
            minWidth: 660,
            minHeight: 500,
            titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
            trafficLightPosition: { x: 20, y: 16 },
        });
        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/docs.html'));
        this.window.on('closed', () => { this.window = null; });
    }

    setupIpc(ipcMain) {
        ipcMain.handle('get-commands-md', () =>
            fs.readFileSync(path.join(this.app.getAppPath(), 'docs/commands.md'), 'utf8')
        );
        ipcMain.handle('get-data-workbench-doc-md', () =>
            fs.readFileSync(path.join(this.app.getAppPath(), 'docs/data-workbench.md'), 'utf8')
        );
        ipcMain.handle('get-data-workbench-active', () =>
            this.settings.get('dataWorkbenchActive')
        );
    }
}

module.exports = DocsCommand;
