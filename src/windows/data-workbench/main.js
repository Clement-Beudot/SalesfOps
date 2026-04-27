// ── Version badge ─────────────────────────────────
document.getElementById('workbench-version-badge').textContent = `BETA v${WORKBENCH_VERSION}`;

// ── Add panel toggle ──────────────────────────────

btnAdd.addEventListener('click', () => {
    const isOpen = addPanel.classList.toggle('open');
    btnAdd.classList.toggle('active-toggle', isOpen);
    btnAdd.textContent = isOpen ? '✕ Close' : '+ Add Table';
    if (!isOpen) {
        closePanel();
    }
    if (isOpen) {
        resultPanel.classList.remove('open');
        btnResult.classList.remove('active-toggle');
        btnResult.textContent = '+ Add Result';
        const activeMode = document.querySelector('.mode-tab.active')?.dataset.mode;
        if (activeMode === 'soql' && !orgsLoaded && !orgsLoading) {
            loadOrgs();
        } else if (activeMode === 'paste') {
            setTimeout(() => pasteInput.focus(), 50);
        }
    }
});

btnResult.addEventListener('click', () => {
    const isOpen = resultPanel.classList.toggle('open');
    btnResult.classList.toggle('active-toggle', isOpen);
    btnResult.textContent = isOpen ? '✕ Close' : '+ Add Result';
    // Reset edit mode whenever the panel is opened fresh or closed via this button
    editingTableEntry = null;
    btnCreateResult.textContent = 'Create Result';
    btnDeleteResult.style.display = 'none';
    resultDescription.value = '';
    if (isOpen) {
        addPanel.classList.remove('open');
        btnAdd.classList.remove('active-toggle');
        btnAdd.textContent = '+ Add Table';
        openResultPanel();
    }
});

// ── Mode switching ────────────────────────────────

modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        modeTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.mode;
        viewPaste.classList.toggle('active', mode === 'paste');
        viewSoql.classList.toggle('active', mode === 'soql');
        viewFile.classList.toggle('active', mode === 'file');
        clearErrors();

        // Reset edit mode when manually switching tabs
        soqlEditingEntry = null;
        pasteEditingEntry = null;
        btnRunQuery.textContent = 'Run Query';
        btnImport.textContent = 'Import Table';

        if (mode === 'soql' && !orgsLoaded && !orgsLoading) {
            loadOrgs();
        } else if (mode === 'paste') {
            setTimeout(() => pasteInput.focus(), 50);
        }
    });
});

// ── Orgs loading ──────────────────────────────────

async function loadOrgs(forceRefresh = false) {
    orgsLoading = true;
    btnRefreshOrgs.classList.add('spinning');
    orgSelect.innerHTML = '<option value="">Loading orgs...</option>';
    orgSelect.disabled = true;

    try {
        const result = forceRefresh
            ? await window.electronAPI.refreshDataWorkbenchOrgs()
            : await window.electronAPI.getDataWorkbenchOrgs();

        orgSelect.innerHTML = '';
        orgSelect.disabled = false;

        if (result.error) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = `⚠ ${result.error}`;
            orgSelect.appendChild(opt);
        } else if (!result.orgs || result.orgs.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No orgs found — run sf org login first';
            orgSelect.appendChild(opt);
        } else {
            const sorted = [...result.orgs].sort((a, b) => {
                const aConn = isOrgConnected(a);
                const bConn = isOrgConnected(b);
                return bConn - aConn;
            });

            sorted.forEach(org => {
                const id = org.alias || org.username;
                const label = org.alias ? `${org.alias} (${org.username})` : org.username;
                const connected = isOrgConnected(org);
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = connected ? label : `⚠ ${label}`;
                orgSelect.appendChild(opt);
            });

            orgsLoaded = true;
            orgsData = result.orgs;
        }
    } catch {
        orgSelect.innerHTML = '<option value="">Failed to load orgs</option>';
        orgSelect.disabled = false;
    } finally {
        orgsLoading = false;
        btnRefreshOrgs.classList.remove('spinning');
    }
}

btnRefreshOrgs.addEventListener('click', () => {
    orgsLoaded = false;
    loadOrgs(true);
});

// ── Paste-edit drop zone (shown in paste tab during edit mode) ────────────────

function loadPasteFileIntoTextarea(file) {
    const reader = new FileReader();
    reader.onload = ev => {
        const text = ev.target.result;
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        const parsed = isCsv ? parseCsv(text) : parseTsv(text);
        if (!parsed) { showError(pasteError, `Could not parse "${file.name}".`); return; }
        pasteError.classList.remove('visible');
        pasteInput.value = [parsed.columns, ...parsed.rows].map(r => r.join('\t')).join('\n');
        pasteEditFileName.textContent = file.name;
        pasteEditFileMeta.textContent = `${parsed.columns.length} col · ${parsed.rows.length} rows`;
        pasteEditDropZone.classList.add('hidden');
        pasteEditFileInfo.classList.remove('hidden');
    };
    reader.readAsText(file);
    pasteFileInput.value = '';
}

