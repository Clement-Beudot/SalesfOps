'use strict';

const { parseTsv } = require('../../src/windows/data-workbench/logic');

describe('parseTsv', () => {

    describe('null / empty input', () => {
        test('null → null', () => expect(parseTsv(null)).toBeNull());
        test('empty string → null', () => expect(parseTsv('')).toBeNull());
        test('whitespace only → null', () => expect(parseTsv('   \n  ')).toBeNull());
        test('header with only empty first column → null', () => expect(parseTsv('\t\t')).toBeNull());
    });

    describe('header only (no data rows)', () => {
        test('single column header → empty rows', () => {
            const result = parseTsv('Name');
            expect(result).not.toBeNull();
            expect(result.columns).toEqual(['Name']);
            expect(result.rows).toEqual([]);
        });

        test('multi-column header → correct columns, empty rows', () => {
            const result = parseTsv('Id\tName\tStage');
            expect(result.columns).toEqual(['Id', 'Name', 'Stage']);
            expect(result.rows).toEqual([]);
        });
    });

    describe('header + data rows', () => {
        test('single data row', () => {
            const result = parseTsv('Id\tName\n001\tAcme');
            expect(result.columns).toEqual(['Id', 'Name']);
            expect(result.rows).toEqual([['001', 'Acme']]);
        });

        test('multiple data rows', () => {
            const result = parseTsv('Id\tName\n001\tAcme\n002\tBeta\n003\tGamma');
            expect(result.columns).toEqual(['Id', 'Name']);
            expect(result.rows).toHaveLength(3);
            expect(result.rows[2]).toEqual(['003', 'Gamma']);
        });

        test('blank lines between data rows are skipped', () => {
            const result = parseTsv('Id\tName\n001\tAcme\n\n002\tBeta');
            expect(result.rows).toHaveLength(2);
        });

        test('trailing blank line is ignored', () => {
            const result = parseTsv('Id\tName\n001\tAcme\n');
            expect(result.rows).toHaveLength(1);
        });
    });

    describe('Windows-style CRLF line endings', () => {
        test('CRLF splits correctly', () => {
            const result = parseTsv('Id\tName\r\n001\tAcme\r\n002\tBeta');
            expect(result.columns).toEqual(['Id', 'Name']);
            expect(result.rows).toHaveLength(2);
            expect(result.rows[0]).toEqual(['001', 'Acme']);
        });
    });

    describe('empty cells', () => {
        test('empty cell in data row is preserved as empty string', () => {
            const result = parseTsv('Id\tName\tType\n001\t\tCustomer');
            expect(result.rows[0]).toEqual(['001', '', 'Customer']);
        });

        test('trailing tab is trimmed (tab is whitespace)', () => {
            // text.trim() removes trailing tabs before parsing
            const result = parseTsv('A\tB\n1\t2\t');
            expect(result.rows[0]).toEqual(['1', '2']);
        });
    });
});
