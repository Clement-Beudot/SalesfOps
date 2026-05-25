const { spawn } = require('child_process');
const https = require('https');
const http  = require('http');
const schemaCache = require('./salesforce-schema-cache');
const { resolveEnv } = require('./shell-exec');

// Cache: orgIdentifier → { instanceUrl, accessToken, fetchedAt }
const _sessionCache = new Map();
// Cache: `${orgIdentifier}::${objectName}` → describe result
const _describeCache = new Map();
// Cache: orgIdentifier → list of SObjects
const _objectListCache = new Map();

const SESSION_TTL_MS = 90 * 60 * 1000; // 90 min

function getSession(orgIdentifier) {
    const cached = _sessionCache.get(orgIdentifier);
    if (cached && (Date.now() - cached.fetchedAt) < SESSION_TTL_MS) {
        return Promise.resolve(cached);
    }
    return fetchSession(orgIdentifier);
}

function fetchSession(orgIdentifier) {
    return new Promise(async (resolve, reject) => {
        const args = ['org', 'display', '--verbose', '--json'];
        if (orgIdentifier) args.push('-o', orgIdentifier);

        const env = await resolveEnv();
        let stdout = '';
        let stderr = '';
        const child = spawn('sf', args, { env });
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('close', () => {
            try {
                const data = JSON.parse(stdout);
                const result = data.result;
                if (!result?.accessToken || !result?.instanceUrl) {
                    return reject(new Error('Could not retrieve session from SF CLI. Try: sf org login web -o <alias>'));
                }
                const session = {
                    instanceUrl: result.instanceUrl.replace(/\/$/, ''),
                    accessToken: result.accessToken,
                    fetchedAt: Date.now()
                };
                _sessionCache.set(orgIdentifier, session);
                resolve(session);
            } catch {
                reject(new Error(stderr.trim() || 'Failed to parse sf org display output.'));
            }
        });
        child.on('error', err => {
            if (err.code === 'ENOENT') reject(new Error('Salesforce CLI (sf) not found.'));
            else reject(err);
        });
    });
}

function restGet(session, path) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${session.instanceUrl}${path}`);
        const lib = url.protocol === 'https:' ? https : http;
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        const req = lib.request(options, res => {
            let body = '';
            res.on('data', d => { body += d.toString(); });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (res.statusCode >= 400) {
                        const msg = Array.isArray(parsed)
                            ? parsed[0]?.message
                            : parsed.message || parsed.error_description;
                        reject(new Error(msg || `HTTP ${res.statusCode}`));
                    } else {
                        resolve(parsed);
                    }
                } catch {
                    reject(new Error(`Non-JSON response (HTTP ${res.statusCode})`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

const API_VERSION = 'v62.0';

function restRequest(session, method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${session.instanceUrl}${path}`);
        const lib = url.protocol === 'https:' ? https : http;
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };
        const req = lib.request(options, res => {
            let responseBody = '';
            res.on('data', d => { responseBody += d.toString(); });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseBody);
                    if (res.statusCode >= 400) {
                        const msg = Array.isArray(parsed)
                            ? parsed[0]?.message
                            : parsed.message || parsed.error_description;
                        reject(new Error(msg || `HTTP ${res.statusCode}`));
                    } else {
                        resolve(parsed);
                    }
                } catch {
                    reject(new Error(`Non-JSON response (HTTP ${res.statusCode})`));
                }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

const DML_BATCH_SIZE = 200;

/**
 * Run DML (insert/update/upsert) against Salesforce using the REST Collections API.
 * Batches records in groups of 200.
 *
 * @param {object} params
 * @param {string}   params.orgIdentifier
 * @param {string}   params.objectName       e.g. 'Account'
 * @param {string}   params.operation        'insert' | 'update' | 'upsert'
 * @param {string}   [params.externalIdField] required for upsert
 * @param {Array<object>} params.records      plain objects { Field: value, ... }
 * @param {function} [params.onBatchDone]     called after each batch with { batchIndex, total, results }
 * @returns {Promise<{ results: Array, totalSent, totalSuccess, totalFailed }>}
 */
// Run a single pre-sliced batch — used by the renderer-side batch loop
async function runDmlBatch({ orgIdentifier, objectName, operation, externalIdField, allOrNone = false, batchOffset = 0, records }) {
    const session = await getSession(orgIdentifier);
    const sfRecords = records.map(r => ({ attributes: { type: objectName }, ...r }));

    let path, method;
    if (operation === 'upsert') {
        path = `/services/data/${API_VERSION}/composite/sobjects/${objectName}/${externalIdField}`;
        method = 'PATCH';
    } else if (operation === 'update') {
        path = `/services/data/${API_VERSION}/composite/sobjects`;
        method = 'PATCH';
    } else {
        path = `/services/data/${API_VERSION}/composite/sobjects`;
        method = 'POST';
    }

    const batchResults = await restRequest(session, method, path, { allOrNone, records: sfRecords });
    return {
        success: true,
        results: batchResults.map((r, i) => ({
            index: batchOffset + i,
            id: r.id || null,
            success: r.success,
            errors: r.errors || []
        }))
    };
}

