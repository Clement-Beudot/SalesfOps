// ── DML Panel & Card ──────────────────────────────────────────────────────────

// ── DOM refs ──────────────────────────────────────────────────────────────────

const dmlSourceSelect    = document.getElementById('dml-source-select');
const dmlOrgSelect       = document.getElementById('dml-org-select');
const dmlObjectInput     = document.getElementById('dml-object-input');
const dmlObjectDropdown  = document.getElementById('dml-object-dropdown');
const dmlExtIdRow        = document.getElementById('dml-extid-row');
const dmlExtIdInput      = document.getElementById('dml-extid-input');
const dmlAllOrNone       = document.getElementById('dml-allornone');
const dmlBatchSizeInput  = document.getElementById('dml-batch-size');
const dmlMappingsSection = document.getElementById('dml-mappings-section');
const dmlMappingsList    = document.getElementById('dml-mappings-list');
const dmlFieldDatalist   = document.getElementById('dml-field-datalist');
const dmlPanelError      = document.getElementById('dml-panel-error');
const btnCreateDml       = document.getElementById('btn-create-dml');

// ── Panel state ───────────────────────────────────────────────────────────────

var dmlEditingEntry    = null;
var dmlDescribedFields = [];
var dmlObjectList      = [];   // cached [{name, label}] from sfListObjects
var dmlObjectListOrg   = null; // org for which dmlObjectList was fetched
var dmlObjectAcIdx     = -1;   // keyboard cursor in dropdown

// ── Panel open/close ──────────────────────────────────────────────────────────

async function ensureDmlOrgsLoaded(defaultOrg = null) {
    if (!orgsLoaded && !orgsLoading) {
        await loadOrgs();
    } else if (orgsLoading) {
        await new Promise(resolve => {
            const iv = setInterval(() => { if (!orgsLoading) { clearInterval(iv); resolve(); } }, 50);
        });
    }
    populateOrgSelect(dmlOrgSelect, defaultOrg);
}

btnDml.addEventListener('click', () => {
    const isOpen = dmlPanel.classList.toggle('open');
    btnDml.classList.toggle('active-toggle', isOpen);
    btnDml.textContent = isOpen ? '✕ Close' : '+ DML';
    if (isOpen) {
        addPanel.classList.remove('open');
        btnAdd.classList.remove('active-toggle');
        btnAdd.textContent = '+ Add Table';
        resultPanel.classList.remove('open');
        btnResult.classList.remove('active-toggle');
        btnResult.textContent = '+ Add Result';
        dmlEditingEntry = null;
        btnCreateDml.textContent = 'Create DML Card';
        resetDmlPanel();
        populateDmlSourceSelect();
        clearDmlError();
        ensureDmlOrgsLoaded();
    }
});

function closeDmlPanel() {
    dmlPanel.classList.remove('open');
    btnDml.classList.remove('active-toggle');
    btnDml.textContent = '+ DML';
    dmlEditingEntry = null;
}

function resetDmlPanel() {
    dmlObjectInput.value = '';
    dmlExtIdInput.value = '';
    dmlExtIdRow.classList.add('hidden');
    dmlMappingsSection.classList.add('hidden');
    dmlMappingsList.innerHTML = '';
    dmlObjectDropdown.innerHTML = '';
    dmlObjectDropdown.classList.add('hidden');
    dmlFieldDatalist.innerHTML = '';
    dmlDescribedFields = [];
    dmlObjectAcIdx = -1;
    document.querySelector('input[name="dml-op"][value="update"]').checked = true;
    dmlAllOrNone.checked = false;
    dmlBatchSizeInput.value = 200;
    populateOrgSelect(dmlOrgSelect, null);
}

function clearDmlError() {
    dmlPanelError.textContent = '';
    dmlPanelError.classList.remove('visible');
}

function showDmlError(msg) {
    dmlPanelError.textContent = msg;
    dmlPanelError.classList.add('visible');
}

// ── Open panel in edit mode (from schema "✎ Edit") ────────────────────────────

