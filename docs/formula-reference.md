# Formula Reference — Data Workbench

Formulas are available in **Computed Columns** of a Transform result, via the **Formula** tab.

## Basic syntax

```
LEFT(SIRET, 9)
CONCAT(FirstName, " ", LastName)
IF(ISBLANK(Email), "N/A", LOWER(Email))
ROUND(Amount * 1.2, 2)
```

**Column references** — write the column name directly (case-insensitive):
```
UPPER(account_name)   → value of "account_name" in uppercase
LEN(SIRET)            → length of SIRET
```

**Columns with spaces or accented characters** — wrap in square brackets:
```
[Company Name]
[Prénom Client]
CONCAT([First Name], " ", [Last Name])
```

**Literals** — strings in single or double quotes, numbers without quotes:
```
"hello"   'world'   42   3.14
```

**Arithmetic operators**: `+` `-` `*` `/`  
**Concatenation**: `&` (or `CONCAT()`)  
**Comparisons**: `=` `<>` `>` `<` `>=` `<=` — used inside `IF()`

---

## Text functions

### `LEFT(text, n)`
Extracts the **first n** characters.
```
LEFT(SIRET, 9)          → "300123456"  (first 9 digits = SIREN)
LEFT(PostalCode, 2)     → "75"         (department code)
```

### `RIGHT(text, n)`
Extracts the **last n** characters.
```
RIGHT(SIRET, 5)         → "00012"  (establishment number)
RIGHT(IBAN, 2)          → "47"
```

### `MID(text, start, n)`
Extracts **n** characters starting at position **start** (1-indexed).
```
MID(SIRET, 10, 5)       → "00012"  (characters 10 to 14)
MID(Phone, 2, 9)        → strips the leading 0
```

### `LEN(text)`
Length of the string.
```
LEN(SIRET)              → 14
IF(LEN(PostalCode) < 5, PAD(PostalCode, 5, "0"), PostalCode)
```

### `UPPER(text)`
Converts to **uppercase**.
```
UPPER(Country)          → "FRANCE"
```

### `LOWER(text)`
Converts to **lowercase**.
```
LOWER(Email)            → "jean.dupont@example.com"
```

### `TRIM(text)`
Removes leading and trailing spaces.
```
TRIM(Name)              → "Dupont"  (no stray spaces)
```

### `PROPER(text)`
Capitalises the **first letter of each word**.
```
PROPER("jean-pierre dupont")  → "Jean-Pierre Dupont"
```

### `CONCAT(text1, text2, ...)`
Concatenates multiple values. Equivalent to `&`.
```
CONCAT(FirstName, " ", LastName)    → "Jean Dupont"
FirstName & " " & LastName          → same
```

### `REPLACE(text, search, replacement)`
Replaces **all occurrences** of a substring.
```
REPLACE(Phone, " ", "")         → removes spaces from phone number
REPLACE(SIRET, ".", "")         → removes dots
```

### `SUBSTITUTE(text, search, replacement)`
Alias of `REPLACE`.

### `FIND(search, in, [start])`
Returns the **position** (1-indexed) of the first occurrence. Returns 0 if not found. Case-sensitive.
```
FIND("@", Email)                → position of @ in the email
IF(FIND("-", NAFCode) > 0, MID(NAFCode, 1, FIND("-", NAFCode) - 1), NAFCode)
```

### `SEARCH(search, in, [start])`
Like `FIND` but **case-insensitive**.
```
SEARCH("sarl", LegalForm)       → matches "SARL", "sarl", "Sarl"
```

### `SPLIT(text, separator, index)`
Splits text on the separator and returns the element at the given index (0-indexed).
```
SPLIT("75008 Paris", " ", 0)    → "75008"
SPLIT("75008 Paris", " ", 1)    → "Paris"
SPLIT(FullName, " ", 0)         → first word (first name)
```

### `REPT(text, n)`
Repeats text n times.
```
REPT("0", 5)                    → "00000"
```

### `PAD(text, length, [char])`
Left-pads to the target length (default pad character: space).
```
PAD(PostalCode, 5, "0")         → "07200" if the code is "7200"
PAD(Department, 2, "0")         → "01", "02", ... "75"
```

### `PADEND(text, length, [char])`
Like `PAD` but pads on the **right**.
```
PADEND(Ref, 10, "-")            → "REF001----"
```

