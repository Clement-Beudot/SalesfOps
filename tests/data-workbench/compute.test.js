'use strict';

const { computeFromRecipe } = require('../../src/windows/data-workbench/logic');

// ─────────────────────────────────────────────────────────────────────────────
// Shared test tables
// ─────────────────────────────────────────────────────────────────────────────

const accounts = {
    id: 'tA', ref: 'accounts', name: 'Accounts',
    columns: ['Id', 'Name', 'Type', 'OwnerId'],
    rows: [
        ['001', 'Acme Corp',  'Customer', 'u1'],
        ['002', 'Beta Inc',   'Partner',  'u2'],
        ['003', 'Gamma LLC',  'Customer', 'u1'],
        ['004', 'Delta Co',   '',         'u3'],
    ]
};

const opps = {
    id: 'tO', ref: 'opps', name: 'Opportunities',
    columns: ['Id', 'AccountId', 'Stage', 'Amount'],
    rows: [
        ['o1', '001', 'Open',        '100'],
        ['o2', '001', 'Closed Won',  '200'],
        ['o3', '002', 'Open',        '300'],
        ['o4', '999', 'Open',        '50' ],  // AccountId 999 has no Account
    ]
};

const owners = {
    id: 'tU', ref: 'owners', name: 'Owners',
    columns: ['Id', 'Name'],
    rows: [
        ['u1', 'Alice'],
        ['u2', 'Bob'],
        // u3 deliberately missing
    ]
};

