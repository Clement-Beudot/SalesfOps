const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');

class SoqlRunnerCommand {
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
            width: 960,
            height: 260,
            minWidth: 500,
            minHeight: 200,
            frame: false,
            transparent: true,
            resizable: true,
            alwaysOnTop: true,
            skipTaskbar: true,
        });

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/soql-runner.html'));
        this.window.center();

        this.window.on('closed', () => { this.window = null; });
    }

    setupIpc(ipcMain) {
        ipcMain.on('soql-runner-close', () => {
            if (this.window) this.window.close();
        });

        ipcMain.on('soql-runner-resize', (_event, { width, height } = {}) => {
            if (!this.window) return;
            const [curW, curH] = this.window.getSize();
            const newW = width  !== undefined ? Math.max(500,  Math.min(width,  1400)) : curW;
            const newH = height !== undefined ? Math.max(200,  Math.min(height, 700))  : curH;
            this.window.setSize(newW, newH, true);
        });
    }
}

module.exports = SoqlRunnerCommand;
