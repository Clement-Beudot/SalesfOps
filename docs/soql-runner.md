# SOQL Runner

The SOQL Runner is a lightweight floating window for running SOQL queries against any authenticated Salesforce org — without opening the Data Workbench or a browser.

---

## Enabling the SOQL Runner

The feature is hidden by default while in early access. To enable it:

1. Open **Settings** (from the menu bar / tray icon).
2. With the Settings window focused and no text field selected, type **`sfdx`** on your keyboard.
3. A **Lab** section will appear at the bottom of the page with a **SOQL Runner** toggle.
4. Enable the checkbox and save. Optionally configure a keyboard shortcut.

Once enabled, **SOQL Runner** appears in the **Salesforce** section of the tray menu.

---

## Opening and closing

- **Tray menu:** Salesforce → SOQL Runner.
- **Keyboard shortcut:** configurable in Settings (Lab section).
- **Close:** press **Esc**, click **✕** in the title bar, or use the shortcut again.

The window stays on top of all other windows and can be repositioned by dragging the title bar.

---

## Interface overview

The window is divided into two areas side by side:

- **Left — editor area:** text area for writing the query, action buttons below it.
- **Right — suggestions panel:** always visible; shows autocomplete suggestions when the cursor is in a relevant position, empty otherwise.

The window has three modes:

| Mode | When shown |
|------|-----------|
| **Query** | Default — write and run a query |
| **Result** | After a successful query run |
| **Library** | When the 📚 button is clicked |

---

## Title bar

| Element | Description |
|---------|-------------|
| Org dropdown | Select which Salesforce org to query |
| Status badge | **Connected** (green) or **Disconnected** (red) |
| **↻** | Refresh the org list |
| **📚** | Open the query library |
| **✕** | Close the window |

Orgs must be authenticated via `sf org login web` before they appear in the dropdown.

---

## Writing a query

Type a SOQL query in the text area. The runner provides **live field and object autocomplete** in the suggestions panel on the right.

### Object suggestions (FROM clause)

Start typing an object name after `FROM` — the panel shows matching standard and custom objects from your org, sorted by relevance (exact match first, then prefix match, then substring match).

The object list is fetched once and stored permanently on disk. Use the **↻ Refresh object list** button at the bottom of the panel to force a refresh.

### Field suggestions (SELECT clause)

Once a `FROM` object is present in the query, typing at least two characters in the `SELECT` field list shows matching fields for that object. Suggestions are sorted by relevance then alphabetically.

When you select a field:
- **Regular field** → the field name is inserted followed by `, ` (ready to type the next field).
- **Lookup relationship** (e.g. `Account`) → the name is inserted followed by `.`, letting you immediately type to traverse the related object's fields.

### Lookup field traversal

You can traverse lookup relationships to any depth directly in the `SELECT` or `WHERE` clause:

```
SELECT Account.Name, Account.RecordType.DeveloperName FROM Contact
```

Type `Account.` → suggestions switch to Account fields. Type `Account.RecordType.` → suggestions switch to RecordType fields, and so on.

When you select a lookup field in a `WHERE` clause, `.` is also appended automatically so you can keep traversing.

### Subquery support

Relationship names in subqueries are resolved automatically. If the outer object is `Account` and you write `(SELECT Id FROM Opportunities)`, the runner resolves `Opportunities` to the `Opportunity` object and offers its fields.

### Field metadata cache

Field metadata is fetched the first time an object is queried and stored permanently on disk. To force a refresh for a specific object, use the **↻ Refresh [Object] fields** button at the bottom of the suggestions panel.

---

## WHERE clause suggestions

### Picklist values — equality

When you type `WHERE FieldName = '`, the panel shows filtered picklist values for that field. Typing more characters narrows the list.

```
WHERE Status = 'Ac    →  Active, Activated, …
```

### Picklist values — IN clause

When the cursor is inside an `IN (…)` list for a picklist field, the panel shows **all picklist values as checkboxes**. Values already written in the list are pre-checked.

```
WHERE Status IN (
```

Check or uncheck values with a click or **Space**, then click **Apply** or press **Enter** to insert the complete `IN ('Value1', 'Value2')` clause, replacing any existing content between the parentheses.

Once the `)` is closed and the cursor moves outside the list, suggestions stop so you can freely add `AND`, `OR`, or other conditions.

### Lookup paths in WHERE

Picklist suggestions also work through lookup chains:

```
WHERE Account.Type = '    →  shows Account.Type picklist values
```

---

## Keyboard navigation

| Key | Action |
|-----|--------|
| **Tab** | Next suggestion |
| **Shift+Tab** | Previous suggestion (wraps around) |
| **Enter** | Accept the active suggestion / Apply checkbox selection |
| **Space** | Toggle active checkbox (IN clause multi-select) |
| **↑ / ↓** | Move the text cursor normally — does **not** navigate suggestions |
| **Esc** | Clear suggestions / close the window |

---

## Running a query

Press **⌘↵** (Mac) / **Ctrl+↵** (Windows) or click **Run ⌘↵**.

If the query returns results, the window switches to **Result** mode. If it fails, an error message appears below the text area.

---

## Result panel

### Result bar

| Element | Description |
|---------|-------------|
| Row count | Rows returned (and total if Salesforce returned a partial result) |
| Search box | Filters visible rows by any cell value (case-insensitive) |
| **CSV** | Copies all rows as CSV to the clipboard |
| **Sheet** | Copies all rows as tab-separated values — paste into Google Sheets or Excel |
| **↓ CSV** | Downloads all rows as a `.csv` file |
| **← Edit** | Returns to the query panel |

### Row limit

By default the table shows the first **100 rows**. A banner at the bottom shows the total count and offers a **Show all** button. The limit applies to display only — all rows are available for export regardless.

### Search

Typing in the search box filters the table in real time. The count updates to show matches vs. total. Click **✕** to clear.

### Clickable Salesforce IDs

If a **Salesforce Instance URL** is configured in Settings, any cell containing a Salesforce record ID (15 or 18 alphanumeric characters) becomes a clickable link that opens the record in your browser.

---

## Saving a query

Click **☆** in the query panel to save the current query as a favourite:

1. A name field appears pre-filled with the main object from the `FROM` clause.
2. Edit the name if needed, then press **↵** or click **Save**.

Saved queries persist across sessions.

---

## Query library

Click **📚** to open the library panel. It shows:

- **★ Saved** — your manually saved favourites, grouped by the queried object.
- **↺ Recent** — the last 20 queries you ran, in reverse chronological order.

Use the search field to filter by query content or name. Click a tile to load it into the text area. To delete a saved query, hover over its tile and click **✕**.
