/**
 * Pure logic functions for the Data Workbench.
 * No DOM or Electron dependencies — safe to require in Node/Jest.
 *
 * UMD wrapper: in a browser renderer (nodeIntegration: false) the functions
 * are exposed on window.DWLogic; in Node / Jest they are module.exports.
 */
(function (root) {

    /**
     * Evaluate a single filter condition against one row.
     * @param {{ col: string, op: string, value: string }} cond
     * @param {string[]} row
     * @param {string[]} columns
     * @returns {boolean}
     */
    function evalCondition(cond, row, columns, columnDefs) {
        const colName = columnDefs ? (columnDefs.find(d => d.id === cond.col)?.name ?? cond.col) : cond.col;
        const ci  = columns.indexOf(colName);
        const val = String(ci >= 0 ? (row[ci] ?? '') : '');
        const v   = cond.value || '';
        switch (cond.op) {
            case '=':          return val === v;
            case '≠':          return val !== v;
            case 'contains':   return val.toLowerCase().includes(v.toLowerCase());
            case 'starts_with':return val.toLowerCase().startsWith(v.toLowerCase());
            case 'empty':      return val === '';
            case 'not_empty':  return val !== '';
            case '>':  case '<':  case '>=':  case '<=': {
                const n = parseFloat(val), m = parseFloat(v);
                if (isNaN(n) || isNaN(m)) return false;
                if (cond.op === '>')  return n > m;
                if (cond.op === '<')  return n < m;
                if (cond.op === '>=') return n >= m;
                return n <= m;
            }
            default:           return true;
        }
    }

    /**
     * Evaluate a logic expression like "1 AND (2 OR 3)" against an array of
     * boolean results for each condition.
     *
     * Uses a recursive descent parser — no eval / new Function, so it works
     * under strict Content-Security-Policy.
     *
     * Grammar (simplified, left-associative):
     *   expr  → or
     *   or    → and ('OR' and)*
     *   and   → atom ('AND' atom)*
     *   atom  → '(' expr ')' | NUMBER
     *
     * Tokens: AND, OR, (, ), integers (1-based condition indices).
     *
     * @param {string} expr
     * @param {boolean[]} results  — one boolean per condition, 1-indexed
     * @returns {boolean}
     */
    function evaluateLogicExpression(expr, results) {
        if (!results || results.length === 0) return false;
        if (!expr || !expr.trim()) return results.every(Boolean);

        const tokens = (expr.toUpperCase().match(/\bAND\b|\bOR\b|\(|\)|\d+/g)) || [];
        let pos = 0;

        function parseOr() {
            let val = parseAnd();
            while (pos < tokens.length && tokens[pos] === 'OR') {
                pos++;
                const right = parseAnd();
                val = val || right;
            }
            return val;
        }

        function parseAnd() {
            let val = parseAtom();
            while (pos < tokens.length && tokens[pos] === 'AND') {
                pos++;
                const right = parseAtom();
                val = val && right;
            }
            return val;
        }

        function parseAtom() {
            if (pos >= tokens.length) return false;
            if (tokens[pos] === '(') {
                pos++;                 // consume '('
                const val = parseOr();
                if (pos < tokens.length && tokens[pos] === ')') pos++;  // consume ')'
                return val;
            }
            const n = parseInt(tokens[pos], 10);
            pos++;
            if (!isNaN(n)) {
                const i = n - 1;
                return (i >= 0 && i < results.length) ? Boolean(results[i]) : false;
            }
            return false;
        }

        try {
            const result = parseOr();
            return result;
        } catch (_) {
            return results.every(Boolean);
        }
    }

    /**
     * Filter rows based on a rowFilter recipe object.
     * @param {string[][]} rows
     * @param {string[]} columns
     * @param {{ action: string, conditions: object[], logic: string }|null} rowFilter
     * @returns {string[][]}
     */
    function applyRowFilter(rows, columns, rowFilter, columnDefs) {
        if (!rowFilter || !rowFilter.conditions || rowFilter.conditions.length === 0) return rows;
        const { action = 'keep', conditions, logic } = rowFilter;
        return rows.filter(row => {
            const results = conditions.map(c => evalCondition(c, row, columns, columnDefs));
            const match   = evaluateLogicExpression(logic, results);
            return action === 'keep' ? match : !match;
        });
    }

    /**
     * Compute the result of a recipe against a tables array.
     * Pure — does not read any global state.
     *
     * @param {object} recipe
     * @param {Array<{ id, ref, name, columns: string[], rows: string[][] }>} tables
     * @returns {{ columns: string[], rows: string[][] }}
     */
    // Resolve a column reference (ID in v2, name in v1) to its index in a table.
    function colIdx(ref, columns, columnDefs) {
        if (columnDefs) {
            const def = columnDefs.find(d => d.id === ref);
            if (def) return columns.indexOf(def.name);
        }
        return columns.indexOf(ref);
    }

    function computeFromRecipe(recipe, tables) {
        const empty = { columnDefs: [], columns: [], rows: [] };

        if (recipe.op === 'transform') {
            const src = tables.find(t => t.id === recipe.sourceId);
            if (!src) return empty;
            const srcDefs = src.columnDefs || null;

            const filteredRows = applyRowFilter(src.rows, src.columns, recipe.rowFilter, srcDefs);

            // keptCols: v2 = IDs, v1 = names
            const cols = (recipe.keptCols || []).filter(ref =>
                srcDefs ? srcDefs.some(d => d.id === ref) : src.columns.includes(ref)
            );

            const keptDefs = cols.map(ref =>
                srcDefs ? { ...srcDefs.find(d => d.id === ref) }
                        : { id: ref, name: ref }
            );
            const computedDefs = (recipe.computedCols || []).map(c => ({ id: c.id || genColId(), name: c.name }));
            const resultColDefs = [...keptDefs, ...computedDefs];

            const resultRows = filteredRows.map(row => {
                const kept = cols.map(ref => {
                    const i = colIdx(ref, src.columns, srcDefs);
                    return i >= 0 ? row[i] : '';
                });
                const computed = (recipe.computedCols || []).map(col => {
                    if (col.replaceCol) {
                        const i = colIdx(col.replaceCol, src.columns, srcDefs);
                        const sourceVal = String(i >= 0 ? (row[i] ?? '') : '');
                        const hit = (col.replacements || []).find(p => p.from === sourceVal);
                        return hit !== undefined ? hit.to : sourceVal;
                    }
                    if (col.formula) return evaluateFormula(col.formula, row, src.columns, srcDefs);
                    for (const rule of (col.rules || [])) {
                        const results = (rule.conditions || []).map(c => evalCondition(c, row, src.columns, srcDefs));
                        if (evaluateLogicExpression(rule.logic, results)) return rule.then;
                    }
                    return col.defaultVal ?? '';
                });
                return [...kept, ...computed];
            });
            return { columnDefs: resultColDefs, columns: resultColDefs.map(d => d.name), rows: resultRows };
        }

        if (recipe.op === 'stack') {
            const L = tables.find(t => t.id === recipe.leftId);
            const R = tables.find(t => t.id === recipe.rightId);
            if (!L || !R) return empty;

            if (recipe.columnMapping) {
                // v2: explicit user-defined mapping
                const resultColDefs = recipe.columnMapping.map(m => {
                    const def = (m.leftColId  ? (L.columnDefs || []).find(d => d.id === m.leftColId)  : null)
                             || (m.rightColId ? (R.columnDefs || []).find(d => d.id === m.rightColId) : null);
                    return { id: m.outputColId, name: def?.name || m.outputColId };
                });
                const toRow = (tbl, row, side) => recipe.columnMapping.map(m => {
                    const colId = side === 'left' ? m.leftColId : m.rightColId;
                    if (!colId) return '';
                    const i = colIdx(colId, tbl.columns, tbl.columnDefs);
                    return i >= 0 ? row[i] : '';
                });
                return {
                    columnDefs: resultColDefs,
                    columns: resultColDefs.map(d => d.name),
                    rows: [...L.rows.map(r => toRow(L, r, 'left')), ...R.rows.map(r => toRow(R, r, 'right'))]
                };
            }

            // v1 fallback: name-based union
            const allCols = [...new Set([...L.columns, ...R.columns])];
            const toRow   = (tbl, row) => allCols.map(col => {
                const i = tbl.columns.indexOf(col);
                return i >= 0 ? row[i] : '';
            });
            const resultColDefs = allCols.map(name => ({ id: genColId(), name }));
            return {
                columnDefs: resultColDefs,
                columns: allCols,
                rows: [...L.rows.map(r => toRow(L, r)), ...R.rows.map(r => toRow(R, r))]
            };
        }

        if (recipe.op === 'split') {
            const src = tables.find(t => t.id === recipe.sourceId);
            if (!src) return empty;
            const srcDefs = src.columnDefs || null;

            let filteredRows;
            if (recipe.isDefault) {
                // Catch-all: rows not matched by any non-default sibling in the same group
                const siblings = recipe.splitGroupId
                    ? tables.filter(t =>
                        t.source === 'result' &&
                        t.recipe?.op === 'split' &&
                        t.recipe?.splitGroupId === recipe.splitGroupId &&
                        !t.recipe?.isDefault
                      )
                    : [];
                filteredRows = src.rows.filter(row =>
                    !siblings.some(sib => {
                        const cond = sib.recipe.condition;
                        return cond && evalCondition(cond, row, src.columns, srcDefs);
                    })
                );
            } else {
                const cond = recipe.condition;
                filteredRows = cond
                    ? src.rows.filter(row => evalCondition(cond, row, src.columns, srcDefs))
                    : [...src.rows];
            }

            const resultColDefs = srcDefs ? srcDefs.map(d => ({ ...d })) : src.columns.map(n => ({ id: n, name: n }));
            return { columnDefs: resultColDefs, columns: [...src.columns], rows: filteredRows };
        }

        // enrich / missing / filter
        const L = tables.find(t => t.id === recipe.leftId);
        const R = tables.find(t => t.id === recipe.rightId);
        if (!L || !R) return empty;

        const lDefs = L.columnDefs || null;
        const rDefs = R.columnDefs || null;

        const li = colIdx(recipe.leftCol,  L.columns, lDefs);
        const ri = colIdx(recipe.rightCol, R.columns, rDefs);

        const idx = new Map();
        R.rows.forEach(row => {
            const k = row[ri];
            if (!idx.has(k)) idx.set(k, []);
            idx.get(k).push(row);
        });

        if (recipe.op === 'missing') {
            return { columnDefs: lDefs ? lDefs.map(d => ({ ...d })) : L.columns.map(n => ({ id: n, name: n })), columns: [...L.columns], rows: L.rows.filter(r => !idx.has(r[li])) };
        }
        if (recipe.op === 'filter') {
            return { columnDefs: lDefs ? lDefs.map(d => ({ ...d })) : L.columns.map(n => ({ id: n, name: n })), columns: [...L.columns], rows: L.rows.filter(r => idx.has(r[li])) };
        }

        // enrich (left join)
        const selCols = (recipe.selectedCols || []).map(s => {
            let table, colName, colId;
            if (s.colId) {
                // v2: find by ID in L or R
                table = [L, R].find(t => (t.columnDefs || []).some(d => d.id === s.colId));
                const def = table ? (table.columnDefs || []).find(d => d.id === s.colId) : null;
                colName = def?.name;
                colId   = s.colId;
            } else {
                // v1: find by tableId + name
                table   = tables.find(t => t.id === s.tableId);
                colName = s.col;
                colId   = (table?.columnDefs || []).find(d => d.name === s.col)?.id || null;
            }
            return { table, colName, colId };
        }).filter(s => s.table && s.colName && s.table.columns.includes(s.colName));

        const hasDups = new Set(selCols.map(c => c.colName)).size !== selCols.length;
        const resultColDefs = selCols.map(c => ({
            id:   c.colId || genColId(),
            name: hasDups ? `${c.table.ref}.${c.colName}` : c.colName
        }));
        const resultRows = [];
        L.rows.forEach(leftRow => {
            (idx.get(leftRow[li]) || [null]).forEach(rightRow => {
                resultRows.push(selCols.map(c => {
                    const ci = c.table.columns.indexOf(c.colName);
                    const isLeft = c.table.id === recipe.leftId;
                    return (isLeft ? leftRow : rightRow)?.[ci] ?? '';
                }));
            });
        });
        return { columnDefs: resultColDefs, columns: resultColDefs.map(d => d.name), rows: resultRows };
    }

    /**
     * Build the canonical reference string for a table.
     * Format: Source.CleanName  e.g. "SOQL.SF_Existing_Account"
     * The clean name has spaces replaced by underscores, non-word characters stripped.
     *
     * @param {'paste'|'soql'|'result'} source
     * @param {string} name  — user-visible name
     * @returns {string}
     */
    function tableRef(source, name) {
        const prefix = source === 'paste' ? 'Table' : source === 'soql' ? 'SOQL' : 'Result';
        const clean  = name.trim().replace(/\s+/g, '_').replace(/[^\w]/g, '') || 'Unnamed';
        return `${prefix}.${clean}`;
    }

    /**
     * Replace all occurrences of :oldRef. with :newRef. in a single SOQL query string.
     * The trailing dot is intentional — it prevents partial-name false positives
     * (e.g. renaming "Accts" won't corrupt ":AcctsAll.Field").
     *
     * @param {string|null|undefined} soqlQuery
     * @param {string} oldRef
     * @param {string} newRef
     * @returns {string|null|undefined}
     */
    function renameSoqlRefs(soqlQuery, oldRef, newRef) {
        if (!soqlQuery) return soqlQuery;
        return soqlQuery.split(`:${oldRef}.`).join(`:${newRef}.`);
    }

    /**
     * Replace a column reference in a SOQL query string.
     * Only replaces occurrences that belong to the given tableRef —
     * e.g. renaming "Id" in "SOQL.Accounts" replaces ":SOQL.Accounts.Id"
     * without touching ":SOQL.Contacts.Id".
     *
     * @param {string|null|undefined} soqlQuery
     * @param {string} tableRef   — e.g. "SOQL.Accounts"
     * @param {string} oldCol
     * @param {string} newCol
     * @returns {string|null|undefined}
     */
    function renameColumnInSoql(soqlQuery, tableRef, oldCol, newCol) {
        if (!soqlQuery) return soqlQuery;
        const isPlainOld = /^[A-Za-z_]\w*$/.test(oldCol);
        const oldTok = isPlainOld ? oldCol : `[${oldCol}]`;
        const newTok = /^[A-Za-z_]\w*$/.test(newCol) ? newCol : `[${newCol}]`;
        const literal = `:${tableRef}.${oldTok}`;
        if (!isPlainOld) {
            // Bracketed column: the closing ] is already a natural delimiter — exact match is safe.
            return soqlQuery.split(literal).join(`:${tableRef}.${newTok}`);
        }
        // Plain identifier: use (?!\w) so ":T.Name" does not match inside ":T.NameTest".
        const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return soqlQuery.replace(new RegExp(`${escaped}(?!\\w)`, 'g'), `:${tableRef}.${newTok}`);
    }

    /**
     * Update a recipe in-place when a column in a given source table is renamed.
     * Covers: leftCol / rightCol (join ops), selectedCols (enrich),
     *         keptCols / rowFilter conditions / computedCols conditions (transform).
     *
     * @param {object|null} recipe
     * @param {string} tableId   — id of the table whose column was renamed
     * @param {string} oldCol
     * @param {string} newCol
     * @returns {boolean}  true if at least one field was updated
     */
    function renameColumnInRecipe(recipe, tableId, oldCol, newCol) {
        if (!recipe) return false;
        let changed = false;

        // split: condition column (name-based v1 only; v2 uses IDs)
        if (recipe.op === 'split' && recipe.sourceId === tableId && recipe.condition?.col === oldCol) {
            recipe.condition = { ...recipe.condition, col: newCol }; changed = true;
        }

        // join key columns (enrich / missing / filter)
        if (recipe.leftId === tableId && recipe.leftCol === oldCol) {
            recipe.leftCol = newCol; changed = true;
        }
        if (recipe.rightId === tableId && recipe.rightCol === oldCol) {
            recipe.rightCol = newCol; changed = true;
        }

        // enrich: selected columns list
        (recipe.selectedCols || []).forEach(sc => {
            if (sc.tableId === tableId && sc.col === oldCol) { sc.col = newCol; changed = true; }
        });

        // transform: keptCols, rowFilter conditions, computedCols rule conditions
        if (recipe.sourceId === tableId) {
            if (recipe.keptCols) {
                recipe.keptCols = recipe.keptCols.map(c => {
                    if (c === oldCol) { changed = true; return newCol; }
                    return c;
                });
            }
            (recipe.rowFilter?.conditions || []).forEach(cond => {
                if (cond.col === oldCol) { cond.col = newCol; changed = true; }
            });
            (recipe.computedCols || []).forEach(cc => {
                if (cc.replaceCol === oldCol) { cc.replaceCol = newCol; changed = true; }
                (cc.rules || []).forEach(rule => {
                    (rule.conditions || []).forEach(cond => {
                        if (cond.col === oldCol) { cond.col = newCol; changed = true; }
                    });
                });
            });
        }

        return changed;
    }

    // ── Formula evaluator ─────────────────────────────────────────────────────

    /**
     * Evaluate a spreadsheet-like formula against one row.
     * Column names are resolved case-insensitively from the columns array.
     * Returns a string; returns '' on any error.
     *
     * @param {string} formula
     * @param {string[]} row
     * @param {string[]} columns
     * @returns {string}
     */
    function evaluateFormula(formula, row, columns, columnDefs) {
        if (!formula || !formula.trim()) return '';
        // Resolve {{colId}} tokens to current display names before tokenizing
        const src0 = columnDefs ? formula.replace(/\{\{([^}]+)\}\}/g, (_, id) => {
            const def = columnDefs.find(d => d.id === id);
            if (!def) return '';
            return /^[A-Za-z_]\w*$/.test(def.name) ? def.name : `[${def.name}]`;
        }) : formula;

        // ── Tokenizer ────────────────────────────────────────────────────────
        function tokenize(src) {
            const toks = [];
            let i = 0;
            while (i < src.length) {
                if (/\s/.test(src[i])) { i++; continue; }
                // String literals
                if (src[i] === '"' || src[i] === "'") {
                    const q = src[i++];
                    let s = '';
                    while (i < src.length && src[i] !== q) {
                        if (src[i] === '\\') { i++; s += src[i] !== undefined ? src[i] : ''; }
                        else s += src[i];
                        i++;
                    }
                    i++;
                    toks.push({ t: 'STR', v: s });
                    continue;
                }
                // Numbers
                if (/\d/.test(src[i]) || (src[i] === '.' && /\d/.test(src[i + 1] || ''))) {
                    let n = '';
                    while (i < src.length && /[\d.]/.test(src[i])) n += src[i++];
                    toks.push({ t: 'NUM', v: parseFloat(n) });
                    continue;
                }
                // Bracket-quoted identifiers: [Column Name With Spaces]
                if (src[i] === '[') {
                    i++;
                    let id = '';
                    while (i < src.length && src[i] !== ']') id += src[i++];
                    if (src[i] === ']') i++;
                    toks.push({ t: 'ID', v: id });
                    continue;
                }
                // Identifiers
                if (/[A-Za-z_]/.test(src[i])) {
                    let id = '';
                    while (i < src.length && /\w/.test(src[i])) id += src[i++];
                    toks.push({ t: 'ID', v: id });
                    continue;
                }
                // Two-char operators
                const two = src.slice(i, i + 2);
                if (['<>', '>=', '<='].includes(two)) { toks.push({ t: 'OP', v: two }); i += 2; continue; }
                // Single-char
                if ('+-*/&'.includes(src[i])) { toks.push({ t: 'OP', v: src[i++] }); continue; }
                if (src[i] === '=') { toks.push({ t: 'OP', v: '=' }); i++; continue; }
                if (src[i] === '>') { toks.push({ t: 'OP', v: '>' }); i++; continue; }
                if (src[i] === '<') { toks.push({ t: 'OP', v: '<' }); i++; continue; }
                if (src[i] === '(') { toks.push({ t: 'LP' }); i++; continue; }
                if (src[i] === ')') { toks.push({ t: 'RP' }); i++; continue; }
                if (src[i] === ',') { toks.push({ t: 'CM' }); i++; continue; }
                i++;
            }
            toks.push({ t: 'EOF' });
            return toks;
        }

        // ── Coercion helpers ─────────────────────────────────────────────────
        function toNum(v) {
            if (typeof v === 'number')  return v;
            if (typeof v === 'boolean') return v ? 1 : 0;
            const n = parseFloat(String(v));
            return isNaN(n) ? 0 : n;
        }
        function toStr(v) {
            if (v === null || v === undefined) return '';
            if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
            return String(v);
        }
        function truthy(v) {
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number')  return v !== 0;
            const s = String(v).toLowerCase();
            return s !== '' && s !== 'false' && s !== '0';
        }
        function int(v) { return Math.trunc(toNum(v)); }

        // ── Built-in functions ───────────────────────────────────────────────
        const FUNS = {
            // String
            LEFT:       a => toStr(a[0]).slice(0, Math.max(0, int(a[1]))),
            RIGHT:      a => { const s = toStr(a[0]), n = Math.max(0, int(a[1])); return n === 0 ? '' : s.slice(-n); },
            MID:        a => toStr(a[0]).slice(int(a[1]) - 1, int(a[1]) - 1 + int(a[2])),
            LEN:        a => toStr(a[0]).length,
            UPPER:      a => toStr(a[0]).toUpperCase(),
            LOWER:      a => toStr(a[0]).toLowerCase(),
            TRIM:       a => toStr(a[0]).trim(),
            PROPER:     a => toStr(a[0]).toLowerCase().replace(/(?:^|\s|-)\S/g, c => c.toUpperCase()),
            CONCAT:     a => a.map(toStr).join(''),
            REPT:       a => toStr(a[0]).repeat(Math.max(0, int(a[1]))),
            REPLACE:    a => toStr(a[0]).split(toStr(a[1])).join(toStr(a[2])),
            SUBSTITUTE: a => toStr(a[0]).split(toStr(a[1])).join(toStr(a[2])),
            FIND:       a => { const idx = toStr(a[1]).indexOf(toStr(a[0]), a[2] !== undefined ? int(a[2]) - 1 : 0); return idx < 0 ? 0 : idx + 1; },
            SEARCH:     a => { const idx = toStr(a[1]).toLowerCase().indexOf(toStr(a[0]).toLowerCase(), a[2] !== undefined ? int(a[2]) - 1 : 0); return idx < 0 ? 0 : idx + 1; },
            SPLIT:      a => { const parts = toStr(a[0]).split(toStr(a[1])); return parts[a[2] !== undefined ? int(a[2]) : 0] ?? ''; },
            PAD:        a => toStr(a[0]).padStart(int(a[1]), toStr(a[2] ?? ' ')),
            PADEND:     a => toStr(a[0]).padEnd(int(a[1]), toStr(a[2] ?? ' ')),
            CLEAN:      a => toStr(a[0]).replace(/[\x00-\x1F]/g, ''),
            // Math
            INT:        a => Math.trunc(toNum(a[0])),
            FLOAT:      a => toNum(a[0]),
            ROUND:      a => { const f = Math.pow(10, int(a[1] ?? 0)); return Math.round(toNum(a[0]) * f) / f; },
            ROUNDUP:    a => { const f = Math.pow(10, int(a[1] ?? 0)); return Math.ceil(toNum(a[0]) * f) / f; },
            ROUNDDOWN:  a => { const f = Math.pow(10, int(a[1] ?? 0)); return Math.floor(toNum(a[0]) * f) / f; },
            ABS:        a => Math.abs(toNum(a[0])),
            MOD:        a => toNum(a[0]) % toNum(a[1]),
            FLOOR:      a => Math.floor(toNum(a[0])),
            CEILING:    a => Math.ceil(toNum(a[0])),
            SQRT:       a => Math.sqrt(toNum(a[0])),
            POWER:      a => Math.pow(toNum(a[0]), toNum(a[1])),
            LOG:        a => Math.log(toNum(a[0])) / Math.log(toNum(a[1] ?? 10)),
            MAX:        a => Math.max(...a.map(toNum)),
            MIN:        a => Math.min(...a.map(toNum)),
            SUM:        a => a.reduce((s, v) => s + toNum(v), 0),
            // Logic & conditional
            IF:         a => truthy(a[0]) ? (a[1] ?? '') : (a[2] ?? ''),
            IFS:        a => { for (let i = 0; i < a.length - 1; i += 2) if (truthy(a[i])) return a[i + 1]; return a.length % 2 === 1 ? a[a.length - 1] : ''; },
            SWITCH:     a => { const val = toStr(a[0]); for (let i = 1; i < a.length - 1; i += 2) if (toStr(a[i]) === val) return a[i + 1]; return a.length % 2 === 0 ? a[a.length - 1] : ''; },
            ISBLANK:    a => a[0] === '' || a[0] == null,
            ISNUMBER:   a => !isNaN(parseFloat(toStr(a[0]))) && toStr(a[0]).trim() !== '',
            NOT:        a => !truthy(a[0]),
            AND:        a => a.every(truthy),
            OR:         a => a.some(truthy),
            COALESCE:   a => a.find(v => v !== '' && v != null) ?? '',
            // Conversion & formatting
            TEXT:       a => toStr(a[0]),
            VALUE:      a => { const n = parseFloat(toStr(a[0]).replace(/[^\d.-]/g, '')); return isNaN(n) ? '' : n; },
            FIXED:      a => toNum(a[0]).toFixed(Math.max(0, int(a[1] ?? 2))),
        };

        // ── Recursive-descent parser ─────────────────────────────────────────
        const tokens = tokenize(src0);
        let pos = 0;
        const peek    = () => tokens[pos];
        const consume = () => tokens[pos++];

        function parseExpr()    { return parseCompare(); }

        function parseCompare() {
            const left = parseConcat();
            const op = peek();
            if (op.t === 'OP' && ['=', '<>', '>', '<', '>=', '<='].includes(op.v)) {
                consume();
                const right = parseConcat();
                const ls = toStr(left), rs = toStr(right);
                const ln = toNum(left), rn = toNum(right);
                const numeric = !isNaN(parseFloat(ls)) && !isNaN(parseFloat(rs));
                switch (op.v) {
                    case '=':  return numeric ? ln === rn : ls === rs;
                    case '<>': return numeric ? ln !== rn : ls !== rs;
                    case '>':  return numeric ? ln > rn   : ls > rs;
                    case '<':  return numeric ? ln < rn   : ls < rs;
                    case '>=': return numeric ? ln >= rn  : ls >= rs;
                    case '<=': return numeric ? ln <= rn  : ls <= rs;
                }
            }
            return left;
        }

        function parseConcat() {
            let val = parseAdd();
            while (peek().t === 'OP' && peek().v === '&') { consume(); val = toStr(val) + toStr(parseAdd()); }
            return val;
        }

        function parseAdd() {
            let val = parseMul();
            while (peek().t === 'OP' && (peek().v === '+' || peek().v === '-')) {
                const op = consume().v;
                const r = parseMul();
                val = op === '+' ? toNum(val) + toNum(r) : toNum(val) - toNum(r);
            }
            return val;
        }

        function parseMul() {
            let val = parseUnary();
            while (peek().t === 'OP' && (peek().v === '*' || peek().v === '/')) {
                const op = consume().v;
                const r = parseUnary();
                val = op === '*' ? toNum(val) * toNum(r) : (toNum(r) === 0 ? '' : toNum(val) / toNum(r));
            }
            return val;
        }

        function parseUnary() {
            if (peek().t === 'OP' && peek().v === '-') { consume(); return -toNum(parseAtom()); }
            return parseAtom();
        }

        function parseAtom() {
            const tok = peek();
            if (tok.t === 'NUM') { consume(); return tok.v; }
            if (tok.t === 'STR') { consume(); return tok.v; }
            if (tok.t === 'LP')  {
                consume();
                const val = parseExpr();
                if (peek().t === 'RP') consume();
                return val;
            }
            if (tok.t === 'ID') {
                consume();
                const upper = tok.v.toUpperCase();
                if (peek().t === 'LP') {
                    consume(); // '('
                    const args = [];
                    if (peek().t !== 'RP') {
                        args.push(parseExpr());
                        while (peek().t === 'CM') { consume(); args.push(parseExpr()); }
                    }
                    if (peek().t === 'RP') consume();
                    if (FUNS[upper]) return FUNS[upper](args);
                    return ''; // unknown function → empty
                }
                // Column reference — exact match first, then case-insensitive
                let ci = columns.indexOf(tok.v);
                if (ci < 0) ci = columns.findIndex(c => c.toUpperCase() === upper);
                return ci >= 0 ? (row[ci] ?? '') : '';
            }
            if (tok.t !== 'EOF') consume();
            return '';
        }

        try {
            const result = parseExpr();
            if (typeof result === 'boolean') return result ? 'TRUE' : 'FALSE';
            if (typeof result === 'number')  return Number.isInteger(result) ? String(result) : String(parseFloat(result.toPrecision(10)));
            return toStr(result);
        } catch (_) {
            return '';
        }
    }

    // ── Column ID utilities ───────────────────────────────────────────────────

    function genColId() {
        return 'c_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
    }

    /**
     * Convert display-name column references in a formula to {{colId}} tokens.
     * Identifiers followed by '(' are treated as function calls and left untouched.
     * Longer names are processed first to avoid partial matches.
     */
    function formulaToIds(formula, columnDefs) {
        if (!formula || !columnDefs || columnDefs.length === 0) return formula;
        const sorted = [...columnDefs].sort((a, b) => b.name.length - a.name.length);
        let result = formula;
        for (const { id, name } of sorted) {
            if (/^[A-Za-z_]\w*$/.test(name)) {
                const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                result = result.replace(new RegExp(`\\b${esc}\\b(?!\\s*\\()`, 'g'), `{{${id}}}`);
            } else {
                result = result.split(`[${name}]`).join(`{{${id}}}`);
            }
        }
        return result;
    }

    /**
     * Reconcile a source table's columnDefs after a data refresh.
     * Matches incoming raw column names to existing defs by `origin`, preserving IDs.
     * Returns an array of IDs that were removed (broken downstream references).
     */
    function reconcileSourceColumns(tableEntry, newRawColumns) {
        const existing = tableEntry.columnDefs || [];
        const newDefs = newRawColumns.map(rawName => {
            const match = existing.find(c => c.origin === rawName)
                       || existing.find(c => !c.origin && c.name === rawName);
            return match ? { ...match, origin: rawName }
                         : { id: genColId(), name: rawName, origin: rawName };
        });
        const removedIds = existing.filter(c => !newDefs.some(d => d.id === c.id)).map(c => c.id);
        tableEntry.columnDefs = newDefs;
        tableEntry.columns    = newDefs.map(c => c.name);
        return removedIds;
    }

    /**
     * Migrate a saved model from schema v1 (name-based) to v2 (ID-based).
     * Idempotent — returns data unchanged if version !== 1.
     */
    function migrateModelV1toV2(data) {
        if (!data || data.version !== 1) return data;

        const colDefsByTableId = new Map();

        // ── Pass 1: source tables ──
        const tables = (data.tables || []).map(t => {
            if (t.source !== 'soql' && t.source !== 'paste') return { ...t };
            const renames = t.columnRenames || {};
            // Invert: displayName → originName
            const displayToOrigin = Object.fromEntries(Object.entries(renames).map(([o, d]) => [d, o]));
            const columnDefs = (t.columns || []).map(displayName => ({
                id:     genColId(),
                name:   displayName,
                origin: displayToOrigin[displayName] || displayName
            }));
            colDefsByTableId.set(t.id, columnDefs);
            const copy = { ...t, columnDefs };
            delete copy.columnRenames;
            return copy;
        });

        // ── Pass 2: result tables in dependency order (iterate until settled) ──
        const resultTables = tables.filter(t => t.source === 'result');
        let remaining = resultTables.length + 1;

        function findId(defs, name) {
            return defs?.find(d => d.name === name)?.id ?? name;
        }

        while (remaining-- > 0) {
            let progressed = false;
            for (const t of resultTables) {
                if (colDefsByTableId.has(t.id) || !t.recipe) continue;
                const r = t.recipe;
                const deps = [r.sourceId, r.leftId, r.rightId].filter(Boolean);
                if (!deps.every(id => colDefsByTableId.has(id))) continue; // wait for deps

                const recipe = { ...r };
                let outDefs = [];

                if (recipe.op === 'transform') {
                    const srcDefs = colDefsByTableId.get(recipe.sourceId) || [];
                    const fi = n => findId(srcDefs, n);
                    recipe.keptCols = (recipe.keptCols || []).map(fi);
                    if (recipe.rowFilter) {
                        recipe.rowFilter = { ...recipe.rowFilter, conditions: (recipe.rowFilter.conditions || []).map(c => ({ ...c, col: fi(c.col) })) };
                    }
                    recipe.computedCols = (recipe.computedCols || []).map(col => {
                        const c = { ...col, id: col.id || genColId() };
                        if (c.replaceCol) c.replaceCol = fi(c.replaceCol);
                        if (c.formula)   c.formula    = formulaToIds(c.formula, srcDefs);
                        if (c.rules)     c.rules      = c.rules.map(rule => ({ ...rule, conditions: (rule.conditions || []).map(cd => ({ ...cd, col: fi(cd.col) })) }));
                        return c;
                    });
                    const keptDefs     = recipe.keptCols.map(id => srcDefs.find(d => d.id === id) || { id, name: id });
                    const computedDefs = recipe.computedCols.map(c => ({ id: c.id, name: c.name }));
                    outDefs = [...keptDefs.map(d => ({ ...d })), ...computedDefs];

                } else if (recipe.op === 'enrich') {
                    const lDefs = colDefsByTableId.get(recipe.leftId)  || [];
                    const rDefs = colDefsByTableId.get(recipe.rightId) || [];
                    recipe.leftCol  = findId(lDefs, recipe.leftCol);
                    recipe.rightCol = findId(rDefs, recipe.rightCol);
                    recipe.selectedCols = (recipe.selectedCols || []).map(s => {
                        const tDefs = colDefsByTableId.get(s.tableId) || [];
                        const def   = tDefs.find(d => d.name === s.col);
                        return def ? { colId: def.id } : s;
                    });
                    outDefs = recipe.selectedCols.map(s => {
                        const allDefs = [...lDefs, ...rDefs];
                        const def = allDefs.find(d => d.id === (s.colId || ''));
                        return def ? { ...def } : { id: s.colId || genColId(), name: s.col || '' };
                    });

                } else if (recipe.op === 'missing' || recipe.op === 'filter') {
                    const lDefs = colDefsByTableId.get(recipe.leftId)  || [];
                    const rDefs = colDefsByTableId.get(recipe.rightId) || [];
                    recipe.leftCol  = findId(lDefs, recipe.leftCol);
                    recipe.rightCol = findId(rDefs, recipe.rightCol);
                    outDefs = lDefs.map(d => ({ ...d }));

                } else if (recipe.op === 'stack') {
                    const lDefs = colDefsByTableId.get(recipe.leftId)  || [];
                    const rDefs = colDefsByTableId.get(recipe.rightId) || [];
                    const allNames = [...new Set([...lDefs.map(d => d.name), ...rDefs.map(d => d.name)])];
                    recipe.columnMapping = allNames.map(name => {
                        const lDef = lDefs.find(d => d.name === name);
                        const rDef = rDefs.find(d => d.name === name);
                        return { leftColId: lDef?.id || null, rightColId: rDef?.id || null, outputColId: lDef?.id || rDef?.id || genColId() };
                    });
                    outDefs = recipe.columnMapping.map(m => {
                        const def = (m.leftColId ? lDefs.find(d => d.id === m.leftColId) : null) || (m.rightColId ? rDefs.find(d => d.id === m.rightColId) : null);
                        return { id: m.outputColId, name: def?.name || m.outputColId };
                    });
                }

                t.recipe    = recipe;
                t.columnDefs = outDefs;
                colDefsByTableId.set(t.id, outDefs);
                progressed = true;
            }
            if (!progressed) break;
        }

        return { ...data, version: 2, tables };
    }

    // ── Paste / TSV parsing ───────────────────────────────────────────────────

    function parseTsv(text) {
        if (!text || !text.trim()) return null;
        const lines = text.trim().split(/\r?\n/);
        const columns = lines[0].split('\t');
        if (columns.length === 0 || (columns.length === 1 && !columns[0].trim())) return null;
        const rows = lines.slice(1)
            .filter(l => l.trim().length > 0)
            .map(l => l.split('\t'));
        return { columns, rows };
    }

    function parseCsv(text) {
        if (!text || !text.trim()) return null;
        // Strip BOM
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        // Auto-detect delimiter from the first line
        const firstLine = text.split(/\r?\n/)[0];
        const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

        const rows = [];
        let row = [], field = '', inQuotes = false, i = 0;
        while (i < text.length) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
                if (ch === '"') { inQuotes = false; i++; continue; }
                field += ch; i++; continue;
            }
            if (ch === '"') { inQuotes = true; i++; continue; }
            if (ch === sep) { row.push(field); field = ''; i++; continue; }
            if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; continue; }
            if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
            field += ch; i++;
        }
        if (field || row.length > 0) { row.push(field); rows.push(row); }
        // Drop empty trailing rows
        while (rows.length > 0 && rows[rows.length - 1].every(f => f === '')) rows.pop();
        if (rows.length < 1) return null;
        const columns = rows[0];
        if (columns.length === 0 || (columns.length === 1 && !columns[0].trim())) return null;
        return { columns, rows: rows.slice(1).filter(r => r.some(f => f !== '')) };
    }

    /**
     * Compute which columns will be matched, removed, or added when new raw
     * columns are applied to a source tableEntry.
     *
     * Returns:
     *   matched — existing columnDefs whose origin appears in newRawColumns
     *   removed — existing columnDefs whose origin is NOT in newRawColumns
     *   added   — new raw names that have no matching existing origin
     */
    function computeColumnDiff(tableEntry, newRawColumns) {
        const defs = tableEntry.columnDefs || [];
        const newSet = new Set(newRawColumns);
        const matched = defs.filter(d => newSet.has(d.origin));
        const removed = defs.filter(d => !newSet.has(d.origin));
        const matchedOrigins = new Set(matched.map(d => d.origin));
        const added = newRawColumns.filter(r => !matchedOrigins.has(r)
            && !removed.some(d => d.origin === r)); // exclude origins already in removed
        return { matched, removed, added };
    }

    /**
     * Return true if a recipe directly references any ID in idSet.
     * Used to detect broken references when upstream column IDs are removed.
     */
    function recipeReferencesId(recipe, idSet) {
        if (!recipe || idSet.size === 0) return false;
        if (recipe.op === 'transform') {
            if ((recipe.keptCols || []).some(id => idSet.has(id))) return true;
            for (const cond of (recipe.rowFilter?.conditions || [])) if (idSet.has(cond.col)) return true;
            for (const col of (recipe.computedCols || [])) {
                if (idSet.has(col.replaceCol)) return true;
                if (col.formula && [...col.formula.matchAll(/\{\{([^}]+)\}\}/g)].some(m => idSet.has(m[1]))) return true;
                for (const rule of (col.rules || []))
                    for (const cond of (rule.conditions || []))
                        if (idSet.has(cond.col)) return true;
            }
            return false;
        }
        if (recipe.op === 'split') {
            if (recipe.isDefault) return false; // default branch references no explicit column
            return recipe.condition ? idSet.has(recipe.condition.col) : false;
        }
        if (recipe.op === 'stack') {
            return (recipe.columnMapping || []).some(m => idSet.has(m.leftColId) || idSet.has(m.rightColId));
        }
        // enrich / missing / filter
        if (idSet.has(recipe.leftCol) || idSet.has(recipe.rightCol)) return true;
        return (recipe.selectedCols || []).some(s => idSet.has(s.colId));
    }

    // ── Color rule evaluation ─────────────────────────────────────────────────

    function evalColorRule(tableEntry, rule) {
        if (rule.condition === 'has_records') return tableEntry.rows.length > 0;
        if (rule.condition === 'no_records')  return tableEntry.rows.length === 0;
        return false;
    }

    // ── Export ────────────────────────────────────────────────────────────────

    const api = { evalCondition, evaluateLogicExpression, applyRowFilter, computeFromRecipe, evaluateFormula, tableRef, renameSoqlRefs, renameColumnInSoql, renameColumnInRecipe, parseTsv, parseCsv, genColId, formulaToIds, reconcileSourceColumns, migrateModelV1toV2, recipeReferencesId, computeColumnDiff, evalColorRule };

    if (typeof module !== 'undefined' && module.exports) {
        // Node / Jest
        module.exports = api;
    } else {
        // Browser renderer (nodeIntegration: false)
        root.DWLogic = api;
    }

}(typeof globalThis !== 'undefined' ? globalThis : this));
