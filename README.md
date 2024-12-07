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
- ❤️‍🩹 Built by user, for users
- 💡 Inspired by real daily operations workflows
- 🔄 Continuously improved based on actual usage and feedback

## Features

- 🚀 Productivity tools:
  - Quick Salesforce record access by ID
  - Global Salesforce search from anywhere
  - Batch opening of multiple Salesforce records
  - SOQL-ready string concatenation for IDs
  - JSON data extraction and formatting
  - Customizable search shortcuts

- ⌨️ Seamless Experience:
  - Global keyboard shortcuts
  - Quick command palette
  - Minimal and distraction-free UI
  - Dark mode interface

- 🛠️ Operations-focused design:
  - Configurable workspace settings
  - Custom search templates
  - Clipboard enhancement tools
  - Batch processing capabilities

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
npm run dist
```

The built application will be available in the `dist` folder.

## Configuration

### Settings

All settings can be configured through the application's settings window:

- Salesforce Instance URL
- Global keyboard shortcuts
- Custom search configurations
- Maximum number of concurrent tabs

## Development

### Project Structure

```
SalesfOps/
├── src/
│   ├── commands/        # Command implementations
│   ├── services/        # Shared services
│   ├── windows/         # Window templates
│   └── styles/          # CSS styles
├── assets/             # Application icons
└── main.js            # Main process entry
```

### Available Scripts

- `npm start`: Run in development mode
- `npm run dist`: Build for production
- `npm test`: Run tests (when implemented)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Licenses

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-party licenses:

- Electron: MIT License
- electron-builder: MIT License