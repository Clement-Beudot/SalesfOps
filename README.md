# <img src="assets/icon.png" width="40"> SalesfOps

SalesfOps is a lightweight productivity suite offering a collection of micro-tools to streamline daily operations tasks. Designed with a focus on Salesforce workflows, it provides various utilities accessible through global shortcuts to speed up common operations.

## Legal Notice

This software is an independent tool and is not affiliated with, officially connected to, or endorsed by Salesforce. All product and company names are trademarks™ or registered® trademarks of their respective holders. Use of them does not imply any affiliation with or endorsement by them.


## Why SalesfOps?

As a daily Salesforce user, I found myself constantly switching between different records, formatting data, and performing repetitive tasks throughout the day. I initially created SalesfOps as a personal tool to make my own work more efficient, then decided to share it when I realized how much time it was saving me. The goal is simple: bring these common actions to our fingertips through keyboard shortcuts, eliminating the need to navigate through multiple browser tabs or complex menu structures.

Think of it as your personal assistant that stays out of your way until you need it, then appears instantly to help you perform tasks in seconds that would otherwise take multiple clicks and window switches.

## About This Project

- 🏠 Developed at home
- 🦭 Free and open source
- ❤️‍🩹 Built by users, for users
- 💡 Inspired by real daily operations workflows
- 🔄 Continuously improved based on actual usage and feedback

## Features

### 🔍 Quick commands (global shortcuts)

Instant utilities available from anywhere on your desktop via keyboard shortcuts:

- **Open by ID** — jump directly to a Salesforce record from its ID
- **Global search** — search in Salesforce without leaving your current window
- **Batch open** — open multiple Salesforce records at once
- **ID concatenation** — build SOQL-ready `IN` lists from a set of IDs
- **Extract Value** — extract fields from JSON or CSV data
- **Custom searches** — configurable search shortcuts for your own workflows

### ⚡ SOQL Runner

A standalone query window for running SOQL queries against any of your connected orgs:

- Org selector with connection status indicator
- Syntax-aware autocomplete for sObjects and fields
- Results displayed in a sortable, searchable table
- Clickable Salesforce IDs — opens the record in the correct org
- Export results to CSV or copy to clipboard (sheet-ready)
- Save and reload a personal query library

### 🧪 Data Workbench

A visual data pipeline builder for transforming, enriching and pushing data to Salesforce — without writing code.

**Sources**
- Import data by pasting from a spreadsheet, uploading a CSV, or running a SOQL query
- SOQL tables support dynamic bindings (`:ref.column`) to inject values from other loaded tables
- Refresh individual tables or cascade-refresh an entire dependency chain

**Results** — chain operations to build multi-step pipelines:
- **Enrich** — left-join two tables on a key column to add columns from a lookup
- **Missing** — find rows in one table absent from another (anti-join)
- **Filter** — keep or discard rows based on conditions
- **Transform** — select columns, add computed columns (conditions, replace mappings, or formulas), and apply row filters
- **Group** — aggregate rows by a key column (count, sum, average, min, max, concatenate)
- **Split** — divide a table into branches based on conditions
- **Stack** — union two tables with the same structure

**Computed column formulas** — 40+ built-in functions across string, math, logic, date and map categories. See the [formula reference](docs/formula-reference.md).

**DML operations**
- Insert, update or upsert records directly into Salesforce from a result table
- Field mapping UI with per-field include/exclude toggles
- Batch execution with a per-record success/error report

**Maps** — persistent key-value lookup tables saved with the schema:
- Import entries from a pasted spreadsheet (first column = key, choose value column)
- Use in formulas: `GET("MapName", column)`, `HAS("MapName", column)`
- Use in SOQL bindings: `[MapName].keys`, `[MapName].values` expand to IN lists
- Renaming a map automatically propagates to all formulas and SOQL queries

**Schema view** — a bird's-eye canvas of your entire pipeline with draggable nodes, live row counts, and a resizable detail panel. Color rules let you highlight cards based on record count or DML run status.

**Save / Load / Snapshot** — persist a full workspace as a JSON file. Snapshots embed all loaded data so the workspace reopens immediately without re-running queries.

### ⌨️ Seamless experience

- Global keyboard shortcuts — trigger any command from anywhere
- Quick command palette
- Minimal, distraction-free dark UI
- Customisable accent color

## Documentation

- [Data Workbench guide](docs/data-workbench.md)
- [Formula reference](docs/formula-reference.md)
- [SOQL Runner guide](docs/soql-runner.md)
- [Commands reference](docs/commands.md)

## Installation

### Download Release

1. Go to the [Releases](https://github.com/Clement-Beudot/SalesfOps/releases) page
2. Download the latest version for your platform:
   - macOS: `.dmg` file

### macOS Security Notice

When first opening the app on macOS, you might see a security warning as the app is not signed with an Apple certificate. To bypass this:

1. Right-click (or Control-click) the app
2. Select "Open"
3. Click "Open" in the dialog box
4. The app will now be saved as a trusted app

## Building from Source

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git

### Build Steps

1. Clone the repository
```bash
git clone https://github.com/Clement-Beudot/SalesfOps.git
cd SalesfOps
```

2. Install dependencies
```bash
npm install
```

3. Start in development mode
```bash
npm start
```

4. Build for production
```bash
npm run setup-and-build
```

The built application will be available in the `dist` folder.

## Configuration

### Settings

All settings can be configured through the application's settings window:

- Salesforce Instance URL
- Global keyboard shortcuts
- Custom search configurations
- Maximum number of concurrent tabs
- Accent color (applied across all command windows and the SOQL Runner)

## Development

### Project Structure

```
SalesfOps/
├── src/
│   ├── commands/        # Command implementations
│   ├── utils/           # Shared utilities
│   ├── windows/         # Window HTML + JS (SOQL Runner, Data Workbench, …)
│   └── styles/          # CSS styles
├── docs/                # Feature documentation
├── tests/               # Jest test suites
├── assets/              # Application icons
└── main.js              # Main process entry point
```

### Available Scripts

- `npm start` — run in development mode
- `npm test` — run the test suite
- `npm run setup-and-build` — build for production

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Licenses

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-party licenses:

- Electron: MIT License
- electron-builder: MIT License
- csv-parse: MIT License
- csv-stringify: MIT License
