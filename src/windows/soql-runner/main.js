const soqlInput      = document.getElementById('soql-input');
const orgSelect      = document.getElementById('org-select');
const orgStatus      = document.getElementById('org-status');
const orgHint        = document.getElementById('org-hint');
const btnRefreshOrgs = document.getElementById('btn-refresh-orgs');
const btnRun         = document.getElementById('btn-run');
const btnClose       = document.getElementById('btn-close');
const btnEdit        = document.getElementById('btn-edit');
const btnRerun       = document.getElementById('btn-rerun');
const btnSave        = document.getElementById('btn-save');
const btnLibrary     = document.getElementById('btn-library');
const savePopover    = document.getElementById('save-popover');
const saveName       = document.getElementById('save-name');
const btnSaveConfirm = document.getElementById('btn-save-confirm');
const btnSaveCancel  = document.getElementById('btn-save-cancel');
const libraryPanel   = document.getElementById('library-panel');
const runError       = document.getElementById('run-error');
const queryPanel     = document.getElementById('query-panel');
const resultPanel    = document.getElementById('result-panel');
const resultCount    = document.getElementById('result-count');
const tableWrap      = document.getElementById('table-wrap');
const resultSearch   = document.getElementById('result-search');
const btnSearchClear = document.getElementById('btn-search-clear');
const btnExportCsv   = document.getElementById('btn-export-csv');
const btnExportSheet = document.getElementById('btn-export-sheet');
const btnExportDl    = document.getElementById('btn-export-download');

const SF_ID_RE   = /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/;
const DEFAULT_LIMIT = 100;

let sfInstanceUrl = '';
window.electronAPI.getSetting('salesforceInstanceUrl').then(url => {
    sfInstanceUrl = (url || '').replace(/\/$/, '');
});

// ── Result state ──────────────────────────────────
let _columns   = [];
let _rows      = [];
let _totalSize = 0;
let _limit     = DEFAULT_LIMIT;
let _search    = '';


function flashBtn(btn, label) {
    btn.textContent = '✓';
    btn.classList.add('success');
    setTimeout(() => { btn.textContent = label; btn.classList.remove('success'); }, 1500);
}

// ── Org list ──────────────────────────────────────

function setOrgStatus(orgs) {
    const org = orgs?.find(o => (o.alias || o.username) === orgSelect.value);
    if (!org) { orgStatus.textContent = ''; orgStatus.className = 'runner-org-status'; return; }
    const s = org.connectedStatus?.toLowerCase();
    const connected = s === 'connected' || s === 'active';
    orgStatus.textContent = connected ? 'Connected' : (org.connectedStatus || 'Unknown');
    orgStatus.className   = `runner-org-status ${connected ? 'connected' : org.connectedStatus ? 'disconnected' : 'unknown'}`;
}

function setOrgReady() {
    orgHint.className = 'runner-org-hint hidden';
    soqlInput.disabled = false;
    const org = _cachedOrgs?.find(o => (o.alias || o.username) === orgSelect.value);
    const sc = org?.connectedStatus?.toLowerCase();
    const connected = sc === 'connected' || sc === 'active';
    btnRun.disabled = !connected;
}

function setOrgPrompt() {
    orgHint.className = 'runner-org-hint prompt';
    orgHint.textContent = 'Select an org in the toolbar to enable the SOQL Runner and autocomplete';
    soqlInput.disabled = true;
    btnRun.disabled = true;
}

function setOrgWarning(savedOrg) {
    orgHint.className = 'runner-org-hint warning';
    orgHint.textContent = savedOrg
        ? `Org "${savedOrg}" is no longer available — select another to continue`
        : 'No orgs found — connect an org with: sf org login web';
    soqlInput.disabled = true;
    btnRun.disabled = true;
}

let _cachedOrgs = null;

async function loadOrgs(forceRefresh = false) {
    try {
        const fn = forceRefresh ? window.electronAPI.refreshDataWorkbenchOrgs : window.electronAPI.getDataWorkbenchOrgs;
        const { orgs } = await fn();
        _cachedOrgs = orgs;
        orgSelect.innerHTML = '';
        if (!orgs?.length) {
            orgSelect.innerHTML = '<option value="">No orgs found</option>';
            setOrgWarning('');
            return;
        }
        orgs.forEach(o => {
            const opt  = document.createElement('option');
            opt.value  = o.alias || o.username;
            const name = o.alias ? `${o.alias}  —  ${o.username}` : o.username;
            const tags = [o.isSandbox ? 'sandbox' : '', o.isDevHub ? 'DevHub' : ''].filter(Boolean).join(', ');
            opt.textContent = tags ? `${name}  (${tags})` : name;
            orgSelect.appendChild(opt);
        });

        const savedOrg = await window.electronAPI.getSetting('soqlDefaultOrg');
        if (savedOrg) {
            const found = orgs.find(o => (o.alias || o.username) === savedOrg);
            if (found) {
                orgSelect.value = savedOrg;
                setOrgReady();
            } else {
                const blank = document.createElement('option');
                blank.value = '';
                blank.textContent = '— Select an org —';
                orgSelect.insertBefore(blank, orgSelect.firstChild);
                orgSelect.value = '';
                setOrgWarning(savedOrg);
            }
        } else {
            const blank = document.createElement('option');
            blank.value = '';
            blank.textContent = '— Select an org —';
            orgSelect.insertBefore(blank, orgSelect.firstChild);
            orgSelect.value = '';
            setOrgPrompt();
        }
        setOrgStatus(orgs);
    } catch {
        orgSelect.innerHTML = '<option value="">Error loading orgs</option>';
    }
}
loadOrgs();

