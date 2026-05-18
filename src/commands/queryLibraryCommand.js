const { randomUUID } = require('crypto');

const MAX_RECENT = 20;

class QueryLibraryCommand {
    constructor(settingsManager) {
        this.settings = settingsManager;
    }

    setupIpc(ipcMain) {
        ipcMain.handle('ql-get-favorites', async () => {
            return await this.settings.get('savedQueries') || [];
        });

        ipcMain.handle('ql-save-favorite', async (_event, { name, query }) => {
            const list = await this.settings.get('savedQueries') || [];
            const entry = { id: randomUUID(), name: name.trim(), query: query.trim(), createdAt: new Date().toISOString() };
            await this.settings.set('savedQueries', [...list, entry]);
            return { success: true, entry };
        });

        ipcMain.handle('ql-delete-favorite', async (_event, { id }) => {
            const list = await this.settings.get('savedQueries') || [];
            await this.settings.set('savedQueries', list.filter(q => q.id !== id));
            return { success: true };
        });

        ipcMain.handle('ql-get-recent', async () => {
            return await this.settings.get('recentQueries') || [];
        });

        ipcMain.handle('ql-add-recent', async (_event, { query, org }) => {
            const list = await this.settings.get('recentQueries') || [];
            const deduped = list.filter(r => r.query.trim() !== query.trim());
            const updated = [{ query: query.trim(), executedAt: new Date().toISOString(), org: org || '' }, ...deduped].slice(0, MAX_RECENT);
            await this.settings.set('recentQueries', updated);
        });
    }
}

module.exports = QueryLibraryCommand;
