// Color rules panel — manages colorRules[] and the panel UI
(function () {
    const btnColorRules   = document.getElementById('btn-color-rules');
    const panel           = document.getElementById('color-rules-panel');
    const closeBtn        = document.getElementById('color-rules-close');
    const tableSelect     = document.getElementById('color-rule-table');
    const swatchContainer = document.getElementById('color-rule-swatches');
    const addBtn          = document.getElementById('color-rule-add');
    const listEl          = document.getElementById('color-rules-list');

    // expose btnColorRules globally so table.js/recipe.js can show/hide it
    window.btnColorRules = btnColorRules;

    // ── Draggable panel ──
    const dragHandle = document.getElementById('color-rules-panel-header') || panel.querySelector('.color-rules-panel-header');
    dragHandle.style.cursor = 'grab';
    let dragging = false, dragOffX = 0, dragOffY = 0;

    dragHandle.addEventListener('mousedown', (e) => {
        if (e.target === closeBtn) return;
        dragging = true;
        const rect = panel.getBoundingClientRect();
        // Switch from right-anchored to left-anchored positioning on first drag
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
    makeResizable(panel, document.getElementById('color-rules-resize'));

    let selectedColor       = null;
    let selectedBorderStyle = 'solid';

    // ── Swatch selection ──
    swatchContainer.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        swatchContainer.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        selectedColor = swatch.dataset.color;
        updateAddBtn();
    });

    // ── Border style selection ──
    const borderStyleContainer = document.getElementById('color-rule-border-styles');
    borderStyleContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.border-style-btn');
        if (!btn) return;
        borderStyleContainer.querySelectorAll('.border-style-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedBorderStyle = btn.dataset.style;
    });

    const condStandard = document.getElementById('color-rule-cond-standard');
    const condDml      = document.getElementById('color-rule-cond-dml');

    function updateAddBtn() {
        addBtn.disabled = !selectedColor || !tableSelect.value;
    }

    function updateCondGroup() {
        const t = tables.find(u => u.id === tableSelect.value);
        const isDml = t?.source === 'dml';
        condStandard.classList.toggle('hidden', isDml);
        condDml.classList.toggle('hidden', !isDml);
        // ensure a radio in the visible group is checked
        const activeGroup = isDml ? condDml : condStandard;
        if (!activeGroup.querySelector('input[name="color-rule-cond"]:checked')) {
            activeGroup.querySelector('input[name="color-rule-cond"]').checked = true;
        }
        updateAddBtn();
    }

    tableSelect.addEventListener('change', updateCondGroup);

    // ── Open / close ──
    btnColorRules.addEventListener('click', () => {
        const isOpen = !panel.classList.contains('hidden');
        if (isOpen) {
            panel.classList.add('hidden');
            btnColorRules.classList.remove('active-toggle');
        } else {
            populateTableSelect();
            panel.classList.remove('hidden');
            btnColorRules.classList.add('active-toggle');
        }
    });
    closeBtn.addEventListener('click', () => {
        panel.classList.add('hidden');
        btnColorRules.classList.remove('active-toggle');
    });

    // ── Populate table dropdown ──
    function populateTableSelect() {
        tableSelect.innerHTML = '<option value="">— Select table —</option>';
        tables.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            tableSelect.appendChild(opt);
        });
        updateAddBtn();
    }

    // ── Add rule ──
    addBtn.addEventListener('click', () => {
        const tableId = tableSelect.value;
        const condition = document.querySelector('input[name="color-rule-cond"]:checked')?.value || 'has_records';
        if (!tableId || !selectedColor) return;

        colorRules.push({
            id: `cr_${Date.now()}`,
            tableId,
            condition,
            color:       selectedColor,
            borderStyle: selectedBorderStyle
        });

        // Reset form
        swatchContainer.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        selectedColor = null;
        tableSelect.value = '';
        updateAddBtn();

        renderColorRulesList();
        renderSchema();
    });

    // ── Render rules list ──
    function renderColorRulesList() {
        listEl.innerHTML = '';
        if (colorRules.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'color-rules-empty';
            empty.textContent = 'No rules yet.';
            listEl.appendChild(empty);
            return;
        }
        colorRules.forEach(rule => {
            const t = tables.find(u => u.id === rule.tableId);
            const row = document.createElement('div');
            row.className = 'color-rule-item';

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            dot.setAttribute('class', 'color-rule-dot');
            dot.setAttribute('viewBox', '0 0 28 10');
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '2'); line.setAttribute('y1', '5');
            line.setAttribute('x2', '26'); line.setAttribute('y2', '5');
            line.setAttribute('stroke', rule.color);
            line.setAttribute('stroke-width', rule.borderStyle === 'dotted' ? '3' : '2.5');
            if (rule.borderStyle === 'dashed') line.setAttribute('stroke-dasharray', '6 3');
            if (rule.borderStyle === 'dotted') { line.setAttribute('stroke-dasharray', '2 3'); line.setAttribute('stroke-linecap', 'round'); }
            dot.appendChild(line);

            const label = document.createElement('span');
            label.className = 'color-rule-item-label';
            const COND_LABELS = {
                has_records: t?.source === 'dml' ? 'source has records' : 'has records',
                no_records:  t?.source === 'dml' ? 'source is empty'    : 'no records',
                dml_not_run:  'not yet run',
                dml_done_ok:  'last run: all OK',
                dml_done_err: 'last run: has errors',
            };
            label.textContent = `${t ? t.name : '(deleted)'} — ${COND_LABELS[rule.condition] || rule.condition}`;

            const del = document.createElement('button');
            del.className = 'color-rule-delete';
            del.textContent = '✕';
            del.title = 'Delete rule';
            del.addEventListener('click', () => {
                colorRules = colorRules.filter(r => r.id !== rule.id);
                renderColorRulesList();
                renderSchema();
            });

            row.appendChild(dot);
            row.appendChild(label);
            row.appendChild(del);
            listEl.appendChild(row);
        });
    }

    // expose for deserializeModel in recipe.js
    window.renderColorRulesList = renderColorRulesList;

    // Initial render (empty)
    renderColorRulesList();
})();