### `CLEAN(text)`
Removes control characters (tabs, line breaks, etc.).
```
CLEAN(Description)
```

### `COUNT(text, search, [caseSensitive=true])`
Counts the number of occurrences of a string inside another string. Case-sensitive by default; pass `false` as third argument to ignore case.
```
COUNT(Description, "urgent")         → number of times "urgent" appears
COUNT(Tags, ",") + 1                 → number of comma-separated values
COUNT(Name, "dupont", false)         → matches "Dupont", "DUPONT", "dupont"
```

---

## Math functions

### `INT(value)`
Truncates toward zero (integer part).
```
INT("42.9")     → 42
INT(Amount)     → amount without decimals
```

### `FLOAT(value)`
Converts to a decimal number.
```
FLOAT("3.14")   → 3.14
FLOAT("3,14")   → 3  (comma stops parsing — use VALUE() for locale formats)
```

### `ROUND(value, decimals)`
Rounds to the specified number of decimal places.
```
ROUND(Amount, 2)        → 1234.57
ROUND(Amount, 0)        → 1235
```

### `ROUNDUP(value, decimals)`
Rounds **up** (ceiling toward positive infinity).
```
ROUNDUP(1.001, 2)       → 1.01
```

### `ROUNDDOWN(value, decimals)`
Rounds **down** (truncates).
```
ROUNDDOWN(1.999, 2)     → 1.99
```

### `ABS(value)`
Absolute value.
```
ABS(Delta)              → always positive
```

### `MOD(value, divisor)`
Remainder of euclidean division.
```
MOD(LEN(SIRET), 2)      → 0 if length is even
MOD(Quantity, 12)       → remaining units in incomplete boxes
```

### `FLOOR(value)`
Rounds down to the nearest integer.
```
FLOOR(3.9)              → 3
```

### `CEILING(value)`
Rounds up to the nearest integer.
```
CEILING(3.1)            → 4
```

### `SQRT(value)`
Square root.
```
SQRT(Surface)
```

### `POWER(base, exponent)`
Exponentiation.
```
POWER(2, 10)            → 1024
```

### `LOG(value, [base])`
Logarithm (base 10 by default).
```
LOG(1000)               → 3
LOG(8, 2)               → 3
```

### `MAX(val1, val2, ...)`
Maximum of several values.
```
MAX(Q1, Q2, Q3, Q4)
```

### `MIN(val1, val2, ...)`
Minimum.
```
MIN(Stock, Order)
```

### `SUM(val1, val2, ...)`
Sum of several values.
```
SUM(Q1, Q2, Q3, Q4)
```

### `AVERAGE(val1, val2, ...)`
Arithmetic mean of several values.
```
AVERAGE(Q1, Q2, Q3, Q4)
AVERAGE(Score1, Score2)
```

### `NUMBER(text)`
Strict number parse — returns `""` if the value is not a valid number (unlike `VALUE` which strips non-numeric characters first).
```
NUMBER("42.5")      → 42.5
NUMBER("€1234")     → ""    (contains non-numeric prefix)
NUMBER("")          → ""
IF(NUMBER(Amount) = "", "Invalid", Amount * 1.2)
```

---

## Logic & conditional functions

### `IF(condition, if_true, [if_false])`
Simple condition. If `if_false` is omitted, returns `""`.
```
IF(ISBLANK(Email), "unknown", Email)
IF(Amount > 1000, "Key account", "Standard")
IF(LEN(SIRET) = 14, "OK", "Invalid SIRET")
```

### `IFS(cond1, val1, cond2, val2, ..., [default])`
Chains multiple conditions. Returns the value for the first truthy test. A trailing odd argument is the default.
```
IFS(
  Amount > 10000, "Premium",
  Amount > 1000,  "Standard",
  "Prospect"
)
```

### `SWITCH(value, case1, result1, case2, result2, ..., [default])`
Compares a value against several cases.
```
SWITCH(Country, "FR", "France", "BE", "Belgium", "CH", "Switzerland", "Other")
SWITCH(Title, "Mr", "Mister", "Ms", "Miss", Title)
```

### `ISBLANK(value)`
Returns `TRUE` if the value is empty (`""`).
```
IF(ISBLANK(Phone), "No phone", Phone)
IF(ISBLANK(Revenue), "0", Revenue)
```

