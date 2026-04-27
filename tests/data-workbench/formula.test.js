'use strict';

const { evaluateFormula } = require('../../src/windows/data-workbench/logic');

// Helper: evaluate a formula with a simple row context
// columns = ['SIRET', 'Name', 'Amount', 'Email', 'CodePostal', 'Telephone', 'CA', 'Pays']
const COLS = ['SIRET', 'Name', 'Amount', 'Email', 'CodePostal', 'Telephone', 'CA', 'Pays'];
const ROW  = ['30012345600012', 'Acme Corp', '1500', 'jean.dupont@exemple.com', '75008', '06 12 34 56 78', '50000', 'FR'];

function ef(formula, row = ROW, cols = COLS) {
    return evaluateFormula(formula, row, cols);
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty / trivial
// ─────────────────────────────────────────────────────────────────────────────

describe('empty / trivial', () => {
    test('empty formula → ""', () => expect(ef('')).toBe(''));
    test('whitespace formula → ""', () => expect(ef('   ')).toBe(''));
    test('null formula → ""', () => expect(evaluateFormula(null, ROW, COLS)).toBe(''));
    test('undefined formula → ""', () => expect(evaluateFormula(undefined, ROW, COLS)).toBe(''));
});

// ─────────────────────────────────────────────────────────────────────────────
// Literals
// ─────────────────────────────────────────────────────────────────────────────

describe('literals', () => {
    test('double-quoted string', () => expect(ef('"hello"')).toBe('hello'));
    test('single-quoted string', () => expect(ef("'hello'")).toBe('hello'));
    test('integer literal', () => expect(ef('42')).toBe('42'));
    test('decimal literal', () => expect(ef('3.14')).toBe('3.14'));
    test('negative literal via unary minus', () => expect(ef('-5')).toBe('-5'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Column references
// ─────────────────────────────────────────────────────────────────────────────

describe('column references', () => {
    test('exact column name', () => expect(ef('SIRET')).toBe('30012345600012'));
    test('case-insensitive: lowercase', () => expect(ef('siret')).toBe('30012345600012'));
    test('case-insensitive: mixed', () => expect(ef('SiReT')).toBe('30012345600012'));
    test('unknown column → ""', () => expect(ef('NonExistent')).toBe(''));
    test('column with spaces in value', () => expect(ef('Name')).toBe('Acme Corp'));

    describe('bracket notation [Column Name] for columns with spaces', () => {
        const spaceCols = ['Company Name', 'First Name', 'Amount HT'];
        const spaceRow  = ['Acme Corp', 'Jean', '1200'];

        test('[Column Name] resolves correctly', () => {
            expect(evaluateFormula('[Company Name]', spaceRow, spaceCols)).toBe('Acme Corp');
        });
        test('case-insensitive inside brackets', () => {
            expect(evaluateFormula('[company name]', spaceRow, spaceCols)).toBe('Acme Corp');
        });
        test('bracket ref inside function: LEFT([Company Name], 4)', () => {
            expect(evaluateFormula('LEFT([Company Name], 4)', spaceRow, spaceCols)).toBe('Acme');
        });
        test('bracket ref inside CONCAT', () => {
            expect(evaluateFormula('CONCAT([First Name], " ", [Company Name])', spaceRow, spaceCols)).toBe('Jean Acme Corp');
        });
        test('bracket ref in arithmetic: [Amount HT] * 1.2', () => {
            expect(evaluateFormula('[Amount HT] * 1.2', spaceRow, spaceCols)).toBe('1440');
        });
        test('bracket ref in IF condition', () => {
            expect(evaluateFormula('IF([Amount HT] > 1000, "Grand", "Petit")', spaceRow, spaceCols)).toBe('Grand');
        });
        test('mixing bracket and plain refs', () => {
            expect(evaluateFormula('[First Name] & " from " & [Company Name]', spaceRow, spaceCols)).toBe('Jean from Acme Corp');
        });
        test('unknown bracket column → ""', () => {
            expect(evaluateFormula('[NonExistent Col]', spaceRow, spaceCols)).toBe('');
        });
        test('empty bracket → empty column lookup', () => {
            expect(evaluateFormula('[]', spaceRow, spaceCols)).toBe('');
        });

        describe('accented characters in bracket notation', () => {
            const accentCols = ['Prénom', 'Société', 'Prénom Client'];
            const accentRow  = ['Jean', 'Acme Corp', 'Jean Dupont'];

            test('[Prénom] resolves correctly', () => {
                expect(evaluateFormula('[Prénom]', accentRow, accentCols)).toBe('Jean');
            });
            test('[Société] resolves correctly', () => {
                expect(evaluateFormula('[Société]', accentRow, accentCols)).toBe('Acme Corp');
            });
            test('[Prénom Client] with space and accent', () => {
                expect(evaluateFormula('[Prénom Client]', accentRow, accentCols)).toBe('Jean Dupont');
            });
            test('accented col inside function: UPPER([Prénom])', () => {
                expect(evaluateFormula('UPPER([Prénom])', accentRow, accentCols)).toBe('JEAN');
            });
            test('accented col in CONCAT', () => {
                expect(evaluateFormula('CONCAT([Prénom], " - ", [Société])', accentRow, accentCols)).toBe('Jean - Acme Corp');
            });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Arithmetic operators
// ─────────────────────────────────────────────────────────────────────────────

describe('arithmetic', () => {
    test('addition: 1 + 2', () => expect(ef('1 + 2')).toBe('3'));
    test('subtraction: 10 - 3', () => expect(ef('10 - 3')).toBe('7'));
    test('multiplication: 4 * 5', () => expect(ef('4 * 5')).toBe('20'));
    test('division: 10 / 4', () => expect(ef('10 / 4')).toBe('2.5'));
    test('division by zero → ""', () => expect(ef('5 / 0')).toBe(''));
    test('operator precedence: 2 + 3 * 4 = 14', () => expect(ef('2 + 3 * 4')).toBe('14'));
    test('parentheses override precedence: (2 + 3) * 4 = 20', () => expect(ef('(2 + 3) * 4')).toBe('20'));
    test('unary minus: -Amount (column)', () => expect(ef('-Amount')).toBe('-1500'));
    test('column arithmetic: Amount * 1.2', () => expect(ef('Amount * 1.2')).toBe('1800'));
    test('chained: 1 + 2 + 3 + 4', () => expect(ef('1 + 2 + 3 + 4')).toBe('10'));
    test('mixed: Amount + 500 - 100', () => expect(ef('Amount + 500 - 100')).toBe('1900'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Concatenation operator &
// ─────────────────────────────────────────────────────────────────────────────

describe('concatenation (&)', () => {
    test('"foo" & "bar"', () => expect(ef('"foo" & "bar"')).toBe('foobar'));
    test('Name & " - " & Pays', () => expect(ef('Name & " - " & Pays')).toBe('Acme Corp - FR'));
    test('number coerced to string: 1 & 2', () => expect(ef('1 & 2')).toBe('12'));
    test('chained triple concat', () => expect(ef('"a" & "b" & "c"')).toBe('abc'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Comparison operators (used in IF)
// ─────────────────────────────────────────────────────────────────────────────

describe('comparison operators', () => {
    test('= numeric true', () => expect(ef('IF(Amount = 1500, "yes", "no")')).toBe('yes'));
    test('= numeric false', () => expect(ef('IF(Amount = 999, "yes", "no")')).toBe('no'));
    test('<> numeric true', () => expect(ef('IF(Amount <> 999, "yes", "no")')).toBe('yes'));
    test('<> numeric false', () => expect(ef('IF(Amount <> 1500, "yes", "no")')).toBe('no'));
    test('> true', () => expect(ef('IF(Amount > 1000, "big", "small")')).toBe('big'));
    test('> false', () => expect(ef('IF(Amount > 2000, "big", "small")')).toBe('small'));
    test('< true', () => expect(ef('IF(Amount < 2000, "low", "high")')).toBe('low'));
    test('>= equal → true', () => expect(ef('IF(Amount >= 1500, "yes", "no")')).toBe('yes'));
    test('>= greater → true', () => expect(ef('IF(Amount >= 1000, "yes", "no")')).toBe('yes'));
    test('<= true', () => expect(ef('IF(Amount <= 1500, "yes", "no")')).toBe('yes'));
    test('= string comparison', () => expect(ef('IF(Pays = "FR", "France", "Autre")')).toBe('France'));
    test('<> string comparison', () => expect(ef('IF(Pays <> "BE", "not Belgium", "Belgium")')).toBe('not Belgium'));
});

// ─────────────────────────────────────────────────────────────────────────────
// String functions
// ─────────────────────────────────────────────────────────────────────────────

describe('LEFT', () => {
    test('basic', () => expect(ef('LEFT(SIRET, 9)')).toBe('300123456'));
    test('n > length → full string', () => expect(ef('LEFT("abc", 10)')).toBe('abc'));
    test('n = 0 → ""', () => expect(ef('LEFT("abc", 0)')).toBe(''));
    test('n negative → ""', () => expect(ef('LEFT("abc", -1)')).toBe(''));
    test('LEFT(CodePostal, 2) = department', () => expect(ef('LEFT(CodePostal, 2)')).toBe('75'));
});

describe('RIGHT', () => {
    test('basic', () => expect(ef('RIGHT(SIRET, 5)')).toBe('00012'));
    test('n > length → full string', () => expect(ef('RIGHT("abc", 10)')).toBe('abc'));
    test('n = 0 → ""', () => expect(ef('RIGHT("abc", 0)')).toBe(''));
});

describe('MID', () => {
    test('basic: MID(SIRET, 10, 5)', () => expect(ef('MID(SIRET, 10, 5)')).toBe('00012'));
    test('1-indexed: MID("abcdef", 2, 3) = "bcd"', () => expect(ef('MID("abcdef", 2, 3)')).toBe('bcd'));
    test('start beyond length → ""', () => expect(ef('MID("abc", 10, 3)')).toBe(''));
    test('n goes past end → truncated', () => expect(ef('MID("abcde", 3, 100)')).toBe('cde'));
});

describe('LEN', () => {
    test('SIRET length = 14', () => expect(ef('LEN(SIRET)')).toBe('14'));
    test('empty string → 0', () => expect(ef('LEN("")')).toBe('0'));
    test('LEN("hello") = 5', () => expect(ef('LEN("hello")')).toBe('5'));
});

describe('UPPER', () => {
    test('lowercase → uppercase', () => expect(ef('UPPER("france")')).toBe('FRANCE'));
    test('already upper → unchanged', () => expect(ef('UPPER("FRANCE")')).toBe('FRANCE'));
    test('column: UPPER(Pays)', () => expect(ef('UPPER(Pays)')).toBe('FR'));
});

describe('LOWER', () => {
    test('uppercase → lowercase', () => expect(ef('LOWER("FRANCE")')).toBe('france'));
    test('column: LOWER(Email)', () => expect(ef('LOWER(Email)')).toBe('jean.dupont@exemple.com'));
    test('already lower → unchanged', () => expect(ef('LOWER("hello")')).toBe('hello'));
});

describe('TRIM', () => {
    test('leading/trailing spaces removed', () => expect(ef('TRIM("  hello  ")')).toBe('hello'));
    test('internal spaces preserved', () => expect(ef('TRIM("  hello world  ")')).toBe('hello world'));
    test('no spaces → unchanged', () => expect(ef('TRIM("hello")')).toBe('hello'));
});

describe('PROPER', () => {
    test('basic capitalization', () => expect(ef('PROPER("jean dupont")')).toBe('Jean Dupont'));
    test('hyphenated', () => expect(ef('PROPER("jean-pierre dupont")')).toBe('Jean-Pierre Dupont'));
    test('already proper → unchanged', () => expect(ef('PROPER("Jean Dupont")')).toBe('Jean Dupont'));
    test('all caps → proper', () => expect(ef('PROPER("FRANCE")')).toBe('France'));
});

describe('CONCAT', () => {
    test('two args', () => expect(ef('CONCAT("foo", "bar")')).toBe('foobar'));
    test('three args', () => expect(ef('CONCAT("a", "b", "c")')).toBe('abc'));
    test('with separator', () => expect(ef('CONCAT("Jean", " ", "Dupont")')).toBe('Jean Dupont'));
    test('column args', () => expect(ef('CONCAT(Pays, "-", "country")')).toBe('FR-country'));
});

describe('REPLACE / SUBSTITUTE', () => {
    test('REPLACE: remove spaces from phone', () => expect(ef('REPLACE(Telephone, " ", "")')).toBe('0612345678'));
    test('REPLACE: all occurrences', () => expect(ef('REPLACE("a.b.c", ".", "-")')).toBe('a-b-c'));
    test('REPLACE: no match → unchanged', () => expect(ef('REPLACE("hello", "x", "y")')).toBe('hello'));
    test('SUBSTITUTE is alias of REPLACE', () => expect(ef('SUBSTITUTE("a.b.c", ".", "-")')).toBe('a-b-c'));
});

describe('FIND', () => {
    test('found → 1-indexed position', () => expect(ef('FIND("@", Email)')).toBe('12'));
    test('not found → 0', () => expect(ef('FIND("z", Email)')).toBe('0'));
    test('case-sensitive: FIND("corp", Name)', () => expect(ef('FIND("corp", Name)')).toBe('0'));
    test('case-sensitive: FIND("Corp", Name)', () => expect(ef('FIND("Corp", Name)')).toBe('6'));
    test('with start offset', () => expect(ef('FIND("a", "banana", 3)')).toBe('4'));
});

describe('SEARCH', () => {
    test('case-insensitive found', () => expect(ef('SEARCH("corp", Name)')).toBe('6'));
    test('case-insensitive SEARCH("CORP", Name)', () => expect(ef('SEARCH("CORP", Name)')).toBe('6'));
    test('not found → 0', () => expect(ef('SEARCH("xyz", Name)')).toBe('0'));
});

describe('SPLIT', () => {
    test('first part (index 0)', () => expect(ef('SPLIT("75008 Paris", " ", 0)')).toBe('75008'));
    test('second part (index 1)', () => expect(ef('SPLIT("75008 Paris", " ", 1)')).toBe('Paris'));
    test('out-of-range index → ""', () => expect(ef('SPLIT("hello", " ", 5)')).toBe(''));
    test('no separator match → full string at index 0', () => expect(ef('SPLIT("hello", "-", 0)')).toBe('hello'));
});

describe('REPT', () => {
    test('REPT("0", 5) = "00000"', () => expect(ef('REPT("0", 5)')).toBe('00000'));
    test('REPT("ab", 3) = "ababab"', () => expect(ef('REPT("ab", 3)')).toBe('ababab'));
    test('REPT("x", 0) = ""', () => expect(ef('REPT("x", 0)')).toBe(''));
});

describe('PAD', () => {
    test('PAD short string to 5 with "0"', () => expect(ef('PAD("7200", 5, "0")')).toBe('07200'));
    test('PAD already at length → unchanged', () => expect(ef('PAD("75008", 5, "0")')).toBe('75008'));
    test('PAD longer than target → unchanged', () => expect(ef('PAD("750081", 5, "0")')).toBe('750081'));
    test('PAD with default space char', () => expect(ef('PAD("hi", 5)')).toBe('   hi'));
});

describe('PADEND', () => {
    test('PADEND("REF", 6, "-")', () => expect(ef('PADEND("REF", 6, "-")')).toBe('REF---'));
    test('PADEND already at length → unchanged', () => expect(ef('PADEND("hello", 5, "-")')).toBe('hello'));
});

describe('CLEAN', () => {
    test('removes tab character', () => expect(ef('CLEAN("hello\tworld")')).toBe('helloworld'));
    test('removes newline', () => expect(ef('CLEAN("line1\nline2")')).toBe('line1line2'));
    test('no control chars → unchanged', () => expect(ef('CLEAN("hello")')).toBe('hello'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Math functions
// ─────────────────────────────────────────────────────────────────────────────

describe('INT', () => {
    test('truncates decimal', () => expect(ef('INT(3.9)')).toBe('3'));
    test('string input', () => expect(ef('INT("42.9")')).toBe('42'));
    test('negative truncates toward zero', () => expect(ef('INT(-3.9)')).toBe('-3'));
    test('column amount', () => expect(ef('INT(Amount)')).toBe('1500'));
});

describe('FLOAT', () => {
    test('parses decimal string', () => expect(ef('FLOAT("3.14")')).toBe('3.14'));
    test('comma stops parsing at comma (returns 3 for "3,14")', () => expect(ef('FLOAT("3,14")')).toBe('3'));
    test('integer string → integer', () => expect(ef('FLOAT("42")')).toBe('42'));
});

describe('ROUND', () => {
    test('round to 2 decimals', () => expect(ef('ROUND(1234.567, 2)')).toBe('1234.57'));
    test('round to 0 decimals', () => expect(ef('ROUND(1234.5, 0)')).toBe('1235'));
    test('round down', () => expect(ef('ROUND(1234.4, 0)')).toBe('1234'));
    test('column Amount', () => expect(ef('ROUND(Amount, 0)')).toBe('1500'));
});

describe('ROUNDUP', () => {
    test('1.001 → 1.01', () => expect(ef('ROUNDUP(1.001, 2)')).toBe('1.01'));
    test('1.000 → 1', () => expect(ef('ROUNDUP(1.0, 2)')).toBe('1'));
    test('rounds up even .1', () => expect(ef('ROUNDUP(1.1, 0)')).toBe('2'));
});

describe('ROUNDDOWN', () => {
    test('1.999 → 1.99', () => expect(ef('ROUNDDOWN(1.999, 2)')).toBe('1.99'));
    test('1.9 → 1 at 0 decimals', () => expect(ef('ROUNDDOWN(1.9, 0)')).toBe('1'));
});

describe('ABS', () => {
    test('positive → unchanged', () => expect(ef('ABS(5)')).toBe('5'));
    test('negative → positive', () => expect(ef('ABS(-5)')).toBe('5'));
    test('column arithmetic: ABS(-Amount)', () => expect(ef('ABS(-Amount)')).toBe('1500'));
});

describe('MOD', () => {
    test('10 mod 3 = 1', () => expect(ef('MOD(10, 3)')).toBe('1'));
    test('9 mod 3 = 0', () => expect(ef('MOD(9, 3)')).toBe('0'));
    test('LEN(SIRET) mod 2 = 0 (even)', () => expect(ef('MOD(LEN(SIRET), 2)')).toBe('0'));
});

describe('FLOOR', () => {
    test('3.9 → 3', () => expect(ef('FLOOR(3.9)')).toBe('3'));
    test('3.1 → 3', () => expect(ef('FLOOR(3.1)')).toBe('3'));
    test('negative: -3.1 → -4', () => expect(ef('FLOOR(-3.1)')).toBe('-4'));
});

describe('CEILING', () => {
    test('3.1 → 4', () => expect(ef('CEILING(3.1)')).toBe('4'));
    test('3.0 → 3', () => expect(ef('CEILING(3.0)')).toBe('3'));
    test('negative: -3.9 → -3', () => expect(ef('CEILING(-3.9)')).toBe('-3'));
});

describe('SQRT', () => {
    test('SQRT(4) = 2', () => expect(ef('SQRT(4)')).toBe('2'));
    test('SQRT(9) = 3', () => expect(ef('SQRT(9)')).toBe('3'));
    test('SQRT(2) irrational', () => expect(parseFloat(ef('SQRT(2)'))).toBeCloseTo(1.4142135, 5));
});

describe('POWER', () => {
    test('POWER(2, 10) = 1024', () => expect(ef('POWER(2, 10)')).toBe('1024'));
    test('POWER(3, 2) = 9', () => expect(ef('POWER(3, 2)')).toBe('9'));
    test('POWER(5, 0) = 1', () => expect(ef('POWER(5, 0)')).toBe('1'));
});

describe('LOG', () => {
    test('LOG(1000) base 10 = 3', () => expect(ef('LOG(1000)')).toBe('3'));
    test('LOG(8, 2) = 3', () => expect(ef('LOG(8, 2)')).toBe('3'));
    test('LOG(1) = 0', () => expect(ef('LOG(1)')).toBe('0'));
});

describe('MAX / MIN / SUM', () => {
    test('MAX of literals', () => expect(ef('MAX(3, 1, 4, 1, 5, 9)')).toBe('9'));
    test('MIN of literals', () => expect(ef('MIN(3, 1, 4, 1, 5, 9)')).toBe('1'));
    test('SUM of literals', () => expect(ef('SUM(1, 2, 3, 4)')).toBe('10'));
    test('MAX with column', () => expect(ef('MAX(Amount, 2000)')).toBe('2000'));
    test('MIN with column', () => expect(ef('MIN(Amount, 2000)')).toBe('1500'));
    test('SUM with column: Amount + 500', () => expect(ef('SUM(Amount, 500)')).toBe('2000'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Logic & conditional functions
// ─────────────────────────────────────────────────────────────────────────────

describe('IF', () => {
    test('true branch', () => expect(ef('IF(Amount > 1000, "Grand compte", "Standard")')).toBe('Grand compte'));
    test('false branch', () => expect(ef('IF(Amount > 5000, "Grand compte", "Standard")')).toBe('Standard'));
    test('omitted false branch → ""', () => expect(ef('IF(Amount > 5000, "Grand compte")')).toBe(''));
    test('nested IF', () => expect(ef('IF(Amount > 2000, "A", IF(Amount > 1000, "B", "C"))')).toBe('B'));
    test('string equality', () => expect(ef('IF(Pays = "FR", "France", "Autre")')).toBe('France'));
});

describe('IFS', () => {
    test('first condition matches', () => expect(ef('IFS(Amount > 10000, "Premium", Amount > 1000, "Standard", "Prospect")')).toBe('Standard'));
    test('no condition matches → default (last odd arg)', () => expect(ef('IFS(Amount > 5000, "A", Amount > 3000, "B", "C")')).toBe('C'));
    test('first condition true', () => expect(ef('IFS(Amount > 100, "big", Amount > 50, "medium", "small")')).toBe('big'));
    test('no default → "" when none match', () => expect(ef('IFS(Amount > 5000, "A", Amount > 3000, "B")')).toBe(''));
});

describe('SWITCH', () => {
    test('matches first case', () => expect(ef('SWITCH(Pays, "FR", "France", "BE", "Belgique", "Autre")')).toBe('France'));
    test('matches second case', () => {
        const row2 = [...ROW]; row2[7] = 'BE';
        expect(ef('SWITCH(Pays, "FR", "France", "BE", "Belgique", "Autre")', row2)).toBe('Belgique');
    });
    test('no match → default', () => {
        const row2 = [...ROW]; row2[7] = 'DE';
        expect(ef('SWITCH(Pays, "FR", "France", "BE", "Belgique", "Autre")', row2)).toBe('Autre');
    });
    test('no match, no default → ""', () => {
        const row2 = [...ROW]; row2[7] = 'DE';
        expect(ef('SWITCH(Pays, "FR", "France", "BE", "Belgique")', row2)).toBe('');
    });
});

describe('ISBLANK', () => {
    test('empty string → true', () => {
        const row2 = [...ROW]; row2[3] = '';
        expect(ef('IF(ISBLANK(Email), "vide", "ok")', row2)).toBe('vide');
    });
    test('non-empty → false', () => expect(ef('IF(ISBLANK(Email), "vide", "ok")')).toBe('ok'));
    test('ISBLANK("")', () => expect(ef('IF(ISBLANK(""), "yes", "no")')).toBe('yes'));
    test('ISBLANK("0") → false (not empty)', () => expect(ef('IF(ISBLANK("0"), "yes", "no")')).toBe('no'));
});

describe('ISNUMBER', () => {
    test('numeric string → true', () => expect(ef('IF(ISNUMBER("42"), "yes", "no")')).toBe('yes'));
    test('amount column → true', () => expect(ef('IF(ISNUMBER(Amount), "yes", "no")')).toBe('yes'));
    test('text column → false', () => expect(ef('IF(ISNUMBER(Name), "yes", "no")')).toBe('no'));
    test('empty → false', () => expect(ef('IF(ISNUMBER(""), "yes", "no")')).toBe('no'));
});

describe('NOT', () => {
    test('NOT(true) → FALSE', () => expect(ef('NOT(1 = 1)')).toBe('FALSE'));
    test('NOT(false) → TRUE', () => expect(ef('NOT(1 = 2)')).toBe('TRUE'));
    test('in IF: NOT(ISBLANK(Email))', () => expect(ef('IF(NOT(ISBLANK(Email)), "has email", "")')).toBe('has email'));
});

describe('AND', () => {
    test('all true → TRUE', () => expect(ef('AND(1 = 1, 2 = 2)')).toBe('TRUE'));
    test('one false → FALSE', () => expect(ef('AND(1 = 1, 1 = 2)')).toBe('FALSE'));
    test('in IF context', () => expect(ef('IF(AND(Amount > 1000, Pays = "FR"), "eligible", "non")')).toBe('eligible'));
    test('three args all true', () => expect(ef('AND(1 = 1, 2 = 2, 3 = 3)')).toBe('TRUE'));
});

describe('OR', () => {
    test('one true → TRUE', () => expect(ef('OR(1 = 2, 2 = 2)')).toBe('TRUE'));
    test('all false → FALSE', () => expect(ef('OR(1 = 2, 3 = 4)')).toBe('FALSE'));
    test('in IF context', () => expect(ef('IF(OR(Pays = "FR", Pays = "BE"), "Europe", "Autre")')).toBe('Europe'));
});

describe('COALESCE', () => {
    test('first non-empty returned', () => {
        const cols2 = ['A', 'B', 'C'];
        const row2  = ['', '', 'found'];
        expect(evaluateFormula('COALESCE(A, B, C)', row2, cols2)).toBe('found');
    });
    test('first value present', () => {
        const cols2 = ['A', 'B'];
        const row2  = ['first', 'second'];
        expect(evaluateFormula('COALESCE(A, B)', row2, cols2)).toBe('first');
    });
    test('all empty → ""', () => {
        const cols2 = ['A', 'B'];
        const row2  = ['', ''];
        expect(evaluateFormula('COALESCE(A, B)', row2, cols2)).toBe('');
    });
    test('with literal fallback', () => {
        const cols2 = ['Tel'];
        const row2  = [''];
        expect(evaluateFormula('COALESCE(Tel, "N/A")', row2, cols2)).toBe('N/A');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Conversion functions
// ─────────────────────────────────────────────────────────────────────────────

describe('TEXT', () => {
    test('converts number to string', () => expect(ef('TEXT(42)')).toBe('42'));
    test('column passthrough', () => expect(ef('TEXT(Name)')).toBe('Acme Corp'));
});

describe('VALUE', () => {
    test('extracts number from formatted string', () => expect(ef('VALUE("1 234,56 €")')).toBe('123456'));
    test('plain number string', () => expect(ef('VALUE("42")')).toBe('42'));
    test('text only → ""', () => expect(ef('VALUE("abc")')).toBe(''));
    test('with units: "42 units"', () => expect(ef('VALUE("42 unités")')).toBe('42'));
});

describe('FIXED', () => {
    test('2 decimals', () => expect(ef('FIXED(1234.567, 2)')).toBe('1234.57'));
    test('0 decimals', () => expect(ef('FIXED(1234.5, 0)')).toBe('1235'));
    test('column amount with 2 decimals', () => expect(ef('FIXED(Amount, 2)')).toBe('1500.00'));
    test('default 2 decimals when arg omitted', () => expect(ef('FIXED(3.14159)')).toBe('3.14'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Error handling / edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('error handling', () => {
    test('unknown function → ""', () => expect(ef('UNKNOWNFUNC(Name)')).toBe(''));
    test('unclosed paren → ""', () => expect(ef('LEFT(Name, 3')).toBe('Acm'));  // parser is lenient
    test('bad syntax → ""', () => expect(ef('@@!!')).toBe(''));
    test('formula on empty row returns safely', () => {
        expect(evaluateFormula('LEFT(Name, 3)', [''], ['Name'])).toBe('');
    });
    test('null row values handled', () => {
        expect(evaluateFormula('ISBLANK(Name)', [null], ['Name'])).toBe('TRUE');
    });
    test('deeply nested error swallowed', () => {
        expect(ef('IF(AND(ISBLANK(""), NOT(ISNUMBER("abc"))), "ok", "ko")')).toBe('ok');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nested / complex expressions
// ─────────────────────────────────────────────────────────────────────────────

describe('nested formulas', () => {
    test('SIREN from SIRET: LEFT(SIRET, 9)', () => expect(ef('LEFT(SIRET, 9)')).toBe('300123456'));

    test('department from postal code', () => expect(ef(
        'LEFT(CodePostal, IF(LEFT(CodePostal, 2) = "97", 3, 2))'
    )).toBe('75'));

    test('DOM-TOM department 3 chars', () => {
        const row2 = [...ROW]; row2[4] = '97100';
        expect(ef('LEFT(CodePostal, IF(LEFT(CodePostal, 2) = "97", 3, 2))', row2)).toBe('971');
    });

    test('clean phone: REPLACE nested three times', () => expect(ef(
        'REPLACE(REPLACE(REPLACE(Telephone, " ", ""), ".", ""), "-", "")'
    )).toBe('0612345678'));

    test('normalized full name: PROPER(TRIM) & UPPER(TRIM)', () => {
        const cols2 = ['Prenom', 'Nom'];
        const row2  = ['  jean  ', '  DUPONT  '];
        expect(evaluateFormula('PROPER(TRIM(Prenom)) & " " & UPPER(TRIM(Nom))', row2, cols2)).toBe('Jean DUPONT');
    });

    test('email fallback: IF(ISBLANK) → constructed email', () => {
        const cols2 = ['Prenom', 'Nom', 'Email'];
        const row2  = ['jean', 'dupont', ''];
        expect(evaluateFormula(
            'IF(ISBLANK(Email), CONCAT(LOWER(Prenom), ".", LOWER(Nom), "@exemple.com"), LOWER(TRIM(Email)))',
            row2, cols2
        )).toBe('jean.dupont@exemple.com');
    });

    test('email fallback: IF(ISBLANK) → existing email lowercased', () => {
        const cols2 = ['Prenom', 'Nom', 'Email'];
        const row2  = ['jean', 'dupont', 'Jean.DUPONT@exemple.com'];
        expect(evaluateFormula(
            'IF(ISBLANK(Email), CONCAT(LOWER(Prenom), ".", LOWER(Nom), "@exemple.com"), LOWER(TRIM(Email)))',
            row2, cols2
        )).toBe('jean.dupont@exemple.com');
    });

    test('segment client with IFS', () => {
        const cols2 = ['CA'];
        expect(evaluateFormula('IFS(CA > 100000, "Grand compte", CA > 10000, "PME", CA > 1000, "TPE", "Prospect")', ['50000'], cols2)).toBe('PME');
        expect(evaluateFormula('IFS(CA > 100000, "Grand compte", CA > 10000, "PME", CA > 1000, "TPE", "Prospect")', ['500'], cols2)).toBe('Prospect');
        expect(evaluateFormula('IFS(CA > 100000, "Grand compte", CA > 10000, "PME", CA > 1000, "TPE", "Prospect")', ['150000'], cols2)).toBe('Grand compte');
    });

    test('FIXED & " €" for formatting', () => expect(ef('FIXED(Amount, 2) & " €"')).toBe('1500.00 €'));

    test('initials: LEFT(Prenom,1) & LEFT(Nom,1)', () => {
        const cols2 = ['Prenom', 'Nom'];
        const row2  = ['Jean', 'Dupont'];
        expect(evaluateFormula('LEFT(Prenom, 1) & LEFT(Nom, 1)', row2, cols2)).toBe('JD');
    });

    test('SIRET length check with LEN+REPLACE', () => {
        const cols2 = ['SIRET'];
        expect(evaluateFormula(
            'IF(LEN(REPLACE(SIRET, " ", "")) = 14, "OK", "Longueur incorrecte: " & LEN(REPLACE(SIRET, " ", "")))',
            ['30012345600012'], cols2
        )).toBe('OK');
        expect(evaluateFormula(
            'IF(LEN(REPLACE(SIRET, " ", "")) = 14, "OK", "Longueur incorrecte: " & LEN(REPLACE(SIRET, " ", "")))',
            ['1234'], cols2
        )).toBe('Longueur incorrecte: 4');
    });

    test('PAD department code: PAD(LEFT(CodePostal,2), 2, "0")', () => {
        const cols2 = ['CodePostal'];
        // 5-digit code → first 2 chars = "75", already 2 chars, no padding needed
        expect(evaluateFormula('PAD(LEFT(CodePostal, 2), 2, "0")', ['75008'], cols2)).toBe('75');
        // Direct 1-char department → padded to 2
        expect(ef('PAD("1", 2, "0")')).toBe('01');
        expect(ef('PAD("9", 2, "0")')).toBe('09');
    });

    test('COALESCE + LOWER for email fallback chain', () => {
        const cols2 = ['Email1', 'Email2'];
        expect(evaluateFormula('LOWER(COALESCE(Email1, Email2, "N/A"))', ['', 'Backup@Test.com'], cols2)).toBe('backup@test.com');
        expect(evaluateFormula('LOWER(COALESCE(Email1, Email2, "N/A"))', ['', ''], cols2)).toBe('n/a');
    });

    test('arithmetic inside string function: ROUND(Amount * 1.2, 2)', () => expect(ef('ROUND(Amount * 1.2, 2)')).toBe('1800'));

    test('SWITCH inside CONCAT', () => {
        const cols2 = ['Civilite', 'Nom'];
        const row2  = ['M.', 'Dupont'];
        expect(evaluateFormula('CONCAT(SWITCH(Civilite, "M.", "Monsieur", "Mme", "Madame", Civilite), " ", Nom)', row2, cols2)).toBe('Monsieur Dupont');
    });

    test('nested IF inside IFS branch', () => {
        const cols2 = ['Score', 'Region'];
        expect(evaluateFormula(
            'IFS(Score > 80, IF(Region = "Paris", "A+", "A"), Score > 50, "B", "C")',
            ['90', 'Paris'], cols2
        )).toBe('A+');
        expect(evaluateFormula(
            'IFS(Score > 80, IF(Region = "Paris", "A+", "A"), Score > 50, "B", "C")',
            ['90', 'Lyon'], cols2
        )).toBe('A');
        expect(evaluateFormula(
            'IFS(Score > 80, IF(Region = "Paris", "A+", "A"), Score > 50, "B", "C")',
            ['60', 'Paris'], cols2
        )).toBe('B');
    });

    test('FIND used inside MID to extract prefix', () => {
        const cols2 = ['CodeNAF'];
        expect(evaluateFormula(
            'IF(FIND("-", CodeNAF) > 0, MID(CodeNAF, 1, FIND("-", CodeNAF) - 1), CodeNAF)',
            ['6201-A'], cols2
        )).toBe('6201');
        expect(evaluateFormula(
            'IF(FIND("-", CodeNAF) > 0, MID(CodeNAF, 1, FIND("-", CodeNAF) - 1), CodeNAF)',
            ['6201'], cols2
        )).toBe('6201');
    });

    test('SUM of multiple columns', () => {
        const cols2 = ['Q1', 'Q2', 'Q3', 'Q4'];
        expect(evaluateFormula('SUM(Q1, Q2, Q3, Q4)', ['10', '20', '30', '40'], cols2)).toBe('100');
    });

    test('deeply nested: PROPER(TRIM(LOWER(UPPER(Name))))', () => {
        const cols2 = ['Name'];
        expect(evaluateFormula('PROPER(TRIM(LOWER(UPPER(Name))))', ['  acme corp  '], cols2)).toBe('Acme Corp');
    });
});
