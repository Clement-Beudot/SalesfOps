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
