// Maps panel — manages maps[] and the panel UI
(function () {
    const btnMaps   = document.getElementById('btn-maps');
    const panel     = document.getElementById('maps-panel');
    const closeBtn  = document.getElementById('maps-close');
    const listEl    = document.getElementById('maps-list');
    const addBtn    = document.getElementById('maps-add-btn');
    const nameInput = document.getElementById('maps-new-name');

    // expose globally so recipe.js can show/hide it
    window.btnMaps = btnMaps;

    // Sync maps to the formula evaluator and mark formula-bearing results stale
    function syncMaps() {
        window.DWLogic.setMaps(maps);
        if (typeof updateBindingsHint === 'function') updateBindingsHint();
        // Mark all result tables that have formula columns stale so user knows to rebuild
        (typeof tables !== 'undefined' ? tables : []).forEach(t => {
            if (t.source !== 'result' || !t.recipe) return;
            const hasFormula = (t.recipe.computedCols || []).some(c => c.formula);
            if (!hasFormula) return;
            t.stale = true;
            const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
            if (card) {
                card.querySelector('.stale-banner')?.classList.add('visible');
                card.querySelectorAll('.btn-edit').forEach(b => { if (b.textContent === '↻') b.classList.add('stale'); });
            }
        });
    }

    // ── Draggable panel ──
    const dragHandle = document.getElementById('maps-panel-header');
    dragHandle.style.cursor = 'grab';
    let dragging = false, dragOffX = 0, dragOffY = 0;

    dragHandle.addEventListener('mousedown', (e) => {
        if (e.target === closeBtn) return;
        dragging = true;
        const rect = panel.getBoundingClientRect();
        panel.style.right = 'auto';
        panel.style.left  = rect.left + 'px';
        panel.style.top   = rect.top  + 'px';
        dragOffX = e.clientX - rect.left;
        dragOffY = e.clientY - rect.top;
        dragHandle.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        panel.style.left = (e.clientX - dragOffX) + 'px';
        panel.style.top  = (e.clientY - dragOffY) + 'px';
    });
    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        dragHandle.style.cursor = 'grab';
    });

    // ── Resize handle ──
    makeResizable(panel, document.getElementById('maps-resize'));

    // ── Open / close ──
    btnMaps.addEventListener('click', () => {
        panel.classList.toggle('hidden');
    });
    closeBtn.addEventListener('click', () => panel.classList.add('hidden'));

    // ── Add a new empty map ──
    function addMap() {
        const name = nameInput.value.trim();
        if (!name) return;
        if (maps.find(m => m.name === name)) {
            nameInput.style.borderColor = '#f87171';
            setTimeout(() => nameInput.style.borderColor = '', 1200);
            return;
        }
        const id = 'map_' + Date.now();
        maps.push({ id, name, entries: [] });
        syncMaps();
        nameInput.value = '';
        renderList();
    }

    addBtn.addEventListener('click', addMap);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addMap(); });

    // ── Render the full list ──
    function renderList() {
        listEl.innerHTML = '';
        if (maps.length === 0) {
            listEl.innerHTML = '<div class="maps-empty">No maps yet. Create one above.</div>';
            return;
        }
        maps.forEach(m => listEl.appendChild(renderMapItem(m)));
    }

    // ── Render a single map item ──
    function renderMapItem(m) {
        const item = document.createElement('div');
        item.className = 'maps-item';
        item.dataset.mapId = m.id;

        // Header row
        const header = document.createElement('div');
        header.className = 'maps-item-header';

        const toggle = document.createElement('button');
        toggle.className = 'maps-item-toggle';
        toggle.textContent = '▶';
        toggle.title = 'Expand / collapse';

        const nameEl = document.createElement('span');
        nameEl.className = 'maps-item-name';
        nameEl.textContent = m.name;
        nameEl.title = 'Double-click to rename';
        nameEl.addEventListener('dblclick', () => startRename(m, nameEl));

        const countEl = document.createElement('span');
        countEl.className = 'maps-item-count';
        countEl.textContent = m.entries.length + ' entries';

        const delBtn = document.createElement('button');
        delBtn.className = 'maps-item-delete';
        delBtn.textContent = '🗑';
        delBtn.title = 'Delete map';
        delBtn.addEventListener('click', () => {
            maps.splice(maps.indexOf(m), 1);
            syncMaps();
            renderList();
        });

        header.appendChild(toggle);
        header.appendChild(nameEl);
        header.appendChild(countEl);
        header.appendChild(delBtn);
        item.appendChild(header);

        // Expandable body
        const body = document.createElement('div');
        body.className = 'maps-item-body hidden';

        renderMapBody(m, body, countEl);

        toggle.addEventListener('click', () => {
            const open = body.classList.toggle('hidden') === false;
            toggle.textContent = open ? '▼' : '▶';
        });

        item.appendChild(body);
        return item;
    }

    function renderMapBody(m, body, countEl) {
        body.innerHTML = '';

        // Paste import section
        const pasteSection = document.createElement('div');
        pasteSection.className = 'maps-paste-section';

        const pasteLabel = document.createElement('div');
        pasteLabel.className = 'maps-section-label';
        pasteLabel.textContent = 'Paste TSV / CSV to import';
        pasteSection.appendChild(pasteLabel);

        const pasteArea = document.createElement('textarea');
        pasteArea.className = 'maps-paste-area';
        pasteArea.placeholder = 'Paste data here (first column = key)…';
        pasteSection.appendChild(pasteArea);

        const pasteControls = document.createElement('div');
        pasteControls.className = 'maps-paste-controls hidden';
        pasteSection.appendChild(pasteControls);

        const valColLabel = document.createElement('label');
        valColLabel.className = 'maps-paste-col-label';
        valColLabel.textContent = 'Value column:';

        const valColSelect = document.createElement('select');
        valColSelect.className = 'maps-paste-col-select';

        pasteControls.appendChild(valColLabel);
        pasteControls.appendChild(valColSelect);

        const pasteError = document.createElement('div');
        pasteError.className = 'maps-paste-error hidden';
        pasteSection.appendChild(pasteError);

        let parsedCols = null, parsedRows = null;

        pasteArea.addEventListener('input', () => {
            const raw = pasteArea.value.trim();
            if (!raw) { pasteControls.classList.add('hidden'); parsedCols = null; return; }
            try {
                const hasTabs = raw.split(/\r?\n/)[0].includes('\t');
                const result = hasTabs ? parseTsv(raw) : parseCsv(raw);
                if (!result || result.columns.length < 1) throw new Error('Could not parse');
                parsedCols = result.columns;
                parsedRows = result.rows;
                pasteError.classList.add('hidden');

                // Populate value column selector (skip first col = key)
                valColSelect.innerHTML = '';
                parsedCols.slice(1).forEach((col, i) => {
                    const opt = document.createElement('option');
                    opt.value = i + 1; // index in parsedCols
                    opt.textContent = col;
                    valColSelect.appendChild(opt);
                });
                pasteControls.classList.remove('hidden');
            } catch (err) {
                pasteControls.classList.add('hidden');
                pasteError.textContent = 'Could not parse: ' + err.message;
                pasteError.classList.remove('hidden');
                parsedCols = null;
            }
        });

        const pasteImportBtn = document.createElement('button');
        pasteImportBtn.className = 'maps-paste-import-btn';
        pasteImportBtn.textContent = 'Import';
        pasteImportBtn.addEventListener('click', () => {
            if (!parsedCols || !parsedRows) return;
            const keyIdx = 0;
            const valIdx = parseInt(valColSelect.value, 10);
            const imported = parsedRows
                .map(r => ({ key: String(r[keyIdx] ?? ''), value: String(r[valIdx] ?? '') }))
                .filter(e => e.key !== '');
            m.entries = imported;
            syncMaps();
            pasteArea.value = '';
            pasteControls.classList.add('hidden');
            parsedCols = null; parsedRows = null;
            countEl.textContent = m.entries.length + ' entries';
            renderMapBody(m, body, countEl);
        });
        pasteSection.appendChild(pasteImportBtn);

        body.appendChild(pasteSection);

        // Entries list
        const entriesSection = document.createElement('div');
        entriesSection.className = 'maps-entries-section';

        if (m.entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'maps-entries-empty';
            empty.textContent = 'No entries yet.';
            entriesSection.appendChild(empty);
        } else {
            const table = document.createElement('table');
            table.className = 'maps-entries-table';
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>Key</th><th>Value</th><th></th></tr>';
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            m.entries.forEach((entry, idx) => {
                const tr = document.createElement('tr');
                const keyTd = document.createElement('td');
                keyTd.className = 'maps-entry-key';
                keyTd.textContent = entry.key;
                const valTd = document.createElement('td');
                valTd.className = 'maps-entry-val';
                valTd.textContent = entry.value;
                const actTd = document.createElement('td');
                const rmBtn = document.createElement('button');
                rmBtn.className = 'maps-entry-remove';
                rmBtn.textContent = '✕';
                rmBtn.title = 'Remove entry';
                rmBtn.addEventListener('click', () => {
                    m.entries.splice(idx, 1);
                    syncMaps();
                    countEl.textContent = m.entries.length + ' entries';
                    renderMapBody(m, body, countEl);
                });
                actTd.appendChild(rmBtn);
                tr.appendChild(keyTd);
                tr.appendChild(valTd);
                tr.appendChild(actTd);
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            entriesSection.appendChild(table);
        }

        // Add single entry row
        const addRow = document.createElement('div');
        addRow.className = 'maps-add-entry-row';
        const keyIn = document.createElement('input');
        keyIn.className = 'maps-entry-input';
        keyIn.placeholder = 'Key';
        const valIn = document.createElement('input');
        valIn.className = 'maps-entry-input';
        valIn.placeholder = 'Value';
        const addEntryBtn = document.createElement('button');
        addEntryBtn.className = 'maps-add-entry-btn';
        addEntryBtn.textContent = '+ Add';
        addEntryBtn.addEventListener('click', () => {
            const k = keyIn.value.trim();
            if (!k) return;
            m.entries.push({ key: k, value: valIn.value });
            syncMaps();
            keyIn.value = ''; valIn.value = '';
            countEl.textContent = m.entries.length + ' entries';
            renderMapBody(m, body, countEl);
        });
        [keyIn, valIn].forEach(inp => inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addEntryBtn.click();
        }));
        addRow.appendChild(keyIn);
        addRow.appendChild(valIn);
        addRow.appendChild(addEntryBtn);
        entriesSection.appendChild(addRow);

        body.appendChild(entriesSection);
    }

    function startRename(m, nameEl) {
        const inp = document.createElement('input');
        inp.className = 'maps-rename-input';
        inp.value = m.name;
        nameEl.replaceWith(inp);
        inp.focus();
        inp.select();

        function commit() {
            const newName = inp.value.trim();
            if (newName && newName !== m.name && !maps.find(x => x.name === newName)) {
                const oldName = m.name;
                m.name = newName;
                syncMaps();
                propagateMapRename(oldName, newName);
                // Auto-recompute all result tables whose formulas were affected
                document.querySelectorAll('.table-card').forEach(card => {
                    const btn = [...card.querySelectorAll('.btn-edit')]
                        .find(b => b.textContent === '↻' && b.classList.contains('stale'));
                    if (btn) btn.click();
                });
            }
            nameEl.textContent = m.name;
            inp.replaceWith(nameEl);
        }
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { inp.blur(); }
            if (e.key === 'Escape') { inp.value = m.name; inp.blur(); }
        });
    }

    // Update map name in GET/HAS formulas and [MapName].keys/.values SOQL bindings
    function propagateMapRename(oldName, newName) {
        const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const formulaPattern = new RegExp(`(\\b(?:GET|HAS)\\s*\\(\\s*)(["\'])${esc}\\2`, 'gi');
        const soqlPattern    = new RegExp(`\\[${esc}\\]\\.(keys|values)`, 'g');

        (typeof tables !== 'undefined' ? tables : []).forEach(t => {
            // Formulas in result table computed columns
            if (t.source === 'result' && t.recipe) {
                (t.recipe.computedCols || []).forEach(col => {
                    if (!col.formula) return;
                    col.formula = col.formula.replace(formulaPattern, `$1"${newName}"`);
                });
            }
            // SOQL queries in source tables
            if (t.source === 'soql' && t.soqlQuery) {
                t.soqlQuery = t.soqlQuery.replace(soqlPattern, `[${newName}].$1`);
            }
        });
    }

    // ── Public: re-render list (called after deserialize) ──
    window.renderMapsList = renderList;

    // Initial render + sync reference so _maps always points to the same array as maps
    renderList();
    window.DWLogic.setMaps(maps);
})();
