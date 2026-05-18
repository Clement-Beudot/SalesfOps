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
            return await runSoqlQuery(query, orgIdentifier);
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