function openDmlPanelForEdit(tableEntry) {
    dmlEditingEntry = tableEntry;

    dmlPanel.classList.add('open');
    btnDml.classList.add('active-toggle');
    btnDml.textContent = '✕ Close';
    addPanel.classList.remove('open');
    btnAdd.classList.remove('active-toggle');
    btnAdd.textContent = '+ Add Table';
    resultPanel.classList.remove('open');
    btnResult.classList.remove('active-toggle');
    btnResult.textContent = '+ Add Result';

    clearDmlError();
    resetDmlPanel();
    btnCreateDml.textContent = 'Update DML Card';

    populateDmlSourceSelect();
    const cfg = tableEntry.dmlConfig;
    dmlSourceSelect.value = cfg.sourceTableId;
    ensureDmlOrgsLoaded(cfg.orgIdentifier || null);
    dmlObjectInput.value = cfg.objectName;

    const op = cfg.operation || 'update';
    const radioEl = document.querySelector(`input[name="dml-op"][value="${op}"]`);
    if (radioEl) radioEl.checked = true;
    dmlExtIdRow.classList.toggle('hidden', op !== 'upsert');
    dmlExtIdInput.value = cfg.externalIdField || '';
    dmlAllOrNone.checked = cfg.allOrNone || false;
    dmlBatchSizeInput.value = cfg.batchSize || 200;

    buildDmlMappings(cfg.mappings);
    if (cfg.objectName) loadDmlFields();
}

// ── Source select ─────────────────────────────────────────────────────────────