### `ISNUMBER(value)`
Returns `TRUE` if the value can be parsed as a number.
```
IF(ISNUMBER(PostalCode), "Numeric", "Alphanumeric")
```

### `NOT(value)`
Inverts a boolean.
```
IF(NOT(ISBLANK(Email)), LOWER(Email), "")
```

### `AND(val1, val2, ...)`
True if **all** values are true.
```
IF(AND(ISNUMBER(SIRET), LEN(SIRET) = 14), "Valid SIRET", "invalid")
```

### `OR(val1, val2, ...)`
True if **at least one** value is true.
```
IF(OR(ISBLANK(Name), ISBLANK(FirstName)), "Missing data", "OK")
```

### `COALESCE(val1, val2, ...)`
Returns the **first non-empty** value.
```
COALESCE(MobilePhone, LandlinePhone, "No phone")
COALESCE(WorkEmail, PersonalEmail)
```

---

## Date functions

Dates are represented as **ISO 8601 strings** (`YYYY-MM-DD` or full datetime `YYYY-MM-DDTHH:MM:SS.sssZ`).  
The parser accepts most common formats: ISO, Salesforce datetimes, and European `DD/MM/YYYY`.  
Comparison operators (`>`, `<`, `=`, …) work correctly on ISO date strings.

> **⚠ Date literals must be quoted.** An unquoted value like `2021-01-01` is evaluated as arithmetic (`2021 − 1 − 1 = 2019`). Always wrap date literals in quotes:
> ```
> {{Subscription Date}} > "2021-01-01"          ✓
> DATEVALUE({{CloseDate}}) >= "2024-06-01"      ✓
> {{Subscription Date}} > 2021-01-01            ✗  (evaluates to > 2019)
> ```

### `DATEVALUE(text)`
Parses a date string and returns it normalised to `YYYY-MM-DD`. Returns `""` if the text is not a valid date.
```
DATEVALUE("2024-01-15")              → "2024-01-15"
DATEVALUE("15/01/2024")              → "2024-01-15"
DATEVALUE("2024-01-15T10:30:00Z")   → "2024-01-15"
DATEVALUE("not a date")             → ""
```

### `DATETIMEVALUE(text)`
Parses a date/datetime string and returns it as a full ISO datetime. Returns `""` if invalid.
```
DATETIMEVALUE("2024-01-15T10:30:00Z")  → "2024-01-15T10:30:00.000Z"
DATETIMEVALUE("2024-01-15")            → "2024-01-15T00:00:00.000Z"
```

### `ISDATE(text)`
Returns `TRUE` if the value can be parsed as a date, `FALSE` otherwise.
```
ISDATE(CloseDate)
IF(ISDATE(StartDate), DATE_ADD(StartDate, 30, "day"), "")
```

### `TODAY()`
Returns the current date as `YYYY-MM-DD` (UTC).
```
TODAY()
DATE_DIFF(TODAY(), CreatedDate, "day")
```

### `NOW()`
Returns the current datetime as an ISO string (UTC).
```
NOW()
```

### `YEAR(date)` / `MONTH(date)` / `DAY(date)`
Extract the year, month (1–12), or day (1–31) from a date.
```
YEAR(CloseDate)
MONTH(CreatedDate)
DAY(BirthDate)
```

### `HOUR(date)` / `MINUTE(date)`
Extract the hour (0–23) or minute (0–59) from a datetime.
```
HOUR(LastModifiedDate)
MINUTE(LastModifiedDate)
```

### `DATE_ADD(date, n, unit)`
Adds `n` units to a date. `unit` can be `"day"` (default), `"month"`, or `"year"`.
```
DATE_ADD(CloseDate, 30, "day")       → 30 days later
DATE_ADD(StartDate, 3, "month")      → 3 months later
DATE_ADD(ContractDate, 1, "year")    → 1 year later
DATE_ADD(ExpiryDate, -7, "day")      → 7 days earlier
```

### `DATE_DIFF(date1, date2, unit)`
Returns `date1 − date2` in the given unit (`"day"` default, `"month"`, `"year"`).  
Positive = date1 is after date2.
```
DATE_DIFF(TODAY(), CreatedDate, "day")    → age in days
DATE_DIFF(CloseDate, TODAY(), "month")    → months until close
DATE_DIFF(EndDate, StartDate, "year")     → contract duration in years
```

