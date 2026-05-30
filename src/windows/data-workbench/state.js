// ── Platform detection ─────────────────────────────────────────────────────

if (navigator.userAgent.includes('Macintosh') || navigator.platform.toUpperCase().includes('MAC')) {
    document.body.classList.add('platform-mac');
}

// ── Shared state ───────────────────────────────────────────────────────────

const WORKBENCH_VERSION = '0.1.12';

var tableCounter = 0;
var tables = [];
var colorRules = []; // [{ id, tableId, condition: 'has_records'|'no_records', color }]
var maps = [];       // [{ id, name, entries: [{ key, value }] }]
var orgsLoaded = false;
var orgsLoading = false;
var orgsData = null;
var currentOp = 'enrich';
var editingTableEntry = null;
var soqlEditingEntry = null;
var pasteEditingEntry = null;
var workbenchSoqlEnabled = true;
var workbenchDmlEnabled = true;
var pasteEditingLargeParsed = null;

const LARGE_TABLE_THRESHOLD = 10_000;

// ── DWLogic bridge ─────────────────────────────────────────────────────────

var { evalCondition, evaluateLogicExpression, applyRowFilter,
      computeFromRecipe: _computeFromRecipe,
      tableRef, renameSoqlRefs,
      renameColumnInSoql, renameColumnInRecipe,
      parseTsv, parseCsv,
      genColId, formulaToIds, reconcileSourceColumns: _reconcileSourceColumns,
      recipeReferencesId, computeColumnDiff,
      evalColorRule } = window.DWLogic;

function computeFromRecipe(recipe) { return _computeFromRecipe(recipe, tables); }

// ── DOM refs ───────────────────────────────────────────────────────────────

var btnAdd          = document.getElementById('btn-add');
var addPanel        = document.getElementById('add-panel');
var content         = document.getElementById('content');
var emptyState      = document.getElementById('empty-state');
var modeTabs        = document.querySelectorAll('.mode-tab');
var viewPaste       = document.getElementById('view-paste');
var viewSoql        = document.getElementById('view-soql');
var pasteInput          = document.getElementById('paste-input');
var pasteDescription    = document.getElementById('paste-description');
var btnImport           = document.getElementById('btn-import');
var pasteError          = document.getElementById('paste-error');
var pasteFileInput      = document.getElementById('paste-file-input');
var pasteEditFile       = document.getElementById('paste-edit-file');
var pasteEditDropZone   = document.getElementById('paste-edit-drop-zone');
var pasteEditFileInfo   = document.getElementById('paste-edit-file-info');
var pasteEditFileName   = document.getElementById('paste-edit-file-name');
var pasteEditFileMeta   = document.getElementById('paste-edit-file-meta');
var pasteEditFileClear  = document.getElementById('paste-edit-file-clear');
var pasteEditDivider    = document.getElementById('paste-edit-divider');
var pasteLargeNotice    = document.getElementById('paste-large-notice');
var pasteLargeStat      = document.getElementById('paste-large-stat');
var pasteLargeDownload  = document.getElementById('paste-large-download');
var viewFile         = document.getElementById('view-file');
var fileInput        = document.getElementById('file-input');
var fileDropZone     = document.getElementById('file-drop-zone');
var fileInfo         = document.getElementById('file-info');
var fileInfoName     = document.getElementById('file-info-name');
var fileInfoMeta     = document.getElementById('file-info-meta');
var fileInfoClear    = document.getElementById('file-info-clear');
var fileDescription  = document.getElementById('file-description');
var fileError        = document.getElementById('file-error');
var btnImportFile    = document.getElementById('btn-import-file');
var soqlInput        = document.getElementById('soql-input');
var soqlDescription  = document.getElementById('soql-description');
var orgSelect       = document.getElementById('org-select');
var btnRefreshOrgs  = document.getElementById('btn-refresh-orgs');
var btnRunQuery     = document.getElementById('btn-run-query');
var soqlError       = document.getElementById('soql-error');
var bindingsHint    = document.getElementById('bindings-hint');
var btnResult       = document.getElementById('btn-result');
var resultPanel     = document.getElementById('result-panel');
var btnDml          = document.getElementById('btn-dml');
var dmlPanel        = document.getElementById('dml-panel');
var resultConfig    = document.getElementById('result-config');
var btnCreateResult = document.getElementById('btn-create-result');
var resultError     = document.getElementById('result-error');
var resultDescription = document.getElementById('result-description');
var btnSaveModel     = document.getElementById('btn-save-model');
var btnSnapshotModel = document.getElementById('btn-save-snapshot');
var btnLoadModel     = document.getElementById('btn-load-model');
var modelFilenameEl  = document.getElementById('model-filename');
var schemaBarTitle   = document.getElementById('schema-bar-title');
var schemaOverlay   = document.getElementById('schema-overlay');

