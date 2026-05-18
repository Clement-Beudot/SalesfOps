const { spawn } = require('child_process');
const { resolveEnv } = require('./shell-exec');

function flattenValue(val, col, result) {
    if (val === null || val === undefined) {
        result[col] = '';
    } else if (Array.isArray(val)) {
        val.forEach((item, i) => flattenValue(item, `${col}_${i}`, result));
    } else if (typeof val === 'object') {
        for (const [k, v] of Object.entries(val)) {
            if (k === 'attributes') continue;
            flattenValue(v, `${col}_${k}`, result);
        }
    } else {
        result[col] = String(val);
    }
}

function flattenRecord(record) {
    const result = {};
    for (const [key, val] of Object.entries(record)) {
        if (key === 'attributes') continue;
        flattenValue(val, key, result);
    }
    return result;
}

function runSoqlQuery(query, orgIdentifier) {
    return new Promise(async (resolve) => {
        const args = ['data', 'query', '--query', query, '--json'];
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
                if (data.status !== 0) {
                    resolve({ error: data.message || data.name || 'Query failed.' });
                    return;
                }
                const records = data.result?.records || [];
                if (records.length === 0) {
                    resolve({ columns: null, rows: [], totalSize: 0 });
                    return;
                }
                const allCols = [...new Set(records.flatMap(r => Object.keys(flattenRecord(r))))];
                const columns = allCols.filter(c => !allCols.some(o => o !== c && o.startsWith(c + '_')));
                const rows = records.map(r => {
                    const flat = flattenRecord(r);
                    return columns.map(c => flat[c] ?? '');
                });
                resolve({ columns, rows, totalSize: data.result?.totalSize || records.length });
            } catch {
                resolve({ error: stderr.trim() || 'Failed to parse query result. Is Salesforce CLI installed?' });
            }
        });

        child.on('error', err => {
            if (err.code === 'ENOENT') resolve({ error: 'Salesforce CLI (sf) not found. Please install it first.' });
            else resolve({ error: err.message });
        });
    });
}

module.exports = { runSoqlQuery, flattenRecord };
