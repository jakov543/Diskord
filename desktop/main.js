// Diskord desktop app
// splash -> (offline screen | welcome / log in / sign up | chat). Calls open in their own window with mic, camera and screen share.
const { app, BrowserWindow, shell, session, desktopCapturer, Menu, Tray, ipcMain, net, dialog, nativeImage, protocol } = require('electron');
const { pathToFileURL } = require('url');
const DiscordRPC = require('./discord');
const DISCORD_APP_ID = '1571423751231373405';
const RPC_LOGO = 'https://raw.githubusercontent.com/jakov543/Diskord/main/icons/icon-512.png';
let rpc = null, rpcStart = Date.now(), rpcLast = null;
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (_) {}
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
// ---------------------------------------------------------------- Discord Rich Presence
const clip = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
function setPresence(p) {
  rpcLast = p || rpcLast || {};
  if (!rpc) return;
  if (state.rpcOff) return rpc.clear();
  const a = rpcLast;
  const inCall = !!a.call;
  rpc.setActivity({
    details: clip(a.details, 100) || 'Using Diskord',
    state: clip(a.state, 100) || 'Chatting with friends',
    timestamps: { start: inCall && a.callStart ? a.callStart : rpcStart },
    assets: { large_image: RPC_LOGO, large_text: 'Diskord ' + app.getVersion(), small_image: inCall ? 'https://raw.githubusercontent.com/jakov543/Diskord/main/icons/icon-192.png' : undefined, small_text: inCall ? (a.video ? 'In a video call' : 'In a voice call') : undefined },
    buttons: [{ label: 'Get Diskord', url: 'https://github.com/jakov543/Diskord/releases/latest' }],
    instance: false
  });
}
ipcMain.on('presence', (e, p) => {
  if (!fromLocal(e) || !p || typeof p !== 'object') return;
  setPresence({ details: clip(p.details, 100), state: clip(p.state, 100), call: !!p.call, video: !!p.video, callStart: Number(p.callStart) || 0 });
});
function toggleRpc() { state.rpcOff = !state.rpcOff; saveState(); setPresence(); createTray(); }
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true, allowRunningInsecureContent: true }
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
  splash = new BrowserWindow({ width: 320, height: 320, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } });
  splash.loadFile(UI('splash.html'));
  splash.once('ready-to-show', () => splash && splash.show());
}

