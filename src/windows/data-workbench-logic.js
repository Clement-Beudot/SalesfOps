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
    function evalCondition(cond, row, columns) {
        const ci  = columns.indexOf(cond.col);
        const val = String(ci >= 0 ? (row[ci] ?? '') : '');
        const v   = cond.value || '';
        switch (cond.op) {
            case '=':          return val === v;
            case '≠':          return val !== v;
            case 'contains':   return val.toLowerCase().includes(v.toLowerCase());
            case 'starts_with':return val.toLowerCase().startsWith(v.toLowerCase());
            case 'empty':      return val === '';
            case 'not_empty':  return val !== '';
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
    function applyRowFilter(rows, columns, rowFilter) {
        if (!rowFilter || !rowFilter.conditions || rowFilter.conditions.length === 0) return rows;
        const { action = 'keep', conditions, logic } = rowFilter;
        return rows.filter(row => {
            const results = conditions.map(c => evalCondition(c, row, columns));
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
    function computeFromRecipe(recipe, tables) {

        if (recipe.op === 'transform') {
            const src = tables.find(t => t.id === recipe.sourceId);
            if (!src) return { columns: [], rows: [] };
            const filteredRows = applyRowFilter(src.rows, src.columns, recipe.rowFilter);
            const cols       = recipe.keptCols.filter(c => src.columns.includes(c));
            const resultCols = [...cols, ...recipe.computedCols.map(c => c.name)];
            const resultRows = filteredRows.map(row => {
                const kept = cols.map(c => {
                    const i = src.columns.indexOf(c);
                    return i >= 0 ? row[i] : '';
                });
                const computed = recipe.computedCols.map(col => {
                    // Replace mode: map specific values of a source column, keep original otherwise
                    if (col.replaceCol) {
                        const ci = src.columns.indexOf(col.replaceCol);
                        const sourceVal = String(ci >= 0 ? (row[ci] ?? '') : '');
                        const hit = (col.replacements || []).find(p => p.from === sourceVal);
                        return hit !== undefined ? hit.to : sourceVal;
                    }
                    // Conditional rules mode
                    for (const rule of (col.rules || [])) {
                        const results = (rule.conditions || []).map(c => evalCondition(c, row, src.columns));
                        if (evaluateLogicExpression(rule.logic, results)) return rule.then;
                    }
                    return col.defaultVal;
                });
                return [...kept, ...computed];
            });
            return { columns: resultCols, rows: resultRows };
        }

        if (recipe.op === 'stack') {
            const L = tables.find(t => t.id === recipe.leftId);
            const R = tables.find(t => t.id === recipe.rightId);
            if (!L || !R) return { columns: [], rows: [] };
            const allCols = [...new Set([...L.columns, ...R.columns])];
            const toRow   = (tbl, row) => allCols.map(col => {
                const i = tbl.columns.indexOf(col);
                return i >= 0 ? row[i] : '';
            });
            return {
                columns: allCols,
                rows: [...L.rows.map(r => toRow(L, r)), ...R.rows.map(r => toRow(R, r))]
            };
        }

        // enrich / missing / filter — all need a left/right join on key columns
        const L = tables.find(t => t.id === recipe.leftId);
        const R = tables.find(t => t.id === recipe.rightId);
        if (!L || !R) return { columns: [], rows: [] };

        const li  = L.columns.indexOf(recipe.leftCol);
        const ri  = R.columns.indexOf(recipe.rightCol);
        const idx = new Map();
        R.rows.forEach(row => {
            const k = row[ri];
            if (!idx.has(k)) idx.set(k, []);
            idx.get(k).push(row);
        });

        if (recipe.op === 'missing') {
            return { columns: [...L.columns], rows: L.rows.filter(r => !idx.has(r[li])) };
        }
        if (recipe.op === 'filter') {
            return { columns: [...L.columns], rows: L.rows.filter(r => idx.has(r[li])) };
        }

        // enrich (left join, expand on multiple matches)
        const selCols = recipe.selectedCols
            .map(s => ({ ...s, table: tables.find(t => t.id === s.tableId) }))
            .filter(s => s.table && s.table.columns.includes(s.col));
        const hasDups     = new Set(selCols.map(c => c.col)).size !== selCols.length;
        const resultColumns = selCols.map(c => hasDups ? `${c.table.ref}.${c.col}` : c.col);
        const resultRows  = [];
        L.rows.forEach(leftRow => {
            (idx.get(leftRow[li]) || [null]).forEach(rightRow => {
                resultRows.push(selCols.map(c => {
                    const ci = c.table.columns.indexOf(c.col);
                    return (c.tableId === recipe.leftId ? leftRow : rightRow)?.[ci] ?? '';
                }));
            });
        });
        return { columns: resultColumns, rows: resultRows };
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
        return soqlQuery.split(`:${tableRef}.${oldCol}`).join(`:${tableRef}.${newCol}`);
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
                (cc.rules || []).forEach(rule => {
                    (rule.conditions || []).forEach(cond => {
                        if (cond.col === oldCol) { cond.col = newCol; changed = true; }
                    });
                });
            });
        }

        return changed;
    }

    // ── Export ────────────────────────────────────────────────────────────────

    const api = { evalCondition, evaluateLogicExpression, applyRowFilter, computeFromRecipe, tableRef, renameSoqlRefs, renameColumnInSoql, renameColumnInRecipe };

    if (typeof module !== 'undefined' && module.exports) {
        // Node / Jest
        module.exports = api;
    } else {
        // Browser renderer (nodeIntegration: false)
        root.DWLogic = api;
    }

}(typeof globalThis !== 'undefined' ? globalThis : this));
