const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSettings: () => ipcRenderer.invoke('get-settings'),
    getSetting: (key) => ipcRenderer.invoke('get-setting', key),
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    setSetting: (key, value) => ipcRenderer.send('set-setting', key, value),
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    openSalesforceId: (id) => ipcRenderer.send('open-salesforce-id', id),
    closeIdInput: () => ipcRenderer.send('close-id-input'),
    copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
    closeStringConcatenator: () => ipcRenderer.send('close-string-concatenator'),
    searchInSalesforce: (query) => ipcRenderer.send('search-in-salesforce', query),
    closeSearchInput: () => ipcRenderer.send('close-search-input'),
    openMultipleSalesforceIds: (ids) => ipcRenderer.send('open-multiple-salesforce-ids', ids),
    closeMultipleIdsInput: () => ipcRenderer.send('close-multiple-ids-input'),
    executeCustomSearch: (params) => ipcRenderer.send('execute-custom-search', params),
    closeCustomSearch: () => ipcRenderer.send('close-custom-search'),
    on: (channel, callback) => ipcRenderer.on(channel, callback),
    extractPaths: (jsonString) => ipcRenderer.invoke('extract-paths', jsonString),
    extractValues: (params) => ipcRenderer.invoke('extract-values', params),
    closeExtractValue: () => ipcRenderer.send('close-extract-value'),
});