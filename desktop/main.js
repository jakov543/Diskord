// Diskord desktop app
// splash -> (offline screen | welcome / log in / sign up | chat). Calls open in their own window with mic, camera and screen share.
const { app, BrowserWindow, shell, session, desktopCapturer, Menu, Tray, ipcMain, net, dialog, nativeImage, protocol } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');

// The Diskord app files ship inside the installer and are served as diskord://app/...
const APP_DIR = path.join(__dirname, 'app');
const CHAT_URL = 'diskord://app/index.html';
const CALL_PREFIX = 'diskord://app/call.html';
protocol.registerSchemesAsPrivileged([{ scheme: 'diskord', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const UI = f => path.join(__dirname, 'ui', f);
const ICON = path.join(__dirname, 'build', 'icon.png');
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
const SIGN_IN_HOSTS = ['accounts.google.com'];
const NET_ERRORS = new Set([-2, -7, -21, -100, -101, -102, -104, -105, -106, -109, -118, -130, -137, -138]);

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('com.jakov543.diskord');

// ---------------------------------------------------------------- saved state
const stateFile = () => path.join(app.getPath('userData'), 'state.json');
let state = {};
const loadState = () => { try { state = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (_) { state = {}; } };
const saveState = () => { try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch (_) {} };

let main = null, splash = null, tray = null, mode = 'start', quitting = false;
const host = u => { try { return new URL(u).hostname; } catch (_) { return ''; } };
const isCall = u => u.startsWith(CALL_PREFIX);
const isSignIn = u => SIGN_IN_HOSTS.some(h => host(u) === h || host(u).endsWith('.' + h));
const fromLocal = e => { try { return /^(file|diskord):/.test(e.senderFrame && e.senderFrame.url || ''); } catch (_) { return false; } };
const status = t => { if (splash && !splash.isDestroyed()) splash.webContents.send('status', t); };

function logout() {
  BrowserWindow.getAllWindows().forEach(w => { if (w !== main && w !== splash) w.close(); });
  if (main) main.webContents.executeJavaScript('window.diskordLogout && window.diskordLogout()').catch(() => {});
}

// ---------------------------------------------------------------- screens
function showOffline(reason) { if (mode === 'offline') return; mode = 'offline'; main.loadFile(UI('offline.html'), { query: { reason: reason || 'net' } }); }
function showChat() { mode = 'chat'; main.loadURL(CHAT_URL); }
function route() { if (!net.isOnline()) return showOffline('net'); showChat(); }

ipcMain.on('version', e => { e.returnValue = app.getVersion(); });
ipcMain.on('quit', e => { if (fromLocal(e)) { quitting = true; app.quit(); } });
ipcMain.on('retry', e => { if (fromLocal(e) && net.isOnline()) { mode = 'retry'; route(); } });

// ---------------------------------------------------------------- windows
function wire(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isCall(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 720, minWidth: 640, minHeight: 480, backgroundColor: '#0b0912', icon: ICON, autoHideMenuBar: true, title: 'Diskord Call' } };
    if (isSignIn(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, icon: ICON, autoHideMenuBar: true, title: 'Sign in' } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', child => wire(child));
  win.webContents.on('will-navigate', (e, url) => { if (!/^(diskord|file):/.test(url)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

function createMain() {
  const b = state.bounds || {};
  main = new BrowserWindow({
    width: b.width || 1360, height: b.height || 860, x: b.x, y: b.y, minWidth: 900, minHeight: 600,
    backgroundColor: '#0b0912', icon: ICON, title: 'Diskord', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true }
  });
  if (state.maximized) main.maximize();
  wire(main);
  const keep = () => { if (!main.isMaximized() && !main.isMinimized()) state.bounds = main.getBounds(); state.maximized = main.isMaximized(); saveState(); };
  main.on('resize', keep); main.on('move', keep);

  let shown = false;
  const reveal = () => { if (shown) return; shown = true; setTimeout(() => { if (splash && !splash.isDestroyed()) splash.close(); splash = null; main.show(); }, 350); };
  main.webContents.on('did-start-loading', () => { if (mode === 'chat') status('Loading Diskord…'); });
  main.webContents.on('did-finish-load', reveal);
  setTimeout(reveal, 15000); // never get stuck on the splash

  main.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 = aborted (redirects)
    if (NET_ERRORS.has(code) || !net.isOnline()) showOffline(net.isOnline() ? 'server' : 'net');
    reveal();
  });
  main.webContents.on('page-title-updated', (e) => { e.preventDefault(); main.setTitle('Diskord'); });
  main.webContents.on('render-process-gone', () => { if (!quitting) route(); });
  main.on('closed', () => { main = null; });
}

function createSplash() {
  splash = new BrowserWindow({ width: 360, height: 420, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } });
  splash.loadFile(UI('splash.html'));
  splash.once('ready-to-show', () => splash && splash.show());
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('Diskord');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Diskord', click: () => { if (main) { main.show(); main.focus(); } } },
      { label: 'Reload', click: () => route() },
      { type: 'separator' },
      { label: 'Log out', click: async () => { const r = await dialog.showMessageBox(main, { type: 'question', buttons: ['Log out', 'Cancel'], defaultId: 1, title: 'Log out', message: 'Log out of Diskord?' }); if (r.response === 0) logout(); } },
      { label: 'Quit Diskord', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', () => { if (main) { main.show(); main.focus(); } });
  } catch (_) {}
}

app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.show(); main.focus(); } });

app.whenReady().then(async () => {
  loadState();
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'View', submenu: [
    { role: 'reload', accelerator: 'F5' }, { role: 'toggleDevTools', accelerator: 'Ctrl+Shift+I' },
    { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
    { label: 'Log out', click: () => logout() }] }]));
  protocol.handle('diskord', req => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  const ses = session.defaultSession;
  ses.setUserAgent(UA);
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => ['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  ses.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then(srcs => cb(srcs.length ? { video: srcs[0], audio: process.platform === 'win32' ? 'loopback' : undefined } : {})).catch(() => cb({}));
  });
  createSplash();
  status('Checking connection…');
  createMain();
  createTray();
  await new Promise(r => setTimeout(r, 900)); // let the splash show for a moment
  route();
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());
