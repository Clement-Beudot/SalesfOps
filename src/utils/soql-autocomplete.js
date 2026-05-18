/**
 * initSoqlAutocomplete({ textarea, dropdown, getOrg, describeObject, onShow, onHide })
 *
 * textarea       — <textarea> element for SOQL input
 * dropdown       — <div> that will be populated as the autocomplete list
 * getOrg         — () => string   returns the current org identifier
 * describeObject — async (objectName, org) => { success, data: { fields, childRelationships } }
 * onShow(h)      — called when dropdown opens, with its pixel height
 * onHide()       — called when dropdown closes
 *
 * Returns { hide, invalidate }
 */
function initSoqlAutocomplete({ textarea, dropdown, getOrg, describeObject, listObjects, invalidateObjects, invalidateDescribe, onShow, onHide, persistent = false }) {
    // Per-org, per-object describe cache: `${org}::${objName}` → { fields, childRelationships }
    const _cache       = new Map();
    const _objectCache = new Map(); // org → objects[]
    let _callId           = 0;
    let activeIdx         = -1;
    let _activePrefix     = null;
    let _picklistCtx      = null; // { hasQuote, valueFrag } when in picklist mode
    let _applyCheckboxes  = null; // set when IN checkbox UI is active

    // ── Parsing helpers ──────────────────────────────

    /**
     * Returns { fromObj, isSubquery, outerFromObj }
     * Handles nested subqueries by tracking parenthesis depth.
     */
    function parseActiveContext(sql, pos) {
        // Find innermost context start
        let depth = 0;
        let innerStart = 0;
        for (let i = 0; i < pos; i++) {
            if (sql[i] === '(') { depth++; innerStart = i + 1; }
            else if (sql[i] === ')') { depth--; if (depth === 0) innerStart = 0; }
        }
        const isSubquery = depth > 0;

        // Find the end of the current context
        let end = sql.length;
        let d = 0;
        for (let i = innerStart; i < sql.length; i++) {
            if (sql[i] === '(') d++;
            else if (sql[i] === ')') { if (d === 0) { end = i; break; } d--; }
        }

        // Find the last FROM at depth 0 within this context
        const ctx = sql.slice(innerStart, end);
        const fromObj = findFromAtDepthZero(ctx);

        // For subqueries, also find the outer (depth-0) FROM
        const outerFromObj = isSubquery ? findFromAtDepthZero(sql) : null;

        return { fromObj, isSubquery, outerFromObj };
    }

    function findFromAtDepthZero(text) {
        const re = /\(|\)|\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
        let depth = 0;
        let result = null;
        let m;
        while ((m = re.exec(text)) !== null) {
            if      (m[0] === '(') depth++;
            else if (m[0] === ')') depth--;
            else if (m[1] && depth === 0) result = m[1];
        }
        return result;
    }

    /**
     * Returns { prefixChain, fragment, raw }
     * - `Account.RecordType.Dev` → { prefixChain:['Account','RecordType'], fragment:'Dev',  raw:'Account.RecordType.Dev' }
     * - `Account.RecordType.`   → { prefixChain:['Account','RecordType'], fragment:'',     raw:'Account.RecordType.'   }
     * - `Account.Nam`           → { prefixChain:['Account'],              fragment:'Nam',  raw:'Account.Nam'           }
     * - `Nam`                   → { prefixChain:[],                       fragment:'Nam',  raw:'Nam'                   }
     */
    function parseWordAtCursor(text, pos) {
        const before = text.slice(0, pos);
        // N levels with a trailing fragment: A.B.C.frag
        const mFull = before.match(/((?:[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
        if (mFull) return { prefixChain: mFull[1].split('.'), fragment: mFull[2], raw: mFull[0] };
        // N levels ending with a dot: A.B.C.
        const mDot = before.match(/((?:[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.$/);
        if (mDot) return { prefixChain: mDot[1].split('.'), fragment: '', raw: mDot[0] };
        // Plain word
        const mSimple = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
        const frag = mSimple ? mSimple[1] : '';
        return { prefixChain: [], fragment: frag, raw: frag };
    }

    // ── Parsing: detect cursor position relative to FROM ──

    /**
     * Returns the fragment being typed right after the FROM keyword at the
     * current nesting depth, or null if the cursor is not on the FROM object word.
     */
    function fromFragment(text, pos) {
        // Build the "before-cursor" text within the current paren depth
        let depth = 0;
        let innerStart = 0;
        for (let i = 0; i < pos; i++) {
            if (text[i] === '(') { depth++; innerStart = i + 1; }
            else if (text[i] === ')') { depth--; if (depth === 0) innerStart = 0; }
        }
        const before = text.slice(innerStart, pos);
        const m = before.match(/\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
        return m ? m[1] : null;
    }

    /**
     * Detects if the cursor is positioned after a field comparison operator in a
     * WHERE clause, ready for a picklist value. Handles =, !=, LIKE, IN.
     * Returns { fieldPath, valueFrag, hasQuote } or null.
     */
    function parsePicklistContext(text, pos) {
        const before = text.slice(0, pos);
        const FIELD  = '((?:[A-Za-z_][A-Za-z0-9_]*)(?:\\.[A-Za-z_][A-Za-z0-9_]*)*)';
        const EQ_OP  = '(?:=|!=|LIKE|INCLUDES|EXCLUDES)';
        const IN_OP  = '(?:(?:NOT\\s+)?IN|INCLUDES|EXCLUDES)';

        // field = 'valueFrag   or   field INCLUDES 'valueFrag
        const mEq = before.match(new RegExp(`\\b${FIELD}\\s*${EQ_OP}\\s*'([^']*)$`, 'i'));
        if (mEq) return { fieldPath: mEq[1], valueFrag: mEq[2], hasQuote: true, mode: 'eq' };

        // field IN ('v1', 'valueFrag    ([\s\S]* crosses line breaks; [^'),]* excludes ) and , so
        // a closed paren like IN ('X','Y') doesn't match via the closing quote of 'Y')
        const mIn = before.match(new RegExp(`\\b${FIELD}\\s+${IN_OP}\\s*\\([\\s\\S]*'([^'),]*)$`, 'i'));
        if (mIn) return { fieldPath: mIn[1], valueFrag: mIn[2], hasQuote: true, mode: 'in' };

        // field = ▌  (no quote typed yet)
        const mEqNoQ = before.match(new RegExp(`\\b${FIELD}\\s*(?:=|!=)\\s*$`, 'i'));
        if (mEqNoQ) return { fieldPath: mEqNoQ[1], valueFrag: '', hasQuote: false, mode: 'eq' };

        // field IN (▌  or  field IN ('v', ▌  (inside IN, no current open quote)
        const mInNoQ = before.match(new RegExp(`\\b${FIELD}\\s+${IN_OP}\\s*\\((?:'[^']*'[\\s,]*)*$`, 'i'));
        if (mInNoQ) return { fieldPath: mInNoQ[1], valueFrag: '', hasQuote: false, mode: 'in' };

        return null;
    }

    /**
     * Finds the character range [start, end) of the (…) portion of the IN clause
     * that contains the cursor, so the whole list can be replaced atomically.
     */
    function findInParenRange(text, pos) {
        const before = text.slice(0, pos);
        // Find the rightmost IN ( before the cursor
        const re = /\b(?:NOT\s+)?IN\s*\(/gi;
        let openParen = -1;
        let m;
        while ((m = re.exec(before)) !== null) openParen = m.index + m[0].length - 1;
        if (openParen === -1) return null;
        // Walk forward from ( to find the matching )
        let depth = 0;
        let closeParen = -1;
        for (let i = openParen; i < text.length; i++) {
            if (text[i] === '(') depth++;
            else if (text[i] === ')') { depth--; if (depth === 0) { closeParen = i; break; } }
        }
        return { start: openParen, end: closeParen === -1 ? pos : closeParen + 1 };
    }

    /** Returns values already present inside the IN (…) paren at the cursor. */
    function parseExistingInValues(text, pos) {
        const range = findInParenRange(text, pos);
        if (!range) return [];
        const inner = text.slice(range.start + 1, range.end - 1);
        const values = [];
        const re = /'([^']*)'/g;
        let m;
        while ((m = re.exec(inner)) !== null) values.push(m[1]);
        return values;
    }

    /**
     * Resolves fieldPath (e.g. 'Account.RecordType.DeveloperName') starting from
     * baseObj by following relationshipName links through the describe cache.
     * Returns the field descriptor or null.
     */
    async function resolveFieldInChain(org, baseObj, fieldPath, myCallId) {
        const parts     = fieldPath.split('.');
        const fieldName = parts.pop();
        let currentObj  = baseObj;
        for (const rel of parts) {
            if (!_cache.has(`${org}::${currentObj}`)) {
                if (await ensureDescribed(currentObj, org, myCallId) === null) return null;
            }
            if (_callId !== myCallId) return null;
            const relField = (_cache.get(`${org}::${currentObj}`)?.fields || [])
                .find(f => f.relationshipName?.toLowerCase() === rel.toLowerCase());
            if (!relField?.referenceTo?.length) return null;
            currentObj = relField.referenceTo[0];
        }
        if (!_cache.has(`${org}::${currentObj}`)) {
            if (await ensureDescribed(currentObj, org, myCallId) === null) return null;
        }
        if (_callId !== myCallId) return null;
        return (_cache.get(`${org}::${currentObj}`)?.fields || [])
            .find(f => f.name.toLowerCase() === fieldName.toLowerCase()) || null;
    }

    /**
     * For fields of type reference, adds a synthetic entry for the relationship
     * name (e.g. AccountId → also add "Account" with type "lookup").
     * This lets the user type "Account" and then "Account." to traverse the lookup.
     */
    function augmentWithRelationships(fields) {
        const items = [];
        const seen  = new Set();
        for (const f of fields) {
            items.push(f);
            if (f.relationshipName && !seen.has(f.relationshipName)) {
                seen.add(f.relationshipName);
                items.push({
                    name:  f.relationshipName,
                    label: f.label.replace(/\s*ID?$/i, '').trim() || f.relationshipName,
                    type:  'lookup'
                });
            }
        }
        return items;
    }

    // ── SELECT context detection ──────────────────────

    /**
     * Returns true if the cursor is inside the SELECT field list (not in WHERE/FROM/etc).
     * Tracks paren depth so subqueries are handled correctly.
     */
    function isInSelectClause(text, pos) {
        // Isolate the innermost paren context up to cursor
        let depth = 0;
        let innerStart = 0;
        for (let i = 0; i < pos; i++) {
            if (text[i] === '(') { depth++; innerStart = i + 1; }
            else if (text[i] === ')') { depth--; if (depth === 0) innerStart = 0; }
        }
        const ctx = text.slice(innerStart, pos);
        // Find last SELECT or FROM at depth 0 within that context
        const re = /\(|\)|\b(SELECT|FROM|WHERE|GROUP|ORDER|HAVING|LIMIT|OFFSET)\b/gi;
        let d = 0, lastKw = null, m;
        while ((m = re.exec(ctx)) !== null) {
            if      (m[0] === '(') d++;
            else if (m[0] === ')') d--;
            else if (d === 0) lastKw = m[1].toUpperCase();
        }
        return lastKw === 'SELECT';
    }

    /**
     * Returns the suffix to append after inserting a field in a SELECT clause.
     * lookup → '.', any other field → ', '.
     */
    function selectSuffix(fieldType) {
        return fieldType === 'lookup' ? '.' : ', ';
    }

    // ── Sorting ───────────────────────────────────────

    /**
     * Sorts items by match quality against `fragment`, then alphabetically.
     * Rank 0 = exact, 1 = starts-with, 2 = contains.
     * `getName` extracts the string to compare against (defaults to item.name).
     */
    function sortByRelevance(items, fragment, getName = f => f.name) {
        const lower = fragment.toLowerCase();
        return [...items].sort((a, b) => {
            const na = getName(a).toLowerCase();
            const nb = getName(b).toLowerCase();
            const ra = na === lower ? 0 : na.startsWith(lower) ? 1 : 2;
            const rb = nb === lower ? 0 : nb.startsWith(lower) ? 1 : 2;
            if (ra !== rb) return ra - rb;
            return na.localeCompare(nb);
        });
    }

    // ── Fetch helpers ─────────────────────────────────

    async function ensureDescribed(objName, org, callId) {
        const key = `${org}::${objName}`;
        if (_cache.has(key)) return _cache.get(key);
        try {
            const res = await describeObject(objName, org);
            if (res.success) _cache.set(key, res.data);
        } catch { /* silent */ }
        if (_callId !== callId) return null; // superseded by a newer keystroke
        return _cache.get(key) || null;
    }

    async function ensureObjectList(org, callId) {
        if (_objectCache.has(org)) return _objectCache.get(org);
        if (!listObjects) return null;
        try {
            const objects = await listObjects(org);
            if (objects?.length) _objectCache.set(org, objects);
        } catch { /* silent */ }
        if (_callId !== callId) return null;
        return _objectCache.get(org) || null;
    }

    // ── Dropdown rendering ────────────────────────────

    function showLoading(objName) {
        dropdown.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'soql-ac-object';
        header.textContent = objName;
        const loading = document.createElement('div');
        loading.className = 'soql-ac-empty';
        loading.textContent = 'Loading fields…';
        dropdown.append(header, loading);
        if (!persistent) dropdown.classList.remove('hidden');
        if (onShow) onShow(dropdown.offsetHeight);
    }

    function show(items, objName, prefix) {
        _activePrefix = prefix;
        dropdown.innerHTML = '';
        if (!items.length) { dropdown.innerHTML = ''; if (!persistent) dropdown.classList.add('hidden'); return; }

        const header = document.createElement('div');
        header.className = 'soql-ac-object';
        header.textContent = objName;
        dropdown.appendChild(header);

        items.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = 'soql-ac-item';
            item.dataset.idx  = i;
            item.dataset.type = f.type || '';

            const name  = document.createElement('span'); name.className  = 'soql-ac-name';  name.textContent  = f.name;
            const label = document.createElement('span'); label.className = 'soql-ac-label'; label.textContent = f.label;
            const type  = document.createElement('span'); type.className  = 'soql-ac-type';  type.textContent  = f.type;

            item.append(name, label, type);
            item.addEventListener('mousedown', e => { e.preventDefault(); insertCompletion(f.name, prefix, f.type); });
            dropdown.appendChild(item);
        });
        if (!persistent) dropdown.classList.remove('hidden');
        setActive(0);
        if (onShow) onShow(dropdown.offsetHeight);
    }

    function hide() {
        const wasVisible = persistent || !dropdown.classList.contains('hidden');
        dropdown.innerHTML = '';
        if (!persistent) dropdown.classList.add('hidden');
        activeIdx        = -1;
        _activePrefix    = null;
        _picklistCtx     = null;
        _applyCheckboxes = null;
        if (wasVisible && onHide) onHide();
    }

    function setActive(idx) {
        const items = dropdown.querySelectorAll('.soql-ac-item');
        items.forEach(el => el.classList.remove('active'));
        if (idx >= 0 && idx < items.length) {
            items[idx].classList.add('active');
            items[idx].scrollIntoView({ block: 'nearest' });
        }
        activeIdx = idx;
    }

    function showPicklist(values, fieldName, ctx) {
        _picklistCtx  = ctx;
        _activePrefix = null;
        dropdown.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'soql-ac-object';
        header.textContent = fieldName;
        dropdown.appendChild(header);

        values.forEach((v, i) => {
            const item = document.createElement('div');
            item.className = 'soql-ac-item';
            item.dataset.idx = i;
            const name = document.createElement('span');
            name.className = 'soql-ac-name';
            name.textContent = v;
            item.appendChild(name);
            item.addEventListener('mousedown', e => { e.preventDefault(); insertPicklistValue(v, ctx); });
            dropdown.appendChild(item);
        });
        if (!persistent) dropdown.classList.remove('hidden');
        setActive(0);
        if (onShow) onShow(dropdown.offsetHeight);
    }

    function showPicklistCheckboxes(values, fieldName) {
        _picklistCtx  = null;
        _activePrefix = null;
        dropdown.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'soql-ac-object';
        header.textContent = fieldName;
        dropdown.appendChild(header);

        // Pre-check values already in the IN list
        const existing = new Set(
            parseExistingInValues(textarea.value, textarea.selectionStart)
                .map(v => v.toLowerCase())
        );

        const checkboxes = new Map(); // value → <input type=checkbox>

        values.forEach((v, i) => {
            const item = document.createElement('div');
            item.className = 'soql-ac-item';
            item.dataset.idx = i;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'soql-ac-checkbox';
            cb.checked = existing.has(v.toLowerCase());
            cb.tabIndex = -1;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'soql-ac-name';
            nameSpan.textContent = v;

            item.append(cb, nameSpan);
            item.addEventListener('mousedown', e => {
                e.preventDefault();
                cb.checked = !cb.checked;
            });
            checkboxes.set(v, cb);
            dropdown.appendChild(item);
        });

        // Apply button row
        const applyRow = document.createElement('div');
        applyRow.className = 'soql-ac-apply-row';
        const applyBtn = document.createElement('button');
        applyBtn.className = 'soql-ac-apply-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('mousedown', e => { e.preventDefault(); doApply(); });
        applyRow.appendChild(applyBtn);
        dropdown.appendChild(applyRow);

        function doApply() {
            const selected = values.filter(v => checkboxes.get(v).checked);
            const range = findInParenRange(textarea.value, textarea.selectionStart);
            if (!range) { hide(); return; }
            const clause = selected.length
                ? `(${selected.map(v => `'${v}'`).join(', ')})`
                : '()';
            const newText = textarea.value.slice(0, range.start) + clause + textarea.value.slice(range.end);
            textarea.value = newText;
            textarea.selectionStart = textarea.selectionEnd = range.start + clause.length;
            hide();
            textarea.focus();
        }

        _applyCheckboxes = doApply;

        if (!persistent) dropdown.classList.remove('hidden');
        setActive(0);
        if (onShow) onShow(dropdown.offsetHeight);
    }

    function insertPicklistValue(value, ctx) {
        const pos  = textarea.selectionStart;
        const text = textarea.value;
        const { hasQuote, valueFrag } = ctx;
        // Start of the literal: opening quote (if present) or cursor
        const litStart = hasQuote ? pos - valueFrag.length - 1 : pos;
        // End of literal: scan forward past the remaining typed chars and closing quote
        let litEnd = pos;
        while (litEnd < text.length && text[litEnd] !== "'" && text[litEnd] !== ' '
               && text[litEnd] !== ')' && text[litEnd] !== ',') litEnd++;
        if (litEnd < text.length && text[litEnd] === "'") litEnd++; // consume closing quote
        const before = text.slice(0, litStart) + `'${value}'`;
        textarea.value = before + text.slice(litEnd);
        textarea.selectionStart = textarea.selectionEnd = before.length;
        hide();
        textarea.focus();
    }

    function appendRefreshRow(label, onRefresh) {
        const row = document.createElement('div');
        row.className = 'soql-ac-refresh';
        const btn = document.createElement('button');
        btn.className = 'soql-ac-refresh-btn';
        btn.textContent = `↻ ${label}`;
        btn.addEventListener('mousedown', e => {
            e.preventDefault();
            onRefresh();
        });
        row.appendChild(btn);
        dropdown.appendChild(row);
        if (onShow) onShow(dropdown.offsetHeight);
    }

    // ── Insertion ─────────────────────────────────────

    function insertCompletion(fieldName, prefixStr, fieldType) {
        const pos  = textarea.selectionStart;
        const text = textarea.value;
        const { raw } = parseWordAtCursor(text, pos);
        const replacement = prefixStr ? `${prefixStr}.${fieldName}` : fieldName;
        const inSelect = isInSelectClause(text, pos);
        const suffix = inSelect ? selectSuffix(fieldType) : (fieldType === 'lookup' ? '.' : '');
        const before = text.slice(0, pos - raw.length) + replacement + suffix;
        textarea.value = before + text.slice(pos);
        textarea.selectionStart = textarea.selectionEnd = before.length;
        hide();
        textarea.focus();
    }

    // ── Main input handler ────────────────────────────

    async function onInput() {
        const myCallId = ++_callId;
        const text = textarea.value;
        const pos  = textarea.selectionStart;
        const org  = getOrg();
        const { prefixChain, fragment } = parseWordAtCursor(text, pos);

        // ── Case 0: picklist values in WHERE clause ───────────────────────
        const plCtx = parsePicklistContext(text, pos);
        if (plCtx) {
            // For IN clauses the cursor sits inside IN (...); that paren would make
            // parseActiveContext think we're in a subquery. Use the position of the
            // opening paren (before it is counted) so depth stays at 0.
            let contextPos = pos;
            if (plCtx.mode === 'in') {
                const inRange = findInParenRange(text, pos);
                if (inRange) contextPos = inRange.start;
            }
            const { fromObj: rawFrom, isSubquery, outerFromObj } = parseActiveContext(text, contextPos);
            if (!rawFrom) { hide(); return; }
            let baseObj = rawFrom;
            if (isSubquery && outerFromObj) {
                if (!_cache.has(`${org}::${outerFromObj}`)) {
                    if (await ensureDescribed(outerFromObj, org, myCallId) === null) return;
                }
                if (_callId !== myCallId) return;
                const rel = _cache.get(`${org}::${outerFromObj}`)?.childRelationships
                    ?.find(r => r.relationshipName?.toLowerCase() === rawFrom.toLowerCase());
                if (rel) baseObj = rel.childSObject;
            }
            const field = await resolveFieldInChain(org, baseObj, plCtx.fieldPath, myCallId);
            if (_callId !== myCallId) return;
            if (!field?.picklistValues?.length) { hide(); return; }
            if (plCtx.mode === 'in') {
                // Show all values as a checkbox multi-select
                showPicklistCheckboxes(field.picklistValues, field.name);
            } else {
                const lower   = plCtx.valueFrag.toLowerCase();
                const matched = field.picklistValues.filter(v => !lower || v.toLowerCase().includes(lower));
                if (matched.length) showPicklist(matched, field.name, plCtx);
                else hide();
            }
            return;
        }

        // ── Case 1: cursor is on the FROM object name → suggest objects or related lists ──
        const fromFrag = fromFragment(text, pos);
        if (!prefixChain.length && fromFrag !== null) {
            if (fromFrag.length < 1) { hide(); return; }

            // Detect if we're inside a subquery that lives in a SELECT clause:
            // find the opening ( of the current paren level and check its context.
            let subDepth = 0, openPos = -1;
            for (let i = 0; i < pos; i++) {
                if      (text[i] === '(') { subDepth++; openPos = i; }
                else if (text[i] === ')') { subDepth--; if (subDepth === 0) openPos = -1; }
            }
            const inSelectSubquery = openPos >= 0 && isInSelectClause(text, openPos);

            if (inSelectSubquery) {
                // ── Subquery in SELECT: suggest child relationship names of the outer object ──
                const outerFrom = findFromAtDepthZero(text);
                if (outerFrom) {
                    if (!_cache.has(`${org}::${outerFrom}`)) {
                        showLoading(outerFrom);
                        if (await ensureDescribed(outerFrom, org, myCallId) === null) return;
                    }
                    if (_callId !== myCallId) return;
                    const childRels = _cache.get(`${org}::${outerFrom}`)?.childRelationships || [];
                    const lower   = fromFrag.toLowerCase();
                    const matched = sortByRelevance(
                        childRels.filter(r => r.relationshipName.toLowerCase().includes(lower)),
                        fromFrag,
                        r => r.relationshipName
                    ).slice(0, 25).map(r => ({ name: r.relationshipName, label: r.childSObject, type: 'relationship' }));
                    if (matched.length) {
                        show(matched, `${outerFrom} — related lists`, null);
                        if (invalidateDescribe) {
                            appendRefreshRow(`Refresh ${outerFrom}`, () => {
                                _cache.delete(`${org}::${outerFrom}`);
                                invalidateDescribe(org, outerFrom);
                                onInput();
                            });
                        }
                    } else {
                        hide();
                    }
                    return;
                }
            }

            // ── Regular FROM (outer query or WHERE IN subquery): suggest all objects ──
            if (!listObjects) { hide(); return; }
            const objects = await ensureObjectList(org, myCallId);
            if (objects === null) return;
            const lower   = fromFrag.toLowerCase();
            const matched = sortByRelevance(
                objects.filter(o => o.name.toLowerCase().includes(lower) || o.label.toLowerCase().includes(lower)),
                fromFrag
            ).slice(0, 25).map(o => ({ name: o.name, label: o.label, type: o.name.includes('__c') ? 'custom' : 'standard' }));
            if (matched.length) {
                show(matched, 'Objects', null);
                if (invalidateObjects) {
                    appendRefreshRow('Refresh object list', () => {
                        _objectCache.delete(org);
                        invalidateObjects(org);
                        onInput();
                    });
                }
            } else {
                hide();
            }
            return;
        }

        // Need an active FROM object for field suggestions
        const { fromObj: rawFromObj, isSubquery, outerFromObj } = parseActiveContext(text, pos);
        if (!rawFromObj) { hide(); return; }

        // ── Resolve subquery relationship name → actual API object ──
        let fromObj = rawFromObj;
        if (isSubquery && outerFromObj) {
            if (!_cache.has(`${org}::${outerFromObj}`)) {
                showLoading(outerFromObj);
                const outer = await ensureDescribed(outerFromObj, org, myCallId);
                if (outer === null) return;
            }
            if (_callId !== myCallId) return;
            const rel = _cache.get(`${org}::${outerFromObj}`)?.childRelationships?.find(r =>
                r.relationshipName?.toLowerCase() === rawFromObj.toLowerCase()
            );
            if (rel) fromObj = rel.childSObject;
        }

        if (prefixChain.length > 0) {
            // ── Case 2: lookup traversal, N levels (Account.RecordType.Dev) ──
            let currentObj = fromObj;
            for (const rel of prefixChain) {
                if (!_cache.has(`${org}::${currentObj}`)) {
                    showLoading(currentObj);
                    if (await ensureDescribed(currentObj, org, myCallId) === null) return;
                }
                if (_callId !== myCallId) return;
                const fields   = _cache.get(`${org}::${currentObj}`)?.fields || [];
                const relField = fields.find(f =>
                    f.relationshipName && f.relationshipName.toLowerCase() === rel.toLowerCase()
                );
                if (!relField?.referenceTo?.length) { hide(); return; }
                currentObj = relField.referenceTo[0];
            }

            if (!_cache.has(`${org}::${currentObj}`)) {
                showLoading(currentObj);
                if (await ensureDescribed(currentObj, org, myCallId) === null) return;
            }
            if (_callId !== myCallId) return;

            const relFields = augmentWithRelationships(_cache.get(`${org}::${currentObj}`)?.fields || []);
            if (!relFields.length) { hide(); return; }

            const prefixStr = prefixChain.join('.');
            const lower     = fragment.toLowerCase();
            const matched   = sortByRelevance(
                relFields.filter(f => !lower || f.name.toLowerCase().includes(lower)),
                fragment
            ).slice(0, 20);
            if (matched.length) {
                show(matched, currentObj, prefixStr);
                if (invalidateDescribe) {
                    appendRefreshRow(`Refresh ${currentObj} fields`, () => {
                        _cache.delete(`${org}::${currentObj}`);
                        invalidateDescribe(org, currentObj);
                        onInput();
                    });
                }
            } else {
                hide();
            }

        } else {
            // ── Case 3: field suggestions for the active FROM object ──
            if (fragment.length < 2) { hide(); return; }
            if (fragment.toLowerCase() === fromObj.toLowerCase()) { hide(); return; } // typing the FROM name itself

            if (!_cache.has(`${org}::${fromObj}`)) {
                showLoading(fromObj);
                if (await ensureDescribed(fromObj, org, myCallId) === null) return;
            }
            if (_callId !== myCallId) return;

            const fromFields = augmentWithRelationships(_cache.get(`${org}::${fromObj}`)?.fields || []);
            if (!fromFields.length) { hide(); return; }

            const lower   = fragment.toLowerCase();
            const matched = sortByRelevance(
                fromFields.filter(f => f.name.toLowerCase().includes(lower)),
                fragment
            ).slice(0, 20);
            if (matched.length) {
                show(matched, fromObj, null);
                if (invalidateDescribe) {
                    appendRefreshRow(`Refresh ${fromObj} fields`, () => {
                        _cache.delete(`${org}::${fromObj}`);
                        invalidateDescribe(org, fromObj);
                        onInput();
                    });
                }
            } else {
                hide();
            }
        }
    }

    // ── Keyboard navigation ───────────────────────────

    function onKeydown(e) {
        const items = dropdown.querySelectorAll('.soql-ac-item');
        if (!items.length) return; // no suggestions → normal keyboard behaviour

        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                setActive(activeIdx <= 0 ? items.length - 1 : activeIdx - 1);
            } else {
                setActive(activeIdx >= items.length - 1 ? 0 : activeIdx + 1);
            }
        } else if (e.key === ' ' && _applyCheckboxes) {
            if (activeIdx >= 0) {
                e.preventDefault();
                const cb = items[activeIdx].querySelector('.soql-ac-checkbox');
                if (cb) cb.checked = !cb.checked;
            }
        } else if (e.key === 'Enter' && _applyCheckboxes) {
            e.preventDefault();
            _applyCheckboxes();
        } else if (e.key === 'Enter') {
            if (activeIdx >= 0) {
                e.preventDefault();
                const name = items[activeIdx].querySelector('.soql-ac-name')?.textContent;
                const type = items[activeIdx].dataset.type;
                if (name) {
                    if (_picklistCtx) insertPicklistValue(name, _picklistCtx);
                    else insertCompletion(name, _activePrefix, type);
                }
            }
        } else if (e.key === 'Escape') {
            hide();
        }
        // ArrowUp/Down: not intercepted — textarea navigates normally
    }

    textarea.addEventListener('input',   onInput);
    textarea.addEventListener('keydown', onKeydown, true);
    textarea.addEventListener('blur',    () => setTimeout(hide, 150));

    return {
        hide,
        invalidate: () => { _cache.clear(); _objectCache.clear(); _callId = 0; }
    };
}
