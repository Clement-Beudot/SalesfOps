const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');

class ExtractValueCommand {
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
            height: 260,
            frame: false,
            resizable: false,
            alwaysOnTop: true
        });

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/extract-value.html'));
        this.window.center();

        this.window.on('closed', () => {
            this.window = null;
        });

        this.window.on('blur', () => {
            this.window.close();
        });
    }


    setupIpc(ipcMain) {
        ipcMain.handle('extract-paths', (event, jsonString) => {
            try {                const data = JSON.parse(jsonString);
                return paths;
            } catch (error) {
                return { error: `Invalid JSON format: ${error.message}` };
            }
        });

        ipcMain.handle('extract-values', (event, { jsonString, path }) => {
            try {
                const data = JSON.parse(jsonString);
                return this.extractValues(data, path);
            } catch (error) {
                return { error: 'Failed to extract values' };
            }
        });

        ipcMain.on('close-extract-value', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }

    extractPaths(data, prefix = '', paths = new Set()) {
        if (!Array.isArray(data) && typeof data === 'object' && data !== null) {
            data = [data];
        }
        
        data.forEach(item => {
            if (!item || typeof item !== 'object') return;
            
            Object.entries(item).forEach(([key, value]) => {
                if (key === 'attributes') return;
                
                const currentPath = prefix ? `${prefix}.${key}` : key;
                
                if (typeof value === 'object' && value !== null) {
                    if (value.records) {
                        if (value.records.length > 0) {
                            const recordSample = value.records[0];
                            Object.keys(recordSample).forEach(recordKey => {
                                if (recordKey !== 'attributes') {
                                    paths.add(`${currentPath}.records.${recordKey}`);
                                }
                            });
                        }
                    } else if (!Array.isArray(value)) {
                        this.extractPaths([value], currentPath, paths);
                    }
                } else {
                    paths.add(currentPath);
                }
            });
        });

        return Array.from(paths).sort();
    }

    extractValues(data, path) {
        if (!Array.isArray(data)) {
            data = [data];
        }

        const values = new Set();
        const pathParts = path.split('.');

        data.forEach(item => {
            let current = item;
            
            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                
                if (!current) break;
                
                if (part === 'records') {
                    if (current.records && Array.isArray(current.records)) {
                        const nextPart = pathParts[i + 1];
                        current.records.forEach(record => {
                            if (record && record[nextPart] !== undefined) {
                                values.add(record[nextPart]);
                            }
                        });
                        break;
                    }
                } else {
                    current = current[part];
                    if (i === pathParts.length - 1 && current !== undefined) {
                        values.add(current);
                    }
                }
            }
        });

        return Array.from(values);
    }

    setupIpc(ipcMain) {
        ipcMain.handle('extract-paths', (event, jsonString) => {
            try {
                const data = JSON.parse(jsonString);
                return this.extractPaths(data);
            } catch (error) {
                console.error('Error extracting paths:', error);
                return { error: 'Invalid JSON format' };
            }
        });

        ipcMain.handle('extract-values', (event, { jsonString, path }) => {
            try {
                const data = JSON.parse(jsonString);
                return this.extractValues(data, path);
            } catch (error) {
                console.error('Error extracting values:', error);
                return { error: 'Failed to extract values' };
            }
        });

        ipcMain.on('close-extract-value', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }
}

module.exports = ExtractValueCommand;