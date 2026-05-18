'use strict';

const ExtractValueCommand = require('../src/commands/extractValue');

// Instantiate with null deps — only extractPaths / extractValues are exercised
const cmd = new ExtractValueCommand(null, null);

// ── extractPaths ──────────────────────────────────────────────────────────────

describe('extractPaths — flat object', () => {
    test('returns all leaf keys sorted', () => {
        const data = { Id: '001', Name: 'Acme', Industry: 'Tech' };
        expect(cmd.extractPaths(data)).toEqual(['Id', 'Industry', 'Name']);
    });

    test('wraps a single object in an array', () => {
        const data = { Id: '001', Name: 'Acme' };
        expect(cmd.extractPaths(data)).toEqual(['Id', 'Name']);
    });

    test('handles an array of objects', () => {
        const data = [{ Id: '001', Name: 'A' }, { Id: '002', Name: 'B' }];
        expect(cmd.extractPaths(data)).toEqual(['Id', 'Name']);
    });

    test('ignores the "attributes" key (Salesforce metadata)', () => {
        const data = [{ attributes: { type: 'Contact' }, Id: '003', Name: 'Bob' }];
        expect(cmd.extractPaths(data)).toEqual(['Id', 'Name']);
    });
});

describe('extractPaths — nested objects', () => {
    test('descends into nested objects with dot notation', () => {
        const data = [{ Id: '001', Owner: { Id: 'u1', Name: 'Alice' } }];
        const paths = cmd.extractPaths(data);
        expect(paths).toContain('Id');
        expect(paths).toContain('Owner.Id');
        expect(paths).toContain('Owner.Name');
    });
});

describe('extractPaths — Salesforce sub-query records', () => {
    test('exposes sub-record fields as parent.records.field', () => {
        const data = [{
            Id: '001',
            Contacts: { records: [{ Id: 'c1', Email: 'a@b.com' }] }
        }];
        const paths = cmd.extractPaths(data);
        expect(paths).toContain('Contacts.records.Id');
        expect(paths).toContain('Contacts.records.Email');
        expect(paths).not.toContain('Contacts');
    });

    test('skips Salesforce sub-record attributes key', () => {
        const data = [{
            Id: '001',
            Contacts: { records: [{ attributes: { type: 'Contact' }, Id: 'c1' }] }
        }];
        const paths = cmd.extractPaths(data);
        expect(paths).not.toContain('Contacts.records.attributes');
        expect(paths).toContain('Contacts.records.Id');
    });

    test('returns empty sub-record path list when records array is empty', () => {
        const data = [{ Id: '001', Contacts: { records: [] } }];
        const paths = cmd.extractPaths(data);
        expect(paths).not.toContain('Contacts.records');
        expect(paths).toContain('Id');
    });
});

// ── extractValues ─────────────────────────────────────────────────────────────

describe('extractValues — flat path', () => {
    const data = [
        { Id: '001', Type: 'Customer' },
        { Id: '002', Type: 'Partner' },
        { Id: '003', Type: 'Customer' },
    ];

    test('returns unique values for a simple key', () => {
        expect(cmd.extractValues(data, 'Type').sort()).toEqual(['Customer', 'Partner']);
    });

    test('preserves all values when they are all unique', () => {
        expect(cmd.extractValues(data, 'Id')).toHaveLength(3);
    });

    test('wraps a single object in an array', () => {
        expect(cmd.extractValues({ Id: '001', Type: 'Customer' }, 'Type')).toEqual(['Customer']);
    });
});

describe('extractValues — nested dot path', () => {
    const data = [
        { Owner: { Name: 'Alice' } },
        { Owner: { Name: 'Bob' } },
        { Owner: { Name: 'Alice' } },
    ];

    test('traverses dot-notation path and deduplicates', () => {
        expect(cmd.extractValues(data, 'Owner.Name').sort()).toEqual(['Alice', 'Bob']);
    });
});

describe('extractValues — Salesforce sub-records path', () => {
    const data = [{
        Id: '001',
        Contacts: { records: [{ Email: 'a@b.com' }, { Email: 'c@d.com' }, { Email: 'a@b.com' }] }
    }];

    test('collects unique values from sub-records', () => {
        expect(cmd.extractValues(data, 'Contacts.records.Email').sort()).toEqual(['a@b.com', 'c@d.com']);
    });
});

describe('extractValues — missing path', () => {
    test('returns empty array when key does not exist', () => {
        const data = [{ Id: '001' }];
        expect(cmd.extractValues(data, 'Missing')).toEqual([]);
    });

    test('skips rows where intermediate path is null', () => {
        const data = [{ Owner: null }, { Owner: { Name: 'Alice' } }];
        expect(cmd.extractValues(data, 'Owner.Name')).toEqual(['Alice']);
    });
});