pasteFileInput.addEventListener('change', () => {
    if (pasteFileInput.files[0]) loadPasteFileIntoTextarea(pasteFileInput.files[0]);
});

pasteEditDropZone.addEventListener('click', () => pasteFileInput.click());
pasteEditDropZone.addEventListener('dragover', e => { e.preventDefault(); pasteEditDropZone.classList.add('drag-over'); });
pasteEditDropZone.addEventListener('dragleave', () => pasteEditDropZone.classList.remove('drag-over'));
pasteEditDropZone.addEventListener('drop', e => {
    e.preventDefault();
    pasteEditDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadPasteFileIntoTextarea(file);
});

pasteEditFileClear.addEventListener('click', () => {
    pasteEditFileInfo.classList.add('hidden');
    pasteEditDropZone.classList.remove('hidden');
    if (pasteEditingEntry) {
        pasteInput.value = [pasteEditingEntry.columns, ...pasteEditingEntry.rows].map(r => r.join('\t')).join('\n');
    }
});

// ── Open add-panel in edit mode ───────────────────

function openAddPanelForSoqlEdit(tableEntry) {
    resultPanel.classList.remove('open');
    btnResult.classList.remove('active-toggle');
    btnResult.textContent = '+ Add Result';
    editingTableEntry = null;

    // Switch to SOQL tab
    modeTabs.forEach(t => t.classList.remove('active'));
    document.querySelector('.mode-tab[data-mode="soql"]').classList.add('active');
    viewPaste.classList.remove('active');
    viewFile.classList.remove('active');
    viewSoql.classList.add('active');

    soqlInput.value = tableEntry.soqlQuery || '';
    soqlDescription.value = tableEntry.description || '';
    clearErrors();

    soqlEditingEntry = tableEntry;
    btnRunQuery.textContent = 'Update Table';

    addPanel.classList.add('open');
    btnAdd.classList.add('active-toggle');
    btnAdd.textContent = '✕ Close';

    if (!orgsLoaded && !orgsLoading) {
        loadOrgs().then(() => {
            if (tableEntry.orgIdentifier) orgSelect.value = tableEntry.orgIdentifier;
        });
    } else if (tableEntry.orgIdentifier) {
        orgSelect.value = tableEntry.orgIdentifier;
    }
}

function openAddPanelForPasteEdit(tableEntry) {
    resultPanel.classList.remove('open');
    btnResult.classList.remove('active-toggle');
    btnResult.textContent = '+ Add Result';
    editingTableEntry = null;

    // Switch to paste tab
    modeTabs.forEach(t => t.classList.remove('active'));
    document.querySelector('.mode-tab[data-mode="paste"]').classList.add('active');
    viewSoql.classList.remove('active');
    viewFile.classList.remove('active');
    viewPaste.classList.add('active');

    // Re-build TSV from current data
    const tsv = [tableEntry.columns, ...tableEntry.rows].map(row => row.join('\t')).join('\n');
    pasteInput.value = tsv;
    pasteDescription.value = tableEntry.description || '';
    clearErrors();

    pasteEditingEntry = tableEntry;
    btnImport.textContent = 'Update Table';
    btnImportFile.textContent = 'Replace Table';

    // Show file drop zone in paste tab
    pasteEditFile.classList.remove('hidden');
    pasteEditDropZone.classList.remove('hidden');
    pasteEditFileInfo.classList.add('hidden');

    addPanel.classList.add('open');
    btnAdd.classList.add('active-toggle');
    btnAdd.textContent = '✕ Close';

    setTimeout(() => pasteInput.focus(), 50);
}

// ── Paste import ──────────────────────────────────

btnImport.addEventListener('click', importFromPaste);

pasteInput.addEventListener('keydown', (e) => {
    // Cmd+Enter or Ctrl+Enter to import
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        importFromPaste();
    }
});

function commitPasteEditing(entry, parsed, manualMappings) {
    if (manualMappings && manualMappings.size > 0) {
        for (const [oldId, newOrigin] of manualMappings) {
            const def = entry.columnDefs.find(d => d.id === oldId);
            if (def) def.origin = newOrigin;
        }
    }
    entry.rows = parsed.rows;
    entry.totalSize = parsed.rows.length;
    entry.description = pasteDescription.value.trim() || null;
    const removed = applyColumnRenames(entry, parsed.columns);
    markBrokenReferences(entry.id, removed);
    refreshTableCard(entry);
    markDependentsStale(entry.id);
    if (!schemaOverlay.classList.contains('hidden')) renderSchema();
    pasteInput.value = '';
    pasteDescription.value = '';
    pasteError.textContent = '';
    pasteError.classList.remove('visible');
    closePanel();
}

