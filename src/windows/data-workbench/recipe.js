// ── Result panel ──────────────────────────────────


document.querySelectorAll('.op-tile').forEach(tile => {
    tile.addEventListener('click', () => {
        document.querySelectorAll('.op-tile').forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
        currentOp = tile.dataset.op;
        renderResultConfig();
    });
});

const opTilesEl = document.querySelector('.op-tiles');
function unlockOpTiles() { opTilesEl.classList.remove('op-tiles--locked'); }

function openResultPanel() {
    currentOp = 'enrich';
    unlockOpTiles();
    document.querySelectorAll('.op-tile').forEach(t => t.classList.remove('active'));
    document.querySelector('.op-tile[data-op="enrich"]').classList.add('active');
    renderResultConfig();
}

function renderResultConfig() {
    resultConfig.innerHTML = '';
    if (currentOp === 'stack') {
        renderStackConfig();
    } else if (currentOp === 'transform') {
        renderTransformConfig();
    } else if (currentOp === 'split') {
        renderSplitConfig();
    } else if (currentOp === 'group') {
        renderGroupConfig();
    } else {
        renderJoinKeyConfig();
        if (currentOp === 'enrich') renderColSelector();
    }
}

function makeTableSelect(id, defaultIdx) {
    const sel = document.createElement('select');
    sel.className = 'join-select';
    sel.id = id;
    const eligible = tables.filter(t => t.source !== 'dml');
    eligible.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        sel.appendChild(opt);
    });
    if (eligible[defaultIdx]) sel.value = eligible[defaultIdx].id;
    return sel;
}

function makeJoinColSelect(id, tableId) {
    const sel = document.createElement('select');
    sel.className = 'join-select';
    sel.id = id;
    const table = tables.find(t => t.id === tableId);
    (table?.columnDefs || table?.columns.map(n => ({ id: n, name: n })) || []).forEach(def => {
        const opt = document.createElement('option');
        opt.value = def.id;
        opt.textContent = def.name;
        sel.appendChild(opt);
    });
    return sel;
}

function syncColsToTable(tableSelect, colSelect) {
    const table = tables.find(t => t.id === tableSelect.value);
    colSelect.innerHTML = '';
    (table?.columnDefs || table?.columns.map(n => ({ id: n, name: n })) || []).forEach(def => {
        const opt = document.createElement('option');
        opt.value = def.id;
        opt.textContent = def.name;
        colSelect.appendChild(opt);
    });
}

function renderJoinKeyConfig() {
    const grid = document.createElement('div');
    grid.className = 'join-key-config';

    // Left side
    const leftSide = document.createElement('div');
    leftSide.className = 'join-key-side';
    const leftLabel = document.createElement('span');
    leftLabel.className = 'section-label';
    leftLabel.textContent = 'Table A (base)';
    const leftTableSel = makeTableSelect('rc-left-table', 0);
    const leftColSel = makeJoinColSelect('rc-left-col', leftTableSel.value);
    leftSide.append(leftLabel, leftTableSel, leftColSel);

    // Separator
    const sep = document.createElement('span');
    sep.className = 'join-sep';
    sep.textContent = '=';

    // Right side
    const rightSide = document.createElement('div');
    rightSide.className = 'join-key-side';
    const rightLabel = document.createElement('span');
    rightLabel.className = 'section-label';
    rightLabel.textContent = 'Table B (lookup)';
    const rightTableSel = makeTableSelect('rc-right-table', 1);
    const rightColSel = makeJoinColSelect('rc-right-col', rightTableSel.value);
    rightSide.append(rightLabel, rightTableSel, rightColSel);

    grid.append(leftSide, sep, rightSide);
    resultConfig.appendChild(grid);

    const caseRow = document.createElement('label');
    caseRow.className = 'join-case-row';
    const caseCheck = document.createElement('input');
    caseCheck.type = 'checkbox';
    caseCheck.id = 'rc-case-insensitive';
    caseRow.append(caseCheck, ' Ignore case  (a = A)');
    resultConfig.appendChild(caseRow);

    leftTableSel.addEventListener('change', () => {
        syncColsToTable(leftTableSel, leftColSel);
        if (currentOp === 'enrich') renderColSelector();
    });
    rightTableSel.addEventListener('change', () => {
        syncColsToTable(rightTableSel, rightColSel);
        if (currentOp === 'enrich') renderColSelector();
    });
}

function addColSelActions(header, getContainer) {
    const actions = document.createElement('div');
    actions.className = 'col-sel-actions';
    const btnAll  = document.createElement('button');
    btnAll.className  = 'col-sel-btn';
    btnAll.textContent = 'All';
    const btnNone = document.createElement('button');
    btnNone.className = 'col-sel-btn';
    btnNone.textContent = 'None';
    btnAll.addEventListener('click',  () => getContainer().querySelectorAll('.col-chip').forEach(c => c.classList.add('selected')));
    btnNone.addEventListener('click', () => getContainer().querySelectorAll('.col-chip').forEach(c => c.classList.remove('selected')));
    actions.append(btnAll, btnNone);
    header.appendChild(actions);
}

function renderColSelector() {
    const existing = resultConfig.querySelector('.col-selector-area');
    if (existing) existing.remove();

    const { section, header, body } = makeTransformSection('Columns to include', 'keep');
    section.classList.add('col-selector-area');
    addColSelActions(header, () => section);

    const groups = document.createElement('div');
    groups.className = 'col-groups';

    const leftSel  = document.getElementById('rc-left-table');
    const rightSel = document.getElementById('rc-right-table');

    [leftSel, rightSel].forEach(sel => {
        if (!sel) return;
        const table = tables.find(t => t.id === sel.value);
        if (!table) return;

        const group = document.createElement('div');
        group.className = 'col-group';
        const groupLabel = document.createElement('span');
        groupLabel.className = 'col-group-label';
        groupLabel.textContent = `:${table.ref}`;
        group.appendChild(groupLabel);

        (table.columnDefs || table.columns.map(n => ({ id: n, name: n }))).forEach(def => {
            const chip = document.createElement('span');
            chip.className = 'col-chip selected';
            chip.textContent = def.name;
            chip.dataset.colId = def.id;
            chip.addEventListener('click', () => chip.classList.toggle('selected'));
            group.appendChild(chip);
        });
        groups.appendChild(group);
    });

    body.appendChild(groups);
    resultConfig.appendChild(section);
}

// ── Transform config ───────────────────────────────

function makeTransformSection(title, accentKey, id) {
    const section = document.createElement('div');
    section.className = `transform-section transform-section--${accentKey}`;
    if (id) section.id = id;

    const header = document.createElement('div');
    header.className = 'transform-section-header';
    const titleEl = document.createElement('span');
    titleEl.className = 'transform-section-title';
    titleEl.textContent = title;
    header.appendChild(titleEl);

    const body = document.createElement('div');
    body.className = 'transform-section-body';

    section.append(header, body);
    return { section, header, body, titleEl };
}

function renderTransformConfig() {
    // Source table row
    const sourceRow = document.createElement('div');
    sourceRow.className = 'config-row';
    const sourceLabel = document.createElement('span');
    sourceLabel.className = 'section-label';
    sourceLabel.textContent = 'Source table';
    const sourceSel = makeTableSelect('rc-transform-table', 0);
    sourceSel.id = 'rc-transform-table';
    sourceRow.append(sourceLabel, sourceSel);
    resultConfig.appendChild(sourceRow);

    // Sections wrapper
    const sectionsWrapper = document.createElement('div');
    sectionsWrapper.className = 'transform-sections';
    resultConfig.appendChild(sectionsWrapper);

    // ── Section: Columns to keep ──
    renderTransformColSelector(sourceSel.value);

    // ── Section: Row Filters ──
    const { section: rfSection, header: rfHeader, body: rfBody } = makeTransformSection('Row Filters', 'filters', 'row-filters-area');

    const rfActionSel = document.createElement('select');
    rfActionSel.className = 'join-select row-filter-action';
    [['keep','Keep'],['remove','Remove']].forEach(([v,t]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = t;
        rfActionSel.appendChild(o);
    });
    const rfActionLabel = document.createElement('span');
    rfActionLabel.className = 'rule-label';
    rfActionLabel.textContent = 'rows matching:';
    const btnAddCondition = document.createElement('button');
    btnAddCondition.className = 'btn-action';
    btnAddCondition.textContent = '+ Add condition';
    rfHeader.append(rfActionSel, rfActionLabel, btnAddCondition);

    const rowConditionsList = document.createElement('div');
    rowConditionsList.className = 'conditions-list row-filter-conditions';
    rfBody.appendChild(rowConditionsList);

    const logicRow = document.createElement('div');
    logicRow.className = 'row-logic-row';
    const logicRowLabel = document.createElement('span');
    logicRowLabel.className = 'rule-label';
    logicRowLabel.textContent = 'Logic:';
    const rowLogicInput = document.createElement('input');
    rowLogicInput.type = 'text';
    rowLogicInput.className = 'rule-input row-filter-logic';
    rowLogicInput.placeholder = 'e.g. 1 AND (2 OR 3) — empty = all AND';
    logicRow.append(logicRowLabel, rowLogicInput);
    rfBody.appendChild(logicRow);
    sectionsWrapper.appendChild(rfSection);

    btnAddCondition.addEventListener('click', () => {
        const table = tables.find(t => t.id === document.getElementById('rc-transform-table')?.value);
        addRowCondition(rowConditionsList, rowLogicInput, table);
    });

    // ── Section: Computed Columns ──
    const { section: computedSection, header: computedHeader, body: computedBody } = makeTransformSection('Computed Columns', 'computed', 'computed-cols-area');

    const btnAddComputed = document.createElement('button');
    btnAddComputed.className = 'btn-action';
    btnAddComputed.textContent = '+ Add column';
    computedHeader.appendChild(btnAddComputed);

    const computedList = document.createElement('div');
    computedList.className = 'computed-cols-list';
    computedBody.appendChild(computedList);
    sectionsWrapper.appendChild(computedSection);

    btnAddComputed.addEventListener('click', () => {
        const table = tables.find(t => t.id === document.getElementById('rc-transform-table')?.value);
        addComputedColumnCard(computedList, table);
    });

    sourceSel.addEventListener('change', () => {
        renderTransformColSelector(sourceSel.value);
        const table = tables.find(t => t.id === sourceSel.value);
        const refreshSel = sel => {
            const prev = sel.value;
            sel.innerHTML = '';
            (table?.columns || []).forEach(col => {
                const opt = document.createElement('option');
                opt.value = col; opt.textContent = col;
                sel.appendChild(opt);
            });
            if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
        };
        resultConfig.querySelectorAll('.rule-col-sel').forEach(refreshSel);
    });
}

