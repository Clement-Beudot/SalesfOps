const { app, Tray, Menu, ipcMain, globalShortcut, shell } = require('electron');
const path = require('path');
const SettingsManager = require('./src/services/settings');
const CommandManager = require('./src/commands');
const { createDarkWindow } = require('./src/windows/window-utils');

class Application {
    constructor() {
        this.tray = null;
        this.settingsWindow = null;
        this.settings = new SettingsManager();
        this.commands = new CommandManager(app, this.settings);

        if (process.platform === 'darwin') {
            app.dock.hide();
        }
    }

    async init() {
        await app.whenReady();
        await this.createTray();
        this.commands.setupIpc(ipcMain);
        await this.commands.setupShortcuts(globalShortcut);
        this.setupAppEvents();

        const updateInfo = await this.checkForUpdates();
        if (updateInfo.hasUpdate) {
            const { dialog } = require('electron');
            const response = await dialog.showMessageBox({
                type: 'info',
                buttons: ['Download', 'Later'],
                title: 'Update available',
                message: `A new version (${updateInfo.version}) is available !`,
                detail: 'Do you want to download the new version ?'
            });
    
            if (response.response === 0) {
                shell.openExternal(updateInfo.releaseUrl);
            }
        }
        
        ipcMain.on('save-settings', async () => {
            await this.updateTrayMenu();
        });
    }

    async createTray() {
        const trayIconPath = path.join(app.getAppPath(), 'assets/icon-trayTemplate.png');
        this.tray = new Tray(trayIconPath);
        await this.updateTrayMenu();
    }

    async getShortcutLabel(shortcutKey) {
        try {
            const shortcut = await this.settings.get(shortcutKey);
            return shortcut || 'Not Set';
        } catch (error) {
            console.error(`Error getting shortcut for ${shortcutKey}:`, error);
            return 'Not Set';
        }
    }

    async updateTrayMenu() {
        const version = app.getVersion();
        const menuItems = [];
        const updateInfo = await this.checkForUpdates();
    
        menuItems.push(
            { label: 'Actions', enabled: false },
            { type: 'separator' }
        );
    
        const openSalesforceIdActive = await this.settings.get('openSalesforceIdActive');
        const concatenateStringActive = await this.settings.get('concatenateStringActive');
        const searchInSalesforceActive = await this.settings.get('searchInSalesforceActive');
        const openMultipleIdsActive = await this.settings.get('openMultipleIdsActive');
        const customSearchActive = await this.settings.get('customSearchActive');
        const extractValueActive = await this.settings.get('extractValueActive');
        const updateValuesActive = await this.settings.get('updateValuesActive');
        const snippetsActive = await this.settings.get('snippetsActive');
    
        if (openSalesforceIdActive) {
            menuItems.push({ 
                label: 'Open Salesforce ID',
                click: () => this.commands.salesforceId.createWindow(),
                accelerator: await this.getShortcutLabel('openSalesforceIdShortcut')
            });
        }
    
        if (concatenateStringActive) {
            menuItems.push({
                label: 'Concatenate Strings',
                click: () => this.commands.stringConcatenator.createWindow(),
                accelerator: await this.getShortcutLabel('concatenateStringShortcut')
            });
        }
    
        if (searchInSalesforceActive) {
            menuItems.push({
                label: 'Search in Salesforce',
                click: () => this.commands.salesforceSearch.createWindow(),
                accelerator: await this.getShortcutLabel('searchInSalesforceShortcut')
            });
        }
    
        if (openMultipleIdsActive) {
            menuItems.push({
                label: 'Open Multiple IDs',
                click: () => this.commands.salesforceMultipleIds.createWindow(),
                accelerator: await this.getShortcutLabel('openMultipleIdsShortcut')
            });
        }
    
        if (extractValueActive) {
            menuItems.push({
                label: 'Extract Json values',
                click: () => this.commands.extractValue.createWindow(),
                accelerator: await this.getShortcutLabel('extractValueShortcut')
            });
        }
        
        if (updateValuesActive) {
            menuItems.push({
                label: 'Update Json values',
                click: () => this.commands.updateValues.createWindow(),
                accelerator: await this.getShortcutLabel('updateValuesShortcut')
            });
        }

        if (customSearchActive) {
            menuItems.push({
                label: 'Select custom search',
                click: () => this.commands.customSearch.createWindow(),
                accelerator: await this.getShortcutLabel('customSearchShortcut')
            });
        }

        if (snippetsActive) {
            menuItems.push({
                label: 'Insert Text Snippet',
                click: () => this.commands.snippets.createWindow(),
                accelerator: await this.getShortcutLabel('snippetsShortcut')
            });
        }
    
        menuItems.push(
            { type: 'separator' },
            { label: `SalesfOps - Version ${version}`, enabled: false }
        );
    
        if (updateInfo.hasUpdate) {
            menuItems.push(
                { label: `New version available: ${updateInfo.version}`, enabled: false },
                { 
                    label: 'Download update',
                    click: () => shell.openExternal(updateInfo.releaseUrl)
                }
            );
        } else {
            menuItems.push({ label: 'Application is up to date', enabled: false });
        }
    
        menuItems.push(
            { label: 'Settings', click: () => this.openSettingsWindow() },
            { type: 'separator' },
            { 
                label: 'Quit', 
                click: () => {
                    globalShortcut.unregisterAll();
                    app.quit();
                } 
            }
        );
    
        const trayMenu = Menu.buildFromTemplate(menuItems);
        this.tray.setContextMenu(trayMenu);
        this.tray.setToolTip('SalesfOps');
    }

