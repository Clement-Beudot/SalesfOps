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

    let selectedColor = null;

    // ── Swatch selection ──
    swatchContainer.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        swatchContainer.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        selectedColor = swatch.dataset.color;
        updateAddBtn();
    });

    function updateAddBtn() {
        addBtn.disabled = !selectedColor || !tableSelect.value;
    }
    tableSelect.addEventListener('change', updateAddBtn);

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
            color: selectedColor
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

            const dot = document.createElement('span');
            dot.className = 'color-rule-dot';
            dot.style.background = rule.color;

            const label = document.createElement('span');
            label.className = 'color-rule-item-label';
            label.textContent = `${t ? t.name : '(deleted)'} — ${rule.condition === 'has_records' ? 'has records' : 'no records'}`;

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