function showPasteEditingDiff(entry, parsed, diff) {
    pasteError.textContent = '';
    pasteError.classList.remove('visible');

    // Build an inline diff UI inside the paste panel below the textarea
    let diffEl = document.getElementById('paste-col-diff');
    if (!diffEl) {
        diffEl = document.createElement('div');
        diffEl.id = 'paste-col-diff';
        diffEl.className = 'col-diff-panel';
        pasteInput.insertAdjacentElement('afterend', diffEl);
    }
    diffEl.innerHTML = '';
    diffEl.classList.remove('hidden');

    const header = document.createElement('div');
    header.className = 'col-diff-header';
    header.textContent = 'Column changes detected';
    diffEl.appendChild(header);

    if (diff.matched.length > 0) {
        const row = document.createElement('div');
        row.className = 'col-diff-section col-diff-matched';
        row.innerHTML = `<span class="col-diff-label">✓ Matched (${diff.matched.length})</span>
            <span class="col-diff-chips">${diff.matched.map(d => `<span class="col-diff-chip">${d.name}</span>`).join('')}</span>`;
        diffEl.appendChild(row);
    }

    const manualMappings = new Map();
    if (diff.removed.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'col-diff-section col-diff-removed-section';
        const hasDownstream = tables.some(t => t.source === 'result' &&
            getDependencies(t.recipe).includes(entry.id));
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
        diffEl.appendChild(sec);
    }

    if (diff.added.length > 0) {
        const row = document.createElement('div');
        row.className = 'col-diff-section col-diff-added-section';
        row.innerHTML = `<span class="col-diff-label">+ New (${diff.added.length})</span>
            <span class="col-diff-chips">${diff.added.map(n => `<span class="col-diff-chip col-diff-chip-new">${n}</span>`).join('')}</span>`;
        diffEl.appendChild(row);
    }

    const actions = document.createElement('div');
    actions.className = 'col-diff-actions';
    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn-secondary';
    btnCancel.textContent = 'Cancel';
    btnCancel.addEventListener('click', () => { diffEl.classList.add('hidden'); diffEl.innerHTML = ''; });
    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'btn-primary';
    btnConfirm.textContent = 'Confirm Replace';
    btnConfirm.addEventListener('click', () => {
        diffEl.classList.add('hidden');
        diffEl.innerHTML = '';
        commitPasteEditing(entry, parsed, manualMappings);
    });
    actions.append(btnCancel, btnConfirm);
    diffEl.appendChild(actions);
}

function importFromPaste() {
    const text = pasteInput.value;
    const parsed = parseTsv(text);
    if (!parsed) {
        showError(pasteError, 'No valid data found. Paste tab-separated content copied from a spreadsheet.');
        return;
    }
    clearErrors();

    if (pasteEditingEntry) {
        const entry = pasteEditingEntry;
        if (entry.columnDefs) {
            const diff = computeColumnDiff(entry, parsed.columns);
            if (diff.removed.length > 0) {
                showPasteEditingDiff(entry, parsed, diff);
                return;
            }
        }
        commitPasteEditing(entry, parsed, null);
        return;
    }

    addTable({
        name: `Table ${++tableCounter}`,
        source: 'paste',
        columns: parsed.columns,
        rows: parsed.rows,
        totalSize: parsed.rows.length,
        description: pasteDescription.value.trim() || null,
    });
    pasteInput.value = '';
    pasteDescription.value = '';
    closePanel();
}

// ── CSV file import ───────────────────────────────

let pendingCsvParsed = null;

function handleCsvFile(file) {
    fileError.textContent = '';
    fileError.classList.remove('visible');
    if (!file || !file.name.toLowerCase().endsWith('.csv')) {
        fileError.textContent = 'Please select a .csv file.';
        fileError.classList.add('visible');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const parsed = parseCsv(e.target.result);
        if (!parsed) {
            fileError.textContent = 'Could not parse this file. Make sure it is a valid CSV.';
            fileError.classList.add('visible');
            return;
        }
        pendingCsvParsed = parsed;
        fileDropZone.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        fileInfoName.textContent = file.name;
        fileInfoMeta.textContent = `${parsed.columns.length} columns · ${parsed.rows.length} rows`;
        if (!fileDescription.value) fileDescription.value = file.name.replace(/\.csv$/i, '');
        btnImportFile.disabled = false;
    };
    reader.readAsText(file);
}

fileDropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleCsvFile(fileInput.files[0]);
    fileInput.value = '';
});

fileDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropZone.classList.add('drag-over');
});
fileDropZone.addEventListener('dragleave', () => fileDropZone.classList.remove('drag-over'));
fileDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropZone.classList.remove('drag-over');
    handleCsvFile(e.dataTransfer.files[0]);
});

