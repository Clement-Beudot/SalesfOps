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

    // ── v2 colId format — right table has no columnDefs (paste table) ─────────

    test('v2 selectedCols: right paste table (no columnDefs) columns appear in result', () => {
        // Reproduces the bug where colId lookup failed for tables without columnDefs,
        // causing right-side columns to be silently dropped from the enrich result.
        const groupResult = {
            id: 'tGrp', name: 'Group by groupe', source: 'result',
            columns: ['Groupe', 'count_Groupe'],
            columnDefs: [
                { id: 'Groupe',             name: 'Groupe' },
                { id: 'c_count_mp8pbwsq',   name: 'count_Groupe' },
            ],
            rows: [['Group 1', '3'], ['Group 2', '5'], ['Group 3', '4']]
        };
        const prices = {
            id: 'tPrices', name: 'VolumePrices', source: 'paste',
            columns: ['NumberOfStructures', 'ExpectedAmount'],
            // no columnDefs — paste table
            rows: [['3', '30'], ['4', '40'], ['5', '50']]
        };
        const r = computeFromRecipe({
            op: 'enrich',
            leftId: 'tGrp',    leftCol:  'c_count_mp8pbwsq',
            rightId: 'tPrices', rightCol: 'NumberOfStructures',
            caseInsensitive: false,
            selectedCols: [
                { colId: 'Groupe' },
                { colId: 'c_count_mp8pbwsq' },
                { colId: 'NumberOfStructures' },
                { colId: 'ExpectedAmount' },
            ]
        }, [groupResult, prices]);

        expect(r.columns).toEqual(['Groupe', 'count_Groupe', 'NumberOfStructures', 'ExpectedAmount']);
        expect(r.rows).toHaveLength(3);
        const grp1 = r.rows.find(row => row[0] === 'Group 1');
        expect(grp1).toEqual(['Group 1', '3', '3', '30']);
        const grp2 = r.rows.find(row => row[0] === 'Group 2');
        expect(grp2).toEqual(['Group 2', '5', '5', '50']);
    });

    test('v2 selectedCols: left paste table (no columnDefs) columns appear in result', () => {
        const pasteLeft = {
            id: 'tPL', name: 'Left', source: 'paste',
            columns: ['Key', 'Value'],
            rows: [['A', 'alpha'], ['B', 'beta'], ['C', 'gamma']]
        };
        const refRight = {
            id: 'tPR', name: 'Right', source: 'result',
            columns: ['Code', 'Label'],
            columnDefs: [{ id: 'cCode', name: 'Code' }, { id: 'cLabel', name: 'Label' }],
            rows: [['A', 'Label A'], ['B', 'Label B']]
        };
        const r = computeFromRecipe({
            op: 'enrich',
            leftId: 'tPL', leftCol: 'Key',
            rightId: 'tPR', rightCol: 'cCode',
            selectedCols: [{ colId: 'Key' }, { colId: 'Value' }, { colId: 'cLabel' }]
        }, [pasteLeft, refRight]);

        expect(r.columns).toEqual(['Key', 'Value', 'Label']);
        expect(r.rows.find(row => row[0] === 'A')).toEqual(['A', 'alpha', 'Label A']);
        expect(r.rows.find(row => row[0] === 'C')).toEqual(['C', 'gamma', '']); // no match
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// caseInsensitive matching — enrich / filter / missing
// ─────────────────────────────────────────────────────────────────────────────

describe('caseInsensitive matching', () => {

    const emails = {
        id: 'tEmails', ref: 'emails', name: 'Emails',
        columns: ['Email', 'Name'],
        rows: [
            ['contact@gmail.com',  'Alice'],
            ['SUPPORT@ACME.COM',   'Bob'],
            ['Info@Example.com',   'Carol'],
            ['unknown@test.com',   'Dave'],
        ]
    };

    const blocklist = {
        id: 'tBlock', ref: 'blocklist', name: 'Blocklist',
        columns: ['Email'],
        rows: [
            ['CONTACT@GMAIL.COM'],   // differs only in case
            ['support@acme.com'],    // differs only in case
        ]
    };

    const localTables = [emails, blocklist];

    // ── filter ────────────────────────────────────────────────────────────────

    describe('filter', () => {
        test('case-sensitive (default): CONTACT@GMAIL.COM ≠ contact@gmail.com → no match', () => {
            const r = computeFromRecipe({
                op: 'filter',
                leftId: 'tEmails', leftCol: 'Email',
                rightId: 'tBlock', rightCol: 'Email',
            }, localTables);
            expect(r.rows.map(r => r[0])).toEqual([]);
        });

        test('caseInsensitive: matches regardless of case', () => {
            const r = computeFromRecipe({
                op: 'filter',
                leftId: 'tEmails', leftCol: 'Email',
                rightId: 'tBlock', rightCol: 'Email',
                caseInsensitive: true,
            }, localTables);
            expect(r.rows.map(r => r[0])).toEqual(['contact@gmail.com', 'SUPPORT@ACME.COM']);
        });

        test('caseInsensitive: unmatched rows excluded', () => {
            const r = computeFromRecipe({
                op: 'filter',
                leftId: 'tEmails', leftCol: 'Email',
                rightId: 'tBlock', rightCol: 'Email',
                caseInsensitive: true,
            }, localTables);
            expect(r.rows.map(r => r[0])).not.toContain('Info@Example.com');
            expect(r.rows.map(r => r[0])).not.toContain('unknown@test.com');
        });
    });

    // ── missing ───────────────────────────────────────────────────────────────

    describe('missing', () => {
        test('case-sensitive (default): CONTACT@GMAIL.COM ≠ contact@gmail.com → all rows kept', () => {
            const r = computeFromRecipe({
                op: 'missing',
                leftId: 'tEmails', leftCol: 'Email',
                rightId: 'tBlock', rightCol: 'Email',
            }, localTables);
            expect(r.rows).toHaveLength(4);
        });

        test('caseInsensitive: matched rows excluded', () => {
            const r = computeFromRecipe({
                op: 'missing',
                leftId: 'tEmails', leftCol: 'Email',
                rightId: 'tBlock', rightCol: 'Email',
                caseInsensitive: true,
            }, localTables);
            expect(r.rows.map(r => r[0])).toEqual(['Info@Example.com', 'unknown@test.com']);
        });

        test('caseInsensitive: result keeps left columns only', () => {
            const r = computeFromRecipe({
                op: 'missing',
                leftId: 'tEmails', leftCol: 'Email',
                rightId: 'tBlock', rightCol: 'Email',
                caseInsensitive: true,
            }, localTables);
            expect(r.columns).toEqual(emails.columns);
        });
    });

    // ── enrich ────────────────────────────────────────────────────────────────

    describe('enrich', () => {
        const sel = (tableId, col) => ({ tableId, col });

        test('case-sensitive (default): no join on mismatched case', () => {
            const r = computeFromRecipe({
                op: 'enrich',
                leftId: 'tEmails', leftCol: 'Email',
                rightId: 'tBlock', rightCol: 'Email',
                selectedCols: [sel('tEmails', 'Email'), sel('tEmails', 'Name')],
            }, localTables);
            // No matches → right side fills with ''
            expect(r.rows.every(r => r[1] !== '')).toBe(true); // Name (from left) always present
        });

        test('caseInsensitive: joins on normalised key', () => {
            const enriched = {
                id: 'tEnriched', ref: 'enriched', name: 'Enriched',
                columns: ['Email', 'Category'],
                rows: [
                    ['CONTACT@GMAIL.COM', 'Personal'],
                    ['support@acme.com',  'Support'],
                ]
            };
            const r = computeFromRecipe({
                op: 'enrich',
                leftId: 'tEmails', leftCol: 'Email',
                rightId: 'tEnriched', rightCol: 'Email',
                selectedCols: [sel('tEmails', 'Name'), sel('tEnriched', 'Category')],
                caseInsensitive: true,
            }, [...localTables, enriched]);
            const alice = r.rows.find(r => r[0] === 'Alice');
            const bob   = r.rows.find(r => r[0] === 'Bob');
            expect(alice[1]).toBe('Personal');
            expect(bob[1]).toBe('Support');
        });

        test('caseInsensitive: unmatched left row still appears with empty right values', () => {
            const enriched = {
                id: 'tEnriched2', ref: 'enriched2', name: 'Enriched2',
                columns: ['Email', 'Category'],
                rows: [['CONTACT@GMAIL.COM', 'Personal']]
            };
            const r = computeFromRecipe({
                op: 'enrich',
                leftId: 'tEmails', leftCol: 'Email',
                rightId: 'tEnriched2', rightCol: 'Email',
                selectedCols: [sel('tEmails', 'Name'), sel('tEnriched2', 'Category')],
                caseInsensitive: true,
            }, [...localTables, enriched]);
            const dave = r.rows.find(r => r[0] === 'Dave');
            expect(dave).toBeDefined();
            expect(dave[1]).toBe('');
        });
    });

    // ── null handling ─────────────────────────────────────────────────────────

    test('caseInsensitive: null keys do not match non-null values', () => {
        const left  = { id: 'tL', ref: 'l', name: 'L', columns: ['K'], rows: [[null], ['a']] };
        const right = { id: 'tR', ref: 'r', name: 'R', columns: ['K'], rows: [['A']] };
        const r = computeFromRecipe({
            op: 'filter',
            leftId: 'tL', leftCol: 'K',
            rightId: 'tR', rightCol: 'K',
            caseInsensitive: true,
        }, [left, right]);
        expect(r.rows.map(r => r[0])).toEqual(['a']);
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

// ─────────────────────────────────────────────────────────────────────────────
// Group op
// ─────────────────────────────────────────────────────────────────────────────

describe('group op', () => {
    const source = {
        id: 'tSrc', name: 'Source', source: 'soql',
        columnDefs: [
            { id: 'cId',   name: 'AccountId' },
            { id: 'cStage', name: 'Stage' },
            { id: 'cAmt',  name: 'Amount' },
        ],
        columns: ['AccountId', 'Stage', 'Amount'],
        rows: [
            ['001', 'Open',       '100'],
            ['001', 'Closed Won', '200'],
            ['002', 'Open',       '300'],
            ['002', 'Open',       '50' ],
        ]
    };
    const tables = [source];

    const recipe = {
        op: 'group',
        sourceId: 'tSrc',
        groupColId: 'cId',
        countColId: 'cCount',
        aggregations: [
            { colId: 'cStage', agg: 'concat_unique', outColId: 'oStage' },
            { colId: 'cAmt',   agg: 'max',           outColId: 'oAmt'   },
        ]
    };

    test('output has group col + count col + agg cols', () => {
        const r = computeFromRecipe(recipe, tables);
        expect(r.columns).toEqual(['AccountId', 'count_AccountId', 'Stage', 'Amount']);
    });

    test('correct number of groups', () => {
        const r = computeFromRecipe(recipe, tables);
        expect(r.rows.length).toBe(2);
    });

    test('count is correct', () => {
        const r = computeFromRecipe(recipe, tables);
        const row001 = r.rows.find(r => r[0] === '001');
        expect(row001[1]).toBe('2');
        const row002 = r.rows.find(r => r[0] === '002');
        expect(row002[1]).toBe('2');
    });

    test('concat_unique joins unique values', () => {
        const r = computeFromRecipe(recipe, tables);
        const row001 = r.rows.find(r => r[0] === '001');
        expect(row001[2]).toBe('Open;Closed Won');
        const row002 = r.rows.find(r => r[0] === '002');
        expect(row002[2]).toBe('Open'); // duplicate "Open" deduplicated
    });

    test('max (numeric) returns highest', () => {
        const r = computeFromRecipe(recipe, tables);
        const row001 = r.rows.find(r => r[0] === '001');
        expect(row001[3]).toBe('200');
        const row002 = r.rows.find(r => r[0] === '002');
        expect(row002[3]).toBe('300');
    });

    test('first agg returns first encountered value', () => {
        const r2 = computeFromRecipe({ ...recipe, aggregations: [
            { colId: 'cStage', agg: 'first', outColId: 'oStage' }
        ]}, tables);
        const row001 = r2.rows.find(r => r[0] === '001');
        expect(row001[2]).toBe('Open');
    });

    test('min (numeric) returns lowest', () => {
        const r2 = computeFromRecipe({ ...recipe, aggregations: [
            { colId: 'cAmt', agg: 'min', outColId: 'oAmt' }
        ]}, tables);
        const row002 = r2.rows.find(r => r[0] === '002');
        expect(row002[2]).toBe('50');
    });

    test('concat_unique with custom separator', () => {
        const r2 = computeFromRecipe({ ...recipe, aggregations: [
            { colId: 'cStage', agg: 'concat_unique', separator: ' | ', outColId: 'oStage' }
        ]}, tables);
        const row001 = r2.rows.find(r => r[0] === '001');
        expect(row001[2]).toBe('Open | Closed Won');
    });

    test('stable outColIds preserved in columnDefs', () => {
        const r = computeFromRecipe(recipe, tables);
        expect(r.columnDefs[0].id).toBe('cId');       // group col preserves source ID
        expect(r.columnDefs[1].id).toBe('cCount');    // count col uses recipe.countColId
        expect(r.columnDefs[2].id).toBe('oStage');    // agg cols use recipe.aggregations[i].outColId
        expect(r.columnDefs[3].id).toBe('oAmt');
    });

    test('unknown sourceId returns empty', () => {
        const r = computeFromRecipe({ ...recipe, sourceId: 'missing' }, tables);
        expect(r.rows).toEqual([]);
        expect(r.columns).toEqual([]);
    });

    test('groupColId stored as column name still works when source has stable IDs (stale recipe)', () => {
        // Reproduces the scenario where a paste table (no columnDefs) had its recipe saved with
        // groupColId = column_name, then was re-pasted and got stable IDs. The computation must
        // still work via colIdx's name-based fallback.
        const pasteWithStableIds = {
            id: 'tPaste', name: 'Paste', source: 'paste',
            columnDefs: [
                { id: 'c_new_1', name: 'Groupe',  origin: 'Groupe' },
                { id: 'c_new_2', name: 'Montant', origin: 'Montant' },
            ],
            columns: ['Groupe', 'Montant'],
            rows: [['G1', '10'], ['G2', '20'], ['G1', '30']]
        };
        const staleRecipe = {
            op: 'group',
            sourceId: 'tPaste',
            groupColId: 'Groupe',       // name, not stable ID — stale after paste got columnDefs
            countColId: 'c_count',
            aggregations: [
                { colId: 'Montant', agg: 'sum', outColId: 'c_out' }  // also by name
            ]
        };
        const r = computeFromRecipe(staleRecipe, [pasteWithStableIds]);
        // Computation should still work via colIdx fallback (column name lookup)
        expect(r.rows).toHaveLength(2);
        const g1 = r.rows.find(row => row[0] === 'G1');
        expect(g1).toBeDefined();
        expect(Number(g1[2])).toBe(40); // sum of 10+30
    });

    // ── max / min on numbers ──────────────────────────────────────────────────

    describe('max/min — numeric', () => {
        function numSrc(vals) {
            return [{
                id: 'tN', name: 'N', source: 'soql',
                columnDefs: [{ id: 'cG', name: 'G' }, { id: 'cV', name: 'V' }],
                columns: ['G', 'V'],
                rows: vals.map(([g, v]) => [g, v])
            }];
        }
        function agg(op, vals) {
            const tables = numSrc(vals);
            const r = computeFromRecipe({
                op: 'group', sourceId: 'tN', groupColId: 'cG', countColId: 'cc',
                aggregations: [{ colId: 'cV', agg: op, outColId: 'ov' }]
            }, tables);
            return r.rows.find(r => r[0] === 'A')?.[2];
        }

        test('max integer strings', () => expect(agg('max', [['A','3'],['A','10'],['A','2']])).toBe('10'));
        test('min integer strings', () => expect(agg('min', [['A','3'],['A','10'],['A','2']])).toBe('2'));
        test('max with decimals', () => expect(agg('max', [['A','1.5'],['A','2.3'],['A','0.9']])).toBe('2.3'));
        test('min with decimals', () => expect(agg('min', [['A','1.5'],['A','2.3'],['A','0.9']])).toBe('0.9'));
        test('max with negatives', () => expect(agg('max', [['A','-5'],['A','0'],['A','-1']])).toBe('0'));
        test('min with negatives', () => expect(agg('min', [['A','-5'],['A','0'],['A','-1']])).toBe('-5'));
        test('single value returns itself', () => expect(agg('max', [['A','42']])).toBe('42'));
        test('empty values ignored in max', () => expect(agg('max', [['A',''],['A','5'],['A','']])).toBe('5'));
        test('empty values ignored in min', () => expect(agg('min', [['A',''],['A','5'],['A','']])).toBe('5'));
        test('all empty returns empty string', () => expect(agg('max', [['A',''],['A','']])).toBe(''));
    });

    // ── max / min on strings (alphabetic) ────────────────────────────────────

    describe('max/min — alphabetic (fallback when not all numeric)', () => {
        function strSrc(vals) {
            return [{
                id: 'tS', name: 'S', source: 'soql',
                columnDefs: [{ id: 'cG', name: 'G' }, { id: 'cV', name: 'V' }],
                columns: ['G', 'V'],
                rows: vals.map(([g, v]) => [g, v])
            }];
        }
        function agg(op, vals) {
            const tables = strSrc(vals);
            const r = computeFromRecipe({
                op: 'group', sourceId: 'tS', groupColId: 'cG', countColId: 'cc',
                aggregations: [{ colId: 'cV', agg: op, outColId: 'ov' }]
            }, tables);
            return r.rows.find(r => r[0] === 'A')?.[2];
        }

        test('max alphabetic', () => expect(agg('max', [['A','banana'],['A','apple'],['A','cherry']])).toBe('cherry'));
        test('min alphabetic', () => expect(agg('min', [['A','banana'],['A','apple'],['A','cherry']])).toBe('apple'));
        test('mixed numeric and text falls back to alphabetic', () => {
            // "10" < "9" alphabetically
            expect(agg('max', [['A','9'],['A','10'],['A','abc']])).toBe('abc');
            expect(agg('min', [['A','9'],['A','10'],['A','abc']])).toBe('10');
        });
        test('case sensitive: uppercase before lowercase', () => {
            expect(agg('min', [['A','b'],['A','A']])).toBe('A');
        });
    });

    // ── max / min on dates ────────────────────────────────────────────────────

    describe('max/min — dates', () => {
        function dateSrc(vals) {
            return [{
                id: 'tD', name: 'D', source: 'soql',
                columnDefs: [{ id: 'cG', name: 'G' }, { id: 'cD', name: 'Date' }],
                columns: ['G', 'Date'],
                rows: vals.map(([g, d]) => [g, d])
            }];
        }
        function agg(op, vals) {
            const tables = dateSrc(vals);
            const r = computeFromRecipe({
                op: 'group', sourceId: 'tD', groupColId: 'cG', countColId: 'cc',
                aggregations: [{ colId: 'cD', agg: op, outColId: 'od' }]
            }, tables);
            return r.rows.find(r => r[0] === 'A')?.[2];
        }

        test('max ISO dates', () => expect(agg('max', [['A','2024-01-15'],['A','2023-12-31'],['A','2024-06-01']])).toBe('2024-06-01'));
        test('min ISO dates', () => expect(agg('min', [['A','2024-01-15'],['A','2023-12-31'],['A','2024-06-01']])).toBe('2023-12-31'));
        test('max Salesforce datetimes', () => {
            const v = agg('max', [['A','2024-01-15T10:00:00.000Z'],['A','2024-01-15T09:00:00.000Z']]);
            expect(v).toBe('2024-01-15T10:00:00.000Z');
        });
        test('min Salesforce datetimes', () => {
            const v = agg('min', [['A','2024-01-15T10:00:00.000Z'],['A','2024-01-15T09:00:00.000Z']]);
            expect(v).toBe('2024-01-15T09:00:00.000Z');
        });
        test('single date returns itself', () => expect(agg('max', [['A','2024-03-10']])).toBe('2024-03-10'));
    });

    // ── sum / avg ─────────────────────────────────────────────────────────────

    describe('sum/avg — numeric aggregation', () => {
        function numSrc(vals) {
            return [{
                id: 'tN2', name: 'N2', source: 'soql',
                columnDefs: [{ id: 'cG', name: 'G' }, { id: 'cV', name: 'V' }],
                columns: ['G', 'V'],
                rows: vals.map(([g, v]) => [g, v])
            }];
        }
        function agg(op, vals) {
            const tables = numSrc(vals);
            const r = computeFromRecipe({
                op: 'group', sourceId: 'tN2', groupColId: 'cG', countColId: 'cc',
                aggregations: [{ colId: 'cV', agg: op, outColId: 'ov' }]
            }, tables);
            return r.rows.find(r => r[0] === 'A')?.[2];
        }

        test('sum of integers', () => expect(agg('sum', [['A','100'],['A','200'],['A','300']])).toBe(600));
        test('sum of decimals', () => expect(agg('sum', [['A','1.5'],['A','2.5']])).toBe(4));
        test('sum with negatives', () => expect(agg('sum', [['A','10'],['A','-3']])).toBe(7));
        test('sum single value', () => expect(agg('sum', [['A','42']])).toBe(42));

        test('avg of integers', () => expect(agg('avg', [['A','100'],['A','200'],['A','300']])).toBe(200));
        test('avg of decimals', () => expect(agg('avg', [['A','1'],['A','2'],['A','3']])).toBe(2));
        test('avg single value', () => expect(agg('avg', [['A','42']])).toBe(42));

        test('empty values ignored — not treated as zero', () => {
            // sum of [100, '', 200] should be 300, not 300 (but avg should be 150, not 100)
            expect(agg('sum', [['A','100'],['A',''],['A','200']])).toBe(300);
            expect(agg('avg', [['A','100'],['A',''],['A','200']])).toBe(150);
        });
        test('null/undefined values ignored', () => {
            expect(agg('sum', [['A','100'],['A',null],['A','50']])).toBe(150);
            expect(agg('avg', [['A','100'],['A',null],['A','50']])).toBe(75);
        });
        test('all empty returns empty string', () => {
            expect(agg('sum', [['A',''],['A','']])).toBe('');
            expect(agg('avg', [['A',''],['A','']])).toBe('');
        });
        test('non-numeric values ignored', () => {
            // "N/A" and "—" are skipped; only numeric strings count
            expect(agg('sum', [['A','100'],['A','N/A'],['A','200']])).toBe(300);
            expect(agg('avg', [['A','100'],['A','N/A'],['A','200']])).toBe(150);
        });
        test('all non-numeric returns empty string', () => {
            expect(agg('sum', [['A','foo'],['A','bar']])).toBe('');
            expect(agg('avg', [['A','foo'],['A','bar']])).toBe('');
        });
        test('no floating point artifacts (0.1 + 0.2)', () => {
            expect(agg('sum', [['A','0.1'],['A','0.2']])).toBe(0.3);
        });
        test('avg does not produce excess decimal noise', () => {
            expect(agg('avg', [['A','1'],['A','2'],['A','3'],['A','4'],['A','5']])).toBe(3);
        });

        // ── treatBlankAsZero ──────────────────────────────────────────────────

        function aggZero(op, vals) {
            const tables = numSrc(vals);
            const r = computeFromRecipe({
                op: 'group', sourceId: 'tN2', groupColId: 'cG', countColId: 'cc',
                aggregations: [{ colId: 'cV', agg: op, outColId: 'ov', treatBlankAsZero: true }]
            }, tables);
            return r.rows.find(r => r[0] === 'A')?.[2];
        }

        test('sum treatBlankAsZero: empty counted as 0', () => {
            expect(aggZero('sum', [['A','100'],['A',''],['A','200']])).toBe(300);
        });
        test('avg treatBlankAsZero: empty counted as 0 in denominator', () => {
            // avg([100, 0, 200]) = 300/3 = 100, not 300/2 = 150
            expect(aggZero('avg', [['A','100'],['A',''],['A','200']])).toBe(100);
        });
        test('sum treatBlankAsZero: non-numeric counted as 0', () => {
            expect(aggZero('sum', [['A','100'],['A','N/A'],['A','200']])).toBe(300);
        });
        test('avg treatBlankAsZero: non-numeric counted as 0 in denominator', () => {
            expect(aggZero('avg', [['A','100'],['A','N/A'],['A','200']])).toBe(100);
        });
        test('sum treatBlankAsZero: all empty = 0', () => {
            expect(aggZero('sum', [['A',''],['A','']])).toBe(0);
        });
        test('avg treatBlankAsZero: all empty = 0', () => {
            expect(aggZero('avg', [['A',''],['A','']])).toBe(0);
        });
    });

    // ── concat_unique edge cases ──────────────────────────────────────────────

    describe('concat_unique edge cases', () => {
        function concatAgg(rows, separator) {
            const tables = [{
                id: 'tC', name: 'C', source: 'soql',
                columnDefs: [{ id: 'cG', name: 'G' }, { id: 'cV', name: 'V' }],
                columns: ['G', 'V'],
                rows
            }];
            const r = computeFromRecipe({
                op: 'group', sourceId: 'tC', groupColId: 'cG', countColId: 'cc',
                aggregations: [{ colId: 'cV', agg: 'concat_unique', outColId: 'ov', ...(separator !== undefined ? { separator } : {}) }]
            }, tables);
            return r.rows.find(r => r[0] === 'A')?.[2];
        }

        test('all identical values → single value', () => expect(concatAgg([['A','x'],['A','x'],['A','x']])).toBe('x'));
        test('empty strings excluded from concat', () => expect(concatAgg([['A',''],['A','foo'],['A','']])).toBe('foo'));
        test('all empty → empty string', () => expect(concatAgg([['A',''],['A','']])).toBe(''));
        test('default separator is ;', () => expect(concatAgg([['A','a'],['A','b']])).toBe('a;b'));
        test('custom separator applied', () => expect(concatAgg([['A','a'],['A','b']], ' / ')).toBe('a / b'));
        test('order preserved (first occurrence wins for uniqueness)', () => {
            expect(concatAgg([['A','c'],['A','a'],['A','b'],['A','a']])).toBe('c;a;b');
        });
    });

    // ── concat_all edge cases ─────────────────────────────────────────────────

    describe('concat_all edge cases', () => {
        function concatAllAgg(rows, separator) {
            const tables = [{
                id: 'tCA', name: 'CA', source: 'soql',
                columnDefs: [{ id: 'cG', name: 'G' }, { id: 'cV', name: 'V' }],
                columns: ['G', 'V'],
                rows
            }];
            const r = computeFromRecipe({
                op: 'group', sourceId: 'tCA', groupColId: 'cG', countColId: 'cc',
                aggregations: [{ colId: 'cV', agg: 'concat_all', outColId: 'ov', ...(separator !== undefined ? { separator } : {}) }]
            }, tables);
            return r.rows.find(r => r[0] === 'A')?.[2];
        }

        test('keeps duplicates unlike concat_unique', () => expect(concatAllAgg([['A','x'],['A','x'],['A','x']])).toBe('x;x;x'));
        test('empty strings excluded from concat', () => expect(concatAllAgg([['A',''],['A','foo'],['A','']])).toBe('foo'));
        test('all empty → empty string', () => expect(concatAllAgg([['A',''],['A','']])).toBe(''));
        test('default separator is ;', () => expect(concatAllAgg([['A','a'],['A','b'],['A','a']])).toBe('a;b;a'));
        test('custom separator applied', () => expect(concatAllAgg([['A','a'],['A','b']], ' | ')).toBe('a | b'));
        test('insertion order preserved', () => {
            expect(concatAllAgg([['A','c'],['A','a'],['A','b'],['A','a']])).toBe('c;a;b;a');
        });
    });
});
