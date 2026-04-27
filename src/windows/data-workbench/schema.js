// ── Schema view toggle ────────────────────────────

function switchToSchema() {
    content.classList.add('hidden');
    schemaOverlay.classList.remove('hidden');
    btnSchema.textContent = 'Switch to Tables';
    btnSchema.classList.add('active-toggle');
    renderSchema();
}

function switchToTables() {
    schemaOverlay.classList.add('hidden');
    schemaTooltip.classList.add('hidden');
    content.classList.remove('hidden');
    btnSchema.textContent = 'Switch to Schema';
    btnSchema.classList.remove('active-toggle');
}

btnSchema.addEventListener('click', () => {
    if (schemaOverlay.classList.contains('hidden')) switchToSchema();
    else switchToTables();
});

// ── Preview: rename on double-click ───────────────
schemaPreviewTitle.addEventListener('dblclick', () => {
    const t = tables.find(u => u.id === schemaPreview.dataset.tableId);
    if (!t) return;
    const dummyRef = document.createElement('span'); // startRename updates refChip text — not needed in preview
    startRename(schemaPreviewTitle, dummyRef, t);
});

// ── Preview: resize handle ─────────────────────────
(function () {
    const handle = document.getElementById('schema-preview-resize');
    let active = false, startX = 0, startW = 0;
    handle.addEventListener('mousedown', e => {
        active = true;
        startX = e.clientX;
        startW = schemaPreview.getBoundingClientRect().width;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!active) return;
        const w = Math.max(200, Math.min(800, startW - (e.clientX - startX)));
        schemaPreview.style.width = `${w}px`;
    });
    document.addEventListener('mouseup', () => {
        if (!active) return;
        active = false;
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}());

/**
 * Render the dependency graph as an SVG diagram inside #schema-canvas.
 *
 * Layout: tables are placed in columns by their topological depth.
 * Source tables (no recipe) occupy layer 0; each result is placed one
 * column to the right of its deepest dependency.  Nodes within a column
 * are centred vertically.  Bezier curves connect source nodes to the
 * result nodes that depend on them.
 */
function buildTooltipHTML(t) {
    const tblName = id => tables.find(u => u.id === id)?.name || '?';
    const row = (label, val) => `<div class="schema-tooltip-row"><span class="schema-tooltip-label">${label}</span><span class="schema-tooltip-val">${val}</span></div>`;
    const lines = [];
    if (t.description) lines.push(`<div class="schema-tooltip-desc">${t.description}</div>`);
    if (t.source === 'soql') {
        if (t.soqlQuery) {
            const q = t.soqlQuery.trim().replace(/\s+/g, ' ');
            lines.push(row('Query', q.length > 180 ? q.slice(0, 180) + '…' : q));
        }
        const deps = (t.soqlQuery?.match(/:([A-Za-z]\w*\.\w+)\.(?:\w+|\[[^\]]+\])/g) || [])
            .map(m => m.slice(1).replace(/\.(?:\w+|\[[^\]]+\])$/, ''))
            .filter((v, i, a) => a.indexOf(v) === i);
        if (deps.length) lines.push(row('Binds', deps.map(r => `:${r}`).join(', ')));
    } else if (t.source === 'paste') {
        if (t.columns.length) lines.push(row('Columns', t.columns.join(', ')));
    } else if (t.recipe) {
        const { op, leftId, rightId, sourceId, leftCol, rightCol } = t.recipe;
        // Resolve column IDs to display names for tooltip
        const colName = (tblId, colRef) => {
            const tbl = tables.find(u => u.id === tblId);
            return tbl?.columnDefs?.find(d => d.id === colRef)?.name ?? colRef;
        };
        if (op === 'transform')     lines.push(row('Op', 'Transform'), row('Source', tblName(sourceId)));
        else if (op === 'stack')    lines.push(row('Op', 'Stack'), row('Top', tblName(leftId)), row('Bottom', tblName(rightId)));
        else if (op === 'enrich')   lines.push(row('Op', 'Enrich'), row('Base', tblName(leftId)), row('With', tblName(rightId)), row('Key', `${colName(leftId, leftCol)} = ${colName(rightId, rightCol)}`));
        else if (op === 'missing')  lines.push(row('Op', 'Missing'), row('In', tblName(leftId)), row('Not in', tblName(rightId)), row('Key', `${colName(leftId, leftCol)} = ${colName(rightId, rightCol)}`));
        else if (op === 'filter')   lines.push(row('Op', 'Filter'), row('Keep', tblName(leftId)), row('Matching', tblName(rightId)), row('Key', `${colName(leftId, leftCol)} = ${colName(rightId, rightCol)}`));
    }
    return lines.join('') || `<span style="color:#444">No details</span>`;
}

function hasDependents(tableEntry) {
    const id  = tableEntry.id;
    const ref = tableEntry.ref;
    if (tables.some(t => t.source === 'result' && t.recipe && getDependencies(t.recipe).includes(id))) return true;
    if (tables.some(t => t.soqlQuery && t.soqlQuery.includes(`:${ref}.`))) return true;
    return false;
}

