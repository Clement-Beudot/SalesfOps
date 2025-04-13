const SalesforceIdCommand = require('./salesforceId');
const StringConcatenatorCommand = require('./stringConcatenator');
const SalesforceSearchCommand = require('./salesforceSearch');
const SalesforceMultipleIdsCommand = require('./salesforceMultipleIds');
const CustomSearchCommand = require('./customSearch');
const ExtractValueCommand = require('./extractValue');
const UpdateValuesCommand = require('./updateValues');
const SnippetsCommand = require('./snippets-command');


/**
 * Manages all command operations and their interactions in the application
 * @class
 */
class CommandManager {
    /**
     * Creates a new CommandManager instance
     * @param {Electron.App} app - The main Electron application instance
     * @param {SettingsManager} settingsManager - The settings manager instance
     */
    constructor(app, settingsManager) {
        this.settings = settingsManager;
        this.salesforceId = new SalesforceIdCommand(app, settingsManager);
        this.stringConcatenator = new StringConcatenatorCommand(app, settingsManager);
        this.salesforceSearch = new SalesforceSearchCommand(app, settingsManager);
        this.salesforceMultipleIds = new SalesforceMultipleIdsCommand(app, settingsManager);
        this.customSearch = new CustomSearchCommand(app, settingsManager);
        this.extractValue = new ExtractValueCommand(app, settingsManager);
        this.updateValues = new UpdateValuesCommand(app, settingsManager);
        this.snippets = new SnippetsCommand(app, settingsManager);
    }

    /**
     * Sets up IPC (Inter-Process Communication) handlers for all commands
     * @param {Electron.IpcMain} ipcMain - The Electron IPC main instance
     */
    setupIpc(ipcMain) {
        this.salesforceId.setupIpc(ipcMain);
        this.stringConcatenator.setupIpc(ipcMain);
        this.salesforceSearch.setupIpc(ipcMain);
        this.salesforceMultipleIds.setupIpc(ipcMain);
        this.customSearch.setupIpc(ipcMain);
        this.extractValue.setupIpc(ipcMain);
        this.updateValues.setupIpc(ipcMain);
        this.snippets.setupIpc(ipcMain);
    }

    /**
     * Sets up global shortcuts for all commands
     * @param {Electron.GlobalShortcut} globalShortcut - The Electron global shortcut instance
     * @returns {Promise<void>}
     */
    async setupShortcuts(globalShortcut) {
        globalShortcut.unregisterAll();
       
        if (await this.settings.get('openSalesforceIdActive')) {
            const shortcut = await this.settings.get('openSalesforceIdShortcut');
            if (shortcut) {
                globalShortcut.register(shortcut, () => this.salesforceId.createWindow());
            }
        }
    
        if (await this.settings.get('concatenateStringActive')) {
            const shortcut = await this.settings.get('concatenateStringShortcut');
            if (shortcut) {
                globalShortcut.register(shortcut, () => this.stringConcatenator.createWindow());
            }
        }
    
        if (await this.settings.get('searchInSalesforceActive')) {
            const shortcut = await this.settings.get('searchInSalesforceShortcut');
            if (shortcut) {
                globalShortcut.register(shortcut, () => this.salesforceSearch.createWindow());
            }
        }
    
        if (await this.settings.get('openMultipleIdsActive')) {
            const shortcut = await this.settings.get('openMultipleIdsShortcut');
            if (shortcut) {
                globalShortcut.register(shortcut, () => this.salesforceMultipleIds.createWindow());
            }
        }
    
        if (await this.settings.get('customSearchActive')) {
            const shortcut = await this.settings.get('customSearchShortcut');
            if (shortcut) {
                globalShortcut.register(shortcut, () => this.customSearch.createWindow());
            }
        }
    
        if (await this.settings.get('extractValueActive')) {
            const shortcut = await this.settings.get('extractValueShortcut');
            if (shortcut) {
                globalShortcut.register(shortcut, () => this.extractValue.createWindow());
            }
        }
        
        if (await this.settings.get('updateValuesActive')) {
            const shortcut = await this.settings.get('updateValuesShortcut');
            if (shortcut) {
                globalShortcut.register(shortcut, () => this.updateValues.createWindow());
            }
        }
        
        if (await this.settings.get('snippetsActive')) {
            const shortcut = await this.settings.get('snippetsShortcut');
            if (shortcut) {
                globalShortcut.register(shortcut, () => this.snippets.createWindow());
            }
        }
    }
}

module.exports = CommandManager;
