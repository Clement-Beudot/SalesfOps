'use strict';

const { reconcileSourceColumns, recipeReferencesId, computeColumnDiff, genColId } = require('../../src/windows/data-workbench/logic');

// ── reconcileSourceColumns ────────────────────────────────────────────────────

describe('reconcileSourceColumns', () => {
    function makeTable(defs) {
        return { columnDefs: defs, columns: defs.map(d => d.name) };
    }

    test('preserves IDs and display names when columns are unchanged', () => {
        const t = makeTable([
            { id: 'c1', name: 'Id',   origin: 'Id' },
            { id: 'c2', name: 'Name', origin: 'Name' },
        ]);
        const removed = reconcileSourceColumns(t, ['Id', 'Name']);
        expect(removed).toEqual([]);
        expect(t.columnDefs[0].id).toBe('c1');
        expect(t.columnDefs[1].id).toBe('c2');
    });

    test('matches by origin, preserving display name rename', () => {
        const t = makeTable([
            { id: 'c1', name: 'Salesforce_Id', origin: 'Id' },
            { id: 'c2', name: 'Full_Name',     origin: 'Name' },
        ]);
        reconcileSourceColumns(t, ['Id', 'Name']);
        expect(t.columnDefs[0]).toMatchObject({ id: 'c1', name: 'Salesforce_Id', origin: 'Id' });
        expect(t.columnDefs[1]).toMatchObject({ id: 'c2', name: 'Full_Name',     origin: 'Name' });
        expect(t.columns).toEqual(['Salesforce_Id', 'Full_Name']);
    });

    test('returns removed IDs when a column disappears', () => {
        const t = makeTable([
            { id: 'c1', name: 'Id',   origin: 'Id' },
            { id: 'c2', name: 'Name', origin: 'Name' },
            { id: 'c3', name: 'Type', origin: 'Type' },
        ]);
        const removed = reconcileSourceColumns(t, ['Id', 'Name']);
        expect(removed).toEqual(['c3']);
        expect(t.columnDefs).toHaveLength(2);
    });

    test('assigns a new ID for a brand-new column', () => {
        const t = makeTable([
            { id: 'c1', name: 'Id', origin: 'Id' },
        ]);
        reconcileSourceColumns(t, ['Id', 'Email']);
        expect(t.columnDefs).toHaveLength(2);
        expect(t.columnDefs[1].name).toBe('Email');
        expect(t.columnDefs[1].id).not.toBe('c1');
        expect(t.columnDefs[1].id).toBeTruthy();
    });

    test('handles a column reorder (IDs follow origin, not position)', () => {
        const t = makeTable([
            { id: 'c1', name: 'Id',   origin: 'Id' },
            { id: 'c2', name: 'Name', origin: 'Name' },
        ]);
        reconcileSourceColumns(t, ['Name', 'Id']);
        expect(t.columnDefs[0]).toMatchObject({ id: 'c2', origin: 'Name' });
        expect(t.columnDefs[1]).toMatchObject({ id: 'c1', origin: 'Id' });
    });

    test('complete column replacement returns all old IDs as removed', () => {
        const t = makeTable([
            { id: 'c1', name: 'A', origin: 'A' },
            { id: 'c2', name: 'B', origin: 'B' },
        ]);
        const removed = reconcileSourceColumns(t, ['X', 'Y']);
        expect(removed).toEqual(expect.arrayContaining(['c1', 'c2']));
        expect(removed).toHaveLength(2);
    });

    test('falls back to name match when origin is missing', () => {
        const t = makeTable([
            { id: 'c1', name: 'Id' }, // no origin field
        ]);
        reconcileSourceColumns(t, ['Id']);
        expect(t.columnDefs[0].id).toBe('c1');
        expect(t.columnDefs[0].origin).toBe('Id');
    });
});

// ── recipeReferencesId ────────────────────────────────────────────────────────