// ── Schema-level metadata ──────────────────────────────────────────────────
var schemaName        = '';
var schemaDescription = '';
var schemaCreatedAt   = null;
var schemaCanvas    = document.getElementById('schema-canvas');
var schemaTooltip   = document.getElementById('schema-tooltip');
var schemaPreview        = document.getElementById('schema-preview');
var schemaPreviewTitle   = document.getElementById('schema-preview-title');
var schemaPreviewBadge   = document.getElementById('schema-preview-badge');
var schemaPreviewMeta    = document.getElementById('schema-preview-meta');
var schemaPreviewBody    = document.getElementById('schema-preview-body');
var schemaPreviewDesc    = document.getElementById('schema-preview-desc');
var schemaPreviewRenames = document.getElementById('schema-preview-renames');
var schemaPreviewError   = document.getElementById('schema-preview-error');

document.getElementById('schema-preview-close').addEventListener('click', () => schemaPreview.classList.add('hidden'));

const schemaPreviewDeleteBtn = document.getElementById('schema-preview-delete');
let _deleteConfirmTimer = null;

function resetDeleteConfirm() {
    clearTimeout(_deleteConfirmTimer);
    schemaPreviewDeleteBtn.classList.remove('confirm');
    schemaPreviewDeleteBtn.textContent = '🗑';
    schemaPreviewDeleteBtn.title = 'Delete this table';
}

schemaPreviewDeleteBtn.addEventListener('click', () => {
    if (!schemaPreviewDeleteBtn.classList.contains('confirm')) {
        schemaPreviewDeleteBtn.classList.add('confirm');
        schemaPreviewDeleteBtn.textContent = 'Delete?';
        schemaPreviewDeleteBtn.title = 'Click again to confirm';
        _deleteConfirmTimer = setTimeout(resetDeleteConfirm, 3000);
        return;
    }
    resetDeleteConfirm();
    const t = tables.find(u => u.id === schemaPreview.dataset.tableId);
    if (!t) return;
    const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
    schemaPreviewError.classList.remove('visible');
    const deleted = deleteTableSafe(t, card, schemaPreviewError);
    if (deleted) schemaPreview.classList.add('hidden');
});

// ── Utilities ──────────────────────────────────────────────────────────────

function isOrgConnected(org) {
    const s = (org.connectedStatus || '').toLowerCase();
    return s === 'connected' || s === 'active';
}


const SOQL_BATCH_SIZE = 200;

