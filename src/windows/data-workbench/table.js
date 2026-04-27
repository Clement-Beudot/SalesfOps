function propagateRefRename(oldRef, newRef) {
    tables.forEach(t => {
        if (!t.soqlQuery) return;
        const updated = renameSoqlRefs(t.soqlQuery, oldRef, newRef);
        if (updated === t.soqlQuery) return;
        t.soqlQuery = updated;
        // Refresh textarea if the edit panel for this card is currently open
        const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
        const textarea = card?.querySelector('.card-edit-area .add-textarea');
        if (textarea) textarea.value = updated;
    });
}

/**
 * Rewrite every SOQL binding that references a renamed column in tableEntry.
 * Handles two cases:
 *   1. Binding used the previous display name (standard rename propagation)
 *   2. Binding used the origin name (Salesforce field) — e.g. typed before any rename ran
 *
 * Called after a column rename and after every source refresh, so stale bindings
 * (written before renames were applied) are healed automatically.
 */
function healSoqlBindingsForTable(tableEntry) {
    const defs = tableEntry.columnDefs;
    if (!defs) return;

    tables.forEach(t => {
        if (!t.soqlQuery) return;
        let updated = t.soqlQuery;
        for (const def of defs) {
            if (!def.origin || def.origin === def.name) continue;
            // Replace any binding that still uses the origin name instead of the display name
            updated = renameColumnInSoql(updated, tableEntry.ref, def.origin, def.name);
        }
        if (updated === t.soqlQuery) return;
        t.soqlQuery = updated;
        const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
        const textarea = card?.querySelector('.card-edit-area .add-textarea');
        if (textarea) textarea.value = t.soqlQuery;
    });
}

/**
 * After a column is renamed in tableEntry, propagate the change to:
 *   - SOQL queries referencing :tableEntry.ref.oldColName  (display name)
 *   - SOQL queries referencing :tableEntry.ref.originName  (Salesforce origin, if different)
 * Recipes no longer need updating — they reference column IDs (v2).
 * Then marks dependent results stale.
 */
function propagateColumnRename(tableEntry, oldColName, newColName) {
    tables.forEach(t => {
        if (!t.soqlQuery) return;
        // Replace display-name-based binding
        let updated = renameColumnInSoql(t.soqlQuery, tableEntry.ref, oldColName, newColName);
        if (updated === t.soqlQuery) return;
        t.soqlQuery = updated;
        const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
        const textarea = card?.querySelector('.card-edit-area .add-textarea');
        if (textarea) textarea.value = t.soqlQuery;
    });

    // Heal any remaining origin-based bindings for this table
    healSoqlBindingsForTable(tableEntry);

    markDependentsStale(tableEntry.id);
    updateBindingsHint();
}

/**
 * Replace a <th> with an inline input to rename a column.
 * Validates uniqueness within the same table before committing.
 */
function startColumnRename(th, tableEntry, colIndex) {
    const oldName = tableEntry.columns[colIndex];
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'col-rename-input';
    input.value = oldName;
    th.textContent = '';
    th.title = '';
    th.appendChild(input);
    input.focus();
    input.select();

    function revert() {
        if (!input.parentNode) return;
        th.innerHTML = '';
        th.textContent = oldName;
        th.title = 'Double-click to rename';
    }

    function commit() {
        if (!input.parentNode) return;
        const newName = input.value.trim();
        if (!newName || newName === oldName) { revert(); return; }
        if (tableEntry.columns.some((c, i) => i !== colIndex && c === newName)) {
            input.classList.add('name-conflict');
            input.title = 'This column name already exists in this table';
            input.select();
            return;
        }
        tableEntry.columns[colIndex] = newName;
        // Update the columnDef name in v2
        if (tableEntry.columnDefs?.[colIndex]) {
            tableEntry.columnDefs[colIndex].name = newName;
        }
        th.innerHTML = '';
        th.textContent = newName;
        th.title = 'Double-click to rename';
        propagateColumnRename(tableEntry, oldName, newName);
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); revert(); }
    });
    input.addEventListener('input', () => input.classList.remove('name-conflict'));
}

/**
 * Replace the card title with an inline input for renaming.
 * Validates that the resulting ref is unique before committing.
 */