function renderTransformColSelector(tableId) {
    const existing = resultConfig.querySelector('.transform-col-area');
    if (existing) existing.remove();

    const { section, header, body } = makeTransformSection('Columns to Keep', 'keep');
    section.classList.add('transform-col-area');
    addColSelActions(header, () => section);

    const chipRow = document.createElement('div');
    chipRow.className = 'col-group';
    const table = tables.find(t => t.id === tableId);
    (table?.columnDefs || (table?.columns || []).map(n => ({ id: n, name: n }))).forEach(def => {
        const chip = document.createElement('span');
        chip.className = 'col-chip selected transform-col-chip';
        chip.textContent = def.name;
        chip.dataset.colId = def.id;
        chip.addEventListener('click', () => chip.classList.toggle('selected'));
        chipRow.appendChild(chip);
    });
    body.appendChild(chipRow);

    const sectionsWrapper = resultConfig.querySelector('.transform-sections');
    if (sectionsWrapper) {
        const anchor = sectionsWrapper.querySelector('#row-filters-area');
        if (anchor) sectionsWrapper.insertBefore(section, anchor);
        else sectionsWrapper.appendChild(section);
    } else {
        const anchor = resultConfig.querySelector('#row-filters-area') || resultConfig.querySelector('#computed-cols-area');
        if (anchor) resultConfig.insertBefore(section, anchor);
        else resultConfig.appendChild(section);
    }
}

function addComputedColumnCard(container, table, prefill = null) {
    const card = document.createElement('div');
    card.className = 'computed-col-card';

    // ── Header: name + mode tabs + delete ──
    const header = document.createElement('div');
    header.className = 'computed-col-header';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'transform-name-input';
    nameInput.placeholder = 'New column name…';
    if (prefill?.name) nameInput.value = prefill.name;

    const modeTabs = document.createElement('div');
    modeTabs.className = 'col-mode-tabs';
    const tabCond    = document.createElement('button');
    tabCond.className = 'col-mode-tab';
    tabCond.textContent = 'Conditions';
    tabCond.dataset.mode = 'conditions';
    const tabReplace = document.createElement('button');
    tabReplace.className = 'col-mode-tab';
    tabReplace.textContent = 'Replace';
    tabReplace.dataset.mode = 'replace';
    const tabFormula = document.createElement('button');
    tabFormula.className = 'col-mode-tab';
    tabFormula.textContent = 'Formula';
    tabFormula.dataset.mode = 'formula';
    modeTabs.append(tabCond, tabReplace, tabFormula);

    const btnRemoveCard = document.createElement('button');
    btnRemoveCard.className = 'btn-delete';
    btnRemoveCard.textContent = '✕';
    btnRemoveCard.addEventListener('click', () => card.remove());

    header.append(nameInput, modeTabs, btnRemoveCard);
    card.appendChild(header);

    // ── Default value row (shown in Conditions mode) ──
    const defaultRow = document.createElement('div');
    defaultRow.className = 'computed-default-row';
    const defaultLabel = document.createElement('span');
    defaultLabel.className = 'rule-label';
    defaultLabel.textContent = 'Value →';
    const defaultInput = document.createElement('input');
    defaultInput.type = 'text';
    defaultInput.className = 'rule-input transform-default';
    defaultInput.placeholder = '(empty if no rule matches)';
    if (prefill?.defaultVal !== undefined) defaultInput.value = prefill.defaultVal;
    defaultRow.append(defaultLabel, defaultInput);
    card.appendChild(defaultRow);

    // ── Conditions mode body ──
    const condBody = document.createElement('div');
    condBody.className = 'computed-cond-body';

    const ruleGroupsList = document.createElement('div');
    ruleGroupsList.className = 'rules-list';
    condBody.appendChild(ruleGroupsList);

    const condFooter = document.createElement('div');
    condFooter.className = 'computed-card-footer';
    const addRuleBtn = document.createElement('button');
    addRuleBtn.className = 'btn-action';
    addRuleBtn.textContent = '+ Add rule';
    addRuleBtn.addEventListener('click', () => addComputedRuleGroup(ruleGroupsList, table));
    condFooter.appendChild(addRuleBtn);
    condBody.appendChild(condFooter);
    card.appendChild(condBody);

    // ── Replace mode body ──
    const replBody = document.createElement('div');
    replBody.className = 'computed-repl-body';
    replBody.style.display = 'none';

    const sourceRow = document.createElement('div');
    sourceRow.className = 'config-row';
    const sourceLabel = document.createElement('span');
    sourceLabel.className = 'rule-label';
    sourceLabel.textContent = 'Source column:';
    const sourceSel = document.createElement('select');
    sourceSel.className = 'join-select replace-source-col';
    (table?.columns || []).forEach(col => {
        const opt = document.createElement('option');
        opt.value = col; opt.textContent = col;
        sourceSel.appendChild(opt);
    });
    sourceRow.append(sourceLabel, sourceSel);
    replBody.appendChild(sourceRow);

    const pairsList = document.createElement('div');
    pairsList.className = 'replace-pairs-list';
    replBody.appendChild(pairsList);

    const addPairBtn = document.createElement('button');
    addPairBtn.className = 'btn-action';
    addPairBtn.style.marginTop = '4px';
    addPairBtn.textContent = '+ Add pair';
    addPairBtn.addEventListener('click', () => addReplacePair(pairsList));
    replBody.appendChild(addPairBtn);
    card.appendChild(replBody);

    // ── Formula mode body ──
    const formulaBody = document.createElement('div');
    formulaBody.className = 'computed-formula-body';

    const formulaHeaderRow = document.createElement('div');
    formulaHeaderRow.className = 'formula-header-row';
    const colHints = document.createElement('div');
    colHints.className = 'formula-col-hints';
    (table?.columns || []).forEach(col => {
        const chip = document.createElement('span');
        const tok = /^[A-Za-z_]\w*$/.test(col) ? col : `[${col}]`;
        chip.className = 'formula-col-chip';
        chip.textContent = col;
        chip.title = tok !== col ? `Insert [${col}]` : 'Insert column reference';
        chip.addEventListener('click', () => {
            const s = formulaInput.selectionStart, e = formulaInput.selectionEnd;
            formulaInput.value = formulaInput.value.slice(0, s) + tok + formulaInput.value.slice(e);
            formulaInput.setSelectionRange(s + tok.length, s + tok.length);
            formulaInput.focus();
            updatePreview();
        });
        colHints.appendChild(chip);
    });
    const btnFormulaRef = document.createElement('button');
    btnFormulaRef.className = 'btn-formula-ref';
    btnFormulaRef.textContent = '? Reference';
    btnFormulaRef.title = 'Open formula reference';
    btnFormulaRef.addEventListener('click', () => window.electronAPI.openFormulaReference());
    formulaHeaderRow.append(colHints, btnFormulaRef);
    formulaBody.appendChild(formulaHeaderRow);

    const formulaInput = document.createElement('textarea');
    formulaInput.className = 'formula-input';
    formulaInput.rows = 2;
    formulaInput.placeholder = 'ex: LEFT(SIRET, 9)  ·  CONCAT(FirstName, " ", LastName)  ·  IF(ISBLANK(Email), "N/A", LOWER(Email))';
    formulaBody.appendChild(formulaInput);

    const previewRow = document.createElement('div');
    previewRow.className = 'formula-preview-row';
    const previewLabel = document.createElement('span');
    previewLabel.className = 'rule-label';
    previewLabel.textContent = 'Preview →';
    const previewVal = document.createElement('span');
    previewVal.className = 'formula-preview-val';
    previewRow.append(previewLabel, previewVal);
    formulaBody.appendChild(previewRow);
    card.appendChild(formulaBody);

    function updatePreview() {
        const f = formulaInput.value.trim();
        const firstRow = table?.rows?.[0];
        if (!f || !firstRow) { previewVal.textContent = ''; return; }
        const result = DWLogic.evaluateFormula(f, firstRow, table.columns);
        previewVal.textContent = result !== '' ? result : '(vide)';
        previewVal.classList.toggle('formula-preview-empty', result === '');
    }
    formulaInput.addEventListener('input', updatePreview);

    // ── Mode switching ──
    function setMode(mode) {
        const isReplace = mode === 'replace';
        const isFormula = mode === 'formula';
        const isCond    = !isReplace && !isFormula;
        tabCond.classList.toggle('active', isCond);
        tabReplace.classList.toggle('active', isReplace);
        tabFormula.classList.toggle('active', isFormula);
        condBody.style.display     = isCond    ? '' : 'none';
        replBody.style.display     = isReplace ? '' : 'none';
        formulaBody.style.display  = isFormula ? '' : 'none';
        defaultRow.style.display   = isCond    ? '' : 'none';
        defaultLabel.textContent   = condBody.querySelector('.rules-list').children.length > 0
            ? 'Default →' : 'Value →';
    }

    tabCond.addEventListener('click',    () => setMode('conditions'));
    tabReplace.addEventListener('click', () => setMode('replace'));
    tabFormula.addEventListener('click', () => { setMode('formula'); updatePreview(); });

    // Restore from prefill
    if (prefill?.formula !== undefined) {
        // Resolve {{id}} tokens to current display names for editing
        const displayFormula = table?.columnDefs
            ? prefill.formula.replace(/\{\{([^}]+)\}\}/g, (_, id) => {
                const def = table.columnDefs.find(d => d.id === id);
                if (!def) return id;
                return /^[A-Za-z_]\w*$/.test(def.name) ? def.name : `[${def.name}]`;
            })
            : prefill.formula;
        formulaInput.value = displayFormula;
        if (prefill.id) card.dataset.colId = prefill.id;
        setMode('formula');
        updatePreview();
    } else if (prefill?.replaceCol) {
        if (prefill.id) card.dataset.colId = prefill.id;
        if ([...sourceSel.options].some(o => o.value === prefill.replaceCol)) {
            sourceSel.value = prefill.replaceCol;
        }
        (prefill.replacements || []).forEach(p => addReplacePair(pairsList, p.from, p.to));
        setMode('replace');
    } else {
        if (prefill?.id) card.dataset.colId = prefill.id;
        (prefill?.rules || []).forEach(rule => {
            addComputedRuleGroup(ruleGroupsList, table, rule);
        });
        setMode('conditions');
    }

    // Update label when rules are added/removed
    ruleGroupsList.addEventListener('DOMSubtreeModified', () => {
        defaultLabel.textContent = ruleGroupsList.children.length > 0 ? 'Default →' : 'Value →';
    });

    container.appendChild(card);
    nameInput.focus();
}

