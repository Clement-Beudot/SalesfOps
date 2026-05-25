# Data Workbench [BETA]

The Data Workbench is a lightweight data manipulation tool built into SalesfOps. It lets you load tables from spreadsheets or Salesforce SOQL queries, then combine and transform them without leaving the app.

> ⚠️ The Data Workbench is currently under development and testing. There are many scenarios and combinations to test (action sequences, nested formulas). Please let me know if you notice any unexpected behavior. It is not initially designed to handle large volumes of data (millions of records).

---

## Enabling the Data Workbench

1. Open **Settings** (from the tray menu).
2. Click the **Workbench** tab.
3. Enable **Data Workbench** and click **Save Settings**.

Once enabled, **Data Workbench** appears in its own section in the tray menu.

### Unlocking SOQL queries and DML

Fetching data directly from Salesforce orgs and pushing records back require the Salesforce CLI (`sf`) to be installed.

1. Open **Settings** — with no text field focused, type **`sfdx`** on your keyboard.
2. The app checks that `sf` is installed. If found, a **Salesforce CLI** tab appears and the setting is saved for future visits.
3. Back in the **Workbench** tab, enable **SOQL Queries** and/or **DML Operations** depending on what you need.

---

## Getting started

Open Data Workbench from the tray menu. The window is divided into:

- A **header bar** with action buttons (top right).
- A **panel area** just below the header — used to add tables or configure results.
- A **content area** (table cards) or **Schema view** showing your data pipeline.

---

## Loading data

Click **+ Add Table** to open the input panel. There are three ways to bring data in.

### Import CSV file

1. Select the **CSV File** tab.
2. Drop a `.csv` file onto the drop zone, or click the zone to browse for a file.
3. A preview shows the file name, column count, and row count. Optionally edit the **table name** field.
4. Click **Import Table** (or **Cmd/Ctrl + Enter**) to load it.

The first row is treated as column headers. The delimiter is auto-detected from the first line: if semicolons (`;`) outnumber commas, the file is parsed as semicolon-separated; otherwise comma-separated. UTF-8 BOM is stripped automatically if present. Quoted fields and escaped quotes (`""`) are handled correctly.

To clear the selected file and pick a different one, click the **✕** next to the file name in the preview.

### Paste from spreadsheet

1. Copy a range of cells from Excel, Google Sheets, or any tab-separated source.
2. Select the **Paste from spreadsheet** tab.
3. Paste into the text area and click **Import Table** (or press **Cmd/Ctrl + Enter**).

The first row is treated as column headers. Each new table is automatically assigned a short reference name (e.g. `:Table1`) that you can use in SOQL queries.

### SOQL Query

1. Select the **SOQL Query** tab.
2. Write your SOQL in the text area.
3. Pick a connected Salesforce org from the dropdown and click **Run Query** (or **Cmd/Ctrl + Enter**).

If no org appears in the list, click **↻** to refresh. Orgs must be authenticated via `sf org login` before they show up here.

#### Using table references in SOQL (bindings)

You can inject the values of any loaded table column directly into a SOQL query using the syntax `:RefName.ColumnName`. The workbench expands it into a SOQL `IN (…)` list at query time.

**Example:** if you have a table called `Table1` with a column `Id`:

```soql
SELECT Id, Name, StageName
FROM Opportunity
WHERE AccountId IN :Table1.Id
```

The **Available:** hint below the query editor shows all tables you can reference, colour-coded by table. Click a column name in the hint to insert it at the cursor.

##### Column names with spaces or special characters

For columns whose names contain spaces, accented characters, or other non-ASCII characters, wrap the column name in square brackets:

```soql
WHERE Name IN :Table1.[Company Name]
WHERE FirstName IN :Table1.[Prénom Client]
```

The hint automatically uses bracket notation for columns that require it.

---

## Managing tables

Each table appears as a card in the content area. The card header shows:
- The table name and its reference (`:Ref`).
- A badge indicating the source (**Paste**, **SOQL**, or **Result**).
- The row count.

### Card actions

| Button | Action |
|--------|--------|
| **▾ / ▸** | Collapse or expand the table view |
| **⇊** | Cascade rebuild — re-run this table then refresh all dependent results in order |
| **↻** | Quick re-run (SOQL) or recalculate (Result) without opening the edit panel |
| **✎** | Edit the table (see below) |
| **CSV** | Copy the table as CSV to the clipboard |
| **Sheet** | Copy as tab-separated values — paste directly into Google Sheets or Excel |
| **↓ CSV** | Download the table as a CSV file |
| **✕** | Delete the table (blocked if other tables depend on it) |

