const { app, Tray, Menu, ipcMain, globalShortcut, shell, BrowserWindow } = require('electron');
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

        // ── Salesforce ────────────────────────────────────────────────────────
        const sfItems = [];
        if (await this.settings.get('openSalesforceIdActive'))
            sfItems.push({ label: 'Open Salesforce ID', click: () => this.commands.salesforceId.createWindow(), accelerator: await this.getShortcutLabel('openSalesforceIdShortcut') });
        if (await this.settings.get('openMultipleIdsActive'))
            sfItems.push({ label: 'Open Multiple IDs', click: () => this.commands.salesforceMultipleIds.createWindow(), accelerator: await this.getShortcutLabel('openMultipleIdsShortcut') });
        if (await this.settings.get('searchInSalesforceActive'))
            sfItems.push({ label: 'Search in Salesforce', click: () => this.commands.salesforceSearch.createWindow(), accelerator: await this.getShortcutLabel('searchInSalesforceShortcut') });
        if (await this.settings.get('sfdxOrgsActive'))
            sfItems.push({ label: 'Open Salesforce Org', click: () => this.commands.sfdxOrgs.createWindow(), accelerator: await this.getShortcutLabel('sfdxOrgsShortcut') });
        if (await this.settings.get('soqlRunnerActive'))
            sfItems.push({ label: 'SOQL Runner', click: () => this.commands.soqlRunner.createWindow(), accelerator: await this.getShortcutLabel('soqlRunnerShortcut') });

        if (sfItems.length > 0)
            menuItems.push({ label: 'Salesforce', enabled: false }, ...sfItems);

        // ── Workbench ─────────────────────────────────────────────────────────
        if (await this.settings.get('dataWorkbenchActive')) {
            if (menuItems.length > 0) menuItems.push({ type: 'separator' });
            menuItems.push(
                { label: 'Workbench', enabled: false },
                { label: 'Data Workbench', click: () => this.commands.dataWorkbench.createWindow() }
            );
        }

        // ── Data ──────────────────────────────────────────────────────────────
        const dataItems = [];
        if (await this.settings.get('concatenateStringActive'))
            dataItems.push({ label: 'Concatenate Strings', click: () => this.commands.stringConcatenator.createWindow(), accelerator: await this.getShortcutLabel('concatenateStringShortcut') });
        if (await this.settings.get('extractValueActive'))
            dataItems.push({ label: 'Extract JSON Values', click: () => this.commands.extractValue.createWindow(), accelerator: await this.getShortcutLabel('extractValueShortcut') });
        if (await this.settings.get('updateValuesActive'))
            dataItems.push({ label: 'Update JSON Values', click: () => this.commands.updateValues.createWindow(), accelerator: await this.getShortcutLabel('updateValuesShortcut') });
        if (await this.settings.get('removeDuplicatesActive'))
            dataItems.push({ label: 'Remove Duplicates', click: () => this.commands.removeDuplicates.createWindow(), accelerator: await this.getShortcutLabel('removeDuplicatesShortcut') });

        if (dataItems.length > 0) {
            if (menuItems.length > 0) menuItems.push({ type: 'separator' });
            menuItems.push({ label: 'Data', enabled: false }, ...dataItems);
        }

        // ── Other Tools ───────────────────────────────────────────────────────
        const otherItems = [];
        if (await this.settings.get('customSearchActive'))
            otherItems.push({ label: 'Custom Search', click: () => this.commands.customSearch.createWindow(), accelerator: await this.getShortcutLabel('customSearchShortcut') });
        if (await this.settings.get('snippetsActive'))
            otherItems.push({ label: 'Insert Text Snippet', click: () => this.commands.snippets.createWindow(), accelerator: await this.getShortcutLabel('snippetsShortcut') });

        if (otherItems.length > 0) {
            if (menuItems.length > 0) menuItems.push({ type: 'separator' });
            menuItems.push({ label: 'Other Tools', enabled: false }, ...otherItems);
        }


        menuItems.push(
            { type: 'separator' },
            { label: `SalesfOps - Version ${version}`, enabled: false }
        );

        if (updateInfo.hasUpdate) {
            menuItems.push(
                { label: `⬆ Update available: ${updateInfo.version}`, enabled: false },
                {
                    label: 'Download update',
                    click: () => shell.openExternal(updateInfo.releaseUrl)
                }
            );
        }
    
        menuItems.push(
            { type: 'separator' },
            { label: '⚙︎  Settings', click: () => this.openSettingsWindow() },
            { label: '☰  Documentation', click: () => this.commands.docs.createWindow() },
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

        ipcMain.on('resize-window', (event, height) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win) win.setSize(win.getSize()[0], Math.round(height), true);
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
