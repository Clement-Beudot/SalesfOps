module.exports = {
    salesforceInstanceUrl: {
        type: 'string',
        default: ''
    },
    openSalesforceIdShortcut: {
        type: 'string',
        default: ''
    },
    concatenateStringShortcut: {
        type: 'string',
        default: ''
    },
    searchInSalesforceShortcut: {
        type: 'string',
        default: ''
    },
    openMultipleIdsShortcut: {
        type: 'string',
        default: ''
    },
    maxOpeningTabs: {
        type: 'integer',
        default: 10,
        minimum: 1
    },
    customSearches: {
        type: 'array',
        default: [],
        items: {
            type: 'object',
            properties: {
                label: { type: 'string' },
                url: { type: 'string' },
                activateSearch: { type: 'boolean' },
                allowSpaces: { type: 'boolean' }  
            },
            required: ['label', 'url', 'activateSearch', 'allowSpaces']
        }
    },
    customSearchShortcut: {
        type: 'string',
        default: ''
    },
    extractValueShortcut: {
        type: 'string',
        default: ''
    },
    updateValuesShortcut: {
        type: 'string',
        default: ''
    },
    openSalesforceIdActive: {
        type: 'boolean',
        default: true
    },
    concatenateStringActive: {
        type: 'boolean',
        default: true
    },
    searchInSalesforceActive: {
        type: 'boolean',
        default: true
    },
    openMultipleIdsActive: {
        type: 'boolean',
        default: false
    },
    customSearchActive: {
        type: 'boolean',
        default: true
    },
    extractValueActive: {
        type: 'boolean',
        default: true
    },
    updateValuesActive: {
        type: 'boolean',
        default: true
    }
};