function resolveTableRefs(query) {
    const pattern = /:([A-Za-z]\w*\.\w+)\.(\w+|\[[^\]]+\])/g;
    let resolved = query;
    const errors = [];
    let largeRef = null;   // { placeholder, values } for the one large IN list
    let multiLarge = false; // true if 2+ large refs found — no batching

    for (const match of [...query.matchAll(pattern)]) {
        const [placeholder, refName, rawColName] = match;
        const columnName = rawColName.startsWith('[') ? rawColName.slice(1, -1) : rawColName;
        const table = tables.find(t => t.ref === refName);
        if (!table) {
            const available = tables.length ? tables.map(t => ':' + t.ref).join(', ') : 'none';
            errors.push(`Unknown reference ":${refName}" — available: ${available}`);
            continue;
        }
        let colIndex = table.columns.findIndex(c => c === columnName);

        // Fallback: binding may use the original source name (pre-rename).
        // Auto-heal by resolving through columnDefs.origin and rewriting the binding.
        if (colIndex === -1 && table.columnDefs) {
            const defIdx = table.columnDefs.findIndex(d => d.origin === columnName);
            if (defIdx >= 0) {
                colIndex = defIdx;
                const currentName = table.columnDefs[defIdx].name;
                const currentTok  = /^[A-Za-z_]\w*$/.test(currentName) ? currentName : `[${currentName}]`;
                const fixedPlaceholder = `:${refName}.${currentTok}`;
                // Rewrite the query in memory so it resolves cleanly next time
                resolved = resolved.split(placeholder).join(fixedPlaceholder);
            }
        }

        if (colIndex === -1) {
            errors.push(`Column "${columnName}" not found in :${refName} — available: ${table.columns.join(', ')}`);
            continue;
        }
        const values = [...new Set(table.rows.map(r => r[colIndex]).filter(v => v && v !== ''))];
        if (values.length === 0) { errors.push(`Column "${columnName}" in :${refName} has no non-empty values`); continue; }

        if (values.length > SOQL_BATCH_SIZE && !multiLarge) {
            if (!largeRef) {
                // First large ref — defer replacement, save for batching
                largeRef = { placeholder, values };
            } else {
                // Second large ref — cancel batching, replace both with full lists
                multiLarge = true;
                const firstInList = largeRef.values.map(v => `'${v.replace(/'/g, "\\'")}'`).join(', ');
                resolved = resolved.split(largeRef.placeholder).join(`(${firstInList})`);
                largeRef = null;
                const inList = values.map(v => `'${v.replace(/'/g, "\\'")}'`).join(', ');
                resolved = resolved.split(placeholder).join(`(${inList})`);
            }
        } else {
            const inList = values.map(v => `'${v.replace(/'/g, "\\'")}'`).join(', ');
            resolved = resolved.split(placeholder).join(`(${inList})`);
        }
    }
    // Map bindings: [MapName].keys or [MapName].values → IN list
    // Applied to resolved, which may still contain the deferred largeRef placeholder.
    const mapPattern = /\[([^\]]+)\]\.(keys|values)/g;
    for (const match of [...resolved.matchAll(mapPattern)]) {
        const [placeholder, mapName, accessor] = match;
        const map = (typeof maps !== 'undefined' ? maps : []).find(m => m.name === mapName);
        if (!map) {
            const available = (typeof maps !== 'undefined' && maps.length)
                ? maps.map(m => `[${m.name}]`).join(', ') : 'none';
            errors.push(`Unknown map "[${mapName}]" — available: ${available}`);
            continue;
        }
        const items = accessor === 'keys'
            ? map.entries.map(e => e.key)
            : map.entries.map(e => e.value);
        const unique = [...new Set(items.filter(v => v !== null && v !== undefined && v !== ''))];
        if (unique.length === 0) {
            errors.push(`Map "[${mapName}].${accessor}" has no non-empty values`);
            continue;
        }
        const inList = unique.map(v => `'${String(v).replace(/'/g, "\\'")}'`).join(', ');
        resolved = resolved.split(placeholder).join(`(${inList})`);
    }

    // Generate batch queries if exactly one large ref was found
    let batches = null;
    if (largeRef) {
        const chunks = [];
        for (let i = 0; i < largeRef.values.length; i += SOQL_BATCH_SIZE) {
            chunks.push(largeRef.values.slice(i, i + SOQL_BATCH_SIZE));
        }
        batches = chunks.map(chunk => {
            const inList = chunk.map(v => `'${v.replace(/'/g, "\\'")}'`).join(', ');
            return resolved.split(largeRef.placeholder).join(`(${inList})`);
        });
        // resolved gets the full list for callers that don't handle batching (refresh flows)
        const fullList = largeRef.values.map(v => `'${v.replace(/'/g, "\\'")}'`).join(', ');
        resolved = resolved.split(largeRef.placeholder).join(`(${fullList})`);
    }

    return { resolved, errors, batches };
}

// Runs a SOQL query with automatic IN-list batching when needed.
// onProgress(current, total) is called before each batch API call (optional).
// Returns { columns, rows, totalSize, instanceUrl } or { error }.
async function runSoqlWithBatching(rawQuery, orgIdentifier, onProgress) {
    const { resolved, errors, batches } = resolveTableRefs(rawQuery);
    if (errors.length > 0) return { error: errors.join('\n') };

    if (!batches || batches.length <= 1) {
        return window.electronAPI.runDataWorkbenchSoql({ query: resolved, orgIdentifier });
    }

    const allRows = [];
    let columns = null, instanceUrl = '', totalSize = 0;
    for (let i = 0; i < batches.length; i++) {
        if (onProgress) onProgress(i + 1, batches.length);
        const r = await window.electronAPI.runDataWorkbenchSoql({ query: batches[i], orgIdentifier });
        if (r.error) return { error: r.error };
        if (!columns) { columns = r.columns; instanceUrl = r.instanceUrl || ''; }
        allRows.push(...r.rows);
        totalSize += r.totalSize;
    }
    return { columns, rows: allRows, totalSize, instanceUrl };
}