function addReplacePair(pairsList, fromVal = '', toVal = '') {
    const row = document.createElement('div');
    row.className = 'replace-pair-row';
    const fromInput = document.createElement('input');
    fromInput.type = 'text'; fromInput.className = 'rule-input replace-from';
    fromInput.placeholder = 'old value'; fromInput.value = fromVal;
    const arrow = document.createElement('span');
    arrow.className = 'replace-arrow'; arrow.textContent = '→';
    const toInput = document.createElement('input');
    toInput.type = 'text'; toInput.className = 'rule-input replace-to';
    toInput.placeholder = 'new value'; toInput.value = toVal;
    const btnDel = document.createElement('button');
    btnDel.className = 'btn-delete btn-delete-sm'; btnDel.textContent = '✕';
    btnDel.addEventListener('click', () => row.remove());
    row.append(fromInput, arrow, toInput, btnDel);
    pairsList.appendChild(row);
    fromInput.focus();
}

function addComputedRuleGroup(container, table, prefill = null) {
    const group = document.createElement('div');
    group.className = 'computed-rule-group';

    const condsList = document.createElement('div');
    condsList.className = 'conditions-list';
    group.appendChild(condsList);

    const logicInput = document.createElement('input');
    logicInput.type = 'text';
    logicInput.className = 'rule-input row-logic-input';
    logicInput.placeholder = 'e.g. 1 AND (2 OR 3)';
    if (prefill?.logic) logicInput.value = prefill.logic;

    // Restore or add first condition
    if (prefill?.conditions?.length) {
        prefill.conditions.forEach(c => addRowCondition(condsList, logicInput, table, c));
    } else {
        addRowCondition(condsList, logicInput, table);
    }

    const addCondRow = document.createElement('div');
    addCondRow.className = 'add-cond-row';
    const addCondBtn = document.createElement('button');
    addCondBtn.className = 'btn-action';
    addCondBtn.textContent = '+ condition';
    addCondBtn.addEventListener('click', () => addRowCondition(condsList, logicInput, table));
    addCondRow.appendChild(addCondBtn);
    group.appendChild(addCondRow);

    const footer = document.createElement('div');
    footer.className = 'computed-rule-footer';

    const logicLabel = document.createElement('span');
    logicLabel.className = 'rule-label';
    logicLabel.textContent = 'Logic:';

    const arrow = document.createElement('span');
    arrow.className = 'rule-label';
    arrow.textContent = '→';

    const thenInput = document.createElement('input');
    thenInput.type = 'text';
    thenInput.className = 'rule-input rule-then';
    thenInput.placeholder = 'output…';
    if (prefill?.then !== undefined) thenInput.value = prefill.then;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-delete btn-delete-sm';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => group.remove());

    footer.append(logicLabel, logicInput, arrow, thenInput, removeBtn);
    group.appendChild(footer);
    container.appendChild(group);
}

function gatherComputedColumns() {
    return [...resultConfig.querySelectorAll('.computed-col-card')].map(card => {
        const name = card.querySelector('.transform-name-input')?.value.trim() || '';
        if (!name) return null;
        const isFormula = card.querySelector('.col-mode-tab[data-mode="formula"]')?.classList.contains('active');
        if (isFormula) {
            const srcTable = tables.find(t => t.id === document.getElementById('rc-transform-table')?.value);
            const rawFormula = card.querySelector('.formula-input')?.value.trim() || '';
            const formula = srcTable?.columnDefs ? formulaToIds(rawFormula, srcTable.columnDefs) : rawFormula;
            return { name, id: card.dataset.colId || genColId(), formula };
        }
        const isReplace = card.querySelector('.col-mode-tab[data-mode="replace"]')?.classList.contains('active');
        if (isReplace) {
            return {
                name,
                id:         card.dataset.colId || genColId(),
                replaceCol: card.querySelector('.replace-source-col')?.value || '',
                replacements: [...card.querySelectorAll('.replace-pair-row')].map(row => ({
                    from: row.querySelector('.replace-from')?.value ?? '',
                    to:   row.querySelector('.replace-to')?.value   ?? ''
                })).filter(p => p.from !== '' || p.to !== '')
            };
        }
        return {
            name,
            id:    card.dataset.colId || genColId(),
            rules: [...card.querySelectorAll('.computed-rule-group')].map(group => ({
                conditions: [...group.querySelectorAll('.row-condition-item')].map(item => ({
                    col:   item.querySelector('.rule-col-sel')?.value  || '',
                    op:    item.querySelector('.rule-op-sel')?.value   || '=',
                    value: item.querySelector('.rule-val-input')?.value || ''
                })),
                logic: group.querySelector('.row-logic-input')?.value.trim() || '',
                then:  group.querySelector('.rule-then')?.value ?? ''
            })).filter(r => r.conditions.length > 0),
            defaultVal: card.querySelector('.transform-default')?.value ?? ''
        };
    }).filter(Boolean);
}

function gatherRowFilter() {
    const action = resultConfig.querySelector('.row-filter-action')?.value || 'keep';
    const condsList = resultConfig.querySelector('.row-filter-conditions');
    const conditions = [...(condsList?.querySelectorAll('.row-condition-item') || [])].map(item => ({
        col:   item.querySelector('.rule-col-sel')?.value  || '',
        op:    item.querySelector('.rule-op-sel')?.value   || '=',
        value: item.querySelector('.rule-val-input')?.value || ''
    })).filter(c => c.col);
    if (!conditions.length) return null;
    const logic = resultConfig.querySelector('.row-filter-logic')?.value.trim() || '';
    return { action, conditions, logic };
}