// Tables lookup array (mirrors the global `tables` in the app)
const tables = [accounts, opps, owners];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Return rows as plain objects keyed by first column for easier assertions
const byId = result => Object.fromEntries(result.rows.map(r => [r[0], r]));

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFORM
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFromRecipe — transform', () => {

    const baseRecipe = {
        op: 'transform',
        sourceId: 'tA',
        keptCols: ['Id', 'Name', 'Type'],
        computedCols: [],
        rowFilter: null
    };

    test('source not found → empty result', () => {
        const r = computeFromRecipe({ ...baseRecipe, sourceId: 'NOPE' }, tables);
        expect(r.columns).toEqual([]);
        expect(r.rows).toEqual([]);
    });

    test('keep specific columns — correct order and count', () => {
        const r = computeFromRecipe(baseRecipe, tables);
        expect(r.columns).toEqual(['Id', 'Name', 'Type']);
        expect(r.rows).toHaveLength(4);
        expect(r.rows[0]).toEqual(['001', 'Acme Corp', 'Customer']);
    });

    test('column not in source is silently dropped', () => {
        const r = computeFromRecipe({ ...baseRecipe, keptCols: ['Id', 'MISSING', 'Name'] }, tables);
        expect(r.columns).toEqual(['Id', 'Name']);
    });

    test('keep no columns (only computed) — no base cols returned', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: [],
            computedCols: [{
                name: 'Label',
                rules: [{ conditions: [{ col: 'Id', op: '=', value: '001' }], logic: '', then: 'First' }],
                defaultVal: 'Other'
            }]
        }, tables);
        expect(r.columns).toEqual(['Label']);
        expect(r.rows.map(r => r[0])).toEqual(['First', 'Other', 'Other', 'Other']);
    });

    // ── Row filter ────────────────────────────────────────────────────────────

    test('row filter keep — returns matching rows only', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            rowFilter: { action: 'keep', conditions: [{ col: 'Type', op: '=', value: 'Customer' }], logic: '' }
        }, tables);
        expect(r.rows).toHaveLength(2);
        expect(r.rows.map(r => r[0])).toEqual(['001', '003']);
    });

    test('row filter remove', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            rowFilter: { action: 'remove', conditions: [{ col: 'Type', op: '=', value: 'Customer' }], logic: '' }
        }, tables);
        expect(r.rows.map(r => r[0])).toEqual(['002', '004']);
    });

    test('row filter with OR logic', () => {
        // Keep accounts owned by u1 OR of type Partner
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            rowFilter: {
                action: 'keep',
                conditions: [
                    { col: 'OwnerId', op: '=', value: 'u1' },
                    { col: 'Type',    op: '=', value: 'Partner' }
                ],
                logic: '1 OR 2'
            }
        }, tables);
        // 001 (u1), 002 (Partner), 003 (u1)
        expect(r.rows.map(r => r[0])).toEqual(['001', '002', '003']);
    });

    test('row filter with 1 AND (2 OR 3)', () => {
        // 1: Type not empty, 2: Type=Customer, 3: OwnerId=u2
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            rowFilter: {
                action: 'keep',
                conditions: [
                    { col: 'Type',    op: 'not_empty', value: '' },
                    { col: 'Type',    op: '=',         value: 'Customer' },
                    { col: 'OwnerId', op: '=',         value: 'u2' },
                ],
                logic: '1 AND (2 OR 3)'
            }
        }, tables);
        // 001: true AND (true  OR false) = true
        // 002: true AND (false OR true)  = true
        // 003: true AND (true  OR false) = true
        // 004: false AND ...             = false  (Type is empty)
        expect(r.rows.map(r => r[0])).toEqual(['001', '002', '003']);
    });

    // ── Computed columns ──────────────────────────────────────────────────────

    test('computed column — single condition rule, default fallback', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{
                name: 'TypeLabel',
                rules: [
                    { conditions: [{ col: 'Type', op: '=', value: 'Customer' }], logic: '', then: 'Client' },
                    { conditions: [{ col: 'Type', op: '=', value: 'Partner' }],  logic: '', then: 'Partenaire' },
                ],
                defaultVal: 'Inconnu'
            }]
        }, tables);
        expect(r.columns).toEqual(['Id', 'TypeLabel']);
        const labels = r.rows.map(r => r[1]);
        expect(labels).toEqual(['Client', 'Partenaire', 'Client', 'Inconnu']);
    });

    test('computed column — multi-condition rule (AND)', () => {
        // TypeLabel = 'Top Customer' when Type=Customer AND OwnerId=u1
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{
                name: 'Tier',
                rules: [{
                    conditions: [
                        { col: 'Type',    op: '=', value: 'Customer' },
                        { col: 'OwnerId', op: '=', value: 'u1' },
                    ],
                    logic: '1 AND 2',
                    then: 'Top Customer'
                }],
                defaultVal: 'Other'
            }]
        }, tables);
        // 001: Customer + u1 → Top Customer
        // 002: Partner → Other
        // 003: Customer + u1 → Top Customer
        // 004: empty type → Other
        expect(r.rows.map(r => r[1])).toEqual(['Top Customer', 'Other', 'Top Customer', 'Other']);
    });

    test('computed column — multi-condition rule with OR', () => {
        // Flag = 'VIP' when Type=Customer OR OwnerId=u2
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{
                name: 'Flag',
                rules: [{
                    conditions: [
                        { col: 'Type',    op: '=', value: 'Customer' },
                        { col: 'OwnerId', op: '=', value: 'u2' },
                    ],
                    logic: '1 OR 2',
                    then: 'VIP'
                }],
                defaultVal: '-'
            }]
        }, tables);
        // 001: Customer → VIP
        // 002: Partner + u2 → VIP (via OR)
        // 003: Customer → VIP
        // 004: empty type, u3 → -
        expect(r.rows.map(r => r[1])).toEqual(['VIP', 'VIP', 'VIP', '-']);
    });

    test('computed column — first matching rule wins', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{
                name: 'Label',
                rules: [
                    { conditions: [{ col: 'Type', op: '=', value: 'Customer' }], logic: '', then: 'Rule1' },
                    { conditions: [{ col: 'Type', op: '=', value: 'Customer' }], logic: '', then: 'Rule2' },
                ],
                defaultVal: 'Default'
            }]
        }, tables);
        // Both rules match Customer, but first rule wins
        expect(r.rows[0][1]).toBe('Rule1');
        expect(r.rows[2][1]).toBe('Rule1');
    });

    test('row filter + computed column work together', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id', 'Name'],
            rowFilter: { action: 'keep', conditions: [{ col: 'Type', op: '=', value: 'Customer' }], logic: '' },
            computedCols: [{
                name: 'Segment',
                rules: [{ conditions: [{ col: 'OwnerId', op: '=', value: 'u1' }], logic: '', then: 'Alice' }],
                defaultVal: 'Other'
            }]
        }, tables);
        expect(r.rows).toHaveLength(2);
        expect(r.rows[0]).toEqual(['001', 'Acme Corp', 'Alice']);
        expect(r.rows[1]).toEqual(['003', 'Gamma LLC', 'Alice']);
    });

    // ── Replace mode ──────────────────────────────────────────────────────────

    test('replace mode — maps values of a source column', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{
                name: 'TypeFR',
                replaceCol: 'Type',
                replacements: [
                    { from: 'Customer', to: 'Client' },
                    { from: 'Partner',  to: 'Partenaire' },
                ]
            }]
        }, tables);
        expect(r.columns).toEqual(['Id', 'TypeFR']);
        // Customer → Client, Partner → Partenaire, '' → '' (no match → original value)
        expect(r.rows.map(r => r[1])).toEqual(['Client', 'Partenaire', 'Client', '']);
    });

    test('replace mode — unmapped value keeps the original source value', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{
                name: 'TypeMapped',
                replaceCol: 'Type',
                replacements: [{ from: 'Customer', to: 'Client' }]
            }]
        }, tables);
        // Partner not mapped → stays 'Partner', '' not mapped → stays ''
        expect(r.rows.map(r => r[1])).toEqual(['Client', 'Partner', 'Client', '']);
    });

    test('replace mode — empty replacements list → all values pass through unchanged', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{ name: 'TypeCopy', replaceCol: 'Type', replacements: [] }]
        }, tables);
        expect(r.rows.map(r => r[1])).toEqual(['Customer', 'Partner', 'Customer', '']);
    });

    test('replace mode — replaceCol not in source → empty string for all rows', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{ name: 'X', replaceCol: 'NonExistent', replacements: [{ from: '', to: 'Y' }] }]
        }, tables);
        // Column not found → sourceVal = '' → hits the { from: '', to: 'Y' } replacement
        expect(r.rows.map(r => r[1])).toEqual(['Y', 'Y', 'Y', 'Y']);
    });

    // ── Formula mode ──────────────────────────────────────────────────────────

    test('formula mode — basic formula on source column', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{ name: 'ShortName', formula: 'LEFT(Name, 4)' }]
        }, tables);
        expect(r.columns).toEqual(['Id', 'ShortName']);
        expect(r.rows.map(r => r[1])).toEqual(['Acme', 'Beta', 'Gamm', 'Delt']);
    });

    test('formula mode — formula using multiple columns', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{ name: 'Label', formula: 'Name & " (" & Type & ")"' }]
        }, tables);
        expect(r.rows[0][1]).toBe('Acme Corp (Customer)');
        expect(r.rows[1][1]).toBe('Beta Inc (Partner)');
        expect(r.rows[3][1]).toBe('Delta Co ()');  // empty Type
    });

    test('formula mode — conditional formula', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{ name: 'Tier', formula: 'IF(Type = "Customer", "Client", IF(Type = "Partner", "Partenaire", "Inconnu"))' }]
        }, tables);
        expect(r.rows.map(r => r[1])).toEqual(['Client', 'Partenaire', 'Client', 'Inconnu']);
    });

    test('formula mode — invalid formula returns empty string (no crash)', () => {
        const r = computeFromRecipe({
            ...baseRecipe,
            keptCols: ['Id'],
            computedCols: [{ name: 'Bad', formula: '@@@@' }]
        }, tables);
        expect(r.rows.map(r => r[1])).toEqual(['', '', '', '']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// STACK
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFromRecipe — stack', () => {

    const tableA = {
        id: 'sA', ref: 'ta', name: 'A',
        columns: ['Id', 'Value'],
        rows: [['1', 'alpha'], ['2', 'beta']]
    };
    const tableB = {
        id: 'sB', ref: 'tb', name: 'B',
        columns: ['Id', 'Value'],
        rows: [['3', 'gamma'], ['4', 'delta']]
    };
    const tableBExtra = {
        id: 'sBE', ref: 'tbe', name: 'BExtra',
        columns: ['Id', 'Value', 'Extra'],
        rows: [['3', 'gamma', 'x'], ['4', 'delta', 'y']]
    };

    const localTables = [tableA, tableB, tableBExtra];

    test('same columns — rows are concatenated in order', () => {
        const r = computeFromRecipe({ op: 'stack', leftId: 'sA', rightId: 'sB' }, localTables);
        expect(r.columns).toEqual(['Id', 'Value']);
        expect(r.rows).toHaveLength(4);
        expect(r.rows[0]).toEqual(['1', 'alpha']);
        expect(r.rows[2]).toEqual(['3', 'gamma']);
    });

    test('different columns — union of columns, missing filled with empty string', () => {
        const r = computeFromRecipe({ op: 'stack', leftId: 'sA', rightId: 'sBE' }, localTables);
        expect(r.columns).toEqual(['Id', 'Value', 'Extra']);
        // tableA rows have no Extra column → ''
        expect(r.rows[0]).toEqual(['1', 'alpha', '']);
        // tableBExtra rows have all columns
        expect(r.rows[2]).toEqual(['3', 'gamma', 'x']);
    });

    test('top table drives column order', () => {
        const r = computeFromRecipe({ op: 'stack', leftId: 'sBE', rightId: 'sA' }, localTables);
        // BExtra columns come first
        expect(r.columns[0]).toBe('Id');
        expect(r.columns[2]).toBe('Extra');
    });

    test('missing table → empty result', () => {
        const r = computeFromRecipe({ op: 'stack', leftId: 'NOPE', rightId: 'sB' }, localTables);
        expect(r.columns).toEqual([]);
        expect(r.rows).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// MISSING (anti-join)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFromRecipe — missing', () => {

    test('rows in left not matched in right', () => {
        const r = computeFromRecipe({
            op: 'missing',
            leftId: 'tA', leftCol: 'Id',
            rightId: 'tO', rightCol: 'AccountId'
        }, tables);
        // AccountId values in opps: 001, 001, 002, 999
        // Accounts with no opp: 003, 004
        expect(r.columns).toEqual(accounts.columns);
        expect(r.rows.map(r => r[0])).toEqual(['003', '004']);
    });

    test('all left rows have a match → empty result', () => {
        const allMatchR = {
            id: 'tR', ref: 'r', name: 'R',
            columns: ['Key'],
            rows: accounts.rows.map(r => [r[0]])  // all account IDs
        };
        const r = computeFromRecipe({
            op: 'missing',
            leftId: 'tA', leftCol: 'Id',
            rightId: 'tR', rightCol: 'Key'
        }, [...tables, allMatchR]);
        expect(r.rows).toHaveLength(0);
    });

    test('no left rows have a match → all rows returned', () => {
        const noMatchR = {
            id: 'tNM', ref: 'nm', name: 'NM',
            columns: ['Key'],
            rows: [['X'], ['Y']]
        };
        const r = computeFromRecipe({
            op: 'missing',
            leftId: 'tA', leftCol: 'Id',
            rightId: 'tNM', rightCol: 'Key'
        }, [...tables, noMatchR]);
        expect(r.rows).toHaveLength(accounts.rows.length);
    });

    test('missing table → empty result', () => {
        const r = computeFromRecipe({ op: 'missing', leftId: 'NOPE', leftCol: 'Id', rightId: 'tO', rightCol: 'AccountId' }, tables);
        expect(r.rows).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// FILTER (semi-join — keep left rows that have a match)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFromRecipe — filter', () => {

    test('keeps left rows that have a match in right', () => {
        const r = computeFromRecipe({
            op: 'filter',
            leftId: 'tA', leftCol: 'Id',
            rightId: 'tO', rightCol: 'AccountId'
        }, tables);
        // AccountIds in opps: 001 (×2), 002, 999
        // Accounts matched: 001, 002  (003 and 004 have no opp)
        expect(r.columns).toEqual(accounts.columns);
        expect(r.rows.map(r => r[0])).toEqual(['001', '002']);
    });

    test('no match → empty result', () => {
        const noMatchR = {
            id: 'tNM2', ref: 'nm2', name: 'NM2',
            columns: ['Key'], rows: [['X']]
        };
        const r = computeFromRecipe({
            op: 'filter',
            leftId: 'tA', leftCol: 'Id',
            rightId: 'tNM2', rightCol: 'Key'
        }, [...tables, noMatchR]);
        expect(r.rows).toHaveLength(0);
    });

    test('preserves left columns only', () => {
        const r = computeFromRecipe({
            op: 'filter',
            leftId: 'tA', leftCol: 'Id',
            rightId: 'tO', rightCol: 'AccountId'
        }, tables);
        expect(r.columns).toEqual(accounts.columns);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENRICH (left join)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFromRecipe — enrich', () => {

    // Helper to build a selectedCols list
    const sel = (tableId, col) => ({ tableId, col });

    test('basic left join — one match per key', () => {
        const r = computeFromRecipe({
            op: 'enrich',
            leftId: 'tO', leftCol: 'AccountId',
            rightId: 'tA', rightCol: 'Id',
            selectedCols: [sel('tO', 'Id'), sel('tO', 'Stage'), sel('tA', 'Name')]
        }, tables);
        expect(r.columns).toEqual(['Id', 'Stage', 'Name']);
        expect(r.rows).toHaveLength(4);   // same number as left table (no fan-out here)
        // o1: AccountId 001 → Acme Corp
        expect(r.rows[0]).toEqual(['o1', 'Open', 'Acme Corp']);
        // o4: AccountId 999 → no match → right side is null → ''
        expect(r.rows[3]).toEqual(['o4', 'Open', '']);
    });

    test('fan-out — multiple right matches per left row', () => {
        const r = computeFromRecipe({
            op: 'enrich',
            leftId: 'tA', leftCol: 'Id',
            rightId: 'tO', rightCol: 'AccountId',
            selectedCols: [sel('tA', 'Id'), sel('tA', 'Name'), sel('tO', 'Stage')]
        }, tables);
        // Account 001 has 2 opps → 2 rows in result
        // Account 002 has 1 opp  → 1 row
        // Accounts 003/004 have no opp → 1 null row each
        // 001→2 matches, 002→1, 003→0(null row), 004→0(null row) = 2+1+1+1 = 5
        expect(r.rows).toHaveLength(5);
        const acme = r.rows.filter(r => r[1] === 'Acme Corp');
        expect(acme).toHaveLength(2);
        expect(acme.map(r => r[2]).sort()).toEqual(['Closed Won', 'Open']);
    });

    test('no right match → null row fills right columns with empty string', () => {
        const r = computeFromRecipe({
            op: 'enrich',
            leftId: 'tA', leftCol: 'Id',
            rightId: 'tO', rightCol: 'AccountId',
            selectedCols: [sel('tA', 'Id'), sel('tO', 'Stage')]
        }, tables);
        // Account 003: no opp → Stage = ''
        const gamma = r.rows.find(r => r[0] === '003');
        expect(gamma).toBeDefined();
        expect(gamma[1]).toBe('');
    });

    test('duplicate column names get table-ref qualified', () => {
        // Both tables have a column named 'Id'
        const r = computeFromRecipe({
            op: 'enrich',
            leftId: 'tA', leftCol: 'Id',
            rightId: 'tO', rightCol: 'AccountId',
            selectedCols: [sel('tA', 'Id'), sel('tO', 'Id')]
        }, tables);
        // Both selected cols are named 'Id' → qualify them
        expect(r.columns).toEqual(['accounts.Id', 'opps.Id']);
    });

    test('no duplicate column names → plain names', () => {
        const r = computeFromRecipe({
            op: 'enrich',
            leftId: 'tO', leftCol: 'AccountId',
            rightId: 'tA', rightCol: 'Id',
            selectedCols: [sel('tO', 'Stage'), sel('tA', 'Name')]
        }, tables);
        expect(r.columns).toEqual(['Stage', 'Name']);
    });

    test('selected column not in table → silently dropped', () => {
        const r = computeFromRecipe({
            op: 'enrich',
            leftId: 'tO', leftCol: 'AccountId',
            rightId: 'tA', rightCol: 'Id',
            selectedCols: [sel('tO', 'Stage'), sel('tA', 'NONEXISTENT'), sel('tA', 'Name')]
        }, tables);
        expect(r.columns).toEqual(['Stage', 'Name']);
    });

    test('missing table → empty result', () => {
        const r = computeFromRecipe({
            op: 'enrich',
            leftId: 'NOPE', leftCol: 'Id',
            rightId: 'tA', rightCol: 'Id',
            selectedCols: [sel('tA', 'Name')]
        }, tables);
        expect(r.columns).toEqual([]);
        expect(r.rows).toEqual([]);
    });
});

// ── split ─────────────────────────────────────────────────────────────────────

describe('computeFromRecipe — split', () => {
    test('filters rows matching = condition', () => {
        const r = computeFromRecipe({ op: 'split', sourceId: 'tA', condition: { col: 'Type', op: '=', value: 'Customer' } }, tables);
        expect(r.columns).toEqual(accounts.columns);
        expect(r.rows).toEqual([['001', 'Acme Corp', 'Customer', 'u1'], ['003', 'Gamma LLC', 'Customer', 'u1']]);
    });

    test('≠ condition keeps non-matching rows', () => {
        const r = computeFromRecipe({ op: 'split', sourceId: 'tA', condition: { col: 'Type', op: '≠', value: 'Customer' } }, tables);
        expect(r.rows).toEqual([['002', 'Beta Inc', 'Partner', 'u2'], ['004', 'Delta Co', '', 'u3']]);
    });

    test('empty condition keeps rows where col is empty', () => {
        const r = computeFromRecipe({ op: 'split', sourceId: 'tA', condition: { col: 'Type', op: 'empty', value: '' } }, tables);
        expect(r.rows).toEqual([['004', 'Delta Co', '', 'u3']]);
    });

    test('not_empty condition keeps rows where col is non-empty', () => {
        const r = computeFromRecipe({ op: 'split', sourceId: 'tA', condition: { col: 'Type', op: 'not_empty', value: '' } }, tables);
        expect(r.rows.length).toBe(3);
    });

    test('preserves all source columns', () => {
        const r = computeFromRecipe({ op: 'split', sourceId: 'tA', condition: { col: 'Type', op: '=', value: 'Partner' } }, tables);
        expect(r.columns).toEqual(['Id', 'Name', 'Type', 'OwnerId']);
    });

    test('no condition → all rows returned', () => {
        const r = computeFromRecipe({ op: 'split', sourceId: 'tA' }, tables);
        expect(r.rows).toEqual(accounts.rows);
    });

    test('missing source table → empty result', () => {
        const r = computeFromRecipe({ op: 'split', sourceId: 'NOPE', condition: { col: 'Type', op: '=', value: 'X' } }, tables);
        expect(r.columns).toEqual([]);
        expect(r.rows).toEqual([]);
    });

    test('works with v2 columnDefs (ID-based column reference)', () => {
        const src = {
            id: 'tV2', ref: 'tV2', name: 'V2',
            columns: ['Status', 'Name'],
            columnDefs: [
                { id: 'col-s', name: 'Status', origin: 'Status' },
                { id: 'col-n', name: 'Name',   origin: 'Name'   }
            ],
            rows: [['Active', 'Alice'], ['Inactive', 'Bob'], ['Active', 'Carol']]
        };
        const r = computeFromRecipe({ op: 'split', sourceId: 'tV2', condition: { col: 'col-s', op: '=', value: 'Active' } }, [src]);
        expect(r.rows).toEqual([['Active', 'Alice'], ['Active', 'Carol']]);
        expect(r.columnDefs.map(d => d.id)).toEqual(['col-s', 'col-n']);
    });

    describe('default (catch-all) branch', () => {
        const grpId = 'grp-1';

        // Two non-default sibling split tables in the tables array
        const siblingCustomer = {
            id: 'split-cust', name: 'Customers', source: 'result',
            columns: accounts.columns, rows: [],
            recipe: { op: 'split', sourceId: 'tA', splitGroupId: grpId, isDefault: false, condition: { col: 'Type', op: '=', value: 'Customer' } }
        };
        const siblingPartner = {
            id: 'split-part', name: 'Partners', source: 'result',
            columns: accounts.columns, rows: [],
            recipe: { op: 'split', sourceId: 'tA', splitGroupId: grpId, isDefault: false, condition: { col: 'Type', op: '=', value: 'Partner' } }
        };

        test('catches rows not matched by any sibling', () => {
            // Customers = 001, 003 | Partners = 002 | Default should get 004 (Type='')
            const defaultRecipe = { op: 'split', sourceId: 'tA', splitGroupId: grpId, isDefault: true };
            const r = computeFromRecipe(defaultRecipe, [...tables, siblingCustomer, siblingPartner]);
            expect(r.rows).toEqual([['004', 'Delta Co', '', 'u3']]);
        });

        test('default with no siblings returns all rows', () => {
            const r = computeFromRecipe({ op: 'split', sourceId: 'tA', splitGroupId: 'no-siblings', isDefault: true }, tables);
            expect(r.rows).toEqual(accounts.rows);
        });

        test('default with no splitGroupId returns all rows (degenerate)', () => {
            const r = computeFromRecipe({ op: 'split', sourceId: 'tA', isDefault: true }, tables);
            expect(r.rows).toEqual(accounts.rows);
        });

        test('default does not include rows from a different group', () => {
            const siblingOtherGroup = {
                id: 'split-other', name: 'Other', source: 'result',
                columns: accounts.columns, rows: [],
                recipe: { op: 'split', sourceId: 'tA', splitGroupId: 'different-grp', isDefault: false, condition: { col: 'Type', op: '=', value: 'Customer' } }
            };
            // Only the partner sibling is in this group — default should exclude only Partners
            const defaultRecipe = { op: 'split', sourceId: 'tA', splitGroupId: grpId, isDefault: true };
            const r = computeFromRecipe(defaultRecipe, [...tables, siblingPartner, siblingOtherGroup]);
            // Customer (001,003) + empty-type (004) are not Partners → all 3 in default
            expect(r.rows.map(r => r[0]).sort()).toEqual(['001', '003', '004']);
        });
    });
});