### `DATE_FORMAT(date, format)`
Formats a date using a pattern string. Tokens: `YYYY`, `YY`, `MM`, `DD`, `HH`, `mm`, `SS`.
```
DATE_FORMAT(CloseDate, "DD/MM/YYYY")          → "15/01/2024"
DATE_FORMAT(CreatedDate, "YYYY-MM")           → "2024-01"
DATE_FORMAT(LastModifiedDate, "DD/MM/YYYY HH:mm")  → "15/01/2024 10:30"
```

---

## Conversion functions

### `TEXT(value)`
Explicitly converts to text (usually unnecessary as values are already strings).
```
TEXT(Amount)
```

### `VALUE(text)`
Extracts the number from a string by stripping non-numeric characters.
```
VALUE("1 234.56 €")    → 123456  (strips spaces, period, €)
VALUE("42 units")      → 42
```

### `FIXED(value, [decimals])`
Formats a number with a fixed number of decimal places (returns a **string**).
```
FIXED(Amount, 2)        → "1234.57"
FIXED(Amount, 0)        → "1235"
```

---

## Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `+` | Addition | `Amount + Tax` |
| `-` | Subtraction | `PriceIncl - PriceExcl` |
| `*` | Multiplication | `Quantity * UnitPrice` |
| `/` | Division (returns `""` if divisor = 0) | `Revenue / Headcount` |
| `&` | Text concatenation | `FirstName & " " & LastName` |
| `=` | Equality | `IF(Country = "FR", ...)` |
| `<>` | Not equal | `IF(Status <> "Active", ...)` |
| `>` | Greater than | `IF(Amount > 1000, ...)` |
| `<` | Less than | `IF(Stock < 0, ...)` |
| `>=` | Greater than or equal | `IF(Score >= 3, ...)` |
| `<=` | Less than or equal | `IF(Age <= 18, ...)` |

---

## Practical examples

```
# Extract SIREN from SIRET
LEFT(SIRET, 9)

# Department code from postal code (handles DOM-TOM 971–976)
LEFT(PostalCode, IF(LEFT(PostalCode, 2) = "97", 3, 2))

# Normalised full name
PROPER(TRIM(FirstName)) & " " & UPPER(TRIM(LastName))

# Email with fallback
IF(ISBLANK(Email), CONCAT(LOWER(FirstName), ".", LOWER(LastName), "@example.com"), LOWER(TRIM(Email)))

# Customer segment
IFS(Revenue > 100000, "Enterprise", Revenue > 10000, "SMB", Revenue > 1000, "SME", "Prospect")

# Clean a phone number
REPLACE(REPLACE(REPLACE(Phone, " ", ""), ".", ""), "-", "")

# Format an amount
FIXED(Amount, 2) & " €"

# Initials (first letter of first and last name)
LEFT(FirstName, 1) & LEFT(LastName, 1)

# Validate SIRET length
IF(LEN(REPLACE(SIRET, " ", "")) = 14, "OK", "Wrong length: " & LEN(REPLACE(SIRET, " ", "")))

# Columns with spaces or accented characters
CONCAT([First Name], " ", [Last Name])
IF([Company Name] = "", "Unknown", UPPER([Company Name]))

# Age of a deal in days
DATE_DIFF(TODAY(), CreatedDate, "day") & " days"

# Fiscal quarter from a close date
"Q" & INT((MONTH(CloseDate) - 1) / 3 + 1) & " " & YEAR(CloseDate)

# Format Salesforce datetime to European date
DATE_FORMAT(DATEVALUE(CreatedDate), "DD/MM/YYYY")

# Renewal date = contract start + 1 year
DATE_ADD(DATEVALUE([Contract Start]), 1, "year")

# Flag deals closing within 30 days
IF(DATE_DIFF(CloseDate, TODAY(), "day") <= 30, "Closing soon", "")

# Safe number multiplication (skip blank cells)
IF(ISNUMBER(Amount), Amount * 1.2, "")
```

---

## Notes

- **Column names** are case-insensitive: `siret`, `SIRET`, and `Siret` are equivalent.
- **Columns with spaces or special characters** (accents, hyphens…) must be wrapped in square brackets: `[Company Name]`, `[Prénom]`.
- All values in tables are **strings** — math functions convert automatically (`"42"` → `42`).
- A syntax error or reference to a non-existent column silently returns `""`.
- **Division by zero** returns `""`.
- The **preview** in the interface evaluates the formula against the first row of the source table.
