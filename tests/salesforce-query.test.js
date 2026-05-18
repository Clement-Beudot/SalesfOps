'use strict';

const { flattenRecord } = require('../src/utils/salesforce-query');

describe('flattenRecord', () => {

    describe('flat records', () => {
        test('simple string fields', () => {
            expect(flattenRecord({ Id: '001', Name: 'Acme' }))
                .toEqual({ Id: '001', Name: 'Acme' });
        });

        test('numeric and boolean values become strings', () => {
            expect(flattenRecord({ Amount: 1000, IsWon: true }))
                .toEqual({ Amount: '1000', IsWon: 'true' });
        });

        test('null value becomes empty string', () => {
            expect(flattenRecord({ CloseDate: null }))
                .toEqual({ CloseDate: '' });
        });

        test('undefined value becomes empty string', () => {
            expect(flattenRecord({ Phone: undefined }))
                .toEqual({ Phone: '' });
        });

        test('attributes key is skipped', () => {
            const record = { attributes: { type: 'Account', url: '/...' }, Id: '001' };
            expect(flattenRecord(record)).toEqual({ Id: '001' });
        });
    });

    describe('nested objects (relationships)', () => {
        test('single-level relationship flattened with underscore', () => {
            const record = { Owner: { Name: 'Alice', Id: '005' } };
            expect(flattenRecord(record)).toEqual({ Owner_Name: 'Alice', Owner_Id: '005' });
        });

        test('relationship attributes are skipped', () => {
            const record = {
                Owner: { attributes: { type: 'User' }, Name: 'Bob' }
            };
            expect(flattenRecord(record)).toEqual({ Owner_Name: 'Bob' });
        });

        test('two-level nesting', () => {
            const record = { Account: { Owner: { Name: 'Carol' } } };
            expect(flattenRecord(record)).toEqual({ Account_Owner_Name: 'Carol' });
        });

        test('null relationship becomes empty string', () => {
            expect(flattenRecord({ Owner: null })).toEqual({ Owner: '' });
        });
    });

    describe('arrays', () => {
        test('array items flattened with index suffix', () => {
            const record = { Tags: ['a', 'b'] };
            expect(flattenRecord(record)).toEqual({ Tags_0: 'a', Tags_1: 'b' });
        });

        test('empty array produces no keys', () => {
            expect(flattenRecord({ Tags: [] })).toEqual({});
        });
    });

    describe('empty / edge cases', () => {
        test('empty record', () => {
            expect(flattenRecord({})).toEqual({});
        });

        test('record with only attributes', () => {
            expect(flattenRecord({ attributes: { type: 'Lead' } })).toEqual({});
        });
    });
});