function renderSchema() {
    schemaTooltip.classList.add('hidden');
    schemaCanvas.innerHTML = '';

    if (tables.length === 0) {
        const p = document.createElement('p');
        p.className = 'schema-empty';
        p.textContent = 'No tables loaded.';
        schemaCanvas.appendChild(p);
        return;
    }

    // ── SOQL binding refs: `:Prefix.Table.Col` → dep IDs ──
    const SOQL_REF_RE = /:([A-Za-z]\w*\.\w+)\.(?:\w+|\[[^\]]+\])/g;
    function getSoqlDeps(t) {
        if (t.source !== 'soql' || !t.soqlQuery) return [];
        const refs = new Set([...t.soqlQuery.matchAll(SOQL_REF_RE)].map(m => m[1]));
        return [...refs].map(ref => tables.find(u => u.ref === ref)?.id).filter(Boolean);
    }
    function getAllDeps(t) {
        return t.recipe ? getDependencies(t.recipe) : getSoqlDeps(t);
    }

    // ── Assign topological layers (recipe deps + SOQL bindings) ──
    const layerOf = new Map();
    tables.forEach(t => { if (getAllDeps(t).length === 0) layerOf.set(t.id, 0); });
    let changed = true;
    while (changed) {
        changed = false;
        tables.forEach(t => {
            if (layerOf.has(t.id)) return;
            const deps = getAllDeps(t);
            if (deps.every(d => layerOf.has(d))) {
                layerOf.set(t.id, Math.max(...deps.map(d => layerOf.get(d))) + 1);
                changed = true;
            }
        });
    }
    // Fallback for circular / unresolved deps
    tables.forEach(t => { if (!layerOf.has(t.id)) layerOf.set(t.id, 0); });

    // ── Align leaf nodes (outputs) to the rightmost layer ──
    // A leaf with upstream dependencies is an output → push right.
    // Pure sources (no upstream deps) stay at layer 0 (leftmost), even if unreferenced.
    const maxLayer = Math.max(0, ...[...layerOf.values()]);
    if (maxLayer > 0) {
        const referenced = new Set(tables.flatMap(t => getAllDeps(t)));
        tables.forEach(t => {
            if (!referenced.has(t.id) && getAllDeps(t).length > 0) layerOf.set(t.id, maxLayer);
        });
    }

    // ── Group nodes by layer ──
    const layers = new Map();
    tables.forEach(t => {
        const l = layerOf.get(t.id);
        if (!layers.has(l)) layers.set(l, []);
        layers.get(l).push(t);
    });
    const sortedLayers = [...layers.keys()].sort((a, b) => a - b);

    // ── Barycentric sorting: minimise edge crossings ──
    const usedBy = new Map(tables.map(t => [t.id, []]));
    tables.forEach(t => {
        getAllDeps(t).forEach(depId => {
            if (usedBy.has(depId)) usedBy.get(depId).push(t.id);
        });
    });
    function layerOrder(layer) {
        return new Map(layers.get(layer).map((t, i) => [t.id, i]));
    }
    function barycentre(t, prevOrd, nextOrd) {
        const indices = [];
        if (prevOrd) getAllDeps(t).forEach(id => { const i = prevOrd.get(id); if (i !== undefined) indices.push(i); });
        if (nextOrd) (usedBy.get(t.id) || []).forEach(id => { const i = nextOrd.get(id); if (i !== undefined) indices.push(i); });
        return indices.length ? indices.reduce((a, b) => a + b, 0) / indices.length : 0;
    }
    function barySweep(list) {
        list.forEach((layer, li) => {
            const prevOrd = li > 0 ? layerOrder(list[li - 1]) : null;
            const nextOrd = li < list.length - 1 ? layerOrder(list[li + 1]) : null;
            layers.get(layer).sort((a, b) => barycentre(a, prevOrd, nextOrd) - barycentre(b, prevOrd, nextOrd));
        });
    }
    for (let pass = 0; pass < 4; pass++) {
        barySweep(sortedLayers);
        barySweep([...sortedLayers].reverse());
    }

    // ── Compute layout ──
    const NODE_W = 210, NODE_H = 88, H_GAP = 96, V_GAP = 24, PAD = 40;

    // Vertically centre every column around the same midpoint
    let maxColH = 0;
    sortedLayers.forEach(l => {
        const n = layers.get(l).length;
        maxColH = Math.max(maxColH, n * NODE_H + (n - 1) * V_GAP);
    });
    const midY = PAD + maxColH / 2;

    const positions = new Map(); // id → { x, y, w, h }
    sortedLayers.forEach((layer, li) => {
        const nodes = layers.get(layer);
        const colH = nodes.length * NODE_H + (nodes.length - 1) * V_GAP;
        const startY = midY - colH / 2;
        const x = PAD + li * (NODE_W + H_GAP);
        nodes.forEach((t, ni) => {
            positions.set(t.id, { x, y: startY + ni * (NODE_H + V_GAP), w: NODE_W, h: NODE_H });
        });
    });

    const svgW = PAD + sortedLayers.length * (NODE_W + H_GAP) - H_GAP + PAD;
    const svgH = PAD * 2 + maxColH;

    // ── Build edges: recipe deps (solid) + SOQL bindings (dashed) ──
    const edges = [];
    const edgeSet = new Set(); // dedup key "fromId→toId"
    function addEdge(fromId, toId, style) {
        const key = `${fromId}→${toId}`;
        if (!edgeSet.has(key) && positions.has(fromId) && positions.has(toId)) {
            edgeSet.add(key);
            edges.push({ fromId, toId, style });
        }
    }
    tables.forEach(t => {
        if (t.recipe) getDependencies(t.recipe).forEach(depId => addEdge(depId, t.id, 'solid'));
        getSoqlDeps(t).forEach(depId => addEdge(depId, t.id, 'binding'));
    });

    // ── Spread endpoints so stacked edges don't overlap ──
    const EDGE_SPREAD = 10; // px between adjacent endpoints on the same node face
    const incomingCount = new Map();
    const outgoingCount = new Map();
    edges.forEach(e => {
        incomingCount.set(e.toId,   (incomingCount.get(e.toId)   || 0) + 1);
        outgoingCount.set(e.fromId, (outgoingCount.get(e.fromId) || 0) + 1);
    });
    const incomingIdx = new Map();
    const outgoingIdx = new Map();
    edges.forEach(e => {
        const n  = incomingCount.get(e.toId), i  = incomingIdx.get(e.toId)   || 0;
        const on = outgoingCount.get(e.fromId), oi = outgoingIdx.get(e.fromId) || 0;
        e.y2Offset = n  > 1 ? (i  - (n  - 1) / 2) * EDGE_SPREAD : 0;
        e.y1Offset = on > 1 ? (oi - (on - 1) / 2) * EDGE_SPREAD : 0;
        incomingIdx.set(e.toId,   i  + 1);
        outgoingIdx.set(e.fromId, oi + 1);
    });

    // ── SVG ──
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', svgW);
    svg.setAttribute('height', svgH);
    svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);

    // Arrowhead marker + clipPath storage in defs
    const defs = document.createElementNS(NS, 'defs');
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', 'schema-arrow');
    marker.setAttribute('markerWidth', '9');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const arrowPoly = document.createElementNS(NS, 'polygon');
    arrowPoly.setAttribute('points', '0 0, 9 3.5, 0 7');
    arrowPoly.setAttribute('fill', '#505050');
    marker.appendChild(arrowPoly);

    // Per-source accent colours
    const ACCENT = { paste: '#4ade80', soql: '#60a5fa', result: '#a855f7' };
    const ACCENT_DIM = { paste: '#14532d', soql: '#1e3a5f', result: '#2e1065' };

    // Per-colour arrowhead markers (one per source type)
    Object.entries({ ...ACCENT, dim: '#383838' }).forEach(([key, color]) => {
        const m = document.createElementNS(NS, 'marker');
        m.setAttribute('id', `schema-arrow-${key}`);
        m.setAttribute('markerWidth', '9'); m.setAttribute('markerHeight', '7');
        m.setAttribute('refX', '9');        m.setAttribute('refY', '3.5');
        m.setAttribute('orient', 'auto');
        const poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points', '0 0, 9 3.5, 0 7');
        poly.setAttribute('fill', color);
        m.appendChild(poly);
        defs.appendChild(m);
    });

    defs.appendChild(marker);
    svg.appendChild(defs);

    // ── Shared highlight helpers (closures over edgePaths / nodeGroups) ──
    let lockedId = null;
    const edgePaths  = [];
    const nodeGroups = [];
    const lockMeta   = []; // { id, ring, pinTxt, acc }

    function buildConnected(targetId) {
        const ids = new Set([targetId]);
        function up(id) {
            const n = tables.find(u => u.id === id); if (!n) return;
            getAllDeps(n).forEach(d => { if (!ids.has(d)) { ids.add(d); up(d); } });
        }
        function down(id) {
            tables.forEach(u => { if (!ids.has(u.id) && getAllDeps(u).includes(id)) { ids.add(u.id); down(u.id); } });
        }
        up(targetId); down(targetId);
        return ids;
    }

    function applyHighlight(targetId) {
        const ids = buildConnected(targetId);
        edgePaths.forEach(({ fromId, toId, path, halo }) => {
            const on = ids.has(fromId) && ids.has(toId);
            path.setAttribute('opacity', on ? '1' : '0.06');
            halo.setAttribute('opacity', on ? '1' : '0');
            if (on) path.setAttribute('stroke-width', '2');
        });
        nodeGroups.forEach(({ id, g: ng }) => ng.setAttribute('opacity', ids.has(id) ? '1' : '0.15'));
    }

    function resetHighlight() {
        edgePaths.forEach(({ path, halo }) => {
            path.setAttribute('opacity', '0.55');
            halo.setAttribute('opacity', '1');
            path.setAttribute('stroke-width', '1.5');
        });
        nodeGroups.forEach(({ g: ng }) => ng.setAttribute('opacity', '1'));
    }

    function unlock() {
        if (!lockedId) return;
        lockMeta.forEach(m => {
            if (m.id === lockedId) {
                m.ring.setAttribute('visibility', 'hidden');
                m.pinTxt.textContent = '⊙';
                m.pinTxt.setAttribute('fill', '#484848');
            }
        });
        lockedId = null;
        resetHighlight();
        schemaTooltip.classList.add('hidden');
    }

    function lockTo(id) {
        unlock();
        lockedId = id;
        const m = lockMeta.find(x => x.id === id);
        if (m) {
            m.ring.setAttribute('visibility', 'visible');
            m.pinTxt.textContent = '◉';
            m.pinTxt.setAttribute('fill', m.acc);
        }
        applyHighlight(id);
    }

    // Escape to unlock
    function onEsc(e) { if (e.key === 'Escape') unlock(); }
    document.addEventListener('keydown', onEsc);
    new MutationObserver(() => {
        if (schemaOverlay.classList.contains('hidden')) document.removeEventListener('keydown', onEsc);
    }).observe(schemaOverlay, { attributes: true, attributeFilter: ['class'] });

    // Group to hold all edges so we can dim them on hover
    const edgeGroup = document.createElementNS(NS, 'g');
    edgeGroup.setAttribute('class', 'schema-edges');
    svg.appendChild(edgeGroup);

    // Draw bezier edges (drawn before nodes so they appear behind)
    edges.forEach(edge => {
        const { fromId, toId, style } = edge;
        const f = positions.get(fromId);
        const t = positions.get(toId);
        const x1 = f.x + f.w, y1 = f.y + f.h / 2 + edge.y1Offset;
        const x2 = t.x,       y2 = t.y + t.h / 2 + edge.y2Offset;
        const cx = (x1 + x2) / 2;
        const fromTable = tables.find(u => u.id === fromId);
        const isBinding = style === 'binding';
        // Binding edges use the DESTINATION (SOQL) node colour; solid edges use source colour
        const toTable = isBinding ? tables.find(u => u.id === toId) : null;
        const edgeColor = isBinding ? (ACCENT[toTable?.source] || '#505050') : (ACCENT[fromTable?.source] || '#505050');
        const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
        const halo = document.createElementNS(NS, 'path');
        halo.setAttribute('d', d);
        halo.setAttribute('stroke', '#1a1a1a');
        halo.setAttribute('stroke-width', '5');
        halo.setAttribute('fill', 'none');
        edgeGroup.appendChild(halo);
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', edgeColor);
        path.setAttribute('stroke-width', isBinding ? '1' : '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.55');
        if (isBinding) path.setAttribute('stroke-dasharray', '4 3');
        const markerSrc = isBinding ? (toTable?.source || 'dim') : (fromTable?.source || 'dim');
        path.setAttribute('marker-end', `url(#schema-arrow-${markerSrc})`);
        path.dataset.from = fromId;
        path.dataset.to   = toId;
        edgeGroup.appendChild(path);
        edgePaths.push({ fromId, toId, path, halo });
    });

    // Draw nodes
    tables.forEach(t => {
        const pos  = positions.get(t.id);
        const acc  = ACCENT[t.source]    || ACCENT.result;
        const dim  = ACCENT_DIM[t.source] || ACCENT_DIM.result;
        const BAR  = 5;   // left accent bar width
        const R    = 7;   // corner radius

        const g = document.createElementNS(NS, 'g');
        g.setAttribute('transform', `translate(${pos.x},${pos.y})`);

        // ── Drop shadow ──
        const shadow = document.createElementNS(NS, 'rect');
        shadow.setAttribute('x', '3'); shadow.setAttribute('y', '4');
        shadow.setAttribute('width', pos.w); shadow.setAttribute('height', pos.h);
        shadow.setAttribute('rx', R); shadow.setAttribute('fill', 'rgba(0,0,0,0.45)');
        g.appendChild(shadow);

        // ── Card background ──
        const card = document.createElementNS(NS, 'rect');
        card.setAttribute('width', pos.w); card.setAttribute('height', pos.h);
        card.setAttribute('rx', R);
        card.setAttribute('fill', '#1e1e1e');
        card.setAttribute('data-schema-card', t.id);
        // Apply color rule border if any matching rule is active
        const activeRule = colorRules.find(r => r.tableId === t.id && evalColorRule(t, r));
        card.setAttribute('stroke', activeRule ? activeRule.color : '#303030');
        card.setAttribute('stroke-width', activeRule ? '2.5' : '1');
        g.appendChild(card);

        // ── Lock ring (visible when this node is pinned) ──
        const lockRing = document.createElementNS(NS, 'rect');
        lockRing.setAttribute('width', pos.w); lockRing.setAttribute('height', pos.h);
        lockRing.setAttribute('rx', R);
        lockRing.setAttribute('fill', 'none');
        lockRing.setAttribute('stroke', acc);
        lockRing.setAttribute('stroke-width', '2');
        lockRing.setAttribute('stroke-dasharray', '5 3');
        lockRing.setAttribute('visibility', 'hidden');
        g.appendChild(lockRing);

        // ── Left accent bar (clipped to card shape via clipPath) ──
        const clipId = `clip-${t.id}`;
        const clipPath = document.createElementNS(NS, 'clipPath');
        clipPath.setAttribute('id', clipId);
        const clipRect = document.createElementNS(NS, 'rect');
        clipRect.setAttribute('width', pos.w); clipRect.setAttribute('height', pos.h);
        clipRect.setAttribute('rx', R);
        clipPath.appendChild(clipRect);
        defs.appendChild(clipPath);

        const bar = document.createElementNS(NS, 'rect');
        bar.setAttribute('width', BAR); bar.setAttribute('height', pos.h);
        bar.setAttribute('fill', acc);
        bar.setAttribute('clip-path', `url(#${clipId})`);
        g.appendChild(bar);

        // ── Source type label (coloured, small caps) ──
        const OFFSET = BAR + 10;
        const sourceLabel = t.source === 'paste' ? 'Paste' : t.source === 'soql' ? 'SOQL' : 'Result';
        const typeEl = document.createElementNS(NS, 'text');
        typeEl.setAttribute('x', OFFSET); typeEl.setAttribute('y', '17');
        typeEl.setAttribute('fill', acc);
        typeEl.setAttribute('font-size', '9');
        typeEl.setAttribute('font-family', 'monospace');
        typeEl.setAttribute('font-weight', '700');
        typeEl.setAttribute('letter-spacing', '1');
        typeEl.textContent = sourceLabel.toUpperCase();
        g.appendChild(typeEl);

        // ── Op type pill for results (top-right) ──
        if (t.recipe && t.recipe.op) {
            const pill = document.createElementNS(NS, 'rect');
            pill.setAttribute('x', String(pos.w - 54));
            pill.setAttribute('y', '6');
            pill.setAttribute('width', '46');
            pill.setAttribute('height', '15');
            pill.setAttribute('rx', '4');
            pill.setAttribute('fill', dim);
            g.appendChild(pill);
            const opEl = document.createElementNS(NS, 'text');
            opEl.setAttribute('x', String(pos.w - 31));
            opEl.setAttribute('y', '17');
            opEl.setAttribute('fill', acc);
            opEl.setAttribute('font-size', '9');
            opEl.setAttribute('font-family', 'monospace');
            opEl.setAttribute('font-weight', '600');
            opEl.setAttribute('text-anchor', 'middle');
            opEl.textContent = t.recipe.op;
            g.appendChild(opEl);
        }

        // ── Stale badge (top-right, overrides op pill position) ──
        if (t.stale) {
            const staleGrp = document.createElementNS(NS, 'g');
            staleGrp.setAttribute('data-stale-badge', t.id);
            const stalePill = document.createElementNS(NS, 'rect');
            stalePill.setAttribute('x', String(pos.w - 54));
            stalePill.setAttribute('y', '6');
            stalePill.setAttribute('width', '46');
            stalePill.setAttribute('height', '15');
            stalePill.setAttribute('rx', '4');
            stalePill.setAttribute('fill', '#422006');
            staleGrp.appendChild(stalePill);
            const staleEl = document.createElementNS(NS, 'text');
            staleEl.setAttribute('x', String(pos.w - 31));
            staleEl.setAttribute('y', '17');
            staleEl.setAttribute('fill', '#fbbf24');
            staleEl.setAttribute('font-size', '9');
            staleEl.setAttribute('font-family', 'monospace');
            staleEl.setAttribute('font-weight', '600');
            staleEl.setAttribute('text-anchor', 'middle');
            staleEl.textContent = '⚠ stale';
            staleGrp.appendChild(staleEl);
            g.appendChild(staleGrp);
        }

        // ── Divider under header ──
        const divider = document.createElementNS(NS, 'line');
        divider.setAttribute('x1', BAR); divider.setAttribute('y1', '24');
        divider.setAttribute('x2', pos.w); divider.setAttribute('y2', '24');
        divider.setAttribute('stroke', '#2e2e2e'); divider.setAttribute('stroke-width', '1');
        g.appendChild(divider);

        // ── Table name ──
        const displayName = t.name.length > 22 ? t.name.slice(0, 20) + '…' : t.name;
        const nameEl = document.createElementNS(NS, 'text');
        nameEl.setAttribute('x', OFFSET); nameEl.setAttribute('y', '40');
        nameEl.setAttribute('fill', '#f0f0f0');
        nameEl.setAttribute('font-size', '13');
        nameEl.setAttribute('font-family', 'sans-serif');
        nameEl.setAttribute('font-weight', '700');
        nameEl.textContent = displayName;
        g.appendChild(nameEl);

        // ── Row count (live reference — updated by refresh) ──
        const rowEl = document.createElementNS(NS, 'text');
        rowEl.setAttribute('x', OFFSET); rowEl.setAttribute('y', '54');
        rowEl.setAttribute('fill', '#5a5a5a');
        rowEl.setAttribute('font-size', '10');
        rowEl.setAttribute('font-family', 'sans-serif');
        rowEl.setAttribute('data-schema-row', t.id);
        rowEl.textContent = `${t.rows.length} row${t.rows.length !== 1 ? 's' : ''}`;
        g.appendChild(rowEl);

        // ── Column count ──
        const colEl = document.createElementNS(NS, 'text');
        colEl.setAttribute('x', String(pos.w - 8)); colEl.setAttribute('y', '54');
        colEl.setAttribute('fill', '#3a3a3a');
        colEl.setAttribute('font-size', '10');
        colEl.setAttribute('font-family', 'sans-serif');
        colEl.setAttribute('text-anchor', 'end');
        colEl.textContent = `${t.columns.length} col${t.columns.length !== 1 ? 's' : ''}`;
        g.appendChild(colEl);

        // ── Ref (monospace) ──
        const refStr = `:${t.ref}`;
        const displayRef = refStr.length > 26 ? refStr.slice(0, 24) + '…' : refStr;
        const refEl = document.createElementNS(NS, 'text');
        refEl.setAttribute('x', OFFSET); refEl.setAttribute('y', '66');
        refEl.setAttribute('fill', '#454545');
        refEl.setAttribute('font-size', '9');
        refEl.setAttribute('font-family', 'monospace');
        refEl.textContent = displayRef;
        g.appendChild(refEl);

        // ── Action bar: divider + Edit + Refresh buttons ──
        const ACTION_Y = 70;
        const actionDivEl = document.createElementNS(NS, 'line');
        actionDivEl.setAttribute('x1', BAR); actionDivEl.setAttribute('y1', String(ACTION_Y));
        actionDivEl.setAttribute('x2', pos.w); actionDivEl.setAttribute('y2', String(ACTION_Y));
        actionDivEl.setAttribute('stroke', '#252525'); actionDivEl.setAttribute('stroke-width', '1');
        g.appendChild(actionDivEl);

        const BTN_H = pos.h - ACTION_Y; // 18px
        const BTN_TEXT_Y = ACTION_Y + BTN_H / 2 + 4;
        // Three equal-width buttons: Edit | Pin | Refresh
        const SEP1 = Math.round(pos.w * 0.33);
        const SEP2 = Math.round(pos.w * 0.67);
        const SEP3 = SEP2; // unused — kept for addSep call below

        // Mutable ref so button hover handlers can access the node's tooltip HTML
        // (set after buildTooltipHTML is called later in the loop body)
        const nodeTooltipRef = { html: '' };

        function makeSvgBtn(x, w, label, title) {
            const bg = document.createElementNS(NS, 'rect');
            bg.setAttribute('x', String(x)); bg.setAttribute('y', String(ACTION_Y));
            bg.setAttribute('width', String(w)); bg.setAttribute('height', String(BTN_H));
            bg.setAttribute('fill', 'transparent');
            const txt = document.createElementNS(NS, 'text');
            txt.setAttribute('x', String(x + w / 2)); txt.setAttribute('y', String(BTN_TEXT_Y));
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('fill', '#484848');
            txt.setAttribute('font-size', '10');
            txt.setAttribute('font-family', 'sans-serif');
            txt.textContent = label;
            const grp = document.createElementNS(NS, 'g');
            grp.setAttribute('title', title);
            grp.style.cursor = 'pointer';
            grp.appendChild(bg); grp.appendChild(txt);
            grp.addEventListener('mouseenter', () => {
                bg.setAttribute('fill', '#222');
                txt.setAttribute('fill', '#c0c0c0');
                schemaTooltip.innerHTML = `<div class="schema-tooltip-btn-hint">${title}</div>`;
                schemaTooltip.classList.remove('hidden');
            });
            grp.addEventListener('mouseleave', () => {
                bg.setAttribute('fill', 'transparent');
                txt.setAttribute('fill', txt._baseColor || '#484848');
                schemaTooltip.innerHTML = nodeTooltipRef.html;
                // Keep tooltip visible — node's mouseleave will hide it when cursor leaves the node
            });
            return { grp, txt };
        }

        function addSep(x) {
            const sep = document.createElementNS(NS, 'line');
            sep.setAttribute('x1', String(x)); sep.setAttribute('y1', String(ACTION_Y + 2));
            sep.setAttribute('x2', String(x)); sep.setAttribute('y2', String(pos.h - 2));
            sep.setAttribute('stroke', '#252525'); sep.setAttribute('stroke-width', '1');
            g.appendChild(sep);
        }
        addSep(SEP1); addSep(SEP2);

        const { grp: editGrp } = makeSvgBtn(BAR, SEP1 - BAR, '✎ Edit', 'Edit this table');
        g.appendChild(editGrp);
        editGrp.addEventListener('click', (e) => {
            e.stopPropagation();
            if (t.source === 'result') {
                openResultPanelForEdit(t);
            } else if (t.source === 'soql') {
                openAddPanelForSoqlEdit(t);
            } else {
                openAddPanelForPasteEdit(t);
            }
        });

        // ── Pin button ──
        const { grp: pinGrp, txt: pinTxt } = makeSvgBtn(SEP1, SEP2 - SEP1, '⊙', 'Pin this highlight');
        lockMeta.push({ id: t.id, ring: lockRing, pinTxt, acc });
        g.appendChild(pinGrp);
        pinGrp.addEventListener('click', (e) => {
            e.stopPropagation();
            if (lockedId === t.id) { unlock(); }
            else { lockTo(t.id); schemaTooltip.classList.add('hidden'); }
        });

        const { grp: refreshGrp, txt: refreshTxt } = makeSvgBtn(SEP2, pos.w - SEP2, '↻', 'Refresh this table');
        refreshTxt.setAttribute('data-refresh-for', t.id);
        if (t.stale) refreshTxt.setAttribute('fill', '#fbbf24');
        if (t.source === 'paste') {
            refreshTxt.setAttribute('fill', '#2a2a2a');
            refreshGrp.style.cursor = 'default';
            refreshGrp.replaceWith(refreshGrp); // keep in DOM but non-interactive via override
            refreshGrp.addEventListener('mouseenter', (e) => e.stopImmediatePropagation(), true);
        } else {
            refreshGrp.addEventListener('click', async (e) => {
                e.stopPropagation();
                refreshTxt.textContent = '…';
                try {
                    if (t.source === 'soql') {
                        if (!t.soqlQuery) return;
                        const { resolved, errors } = resolveTableRefs(t.soqlQuery);
                        if (errors.length > 0) { showToast(errors.join(' · '), 'error', 0); return; }
                        const result = await window.electronAPI.runDataWorkbenchSoql({ query: resolved, orgIdentifier: t.orgIdentifier });
                        if (result.error) { showToast(result.error, 'error', 0); return; }
                        t.rows = result.rows;
                        const removedS = applyColumnRenames(t, result.columns);
                        markBrokenReferences(t.id, removedS);
                        markDependentsStale(t.id);
                    } else {
                        const recipeResult = computeFromRecipe(t.recipe);
                        t.columns    = recipeResult.columns;
                        t.columnDefs = recipeResult.columnDefs;
                        t.rows       = recipeResult.rows.map(r => [...r]);
                        t.stale      = false;
                        document.querySelector(`[data-stale-badge="${t.id}"]`)?.remove();
                        markDependentsStale(t.id);
                    }
                    // Update schema node row count
                    rowEl.textContent = `${t.rows.length} row${t.rows.length !== 1 ? 's' : ''}`;
                    refreshTxt.setAttribute('fill', '#484848');
                    // Update main-view card
                    const card = document.querySelector(`.table-card[data-table-id="${t.id}"]`);
                    if (card) {
                        renderTableBody(card.querySelector('.table-wrapper'), t);
                        const rc = card.querySelector('.row-count');
                        if (rc) { const d = t.rows.length, tot = t.totalSize || d; rc.textContent = tot > d ? `${d} / ${tot} rows` : `${d} row${d !== 1 ? 's' : ''}`; }
                        card.querySelector('.stale-banner')?.classList.remove('visible');
                        card.querySelectorAll('.btn-edit').forEach(b => { if (b.textContent === '↻') b.classList.remove('stale'); });
                    }
                    // Refresh preview if open for this table
                    if (!schemaPreview.classList.contains('hidden') && schemaPreview.dataset.tableId === t.id) {
                        openSchemaPreview(t);
                    }
                    renderSchema();
                } finally {
                    // refreshTxt is detached if renderSchema() ran — harmless to set
                    refreshTxt.textContent = '↻';
                }
            });
        }
        g.appendChild(refreshGrp);

        // ── Clickable node body → preview panel ──
        const hitArea = document.createElementNS(NS, 'rect');
        hitArea.setAttribute('width', pos.w); hitArea.setAttribute('height', String(ACTION_Y));
        hitArea.setAttribute('fill', 'transparent');
        hitArea.style.cursor = 'pointer';
        hitArea.addEventListener('click', () => openSchemaPreview(t));
        g.appendChild(hitArea);

        // ── Cascade button (top-right of header, above hitArea, only when has dependents) ──
        if (hasDependents(t)) {
            const CB_W = 16, CB_H = 16;
            const CB_X = pos.w - 72;  // 2px gap left of op/stale pill (pos.w-54)
            const CB_Y = 5;

            const cascadeGrp = document.createElementNS(NS, 'g');
            cascadeGrp.style.cursor = 'pointer';

            const cascadeBg = document.createElementNS(NS, 'rect');
            cascadeBg.setAttribute('x', String(CB_X));
            cascadeBg.setAttribute('y', String(CB_Y));
            cascadeBg.setAttribute('width', String(CB_W));
            cascadeBg.setAttribute('height', String(CB_H));
            cascadeBg.setAttribute('rx', '3');
            cascadeBg.setAttribute('fill', 'transparent');
            cascadeBg.setAttribute('pointer-events', 'all');

            const cascadeTxt = document.createElementNS(NS, 'text');
            cascadeTxt.setAttribute('x', String(CB_X + CB_W / 2));
            cascadeTxt.setAttribute('y', String(CB_Y + CB_H / 2 + 4));
            cascadeTxt.setAttribute('text-anchor', 'middle');
            cascadeTxt.setAttribute('fill', '#484848');
            cascadeTxt.setAttribute('font-size', '11');
            cascadeTxt.setAttribute('font-family', 'sans-serif');
            cascadeTxt.setAttribute('pointer-events', 'none');
            cascadeTxt.textContent = '→';

            cascadeGrp.appendChild(cascadeBg);
            cascadeGrp.appendChild(cascadeTxt);

            cascadeGrp.addEventListener('mouseenter', (e) => {
                e.stopPropagation();
                cascadeBg.setAttribute('fill', '#222');
                cascadeTxt.setAttribute('fill', '#c0c0c0');
                schemaTooltip.innerHTML = `<div class="schema-tooltip-btn-hint">→ Rebuild all from this point</div>`;
                schemaTooltip.classList.remove('hidden');
            });
            cascadeGrp.addEventListener('mouseleave', (e) => {
                e.stopPropagation();
                cascadeBg.setAttribute('fill', 'transparent');
                cascadeTxt.setAttribute('fill', '#484848');
                schemaTooltip.innerHTML = nodeTooltipRef.html;
            });
            cascadeGrp.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ctrl = {
                    get textContent() { return cascadeTxt.textContent; },
                    set textContent(v) { cascadeTxt.textContent = v || '→'; },
                    get disabled() { return cascadeGrp.style.pointerEvents === 'none'; },
                    set disabled(v) {
                        cascadeGrp.style.pointerEvents = v ? 'none' : 'all';
                        cascadeTxt.setAttribute('fill', v ? '#2a2a2a' : '#484848');
                    },
                    get title() { return ''; },
                    set title(v) {},
                    classList: {
                        add(cls) { if (cls === 'spinning') cascadeTxt.setAttribute('fill', '#fbbf24'); },
                        remove(cls) { if (cls === 'spinning') cascadeTxt.setAttribute('fill', '#484848'); }
                    }
                };
                const progressToast = showToast(`Rebuilding from ${t.name}…`, 'info', 0);
                await cascadeRefresh(t.id, ctrl,
                    ({ table, index, total }) => progressToast.update(`✓ ${table.name} (${index}/${total})`),
                    ({ table, index, total }) => progressToast.update(`Rebuilding: ${table.name}… (${index}/${total})`)
                );
                progressToast.dismiss();
                showToast(`Cascade complete`, 'success', 3000);
                renderSchema();
            });

            g.appendChild(cascadeGrp);
        }

        nodeGroups.push({ id: t.id, g });

        // ── Hover: highlight connected nodes/edges (respects pin lock) ──
        const tooltipHTML = buildTooltipHTML(t);
        nodeTooltipRef.html = tooltipHTML;
        g.addEventListener('mouseenter', () => {
            if (!lockedId) applyHighlight(t.id);
            schemaTooltip.innerHTML = tooltipHTML;
            schemaTooltip.classList.remove('hidden');
        });
        g.addEventListener('mousemove', (e) => {
            const offset = 14;
            let left = e.clientX + offset;
            let top  = e.clientY + offset;
            if (left + 310 > window.innerWidth)  left = e.clientX - 310 - offset;
            if (top  + 200 > window.innerHeight) top  = e.clientY - 200 - offset;
            schemaTooltip.style.left = `${left}px`;
            schemaTooltip.style.top  = `${top}px`;
        });
        g.addEventListener('mouseleave', () => {
            if (!lockedId) resetHighlight();
            schemaTooltip.classList.add('hidden');
        });

        svg.appendChild(g);
    });

    schemaCanvas.appendChild(svg);
}

