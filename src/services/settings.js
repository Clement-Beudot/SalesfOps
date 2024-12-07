const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const schema = require('../store-schema');

class SettingsManager {
    constructor() {
        this.filePath = path.join(app.getPath('userData'), 'settings.json');
        this.store = this.loadStore();
    }

    loadStore() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                return JSON.parse(data);
            }
            const defaults = {};
            for (const [key, value] of Object.entries(schema)) {
                defaults[key] = value.default;
            }
            this.saveStore(defaults);
            return defaults;
        } catch (error) {
            console.error('Error loading settings:', error);
            return {};
        }
    }

    saveStore(data) {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    async getAll() {
        return this.store;
    }

    async get(key) {
        return this.store[key] !== undefined ? this.store[key] : schema[key]?.default;
    }

    async set(key, value) {
        const schemaItem = schema[key];
        
        if (schemaItem && schemaItem.type === 'integer') {
            value = parseInt(value, 10);
            if (isNaN(value)) {
                value = schemaItem.default;
            }
            if (schemaItem.minimum && value < schemaItem.minimum) {
                value = schemaItem.minimum;
            }
        }

        this.store[key] = value;
        this.saveStore(this.store);
    }

    async setMultiple(settings) {
        for (const [key, value] of Object.entries(settings)) {
            await this.set(key, value);
        }
    }
}

module.exports = SettingsManager;