function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
}

function getTransitiveDependents(id) {
    const result = new Set();
    function visit(tid) {
        tables.forEach(t => {
            if (result.has(t.id) || t.id === tid) return;
            const recipeDep = t.recipe && getDependencies(t.recipe).includes(tid);
            const soqlDep = t.source === 'soql' && t.soqlQuery &&
                [...t.soqlQuery.matchAll(/:([A-Za-z]\w*\.\w+)\.(?:\w+|\[[^\]]+\])/g)]
                    .some(m => { const src = tables.find(u => u.id === tid); return src && src.ref === m[1]; });
            if (recipeDep || soqlDep) { result.add(t.id); visit(t.id); }
        });
    }
    visit(id);
    return result;
}

const BINDING_PALETTE = [
    { c: '#c084fc', b: '#2a1a3a', h: '#3d1f5a', fl: '#7c3aed' }, // purple
    { c: '#67e8f9', b: '#0c2530', h: '#1a3a47', fl: '#0891b2' }, // cyan
    { c: '#86efac', b: '#0f2a1a', h: '#1a3d28', fl: '#16a34a' }, // green
    { c: '#fcd34d', b: '#251f00', h: '#3a2e00', fl: '#d97706' }, // amber
    { c: '#f9a8d4', b: '#2a0f1c', h: '#3d1a2c', fl: '#db2777' }, // pink
    { c: '#93c5fd', b: '#0f1e35', h: '#1a2e50', fl: '#2563eb' }, // blue
    { c: '#fdba74', b: '#2a1500', h: '#3d2000', fl: '#ea580c' }, // orange
    { c: '#bef264', b: '#192000', h: '#263000', fl: '#65a30d' }, // lime
];

