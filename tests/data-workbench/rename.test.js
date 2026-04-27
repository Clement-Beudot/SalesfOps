const { tableRef, renameSoqlRefs } = require('../../src/windows/data-workbench/logic');

// ── tableRef ──────────────────────────────────────────────────────────────────

describe('tableRef', () => {
    describe('source prefix', () => {
        test('paste  → Table.', () => expect(tableRef('paste',  'My Data')).toMatch(/^Table\./));
        test('soql   → SOQL.',  () => expect(tableRef('soql',   'My Data')).toMatch(/^SOQL\./));
        test('result → Result.', () => expect(tableRef('result', 'My Data')).toMatch(/^Result\./));
    });

    describe('name cleaning', () => {
        test('spaces become underscores', () => {
            expect(tableRef('soql', 'SF Existing Account')).toBe('SOQL.SF_Existing_Account');
        });
        test('multiple consecutive spaces become a single underscore', () => {
            expect(tableRef('paste', 'My  Data')).toBe('Table.My_Data');
        });
        test('special characters are stripped', () => {
            expect(tableRef('soql', 'My-Data (2023)!')).toBe('SOQL.MyData_2023');
        });
        test('leading/trailing whitespace is ignored', () => {
            expect(tableRef('paste', '  Accounts  ')).toBe('Table.Accounts');
        });
        test('default numeric suffix preserved', () => {
            expect(tableRef('paste',  'Table 1')).toBe('Table.Table_1');
            expect(tableRef('soql',   'SOQL 2')).toBe('SOQL.SOQL_2');
            expect(tableRef('result', 'Result 3')).toBe('Result.Result_3');
        });
        test('empty name after cleaning falls back to Unnamed', () => {
            expect(tableRef('soql', '---')).toBe('SOQL.Unnamed');
            expect(tableRef('soql', '')).toBe('SOQL.Unnamed');
        });
        test('underscores in the name are preserved', () => {
            expect(tableRef('soql', 'SF_Accounts')).toBe('SOQL.SF_Accounts');
        });
    });
});

// ── renameSoqlRefs ────────────────────────────────────────────────────────────

describe('renameSoqlRefs', () => {
    test('replaces a single reference', () => {
        const q = 'SELECT Id FROM Contact WHERE AccountId IN :SOQL.Q1.Id';
        expect(renameSoqlRefs(q, 'SOQL.Q1', 'SOQL.SF_Accounts'))
            .toBe('SELECT Id FROM Contact WHERE AccountId IN :SOQL.SF_Accounts.Id');
    });

    test('replaces multiple occurrences in the same query', () => {
        const q = 'SELECT Id FROM A WHERE B IN :SOQL.Old.X AND C IN :SOQL.Old.Y';
        expect(renameSoqlRefs(q, 'SOQL.Old', 'SOQL.New'))
            .toBe('SELECT Id FROM A WHERE B IN :SOQL.New.X AND C IN :SOQL.New.Y');
    });

    test('does not affect a different ref that starts with the same prefix', () => {
        // Renaming "SOQL.Accts" must not touch "SOQL.AcctsAll"
        const q = 'SELECT Id FROM A WHERE X IN :SOQL.AcctsAll.Id AND Y IN :SOQL.Accts.Name';
        expect(renameSoqlRefs(q, 'SOQL.Accts', 'SOQL.Renamed'))
            .toBe('SELECT Id FROM A WHERE X IN :SOQL.AcctsAll.Id AND Y IN :SOQL.Renamed.Name');
    });

    test('does not replace when the old ref is not present', () => {
        const q = 'SELECT Id FROM Contact';
        expect(renameSoqlRefs(q, 'SOQL.Old', 'SOQL.New')).toBe(q);
    });

    test('returns null unchanged', () => {
        expect(renameSoqlRefs(null, 'SOQL.Old', 'SOQL.New')).toBeNull();
    });

    test('returns undefined unchanged', () => {
        expect(renameSoqlRefs(undefined, 'SOQL.Old', 'SOQL.New')).toBeUndefined();
    });

    test('works across source types', () => {
        const q = 'SELECT Id FROM X WHERE Id IN :Table.MyPaste.Id';
        expect(renameSoqlRefs(q, 'Table.MyPaste', 'Table.Renamed'))
            .toBe('SELECT Id FROM X WHERE Id IN :Table.Renamed.Id');
    });

    test('ref in the middle of a longer query is replaced correctly', () => {
        const q = `SELECT Id, Name
FROM Account
WHERE Id IN :SOQL.Existing.AccountId
AND OwnerId IN :Table.Owners.Id`;
        const result = renameSoqlRefs(q, 'SOQL.Existing', 'SOQL.SF_Existing_Accounts');
        expect(result).toContain(':SOQL.SF_Existing_Accounts.AccountId');
        expect(result).toContain(':Table.Owners.Id'); // unrelated ref untouched
    });
});
