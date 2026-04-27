'use strict';

const { evalCondition, evaluateLogicExpression, applyRowFilter } =
    require('../../src/windows/data-workbench/logic');

// ─────────────────────────────────────────────────────────────────────────────
// evaluateLogicExpression
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateLogicExpression', () => {

    describe('empty / trivial expressions', () => {
        test('empty string → AND all (all true → true)', () => {
            expect(evaluateLogicExpression('', [true, true])).toBe(true);
        });
        test('empty string → AND all (one false → false)', () => {
            expect(evaluateLogicExpression('', [true, false])).toBe(false);
        });
        test('null expr → AND all', () => {
            expect(evaluateLogicExpression(null, [true, true])).toBe(true);
        });
        test('single condition true', () => {
            expect(evaluateLogicExpression('1', [true])).toBe(true);
        });
        test('single condition false', () => {
            expect(evaluateLogicExpression('1', [false])).toBe(false);
        });
        test('out-of-range index → false', () => {
            expect(evaluateLogicExpression('5', [true, true])).toBe(false);
        });
        test('no results array → false', () => {
            expect(evaluateLogicExpression('1', [])).toBe(false);
        });
    });

    describe('AND', () => {
        test('true AND true → true', () => {
            expect(evaluateLogicExpression('1 AND 2', [true, true])).toBe(true);
        });
        test('true AND false → false', () => {
            expect(evaluateLogicExpression('1 AND 2', [true, false])).toBe(false);
        });
        test('false AND true → false', () => {
            expect(evaluateLogicExpression('1 AND 2', [false, true])).toBe(false);
        });
        test('false AND false → false', () => {
            expect(evaluateLogicExpression('1 AND 2', [false, false])).toBe(false);
        });
        test('chained: 1 AND 2 AND 3', () => {
            expect(evaluateLogicExpression('1 AND 2 AND 3', [true, true, true])).toBe(true);
            expect(evaluateLogicExpression('1 AND 2 AND 3', [true, true, false])).toBe(false);
        });
    });

    describe('OR', () => {
        test('true OR false → true', () => {
            expect(evaluateLogicExpression('1 OR 2', [true, false])).toBe(true);
        });
        test('false OR true → true', () => {
            expect(evaluateLogicExpression('1 OR 2', [false, true])).toBe(true);
        });
        test('false OR false → false', () => {
            expect(evaluateLogicExpression('1 OR 2', [false, false])).toBe(false);
        });
        test('true OR true → true', () => {
            expect(evaluateLogicExpression('1 OR 2', [true, true])).toBe(true);
        });
        test('chained: 1 OR 2 OR 3', () => {
            expect(evaluateLogicExpression('1 OR 2 OR 3', [false, false, true])).toBe(true);
            expect(evaluateLogicExpression('1 OR 2 OR 3', [false, false, false])).toBe(false);
        });
    });

    describe('parentheses', () => {
        test('1 AND (2 OR 3) — first matches, one branch of OR matches', () => {
            expect(evaluateLogicExpression('1 AND (2 OR 3)', [true, false, true])).toBe(true);
        });
        test('1 AND (2 OR 3) — first matches, no OR branch matches', () => {
            expect(evaluateLogicExpression('1 AND (2 OR 3)', [true, false, false])).toBe(false);
        });
        test('1 AND (2 OR 3) — first does not match', () => {
            expect(evaluateLogicExpression('1 AND (2 OR 3)', [false, true, true])).toBe(false);
        });
        test('(1 OR 2) AND 3', () => {
            expect(evaluateLogicExpression('(1 OR 2) AND 3', [false, true, true])).toBe(true);
            expect(evaluateLogicExpression('(1 OR 2) AND 3', [false, false, true])).toBe(false);
            expect(evaluateLogicExpression('(1 OR 2) AND 3', [true, false, false])).toBe(false);
        });
        test('nested: (1 AND (2 OR 3))', () => {
            expect(evaluateLogicExpression('(1 AND (2 OR 3))', [true, true, false])).toBe(true);
            expect(evaluateLogicExpression('(1 AND (2 OR 3))', [true, false, false])).toBe(false);
        });
    });

    describe('case insensitivity', () => {
        test('lowercase "and"', () => {
            expect(evaluateLogicExpression('1 and 2', [true, true])).toBe(true);
            expect(evaluateLogicExpression('1 and 2', [true, false])).toBe(false);
        });
        test('lowercase "or"', () => {
            expect(evaluateLogicExpression('1 or 2', [false, true])).toBe(true);
        });
        test('mixed case', () => {
            expect(evaluateLogicExpression('1 And (2 Or 3)', [true, false, true])).toBe(true);
        });
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// evalCondition
// ─────────────────────────────────────────────────────────────────────────────

describe('evalCondition', () => {
    const columns = ['Id', 'Stage', 'Name', 'Amount'];
    const row     = ['001', 'Open', 'Test Account', '100'];
    const emptyRow = ['', '', '', ''];

    test('= match', () => {
        expect(evalCondition({ col: 'Stage', op: '=', value: 'Open' }, row, columns)).toBe(true);
    });
    test('= no match', () => {
        expect(evalCondition({ col: 'Stage', op: '=', value: 'Closed' }, row, columns)).toBe(false);
    });

    test('≠ match', () => {
        expect(evalCondition({ col: 'Stage', op: '≠', value: 'Closed' }, row, columns)).toBe(true);
    });
    test('≠ no match', () => {
        expect(evalCondition({ col: 'Stage', op: '≠', value: 'Open' }, row, columns)).toBe(false);
    });

    test('contains match (case-insensitive)', () => {
        expect(evalCondition({ col: 'Name', op: 'contains', value: 'account' }, row, columns)).toBe(true);
    });
    test('contains no match', () => {
        expect(evalCondition({ col: 'Name', op: 'contains', value: 'xyz' }, row, columns)).toBe(false);
    });

    test('starts_with match (case-insensitive)', () => {
        expect(evalCondition({ col: 'Name', op: 'starts_with', value: 'test' }, row, columns)).toBe(true);
    });
    test('starts_with no match', () => {
        expect(evalCondition({ col: 'Name', op: 'starts_with', value: 'Account' }, row, columns)).toBe(false);
    });

    test('empty — value is empty string', () => {
        expect(evalCondition({ col: 'Id', op: 'empty', value: '' }, emptyRow, columns)).toBe(true);
    });
    test('empty — value is not empty', () => {
        expect(evalCondition({ col: 'Id', op: 'empty', value: '' }, row, columns)).toBe(false);
    });

    test('not_empty — value present', () => {
        expect(evalCondition({ col: 'Id', op: 'not_empty', value: '' }, row, columns)).toBe(true);
    });
    test('not_empty — value absent', () => {
        expect(evalCondition({ col: 'Id', op: 'not_empty', value: '' }, emptyRow, columns)).toBe(false);
    });

    test('unknown column → treated as empty string', () => {
        expect(evalCondition({ col: 'Unknown', op: 'empty', value: '' }, row, columns)).toBe(true);
        expect(evalCondition({ col: 'Unknown', op: '=', value: '' }, row, columns)).toBe(true);
    });

    test('null/undefined cell → treated as empty string', () => {
        const nullRow = [null, undefined, 'x', '5'];
        expect(evalCondition({ col: 'Id',    op: 'empty', value: '' }, nullRow, columns)).toBe(true);
        expect(evalCondition({ col: 'Stage', op: 'empty', value: '' }, nullRow, columns)).toBe(true);
    });

    describe('numeric comparison operators', () => {
        test('> true', ()  => expect(evalCondition({ col: 'Amount', op: '>',  value: '50'  }, row, columns)).toBe(true));
        test('> false', () => expect(evalCondition({ col: 'Amount', op: '>',  value: '200' }, row, columns)).toBe(false));
        test('> equal → false', () => expect(evalCondition({ col: 'Amount', op: '>',  value: '100' }, row, columns)).toBe(false));

        test('< true', ()  => expect(evalCondition({ col: 'Amount', op: '<',  value: '200' }, row, columns)).toBe(true));
        test('< false', () => expect(evalCondition({ col: 'Amount', op: '<',  value: '50'  }, row, columns)).toBe(false));
        test('< equal → false', () => expect(evalCondition({ col: 'Amount', op: '<',  value: '100' }, row, columns)).toBe(false));

        test('>= equal → true',  () => expect(evalCondition({ col: 'Amount', op: '>=', value: '100' }, row, columns)).toBe(true));
        test('>= greater → true', () => expect(evalCondition({ col: 'Amount', op: '>=', value: '50'  }, row, columns)).toBe(true));
        test('>= less → false',   () => expect(evalCondition({ col: 'Amount', op: '>=', value: '200' }, row, columns)).toBe(false));

        test('<= equal → true',  () => expect(evalCondition({ col: 'Amount', op: '<=', value: '100' }, row, columns)).toBe(true));
        test('<= less → true',   () => expect(evalCondition({ col: 'Amount', op: '<=', value: '200' }, row, columns)).toBe(true));
        test('<= greater → false', () => expect(evalCondition({ col: 'Amount', op: '<=', value: '50'  }, row, columns)).toBe(false));

        test('non-numeric cell with numeric op → false', () => {
            expect(evalCondition({ col: 'Name', op: '>', value: '10' }, row, columns)).toBe(false);
        });
        test('non-numeric value with numeric op → false', () => {
            expect(evalCondition({ col: 'Amount', op: '>', value: 'abc' }, row, columns)).toBe(false);
        });
        test('both non-numeric → false', () => {
            expect(evalCondition({ col: 'Name', op: '<', value: 'abc' }, row, columns)).toBe(false);
        });
    });

    test('unknown operator → treated as match (default: true)', () => {
        expect(evalCondition({ col: 'Stage', op: 'BOGUS', value: 'anything' }, row, columns)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyRowFilter
// ─────────────────────────────────────────────────────────────────────────────

describe('applyRowFilter', () => {
    const columns = ['Id', 'Stage', 'Amount'];
    const rows = [
        ['001', 'Open',   '100'],
        ['002', 'Closed', '200'],
        ['003', 'Open',   '300'],
        ['004', '',       '50' ],
    ];

    const ids = r => r.map(row => row[0]);

    test('null filter → all rows returned unchanged', () => {
        expect(applyRowFilter(rows, columns, null)).toBe(rows);
    });
    test('empty conditions array → all rows returned unchanged', () => {
        expect(applyRowFilter(rows, columns, { action: 'keep', conditions: [], logic: '' })).toBe(rows);
    });

    describe('keep', () => {
        test('single condition', () => {
            const result = applyRowFilter(rows, columns, {
                action: 'keep',
                conditions: [{ col: 'Stage', op: '=', value: 'Open' }],
                logic: ''
            });
            expect(ids(result)).toEqual(['001', '003']);
        });

        test('two conditions AND (default empty logic)', () => {
            const result = applyRowFilter(rows, columns, {
                action: 'keep',
                conditions: [
                    { col: 'Stage',  op: '=', value: 'Open' },
                    { col: 'Amount', op: '=', value: '100'  },
                ],
                logic: ''    // empty → AND all
            });
            expect(ids(result)).toEqual(['001']);
        });

        test('two conditions with explicit AND', () => {
            const result = applyRowFilter(rows, columns, {
                action: 'keep',
                conditions: [
                    { col: 'Stage',  op: '=', value: 'Open' },
                    { col: 'Amount', op: '=', value: '100'  },
                ],
                logic: '1 AND 2'
            });
            expect(ids(result)).toEqual(['001']);
        });

        test('two conditions OR', () => {
            // Keep rows where Stage=Open OR Amount=200
            const result = applyRowFilter(rows, columns, {
                action: 'keep',
                conditions: [
                    { col: 'Stage',  op: '=', value: 'Open' },
                    { col: 'Amount', op: '=', value: '200'  },
                ],
                logic: '1 OR 2'
            });
            // 001 (Open), 002 (200), 003 (Open)
            expect(ids(result)).toEqual(['001', '002', '003']);
        });

        test('complex: 1 AND (2 OR 3)', () => {
            // 1: Stage not_empty, 2: Stage=Open, 3: Amount=200
            const result = applyRowFilter(rows, columns, {
                action: 'keep',
                conditions: [
                    { col: 'Stage',  op: 'not_empty', value: '' },
                    { col: 'Stage',  op: '=',         value: 'Open' },
                    { col: 'Amount', op: '=',          value: '200'  },
                ],
                logic: '1 AND (2 OR 3)'
            });
            // 001: true AND (true  OR false) = true
            // 002: true AND (false OR true)  = true
            // 003: true AND (true  OR false) = true
            // 004: false AND ...             = false  (Stage is empty)
            expect(ids(result)).toEqual(['001', '002', '003']);
        });

        test('empty field filter', () => {
            const result = applyRowFilter(rows, columns, {
                action: 'keep',
                conditions: [{ col: 'Stage', op: 'empty', value: '' }],
                logic: ''
            });
            expect(ids(result)).toEqual(['004']);
        });
    });

    describe('remove', () => {
        test('single condition', () => {
            const result = applyRowFilter(rows, columns, {
                action: 'remove',
                conditions: [{ col: 'Stage', op: '=', value: 'Open' }],
                logic: ''
            });
            expect(ids(result)).toEqual(['002', '004']);
        });

        test('remove with OR — removes rows matching either condition', () => {
            // Remove rows where Stage=Open OR Amount=200
            const result = applyRowFilter(rows, columns, {
                action: 'remove',
                conditions: [
                    { col: 'Stage',  op: '=', value: 'Open' },
                    { col: 'Amount', op: '=', value: '200'  },
                ],
                logic: '1 OR 2'
            });
            // Removed: 001 (Open), 002 (200), 003 (Open) — only 004 survives
            expect(ids(result)).toEqual(['004']);
        });
    });

    describe('edge cases', () => {
        test('all rows filtered out', () => {
            const result = applyRowFilter(rows, columns, {
                action: 'keep',
                conditions: [{ col: 'Stage', op: '=', value: 'Pending' }],
                logic: ''
            });
            expect(result).toHaveLength(0);
        });

        test('no rows filtered out', () => {
            const result = applyRowFilter(rows, columns, {
                action: 'keep',
                conditions: [{ col: 'Id', op: 'not_empty', value: '' }],
                logic: ''
            });
            expect(result).toHaveLength(rows.length);
        });
    });
});