function startRename(titleEl, refChipEl, tableEntry) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'card-title-input';
    input.value = tableEntry.name;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    function revert() {
        if (input.parentNode) input.replaceWith(titleEl);
    }

    // commit() is always triggered through blur so it fires exactly once.
    // Calling input.blur() for Enter ensures the same code path is used
    // regardless of how the user confirms the rename, and avoids any
    // double-fire that would capture the wrong oldRef.
    function commit() {
        if (!input.parentNode) return; // already committed or reverted
        const newName = input.value.trim();
        if (!newName) { revert(); return; }
        const newRef = tableRef(tableEntry.source, newName);
        if (tables.some(t => t.id !== tableEntry.id && t.ref === newRef)) {
            input.classList.add('name-conflict');
            input.title = 'This name is already used by another table';
            input.select();
            return;
        }
        const oldRef    = tableEntry.ref; // capture before overwrite
        tableEntry.name = newName;
        tableEntry.ref  = newRef;
        titleEl.textContent = newName;
        titleEl.title = 'Double-click to rename';
        refChipEl.textContent = `:${newRef}`;
        refChipEl.title = `Reference in SOQL: :${newRef}.ColumnName`;
        input.replaceWith(titleEl);
        propagateRefRename(oldRef, newRef);
        updateBindingsHint();
        if (!schemaOverlay.classList.contains('hidden')) renderSchema();
        if (typeof renderColorRulesList === 'function') renderColorRulesList();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); input.blur(); } // go through blur path
        if (e.key === 'Escape') { e.preventDefault(); revert(); }
    });
    input.addEventListener('input', () => input.classList.remove('name-conflict'));
}

function buildExportButtons(tableEntry) {
    const btnCsv = document.createElement('button');
    btnCsv.className = 'btn-action';
    btnCsv.textContent = 'CSV';
    btnCsv.title = 'Copy table as CSV';
    btnCsv.addEventListener('click', () => {
        const csv = tableToCsv(tableEntry.columns, tableEntry.rows);
        window.electronAPI.copyToClipboard(csv).then(() => {
            btnCsv.textContent = '✓';
            setTimeout(() => { btnCsv.textContent = 'CSV'; }, 1500);
        });
    });

    const btnSheet = document.createElement('button');
    btnSheet.className = 'btn-action';
    btnSheet.textContent = 'Sheet';
    btnSheet.title = 'Copy as tab-separated — paste directly into Google Sheets or Excel';
    btnSheet.addEventListener('click', () => {
        const tsv = tableToTsv(tableEntry.columns, tableEntry.rows);
        window.electronAPI.copyToClipboard(tsv).then(() => {
            btnSheet.textContent = '✓';
            setTimeout(() => { btnSheet.textContent = 'Sheet'; }, 1500);
        });
    });

    const btnDownload = document.createElement('button');
    btnDownload.className = 'btn-action';
    btnDownload.textContent = '↓ CSV';
    btnDownload.title = 'Download as CSV file';
    btnDownload.addEventListener('click', async () => {
        const csv = tableToCsv(tableEntry.columns, tableEntry.rows);
        const result = await window.electronAPI.downloadWorkbenchCsv({ filename: tableEntry.name, content: csv });
        if (result?.success) {
            btnDownload.textContent = '✓';
            setTimeout(() => { btnDownload.textContent = '↓ CSV'; }, 1500);
        }
    });

    return [btnCsv, btnSheet, btnDownload];
}

// Returns a dep-first topological order of tableIds to refresh in cascade.
function buildCascadeOrder(startId) {
    const allIds = new Set([startId, ...getTransitiveDependents(startId)]);
    const visited = new Set();
    const sorted  = [];

    function deps(t) {
        if (!t) return [];
        if (t.source === 'result' && t.recipe) {
            const r = t.recipe;
            return [r.sourceId, r.leftId, r.rightId].filter(Boolean);
        }
        if (t.source === 'soql' && t.soqlQuery) {
            const refs = new Set([...t.soqlQuery.matchAll(/:([A-Za-z]\w*\.\w+)\.(?:\w+|\[[^\]]+\])/g)].map(m => m[1]));
            return [...refs].map(ref => tables.find(u => u.ref === ref)?.id).filter(Boolean);
        }
        return [];
    }

    function visit(id) {
        if (visited.has(id)) return;
        visited.add(id);
        deps(tables.find(u => u.id === id)).forEach(d => { if (allIds.has(d)) visit(d); });
        sorted.push(id);
    }
    [...allIds].forEach(visit);
    return sorted;
}

