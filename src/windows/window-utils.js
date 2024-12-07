const { BrowserWindow } = require('electron');
const path = require('path');

function createDarkWindow(options = {}) {
    const defaultOptions = {
        width: 400,
        height: 100,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            enableRemoteModule: false,
            contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
            preload: path.join(__dirname, '../../preload.js')
        },
        backgroundColor: '#1a1a1a',
        contentSecurityPolicy : {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'style-src': ["'self'"],
            'img-src': ["'self'"],
            'connect-src': ["'self'"]
        }
    };

    const window = new BrowserWindow({
        ...defaultOptions,
        ...options
    });

    window.once('ready-to-show', () => {
        window.show();
    });

    return window;
}

module.exports = { createDarkWindow };
