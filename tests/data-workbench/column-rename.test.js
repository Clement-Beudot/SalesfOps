const { renameColumnInSoql, renameColumnInRecipe } = require('../../src/windows/data-workbench/logic');

// ── renameColumnInSoql ────────────────────────────────────────────────────────

describe('renameColumnInSoql', () => {
    test('replaces a single column reference', () => {
        const q = 'SELECT Id FROM Contact WHERE AccountId IN :SOQL.Accounts.Id';
        expect(renameColumnInSoql(q, 'SOQL.Accounts', 'Id', 'Salesforce_Id'))
            .toBe('SELECT Id FROM Contact WHERE AccountId IN :SOQL.Accounts.Salesforce_Id');
    });

    test('replaces multiple occurrences', () => {
        const q = 'SELECT Id FROM A WHERE X IN :SOQL.T.Name AND Y IN :SOQL.T.Name';
        expect(renameColumnInSoql(q, 'SOQL.T', 'Name', 'Label'))
            .toBe('SELECT Id FROM A WHERE X IN :SOQL.T.Label AND Y IN :SOQL.T.Label');
    });

    test('does not affect the same column name in a different table ref', () => {
        const q = 'SELECT Id FROM A WHERE X IN :SOQL.T1.Id AND Y IN :SOQL.T2.Id';
        expect(renameColumnInSoql(q, 'SOQL.T1', 'Id', 'Ref_Id'))
            .toBe('SELECT Id FROM A WHERE X IN :SOQL.T1.Ref_Id AND Y IN :SOQL.T2.Id');
    });

    test('does not affect a different column in the same table ref', () => {
        const q = 'SELECT Id FROM A WHERE X IN :SOQL.T.Name AND Y IN :SOQL.T.Email';
        expect(renameColumnInSoql(q, 'SOQL.T', 'Name', 'Label'))
            .toBe('SELECT Id FROM A WHERE X IN :SOQL.T.Label AND Y IN :SOQL.T.Email');
    });

    test('no match leaves query unchanged', () => {
        const q = 'SELECT Id FROM Contact';
        expect(renameColumnInSoql(q, 'SOQL.T', 'Id', 'NewId')).toBe(q);
    });

    describe('old name is a prefix of new name (regression)', () => {
        test('Name → NameTest does not double-replace', () => {
            const q = 'SELECT Id FROM Contact WHERE Id IN :SOQL.T.Name)';
            expect(renameColumnInSoql(q, 'SOQL.T', 'Name', 'NameTest'))
                .toBe('SELECT Id FROM Contact WHERE Id IN :SOQL.T.NameTest)');
        });

        test('second call with same args is idempotent (heal pass)', () => {
            // Simulates propagateColumnRename then healSoqlBindingsForTable calling rename again
            const q = 'WHERE Id IN :SOQL.T.NameTest)';
            expect(renameColumnInSoql(q, 'SOQL.T', 'Name', 'NameTest')).toBe(q);
        });

        test('Id → IdTest does not corrupt an existing IdTest binding', () => {
            const q = 'WHERE X IN :SOQL.T.Id) AND Y IN :SOQL.T.IdTest)';
            expect(renameColumnInSoql(q, 'SOQL.T', 'Id', 'IdTest'))
                .toBe('WHERE X IN :SOQL.T.IdTest) AND Y IN :SOQL.T.IdTest)');
        });

        test('works at end of string without trailing character', () => {
            const q = 'WHERE X IN :SOQL.T.Name';
            expect(renameColumnInSoql(q, 'SOQL.T', 'Name', 'NameTest'))
                .toBe('WHERE X IN :SOQL.T.NameTest');
        });

        test('multiple occurrences all replaced correctly', () => {
            const q = 'WHERE X IN :SOQL.T.Name) AND Y IN :SOQL.T.Name)';
            expect(renameColumnInSoql(q, 'SOQL.T', 'Name', 'NameTest'))
                .toBe('WHERE X IN :SOQL.T.NameTest) AND Y IN :SOQL.T.NameTest)');
        });
    });

    test('returns null unchanged', () => {
        expect(renameColumnInSoql(null, 'SOQL.T', 'Id', 'NewId')).toBeNull();
    });

    test('returns undefined unchanged', () => {
        expect(renameColumnInSoql(undefined, 'SOQL.T', 'Id', 'NewId')).toBeUndefined();
    });

    test('works with Table. and Result. prefixes', () => {
        const q = 'SELECT Id FROM A WHERE X IN :Table.Paste.SIREN__c';
        expect(renameColumnInSoql(q, 'Table.Paste', 'SIREN__c', 'Siren'))
            .toBe('SELECT Id FROM A WHERE X IN :Table.Paste.Siren');
    });

    describe('bracket notation for columns with spaces or special characters', () => {
        test('renaming a plain column to a spaced name uses bracket notation', () => {
            const q = 'SELECT Id FROM A WHERE X IN :Table.T.Name';
            expect(renameColumnInSoql(q, 'Table.T', 'Name', 'Company Name'))
                .toBe('SELECT Id FROM A WHERE X IN :Table.T.[Company Name]');
        });

        test('renaming a bracketed column to a plain name removes brackets', () => {
            const q = 'SELECT Id FROM A WHERE X IN :Table.T.[Company Name]';
            expect(renameColumnInSoql(q, 'Table.T', 'Company Name', 'CompanyName'))
                .toBe('SELECT Id FROM A WHERE X IN :Table.T.CompanyName');
        });

        test('renaming a bracketed column to another spaced name keeps brackets', () => {
            const q = 'WHERE X IN :Table.T.[First Name] AND Y IN :Table.T.[First Name]';
            expect(renameColumnInSoql(q, 'Table.T', 'First Name', 'Last Name'))
                .toBe('WHERE X IN :Table.T.[Last Name] AND Y IN :Table.T.[Last Name]');
        });

        test('bracketed column in different table is untouched', () => {
            const q = 'WHERE X IN :Table.T1.[Company Name] AND Y IN :Table.T2.[Company Name]';
            expect(renameColumnInSoql(q, 'Table.T1', 'Company Name', 'Firm Name'))
                .toBe('WHERE X IN :Table.T1.[Firm Name] AND Y IN :Table.T2.[Company Name]');
        });

        test('renaming a plain column to an accented name uses bracket notation', () => {
            const q = 'WHERE X IN :Table.T.Prenom';
            expect(renameColumnInSoql(q, 'Table.T', 'Prenom', 'Prénom'))
                .toBe('WHERE X IN :Table.T.[Prénom]');
        });

        test('renaming a bracketed accented column to a plain name removes brackets', () => {
            const q = 'WHERE X IN :Table.T.[Prénom]';
            expect(renameColumnInSoql(q, 'Table.T', 'Prénom', 'Prenom'))
                .toBe('WHERE X IN :Table.T.Prenom');
        });

        test('accented column with space uses bracket notation', () => {
            const q = 'WHERE X IN :Table.T.[Prénom Client]';
            expect(renameColumnInSoql(q, 'Table.T', 'Prénom Client', 'Prénom'))
                .toBe('WHERE X IN :Table.T.[Prénom]');
        });
    });
});

