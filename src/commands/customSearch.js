const { shell } = require('electron');
const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');

/**
 * Handles custom search operations and their windows
 * @class
 */
class CustomSearchCommand {
    /**
     * Creates a new CustomSearchCommand instance
     * @param {Electron.App} app - The main Electron application instance
     * @param {SettingsManager} settingsManager - The settings manager instance
     */
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
    }

    /**
     * Creates and displays the custom search input window
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

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/custom-search-input.html'));
        this.window.center();

        this.window.webContents.on('did-finish-load', async () => {
            const searches = await this.settings.get('customSearches') || [];
            this.window.webContents.send('custom-searches', searches);
        });

        this.window.on('closed', () => {
            this.window = null;
        });

        this.window.on('blur', () => {
            this.window.close();
        });
    }

    /**
     * Executes a custom search with the given parameters
     * @param {number} searchId - The index of the custom search configuration to use
     * @param {string} [searchTerm=''] - The search term to use in the URL
     * @returns {Promise<void>}
     */
    async executeSearch(searchId, searchTerm = '') {
        try {
            const searches = await this.settings.get('customSearches');
            const search = searches[searchId];
            
            if (!search) return;
    
            let url = search.url;
            if (search.activateSearch && searchTerm) {
                const processedSearchTerm = search.allowSpaces 
                    ? searchTerm 
                    : searchTerm.replace(/\s+/g, '');
                
                url = url.replace('{@}', encodeURIComponent(processedSearchTerm));
            }
            
            await shell.openExternal(url);
            
            if (this.window) {
                this.window.close();
            }
        } catch (error) {
            console.error('Error executing custom search:', error);
        }
    }

    /**
     * Sets up IPC handlers for custom search operations
     * @param {Electron.IpcMain} ipcMain - The Electron IPC main instance
     */
    setupIpc(ipcMain) {
        ipcMain.on('execute-custom-search', async (event, { searchId, searchTerm }) => {
            await this.executeSearch(searchId, searchTerm);
        });

        ipcMain.on('close-custom-search', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }
}

module.exports = CustomSearchCommand;
