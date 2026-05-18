/**
 * initQueryLibrary({ container, onSelect, onClose })
 *
 * container — element to render the library panel into
 * onSelect(query) — called when user clicks a tile
 * onClose()       — called when user closes the panel
 *
 * Returns { open, close }
 */
function initQueryLibrary({ container, onSelect, onClose }) {

    function parseObject(query) {
        const m = query.match(/\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/i);
        return m ? m[1] : 'Other';
    }

    function groupByObject(items) {
        const map = new Map();
        items.forEach(item => {
            const obj = parseObject(item.query);
            if (!map.has(obj)) map.set(obj, []);
            map.get(obj).push(item);
        });
        return map;
    }

    function buildTile(item, { isFavorite, searchTerm, onUse, onDelete }) {
        const tile = document.createElement('div');
        tile.className = 'ql-tile';

        const body = document.createElement('div');
        body.className = 'ql-tile-body';
        body.addEventListener('click', () => onUse(item.query));

        const name = document.createElement('div');
        name.className = 'ql-tile-name';
        name.textContent = item.name || parseObject(item.query);

        const preview = document.createElement('div');
        preview.className = 'ql-tile-preview';
        preview.textContent = item.query.replace(/\s+/g, ' ').trim();

        const tooltip = document.createElement('div');
        tooltip.className = 'ql-tile-tooltip';
        tooltip.textContent = item.query;

        body.append(name, preview, tooltip);
        tile.appendChild(body);

        if (isFavorite) {
            const del = document.createElement('button');
            del.className = 'ql-tile-delete';
            del.textContent = '✕';
            del.title = 'Remove from favorites';
            del.addEventListener('click', e => { e.stopPropagation(); onDelete(item.id); });
            tile.appendChild(del);
        }

        // Highlight search term in name
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            if (!item.query.toLowerCase().includes(lower) && !name.textContent.toLowerCase().includes(lower)) {
                tile.classList.add('ql-hidden');
            }
        }

        return tile;
    }

    function buildGroup(objectName, items, opts) {
        const group = document.createElement('div');
        group.className = 'ql-group';

        const title = document.createElement('div');
        title.className = 'ql-group-title';
        title.textContent = objectName;
        group.appendChild(title);

        const tiles = document.createElement('div');
        tiles.className = 'ql-tiles';
        items.forEach(item => tiles.appendChild(buildTile(item, opts)));
        group.appendChild(tiles);
        return group;
    }

    async function render(searchTerm = '') {
        container.innerHTML = '';

        const [favorites, recent] = await Promise.all([
            window.electronAPI.qlGetFavorites(),
            window.electronAPI.qlGetRecent()
        ]);

        // ── Header ────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'ql-header';

        const searchWrap = document.createElement('div');
        searchWrap.className = 'ql-search-wrap';
        const searchInput = document.createElement('input');
        searchInput.className = 'ql-search';
        searchInput.placeholder = 'Search queries…';
        searchInput.value = searchTerm;
        searchInput.spellcheck = false;
        searchWrap.appendChild(searchInput);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ql-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', onClose);

        header.append(searchWrap, closeBtn);
        container.appendChild(header);

        // ── Body ──────────────────────────────────────
        const body = document.createElement('div');
        body.className = 'ql-body';

        const lower = searchTerm.toLowerCase();

        function filterItems(items) {
            if (!lower) return items;
            return items.filter(i =>
                i.query.toLowerCase().includes(lower) ||
                (i.name || '').toLowerCase().includes(lower)
            );
        }

        async function deleteFavorite(id) {
            await window.electronAPI.qlDeleteFavorite({ id });
            render(searchInput.value);
        }

        // Favorites section
        const filteredFavs = filterItems(favorites);
        if (filteredFavs.length) {
            const section = document.createElement('div');
            section.className = 'ql-section';
            const secTitle = document.createElement('div');
            secTitle.className = 'ql-section-title';
            secTitle.textContent = '★ Saved';
            section.appendChild(secTitle);

            const groups = groupByObject(filteredFavs);
            groups.forEach((items, obj) => {
                section.appendChild(buildGroup(obj, items, {
                    isFavorite: true,
                    onUse:   q => onSelect(q),
                    onDelete: id => deleteFavorite(id)
                }));
            });
            body.appendChild(section);
        }

        // Recent section
        const filteredRecent = filterItems(recent);
        if (filteredRecent.length) {
            if (filteredFavs.length) {
                const sep = document.createElement('div');
                sep.className = 'ql-sep';
                body.appendChild(sep);
            }
            const section = document.createElement('div');
            section.className = 'ql-section';
            const secTitle = document.createElement('div');
            secTitle.className = 'ql-section-title';
            secTitle.textContent = '↺ Recent';
            section.appendChild(secTitle);

            const tiles = document.createElement('div');
            tiles.className = 'ql-tiles';
            filteredRecent.forEach(item => {
                tiles.appendChild(buildTile(
                    { ...item, name: parseObject(item.query) },
                    { isFavorite: false, onUse: q => onSelect(q), onDelete: () => {} }
                ));
            });
            section.appendChild(tiles);
            body.appendChild(section);
        }

        if (!filteredFavs.length && !filteredRecent.length) {
            const empty = document.createElement('div');
            empty.className = 'ql-empty';
            empty.textContent = lower ? 'No matching queries.' : 'No saved or recent queries yet.';
            body.appendChild(empty);
        }

        container.appendChild(body);

        // Live search re-render
        searchInput.addEventListener('input', () => render(searchInput.value));
        searchInput.focus();
    }

    return {
        open:  () => render(''),
        refresh: (term) => render(term || '')
    };
}