function createTray() {
  try {
    if (tray) { try { tray.destroy(); } catch (_) {} }
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('Diskord');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Diskord', click: () => { if (main) { main.show(); main.focus(); } } },
      { label: 'Reload', click: () => route() },
      { label: 'Show on Discord (Rich Presence)', type: 'checkbox', checked: !state.rpcOff, click: () => toggleRpc() },
      { label: 'Check for updates', click: () => checkForUpdatesNow() },
      { label: "What's new", click: () => dialog.showMessageBox(main, { type: 'info', title: "What's new", message: 'Diskord ' + app.getVersion(), detail: notesFor(app.getVersion()) || 'New features and fixes.' }) },
      { type: 'separator' },
      { label: 'Log out', click: async () => { const r = await dialog.showMessageBox(main, { type: 'question', buttons: ['Log out', 'Cancel'], defaultId: 1, title: 'Log out', message: 'Log out of Diskord?' }); if (r.response === 0) logout(); } },
      { label: 'Quit Diskord', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', () => { if (main) { main.show(); main.focus(); } });
  } catch (_) {}
}

// ---------------------------------------------------------------- updates
let manualCheck = false, updateReady = false, phase = 'startup', startupDone = null, startupDownloading = false;
function notesFor(version) {
  try {
    const md = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8');
    const part = md.split(/^## /m).find(p => p.startsWith(version));
    return part ? part.split('\n').slice(1).join('\n').replace(/^### /gm, '').replace(/\*\*/g, '').trim() : '';
  } catch (_) { return ''; }
}
function setupUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('download-progress', p => { if (phase === 'startup') status(`Downloading update… ${Math.round(p.percent || 0)}%`); });
  autoUpdater.on('update-available', info => { if (phase === 'startup') { startupDownloading = true; status('Downloading update ' + info.version + '… 0%'); return; } if (manualCheck) dialog.showMessageBox(main, { type: 'info', title: 'Update found', message: `Diskord ${info.version} is downloading…`, detail: 'You can keep chatting. We\'ll ask you to restart when it\'s ready.' }); });
  autoUpdater.on('update-not-available', () => { if (phase === 'startup' && startupDone) return startupDone(false); if (manualCheck) dialog.showMessageBox(main, { type: 'info', title: 'No updates', message: 'You have the newest Diskord (' + app.getVersion() + ').' }); manualCheck = false; });
  autoUpdater.on('error', err => { if (phase === 'startup' && startupDone) return startupDone(false); if (manualCheck) dialog.showMessageBox(main, { type: 'warning', title: 'Update check failed', message: 'Couldn\'t check for updates right now.', detail: String(err && err.message || err).slice(0, 300) }); manualCheck = false; });
  autoUpdater.on('update-downloaded', async info => {
    updateReady = true; manualCheck = false;
    if (phase === 'startup' && startupDone) { status('Installing update…'); setTimeout(() => { quitting = true; autoUpdater.quitAndInstall(true, true); }, 700); return startupDone(true); }
    const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes.replace(/<[^>]+>/g, '').trim() : '';
    const r = await dialog.showMessageBox(main, { type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, title: 'Update ready', message: `Diskord ${info.version} is ready to install 🎉`, detail: (notes || 'New features and fixes.').slice(0, 1200) + '\n\nRestart now to update? (If you pick Later, it installs when you close Diskord.)' });
    if (r.response === 0) { quitting = true; setImmediate(() => autoUpdater.quitAndInstall(false, true)); }
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setInterval(check, 3 * 3600e3);
}
// Like Discord: check for updates on the loading window before the app opens.
function startupUpdate() {
  return new Promise(resolve => {
    if (!autoUpdater || !app.isPackaged || !net.isOnline()) return resolve(false);
    let done = false;
    startupDone = updated => { if (done) return; done = true; startupDone = null; resolve(updated); };
    status('Checking for updates…');
    // Give the check 8 s; once a download has started, wait for it (up to 3 minutes).
    setTimeout(() => { if (!startupDownloading && startupDone) startupDone(false); }, 8000);
    setTimeout(() => { if (startupDone) startupDone(false); }, 180000);
    autoUpdater.checkForUpdates().catch(() => startupDone && startupDone(false));
  });
}
function checkForUpdatesNow() {
  if (!autoUpdater || !app.isPackaged) return dialog.showMessageBox(main, { type: 'info', message: 'Updates work in the installed app.' });
  if (updateReady) return autoUpdater.quitAndInstall(false, true);
  manualCheck = true; autoUpdater.checkForUpdates().catch(() => {});
}
function whatsNew() {
  const v = app.getVersion();
  if (state.lastVersion && state.lastVersion !== v) {
    const notes = notesFor(v);
    setTimeout(() => main && dialog.showMessageBox(main, { type: 'info', title: "What's new", message: `Diskord updated to ${v} ✨`, detail: notes || 'New features and fixes.' }), 2500);
  }
  state.lastVersion = v; saveState();
}

app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.show(); main.focus(); } });

app.whenReady().then(async () => {
  loadState();
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'View', submenu: [
    { role: 'reload', accelerator: 'F5' }, { role: 'toggleDevTools', accelerator: 'Ctrl+Shift+I' },
    { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
    { label: 'Check for updates', click: () => checkForUpdatesNow() },
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
  setupUpdates();
  await new Promise(r => setTimeout(r, 700));
  const updating = await startupUpdate();
  phase = 'running';
  if (updating) return; // the new version installs and Diskord restarts by itself
  status(net.isOnline() ? 'Starting Diskord…' : 'No internet — starting offline…');
  createMain();
  rpc = new DiscordRPC(DISCORD_APP_ID); rpc.start(); setPresence({ details: 'Using Diskord', state: 'Starting up…' });
  createTray();
  whatsNew();
  route();
});
app.on('before-quit', () => { quitting = true; try { rpc && rpc.stop(); } catch (_) {} });
app.on('window-all-closed', () => app.quit());
