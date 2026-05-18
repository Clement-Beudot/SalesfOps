'use strict';

const { evalColorRule } = require('../../src/windows/data-workbench/logic');

// ── evalColorRule ─────────────────────────────────────────────────────────────

const withRows    = { rows: [['a'], ['b'], ['c']] };
const withOneRow  = { rows: [['x']] };
const empty       = { rows: [] };

describe('evalColorRule — has_records', () => {
    const rule = { condition: 'has_records' };

    test('returns true when table has rows', () => {
        expect(evalColorRule(withRows, rule)).toBe(true);
    });

    test('returns true when table has exactly one row', () => {
        expect(evalColorRule(withOneRow, rule)).toBe(true);
    });

    test('returns false when table is empty', () => {
        expect(evalColorRule(empty, rule)).toBe(false);
    });
});

describe('evalColorRule — no_records', () => {
    const rule = { condition: 'no_records' };

    test('returns true when table is empty', () => {
        expect(evalColorRule(empty, rule)).toBe(true);
    });

    test('returns false when table has rows', () => {
        expect(evalColorRule(withRows, rule)).toBe(false);
    });

    test('returns false when table has exactly one row', () => {
        expect(evalColorRule(withOneRow, rule)).toBe(false);
    });
});

describe('evalColorRule — unknown condition', () => {
    test('returns false for unrecognised condition', () => {
        expect(evalColorRule(withRows, { condition: 'something_else' })).toBe(false);
    });

    test('returns false for missing condition', () => {
        expect(evalColorRule(withRows, {})).toBe(false);
    });
});

// ── DML conditions ────────────────────────────────────────────────────────────

const srcWith3  = { id: 'src', rows: [['a'], ['b'], ['c']] };
const srcEmpty  = { id: 'src', rows: [] };
const dmlBase   = { source: 'dml', dmlConfig: { sourceTableId: 'src' } };

describe('evalColorRule — DML has_records / no_records', () => {
    test('has_records true when source table has rows', () => {
        expect(evalColorRule(dmlBase, { condition: 'has_records' }, [srcWith3])).toBe(true);
    });

    test('has_records false when source table is empty', () => {
        expect(evalColorRule(dmlBase, { condition: 'has_records' }, [srcEmpty])).toBe(false);
    });

    test('no_records true when source table is empty', () => {
        expect(evalColorRule(dmlBase, { condition: 'no_records' }, [srcEmpty])).toBe(true);
    });

    test('no_records false when source table has rows', () => {
        expect(evalColorRule(dmlBase, { condition: 'no_records' }, [srcWith3])).toBe(false);
    });

    test('has_records false when source table is missing from allTables', () => {
        expect(evalColorRule(dmlBase, { condition: 'has_records' }, [])).toBe(false);
    });
});

describe('evalColorRule — DML dml_not_run', () => {
    test('true when dmlResults is undefined', () => {
        expect(evalColorRule({ ...dmlBase }, { condition: 'dml_not_run' }, [srcWith3])).toBe(true);
    });

    test('false when dmlResults is set', () => {
        const entry = { ...dmlBase, dmlResults: [{ success: true }] };
        expect(evalColorRule(entry, { condition: 'dml_not_run' }, [srcWith3])).toBe(false);
    });
});

describe('evalColorRule — DML dml_done_ok', () => {
    test('true when all results succeeded', () => {
        const entry = { ...dmlBase, dmlResults: [{ success: true }, { success: true }] };
        expect(evalColorRule(entry, { condition: 'dml_done_ok' }, [srcWith3])).toBe(true);
    });

    test('false when any result failed', () => {
        const entry = { ...dmlBase, dmlResults: [{ success: true }, { success: false }] };
        expect(evalColorRule(entry, { condition: 'dml_done_ok' }, [srcWith3])).toBe(false);
    });

    test('false when dmlResults is not set', () => {
        expect(evalColorRule({ ...dmlBase }, { condition: 'dml_done_ok' }, [srcWith3])).toBe(false);
    });
});

describe('evalColorRule — DML dml_done_err', () => {
    test('true when at least one result failed', () => {
        const entry = { ...dmlBase, dmlResults: [{ success: true }, { success: false }] };
        expect(evalColorRule(entry, { condition: 'dml_done_err' }, [srcWith3])).toBe(true);
    });

    test('false when all results succeeded', () => {
        const entry = { ...dmlBase, dmlResults: [{ success: true }, { success: true }] };
        expect(evalColorRule(entry, { condition: 'dml_done_err' }, [srcWith3])).toBe(false);
    });

    test('false when dmlResults is not set', () => {
        expect(evalColorRule({ ...dmlBase }, { condition: 'dml_done_err' }, [srcWith3])).toBe(false);
    });
});

describe('evalColorRule — DML unknown condition', () => {
    test('returns false for unrecognised DML condition', () => {
        expect(evalColorRule(dmlBase, { condition: 'something_else' }, [srcWith3])).toBe(false);
    });
});