async function cascadeRefresh(startId, btn, onProgress = null, onStart = null) {
    const sorted = buildCascadeOrder(startId);
    const total = sorted.length;
    const origText = btn.textContent;
    btn.disabled = true;
    btn.classList.add('spinning');

    for (let i = 0; i < sorted.length; i++) {
        const t = tables.find(u => u.id === sorted[i]);
        if (!t || t.source === 'paste') continue;
        btn.textContent = `${i + 1}/${total}`;
        if (onStart) onStart({ table: t, index: i + 1, total });
        try {
            if (t.source === 'soql') {
                if (!t.soqlQuery) continue;
                const { resolved, errors } = resolveTableRefs(t.soqlQuery);
                if (errors.length) { showToast(`${t.name}: ${errors.join(' · ')}`, 'error', 0); continue; }
                const result = await window.electronAPI.runDataWorkbenchSoql({ query: resolved, orgIdentifier: t.orgIdentifier });
                if (result.error) { showToast(`${t.name}: ${result.error}`, 'error', 0); continue; }
                t.rows = result.rows; t.totalSize = result.totalSize;
                const removed1 = applyColumnRenames(t, result.columns);
                markBrokenReferences(t.id, removed1);
            } else if (t.source === 'result' && t.recipe) {
                const result = computeFromRecipe(t.recipe);
                t.columns = result.columns; t.columnDefs = result.columnDefs; t.rows = result.rows.map(r => [...r]); t.stale = false; t.brokenRef = false;
            } else continue;

            updateBindingsHint();
            refreshTableCard(t);
            const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
            if (card) {
                card.querySelector('.stale-banner')?.classList.remove('visible');
                card.querySelector('.broken-banner')?.classList.remove('visible');
                card.querySelectorAll('.btn-edit.stale').forEach(b => b.classList.remove('stale'));
                card.classList.remove('recalc-flash');
                void card.offsetWidth;
                card.classList.add('recalc-flash');
                card.addEventListener('animationend', () => card.classList.remove('recalc-flash'), { once: true });
            }
            if (onProgress) onProgress({ table: t, index: i + 1, total });
        } catch (err) {
            console.error(`Cascade: error on "${t.name}"`, err);
            showToast(`Error rebuilding ${t.name}: ${err.message || err}`, 'error', 0);
            if (onProgress) onProgress({ table: t, index: i + 1, total });
        }
    }

    btn.classList.remove('spinning');
    btn.disabled = false;
    btn.textContent = origText;
    btn.title = 'Cascade rebuild — refresh this table then all dependents in order';
}