async function runDml({ orgIdentifier, objectName, operation, externalIdField, records, allOrNone = false, batchSize, onBatchDone }) {
    const session = await getSession(orgIdentifier);
    const effectiveBatchSize = Math.min(DML_BATCH_SIZE, Math.max(1, parseInt(batchSize, 10) || DML_BATCH_SIZE));

    const allResults = [];
    const batches = [];
    for (let i = 0; i < records.length; i += effectiveBatchSize) {
        batches.push(records.slice(i, i + effectiveBatchSize));
    }

    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        const sfRecords = batch.map(r => ({
            attributes: { type: objectName },
            ...r
        }));

        let path, method;
        if (operation === 'upsert') {
            path = `/services/data/${API_VERSION}/composite/sobjects/${objectName}/${externalIdField}`;
            method = 'PATCH';
        } else if (operation === 'update') {
            path = `/services/data/${API_VERSION}/composite/sobjects`;
            method = 'PATCH';
        } else {
            path = `/services/data/${API_VERSION}/composite/sobjects`;
            method = 'POST';
        }

        const batchResults = await restRequest(session, method, path, {
            allOrNone,
            records: sfRecords
        });

        const indexedResults = batchResults.map((r, i) => ({
            index: bi * DML_BATCH_SIZE + i,
            id: r.id || null,
            success: r.success,
            errors: r.errors || []
        }));
        allResults.push(...indexedResults);
        if (onBatchDone) onBatchDone({ batchIndex: bi, total: batches.length, results: indexedResults });
    }

    const totalSuccess = allResults.filter(r => r.success).length;
    return {
        results: allResults,
        totalSent: allResults.length,
        totalSuccess,
        totalFailed: allResults.length - totalSuccess
    };
}

async function describeObject(objectName, orgIdentifier) {
    const cacheKey = `${orgIdentifier}::${objectName}`;
    if (_describeCache.has(cacheKey)) return _describeCache.get(cacheKey);

    // Persistent disk cache
    const persisted = schemaCache.getDescribe(orgIdentifier, objectName);
    if (persisted) {
        _describeCache.set(cacheKey, persisted);
        return persisted;
    }

    const session = await getSession(orgIdentifier);
    const data = await restGet(session, `/services/data/${API_VERSION}/sobjects/${objectName}/describe/`);

    const result = {
        name: data.name,
        label: data.label,
        fields: (data.fields || []).map(f => ({
            name: f.name,
            label: f.label,
            type: f.type,
            referenceTo: f.referenceTo || [],
            relationshipName: f.relationshipName || null,
            picklistValues: (f.picklistValues || []).filter(v => v.active !== false).map(v => v.value)
        })),
        childRelationships: (data.childRelationships || [])
            .filter(r => r.relationshipName)
            .map(r => ({ relationshipName: r.relationshipName, childSObject: r.childSObject }))
    };
    _describeCache.set(cacheKey, result);
    schemaCache.setDescribe(orgIdentifier, objectName, result);
    return result;
}

async function listObjects(orgIdentifier) {
    if (_objectListCache.has(orgIdentifier)) return _objectListCache.get(orgIdentifier);

    // Persistent disk cache
    const persisted = schemaCache.getObjects(orgIdentifier);
    if (persisted) {
        _objectListCache.set(orgIdentifier, persisted);
        return persisted;
    }

    const session = await getSession(orgIdentifier);
    const data = await restGet(session, `/services/data/${API_VERSION}/sobjects/`);

    const result = (data.sobjects || [])
        .filter(o => o.queryable)
        .map(o => ({ name: o.name, label: o.label }))
        .sort((a, b) => a.name.localeCompare(b.name));

    _objectListCache.set(orgIdentifier, result);
    schemaCache.setObjects(orgIdentifier, result);
    return result;
}

function invalidateSession(orgIdentifier) {
    _sessionCache.delete(orgIdentifier);
}

function invalidateDescribeCache(orgIdentifier) {
    for (const key of _describeCache.keys()) {
        if (key.startsWith(`${orgIdentifier}::`)) _describeCache.delete(key);
    }
    _objectListCache.delete(orgIdentifier);
}

function invalidateObjectList(orgIdentifier) {
    _objectListCache.delete(orgIdentifier);
    schemaCache.clearObjects(orgIdentifier);
}

function invalidateObjectDescribe(orgIdentifier, objectName) {
    _describeCache.delete(`${orgIdentifier}::${objectName}`);
    schemaCache.clearDescribe(orgIdentifier, objectName);
}

module.exports = {
    getSession,
    describeObject, listObjects, runDml, runDmlBatch,
    invalidateSession, invalidateDescribeCache,
    invalidateObjectList, invalidateObjectDescribe
};