fileInfoClear.addEventListener('click', () => {
    pendingCsvParsed = null;
    btnImportFile.disabled = true;
    fileInfo.classList.add('hidden');
    fileDropZone.classList.remove('hidden');
    fileDescription.value = '';
    fileError.textContent = '';
    fileError.classList.remove('visible');
});

btnImportFile.addEventListener('click', () => {
    if (!pendingCsvParsed) return;
    const parsed = pendingCsvParsed;

    if (pasteEditingEntry) {
        const entry = pasteEditingEntry;
        pendingCsvParsed = null;
        btnImportFile.disabled = true;
        fileInfo.classList.add('hidden');
        fileDropZone.classList.remove('hidden');
        if (entry.columnDefs) {
            const diff = computeColumnDiff(entry, parsed.columns);
            if (diff.removed.length > 0) {
                // Switch to paste tab so the diff panel has room to render
                modeTabs.forEach(t => t.classList.remove('active'));
                document.querySelector('.mode-tab[data-mode="paste"]').classList.add('active');
                viewFile.classList.remove('active');
                viewPaste.classList.add('active');
                pasteInput.value = [parsed.columns, ...parsed.rows].map(r => r.join('\t')).join('\n');
                showPasteEditingDiff(entry, parsed, diff);
                return;
            }
        }
        commitPasteEditing(entry, parsed, null);
        return;
    }

    addTable({
        name: `Table ${++tableCounter}`,
        source: 'paste',
        columns: parsed.columns,
        rows: parsed.rows,
        totalSize: parsed.rows.length,
        description: fileDescription.value.trim() || null,
    });
    pendingCsvParsed = null;
    btnImportFile.disabled = true;
    fileInfo.classList.add('hidden');
    fileDropZone.classList.remove('hidden');
    fileDescription.value = '';
    closePanel();
});

// ── SOQL query ────────────────────────────────────

btnRunQuery.addEventListener('click', runSoqlQuery);

soqlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        runSoqlQuery();
    }
});

async function runSoqlQuery() {
    const rawQuery = soqlInput.value.trim();
    if (!rawQuery) {
        showError(soqlError, 'Please enter a SOQL query.');
        return;
    }

    const { resolved, errors } = resolveTableRefs(rawQuery);
    if (errors.length > 0) {
        showError(soqlError, errors.join('\n'));
        return;
    }

    clearErrors();
    btnRunQuery.disabled = true;
    btnRunQuery.textContent = 'Running…';

    try {
        const orgIdentifier = orgSelect.value;
        const result = await window.electronAPI.runDataWorkbenchSoql({ query: resolved, orgIdentifier });

        if (result.error) {
            showError(soqlError, result.error);
        } else if (soqlEditingEntry) {
            const entry = soqlEditingEntry;
            entry.rows = result.rows;
            entry.totalSize = result.totalSize;
            entry.soqlQuery = rawQuery;
            entry.orgIdentifier = orgIdentifier;
            entry.subtitle = orgIdentifier || 'default';
            entry.description = soqlDescription.value.trim() || null;
            const removedB = applyColumnRenames(entry, result.columns);
            markBrokenReferences(entry.id, removedB);
            refreshTableCard(entry);
            markDependentsStale(entry.id);
            if (!schemaOverlay.classList.contains('hidden')) renderSchema();
            soqlInput.value = '';
            soqlDescription.value = '';
            closePanel();
        } else {
            const orgLabel = orgIdentifier || 'default';
            addTable({
                name: `SOQL ${++tableCounter}`,
                source: 'soql',
                columns: result.columns,
                rows: result.rows,
                totalSize: result.totalSize,
                subtitle: orgLabel,
                soqlQuery: rawQuery,
                orgIdentifier,
                description: soqlDescription.value.trim() || null,
            });
            soqlInput.value = '';
            soqlDescription.value = '';
            closePanel();
        }
    } finally {
        btnRunQuery.disabled = false;
        btnRunQuery.textContent = soqlEditingEntry ? 'Update Table' : 'Run Query';
    }
}

// ── Save / Load model ──────────────────────────────

btnSaveModel.addEventListener('click', async () => {
    const model = serializeModel();
    const result = await window.electronAPI.saveDataWorkbenchModel(model);
    if (result.error) showToast(`Save failed: ${result.error}`, 'error', 0);
    else if (result.success) {
        const orig = btnSaveModel.textContent;
        btnSaveModel.textContent = '✓ Saved';
        setTimeout(() => { btnSaveModel.textContent = orig; }, 1500);
    }
});

btnLoadModel.addEventListener('click', async () => {
    const result = await window.electronAPI.loadDataWorkbenchModel();
    if (result.canceled) return;
    if (result.error) { showToast(`Load failed: ${result.error}`, 'error', 0); return; }
    deserializeModel(result.data);
});