function addTable({ id: providedId = null, name, source, columns, columnDefs = null, rows, totalSize, subtitle, recipe = null, soqlQuery = null, orgIdentifier = null, stale = false, description = null, previewLimit = 100 }) {
    const id = providedId || `t_${Date.now()}`;
    const ref = tableRef(source, name);
    const tableEntry = { id, ref, name, source, subtitle: subtitle || null, columns: [...columns], columnDefs: columnDefs ? columnDefs.map(d => ({ ...d })) : null, rows: rows.map(r => [...r]), recipe, soqlQuery, orgIdentifier, stale, description: description || null, previewLimit };
    tables.push(tableEntry);
    updateBindingsHint();
    btnResult.style.display = '';
    btnSaveModel.style.display = '';
    if (typeof btnColorRules !== 'undefined') btnColorRules.style.display = '';
    if (btnSchema.style.display === 'none') {
        btnSchema.style.display = '';
        btnSchema.textContent = 'Switch to Schema';
    }
    emptyState.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'table-card';
    card.dataset.tableId = id;
    card.dataset.source = source;

    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';

    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = name;
    title.title = 'Double-click to rename';
    title.addEventListener('dblclick', () => startRename(title, refChip, tableEntry));

    const badge = document.createElement('span');
    badge.className = `source-badge ${source}`;
    badge.textContent = source === 'paste' ? 'Paste' : source === 'soql' ? 'SOQL' : 'Result';

    const refChip = document.createElement('span');
    refChip.className = 'ref-chip';
    refChip.textContent = `:${ref}`;
    refChip.title = `Reference this table in a SOQL query with :${ref}.ColumnName`;

    const rowCount = document.createElement('span');
    rowCount.className = 'row-count';
    const displayed = rows.length;
    const total = totalSize || displayed;
    rowCount.textContent = total > displayed ? `${displayed} / ${total} rows` : `${displayed} row${displayed !== 1 ? 's' : ''}`;

    const spacer = document.createElement('div');
    spacer.className = 'card-spacer';

    const [btnCsv, btnSheet, btnDownload] = buildExportButtons(tableEntry);

    const btnCascade = document.createElement('button');
    btnCascade.className = 'btn-edit';
    btnCascade.textContent = '⇊';
    btnCascade.title = 'Cascade rebuild — refresh this table then all dependents in order';
    btnCascade.addEventListener('click', () => {
        const toast = showToast(`Rebuilding from ${tableEntry.name}…`, 'info', 0);
        cascadeRefresh(id, btnCascade,
            ({ table, index, total }) => toast.update(`✓ ${table.name} (${index}/${total})`),
            ({ table, index, total }) => toast.update(`Rebuilding: ${table.name}… (${index}/${total})`)
        ).then(() => { toast.dismiss(); showToast(`Cascade complete (${tableEntry.name})`, 'success', 3000); });
    });

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-delete';
    btnDelete.textContent = '✕';
    btnDelete.title = 'Remove table';
    // Temporary error span anchored to the card header for the ✕ quick-delete path
    const headerErr = document.createElement('span');
    headerErr.className = 'panel-error header-delete-error';
    btnDelete.addEventListener('click', () => {
        if (!deleteTableSafe(tableEntry, card, headerErr)) {
            // Show the error briefly near the delete button
            const hdr = card.querySelector('.card-header') || card;
            if (!hdr.contains(headerErr)) hdr.appendChild(headerErr);
            clearTimeout(headerErr._hideTimer);
            headerErr._hideTimer = setTimeout(() => headerErr.classList.remove('visible'), 4000);
        }
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    renderTableBody(wrapper, tableEntry);

    const btnCollapse = document.createElement('button');
    btnCollapse.className = 'btn-collapse';
    btnCollapse.textContent = '▾';
    btnCollapse.title = 'Collapse / expand';
    btnCollapse.addEventListener('click', () => {
        const collapsed = card.classList.toggle('collapsed');
        btnCollapse.textContent = collapsed ? '▸' : '▾';
    });

    if (source === 'paste' || source === 'soql') {
        const editArea = document.createElement('div');
        editArea.className = 'card-edit-area';
        if (source === 'paste') buildPasteEditArea(editArea, tableEntry, card);
        else buildSoqlEditArea(editArea, tableEntry, card);

        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn-edit btn-edit-panel';
        btnEdit.textContent = '✎';
        btnEdit.title = source === 'paste' ? 'Replace table data' : 'Edit and re-run query';
        btnEdit.addEventListener('click', () => toggleCardEdit(editArea, btnEdit));

        if (source === 'soql') {
            const btnRerunQuick = document.createElement('button');
            btnRerunQuick.className = 'btn-edit';
            btnRerunQuick.textContent = '↻';
            btnRerunQuick.title = 'Re-run SOQL query';
            btnRerunQuick.addEventListener('click', async () => {
                if (!tableEntry.soqlQuery) return;
                const { resolved, errors } = resolveTableRefs(tableEntry.soqlQuery);
                if (errors.length > 0) { showToast(errors.join(' · '), 'error', 0); return; }
                btnRerunQuick.classList.add('spinning');
                btnRerunQuick.disabled = true;
                try {
                    const result = await window.electronAPI.runDataWorkbenchSoql({ query: resolved, orgIdentifier: tableEntry.orgIdentifier });
                    if (result.error) { showToast(result.error, 'error', 0); return; }
                    tableEntry.rows      = result.rows;
                    tableEntry.totalSize = result.totalSize;
                    const removed2 = applyColumnRenames(tableEntry, result.columns);
                    markBrokenReferences(tableEntry.id, removed2);
                    updateBindingsHint();
                    renderTableBody(wrapper, tableEntry);
                    const d = result.rows.length, tot = result.totalSize || d;
                    rowCount.textContent = tot > d ? `${d} / ${tot} rows` : `${d} row${d !== 1 ? 's' : ''}`;
                    card.classList.remove('recalc-flash');
                    void card.offsetWidth;
                    card.classList.add('recalc-flash');
                    card.addEventListener('animationend', () => card.classList.remove('recalc-flash'), { once: true });
                    markDependentsStale(tableEntry.id);
                } finally {
                    btnRerunQuick.classList.remove('spinning');
                    btnRerunQuick.disabled = false;
                }
            });
            cardHeader.append(btnCollapse, title, badge, refChip, rowCount, spacer, btnCascade, btnRerunQuick, btnEdit, btnCsv, btnSheet, btnDownload, btnDelete);
        } else {
            cardHeader.append(btnCollapse, title, badge, refChip, rowCount, spacer, btnCascade, btnEdit, btnCsv, btnSheet, btnDownload, btnDelete);
        }
        card.append(cardHeader, editArea, wrapper);
    } else {
        // Result card — stale banner sits between header and data
        const staleBanner = document.createElement('div');
        staleBanner.className = 'stale-banner';

        const staleMsg = document.createElement('span');
        staleMsg.className = 'stale-msg';
        staleMsg.textContent = '⚠ Source has changed — data may be outdated';

        const brokenBanner = document.createElement('div');
        brokenBanner.className = 'broken-banner';
        const brokenMsg = document.createElement('span');
        brokenMsg.className = 'broken-msg';
        brokenMsg.textContent = '✕ Broken reference — an upstream column was removed. Edit the recipe to fix.';
        brokenBanner.appendChild(brokenMsg);
        if (tableEntry.brokenRef) brokenBanner.classList.add('visible');

        function doRecalc() {
            const result = computeFromRecipe(tableEntry.recipe);
            tableEntry.columns    = result.columns;
            tableEntry.columnDefs = result.columnDefs;
            tableEntry.rows       = result.rows.map(r => [...r]);
            tableEntry.stale      = false;
            tableEntry.brokenRef  = false;
            btnRecalcQuick.classList.remove('stale');
            updateBindingsHint();
            renderTableBody(wrapper, tableEntry);
            rowCount.textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''}`;
            staleBanner.classList.remove('visible');
            brokenBanner.classList.remove('visible');
            card.classList.remove('recalc-flash');
            void card.offsetWidth;
            card.classList.add('recalc-flash');
            card.addEventListener('animationend', () => card.classList.remove('recalc-flash'), { once: true });
            markDependentsStale(tableEntry.id);
        }

        const btnRecalc = document.createElement('button');
        btnRecalc.className = 'btn-recalc';
        btnRecalc.textContent = '↻ Recalculate';
        btnRecalc.addEventListener('click', doRecalc);

        staleBanner.append(staleMsg, btnRecalc);
        if (stale) staleBanner.classList.add('visible');

        // Quick ↻ in header — always visible, no need to open the stale banner
        const btnRecalcQuick = document.createElement('button');
        btnRecalcQuick.className = 'btn-edit';
        if (stale) btnRecalcQuick.classList.add('stale');
        btnRecalcQuick.textContent = '↻';
        btnRecalcQuick.title = 'Recalculate result';
        btnRecalcQuick.addEventListener('click', doRecalc);

        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn-edit';
        btnEdit.textContent = '✎';
        btnEdit.title = 'Edit recipe and re-run';
        btnEdit.addEventListener('click', () => openResultPanelForEdit(tableEntry));

        cardHeader.append(btnCollapse, title, badge, refChip, rowCount, spacer, btnCascade, btnRecalcQuick, btnEdit, btnCsv, btnSheet, btnDownload, btnDelete);
        card.append(cardHeader, staleBanner, brokenBanner, wrapper);
    }

    content.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (tables.length === 1) {
        switchToSchema();
    } else if (!schemaOverlay.classList.contains('hidden')) {
        renderSchema();
    }
}

function renderTableBody(wrapper, tableEntry) {
    wrapper.innerHTML = '';
    if (tableEntry.columns.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'no-results';
        msg.textContent = 'Query returned no results.';
        wrapper.appendChild(msg);
        return;
    }

    const limit = tableEntry.previewLimit || 100;
    const visibleRows = tableEntry.rows.slice(0, limit);
    const total = tableEntry.rows.length;

    const tbl = document.createElement('table');
    tbl.className = 'data-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    tableEntry.columns.forEach((col, colIndex) => {
        const th = document.createElement('th');
        th.textContent = col;
        th.title = 'Double-click to rename';
        th.addEventListener('dblclick', () => startColumnRename(th, tableEntry, colIndex));
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    visibleRows.forEach(row => {
        const tr = document.createElement('tr');
        const paddedRow = [...row];
        while (paddedRow.length < tableEntry.columns.length) paddedRow.push('');
        paddedRow.forEach(cell => {
            const td = document.createElement('td');
            if (cell === '' || cell === null || cell === undefined) {
                td.textContent = '—';
                td.classList.add('empty-val');
            } else {
                td.textContent = cell;
                td.title = String(cell).length > 40 ? cell : '';
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    tbl.append(thead, tbody);
    wrapper.appendChild(tbl);

    if (total > limit) {
        const footer = document.createElement('div');
        footer.className = 'preview-footer';

        const info = document.createElement('span');
        info.textContent = `Showing ${limit.toLocaleString()} of ${total.toLocaleString()} rows`;

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'preview-limit-input';
        input.value = limit;
        input.min = 1;
        input.title = 'Number of rows to display (all rows are loaded for operations)';

        function applyLimit() {
            const v = parseInt(input.value, 10);
            if (!v || v < 1 || v === tableEntry.previewLimit) return;
            tableEntry.previewLimit = v;
            renderTableBody(wrapper, tableEntry);
            const mainCard = document.querySelector(`.table-card[data-table-id="${tableEntry.id}"]`);
            if (mainCard) {
                const mw = mainCard.querySelector('.table-wrapper');
                if (mw && mw !== wrapper) renderTableBody(mw, tableEntry);
            }
        }

        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyLimit(); } });
        input.addEventListener('blur', applyLimit);

        footer.append(info, input);
        wrapper.appendChild(footer);
    }
}

// ── Shared card update ─────────────────────────────

function refreshTableCard(tableEntry) {
    const card = document.querySelector(`.table-card[data-table-id="${tableEntry.id}"]`);
    if (!card) return;
    const wrapper = card.querySelector('.table-wrapper');
    if (wrapper) renderTableBody(wrapper, tableEntry);
    const rc = card.querySelector('.row-count');
    if (rc) {
        const d = tableEntry.rows.length, tot = tableEntry.totalSize || d;
        rc.textContent = tot > d ? `${d} / ${tot} rows` : `${d} row${d !== 1 ? 's' : ''}`;
    }
    const sub = card.querySelector('.table-subtitle');
    if (sub) sub.textContent = tableEntry.subtitle || '';
    updateBindingsHint();
}

// ── Edit helpers ───────────────────────────────────

// Returns an array of tables that depend on tableEntry (via recipe or SOQL binding).
function getTableReferencers(tableEntry) {
    return tables.filter(other => {
        if (other.id === tableEntry.id) return false;
        if (other.source === 'result' && other.recipe) {
            if (getDependencies(other.recipe).includes(tableEntry.id)) return true;
        }
        if (other.source === 'soql' && other.soqlQuery) {
            const refs = [...other.soqlQuery.matchAll(/:([A-Za-z]\w*\.\w+)\.(?:\w+|\[[^\]]+\])/g)].map(m => m[1]);
            if (refs.includes(tableEntry.ref)) return true;
        }
        return false;
    });
}

// Delete a table after checking for references.
// If referencers exist, displays the error in errSpan and returns false.
// Otherwise removes the table and card, returns true.
function deleteTableSafe(tableEntry, card, errSpan) {
    const referencers = getTableReferencers(tableEntry);
    if (referencers.length > 0) {
        const names = referencers.map(r => `"${r.name}"`).join(', ');
        showError(errSpan, `Cannot delete: referenced by ${names}. Remove or update those first.`);
        return false;
    }
    tables = tables.filter(t => t.id !== tableEntry.id);
    card.remove();
    updateBindingsHint();
    if (!document.querySelector('.table-card')) {
        emptyState.style.display = '';
        btnResult.style.display = 'none';
        btnSaveModel.style.display = 'none';
        btnSchema.style.display = 'none';
        if (typeof btnColorRules !== 'undefined') btnColorRules.style.display = 'none';
        switchToTables();
        resultPanel.classList.remove('open');
        btnResult.classList.remove('active-toggle');
        btnResult.textContent = '+ Add Result';
    } else if (!schemaOverlay.classList.contains('hidden')) {
        renderSchema();
    }
    return true;
}

function toggleCardEdit(editArea, btnEdit) {
    const isOpen = editArea.classList.toggle('open');
    btnEdit.classList.toggle('active', isOpen);
}

function buildPasteEditArea(editArea, tableEntry, card) {
    // ── Hidden file input ──
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.tsv,.txt';
    fileInput.style.display = 'none';

    // ── Drop zone ──
    const dropZone = document.createElement('div');
    dropZone.className = 'card-drop-zone';
    dropZone.innerHTML = `<span class="file-drop-icon">📂</span>
        <span class="file-drop-label">Drop a CSV or TSV file here</span>
        <span class="file-drop-sub">or click to browse</span>`;
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
    });

    // ── File info bar (shown after loading) ──
    const fileInfoBar = document.createElement('div');
    fileInfoBar.className = 'file-info hidden';
    const fileInfoName = document.createElement('span');
    fileInfoName.className = 'file-info-name';
    const fileInfoMeta = document.createElement('span');
    fileInfoMeta.className = 'file-info-meta';
    const fileInfoClear = document.createElement('button');
    fileInfoClear.className = 'file-info-clear';
    fileInfoClear.textContent = '✕';
    fileInfoClear.title = 'Clear loaded file';
    fileInfoClear.addEventListener('click', () => {
        fileInfoBar.classList.add('hidden');
        dropZone.classList.remove('hidden');
        textarea.value = [tableEntry.columns, ...tableEntry.rows].map(r => r.join('\t')).join('\n');
        errSpan.classList.remove('visible');
    });
    fileInfoBar.append(fileInfoName, fileInfoMeta, fileInfoClear);

    // ── Divider ──
    const divider = document.createElement('div');
    divider.className = 'card-edit-divider';
    divider.textContent = '— or edit data manually —';

    // ── Textarea ──
    const textarea = document.createElement('textarea');
    textarea.className = 'add-textarea';
    textarea.placeholder = 'Paste tab-separated data…';
    textarea.value = [tableEntry.columns, ...tableEntry.rows].map(r => r.join('\t')).join('\n');

    const errSpan = document.createElement('span');
    errSpan.className = 'panel-error';

    // ── Column diff panel ──
    const diffPanel = document.createElement('div');
    diffPanel.className = 'col-diff-panel hidden';

    function loadFile(file) {
        const reader = new FileReader();
        reader.onload = ev => {
            const text = ev.target.result;
            const isCsv = file.name.toLowerCase().endsWith('.csv');
            const parsed = isCsv ? parseCsv(text) : parseTsv(text);
            if (!parsed) { showError(errSpan, `Could not parse "${file.name}".`); return; }
            errSpan.classList.remove('visible');
            textarea.value = [parsed.columns, ...parsed.rows].map(r => r.join('\t')).join('\n');
            fileInfoName.textContent = file.name;
            fileInfoMeta.textContent = `${parsed.columns.length} col · ${parsed.rows.length} rows`;
            dropZone.classList.add('hidden');
            fileInfoBar.classList.remove('hidden');
            diffPanel.classList.add('hidden');
            diffPanel.innerHTML = '';
        };
        reader.readAsText(file);
        fileInput.value = '';
    }

    fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });

    function commitReplace(parsed, manualMappings) {
        if (manualMappings && manualMappings.size > 0) {
            for (const [oldId, newOrigin] of manualMappings) {
                const def = tableEntry.columnDefs.find(d => d.id === oldId);
                if (def) def.origin = newOrigin;
            }
        }
        tableEntry.rows = parsed.rows;
        tableEntry.totalSize = parsed.rows.length;
        const removed = applyColumnRenames(tableEntry, parsed.columns);
        markBrokenReferences(tableEntry.id, removed);
        diffPanel.classList.add('hidden');
        diffPanel.innerHTML = '';
        refreshTableCard(tableEntry);
        const btnEdit = card.querySelector('.btn-edit-panel');
        toggleCardEdit(editArea, btnEdit);
        markDependentsStale(tableEntry.id);
    }

    function showDiffPanel(parsed, diff) {
        diffPanel.innerHTML = '';
        diffPanel.classList.remove('hidden');

        const header = document.createElement('div');
        header.className = 'col-diff-header';
        header.textContent = 'Column changes detected';
        diffPanel.appendChild(header);

        if (diff.matched.length > 0) {
            const row = document.createElement('div');
            row.className = 'col-diff-section col-diff-matched';
            row.innerHTML = `<span class="col-diff-label">✓ Matched (${diff.matched.length})</span>
                <span class="col-diff-chips">${diff.matched.map(d => `<span class="col-diff-chip">${d.name}</span>`).join('')}</span>`;
            diffPanel.appendChild(row);
        }

        const manualMappings = new Map();
        if (diff.removed.length > 0) {
            const sec = document.createElement('div');
            sec.className = 'col-diff-section col-diff-removed-section';
            const hasDownstream = tables.some(t => t.source === 'result' &&
                getDependencies(t.recipe).includes(tableEntry.id));
            const label = document.createElement('div');
            label.className = 'col-diff-label';
            label.textContent = `✕ Removed (${diff.removed.length})${hasDownstream ? ' — downstream recipes may break' : ''}`;
            sec.appendChild(label);

            diff.removed.forEach(def => {
                const row = document.createElement('div');
                row.className = 'col-diff-row';
                const name = document.createElement('span');
                name.className = 'col-diff-name';
                name.textContent = def.name;
                const arrow = document.createElement('span');
                arrow.className = 'col-diff-arrow';
                arrow.textContent = '→';
                const sel = document.createElement('select');
                sel.className = 'col-diff-select';
                const optNone = document.createElement('option');
                optNone.value = '';
                optNone.textContent = '(remove column)';
                sel.appendChild(optNone);
                diff.added.forEach(rawName => {
                    const opt = document.createElement('option');
                    opt.value = rawName;
                    opt.textContent = rawName;
                    sel.appendChild(opt);
                });
                sel.addEventListener('change', () => {
                    if (sel.value) manualMappings.set(def.id, sel.value);
                    else manualMappings.delete(def.id);
                });
                row.append(name, arrow, sel);
                sec.appendChild(row);
            });
            diffPanel.appendChild(sec);
        }

        if (diff.added.length > 0) {
            const row = document.createElement('div');
            row.className = 'col-diff-section col-diff-added-section';
            row.innerHTML = `<span class="col-diff-label">+ New (${diff.added.length})</span>
                <span class="col-diff-chips">${diff.added.map(n => `<span class="col-diff-chip col-diff-chip-new">${n}</span>`).join('')}</span>`;
            diffPanel.appendChild(row);
        }

        const actions = document.createElement('div');
        actions.className = 'col-diff-actions';
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-secondary';
        btnCancel.textContent = 'Cancel';
        btnCancel.addEventListener('click', () => { diffPanel.classList.add('hidden'); diffPanel.innerHTML = ''; });
        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'btn-primary';
        btnConfirm.textContent = 'Confirm Replace';
        btnConfirm.addEventListener('click', () => commitReplace(parsed, manualMappings));
        actions.append(btnCancel, btnConfirm);
        diffPanel.appendChild(actions);
    }

    const btnReimport = document.createElement('button');
    btnReimport.className = 'btn-primary';
    btnReimport.textContent = 'Replace Table';
    btnReimport.addEventListener('click', () => {
        const parsed = parseTsv(textarea.value);
        if (!parsed) { showError(errSpan, 'No valid data found.'); return; }
        errSpan.classList.remove('visible');
        if (!tableEntry.columnDefs) { commitReplace(parsed, null); return; }
        const diff = computeColumnDiff(tableEntry, parsed.columns);
        if (diff.removed.length === 0) commitReplace(parsed, null);
        else showDiffPanel(parsed, diff);
    });

    const descInput = document.createElement('input');
    descInput.type = 'text'; descInput.className = 'desc-input';
    descInput.placeholder = 'Description (optional)…';
    descInput.value = tableEntry.description || '';
    descInput.addEventListener('input', () => { tableEntry.description = descInput.value.trim() || null; });

    const btnDeletePanel = document.createElement('button');
    btnDeletePanel.className = 'btn-danger';
    btnDeletePanel.textContent = '✕ Delete Table';
    btnDeletePanel.addEventListener('click', () => deleteTableSafe(tableEntry, card, errSpan));

    const footer = document.createElement('div');
    footer.className = 'panel-footer';
    footer.append(descInput, errSpan, btnDeletePanel, btnReimport);
    editArea.append(fileInput, dropZone, fileInfoBar, divider, textarea, diffPanel, footer);
}

function buildSoqlEditArea(editArea, tableEntry, card) {
    const textarea = document.createElement('textarea');
    textarea.className = 'add-textarea';
    textarea.value = tableEntry.soqlQuery || '';

    const controls = document.createElement('div');
    controls.className = 'soql-controls';

    const localOrgSel = document.createElement('select');
    localOrgSel.className = 'org-select';
    populateOrgSelect(localOrgSel, tableEntry.orgIdentifier);

    const btnRefreshLocal = document.createElement('button');
    btnRefreshLocal.className = 'btn-icon';
    btnRefreshLocal.textContent = '↻';
    btnRefreshLocal.title = 'Refresh org list';
    btnRefreshLocal.addEventListener('click', async () => {
        btnRefreshLocal.classList.add('spinning');
        const result = await window.electronAPI.refreshDataWorkbenchOrgs();
        if (result.orgs) { orgsData = result.orgs; populateOrgSelect(localOrgSel, localOrgSel.value); }
        btnRefreshLocal.classList.remove('spinning');
    });

    const btnRerun = document.createElement('button');
    btnRerun.className = 'btn-primary';
    btnRerun.textContent = 'Re-run';

    const errSpan = document.createElement('span');
    errSpan.className = 'panel-error';

    const descInput = document.createElement('input');
    descInput.type = 'text'; descInput.className = 'desc-input';
    descInput.placeholder = 'Description (optional — visible in schema tooltip)…';
    descInput.value = tableEntry.description || '';
    descInput.addEventListener('input', () => { tableEntry.description = descInput.value.trim() || null; });

    controls.append(localOrgSel, btnRefreshLocal);

    const cardHint = document.createElement('div');
    cardHint.className = 'bindings-hint card-bindings-hint';
    renderBindingsHint(cardHint, textarea, tableEntry.id);

    const btnDeletePanel = document.createElement('button');
    btnDeletePanel.className = 'btn-danger';
    btnDeletePanel.textContent = '✕ Delete Table';
    btnDeletePanel.addEventListener('click', () => deleteTableSafe(tableEntry, card, errSpan));

    const footer = document.createElement('div');
    footer.className = 'panel-footer';
    footer.append(descInput, errSpan, btnDeletePanel, btnRerun);
    editArea.append(textarea, controls, cardHint, footer);

    btnRerun.addEventListener('click', async () => {
        const query = textarea.value.trim();
        if (!query) { showError(errSpan, 'Please enter a SOQL query.'); return; }
        const usedRefs = [...query.matchAll(/:([A-Za-z]\w*\.\w+)\.(?:\w+|\[[^\]]+\])/g)].map(m => m[1]);
        const excluded = new Set([tableEntry.id, ...getTransitiveDependents(tableEntry.id)]);
        const circular = [...new Set(usedRefs.filter(ref => { const t = tables.find(u => u.ref === ref); return t && excluded.has(t.id); }))];
        if (circular.length > 0) { showError(errSpan, `Circular reference: ${circular.map(r => ':' + r).join(', ')} depends on this table.`); return; }
        const { resolved, errors } = resolveTableRefs(query);
        if (errors.length > 0) { showError(errSpan, errors.join('\n')); return; }
        errSpan.classList.remove('visible');
        btnRerun.disabled = true;
        btnRerun.textContent = 'Running…';
        try {
            const org = localOrgSel.value;
            const result = await window.electronAPI.runDataWorkbenchSoql({ query: resolved, orgIdentifier: org });
            if (result.error) {
                showError(errSpan, result.error);
            } else {
                tableEntry.rows          = result.rows;
                tableEntry.totalSize     = result.totalSize;
                tableEntry.soqlQuery     = query;
                tableEntry.orgIdentifier = org;
                const removed4 = applyColumnRenames(tableEntry, result.columns);
                markBrokenReferences(tableEntry.id, removed4);
                refreshTableCard(tableEntry);
                const btnEdit = card.querySelector('.btn-edit-panel');
                toggleCardEdit(editArea, btnEdit);
                markDependentsStale(tableEntry.id);
            }
        } finally {
            btnRerun.disabled = false;
            btnRerun.textContent = 'Re-run';
        }
    });
}

function populateOrgSelect(sel, defaultOrg) {
    sel.innerHTML = '';
    if (!orgsData || orgsData.length === 0) {
        const opt = document.createElement('option');
        opt.value = defaultOrg || '';
        opt.textContent = defaultOrg || 'No orgs loaded — open Add Table first';
        sel.appendChild(opt);
        return;
    }
    const sorted = [...orgsData].sort((a, b) => isOrgConnected(b) - isOrgConnected(a));
    sorted.forEach(org => {
        const id = org.alias || org.username;
        const label = org.alias ? `${org.alias} (${org.username})` : org.username;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = isOrgConnected(org) ? label : `⚠ ${label}`;
        sel.appendChild(opt);
    });
    if (defaultOrg && [...sel.options].some(o => o.value === defaultOrg)) sel.value = defaultOrg;
}