### Editing a table

Click **✎** on a card to open the edit panel:

- **Paste table:** the panel pre-fills with the current data as TSV. Modify and click **Replace Table**.
- **SOQL table:** the panel shows the original query. Adjust it and click **Re-run**. You can also change the org.

The edit panel also has a **✕ Delete** button. Clicking it removes the table — unless another table or result references it, in which case the operation is blocked with an explanation of what depends on it.

### Renaming a table

Double-click the table name in the card header to rename it inline.

### Renaming a column

Double-click any column header in a table card to rename it inline. The new name persists across refreshes — if the underlying data source changes column order or adds columns, the rename is re-applied automatically.

Columns that have been renamed show a **⇄** indicator in the schema preview panel.

### Cascade rebuild (⇊ / →)

The **⇊** button on every card re-runs the table's query and then automatically refreshes all downstream results in dependency order. Use it after updating a source dataset to propagate changes through the whole pipeline at once.

In the **Schema view**, a **→** button appears in the top-right corner of any node that has downstream dependents. It works the same way: clicking it rebuilds from that node forward through the entire downstream chain. Progress and errors are shown as toast notifications at the bottom-left of the screen.

### Stale results

When a source table changes, any Result that depends on it shows a yellow **"Source has changed"** banner. Click **↻** in the card header (or open the edit panel) to recalculate it.

### Broken references

If a source table is updated and one of its columns **disappears** (renamed or removed), any downstream Result that references that column by ID shows a red **"Broken reference"** banner. Recalculating the result removes the banner — but you will need to open the result's edit panel and fix the configuration if a required column is truly gone.

### Replacing a paste or CSV table

When you edit a Paste or CSV table (via **✎**), a file drop zone appears above the text area. Drop a new CSV/TSV file (or click the zone to browse) to load it into the editor.

If any columns **disappear** compared to the current version, a **column diff** panel appears before committing:
- **Matched** — columns whose origin name is unchanged (green, preserved automatically).
- **Removed** — columns that no longer exist in the new file (red). For each one, you can use the dropdown to map it to a column in the new file — the original column ID (and any downstream references) are then preserved.
- **Added** — new columns with no prior history (shown for reference).

Click **Replace Table** to apply the changes. If there are no column removals, the replace commits immediately without showing the diff panel.

---

## Creating Results

Once you have at least one table loaded, the **+ Add Result** button appears. Click it to open the result configuration panel.

Choose an operation by clicking one of the six tiles, configure it, then click **Create Result**.

### Operations

#### Enrich
*Add columns from table B into table A where the key columns match.*

Configure a join key on each side (a column from A and a column from B), then select which columns to include in the output (from either table). If a row in A matches multiple rows in B, the result is expanded (fan-out). Rows with no match in B still appear, with empty values for the B columns.

#### Missing
*Keep only the rows in A that have no match in B.*

Useful for finding records present in one list but absent in another (e.g. contacts in a spreadsheet that do not exist in Salesforce). Only the columns of A are returned.

#### Filter
*Keep only the rows in A that have a match in B.*

The inverse of Missing. Only A columns are returned.

#### Stack
*Append all rows from B below A.*

Produces a union of both tables. Columns are merged: all unique column names from both tables appear in the output, with blank values where a column doesn't exist in one of the sources.

#### Transform
*Select columns, filter rows, and add computed columns from a single source table.*

This is the most flexible operation. It has three independent parts, all optional:

**1. Keep columns**
Click the column chips to toggle which columns appear in the output. Unselected columns are dropped.

**2. Row filter**
Keep or remove rows that match a set of conditions.

- Select **Keep matching** or **Remove matching**.
- Click **+ Add condition** to add a filter rule. Each condition has:
  - A **column** to test.
  - An **operator**: `=`, `≠`, `contains`, `starts with`, `is empty`, `not empty`.
  - A **value** (not needed for `is empty` / `not empty`).
- Conditions are numbered (1, 2, 3…). By default they are combined with AND.
- To use custom logic, edit the **Logic** field (e.g. `1 AND (2 OR 3)`). The field auto-updates as you add conditions but only if you haven't customised it — once you edit it manually, it won't be overwritten.

**3. Computed columns**
Add new columns derived from the source data. Click **+ Add computed column**, give it a name, then choose one of three modes using the tabs:

**Conditions mode** — if/else rules:
- Each rule has one or more conditions (same format as the row filter), a Logic expression, and a **Then** value.
- Add a **Default** value used when no rule matches.
- Rules are evaluated top to bottom; the first matching rule wins.

**Replace mode** — value mapping:
- Pick a source column whose values you want to remap.
- Add pairs: **original value → replacement value**.
- Values not listed are passed through unchanged.

**Formula mode** — expression-based computation:
- Write a formula that can reference any column from the source table.
- Click the column chips above the input to insert a column reference at the cursor.
- A live preview shows the result for the first row.
- See [Formula Reference](formula-reference.md) for the full list of available functions and operators.

#### Group
*Aggregate rows that share the same value in a key column.*

Select a **source table** and a **Group by** column. The output contains one row per distinct value of that column. A **`count_<column>`** column is always included automatically, containing the number of source rows in each group.

For every other column, choose one of six aggregation modes using the toggle buttons:

| Button | Behaviour |
|--------|-----------|
| **First** | Returns the first value encountered in the group. |
| **Sum** | Sum of all numeric values in the group. Empty cells and non-numeric values are ignored by default (not treated as zero). Check **Blank = 0** to count them as zero instead. Returns empty if no valid numbers are found (or zero if Blank = 0 is on). |
| **Avg** | Average of all numeric values in the group, with the same empty/non-numeric handling as Sum. When **Blank = 0** is on, blank and invalid cells count as 0 *and* factor into the denominator — e.g. `[100, blank, 200]` gives an average of 100, not 150. |
| **Max** | Highest value — numeric if all values are numbers, date-aware if all values are valid dates, alphabetic otherwise. |
| **Min** | Lowest value, same type-detection logic as Max. |
| **Concat** | Joins all unique non-empty values with a separator (default `;`). Click **Concat** to reveal a small input field where you can change the separator. |

Column names that you renamed in the result table are preserved when you re-edit the Group recipe or trigger a rebuild.

---

#### Split
*Split one source table into several result tables, each containing the rows that match a given condition.*

Select a **source table**, then define one or more **branches**. Each branch has:
- A **name** — used as the result table title.
- A **condition**: column, operator (`=`, `≠`, `contains`, `starts with`, `is empty`, `not empty`, `>`, `<`, `≥`, `≤`), and value.

Optionally click **+ Default Branch** to add a catch-all branch that receives every row not matched by any other branch in the group. Only one default branch is allowed per split.

Click **Create Result** to generate all branches at once — each branch becomes a separate result card. Branches are independent and can be chained into further operations. A single row may appear in multiple condition-based branches if it satisfies more than one condition; it appears in the default branch only if it matches none of them.

To edit a branch later, click **✎** on its result card and adjust the condition. If you change a condition branch, the default branch is automatically marked stale and will recalculate to reflect the new exclusions.

---

##### Column names with spaces or special characters in formulas

For columns whose names contain spaces, accented characters, or other non-ASCII characters, wrap the column name in square brackets:

```
CONCAT([First Name], " ", [Last Name])
IF([Prénom Client] = "", "Unknown", UPPER([Prénom Client]))
```

---

## Editing a Result

Every Result card has an **✎** button. Clicking it opens the result panel pre-filled with the existing recipe — you can change any parameter and click **Update Result** to recalculate in place.

The panel also has a **✕ Delete Recipe** button. Like table deletion, this is blocked if any other table or result references the recipe being deleted.

---

## Schema view

Click **Schema** (top right) to open the Schema view. This shows your entire data pipeline as a node graph — useful for understanding the structure of a complex model at a glance.

### Node types

| Shape / colour | Meaning |
|----------------|---------|
| Green node | Paste / CSV table |
| Blue node | SOQL table |
| Purple node | Result |
| Red node | DML card |

Solid arrows show recipe dependencies (one table feeds into another). Dashed arrows indicate SOQL bindings (a SOQL query uses a column from another table as an `IN` filter).

### Interacting with nodes

- **Click a node** to open the **preview panel** on the right — shows the table name, source, row count, column list, description, and any active column renames.
- **Double-click the title** in the preview panel to rename the table inline.
- **Drag the left edge** of the preview panel to resize it.

### Actions in the preview panel

- **Description field** — always visible below the header bar. Click it to type or edit a description for the table. Changes are saved automatically when you click away. Descriptions also appear in the hover tooltip on the node.
- **CSV / Sheet / ↓ CSV** — copy or download the table data (same as on the card).
- **✕ Delete** — delete the table or result. Blocked if other nodes depend on it, with an explanation of which ones do.