orgSelect.addEventListener('change', () => {
    const value = orgSelect.value;
    if (!value) return;
    // Remove the placeholder option once a real org is chosen
    const blank = orgSelect.querySelector('option[value=""]');
    if (blank) blank.remove();
    window.electronAPI.setSetting('soqlDefaultOrg', value);
    setOrgReady();
    setOrgStatus(_cachedOrgs);
});
btnRefreshOrgs.addEventListener('click', () => loadOrgs(true));

// ── Autocomplete ──────────────────────────────────

const BASE_WIDTH    = 720;
const SUGGESTIONS_W = 240;
const BASE_HEIGHT   = 260;

initSoqlAutocomplete({
    textarea:       soqlInput,
    dropdown:       document.getElementById('soql-autocomplete'),
    getOrg:         () => orgSelect.value,
    describeObject: (objectName, org) =>
        window.electronAPI.sfDescribeObject({ objectName, orgIdentifier: org }),
    listObjects:       (org) =>
        window.electronAPI.sfListObjects({ orgIdentifier: org }).then(r => r.success ? r.data : []),
    invalidateObjects: (org) =>
        window.electronAPI.sfClearObjectList({ orgIdentifier: org }),
    invalidateDescribe: (org, objectName) =>
        window.electronAPI.sfClearObjectDescribe({ orgIdentifier: org, objectName }),
    persistent: true,
    onShow: null,
    onHide: null
});

// ── Query execution ───────────────────────────────

function showError(msg) { runError.textContent = msg; }
function clearError()   { runError.textContent = ''; }

async function runQuery() {
    // Strip trailing commas before FROM (artefact of autocomplete insertion on last field)
    const raw   = soqlInput.value.trim();
    const query = raw.replace(/,+(\s*)(\bFROM\b)/gi, '$1$2');
    if (query !== raw) soqlInput.value = query;
    if (!query) { showError('Enter a SOQL query.'); return; }

    clearError();
    btnRun.disabled = true;
    btnRun.textContent = '…';

    try {
        const result = await window.electronAPI.sfRunSoql({ query, orgIdentifier: orgSelect.value });
        if (result.error) { showError(result.error); return; }
        _columns   = result.columns || [];
        _rows      = result.rows    || [];
        _totalSize = result.totalSize || _rows.length;
        _limit     = DEFAULT_LIMIT;
        _search    = '';
        resultSearch.value = '';
        btnSearchClear.classList.add('hidden');
        renderTable();
        queryPanel.classList.add('hidden');
        resultPanel.classList.remove('hidden');
        resizeForResults();
        window.electronAPI.qlAddRecent({ query, org: orgSelect.value });
    } finally {
        btnRun.disabled = false;
        btnRun.textContent = 'Run  ⌘↵';
    }
}

// ── Table rendering ───────────────────────────────

function makeCell(value) {
    const td  = document.createElement('td');
    const str = value ?? '';
    td.title  = str.length > 40 ? str : '';

    if (sfInstanceUrl && SF_ID_RE.test(str)) {
        const link = document.createElement('span');
        link.className   = 'runner-id-link';
        link.textContent = str;
        link.addEventListener('click', () => window.electronAPI.openSalesforceId(str));
        td.appendChild(link);
    } else {
        td.textContent = str;
    }
    return td;
}

function renderTable() {
    tableWrap.innerHTML = '';

    if (!_columns.length || !_rows.length) {
        const empty = document.createElement('div');
        empty.className = 'runner-empty';
        empty.textContent = 'No results';
        tableWrap.appendChild(empty);
        resultCount.textContent = '0 rows';
        return;
    }

    // Filter by search
    const term = _search.toLowerCase();
    const filtered = term
        ? _rows.filter(row => row.some(cell => String(cell ?? '').toLowerCase().includes(term)))
        : _rows;

    // Apply limit
    const limited  = filtered.slice(0, _limit);
    const hasMore  = filtered.length > _limit;

    const table = document.createElement('table');
    table.className = 'runner-table';

    // Header
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    _columns.forEach(col => { const th = document.createElement('th'); th.textContent = col; hr.appendChild(th); });
    thead.appendChild(hr);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    limited.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => tr.appendChild(makeCell(cell)));
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    // Show-more row
    if (hasMore) {
        const more = document.createElement('div');
        more.className = 'runner-limit-row';
        more.textContent = `Showing ${limited.length.toLocaleString()} of ${filtered.length.toLocaleString()} rows`;
        const showAllBtn = document.createElement('button');
        showAllBtn.className = 'runner-show-all-btn';
        showAllBtn.textContent = 'Show all';
        showAllBtn.addEventListener('click', () => { _limit = Infinity; renderTable(); resizeForResults(); });
        more.appendChild(showAllBtn);
        tableWrap.appendChild(more);
    }

    // Count label
    const shown = limited.length;
    const total = _totalSize;
    if (term) {
        resultCount.textContent = `${filtered.length.toLocaleString()} match${filtered.length !== 1 ? 'es' : ''} · ${total.toLocaleString()} total`;
    } else {
        resultCount.textContent = total > _rows.length
            ? `${shown.toLocaleString()} of ${total.toLocaleString()} rows (SF limit)`
            : `${shown.toLocaleString()}${hasMore ? `/${_rows.length.toLocaleString()}` : ''} row${shown !== 1 ? 's' : ''}`;
    }
}