function renderBindingsHint(hintEl, targetTextarea, currentTableId = null) {
    hintEl.innerHTML = '';
    const excluded = currentTableId
        ? new Set([currentTableId, ...getTransitiveDependents(currentTableId)])
        : new Set();
    const visible = tables.filter(t => !excluded.has(t.id) && t.source !== 'dml');
    const visibleMaps = (typeof maps !== 'undefined') ? maps : [];
    if (visible.length === 0 && visibleMaps.length === 0) { hintEl.classList.remove('visible'); return; }

    function makeToggle(refEl, colsWrap, collapseLabel, expandLabel) {
        refEl.addEventListener('click', () => {
            const expanding = colsWrap.classList.contains('hidden');
            colsWrap.classList.toggle('hidden', !expanding);
            refEl.textContent = expanding ? expandLabel : collapseLabel;
        });
    }

    // ── Table bindings ──
    if (visible.length > 0) {
        const tablesRow = document.createElement('span');
        tablesRow.className = 'binding-tables-row';
        tablesRow.appendChild(document.createTextNode('Available: '));

        visible.forEach((t, i) => {
            if (i > 0) {
                const sep = document.createElement('span');
                sep.innerHTML = ' &nbsp;·&nbsp; ';
                tablesRow.appendChild(sep);
            }

            const pal = BINDING_PALETTE[i % BINDING_PALETTE.length];
            const group = document.createElement('span');
            group.className = 'binding-group';
            group.style.setProperty('--gc', pal.c);
            group.style.setProperty('--gb', pal.b);
            group.style.setProperty('--gh', pal.h);
            group.style.setProperty('--gfl', pal.fl);

            const refCode = document.createElement('code');
            refCode.className = 'binding-ref';
            refCode.textContent = `:${t.ref} ▸`;
            refCode.title = `Show fields for :${t.ref}`;

            const colsWrap = document.createElement('span');
            colsWrap.className = 'binding-cols hidden';
            colsWrap.appendChild(document.createTextNode(' ('));
            t.columns.forEach((col, ci) => {
                if (ci > 0) colsWrap.appendChild(document.createTextNode(', '));
                const tok = /^[A-Za-z_]\w*$/.test(col) ? col : `[${col}]`;
                const colCode = document.createElement('code');
                colCode.className = 'binding-col';
                colCode.textContent = `.${tok}`;
                colCode.title = `Insert :${t.ref}.${tok}`;
                colCode.addEventListener('click', (e) => {
                    e.stopPropagation();
                    insertAtCursor(targetTextarea, `:${t.ref}.${tok}`);
                    colCode.classList.remove('binding-flash');
                    void colCode.offsetWidth;
                    colCode.classList.add('binding-flash');
                });
                colsWrap.appendChild(colCode);
            });
            colsWrap.appendChild(document.createTextNode(')'));

            makeToggle(refCode, colsWrap, `:${t.ref} ▾`, `:${t.ref} ▸`);

            group.appendChild(refCode);
            group.appendChild(colsWrap);
            tablesRow.appendChild(group);
        });
        hintEl.appendChild(tablesRow);
    }

    // ── Map bindings ──
    if (visibleMaps.length > 0) {
        const mapsRow = document.createElement('span');
        mapsRow.className = 'binding-maps-row';
        mapsRow.appendChild(document.createTextNode('Maps: '));

        visibleMaps.forEach((m, i) => {
            if (i > 0) {
                const sep = document.createElement('span');
                sep.innerHTML = ' &nbsp;·&nbsp; ';
                mapsRow.appendChild(sep);
            }

            const group = document.createElement('span');
            group.className = 'binding-map-group';

            const nameCode = document.createElement('code');
            nameCode.className = 'binding-map-name binding-ref';
            nameCode.textContent = `[${m.name}] ▸`;
            nameCode.title = `Show bindings for [${m.name}]`;

            const colsWrap = document.createElement('span');
            colsWrap.className = 'binding-cols hidden';
            colsWrap.appendChild(document.createTextNode(' ('));
            ['keys', 'values'].forEach((accessor, ai) => {
                if (ai > 0) colsWrap.appendChild(document.createTextNode(', '));
                const link = document.createElement('code');
                link.className = 'binding-col binding-map-col';
                link.textContent = `.${accessor}`;
                link.title = `Insert [${m.name}].${accessor}`;
                link.addEventListener('click', (e) => {
                    e.stopPropagation();
                    insertAtCursor(targetTextarea, `[${m.name}].${accessor}`);
                    link.classList.remove('binding-flash');
                    void link.offsetWidth;
                    link.classList.add('binding-flash');
                });
                colsWrap.appendChild(link);
            });
            colsWrap.appendChild(document.createTextNode(')'));

            makeToggle(nameCode, colsWrap, `[${m.name}] ▾`, `[${m.name}] ▸`);

            group.appendChild(nameCode);
            group.appendChild(colsWrap);
            mapsRow.appendChild(group);
        });
        hintEl.appendChild(mapsRow);
    }

    hintEl.classList.add('visible');
}

function updateBindingsHint() {
    renderBindingsHint(bindingsHint, soqlInput);
    document.querySelectorAll('.card-edit-area.open .card-bindings-hint').forEach(hintEl => {
        const textarea = hintEl.closest('.card-edit-area')?.querySelector('.add-textarea');
        const tableId = hintEl.closest('.table-card')?.dataset.tableId;
        if (textarea) renderBindingsHint(hintEl, textarea, tableId || null);
    });
}

function getDependencies(recipe) {
    if (!recipe) return [];
    if (recipe.op === 'transform' || recipe.op === 'split' || recipe.op === 'group') return [recipe.sourceId];
    return [recipe.leftId, recipe.rightId].filter(Boolean);
}

/**
 * Reconcile a source table's columnDefs after a data refresh.
 * Matches incoming raw column names to existing defs by `origin`, preserving IDs.
 * Deduplicates raw column names before reconciling (e.g. two "Name" → "Name", "Name_1").
 * Returns the array of column IDs that were removed (for broken-reference detection).
 */