function populateDmlSourceSelect() {
    const sourceTables = tables.filter(t => t.source !== 'dml');
    dmlSourceSelect.innerHTML = '';
    if (sourceTables.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No tables available';
        dmlSourceSelect.appendChild(opt);
        return;
    }
    sourceTables.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.rows.length} rows)`;
        dmlSourceSelect.appendChild(opt);
    });
    buildDmlMappings();
}

dmlSourceSelect.addEventListener('change', () => {
    buildDmlMappings();
});

dmlOrgSelect.addEventListener('change', () => {
    dmlObjectList = [];
    dmlObjectListOrg = null;
    if (dmlObjectInput.value.trim()) loadDmlFields();
});

// ── Object name autocomplete (custom dropdown) ────────────────────────────────

function dmlAcGetOrg() {
    return dmlOrgSelect.value || null;
}

async function ensureDmlObjectList() {
    const org = dmlAcGetOrg();
    if (dmlObjectList.length > 0 && dmlObjectListOrg === org) return;
    dmlObjectList = [];
    dmlObjectListOrg = org;
    try {
        const result = await window.electronAPI.sfListObjects({ orgIdentifier: org });
        dmlObjectList = result.success ? result.data : [];
        dmlObjectListOrg = org;
    } catch { dmlObjectList = []; }
}

function dmlAcRender() {
    const term = dmlObjectInput.value.trim().toLowerCase();
    const matches = term
        ? dmlObjectList.filter(o => o.name.toLowerCase().includes(term) || o.label.toLowerCase().includes(term))
        : dmlObjectList;

    dmlObjectDropdown.innerHTML = '';
    dmlObjectAcIdx = -1;

    if (matches.length === 0) { dmlObjectDropdown.classList.add('hidden'); return; }

    const MAX = 60;
    matches.slice(0, MAX).forEach((o, i) => {
        const item = document.createElement('div');
        item.className = 'dml-ac-item';
        item.dataset.idx = i;
        const nameEl = document.createElement('span');
        nameEl.className = 'dml-ac-name';
        nameEl.textContent = o.name;
        const labelEl = document.createElement('span');
        labelEl.className = 'dml-ac-label';
        labelEl.textContent = o.label;
        item.append(nameEl, labelEl);
        item.addEventListener('mousedown', e => {
            e.preventDefault(); // keep focus on input
            dmlObjectInput.value = o.name;
            dmlObjectDropdown.classList.add('hidden');
            loadDmlFields();
        });
        dmlObjectDropdown.appendChild(item);
    });
    if (matches.length > MAX) {
        const more = document.createElement('div');
        more.className = 'dml-ac-more';
        more.textContent = `+${matches.length - MAX} more — type to filter`;
        dmlObjectDropdown.appendChild(more);
    }
    dmlObjectDropdown.classList.remove('hidden');
}

dmlObjectInput.addEventListener('focus', async () => {
    dmlObjectDropdown.innerHTML = '';
    const loadingItem = document.createElement('div');
    loadingItem.className = 'dml-ac-item dml-ac-loading';
    loadingItem.textContent = 'Loading objects…';
    if (dmlObjectList.length === 0) dmlObjectDropdown.appendChild(loadingItem);
    dmlObjectDropdown.classList.remove('hidden');
    await ensureDmlObjectList();
    dmlAcRender();
});

dmlObjectInput.addEventListener('input', dmlAcRender);

dmlObjectInput.addEventListener('keydown', e => {
    const items = dmlObjectDropdown.querySelectorAll('.dml-ac-item:not(.dml-ac-loading)');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        dmlObjectAcIdx = Math.min(dmlObjectAcIdx + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('active', i === dmlObjectAcIdx));
        items[dmlObjectAcIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        dmlObjectAcIdx = Math.max(dmlObjectAcIdx - 1, 0);
        items.forEach((el, i) => el.classList.toggle('active', i === dmlObjectAcIdx));
        items[dmlObjectAcIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && dmlObjectAcIdx >= 0) {
        e.preventDefault();
        items[dmlObjectAcIdx]?.dispatchEvent(new MouseEvent('mousedown'));
    } else if (e.key === 'Escape') {
        dmlObjectDropdown.classList.add('hidden');
    }
});

dmlObjectInput.addEventListener('blur', () => {
    // Delay so mousedown on dropdown item fires first
    setTimeout(() => dmlObjectDropdown.classList.add('hidden'), 150);
    if (dmlObjectInput.value.trim()) loadDmlFields();
});

// ── SF fields for mapping validation ─────────────────────────────────────────

async function loadDmlFields() {
    const objectName = dmlObjectInput.value.trim();
    if (!objectName) { dmlDescribedFields = []; dmlFieldDatalist.innerHTML = ''; return; }
    const org = dmlOrgSelect.value || null;
    try {
        const result = await window.electronAPI.sfDescribeObject({ objectName, orgIdentifier: org });
        const data = result.success ? result.data : result;
        dmlDescribedFields = data?.fields || [];
        dmlFieldDatalist.innerHTML = '';
        dmlDescribedFields.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.name;
            dmlFieldDatalist.appendChild(opt);
        });
    } catch { dmlDescribedFields = []; dmlFieldDatalist.innerHTML = ''; }
}

// ── Operation selector ────────────────────────────────────────────────────────

document.querySelectorAll('input[name="dml-op"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const op = document.querySelector('input[name="dml-op"]:checked')?.value;
        dmlExtIdRow.classList.toggle('hidden', op !== 'upsert');
    });
});

// ── Mappings ──────────────────────────────────────────────────────────────────

function buildDmlMappings(existingMappings = null) {
    const tableId = dmlSourceSelect.value;
    const entry = tables.find(t => t.id === tableId);
    if (!entry || entry.columns.length === 0) {
        dmlMappingsSection.classList.add('hidden');
        return;
    }
    dmlMappingsSection.classList.remove('hidden');
    dmlMappingsList.innerHTML = '';

    const existingByCol = existingMappings
        ? Object.fromEntries(existingMappings.map(m => [m.col, m]))
        : null;

    entry.columns.forEach(col => {
        const existing = existingByCol ? existingByCol[col] : null;
        const row = document.createElement('div');
        row.className = 'dml-mapping-row';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'dml-mapping-check';
        chk.checked = existing ? existing.included : true;
        chk.dataset.col = col;

        const colLabel = document.createElement('span');
        colLabel.className = 'dml-mapping-col';
        colLabel.textContent = col;

        const arrow = document.createElement('span');
        arrow.className = 'dml-mapping-arrow';
        arrow.textContent = '→';

        const fieldInput = document.createElement('input');
        fieldInput.type = 'text';
        fieldInput.className = 'dml-mapping-field';
        fieldInput.value = existing ? existing.field : col;
        fieldInput.placeholder = 'SF field name';
        fieldInput.setAttribute('list', 'dml-field-datalist');
        fieldInput.autocomplete = 'off';
        fieldInput.spellcheck = false;
        fieldInput.dataset.col = col;

        row.append(chk, colLabel, arrow, fieldInput);
        dmlMappingsList.appendChild(row);
    });
}

function getMappings() {
    const rows = dmlMappingsList.querySelectorAll('.dml-mapping-row');
    return [...rows].map(row => ({
        col: row.querySelector('.dml-mapping-check').dataset.col,
        field: row.querySelector('.dml-mapping-field').value.trim(),
        included: row.querySelector('.dml-mapping-check').checked
    }));
}

// ── Validate + submit ─────────────────────────────────────────────────────────

btnCreateDml.addEventListener('click', () => {
    clearDmlError();
    const sourceTableId = dmlSourceSelect.value;
    const objectName    = dmlObjectInput.value.trim();
    const operation     = document.querySelector('input[name="dml-op"]:checked')?.value || 'update';
    const externalIdField = dmlExtIdInput.value.trim();

    if (!sourceTableId) { showDmlError('Select a source table.'); return; }
    if (!objectName)    { showDmlError('Enter a Salesforce object name.'); return; }
    if (operation === 'upsert' && !externalIdField) { showDmlError('Enter an External ID field for upsert.'); return; }

    const mappings       = getMappings();
    const activeMappings = mappings.filter(m => m.included);
    if (activeMappings.length === 0) { showDmlError('At least one column must be included.'); return; }
    const badMappings = activeMappings.filter(m => !m.field);
    if (badMappings.length > 0) { showDmlError(`Missing SF field name for: ${badMappings.map(m => m.col).join(', ')}`); return; }

    // Validate field names against describe if available
    if (dmlDescribedFields.length > 0) {
        const knownFields = new Set(dmlDescribedFields.map(f => f.name.toLowerCase()));
        const unknown = activeMappings.filter(m => !knownFields.has(m.field.toLowerCase()));
        if (unknown.length > 0) {
            showDmlError(`Unknown field${unknown.length > 1 ? 's' : ''} on ${objectName}: ${unknown.map(m => m.field).join(', ')}`);
            return;
        }
    }

    const orgIdentifier = dmlOrgSelect.value || null;
    if (!orgIdentifier) { showDmlError('Select a destination org.'); return; }
    const allOrNone = dmlAllOrNone.checked;
    const batchSize = Math.min(200, Math.max(1, parseInt(dmlBatchSizeInput.value, 10) || 200));
    const dmlConfig = { sourceTableId, objectName, operation, externalIdField: externalIdField || null, mappings, orgIdentifier, allOrNone, batchSize };

    if (dmlEditingEntry) {
        dmlEditingEntry.dmlConfig = dmlConfig;
        dmlEditingEntry.dmlStatus = 'idle';
        dmlEditingEntry.dmlResults = null;
        refreshDmlCardDOM(dmlEditingEntry);
    } else {
        addDmlCard({ name: `DML ${++tableCounter}`, dmlConfig });
    }

    closeDmlPanel();
    resetDmlPanel();
});

// ── Invalidate DML results when a source table updates ────────────────────────

function invalidateDmlCardsForSource(sourceTableId) {
    tables
        .filter(t => t.source === 'dml' && t.dmlConfig?.sourceTableId === sourceTableId)
        .forEach(t => { t.dmlResults = null; t.dmlStatus = 'idle'; t.dmlLastRun = null; });
}

// ── Add DML card to workspace ─────────────────────────────────────────────────

function addDmlCard({ id: providedId = null, name, dmlConfig, dmlStatus = 'idle', resultRows = null }) {
    const id = providedId || `t_${Date.now()}`;
    const tableEntry = {
        id, name, source: 'dml', ref: null,
        columns: [], columnDefs: null, rows: [],
        dmlConfig: { ...dmlConfig, mappings: dmlConfig.mappings.map(m => ({ ...m })) },
        dmlStatus,
        dmlResults: resultRows || null,
        dmlLastRun: null,
        description: null
    };
    tables.push(tableEntry);
    updateBindingsHint();
    btnResult.style.display = '';
    btnSaveModel.style.display = '';
    btnSnapshotModel.style.display = '';
    if (workbenchDmlEnabled) btnDml.style.display = '';
    if (typeof btnColorRules !== 'undefined') btnColorRules.style.display = '';
    emptyState.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'table-card dml-card';
    card.dataset.tableId = id;
    card.dataset.source = 'dml';

    // ── Header ──
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';

    const btnCollapse = document.createElement('button');
    btnCollapse.className = 'btn-collapse';
    btnCollapse.textContent = '▾';
    btnCollapse.title = 'Collapse / expand';
    btnCollapse.addEventListener('click', () => {
        const collapsed = card.classList.toggle('collapsed');
        btnCollapse.textContent = collapsed ? '▸' : '▾';
    });

    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = name;
    title.title = 'Double-click to rename';
    title.addEventListener('dblclick', () => {
        const refChipDummy = document.createElement('span');
        startRename(title, refChipDummy, tableEntry);
    });

    const badge = document.createElement('span');
    badge.className = 'source-badge dml';
    badge.textContent = 'DML';

    const subtitleEl = document.createElement('span');
    subtitleEl.className = 'table-subtitle dml-subtitle';
    subtitleEl.textContent = `${dmlConfig.objectName} · ${dmlConfig.operation.toUpperCase()}`;

    const spacer = document.createElement('div');
    spacer.className = 'card-spacer';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-edit';
    btnEdit.textContent = '✎';
    btnEdit.title = 'Edit DML configuration';
    btnEdit.addEventListener('click', () => openDmlPanelForEdit(tableEntry));

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-delete';
    btnDelete.textContent = '✕';
    btnDelete.title = 'Remove DML card';
    const headerErr = document.createElement('span');
    headerErr.className = 'panel-error header-delete-error';
    btnDelete.addEventListener('click', () => {
        if (!deleteTableSafe(tableEntry, card, headerErr)) {
            const hdr = card.querySelector('.card-header') || card;
            if (!hdr.contains(headerErr)) hdr.appendChild(headerErr);
            clearTimeout(headerErr._hideTimer);
            headerErr._hideTimer = setTimeout(() => headerErr.classList.remove('visible'), 4000);
        }
    });

    cardHeader.append(btnCollapse, title, badge, subtitleEl, spacer, btnEdit, btnDelete);

    // ── Body ──
    const body = document.createElement('div');
    body.className = 'dml-card-body';

    const configSection = buildDmlConfigView(tableEntry);
    body.append(configSection);
    card.append(cardHeader, body);
    content.appendChild(card);

    // Store DOM refs on entry for later refresh
    tableEntry._domSubtitle      = subtitleEl;
    tableEntry._domConfigSection = configSection;

    renderSchema();
}

// ── Refresh DML card DOM after edit ──────────────────────────────────────────

function refreshDmlCardDOM(tableEntry) {
    const cfg = tableEntry.dmlConfig;
    if (tableEntry._domSubtitle) {
        tableEntry._domSubtitle.textContent = `${cfg.objectName} · ${cfg.operation.toUpperCase()}`;
    }
    if (tableEntry._domConfigSection) {
        const newSection = buildDmlConfigView(tableEntry);
        tableEntry._domConfigSection.replaceWith(newSection);
        tableEntry._domConfigSection = newSection;
    }
    renderSchema();
}


function buildDmlConfigView(tableEntry) {
    const cfg = tableEntry.dmlConfig;
    const section = document.createElement('div');
    section.className = 'dml-config-section';

    const srcEntry = tables.find(t => t.id === cfg.sourceTableId);
    const srcLine = document.createElement('div');
    srcLine.className = 'dml-config-line';
    srcLine.innerHTML = `<span class="dml-config-key">Source</span><span class="dml-config-val">${srcEntry ? srcEntry.name : '⚠ table not found'}</span>`;
    section.appendChild(srcLine);

    const orgLine = document.createElement('div');
    orgLine.className = 'dml-config-line';
    orgLine.innerHTML = `<span class="dml-config-key">Org</span><span class="dml-config-val">${cfg.orgIdentifier || '—'}</span>`;
    section.appendChild(orgLine);

    const activeMappings = cfg.mappings.filter(m => m.included);
    const mapLine = document.createElement('div');
    mapLine.className = 'dml-config-line dml-mappings-summary';
    mapLine.innerHTML = `<span class="dml-config-key">Mappings</span><span class="dml-config-val">${activeMappings.map(m => `<code>${m.col} → ${m.field}</code>`).join(' ')}</span>`;
    section.appendChild(mapLine);

    if (cfg.externalIdField) {
        const extLine = document.createElement('div');
        extLine.className = 'dml-config-line';
        extLine.innerHTML = `<span class="dml-config-key">External ID</span><span class="dml-config-val">${cfg.externalIdField}</span>`;
        section.appendChild(extLine);
    }

    if (cfg.batchSize && cfg.batchSize !== 200) {
        const bsLine = document.createElement('div');
        bsLine.className = 'dml-config-line';
        bsLine.innerHTML = `<span class="dml-config-key">Batch size</span><span class="dml-config-val">${cfg.batchSize}</span>`;
        section.appendChild(bsLine);
    }
    if (cfg.allOrNone) {
        const aonLine = document.createElement('div');
        aonLine.className = 'dml-config-line';
        aonLine.innerHTML = `<span class="dml-config-key">All or none</span><span class="dml-config-val dml-config-warn">ON — any failure rolls back all</span>`;
        section.appendChild(aonLine);
    }

    return section;
}

// ── Run DML ────────────────────────────────────────────────────────────────────

// Core execution — batches run in the renderer so the UI updates between each await
async function executeDml(tableEntry, onProgress = null) {
    const cfg = tableEntry.dmlConfig;
    const srcEntry = tables.find(t => t.id === cfg.sourceTableId);
    if (!srcEntry) return { success: false, error: 'Source table not found.' };
    if (srcEntry.rows.length === 0) return { success: false, error: 'Source table has no rows.' };

    const activeMappings = cfg.mappings.filter(m => m.included);
    const colIndices = activeMappings.map(m => srcEntry.columns.indexOf(m.col));
    const allRecords = srcEntry.rows.map(row =>
        Object.fromEntries(activeMappings.map((m, i) => [m.field, row[colIndices[i]] ?? null]))
    );

    const batchSize = cfg.batchSize || 200;
    const batches = [];
    for (let i = 0; i < allRecords.length; i += batchSize) batches.push(allRecords.slice(i, i + batchSize));

    const allResults = [];
    for (let bi = 0; bi < batches.length; bi++) {
        const batchResult = await window.electronAPI.sfRunDmlBatch({
            orgIdentifier: cfg.orgIdentifier || null,
            objectName: cfg.objectName,
            operation: cfg.operation,
            externalIdField: cfg.externalIdField || undefined,
            allOrNone: cfg.allOrNone || false,
            batchOffset: bi * batchSize,
            records: batches[bi]
        });
        if (!batchResult.success) return batchResult;
        allResults.push(...batchResult.results);
        if (onProgress) onProgress({ batchIndex: bi, total: batches.length, results: batchResult.results });
    }

    const totalSuccess = allResults.filter(r => r.success).length;
    return { success: true, results: allResults, totalSent: allResults.length, totalSuccess, totalFailed: allResults.length - totalSuccess };
}

function _dmlToast(tableEntry, result) {
    const cfg = tableEntry.dmlConfig;
    const opLabel = cfg.operation.charAt(0).toUpperCase() + cfg.operation.slice(1);
    const summary = `${result.totalSuccess} success${result.totalFailed > 0 ? `, ${result.totalFailed} error${result.totalFailed !== 1 ? 's' : ''}` : ''}`;
    showToast(`${tableEntry.name}: ${opLabel} complete — ${summary}`, result.totalFailed > 0 ? 'error' : 'success', 5000);
}

async function runDmlCard(tableEntry, btnRun, runError, resultSection) {
    runError.classList.remove('visible');
    btnRun.disabled = true;
    btnRun.textContent = 'Running…';
    tableEntry.dmlStatus = 'running';
    try {
        const result = await executeDml(tableEntry);
        if (!result.success) {
            runError.textContent = result.error || 'DML failed.';
            runError.classList.add('visible');
            tableEntry.dmlStatus = 'idle';
        } else {
            tableEntry.dmlStatus = 'done';
            tableEntry.dmlResults = result.results;
            tableEntry.dmlLastRun = new Date();
            renderDmlResults(resultSection, result.results);
            _dmlToast(tableEntry, result);
        }
    } catch (err) {
        runError.textContent = err.message || 'Unexpected error.';
        runError.classList.add('visible');
        tableEntry.dmlStatus = 'idle';
    } finally {
        btnRun.disabled = false;
        updateRunBtnLabel(btnRun, tableEntry);
        renderSchema();
    }
}

// ── Results rendering ─────────────────────────────────────────────────────────

function renderDmlResults(container, results) {
    container.innerHTML = '';
    if (!results || results.length === 0) return;

    const totalSuccess = results.filter(r => r.success).length;
    const totalFailed  = results.length - totalSuccess;

    const summary = document.createElement('div');
    summary.className = 'dml-results-summary';
    const successSpan = document.createElement('span');
    successSpan.className = 'dml-results-ok';
    successSpan.textContent = `✓ ${totalSuccess} success`;
    summary.appendChild(successSpan);
    if (totalFailed > 0) {
        const errSpan = document.createElement('span');
        errSpan.className = 'dml-results-err';
        errSpan.textContent = `✕ ${totalFailed} error${totalFailed !== 1 ? 's' : ''}`;
        summary.appendChild(errSpan);
    }
    container.appendChild(summary);

    if (totalFailed > 0) {
        const errTable = document.createElement('table');
        errTable.className = 'dml-results-table';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['#', 'Id', 'Error'].forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        errTable.appendChild(thead);

        const tbody = document.createElement('tbody');
        results.filter(r => !r.success).forEach(r => {
            const tr = document.createElement('tr');
            const tdIdx = document.createElement('td');
            tdIdx.textContent = r.index + 1;
            const tdId = document.createElement('td');
            tdId.textContent = r.id || '—';
            const tdErr = document.createElement('td');
            tdErr.textContent = (r.errors || []).map(e => e.message || e.statusCode).join('; ');
            tr.append(tdIdx, tdId, tdErr);
            tbody.appendChild(tr);
        });
        errTable.appendChild(tbody);
        container.appendChild(errTable);
    }
}

// Renders source rows with an inline Result column from DML results
function renderDmlMergedTable(container, srcTable, dmlResults, lastRun = null, activeCols = null) {
    const total  = dmlResults.length;
    const ok     = dmlResults.filter(r => r.success).length;
    const failed = total - ok;

    const header = document.createElement('p');
    header.className = 'dml-preview-src-header';
    const okSpan = document.createElement('span');
    okSpan.className = 'dml-results-ok';
    okSpan.textContent = `✓ ${ok}`;
    header.append(`${total} records — `, okSpan);
    if (failed > 0) {
        const errSpan = document.createElement('span');
        errSpan.className = 'dml-results-err';
        errSpan.textContent = `  ✕ ${failed}`;
        header.appendChild(errSpan);
    }
    if (lastRun) {
        const ts = document.createElement('span');
        ts.className = 'dml-preview-ts';
        ts.textContent = `  · ${lastRun.toLocaleTimeString()}`;
        header.appendChild(ts);
    }
    container.appendChild(header);

    const wrap = document.createElement('div');
    wrap.className = 'table-wrapper';

    const table = document.createElement('table');
    table.className = 'data-table dml-merged-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    srcTable.columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        if (activeCols && !activeCols.has(col)) th.classList.add('dml-col-inactive');
        headRow.appendChild(th);
    });
    const thResult = document.createElement('th');
    thResult.className = 'dml-result-th';
    thResult.textContent = 'Result';
    headRow.appendChild(thResult);
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    srcTable.rows.forEach((row, i) => {
        const res = dmlResults[i];
        const tr = document.createElement('tr');
        tr.className = res?.success ? 'dml-row-ok' : 'dml-row-err';

        row.forEach((cell, ci) => {
            const td = document.createElement('td');
            td.textContent = cell ?? '';
            if (activeCols && !activeCols.has(srcTable.columns[ci])) td.classList.add('dml-col-inactive');
            tr.appendChild(td);
        });

        const tdResult = document.createElement('td');
        tdResult.className = 'dml-result-cell';
        if (!res) {
            tdResult.textContent = '—';
        } else if (res.success) {
            tdResult.className += ' dml-result-ok';
            tdResult.textContent = `✓ ${res.id || ''}`;
        } else {
            tdResult.className += ' dml-result-err';
            const msg = (res.errors || []).map(e => e.message || e.statusCode || '').join('; ') || 'Error';
            tdResult.textContent = `✕ ${msg}`;
            tdResult.title = msg;
        }
        tr.appendChild(tdResult);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
}