function resizeForResults() {
    const ROW_H = 26;
    const FIXED = 110; // bar + result-bar + padding
    const rows  = Math.min(_limit === Infinity ? _rows.length : Math.min(_rows.length, _limit), 15);
    window.electronAPI.soqlRunnerResize({ height: FIXED + rows * ROW_H });
}

// ── Search ────────────────────────────────────────

resultSearch.addEventListener('input', () => {
    _search = resultSearch.value;
    btnSearchClear.classList.toggle('hidden', !_search);
    _limit  = DEFAULT_LIMIT;
    renderTable();
});

btnSearchClear.addEventListener('click', () => {
    _search = '';
    resultSearch.value = '';
    btnSearchClear.classList.add('hidden');
    _limit = DEFAULT_LIMIT;
    renderTable();
    resultSearch.focus();
});

// ── Export ────────────────────────────────────────

btnExportCsv.addEventListener('click', () => {
    window.electronAPI.copyToClipboard(tableToCsv(_columns, _rows)).then(() => flashBtn(btnExportCsv, 'CSV'));
});

btnExportSheet.addEventListener('click', () => {
    window.electronAPI.copyToClipboard(tableToTsv(_columns, _rows)).then(() => flashBtn(btnExportSheet, 'Sheet'));
});

btnExportDl.addEventListener('click', async () => {
    const csv = tableToCsv(_columns, _rows);
    const result = await window.electronAPI.downloadWorkbenchCsv({ filename: 'soql-export', content: csv });
    if (result?.success) flashBtn(btnExportDl, '↓ CSV');
});

// ── Navigation ────────────────────────────────────

function switchToQuery() {
    resultPanel.classList.add('hidden');
    queryPanel.classList.remove('hidden');
    soqlInput.focus();
}

btnEdit.addEventListener('click', switchToQuery);
btnRerun.addEventListener('click', runQuery);
btnRun.addEventListener('click', runQuery);

soqlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runQuery(); }
});

btnClose.addEventListener('click', () => window.electronAPI.soqlRunnerClose());
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.electronAPI.soqlRunnerClose();
});

soqlInput.focus();

// ── Query library ─────────────────────────────────

function parseFromObject(query) {
    const m = query.match(/\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/i);
    return m ? m[1] : '';
}

function closeLibrary() {
    libraryPanel.classList.add('hidden');
    if (resultPanel.classList.contains('hidden')) {
        queryPanel.classList.remove('hidden');
        window.electronAPI.soqlRunnerResize({ height: BASE_HEIGHT });
    } else {
        resizeForResults();
    }
    soqlInput.focus();
}

const queryLib = initQueryLibrary({
    container: libraryPanel,
    onSelect(query) {
        soqlInput.value = query;
        closeLibrary();
    },
    onClose: closeLibrary
});

btnLibrary.addEventListener('click', () => {
    if (!libraryPanel.classList.contains('hidden')) {
        closeLibrary();
        return;
    }
    queryPanel.classList.add('hidden');
    resultPanel.classList.add('hidden');
    libraryPanel.classList.remove('hidden');
    queryLib.open();
    window.electronAPI.soqlRunnerResize({ height: 500 });
});

// ── Save popover ──────────────────────────────────

btnSave.addEventListener('click', () => {
    const query = soqlInput.value.trim();
    if (!query) return;
    saveName.value = parseFromObject(query);
    savePopover.classList.remove('hidden');
    saveName.focus();
    saveName.select();
});

btnSaveCancel.addEventListener('click', () => {
    savePopover.classList.add('hidden');
});

async function confirmSave() {
    const query = soqlInput.value.trim();
    if (!query) return;
    const name = saveName.value.trim() || parseFromObject(query) || 'Query';
    await window.electronAPI.qlSaveFavorite({ name, query });
    savePopover.classList.add('hidden');
    flashBtn(btnSave, '★');
    setTimeout(() => { btnSave.textContent = '☆'; }, 1500);
}

btnSaveConfirm.addEventListener('click', confirmSave);

saveName.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmSave(); }
    if (e.key === 'Escape') { e.preventDefault(); savePopover.classList.add('hidden'); }
});
