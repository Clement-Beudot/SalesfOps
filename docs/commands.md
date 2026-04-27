# Commands Reference

All commands are enabled individually in **Settings** and can be triggered from the tray menu or via a configurable keyboard shortcut.

---

## Salesforce

### Open Salesforce ID

Opens a Salesforce record directly in your browser from its ID.

Paste or type a Salesforce record ID (15 or 18 characters) into the input and press **↵**. The app detects the org from the ID prefix and opens the matching record URL in your default browser.

**Keyboard shortcut:** configurable in Settings.

### Open Multiple Salesforce IDs

Opens several Salesforce records at once, each in a new browser tab.

Paste a list of IDs separated by spaces or newlines and press **↵**. All records open simultaneously.

**Keyboard shortcut:** configurable in Settings.

### Search in Salesforce

Runs a global search in the Salesforce Lightning interface.

Type your query and press **↵**. The app opens the Salesforce global search results page in your browser with the query pre-filled.

**Keyboard shortcut:** configurable in Settings.

### Open Salesforce Org

Browse your authenticated Salesforce orgs and open one in the browser.

Lists all orgs authenticated via the Salesforce CLI (`sf org login web`). Select an org and press **↵** to open it.

---

## Data

### Concatenate Strings

Joins a list of values into a single comma-separated string and copies it to the clipboard.

Paste or type values separated by spaces or newlines, then press **↵**. Useful for building `IN (…)` lists or comma-separated ID sets to use in SOQL queries or filters.

**Option:** enable **Split by newlines only** to treat spaces as part of values rather than as separators — useful when values themselves contain spaces.

**Keyboard shortcut:** configurable in Settings.

### Extract JSON Values

Extracts a flat list of values from a JSON structure and copies it to the clipboard.

Paste a JSON object or array (e.g. a Salesforce REST API or Workbench query response). The app shows all available field paths — select one and press **↵** to copy all values at that path as a newline-separated list.

Useful for extracting IDs or field values from a query result to paste into another tool.

**Keyboard shortcut:** configurable in Settings.

### Update JSON / CSV Values

Replaces the value of a specific field across all records in a JSON or CSV dataset.

Paste your data, select a field from the list, enter the new value, and confirm. The modified dataset is copied to the clipboard in the original format (JSON or CSV).

**Keyboard shortcut:** configurable in Settings.

### Remove Duplicates

Removes duplicate entries from a list and copies the unique values to the clipboard.

Paste a list of values separated by spaces or newlines. The app reports how many unique values and duplicates were found, then copies the deduplicated list.

**Keyboard shortcut:** configurable in Settings.

---

## Other Tools

### Custom Search

Runs a search against a configurable URL template.

Define one or more search engines in **Settings → Custom Search**. Each entry has a label and a URL containing `{@}` as the placeholder for the search term. When you open the command, pick a search engine from the dropdown and type your query.

**Example URL:** `https://my-website.com/search?searchTerm={@}`

**Keyboard shortcut:** configurable in Settings.

### Text Snippets

Quickly insert pre-configured text blocks by keyword.

Define snippets in **Settings → Snippets**. Each snippet has a short keyword and a body. Open the command, type a keyword (the list filters as you type), and press **↵** to copy the snippet body to the clipboard.

**Keyboard shortcut:** configurable in Settings.
