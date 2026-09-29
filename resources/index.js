(function () {
    'use strict';

    var app = require('electron').app;
    var BrowserWindow = require('electron').BrowserWindow;
    var shell = require('electron').shell;
    var Menu = require("electron").Menu;
    var env = require('./env_config');
    var devHelper = require('./dev_helper');
    var windowStateKeeper = require('./window_state');
    var fs = require('fs');
    // var git = require("git-rev-sync");

    // URL schemes we are willing to hand to the OS. `shell.openExternal` is a
    // remote-code-execution primitive: schemes such as `file:`, `smb:` or any
    // registered custom handler can be pointed at local paths or launch
    // arbitrary applications. A renderer-side XSS (this renderer has Node
    // integration, see index-electron.html) can therefore reach the whole
    // desktop through a crafted link. Default-deny.
    var EXTERNAL_URL_ALLOWLIST = ['https:', 'http:', 'mailto:'];

    function isAllowedExternalUrl(url) {
        if (typeof url !== 'string' || url.length === 0) return false;
        var parsed;
        try {
            parsed = new URL(url);
        } catch (e) {
            return false;
        }
        return EXTERNAL_URL_ALLOWLIST.indexOf(parsed.protocol) !== -1;
    }

    var mainWindow;

    // Preserver of the window size and position between app launches.
    var mainWindowState = windowStateKeeper('main', {
        width: 1000,
        height: 800
    });
    global.guid = mainWindowState.guid;
    // global.version = JSON.stringify(git.tag());

    app.on('ready', function () {

        mainWindow = new BrowserWindow({
            x: mainWindowState.x,
            y: mainWindowState.y,
            width: mainWindowState.width,
            height: mainWindowState.height,
            webPreferences: {
                // NOTE: `nodeIntegration` is required by
                // app/assets/index-electron.html, which calls
                // `require('electron').remote` to read the installation GUID.
                // That makes any renderer-side XSS a full desktop RCE, so the
                // mitigations are (a) no analytics/third-party script in this
                // template, (b) sanitising remote HTML in the renderer, and
                // (c) the navigation/new-window guards above. Migrating the
                // bridge to a context-isolated preload script is the remaining
                // structural fix and is deliberately out of scope here.
                nodeIntegration: true,
                webSecurity: true,
                allowRunningInsecureContent: false
            }
        });

        if (mainWindowState.isMaximized) {
            mainWindow.maximize();
        }

        mainWindow.loadURL('file://' + __dirname + '/index.html');

        //if (env.name !== 'production') {
        //devHelper.setDevMenu();
        //mainWindow.openDevTools();
        //}

        mainWindow.on('close', function () {
            mainWindowState.saveState(mainWindow);
        });

        // Never let the renderer navigate the top-level window away from the
        // bundled local index.html: a `will-navigate` to a remote origin would
        // load third-party JavaScript into a context that has `require()`
        // available.
        mainWindow.webContents.on('will-navigate', function (event, url) {
            if (url.indexOf('file://') !== 0) {
                event.preventDefault();
            }
        });

        mainWindow.webContents.on('new-window', function(e, url) {
            e.preventDefault();
            if (isAllowedExternalUrl(url)) {
                shell.openExternal(url);
            } else {
                console.warn("Blocked external URL with disallowed scheme: " + url);
            }
        });

        // Create the Application's main menu

        var app_menu = process.platform === 'darwin' ?
        {
            label: "Application",
            submenu: [
                {label: "About Application", selector: "orderFrontStandardAboutPanel:"},
                {type: "separator"},
                {label: "Quit", accelerator: "Command+Q", click: function () { app.quit(); }}
            ]
        }
            :
        {
            label: "File",
            submenu: [
                {label: "Quit", accelerator: "Command+Q", click: function () { app.quit(); }}
            ]
        }

        var template = [app_menu, {
            label: "Edit",
            submenu: [
                {label: "Undo", accelerator: "Command+Z", selector: "undo:"},
                {label: "Redo", accelerator: "Shift+Command+Z", selector: "redo:"},
                {type: "separator"},
                {label: "Cut", accelerator: "Command+X", selector: "cut:"},
                {label: "Copy", accelerator: "Command+C", selector: "copy:"},
                {label: "Paste", accelerator: "Command+V", selector: "paste:"},
                {label: "Select All", accelerator: "Command+A", selector: "selectAll:"}
            ]
        }, {
            label: 'View',
            submenu: [{
                label: 'Reload',
                accelerator: 'CmdOrCtrl+R',
                click: function () {
                    BrowserWindow.getFocusedWindow().reload();
                }
            }, {
                label: 'Toggle DevTools',
                accelerator: 'Alt+CmdOrCtrl+I',
                click: function () {
                    BrowserWindow.getFocusedWindow().toggleDevTools();
                }
            }]
        }
        ];

        Menu.setApplicationMenu(Menu.buildFromTemplate(template));

    });

    app.on('window-all-closed', function () {
        app.quit();
    });

})();
//# sourceMappingURL=background.js.map
