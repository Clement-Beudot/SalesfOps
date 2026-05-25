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
    snippets: {
        type: 'array',
        default: [],
        items: {
            type: 'object',
            properties: {
                keyword: { type: 'string' },
                replacement: { type: 'string' }
            },
            required: ['keyword', 'replacement']
        }
    },
    snippetsShortcut: {
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
    },
    snippetsActive: {
        type: 'boolean',
        default: true
    },
    sfdxVerified: {
        type: 'boolean',
        default: false
    },
    sfdxOrgsActive: {
        type: 'boolean',
        default: false
    },
    sfdxOrgsShortcut: {
        type: 'string',
        default: ''
    },
    removeDuplicatesActive: {
        type: 'boolean',
        default: true
    },
    removeDuplicatesShortcut: {
        type: 'string',
        default: ''
    },
    savedQueries: {
        type: 'array',
        default: [],
        items: {
            type: 'object',
            properties: {
                id:        { type: 'string' },
                name:      { type: 'string' },
                query:     { type: 'string' },
                createdAt: { type: 'string' }
            },
            required: ['id', 'name', 'query']
        }
    },
    recentQueries: {
        type: 'array',
        default: [],
        items: {
            type: 'object',
            properties: {
                query:      { type: 'string' },
                executedAt: { type: 'string' },
                org:        { type: 'string' }
            },
            required: ['query']
        }
    },
    dataWorkbenchActive: {
        type: 'boolean',
        default: false
    },
    workbenchSoqlActive: {
        type: 'boolean',
        default: false
    },
    workbenchDmlActive: {
        type: 'boolean',
        default: false
    },
    soqlRunnerActive: {
        type: 'boolean',
        default: false
    },
    soqlRunnerShortcut: {
        type: 'string',
        default: ''
    },
    accentColor: {
        type: 'string',
        default: '#6366f1'
    }
};
