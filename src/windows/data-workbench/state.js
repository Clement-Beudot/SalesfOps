// ── Platform detection ─────────────────────────────────────────────────────

if (navigator.userAgent.includes('Macintosh') || navigator.platform.toUpperCase().includes('MAC')) {
    document.body.classList.add('platform-mac');
}

// ── Shared state ───────────────────────────────────────────────────────────

const WORKBENCH_VERSION = '0.3.0';

var tableCounter = 0;
var tables = [];
var colorRules = []; // [{ id, tableId, condition: 'has_records'|'no_records', color }]
var orgsLoaded = false;
var orgsLoading = false;
var orgsData = null;
var currentOp = 'enrich';
var editingTableEntry = null;
var soqlEditingEntry = null;
var pasteEditingEntry = null;

// ── DWLogic bridge ─────────────────────────────────────────────────────────

var { evalCondition, evaluateLogicExpression, applyRowFilter,
      computeFromRecipe: _computeFromRecipe,
      tableRef, renameSoqlRefs,
      renameColumnInSoql, renameColumnInRecipe,
      parseTsv, parseCsv,
      genColId, formulaToIds, reconcileSourceColumns: _reconcileSourceColumns,
      migrateModelV1toV2, recipeReferencesId, computeColumnDiff,
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
var resultConfig    = document.getElementById('result-config');
var btnCreateResult = document.getElementById('btn-create-result');
var resultError     = document.getElementById('result-error');
var resultDescription = document.getElementById('result-description');
var btnSchema       = document.getElementById('btn-schema');
var btnSaveModel    = document.getElementById('btn-save-model');
var btnLoadModel    = document.getElementById('btn-load-model');
var schemaOverlay   = document.getElementById('schema-overlay');
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

document.getElementById('schema-preview-delete').addEventListener('click', () => {
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


function resolveTableRefs(query) {
    const pattern = /:([A-Za-z]\w*\.\w+)\.(\w+|\[[^\]]+\])/g;
    let resolved = query;
    const errors = [];
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
        const inList = values.map(v => `'${v.replace(/'/g, "\\'")}'`).join(', ');
        resolved = resolved.split(placeholder).join(`(${inList})`);
    }
    return { resolved, errors };
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
    const visible = tables.filter(t => !excluded.has(t.id));
    if (visible.length === 0) { hintEl.classList.remove('visible'); return; }

    hintEl.appendChild(document.createTextNode('Available: '));

    visible.forEach((t, i) => {
        if (i > 0) {
            const sep = document.createElement('span');
            sep.innerHTML = ' &nbsp;·&nbsp; ';
            hintEl.appendChild(sep);
        }

        const pal = BINDING_PALETTE[i % BINDING_PALETTE.length];
        const group = document.createElement('span');
        group.className = 'binding-group';
        group.style.setProperty('--gc', pal.c);
        group.style.setProperty('--gb', pal.b);
        group.style.setProperty('--gh', pal.h);
        group.style.setProperty('--gfl', pal.fl);

        const refCode = document.createElement('code');
        refCode.textContent = `:${t.ref}`;
        group.appendChild(refCode);
        group.appendChild(document.createTextNode(' ('));

        t.columns.forEach((col, ci) => {
            if (ci > 0) group.appendChild(document.createTextNode(', '));
            const tok = /^[A-Za-z_]\w*$/.test(col) ? col : `[${col}]`;
            const colCode = document.createElement('code');
            colCode.className = 'binding-col';
            colCode.textContent = `.${tok}`;
            colCode.title = `Insert :${t.ref}.${tok}`;
            colCode.addEventListener('click', () => {
                insertAtCursor(targetTextarea, `:${t.ref}.${tok}`);
                colCode.classList.remove('binding-flash');
                void colCode.offsetWidth;
                colCode.classList.add('binding-flash');
            });
            group.appendChild(colCode);
        });

        group.appendChild(document.createTextNode(')'));
        hintEl.appendChild(group);
    });

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
    if (recipe.op === 'transform' || recipe.op === 'split') return [recipe.sourceId];
    return [recipe.leftId, recipe.rightId].filter(Boolean);
}

/**
 * Reconcile a source table's columnDefs after a data refresh.
 * Matches incoming raw column names to existing defs by `origin`, preserving IDs.
 * Deduplicates raw column names before reconciling (e.g. two "Name" → "Name", "Name_1").
 * Returns the array of column IDs that were removed (for broken-reference detection).
 */
function applyColumnRenames(tableEntry, newRawColumns) {
    // Use provided raw columns or fall back to current columns array
    let raw = newRawColumns || tableEntry.columns;

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

function tableToCsv(columns, rows) {
    const escape = v => {
        const s = v == null ? '' : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [columns, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
}

function tableToTsv(columns, rows) {
    const escape = v => {
        const s = v == null ? '' : String(v);
        return s.includes('\t') || s.includes('\n') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [columns, ...rows].map(row => row.map(escape).join('\t')).join('\r\n');
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
    const pasteColDiff = document.getElementById('paste-col-diff');
    if (pasteColDiff) { pasteColDiff.classList.add('hidden'); pasteColDiff.innerHTML = ''; }
}