    openSettingsWindow() {
        if (this.settingsWindow) {
            this.settingsWindow.focus();
            return;
        }

        if (process.platform === 'darwin') {
            app.dock.show();
        }

        this.settingsWindow = createDarkWindow({
            width: 800,
            height: 700,
            frame: true,
            closable: true,
            resizable: true,
            minWidth: 600,
            minHeight: 400,
            titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
            trafficLightPosition: { x: 20, y: 20 },
            backgroundColor: '#1a1a1a'
        });

        this.settingsWindow.loadFile(path.join(app.getAppPath(), 'settings.html'));

        this.settingsWindow.on('closed', () => {
            this.settingsWindow = null;
            if (process.platform === 'darwin') {
                app.dock.hide();
            }
        });
    }

    setupAppEvents() {
        app.on('window-all-closed', (event) => {});

        app.on('activate', () => {
            if (!this.settingsWindow) {
                this.openSettingsWindow();
            }
        });

        app.on('will-quit', () => {
            globalShortcut.unregisterAll();
        });

        ipcMain.handle('get-settings', async () => {
            return await this.settings.getAll();
        });

        ipcMain.handle('get-setting', async (event, key) => {
            return await this.settings.get(key);
        });

        ipcMain.on('save-settings', async (event, settings) => {
            await this.settings.setMultiple(settings);
            await this.commands.setupShortcuts(globalShortcut);
            await this.updateTrayMenu();
        });

        ipcMain.on('set-setting', async (event, key, value) => {
            await this.settings.set(key, value);
            await this.commands.setupShortcuts(globalShortcut);
            await this.updateTrayMenu();
        });
    }

    async checkForUpdates() {
        try {
            const response = await fetch('https://api.github.com/repos/Clement-Beudot/SalesfOps/releases/latest');
            const data = await response.json();
            
            const latestVersion = data.tag_name;
            const currentVersion = app.getVersion();
            
            if (latestVersion !== `v${currentVersion}`) {
                return {
                    hasUpdate: true,
                    version: latestVersion,
                    releaseUrl: data.html_url
                };
            }
            
            return { hasUpdate: false };
        } catch (error) {
            console.error('Error when trying to get update informations:', error);
            return { hasUpdate: false };
        }
    }
}

if (process.platform === 'darwin') {
    app.applicationSupportsSecureRestorableState = true;
}

const application = new Application();
application.init().catch(console.error);