---

## Color rules

Click **⬤ Colors** (top right, visible when at least one table is loaded) to open the Color Rules panel. Rules let you highlight cards in the Schema view based on row count after a rebuild.

Each rule specifies:
- **Table** — which result or source to watch.
- **Condition** — **Has records** (fires when `rows > 0`) or **No records** (fires when `rows = 0`).
- **Color** — one of six preset colours (red, orange, yellow, green, blue, purple).

When a rule matches, the node in the Schema view gets a coloured border. Rules are re-evaluated automatically after every rebuild or refresh, so the colours always reflect the current state.

The panel is draggable — grab its header to reposition it on screen.

Color rules are saved and restored as part of the model file (see below).

---

## Maps

Maps are persistent key-value tables saved with the schema. They are useful when you have a stable mapping that isn't sourced from Salesforce — for example, a country code → country name lookup, or an internal ID → label translation — and you want to reuse it across formulas or enrichment operations without importing it as a separate table every time.

Click **⊞ Maps** (top right, always visible) to open the Maps panel. The panel is draggable — grab its header to reposition it.

### Creating a map

Enter a name in the **New map name** field and click **+ Create** (or press Enter). The name must be unique within the schema. It will be used to reference the map in formulas.

### Importing entries from a paste

1. Expand a map by clicking the **▶** toggle.
2. Paste TSV or CSV data into the paste area. The first column is automatically used as the key (it cannot be changed).
3. A **Value column** dropdown appears — select which of the other columns holds the values you want to map to. All other columns are discarded.
4. Click **Import**.

This replaces any existing entries in the map.

### Adding or removing individual entries

At the bottom of the expanded map body, type a key and a value into the two input fields and press **+ Add** (or Enter). Each entry appears in the entries table above. Click **✕** on any row to remove it.

### Renaming or deleting a map

- **Rename** — double-click the map name and type a new one.
- **Delete** — click 🗑 in the map header.

### Using maps in formulas

Maps are available in any **Computed Column** formula via two functions:

```
GET(mapName, key)   → returns the mapped value, or null if the key is not found
HAS(mapName, key)   → returns TRUE if the key exists in the map
```

```
GET("CountryCodes", ISOCode)
→ returns "France" if ISOCode = "FR" and the map contains FR → France

IF(!ISBLANK(TypeCode), GET("TypeLabels", TypeCode), "")
→ safe lookup: skip empty cells to avoid null results appearing in output

IF(HAS("VIP_Accounts", AccountId), "VIP", "Standard")
→ tag rows based on whether the account is in the map
```

`mapName` must be a **string literal** (in quotes), not a column reference.

### Using maps in SOQL bindings

Maps can also be used directly in SOQL queries as IN-list bindings. The binding hint zone (below the query editor) shows a **Maps** section alongside the table bindings. Click `.keys` or `.values` to insert the reference at the cursor, or type it manually:

```
[MapName].keys    → expands to all keys of the map as an IN list
[MapName].values  → expands to all values of the map as an IN list
```

```sql
SELECT Id, Name FROM Account
WHERE BillingCountryCode IN [CountryCodes].keys

SELECT Id FROM Contact
WHERE Title IN [JobTitles].values AND AccountId IN :Accounts.Id
```

Duplicates and empty values are filtered out automatically. Map and table bindings can be combined freely in the same query.

Renaming a map automatically updates all references to it — both formula usages (`GET`/`HAS`) and SOQL bindings (`[MapName].keys` / `.values`) — across the entire schema.

Maps are saved and restored as part of the model file (see below).

---

## Saving and loading a model

### Save

When you have tables and results set up, click **Save** (top right) to export the workspace as a JSON file. This file captures:
- The SOQL query and org identifier for each SOQL table (data is not embedded — re-run the query after loading).
- The raw data for each Paste / CSV table.
- All result recipes (the configuration for each result).
- All column renames.
- All color rules.
- All maps (names and entries).

Once a file has been saved or loaded, its name appears in the header bar. Clicking **Save** again pre-fills the dialog with the same filename, so you can overwrite in one click or choose a new name to save a copy.

### Load

Click **Load** to restore a previously saved model. This replaces the current workspace. After loading, the filename is shown in the header.

> **Note:** SOQL tables are restored with their query only — the query is not re-executed automatically. Click **↻** on each card (or **⇊** to cascade) to fetch fresh data.