function makeConditionColSel(table) {
    const colSel = document.createElement('select');
    colSel.className = 'join-select rule-col-sel';
    (table?.columnDefs || (table?.columns || []).map(n => ({ id: n, name: n }))).forEach(def => {
        const opt = document.createElement('option');
        opt.value = def.id; opt.textContent = def.name;
        colSel.appendChild(opt);
    });
    return colSel;
}

function makeConditionOpSel() {
    const opSel = document.createElement('select');
    opSel.className = 'join-select rule-op-sel';
    [
        ['=','='], ['≠','≠'],
        ['contains','contains'], ['starts_with','starts with'],
        ['empty','is empty'], ['not_empty','is not empty'],
        ['>','>'], ['<','<'], ['>=','≥'], ['<=','≤'],
    ].forEach(([v, t]) => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = t;
        opSel.appendChild(opt);
    });
    return opSel;
}

function addRowCondition(conditionsList, logicInput, table, prefill = null) {
    const item = document.createElement('div');
    item.className = 'row-condition-item';

    const numLabel = document.createElement('span');
    numLabel.className = 'condition-num rule-label';

    const colSel = makeConditionColSel(table);
    const opSel  = makeConditionOpSel();

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'rule-input rule-val-input';
    valInput.placeholder = 'value…';

    const numericOps = new Set(['>', '<', '>=', '<=']);
    opSel.addEventListener('change', () => {
        const isNoVal  = opSel.value === 'empty' || opSel.value === 'not_empty';
        const isNum    = numericOps.has(opSel.value);
        valInput.style.display  = isNoVal ? 'none' : '';
        valInput.type           = isNum ? 'number' : 'text';
        valInput.placeholder    = isNum ? '0' : 'value…';
        valInput.step           = isNum ? 'any' : undefined;
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-delete btn-delete-sm';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
        item.remove();
        renumberConditions(conditionsList);
        if (logicInput) updateLogicDefault(conditionsList, logicInput);
    });

    item.append(numLabel, colSel, opSel, valInput, removeBtn);
    conditionsList.appendChild(item);
    renumberConditions(conditionsList);
    if (logicInput) updateLogicDefault(conditionsList, logicInput);

    // Restore saved values
    if (prefill) {
        if (prefill.col !== undefined) colSel.value = prefill.col;
        if (prefill.op  !== undefined) { opSel.value = prefill.op; opSel.dispatchEvent(new Event('change')); }
        if (prefill.value !== undefined) valInput.value = prefill.value;
    }
}

function renumberConditions(conditionsList) {
    conditionsList.querySelectorAll('.row-condition-item .condition-num').forEach((el, i) => {
        el.textContent = `${i + 1}.`;
    });
}

function updateLogicDefault(conditionsList, logicInput) {
    const n = conditionsList.querySelectorAll('.row-condition-item').length;
    const prevAuto = logicInput.dataset.autoExpr || '';
    const newAuto  = n > 1 ? Array.from({length: n}, (_, i) => i + 1).join(' AND ') : '';
    // Only overwrite if user hasn't deviated from the auto-generated expression
    if (!logicInput.value.trim() || logicInput.value === prevAuto) {
        logicInput.value = newAuto;
    }
    logicInput.dataset.autoExpr = newAuto;
}

// ── Split config ───────────────────────────────────

function renderGroupConfig() {
    // ── Source table row ──
    const sourceRow = document.createElement('div');
    sourceRow.className = 'config-row';
    const sourceLabel = document.createElement('span');
    sourceLabel.className = 'section-label';
    sourceLabel.textContent = 'Source table';
    const sourceSel = makeTableSelect('rc-group-table', 0);
    sourceRow.append(sourceLabel, sourceSel);
    resultConfig.appendChild(sourceRow);

    // ── Group-by column row ──
    const groupRow = document.createElement('div');
    groupRow.className = 'config-row';
    const groupLabel = document.createElement('span');
    groupLabel.className = 'section-label';
    groupLabel.textContent = 'Group by';
    const groupColSel = document.createElement('select');
    groupColSel.className = 'join-select';
    groupColSel.id = 'rc-group-col';
    groupRow.append(groupLabel, groupColSel);
    resultConfig.appendChild(groupRow);

    // ── Aggregation list ──
    const aggSection = document.createElement('div');
    aggSection.className = 'group-agg-section';
    const aggTitle = document.createElement('div');
    aggTitle.className = 'section-label';
    aggTitle.style.marginTop = '10px';
    aggTitle.textContent = 'For other columns';
    const aggList = document.createElement('div');
    aggList.id = 'group-agg-list';
    aggList.className = 'group-agg-list';
    aggSection.append(aggTitle, aggList);
    resultConfig.appendChild(aggSection);

    function rebuildAggList() {
        const src = tables.find(t => t.id === sourceSel.value);
        const groupColId = groupColSel.value;

        // Rebuild group col options
        groupColSel.innerHTML = '';
        (src?.columnDefs || src?.columns?.map(n => ({ id: n, name: n })) || []).forEach(def => {
            const opt = document.createElement('option');
            opt.value = def.id;
            opt.textContent = def.name;
            groupColSel.appendChild(opt);
        });
        if (groupColId && [...groupColSel.options].some(o => o.value === groupColId)) {
            groupColSel.value = groupColId;
        }

        // Rebuild agg rows (all columns except the group key)
        aggList.innerHTML = '';
        if (!src) return;
        const defs = src.columnDefs || src.columns.map(n => ({ id: n, name: n }));
        defs.filter(d => d.id !== groupColSel.value).forEach(def => {
            aggList.appendChild(makeGroupAggRow(def));
        });
    }

    sourceSel.addEventListener('change', rebuildAggList);
    groupColSel.addEventListener('change', rebuildAggList);
    rebuildAggList();
}