describe('recipeReferencesId', () => {
    const ids = new Set(['col-x', 'col-y']);

    describe('transform', () => {
        test('detects a removed ID in keptCols', () => {
            const r = { op: 'transform', sourceId: 't1', keptCols: ['col-a', 'col-x'], computedCols: [] };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('no match when keptCols only has unrelated IDs', () => {
            const r = { op: 'transform', sourceId: 't1', keptCols: ['col-a', 'col-b'], computedCols: [] };
            expect(recipeReferencesId(r, ids)).toBe(false);
        });

        test('detects a removed ID in rowFilter conditions', () => {
            const r = {
                op: 'transform', sourceId: 't1', keptCols: [],
                rowFilter: { conditions: [{ col: 'col-y', op: '=', value: 'X' }], logic: '1' },
                computedCols: []
            };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('detects a removed ID in replaceCol', () => {
            const r = {
                op: 'transform', sourceId: 't1', keptCols: [],
                computedCols: [{ name: 'Out', replaceCol: 'col-x', replacements: [] }]
            };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('detects a removed ID in a formula {{token}}', () => {
            const r = {
                op: 'transform', sourceId: 't1', keptCols: [],
                computedCols: [{ name: 'Out', formula: 'UPPER({{col-x}})' }]
            };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('no match for formula with unrelated token', () => {
            const r = {
                op: 'transform', sourceId: 't1', keptCols: [],
                computedCols: [{ name: 'Out', formula: 'UPPER({{col-z}})' }]
            };
            expect(recipeReferencesId(r, ids)).toBe(false);
        });

        test('detects a removed ID in a computed column rule condition', () => {
            const r = {
                op: 'transform', sourceId: 't1', keptCols: [],
                computedCols: [{
                    name: 'Cat',
                    rules: [{ conditions: [{ col: 'col-y', op: '>', value: '0' }], logic: '1', then: 'High' }],
                    defaultVal: 'Low'
                }]
            };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });
    });

    describe('stack', () => {
        test('detects a removed leftColId', () => {
            const r = { op: 'stack', leftId: 'tL', rightId: 'tR', columnMapping: [{ leftColId: 'col-x', rightColId: 'col-a', outputColId: 'out-1' }] };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('detects a removed rightColId', () => {
            const r = { op: 'stack', leftId: 'tL', rightId: 'tR', columnMapping: [{ leftColId: 'col-a', rightColId: 'col-y', outputColId: 'out-1' }] };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('no match when columnMapping has unrelated IDs', () => {
            const r = { op: 'stack', leftId: 'tL', rightId: 'tR', columnMapping: [{ leftColId: 'col-a', rightColId: 'col-b', outputColId: 'out-1' }] };
            expect(recipeReferencesId(r, ids)).toBe(false);
        });
    });

    describe('enrich / missing / filter', () => {
        test('detects a removed ID in leftCol', () => {
            const r = { op: 'enrich', leftId: 'tL', leftCol: 'col-x', rightId: 'tR', rightCol: 'col-a', selectedCols: [] };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('detects a removed ID in rightCol', () => {
            const r = { op: 'missing', leftId: 'tL', leftCol: 'col-a', rightId: 'tR', rightCol: 'col-y' };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('detects a removed ID in selectedCols', () => {
            const r = {
                op: 'enrich', leftId: 'tL', leftCol: 'col-a', rightId: 'tR', rightCol: 'col-b',
                selectedCols: [{ colId: 'col-ok' }, { colId: 'col-x' }]
            };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('no match when no referenced IDs are removed', () => {
            const r = {
                op: 'enrich', leftId: 'tL', leftCol: 'col-a', rightId: 'tR', rightCol: 'col-b',
                selectedCols: [{ colId: 'col-ok' }]
            };
            expect(recipeReferencesId(r, ids)).toBe(false);
        });
    });

    describe('split', () => {
        test('detects a removed ID in condition.col', () => {
            const r = { op: 'split', sourceId: 't1', condition: { col: 'col-x', op: '=', value: 'Active' } };
            expect(recipeReferencesId(r, ids)).toBe(true);
        });

        test('no match when condition.col is not removed', () => {
            const r = { op: 'split', sourceId: 't1', condition: { col: 'col-ok', op: '=', value: 'Active' } };
            expect(recipeReferencesId(r, ids)).toBe(false);
        });

        test('no condition → returns false', () => {
            const r = { op: 'split', sourceId: 't1' };
            expect(recipeReferencesId(r, ids)).toBe(false);
        });

        test('default (isDefault) branch → always returns false (no explicit column ref)', () => {
            const r = { op: 'split', sourceId: 't1', splitGroupId: 'g1', isDefault: true };
            expect(recipeReferencesId(r, ids)).toBe(false);
        });
    });

    test('returns false for null recipe', () => {
        expect(recipeReferencesId(null, ids)).toBe(false);
    });

    test('returns false for empty idSet', () => {
        const r = { op: 'transform', sourceId: 't1', keptCols: ['col-x'], computedCols: [] };
        expect(recipeReferencesId(r, new Set())).toBe(false);
    });
});

// ── computeColumnDiff ─────────────────────────────────────────────────────────

describe('computeColumnDiff', () => {
    function makeTable(defs) {
        return { columnDefs: defs, columns: defs.map(d => d.name) };
    }

    test('all columns match → removed and added empty', () => {
        const t = makeTable([
            { id: 'c1', name: 'Id',   origin: 'Id' },
            { id: 'c2', name: 'Name', origin: 'Name' },
        ]);
        const diff = computeColumnDiff(t, ['Id', 'Name']);
        expect(diff.matched).toHaveLength(2);
        expect(diff.removed).toHaveLength(0);
        expect(diff.added).toHaveLength(0);
    });

    test('column removed from source → appears in removed only', () => {
        const t = makeTable([
            { id: 'c1', name: 'Id',   origin: 'Id' },
            { id: 'c2', name: 'Name', origin: 'Name' },
            { id: 'c3', name: 'Type', origin: 'Type' },
        ]);
        const diff = computeColumnDiff(t, ['Id', 'Name']);
        expect(diff.matched.map(d => d.id)).toEqual(['c1', 'c2']);
        expect(diff.removed.map(d => d.id)).toEqual(['c3']);
        expect(diff.added).toEqual([]);
    });

    test('new column in source → appears in added only', () => {
        const t = makeTable([{ id: 'c1', name: 'Id', origin: 'Id' }]);
        const diff = computeColumnDiff(t, ['Id', 'Email']);
        expect(diff.matched.map(d => d.id)).toEqual(['c1']);
        expect(diff.removed).toHaveLength(0);
        expect(diff.added).toEqual(['Email']);
    });

    test('source column renamed → removed (old origin) + added (new name)', () => {
        const t = makeTable([
            { id: 'c1', name: 'Nom', origin: 'Name' },
            { id: 'c2', name: 'Id',  origin: 'Id' },
        ]);
        const diff = computeColumnDiff(t, ['Id', 'FullName']);
        expect(diff.matched.map(d => d.id)).toEqual(['c2']);
        expect(diff.removed.map(d => d.id)).toEqual(['c1']);
        expect(diff.added).toEqual(['FullName']);
    });

    test('display-name rename (origin unchanged) is transparent to diff', () => {
        const t = makeTable([{ id: 'c1', name: 'FullName', origin: 'Name' }]);
        const diff = computeColumnDiff(t, ['Name']);
        expect(diff.matched.map(d => d.id)).toEqual(['c1']);
        expect(diff.removed).toHaveLength(0);
        expect(diff.added).toHaveLength(0);
    });

    test('complete replacement → all old removed, all new added', () => {
        const t = makeTable([
            { id: 'c1', name: 'A', origin: 'A' },
            { id: 'c2', name: 'B', origin: 'B' },
        ]);
        const diff = computeColumnDiff(t, ['X', 'Y', 'Z']);
        expect(diff.matched).toHaveLength(0);
        expect(diff.removed.map(d => d.id)).toEqual(expect.arrayContaining(['c1', 'c2']));
        expect(diff.added).toEqual(expect.arrayContaining(['X', 'Y', 'Z']));
    });

    test('null columnDefs → matched and removed empty, all new in added', () => {
        const diff = computeColumnDiff({ columnDefs: null, columns: [] }, ['Id', 'Name']);
        expect(diff.matched).toHaveLength(0);
        expect(diff.removed).toHaveLength(0);
        expect(diff.added).toEqual(['Id', 'Name']);
    });
});