// ── renameColumnInRecipe ──────────────────────────────────────────────────────

describe('renameColumnInRecipe', () => {

    // ── enrich / missing / filter ─────────────────────────────────────────────

    test('updates leftCol on a join recipe', () => {
        const recipe = { op: 'enrich', leftId: 't1', leftCol: 'Id', rightId: 't2', rightCol: 'AccountId', selectedCols: [] };
        const changed = renameColumnInRecipe(recipe, 't1', 'Id', 'Salesforce_Id');
        expect(changed).toBe(true);
        expect(recipe.leftCol).toBe('Salesforce_Id');
        expect(recipe.rightCol).toBe('AccountId'); // untouched
    });

    test('updates rightCol on a join recipe', () => {
        const recipe = { op: 'missing', leftId: 't1', leftCol: 'Id', rightId: 't2', rightCol: 'AccountId' };
        const changed = renameColumnInRecipe(recipe, 't2', 'AccountId', 'Ref_Id');
        expect(changed).toBe(true);
        expect(recipe.rightCol).toBe('Ref_Id');
        expect(recipe.leftCol).toBe('Id'); // untouched
    });

    test('wrong tableId leaves join cols unchanged', () => {
        const recipe = { op: 'filter', leftId: 't1', leftCol: 'Id', rightId: 't2', rightCol: 'Id' };
        const changed = renameColumnInRecipe(recipe, 'other', 'Id', 'NewId');
        expect(changed).toBe(false);
        expect(recipe.leftCol).toBe('Id');
        expect(recipe.rightCol).toBe('Id');
    });

    test('updates matching selectedCols entry (enrich)', () => {
        const recipe = {
            op: 'enrich',
            leftId: 't1', leftCol: 'Id', rightId: 't2', rightCol: 'AccountId',
            selectedCols: [
                { tableId: 't1', col: 'Id' },
                { tableId: 't2', col: 'Name' },
                { tableId: 't1', col: 'Email' },
            ]
        };
        renameColumnInRecipe(recipe, 't1', 'Email', 'EmailAddress');
        expect(recipe.selectedCols[0].col).toBe('Id');       // untouched
        expect(recipe.selectedCols[1].col).toBe('Name');     // untouched (different table)
        expect(recipe.selectedCols[2].col).toBe('EmailAddress'); // updated
    });

    test('selectedCols from wrong table are untouched', () => {
        const recipe = {
            op: 'enrich',
            leftId: 't1', leftCol: 'Id', rightId: 't2', rightCol: 'Id',
            selectedCols: [{ tableId: 't2', col: 'Id' }]
        };
        renameColumnInRecipe(recipe, 't1', 'Id', 'NewId');
        expect(recipe.selectedCols[0].col).toBe('Id'); // untouched — belongs to t2
    });

    // ── transform ─────────────────────────────────────────────────────────────

    test('updates keptCols in a transform recipe', () => {
        const recipe = { op: 'transform', sourceId: 't1', keptCols: ['Id', 'Name', 'Email'] };
        renameColumnInRecipe(recipe, 't1', 'Name', 'FullName');
        expect(recipe.keptCols).toEqual(['Id', 'FullName', 'Email']);
    });

    test('keptCols with wrong sourceId are untouched', () => {
        const recipe = { op: 'transform', sourceId: 't2', keptCols: ['Name'] };
        renameColumnInRecipe(recipe, 't1', 'Name', 'FullName');
        expect(recipe.keptCols).toEqual(['Name']);
    });

    test('updates rowFilter condition col', () => {
        const recipe = {
            op: 'transform',
            sourceId: 't1',
            keptCols: [],
            rowFilter: {
                action: 'keep',
                conditions: [
                    { col: 'Status', op: '=', value: 'Active' },
                    { col: 'Name',   op: 'contains', value: 'Acme' },
                ],
                logic: '1 AND 2'
            },
            computedCols: []
        };
        renameColumnInRecipe(recipe, 't1', 'Status', 'Account_Status');
        expect(recipe.rowFilter.conditions[0].col).toBe('Account_Status');
        expect(recipe.rowFilter.conditions[1].col).toBe('Name'); // untouched
    });

    test('updates condition col inside a computed column rule', () => {
        const recipe = {
            op: 'transform',
            sourceId: 't1',
            keptCols: [],
            rowFilter: null,
            computedCols: [{
                name: 'Category',
                rules: [{
                    conditions: [{ col: 'Revenue', op: '=', value: '0' }],
                    logic: '1',
                    then: 'Low'
                }],
                defaultVal: 'Unknown'
            }]
        };
        renameColumnInRecipe(recipe, 't1', 'Revenue', 'Annual_Revenue');
        expect(recipe.computedCols[0].rules[0].conditions[0].col).toBe('Annual_Revenue');
    });

    test('updates replaceCol in a replace-mode computed column', () => {
        const recipe = {
            op: 'transform',
            sourceId: 't1',
            keptCols: [],
            rowFilter: null,
            computedCols: [{
                name: 'TypeFR',
                replaceCol: 'Type',
                replacements: [{ from: 'Customer', to: 'Client' }]
            }]
        };
        const changed = renameColumnInRecipe(recipe, 't1', 'Type', 'AccountType');
        expect(changed).toBe(true);
        expect(recipe.computedCols[0].replaceCol).toBe('AccountType');
    });

    test('replaceCol from wrong sourceId is untouched', () => {
        const recipe = {
            op: 'transform',
            sourceId: 't2',
            keptCols: [],
            rowFilter: null,
            computedCols: [{ name: 'TypeFR', replaceCol: 'Type', replacements: [] }]
        };
        const changed = renameColumnInRecipe(recipe, 't1', 'Type', 'AccountType');
        expect(changed).toBe(false);
        expect(recipe.computedCols[0].replaceCol).toBe('Type');
    });

    test('replaceCol with non-matching name is untouched', () => {
        const recipe = {
            op: 'transform',
            sourceId: 't1',
            keptCols: [],
            rowFilter: null,
            computedCols: [{ name: 'TypeFR', replaceCol: 'Type', replacements: [] }]
        };
        const changed = renameColumnInRecipe(recipe, 't1', 'Status', 'AccountStatus');
        expect(changed).toBe(false);
        expect(recipe.computedCols[0].replaceCol).toBe('Type');
    });

    test('returns false when nothing matched', () => {
        const recipe = { op: 'transform', sourceId: 't1', keptCols: ['Id'], rowFilter: null, computedCols: [] };
        const changed = renameColumnInRecipe(recipe, 't1', 'NonExistent', 'X');
        expect(changed).toBe(false);
    });

    test('returns false for null recipe', () => {
        expect(renameColumnInRecipe(null, 't1', 'Id', 'NewId')).toBe(false);
    });

    // ── split ─────────────────────────────────────────────────────────────────

    test('updates condition.col on a split recipe', () => {
        const recipe = { op: 'split', sourceId: 't1', condition: { col: 'Status', op: '=', value: 'Active' } };
        const changed = renameColumnInRecipe(recipe, 't1', 'Status', 'Account_Status');
        expect(changed).toBe(true);
        expect(recipe.condition.col).toBe('Account_Status');
        expect(recipe.condition.op).toBe('=');   // other fields untouched
        expect(recipe.condition.value).toBe('Active');
    });

    test('wrong sourceId leaves split condition unchanged', () => {
        const recipe = { op: 'split', sourceId: 't2', condition: { col: 'Status', op: '=', value: 'Active' } };
        const changed = renameColumnInRecipe(recipe, 't1', 'Status', 'Account_Status');
        expect(changed).toBe(false);
        expect(recipe.condition.col).toBe('Status');
    });

    test('non-matching col name leaves split condition unchanged', () => {
        const recipe = { op: 'split', sourceId: 't1', condition: { col: 'Type', op: '=', value: 'X' } };
        const changed = renameColumnInRecipe(recipe, 't1', 'Status', 'Account_Status');
        expect(changed).toBe(false);
        expect(recipe.condition.col).toBe('Type');
    });
});
