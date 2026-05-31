// Variables panel — manages variables[] and the panel UI
(function () {
    const btnVars   = document.getElementById('btn-vars');
    const panel     = document.getElementById('vars-panel');
    const closeBtn  = document.getElementById('vars-close');
    const listEl    = document.getElementById('vars-list');
    const addBtn    = document.getElementById('vars-add-btn');
    const nameInput = document.getElementById('vars-new-name');

    function syncVariables() {
        window.DWLogic.setVariables(variables);
        if (typeof updateBindingsHint === 'function') updateBindingsHint();
    }

    // ── Draggable panel ──
    const dragHandle = document.getElementById('vars-panel-header');
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

    // ── Resize handle (bottom-right corner) ──
    makeResizable(panel, document.getElementById('vars-resize'));

    // ── Open / close ──
    btnVars.addEventListener('click', () => panel.classList.toggle('hidden'));
    closeBtn.addEventListener('click', () => panel.classList.add('hidden'));

    // ── Add a new variable ──
    function addVariable() {
        const rawName = nameInput.value.trim();
        if (!rawName) return;
        if (!/^[A-Za-z_]\w*$/.test(rawName)) {
            nameInput.style.borderColor = '#f87171';
            setTimeout(() => nameInput.style.borderColor = '', 1200);
            return;
        }
        if (variables.find(v => v.name === rawName)) {
            nameInput.style.borderColor = '#f87171';
            setTimeout(() => nameInput.style.borderColor = '', 1200);
            return;
        }
        const id = 'var_' + Date.now();
        variables.push({ id, name: rawName, value: '' });
        syncVariables();
        nameInput.value = '';
        renderList();
    }

    addBtn.addEventListener('click', addVariable);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addVariable(); });

    // ── Render the full list ──
    function renderList() {
        listEl.innerHTML = '';
        if (variables.length === 0) {
            listEl.innerHTML = '<div class="vars-empty">No variables yet. Create one above.</div>';
            return;
        }
        variables.forEach(v => listEl.appendChild(renderVarItem(v)));
    }
    window.renderVariablesList = renderList;

    function renderVarItem(v) {
        const item = document.createElement('div');
        item.className = 'vars-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'vars-item-name';
        nameEl.textContent = '$' + v.name;
        nameEl.title = v.name;

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'vars-item-value';
        valueInput.value = v.value;
        valueInput.placeholder = 'value…';
        valueInput.addEventListener('input', () => {
            v.value = valueInput.value;
            syncVariables();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'vars-item-delete';
        delBtn.textContent = '🗑';
        delBtn.title = 'Delete variable';
        delBtn.addEventListener('click', () => {
            variables.splice(variables.indexOf(v), 1);
            syncVariables();
            renderList();
        });

        item.appendChild(nameEl);
        item.appendChild(valueInput);
        item.appendChild(delBtn);
        return item;
    }

    renderList();
})();