function applyColumnRenames(tableEntry, newRawColumns) {
    // Use provided raw columns, but if empty or absent preserve the existing schema.
    // An empty result (0 rows) carries no column info — don't wipe the existing columns.
    let raw = (newRawColumns && newRawColumns.length > 0) ? newRawColumns : tableEntry.columns;

    // Deduplicate raw names
    const seen = new Map();
    raw = raw.map(c => {
        const n = seen.get(c) ?? 0;
        seen.set(c, n + 1);
        return n === 0 ? c : `${c}_${n}`;
    });

    if (!tableEntry.columnDefs) {
        // First call on a v1 table — bootstrap columnDefs from columnRenames
        const renames = tableEntry.columnRenames || {};
        const displayToOrigin = Object.fromEntries(Object.entries(renames).map(([o, d]) => [d, o]));
        tableEntry.columnDefs = raw.map(name => ({
            id:     genColId(),
            name:   renames[name] || name,  // apply rename if raw name has one
            origin: name
        }));
        tableEntry.columns = tableEntry.columnDefs.map(d => d.name);
        return [];
    }

    return _reconcileSourceColumns(tableEntry, raw);
}

/**
 * After computeFromRecipe, re-apply any column names the user explicitly renamed
 * in a result table (marked with explicit:true). Source-propagated names (no flag)
 * are not preserved so that upstream renames still flow through normally.
 */
function preserveResultRenames(existingDefs, newDefs) {
    if (!existingDefs || existingDefs.length === 0) return newDefs;
    const byId = new Map(existingDefs.map(d => [d.id, d]));
    return newDefs.map(d => {
        const old = byId.get(d.id);
        return (old && old.explicit) ? { ...d, name: old.name, explicit: true } : d;
    });
}

/**
 * After a source refresh removes column IDs, walk downstream result tables and
 * flag any that directly reference a removed ID. The broken-ref banner is shown
 * on the card and the broken state is cleared when the card is re-computed.
 */
function markBrokenReferences(changedTableId, removedIds) {
    if (!removedIds || removedIds.length === 0) return;
    const idSet = new Set(removedIds);
    const seen = new Set();
    function visit(tid) {
        tables.forEach(t => {
            if (t.source !== 'result' || seen.has(t.id)) return;
            const deps = getDependencies(t.recipe);
            if (!deps.includes(tid)) return;
            seen.add(t.id);
            if (recipeReferencesId(t.recipe, idSet)) {
                t.brokenRef = true;
                const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
                card?.querySelector('.broken-banner')?.classList.add('visible');
            }
            visit(t.id);
        });
    }
    visit(changedTableId);
}

function markDependentsStale(changedId) {
    const seen = new Set();
    function visit(id) {
        tables.forEach(t => {
            if (t.recipe && getDependencies(t.recipe).includes(id) && !seen.has(t.id)) {
                seen.add(t.id);
                t.stale = true;
                const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
                if (card) {
                    card.querySelector('.stale-banner')?.classList.add('visible');
                    card.querySelectorAll('.btn-edit').forEach(b => { if (b.textContent === '↻') b.classList.add('stale'); });
                }
                document.querySelector(`[data-refresh-for="${t.id}"]`)?.setAttribute('fill', '#fbbf24');
                visit(t.id);
            }
        });
    }
    visit(changedId);
}


function showError(el, msg) {
    el.textContent = msg;
    el.classList.add('visible');
}

function clearErrors() {
    [pasteError, soqlError, fileError].forEach(el => { el.textContent = ''; el.classList.remove('visible'); });
}

function closePanel() {
    addPanel.classList.remove('open');
    btnAdd.classList.remove('active-toggle');
    btnAdd.textContent = '+ Add Table';
    soqlEditingEntry = null;
    pasteEditingEntry = null;
    btnRunQuery.textContent = 'Run Query';
    btnImport.textContent = 'Import Table';
    soqlInput.value = '';
    soqlDescription.value = '';
    pasteInput.value = '';
    pasteDescription.value = '';
    fileDescription.value = '';
    fileError.textContent = '';
    fileError.classList.remove('visible');
    fileInfo.classList.add('hidden');
    fileDropZone.classList.remove('hidden');
    btnImportFile.disabled = true;
    btnImportFile.textContent = 'Import Table';
    pasteEditFile.classList.add('hidden');
    pasteEditFileInfo.classList.add('hidden');
    pasteEditDropZone.classList.remove('hidden');
    pasteEditingLargeParsed = null;
    pasteInput.style.display = '';
    btnImport.disabled = false;
    pasteLargeNotice.classList.add('hidden');
    pasteEditDivider.style.display = '';
    const pasteColDiff = document.getElementById('paste-col-diff');
    if (pasteColDiff) { pasteColDiff.classList.add('hidden'); pasteColDiff.innerHTML = ''; }
}