function makeGroupAggRow(def, prefill = null) {
    const row = document.createElement('div');
    row.className = 'group-agg-row';
    row.dataset.colId = def.id;

    const label = document.createElement('span');
    label.className = 'group-agg-col-name';
    label.textContent = def.name;
    label.title = def.name;

    const btnGroup = document.createElement('div');
    btnGroup.className = 'group-agg-btns';

    const activeAgg = prefill?.agg || 'first';
    const isConcat = activeAgg === 'concat_unique' || activeAgg === 'concat_all';

    const sepInput = document.createElement('input');
    sepInput.type = 'text';
    sepInput.className = 'group-agg-sep';
    sepInput.placeholder = ';';
    sepInput.value = prefill?.separator ?? ';';
    sepInput.style.display = isConcat ? '' : 'none';

    const zeroLabel = document.createElement('label');
    zeroLabel.className = 'group-agg-zero';
    zeroLabel.title = 'Treat blank, null or invalid values as 0';
    zeroLabel.style.display = ['sum', 'avg'].includes(activeAgg) ? '' : 'none';
    const zeroCb = document.createElement('input');
    zeroCb.type = 'checkbox';
    zeroCb.checked = prefill?.treatBlankAsZero ?? false;
    zeroLabel.append(zeroCb, 'Blank = 0');

    const uniqueLabel = document.createElement('label');
    uniqueLabel.className = 'group-agg-unique';
    uniqueLabel.title = 'Remove duplicate values from the concatenation';
    uniqueLabel.style.display = isConcat ? '' : 'none';
    const uniqueCb = document.createElement('input');
    uniqueCb.type = 'checkbox';
    uniqueCb.checked = activeAgg !== 'concat_all';
    uniqueLabel.append(uniqueCb, 'Unique');

    // The concat button's data-agg is kept in sync by the uniqueCb
    uniqueCb.addEventListener('change', () => {
        const concatBtn = btnGroup.querySelector('.group-agg-btn.active');
        if (concatBtn && (concatBtn.dataset.agg === 'concat_unique' || concatBtn.dataset.agg === 'concat_all')) {
            concatBtn.dataset.agg = uniqueCb.checked ? 'concat_unique' : 'concat_all';
        }
    });

    [['first', 'First'], ['sum', 'Sum'], ['avg', 'Avg'], ['max', 'Max'], ['min', 'Min'], [isConcat ? activeAgg : 'concat_unique', 'Concat']].forEach(([v, lbl]) => {
        const btn = document.createElement('button');
        const isActive = isConcat ? lbl === 'Concat' : v === activeAgg;
        btn.className = 'group-agg-btn' + (isActive ? ' active' : '');
        btn.dataset.agg = v;
        btn.textContent = lbl;
        btn.type = 'button';
        btn.addEventListener('click', () => {
            btnGroup.querySelectorAll('.group-agg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const nowConcat = btn.dataset.agg === 'concat_unique' || btn.dataset.agg === 'concat_all';
            sepInput.style.display = nowConcat ? '' : 'none';
            uniqueLabel.style.display = nowConcat ? '' : 'none';
            zeroLabel.style.display = ['sum', 'avg'].includes(btn.dataset.agg) ? '' : 'none';
            if (nowConcat) {
                // Default to unique=true when first switching to concat
                uniqueCb.checked = true;
                btn.dataset.agg = 'concat_unique';
            }
        });
        btnGroup.appendChild(btn);
    });

    row.append(label, btnGroup, sepInput, uniqueLabel, zeroLabel);
    return row;
}

function renderSplitConfig() {
    // Source table row
    const sourceRow = document.createElement('div');
    sourceRow.className = 'config-row';
    const sourceLabel = document.createElement('span');
    sourceLabel.className = 'section-label';
    sourceLabel.textContent = 'Source table';
    const sourceSel = makeTableSelect('rc-split-table', 0);
    sourceRow.append(sourceLabel, sourceSel);
    resultConfig.appendChild(sourceRow);

    // Branch list
    const branchList = document.createElement('div');
    branchList.className = 'split-branch-list';
    branchList.id = 'split-branch-list';
    resultConfig.appendChild(branchList);

    // Duplicate-condition warning (shown by checkSplitDuplicates)
    const dupWarning = document.createElement('div');
    dupWarning.className = 'split-dup-warning hidden';
    dupWarning.textContent = '⚠ Two or more branches have identical conditions — duplicate rows will be produced.';
    resultConfig.appendChild(dupWarning);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.className = 'split-btn-row';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-action';
    addBtn.textContent = '+ Add Branch';
    addBtn.addEventListener('click', () => { addSplitBranch(branchList, tables.find(t => t.id === sourceSel.value)); checkSplitDuplicates(); });

    const addDefaultBtn = document.createElement('button');
    addDefaultBtn.className = 'btn-action split-add-default-btn';
    addDefaultBtn.textContent = '+ Default Branch';
    addDefaultBtn.title = 'Add a catch-all branch that captures everything not matched by the other branches';
    const syncDefaultBtn = () => {
        addDefaultBtn.disabled = !!branchList.querySelector('.split-branch--default');
    };
    addDefaultBtn.addEventListener('click', () => {
        addSplitBranch(branchList, tables.find(t => t.id === sourceSel.value), null, true);
        syncDefaultBtn();
    });
    branchList.addEventListener('DOMNodeRemoved', () => setTimeout(syncDefaultBtn, 0));

    btnRow.append(addBtn, addDefaultBtn);
    resultConfig.appendChild(btnRow);

    // Two starter branches
    addSplitBranch(branchList, tables.find(t => t.id === sourceSel.value));
    addSplitBranch(branchList, tables.find(t => t.id === sourceSel.value));

    sourceSel.addEventListener('change', () => {
        const src = tables.find(t => t.id === sourceSel.value);
        branchList.querySelectorAll('.split-branch').forEach(b => refreshSplitBranchCols(b, src));
    });
}

function checkSplitDuplicates() {
    const warning = document.querySelector('.split-dup-warning');
    if (!warning) return;
    const conditions = [...document.querySelectorAll('#split-branch-list .split-branch:not(.split-branch--default)')]
        .map(b => {
            const op  = b.querySelector('.split-cond-op')?.value  || '=';
            const col = b.querySelector('.split-cond-col')?.value  || '';
            const val = (op === 'empty' || op === 'not_empty') ? '' : (b.querySelector('.split-cond-val')?.value || '');
            return `${col}|${op}|${val}`;
        });
    const hasDup = conditions.length !== new Set(conditions).size;
    warning.classList.toggle('hidden', !hasDup);
}

function addSplitBranch(branchList, src, prefill = null, isDefault = false) {
    const idx = branchList.querySelectorAll('.split-branch:not(.split-branch--default)').length + 1;
    const branch = document.createElement('div');
    branch.className = isDefault ? 'split-branch split-branch--default' : 'split-branch';
    branch.dataset.isDefault = isDefault ? '1' : '';

    const header = document.createElement('div');
    header.className = 'split-branch-header';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'rule-input split-branch-label';
    labelInput.placeholder = isDefault ? 'Default branch name…' : `Branch ${idx} name…`;
    if (prefill?.label) labelInput.value = prefill.label;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-delete btn-delete-sm';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => { branch.remove(); checkSplitDuplicates(); });

    header.append(labelInput, removeBtn);
    branch.appendChild(header);

    if (isDefault) {
        const hint = document.createElement('span');
        hint.className = 'split-default-hint';
        hint.textContent = 'Catches all rows not matched by any other branch';
        branch.appendChild(hint);
        branchList.appendChild(branch);
        return;
    }

    // Condition row (non-default branches only)
    const condRow = document.createElement('div');
    condRow.className = 'split-cond-row';

    const colSel = makeConditionColSel(src);
    colSel.className += ' split-cond-col';
    if (prefill?.condition?.col) colSel.value = prefill.condition.col;

    const opSel = makeConditionOpSel();
    opSel.className += ' split-cond-op';

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'rule-input rule-val-input split-cond-val';
    valInput.placeholder = 'value…';

    const numericOps = new Set(['>', '<', '>=', '<=']);
    opSel.addEventListener('change', () => {
        const isNoVal = opSel.value === 'empty' || opSel.value === 'not_empty';
        const isNum   = numericOps.has(opSel.value);
        valInput.style.display = isNoVal ? 'none' : '';
        valInput.type          = isNum ? 'number' : 'text';
        valInput.placeholder   = isNum ? '0' : 'value…';
        checkSplitDuplicates();
    });
    colSel.addEventListener('change', checkSplitDuplicates);
    valInput.addEventListener('input', checkSplitDuplicates);

    if (prefill?.condition) {
        opSel.value    = prefill.condition.op    || '=';
        valInput.value = prefill.condition.value || '';
        opSel.dispatchEvent(new Event('change'));
    }

    condRow.append(colSel, opSel, valInput);
    branch.appendChild(condRow);
    branchList.appendChild(branch);
}

function refreshSplitBranchCols(branchEl, src) {
    const colSel = branchEl.querySelector('.split-cond-col');
    if (!colSel) return;
    const prev = colSel.value;
    colSel.innerHTML = '';
    (src?.columnDefs || (src?.columns || []).map(n => ({ id: n, name: n }))).forEach(def => {
        const opt = document.createElement('option');
        opt.value = def.id; opt.textContent = def.name;
        colSel.appendChild(opt);
    });
    if (prev) colSel.value = prev;
}

function gatherSplitBranches() {
    return [...document.querySelectorAll('#split-branch-list .split-branch')].map(b => {
        const isDefault = b.dataset.isDefault === '1';
        return {
            label:     b.querySelector('.split-branch-label')?.value.trim() || '',
            isDefault,
            condition: isDefault ? null : {
                col:   b.querySelector('.split-cond-col')?.value  || '',
                op:    b.querySelector('.split-cond-op')?.value   || '=',
                value: b.querySelector('.split-cond-val')?.value  || ''
            }
        };
    });
}

function renderStackConfig() {
    const tableRow = document.createElement('div');
    tableRow.className = 'stack-config-row';

    const leftSide = document.createElement('div');
    leftSide.className = 'join-key-side';
    const leftLabel = document.createElement('span');
    leftLabel.className = 'section-label';
    leftLabel.textContent = 'Top table';
    const leftTableSel = makeTableSelect('rc-left-table', 0);
    leftSide.append(leftLabel, leftTableSel);

    const arrow = document.createElement('span');
    arrow.className = 'stack-sep-arrow';
    arrow.textContent = '↕';

    const rightSide = document.createElement('div');
    rightSide.className = 'join-key-side';
    const rightLabel = document.createElement('span');
    rightLabel.className = 'section-label';
    rightLabel.textContent = 'Bottom table';
    const rightTableSel = makeTableSelect('rc-right-table', 1);
    rightSide.append(rightLabel, rightTableSel);

    tableRow.append(leftSide, arrow, rightSide);
    resultConfig.appendChild(tableRow);

    renderStackMapping(leftTableSel.value, rightTableSel.value);

    leftTableSel.addEventListener('change',  () => renderStackMapping(leftTableSel.value, rightTableSel.value));
    rightTableSel.addEventListener('change', () => renderStackMapping(leftTableSel.value, rightTableSel.value));
}

function renderStackMapping(leftId, rightId, existingMapping = null) {
    resultConfig.querySelector('.stack-mapping-area')?.remove();

    const L = tables.find(t => t.id === leftId);
    const R = tables.find(t => t.id === rightId);
    if (!L || !R || leftId === rightId) return;

    const lDefs = L.columnDefs || L.columns.map(n => ({ id: n, name: n }));
    const rDefs = R.columnDefs || R.columns.map(n => ({ id: n, name: n }));

    const area = document.createElement('div');
    area.className = 'stack-mapping-area';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'stack-mapping-header';

    const title = document.createElement('span');
    title.className = 'section-label';
    title.textContent = 'Column mapping';

    const btnAutoMap = document.createElement('button');
    btnAutoMap.className = 'btn-action';
    btnAutoMap.textContent = '⟳ Auto-map by name';
    btnAutoMap.title = 'Reset mapping — match columns that share the same name';

    header.append(title, btnAutoMap);
    area.appendChild(header);

    // ── Column headers ──
    const colHeaders = document.createElement('div');
    colHeaders.className = 'stack-mapping-col-headers';
    const lh = document.createElement('span');
    lh.className = 'stack-col-header';
    lh.textContent = L.name;
    const rh = document.createElement('span');
    rh.className = 'stack-col-header';
    rh.textContent = R.name;
    colHeaders.append(lh, rh);
    area.appendChild(colHeaders);

    // ── Mapping list ──
    const list = document.createElement('div');
    list.className = 'stack-mapping-list';
    area.appendChild(list);

    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn-action';
    btnAdd.textContent = '+ Add row';
    btnAdd.addEventListener('click', () => addStackMappingRow(list, lDefs, rDefs));
    area.appendChild(btnAdd);

    function buildAutoMapping() {
        const usedRight = new Set();
        const rows = lDefs.map(lDef => {
            const rDef = rDefs.find(d => d.name === lDef.name);
            if (rDef) usedRight.add(rDef.id);
            return { leftColId: lDef.id, rightColId: rDef?.id || null, outputColId: lDef.id };
        });
        rDefs.filter(d => !usedRight.has(d.id)).forEach(rDef => {
            rows.push({ leftColId: null, rightColId: rDef.id, outputColId: rDef.id });
        });
        return rows;
    }

    function loadMapping(mapping) {
        list.innerHTML = '';
        mapping.forEach(m => addStackMappingRow(list, lDefs, rDefs, m));
    }

    btnAutoMap.addEventListener('click', () => loadMapping(buildAutoMapping()));

    loadMapping(existingMapping || buildAutoMapping());

    resultConfig.appendChild(area);
}

function addStackMappingRow(list, lDefs, rDefs, prefill = null) {
    const row = document.createElement('div');
    row.className = 'stack-mapping-row';
    row.dataset.outputColId = prefill?.outputColId || genColId();

    const makeSel = (defs) => {
        const sel = document.createElement('select');
        sel.className = 'join-select stack-col-sel';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '— none —';
        sel.appendChild(none);
        defs.forEach(def => {
            const opt = document.createElement('option');
            opt.value = def.id;
            opt.textContent = def.name;
            sel.appendChild(opt);
        });
        return sel;
    };

    const lSel = makeSel(lDefs);
    const rSel = makeSel(rDefs);
    if (prefill?.leftColId)  lSel.value = prefill.leftColId;
    if (prefill?.rightColId) rSel.value = prefill.rightColId;

    const link = document.createElement('span');
    link.className = 'stack-mapping-link';
    link.textContent = '↔';

    const btnRemove = document.createElement('button');
    btnRemove.className = 'btn-delete btn-delete-sm';
    btnRemove.textContent = '✕';
    btnRemove.addEventListener('click', () => row.remove());

    row.append(lSel, link, rSel, btnRemove);
    list.appendChild(row);
}

function gatherStackMapping() {
    return [...resultConfig.querySelectorAll('.stack-mapping-row')].map(row => {
        const sels = row.querySelectorAll('.stack-col-sel');
        return {
            leftColId:   sels[0]?.value || null,
            rightColId:  sels[1]?.value || null,
            outputColId: row.dataset.outputColId
        };
    }).filter(m => m.leftColId || m.rightColId);
}

const btnDeleteResult = document.getElementById('btn-delete-result');

btnDeleteResult.addEventListener('click', () => {
    if (!editingTableEntry) return;
    const t = editingTableEntry;
    const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
    if (!deleteTableSafe(t, card, resultError)) return;

    editingTableEntry = null;
    unlockOpTiles();
    btnCreateResult.textContent = 'Create Result';
    btnDeleteResult.style.display = 'none';
    resultError.classList.remove('visible');
    resultPanel.classList.remove('open');
    btnResult.classList.remove('active-toggle');
    btnResult.textContent = '+ Add Result';
});

btnCreateResult.addEventListener('click', () => {
    resultError.classList.remove('visible');

    let recipe;

    if (currentOp === 'split') {
        const sourceSel = document.getElementById('rc-split-table');
        if (!sourceSel?.value) { showError(resultError, 'Select a source table.'); return; }
        const branches = gatherSplitBranches();
        if (branches.length === 0) { showError(resultError, 'Add at least one branch.'); return; }

        if (editingTableEntry !== null) {
            // Editing: update this single split table's condition/name
            const tbl = editingTableEntry;
            const branch = branches[0];
            const recipe = {
                op: 'split', sourceId: sourceSel.value,
                splitGroupId: tbl.recipe?.splitGroupId,
                isDefault:    tbl.recipe?.isDefault || false,
                condition:    branch.isDefault ? null : branch.condition
            };
            const { columnDefs, columns, rows } = computeFromRecipe(recipe);
            const mergedDefs1 = preserveResultRenames(tbl.columnDefs, columnDefs);
            tbl.columnDefs = mergedDefs1;
            tbl.columns    = mergedDefs1.map(d => d.name);
            tbl.rows       = rows.map(r => [...r]);
            tbl.recipe     = recipe;
            tbl.stale      = false;
            tbl.isSnapshot = false;
            tbl.lastRun    = new Date().toISOString();
            if (branch.label) tbl.name = branch.label;
            tbl.description = resultDescription.value.trim() || null;
            updateBindingsHint();
            const existingCard = document.querySelector(`.table-card[data-table-id="${tbl.id}"]`);
            if (existingCard) {
                existingCard.querySelector('.table-name-display')?.replaceWith((() => { const s = document.createElement('span'); s.className = 'table-name-display'; s.textContent = tbl.name; return s; })());
                renderTableBody(existingCard.querySelector('.table-wrapper'), tbl);
                const rc = existingCard.querySelector('.row-count');
                if (rc) rc.textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''}`;
                existingCard.querySelector('.stale-banner')?.classList.remove('visible');
                existingCard.classList.remove('recalc-flash');
                void existingCard.offsetWidth;
                existingCard.classList.add('recalc-flash');
                existingCard.addEventListener('animationend', () => existingCard.classList.remove('recalc-flash'), { once: true });
            }
            markDependentsStale(tbl.id);
            // If this was a non-default branch, mark any sibling default branch stale
            if (!recipe.isDefault && recipe.splitGroupId) {
                tables.forEach(t => {
                    if (t.source === 'result' && t.recipe?.splitGroupId === recipe.splitGroupId && t.recipe?.isDefault) {
                        t.stale = true;
                        document.querySelector(`.table-card[data-table-id="${t.id}"] .stale-banner`)?.classList.add('visible');
                    }
                });
            }
            renderSchema();
            editingTableEntry = null;
            unlockOpTiles();
            btnCreateResult.textContent = 'Create Result';
            btnDeleteResult.style.display = 'none';
            resultPanel.classList.remove('open');
            btnResult.classList.remove('active-toggle');
            btnResult.textContent = '+ Add Result';
        } else {
            // Create all branches as separate result tables sharing a splitGroupId
            const splitGroupId = genColId();
            const desc = resultDescription.value.trim() || null;
            branches.forEach(branch => {
                const recipe = {
                    op: 'split', sourceId: sourceSel.value, splitGroupId,
                    isDefault: branch.isDefault || false,
                    condition: branch.isDefault ? null : branch.condition
                };
                const { columnDefs, columns, rows } = computeFromRecipe(recipe);
                const name = branch.label || `Split ${++tableCounter}`;
                addTable({ name, source: 'result', columns, columnDefs, rows, totalSize: rows.length, recipe, description: desc });
            });
            resultPanel.classList.remove('open');
            btnResult.classList.remove('active-toggle');
            btnResult.textContent = '+ Add Result';
        }
        return;

    } else if (currentOp === 'transform') {
        const sourceSel = document.getElementById('rc-transform-table');
        if (!sourceSel?.value) { showError(resultError, 'Select a table.'); return; }
        const keptCols = [...resultConfig.querySelectorAll('.transform-col-chip.selected')].map(c => c.dataset.colId);
        const computedCols = gatherComputedColumns();
        if (keptCols.length === 0 && computedCols.length === 0) {
            showError(resultError, 'Select at least one column or add a computed column.'); return;
        }
        recipe = { op: 'transform', sourceId: sourceSel.value, keptCols, computedCols, rowFilter: gatherRowFilter() };

    } else if (currentOp === 'stack') {
        const lSel = document.getElementById('rc-left-table');
        const rSel = document.getElementById('rc-right-table');
        if (!lSel || !rSel || !lSel.value || !rSel.value) { showError(resultError, 'Select two tables.'); return; }
        if (lSel.value === rSel.value) { showError(resultError, 'Select two different tables.'); return; }
        const columnMapping = gatherStackMapping();
        if (columnMapping.length === 0) { showError(resultError, 'Add at least one column mapping.'); return; }
        recipe = { op: 'stack', leftId: lSel.value, rightId: rSel.value, columnMapping };

    } else if (currentOp === 'group') {
        const sourceSel = document.getElementById('rc-group-table');
        const groupColSel = document.getElementById('rc-group-col');
        if (!sourceSel?.value) { showError(resultError, 'Select a source table.'); return; }
        if (!groupColSel?.value) { showError(resultError, 'Select a column to group by.'); return; }
        // Preserve stable IDs from existing recipe if editing, otherwise generate fresh ones
        const existingRecipe = editingTableEntry?.recipe?.op === 'group' ? editingTableEntry.recipe : null;
        const aggregations = [...document.querySelectorAll('#group-agg-list .group-agg-row')].map(row => {
            const colId = row.dataset.colId;
            const agg   = row.querySelector('.group-agg-btn.active')?.dataset.agg || 'first';
            const sep   = row.querySelector('.group-agg-sep').value;
            const treatBlankAsZero = row.querySelector('.group-agg-zero input')?.checked ?? false;
            const existing = existingRecipe?.aggregations?.find(a => a.colId === colId);
            return { colId, agg, outColId: existing?.outColId || genColId(), separator: sep, treatBlankAsZero };
        });
        const countColId = existingRecipe?.countColId || genColId();
        recipe = { op: 'group', sourceId: sourceSel.value, groupColId: groupColSel.value, countColId, aggregations };

    } else {
        const lSel = document.getElementById('rc-left-table');
        const rSel = document.getElementById('rc-right-table');
        if (!lSel || !rSel || !lSel.value || !rSel.value) { showError(resultError, 'Select two tables.'); return; }
        if (lSel.value === rSel.value) { showError(resultError, 'Select two different tables.'); return; }
        const leftCol = document.getElementById('rc-left-col')?.value;
        const rightCol = document.getElementById('rc-right-col')?.value;
        if (!leftCol || !rightCol) { showError(resultError, 'Select key columns.'); return; }
        const caseInsensitive = document.getElementById('rc-case-insensitive')?.checked || false;

        if (currentOp === 'enrich') {
            const selected = [...resultConfig.querySelectorAll('.col-chip.selected')];
            if (selected.length === 0) { showError(resultError, 'Select at least one column.'); return; }
            recipe = {
                op: 'enrich',
                leftId: lSel.value, rightId: rSel.value, leftCol, rightCol,
                caseInsensitive,
                selectedCols: selected.map(chip => ({ colId: chip.dataset.colId }))
            };
        } else {
            recipe = { op: currentOp, leftId: lSel.value, rightId: rSel.value, leftCol, rightCol, caseInsensitive };
        }
    }

    const { columnDefs, columns, rows } = computeFromRecipe(recipe);

    if (editingTableEntry !== null) {
        // Update existing result card in place
        const tbl = editingTableEntry;
        const mergedDefs = preserveResultRenames(tbl.columnDefs, columnDefs);
        tbl.columnDefs = mergedDefs;
        tbl.columns    = mergedDefs.map(d => d.name);
        tbl.rows       = rows.map(r => [...r]);
        tbl.recipe     = recipe;
        tbl.stale      = false;
        tbl.isSnapshot = false;
        tbl.lastRun    = new Date().toISOString();
        tbl.description = resultDescription.value.trim() || null;
        updateBindingsHint();
        const existingCard = document.querySelector(`.table-card[data-table-id="${tbl.id}"]`);
        if (existingCard) {
            renderTableBody(existingCard.querySelector('.table-wrapper'), tbl);
            const rc = existingCard.querySelector('.row-count');
            if (rc) rc.textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''}`;
            existingCard.querySelector('.stale-banner')?.classList.remove('visible');
            existingCard.classList.remove('recalc-flash');
            void existingCard.offsetWidth;
            existingCard.classList.add('recalc-flash');
            existingCard.addEventListener('animationend', () => existingCard.classList.remove('recalc-flash'), { once: true });
        }
        markDependentsStale(tbl.id);
        renderSchema();
        editingTableEntry = null;
        unlockOpTiles();
        btnCreateResult.textContent = 'Create Result';
        btnDeleteResult.style.display = 'none';
    } else {
        addTable({ name: `Result ${++tableCounter}`, source: 'result', columns, columnDefs, rows, totalSize: rows.length, recipe, description: resultDescription.value.trim() || null });
    }

    resultPanel.classList.remove('open');
    btnResult.classList.remove('active-toggle');
    btnResult.textContent = '+ Add Result';
});

function openResultPanelForEdit(tableEntry) {
    editingTableEntry = tableEntry;
    const op = tableEntry.recipe?.op || 'transform';
    currentOp = op;
    opTilesEl.classList.add('op-tiles--locked');
    document.querySelectorAll('.op-tile').forEach(t => t.classList.remove('active'));
    document.querySelector(`.op-tile[data-op="${op}"]`)?.classList.add('active');
    renderResultConfig();

    resultPanel.classList.add('open');
    btnResult.classList.add('active-toggle');
    btnResult.textContent = '✕ Close';
    addPanel.classList.remove('open');
    btnAdd.classList.remove('active-toggle');
    btnAdd.textContent = '+ Add Table';
    btnCreateResult.textContent = '↻ Update Result';
    btnDeleteResult.style.display = '';
    resultDescription.value = tableEntry.description || '';

    setTimeout(() => populateResultFromRecipe(tableEntry.recipe), 0);
}

function populateResultFromRecipe(recipe) {
    if (!recipe) return;

    if (recipe.op === 'transform') {
        const sourceSel = document.getElementById('rc-transform-table');
        if (sourceSel) {
            sourceSel.value = recipe.sourceId;
            sourceSel.dispatchEvent(new Event('change'));
        }
        // Wait for col chips to re-render after change event
        setTimeout(() => {
            // Select kept columns (v2: by colId, v1: by name fallback)
            resultConfig.querySelectorAll('.transform-col-chip').forEach(chip => {
                const kept = recipe.keptCols || [];
                chip.classList.toggle('selected', kept.includes(chip.dataset.colId) || kept.includes(chip.textContent));
            });
            const srcTable = tables.find(t => t.id === recipe.sourceId);
            // Row filter
            if (recipe.rowFilter) {
                const actionSel = resultConfig.querySelector('.row-filter-action');
                if (actionSel) actionSel.value = recipe.rowFilter.action || 'keep';
                const condsList  = resultConfig.querySelector('.row-filter-conditions');
                const logicInput = resultConfig.querySelector('.row-filter-logic');
                (recipe.rowFilter.conditions || []).forEach(cond => {
                    addRowCondition(condsList, logicInput, srcTable);
                    const items = condsList.querySelectorAll('.row-condition-item');
                    const item  = items[items.length - 1];
                    const colSel = item.querySelector('.rule-col-sel');
                    const opSel  = item.querySelector('.rule-op-sel');
                    const valIn  = item.querySelector('.rule-val-input');
                    if (colSel) colSel.value = cond.col; // v2: value is already the ID
                    if (opSel)  { opSel.value = cond.op; opSel.dispatchEvent(new Event('change')); }
                    if (valIn)  valIn.value = cond.value || '';
                });
                if (logicInput) logicInput.value = recipe.rowFilter.logic || '';
            }
            // Computed columns — prefill handles both conditions and replace modes
            const computedList = resultConfig.querySelector('.computed-cols-list');
            (recipe.computedCols || []).forEach(col => {
                addComputedColumnCard(computedList, srcTable, col);
            });
        }, 0);

    } else if (recipe.op === 'split') {
        const sourceSel = document.getElementById('rc-split-table');
        if (sourceSel) { sourceSel.value = recipe.sourceId; sourceSel.disabled = true; }
        // Replace the two starter branches with a single pre-filled one
        const branchList = document.getElementById('split-branch-list');
        if (branchList) {
            branchList.innerHTML = '';
            const src = tables.find(t => t.id === recipe.sourceId);
            if (recipe.isDefault) {
                addSplitBranch(branchList, src, { label: editingTableEntry?.name || '' }, true);
                // Disable the "Add Default Branch" button — already is one
                const defBtn = resultConfig.querySelector('.split-add-default-btn');
                if (defBtn) defBtn.disabled = true;
            } else {
                addSplitBranch(branchList, src, { label: editingTableEntry?.name || '', condition: recipe.condition });
            }
        }

    } else if (recipe.op === 'group') {
        const sourceSel  = document.getElementById('rc-group-table');
        const groupColSel = document.getElementById('rc-group-col');
        if (sourceSel) {
            sourceSel.value = recipe.sourceId;
            // Rebuild group col options and agg list, then restore selections
            const src = tables.find(t => t.id === recipe.sourceId);
            const defs = src?.columnDefs || src?.columns?.map(n => ({ id: n, name: n })) || [];
            groupColSel.innerHTML = '';
            defs.forEach(def => {
                const opt = document.createElement('option');
                opt.value = def.id; opt.textContent = def.name;
                groupColSel.appendChild(opt);
            });
            if (recipe.groupColId) {
                groupColSel.value = recipe.groupColId;
                // Fallback: if no direct ID match (e.g. paste table later got stable IDs),
                // try matching by column name or origin so the UI stays consistent with
                // the computation (colIdx already has the same fallback).
                if (groupColSel.value !== recipe.groupColId) {
                    const fallback = defs.find(d => d.name === recipe.groupColId || d.origin === recipe.groupColId);
                    if (fallback) groupColSel.value = fallback.id;
                }
            }
            // Resolved ID: what's actually selected in the select (may differ from stored value)
            const resolvedGroupId = groupColSel.value;
            // Rebuild agg list with saved aggregations.
            // Use the result table's column name (may have been renamed by the user)
            // rather than the source name, so the editor reflects what the user sees.
            const resultDefs = editingTableEntry?.columnDefs || [];
            const aggList = document.getElementById('group-agg-list');
            if (aggList) {
                aggList.innerHTML = '';
                defs.filter(d => d.id !== resolvedGroupId).forEach(def => {
                    // Match saved agg by ID first, then fall back to name/origin
                    const savedAgg = recipe.aggregations?.find(a =>
                        a.colId === def.id || a.colId === def.name || a.colId === def.origin
                    );
                    const resultDef = resultDefs.find(d => d.id === savedAgg?.outColId);
                    const displayDef = resultDef ? { ...def, name: resultDef.name } : def;
                    aggList.appendChild(makeGroupAggRow(displayDef, savedAgg || null));
                });
            }
        }

    } else if (recipe.op === 'stack') {
        const lSel = document.getElementById('rc-left-table');
        const rSel = document.getElementById('rc-right-table');
        if (lSel) lSel.value = recipe.leftId;
        if (rSel) rSel.value = recipe.rightId;
        renderStackMapping(recipe.leftId, recipe.rightId, recipe.columnMapping || null);

    } else {
        // enrich / missing / filter
        const lSel   = document.getElementById('rc-left-table');
        const rSel   = document.getElementById('rc-right-table');
        const lcSel  = document.getElementById('rc-left-col');
        const rcSel  = document.getElementById('rc-right-col');
        if (lSel)  { lSel.value = recipe.leftId;   lSel.dispatchEvent(new Event('change')); }
        if (rSel)  { rSel.value = recipe.rightId;  rSel.dispatchEvent(new Event('change')); }
        if (lcSel) lcSel.value = recipe.leftCol;
        if (rcSel) rcSel.value = recipe.rightCol;
        const ciCheck = document.getElementById('rc-case-insensitive');
        if (ciCheck) ciCheck.checked = !!recipe.caseInsensitive;
        // For enrich: select the previously chosen enrichment columns
        if (recipe.op === 'enrich' && recipe.selectedCols) {
            setTimeout(() => {
                const selectedIds = new Set(recipe.selectedCols.map(s => s.colId).filter(Boolean));
                resultConfig.querySelectorAll('.col-chip').forEach(chip => {
                    chip.classList.toggle('selected', selectedIds.has(chip.dataset.colId));
                });
            }, 0);
        }
    }
}

function serializeModel(includeData = false) {
    const now = new Date().toISOString();
    const out = {
        version: 2,
        name: schemaName || '',
        description: schemaDescription || '',
        createdAt: schemaCreatedAt || now,
        updatedAt: now,
        tableCounter,
        colorRules: colorRules.map(r => ({ ...r })),
        maps: maps.map(m => ({ id: m.id, name: m.name, entries: m.entries.map(e => ({ ...e })) })),
        tables: tables.map(t => {
            const e = { id: t.id, name: t.name, source: t.source, columns: [...t.columns] };
            if (t.columnDefs)  e.columnDefs  = t.columnDefs.map(d => ({ ...d }));
            if (t.description) e.description = t.description;
            if (t.previewLimit && t.previewLimit !== 100) e.previewLimit = t.previewLimit;
            if (t.lastRun)     e.lastRun     = t.lastRun;
            if (t.sort)        e.sort        = { ...t.sort };
            if (t.source === 'soql')   { e.soqlQuery = t.soqlQuery; e.orgIdentifier = t.orgIdentifier; }
            if (t.source === 'result') { e.recipe = t.recipe; }
            if (t.source === 'dml' && t.dmlConfig)    { e.dmlConfig = { ...t.dmlConfig, mappings: (t.dmlConfig.mappings || []).map(m => ({ ...m })) }; }
            if (includeData && t.rows?.length) e.snapshotRows = t.rows.map(r => [...r]);
            return e;
        })
    };
    if (includeData) {
        out.isSnapshot = true;
        out.snapshotDate = new Date().toISOString();
    }
    return out;
}

async function deserializeModel(data) {
    // Clear current state
    tables = [];
    colorRules = [];
    maps = [];
    schemaTransform = { x: 0, y: 0, scale: 1 };
    document.querySelectorAll('.table-card').forEach(c => c.remove());
    emptyState.style.display = '';
    btnResult.style.display = 'none';
    btnSaveModel.style.display = 'none';
    btnSnapshotModel.style.display = 'none';
    btnDml.style.display = 'none';
    if (typeof btnColorRules !== 'undefined') btnColorRules.style.display = 'none';
    renderSchema();
    resultPanel.classList.remove('open');
    addPanel.classList.remove('open');
    closeDmlPanel();
    btnResult.classList.remove('active-toggle');
    btnResult.textContent = '+ Add Result';
    btnAdd.classList.remove('active-toggle');
    btnAdd.textContent = '+ Add Table';

    // Load schema metadata
    schemaName        = data.name        || '';
    schemaDescription = data.description || '';
    schemaCreatedAt   = data.createdAt   || null;
    updateSchemaBarTitle();

    // Build table ID remap (saved IDs → fresh runtime IDs to avoid collisions)
    const idMap = {};
    (data.tables || []).forEach((t, i) => {
        idMap[t.id] = `t_${Date.now()}_${i}`;
    });

    function remapRecipe(recipe) {
        if (!recipe) return null;
        const r = { ...recipe };
        if (r.sourceId) r.sourceId = idMap[r.sourceId] ?? r.sourceId;
        if (r.leftId)   r.leftId   = idMap[r.leftId]   ?? r.leftId;
        if (r.rightId)  r.rightId  = idMap[r.rightId]  ?? r.rightId;
        // v1 fallback: selectedCols with tableId
        if (r.selectedCols) r.selectedCols = r.selectedCols.map(s =>
            s.tableId ? { ...s, tableId: idMap[s.tableId] ?? s.tableId } : s
        );
        return r;
    }

    tableCounter = data.tableCounter || 0;
    colorRules = (data.colorRules || []).map(r => ({
        ...r,
        tableId: idMap[r.tableId] ?? r.tableId
    }));
    maps = (data.maps || []).map(m => ({
        id: m.id,
        name: m.name,
        entries: (m.entries || []).map(e => ({ ...e }))
    }));
    if (typeof window !== 'undefined' && window.DWLogic) window.DWLogic.setMaps(maps);
    if (typeof window !== 'undefined' && window.renderMapsList) window.renderMapsList();

    for (const t of (data.tables || [])) {
        const newId = idMap[t.id];

        if (t.source === 'dml') {
            const dmlConfig = { ...(t.dmlConfig || {}), mappings: (t.dmlConfig?.mappings || []).map(m => ({ ...m })) };
            // Remap sourceTableId
            if (dmlConfig.sourceTableId) dmlConfig.sourceTableId = idMap[dmlConfig.sourceTableId] ?? dmlConfig.sourceTableId;
            addDmlCard({ id: newId, name: t.name, dmlConfig });
            continue;
        }

        const hasSnapshot = Array.isArray(t.snapshotRows) && t.snapshotRows.length > 0;
        addTable({
            id:            newId,
            name:          t.name,
            source:        t.source,
            columns:       t.columns || [],
            columnDefs:    t.columnDefs || null,
            rows:          hasSnapshot ? t.snapshotRows : [],
            recipe:        remapRecipe(t.recipe),
            soqlQuery:     t.soqlQuery     || null,
            orgIdentifier: t.orgIdentifier || null,
            stale:         t.source === 'result' && !hasSnapshot,
            description:   t.description  || null,
            previewLimit:  t.previewLimit  || 100,
            isSnapshot:    hasSnapshot,
        });
        if (t.lastRun || t.sort) {
            const loaded = tables.find(u => u.id === newId);
            if (loaded) {
                if (t.lastRun) loaded.lastRun = t.lastRun;
                if (t.sort)    loaded.sort    = t.sort;
            }
        }

        if (!hasSnapshot && (t.source === 'paste' || t.source === 'soql')) {
            const card = document.querySelector(`.table-card[data-table-id="${newId}"]`);
            card?.querySelector('.btn-edit-panel')?.click();
        }
    }

    renderColorRulesList();
}