function openSchemaPreview(tableEntry) {
    schemaPreviewError.classList.remove('visible');
    schemaPreview.dataset.tableId = tableEntry.id;
    schemaPreviewTitle.textContent = tableEntry.name;
    schemaPreviewBadge.className = `schema-preview-badge ${tableEntry.source}`;
    schemaPreviewBadge.textContent = tableEntry.source.toUpperCase();
    const d = tableEntry.rows.length, tot = tableEntry.totalSize || d;
    schemaPreviewMeta.textContent = tot > d ? `${d} / ${tot} rows · ${tableEntry.columns.length} cols` : `${d} row${d !== 1 ? 's' : ''} · ${tableEntry.columns.length} cols`;

    // Description — always visible, inline editable
    schemaPreviewDesc.textContent = tableEntry.description || '';
    schemaPreviewDesc.onblur = () => {
        const val = schemaPreviewDesc.innerText.trim();
        tableEntry.description = val || null;
        renderSchema(); // refreshes tooltip which includes description
    };
    schemaPreviewDesc.onkeydown = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); schemaPreviewDesc.blur(); }
    };

    // Column rename indicator — show columns where display name differs from origin
    const renamedDefs = (tableEntry.columnDefs || []).filter(d => d.origin && d.origin !== d.name);
    if (renamedDefs.length > 0) {
        schemaPreviewRenames.title = renamedDefs.map(d => `${d.origin} → ${d.name}`).join('\n');
        schemaPreviewRenames.classList.remove('hidden');
    } else {
        schemaPreviewRenames.classList.add('hidden');
    }

    const existing = schemaPreview.querySelector('.schema-preview-exports');
    if (existing) existing.remove();
    if (tableEntry.rows.length > 0) {
        const group = document.createElement('div');
        group.className = 'schema-preview-exports';
        group.append(...buildExportButtons(tableEntry));
        document.getElementById('schema-preview-close').insertAdjacentElement('beforebegin', group);
    }
    schemaPreviewBody.innerHTML = '';
    if (tableEntry.rows.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'schema-preview-empty';
        msg.textContent = tableEntry.source === 'soql' ? 'No data — use ↻ Refresh to run the query.' : 'No data — use ↻ Refresh to compute.';
        schemaPreviewBody.appendChild(msg);
    } else {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrapper';
        renderTableBody(wrap, tableEntry);
        schemaPreviewBody.appendChild(wrap);
    }
    schemaPreview.classList.remove('hidden');
}
