const { createDarkWindow } = require('../windows/window-utils');
const path = require('path');
const { clipboard } = require('electron');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

class UpdateValuesCommand {
    constructor(app, settingsManager) {
        this.app = app;
        this.settings = settingsManager;
        this.window = null;
        this.csvData = null;
        this.headers = null;
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

        this.window.loadFile(path.join(this.app.getAppPath(), 'src/windows/update-values.html'));
        this.window.center();

        this.window.on('closed', () => {
            this.window = null;
        });

        this.window.on('blur', () => {
            this.window.close();
        });
    }

    setupIpc(ipcMain) {
        // Parse input and detect format (JSON or CSV)
        ipcMain.handle('parse-input', (event, input) => {
            try {
                try {
                    const jsonData = JSON.parse(input);
                    this.csvData = null;
                    this.headers = null;
                    const fields = this.extractAvailableFieldsFromJson(jsonData);
                    
                    if (this.window) {
                        this.window.setSize(500, 500);
                        this.window.center();
                    }
                    
                    return { 
                        success: true, 
                        format: 'json',
                        fields,
                        data: jsonData
                    };
                } catch (jsonError) {
                    const csvData = parse(input, {
                        columns: true,
                        skip_empty_lines: true,
                        trim: true
                    });
                    
                    if (csvData.length > 0) {
                        this.csvData = csvData;
                        this.headers = Object.keys(csvData[0]);
                        const fields = this.extractAvailableFieldsFromCsv(csvData);
                        
                        if (this.window) {
                            this.window.setSize(500, 500);
                            this.window.center();
                        }
                        
                        return {
                            success: true,
                            format: 'csv',
                            fields,
                            data: csvData
                        };
                    } else {
                        throw new Error('CSV has no data rows');
                    }
                }
            } catch (error) {
                console.error('Error parsing input:', error);
                return { 
                    success: false, 
                    error: `Invalid format: ${error.message}. Please provide valid JSON or CSV data.` 
                };
            }
        });

        ipcMain.handle('update-json-values', (event, { jsonData, fields }) => {
            try {
                const data = JSON.parse(jsonData);
                const updatedData = this.updateMultipleFieldsInJson(data, fields);
                
                clipboard.writeText(JSON.stringify(updatedData, null, 2));
                
                return { 
                    success: true, 
                    message: `Updated ${fields.length} field(s) and copied to clipboard`,
                    updatedData
                };
            } catch (error) {
                console.error('Error updating JSON values:', error);
                return { success: false, error: `Failed to update values: ${error.message}` };
            }
        });

        ipcMain.handle('update-csv-values', (event, { csvData, fields }) => {
            try {
                const data = Array.isArray(csvData) ? csvData : JSON.parse(csvData);
                const updatedData = this.updateMultipleFieldsInCsv(data, fields);
                
                const firstRow = updatedData[0] || {};
                let columns = [];
                
                if ('Id' in firstRow) columns.push('Id');
                if ('_' in firstRow) columns.push('_');
                
                Object.keys(firstRow).forEach(key => {
                    if (key !== 'Id' && key !== '_') {
                        columns.push(key);
                    }
                });
                
                const csvString = stringify(updatedData, { 
                    header: true,
                    columns: columns
                });
                
                clipboard.writeText(csvString);
                
                return { 
                    success: true, 
                    message: `Updated ${fields.length} field(s) and copied to clipboard`,
                    updatedData
                };
            } catch (error) {
                console.error('Error updating CSV values:', error);
                return { success: false, error: `Failed to update values: ${error.message}` };
            }
        });
        
        ipcMain.on('restore-window-size', () => {
            if (this.window) {
                this.window.setSize(450, 260);
                this.window.center();
            }
        });

        ipcMain.on('close-update-values', () => {
            if (this.window) {
                this.window.close();
            }
        });
    }

    extractAvailableFieldsFromJson(data) {
        if (!Array.isArray(data) || data.length === 0) {
            return [];
        }

        const firstItem = data[0];
        if (typeof firstItem !== 'object' || firstItem === null) {
            return [];
        }

        return Object.entries(firstItem)
            .filter(([key, value]) => {
                return key !== 'attributes' && key !== 'Id' && 
                      (typeof value !== 'object' || value === null || Array.isArray(value));
            })
            .map(([key]) => key);
    }

    extractAvailableFieldsFromCsv(data) {
        if (!Array.isArray(data) || data.length === 0) {
            return [];
        }

        return Object.keys(data[0]).filter(key => key !== 'Id');
    }

    updateMultipleFieldsInJson(data, fieldsToUpdate) {
        if (!Array.isArray(data)) {
            data = [data];
        }

        return data.map(item => {
            if (typeof item !== 'object' || item === null) {
                return null;
            }
            
            if (!item.Id) {
                console.error('Object without Id found:', item);
                return null;
            }
            
            const updatedItem = {
                attributes: item.attributes,
                Id: item.Id
            };
            
            fieldsToUpdate.forEach(({ field, value }) => {
                if (value === "") {
                    updatedItem[field] = null;
                    return;
                }
                
                if (field in item) {
                    const originalValue = item[field];
                    let convertedValue = value;
                    
                    if (typeof originalValue === 'number') {
                        convertedValue = Number(value);
                        if (isNaN(convertedValue)) {
                            convertedValue = value;
                        }
                    } else if (typeof originalValue === 'boolean') {
                        convertedValue = value.toLowerCase() === 'true';
                    }
                    
                    updatedItem[field] = convertedValue;
                } else {
                    updatedItem[field] = value;
                }
            });
            
            return updatedItem;
        }).filter(item => item !== null);
    }

    updateMultipleFieldsInCsv(data, fieldsToUpdate) {
        if (!Array.isArray(data)) {
            return [];
        }
    
        const fieldsToKeep = new Set(fieldsToUpdate.map(f => f.field));
        
        const firstRow = data[0] || {};
        if ('Id' in firstRow) fieldsToKeep.add('Id');
        if ('_' in firstRow) fieldsToKeep.add('_');
        
        const columnsToKeep = Array.from(fieldsToKeep);
        
        return data.map(row => {
            const updatedRow = {};
            
            if ('Id' in row) updatedRow.Id = row.Id;
            if ('_' in row) updatedRow._ = row._;
            
            fieldsToUpdate.forEach(({ field, value }) => {
                updatedRow[field] = value;
            });
            
            return updatedRow;
        });
    }
}

module.exports = UpdateValuesCommand;