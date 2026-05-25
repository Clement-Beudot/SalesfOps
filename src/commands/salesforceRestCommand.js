const sfRest  = require('../utils/salesforce-rest');
const { runSoqlQuery } = require('../utils/salesforce-query');

class SalesforceRestCommand {
    setupIpc(ipcMain) {
        ipcMain.handle('sf-rest-describe', async (_event, { objectName, orgIdentifier }) => {
            try {
                return { success: true, data: await sfRest.describeObject(objectName, orgIdentifier) };
            } catch (err) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('sf-rest-list-objects', async (_event, { orgIdentifier }) => {
            try {
                return { success: true, data: await sfRest.listObjects(orgIdentifier) };
            } catch (err) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('sf-run-soql', async (_event, { query, orgIdentifier }) => {
            const result = await runSoqlQuery(query, orgIdentifier);
            if (!result.error) {
                try { result.instanceUrl = (await sfRest.getSession(orgIdentifier)).instanceUrl; } catch {}
            }
            return result;
        });

        ipcMain.handle('sf-get-instance-url', async (_event, orgIdentifier) => {
            try {
                const session = await sfRest.getSession(orgIdentifier);
                return { instanceUrl: session.instanceUrl };
            } catch (err) {
                return { error: err.message };
            }
        });

        ipcMain.handle('sf-clear-object-list', async (_event, { orgIdentifier }) => {
            sfRest.invalidateObjectList(orgIdentifier);
            return { success: true };
        });

        ipcMain.handle('sf-clear-object-describe', async (_event, { orgIdentifier, objectName }) => {
            sfRest.invalidateObjectDescribe(orgIdentifier, objectName);
            return { success: true };
        });
    }
}

module.exports = SalesforceRestCommand;
