const fs   = require('fs');
const path = require('path');

function baseDir() {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'schema-cache');
}

function orgDir(orgId) {
    const safe = orgId.replace(/[^a-zA-Z0-9._@-]/g, '_').slice(0, 120);
    const dir  = path.join(baseDir(), safe);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function read(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function write(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data), 'utf8'); } catch { /* silent */ }
}

function del(file) {
    try { fs.unlinkSync(file); } catch { /* silent */ }
}

function getObjects(orgId) {
    const entry = read(path.join(orgDir(orgId), '_objects.json'));
    return entry?.data ?? null;
}

function setObjects(orgId, objects) {
    write(path.join(orgDir(orgId), '_objects.json'), { data: objects });
}

function clearObjects(orgId) {
    del(path.join(orgDir(orgId), '_objects.json'));
}

function getDescribe(orgId, objectName) {
    const safe  = objectName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const entry = read(path.join(orgDir(orgId), `${safe}.json`));
    return entry?.data ?? null;
}

function setDescribe(orgId, objectName, data) {
    const safe = objectName.replace(/[^a-zA-Z0-9._-]/g, '_');
    write(path.join(orgDir(orgId), `${safe}.json`), { data });
}

function clearDescribe(orgId, objectName) {
    const safe = objectName.replace(/[^a-zA-Z0-9._-]/g, '_');
    del(path.join(orgDir(orgId), `${safe}.json`));
}

module.exports = { getObjects, setObjects, clearObjects, getDescribe, setDescribe, clearDescribe };
