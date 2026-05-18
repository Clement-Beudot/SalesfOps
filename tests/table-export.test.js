'use strict';

const { tableToCsv, tableToTsv } = require('../src/utils/table-export');

const cols = ['Id', 'Name', 'Amount'];
const rows = [
    ['001', 'Acme', '1000'],
    ['002', 'Globex', '500'],
];

describe('tableToCsv', () => {

    test('header + rows joined by CRLF', () => {
        const result = tableToCsv(cols, rows);
        const lines = result.split('\r\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe('Id,Name,Amount');
        expect(lines[1]).toBe('001,Acme,1000');
        expect(lines[2]).toBe('002,Globex,500');
    });

    test('header only (no data rows)', () => {
        expect(tableToCsv(['A', 'B'], [])).toBe('A,B');
    });

    test('null cell becomes empty string', () => {
        expect(tableToCsv(['X'], [[null]])).toBe('X\r\n');
    });

    test('value with comma is quoted', () => {
        expect(tableToCsv(['Name'], [['Doe, Jane']])).toBe('Name\r\n"Doe, Jane"');
    });

    test('value with double-quote escapes it', () => {
        expect(tableToCsv(['Name'], [['Say "hi"']])).toBe('Name\r\n"Say ""hi"""');
    });

    test('value with newline is quoted', () => {
        expect(tableToCsv(['Note'], [['line1\nline2']])).toBe('Note\r\n"line1\nline2"');
    });

    test('plain value without special chars is not quoted', () => {
        expect(tableToCsv(['X'], [['hello']])).toBe('X\r\nhello');
    });
});

describe('tableToTsv', () => {

    test('header + rows separated by tabs and CRLF', () => {
        const result = tableToTsv(cols, rows);
        const lines = result.split('\r\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe('Id\tName\tAmount');
        expect(lines[1]).toBe('001\tAcme\t1000');
    });

    test('value with tab is quoted', () => {
        expect(tableToTsv(['X'], [['a\tb']])).toBe('X\r\n"a\tb"');
    });

    test('value with newline is quoted', () => {
        expect(tableToTsv(['X'], [['a\nb']])).toBe('X\r\n"a\nb"');
    });

    test('value with double-quote is quoted and escaped', () => {
        expect(tableToTsv(['X'], [['say "hi"']])).toBe('X\r\n"say ""hi"""');
    });

    test('comma does NOT trigger quoting in TSV', () => {
        expect(tableToTsv(['X'], [['a,b']])).toBe('X\r\na,b');
    });

    test('null cell becomes empty string', () => {
        expect(tableToTsv(['X'], [[null]])).toBe('X\r\n');
    });
});