### Save Snapshot

Click **Save Snapshot** to export the workspace with all loaded table data embedded directly in the JSON — including SOQL query results and computed result tables. When you reload a snapshot, every table is immediately populated with data, with no queries to re-run and no files to re-import.

Before saving, a warning reminds you that snapshot files are not encrypted. **Do not share snapshots that contain sensitive or GDPR-protected data.**

Tables loaded from a snapshot show a purple **Snapshot** badge on their card. You can still click **↻** on any SOQL card to replace the snapshot data with a fresh query result.

---

## Notifications

Operations that take time (cascade rebuilds, SOQL queries) show progress as **toast notifications** at the bottom-left of the screen. Each toast shows the current table being processed (e.g. "Rebuilding: MyResult… (2/5)") and updates as each step completes. Errors appear as persistent red toasts — they stay until you dismiss them manually with ✕.

---

## Clickable Salesforce IDs

If a **Salesforce Instance URL** is configured in the app Settings, any cell value that looks like a Salesforce record ID (exactly 15 or 18 alphanumeric characters) is automatically rendered as a clickable link. Clicking it opens the record directly in your browser at `<instance-url>/<id>`.

The link is styled as a subtle underline — it does not affect copy/paste or CSV export (the raw ID is always what gets exported).

If no Instance URL is configured, cells display as plain text.

---

## DML Operations

DML (Data Manipulation Language) cards let you push rows from any loaded table into Salesforce — inserting new records, updating existing ones, upserting based on an external ID field, or deleting records.

> **Requires Salesforce CLI:** DML operations require `sf` to be installed and at least one org authenticated. Enable the feature in **Settings → Workbench → DML Operations**.

### Creating a DML card

Click **+ DML** (top right, visible once at least one table is loaded) to open the DML configuration panel.

| Field | Description |
|-------|-------------|
| **Source table** | The table whose rows will be pushed to Salesforce. |
| **Object** | Salesforce API name of the target object (e.g. `Account`, `Contact__c`). |
| **Operation** | `insert`, `update`, `upsert`, or `delete`. |
| **External ID field** | *(Upsert only)* API name of the field used as the match key. |
| **Org** | The connected Salesforce org to push records to. |
| **Batch size** | Number of records per API call — 1 to 200, default 200. Smaller batches update the results panel progressively but use more API calls. |
| **All or none** | When enabled, the entire batch is rolled back if any record fails. When disabled, each record succeeds or fails independently. |

Below the main config, the **Mappings** section lists each column from the source table alongside a field API name input. Toggle the checkbox on each row to include or exclude it from the push. Only mapped, included rows are sent to Salesforce.

Click **Create DML** to add the card.

### Running a DML

DML cards do not run automatically — they must be triggered manually.

Open the **Schema view** and click the DML node to open its preview panel. A **Run** button appears at the top. It is disabled when the source table is empty.

Click **Run** to start. Records are sent batch by batch. As each batch completes, the preview panel updates live — every row gains a result column:

- **✓ `<record ID>`** — record created or updated successfully.
- **✗ `<error message>`** — the record failed, showing the first error returned by Salesforce.

A **Last run** timestamp is shown above the results table once the run completes.

### Results and rebuilds

Results are displayed inline in the preview panel and kept until the next run or until the source table is rebuilt. When the source table is refreshed or replaced, DML results are cleared automatically and the card returns to "not yet run" state.

### Color rules for DML cards

DML cards support these conditions in the Color Rules panel:

| Condition | When it fires |
|-----------|---------------|
| **Has records (source)** | The source table has at least one row. |
| **No records (source)** | The source table is empty. |
| **DML done — all OK** | Last run completed with no failures. |
| **DML done — has errors** | Last run completed but at least one record failed. |
| **DML not yet run** | No run has been triggered since the card was created or the source was rebuilt. |

---

## Tips

- Use **Stack** to merge two exports of the same object type before enriching or filtering.
- Use **Missing** to quickly find records that need to be created in Salesforce.
- Use **Transform** with a row filter to scope down a large SOQL result before joining it with another table.
- The **Sheet** copy button makes it easy to paste a result into a Google Sheet for sharing or further formatting.
- Results can be used as sources for other Results — chain operations to build multi-step pipelines.
- In the SOQL binding hint, each table's references are shown in a distinct colour to make it easy to spot which columns belong to which source when you have many tables loaded.
- Use the **Schema view** to get a bird's-eye view of your pipeline and quickly navigate to any table.
