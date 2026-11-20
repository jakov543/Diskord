// Diskord desktop app
// splash -> (offline screen | welcome / log in / sign up | chat). Calls open in their own window with mic, camera and screen share.
const { app, BrowserWindow, shell, session, desktopCapturer, Menu, Tray, ipcMain, net, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const CHAT_URL = 'https://claude.ai/artifact/JmfsXjNXdnXfMiNrJP5a3t';
const LOGIN_URL = 'https://claude.ai/login';
const CALL_PREFIX = 'https://jakov543.github.io/Diskord/';
const UI = f => path.join(__dirname, 'ui', f);
const ICON = path.join(__dirname, 'build', 'icon.png');
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
const SIGN_IN_HOSTS = ['claude.ai', 'anthropic.com', 'accounts.google.com', 'appleid.apple.com'];
const NET_ERRORS = new Set([-2, -7, -21, -100, -101, -102, -104, -105, -106, -109, -118, -130, -137, -138]);

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('com.jakov543.diskord');

// ---------------------------------------------------------------- saved state
const stateFile = () => path.join(app.getPath('userData'), 'state.json');
let state = {};
const loadState = () => { try { state = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (_) { state = {}; } };
const saveState = () => { try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch (_) {} };

let main = null, splash = null, tray = null, mode = 'start', lastWanted = CHAT_URL, quitting = false;
const host = u => { try { return new URL(u).hostname; } catch (_) { return ''; } };
const isCall = u => u.startsWith(CALL_PREFIX);
const isSignIn = u => SIGN_IN_HOSTS.some(h => host(u) === h || host(u).endsWith('.' + h));
const fromLocal = e => { try { return (e.senderFrame && e.senderFrame.url || '').startsWith('file://'); } catch (_) { return false; } };
const status = t => { if (splash && !splash.isDestroyed()) splash.webContents.send('status', t); };

// ---------------------------------------------------------------- login state
async function hasSession() {
  try { const c = await session.defaultSession.cookies.get({ url: 'https://claude.ai' }); if (c.some(x => x.name === 'sessionKey' && x.value)) return true; } catch (_) {}
  return !!state.loggedIn;
}
async function logout() {
  state.loggedIn = false; saveState();
  try { await session.defaultSession.clearStorageData({ origin: 'https://claude.ai' }); } catch (_) {}
  try { const cs = await session.defaultSession.cookies.get({}); for (const c of cs) if (/claude\.ai|anthropic\.com/.test(c.domain)) await session.defaultSession.cookies.remove(`https://${c.domain.replace(/^\./, '')}${c.path}`, c.name); } catch (_) {}
  BrowserWindow.getAllWindows().forEach(w => { if (w !== main && w !== splash) w.close(); });
  showWelcome();
}

// ---------------------------------------------------------------- screens
function showWelcome(signup) { mode = 'welcome'; main.loadFile(UI('welcome.html'), signup ? { hash: 'signup' } : {}); }
function showOffline(reason) { if (mode === 'offline') return; mode = 'offline'; main.loadFile(UI('offline.html'), { query: { reason: reason || 'net' } }); }
function showChat() { mode = 'chat'; lastWanted = CHAT_URL; main.loadURL(CHAT_URL); }
function showLogin() { mode = 'login'; lastWanted = LOGIN_URL; main.loadURL(LOGIN_URL); }

async function route() {
  if (!net.isOnline()) return showOffline('net');
  if (await hasSession()) showChat(); else showWelcome();
}

ipcMain.on('version', e => { e.returnValue = app.getVersion(); });
ipcMain.on('login', e => { if (fromLocal(e)) showLogin(); });
ipcMain.on('signup', e => { if (fromLocal(e)) showLogin(); });
ipcMain.on('quit', e => { if (fromLocal(e)) { quitting = true; app.quit(); } });
ipcMain.on('retry', e => { if (!fromLocal(e)) return; if (!net.isOnline()) return; mode = 'retry'; if (lastWanted === LOGIN_URL) showLogin(); else route(); });

// ---------------------------------------------------------------- windows
function wire(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isCall(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 720, minWidth: 640, minHeight: 480, backgroundColor: '#0b0912', icon: ICON, autoHideMenuBar: true, title: 'Diskord Call' } };
    if (isSignIn(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, icon: ICON, autoHideMenuBar: true, title: 'Sign in' } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', child => wire(child));
  win.webContents.on('will-navigate', (e, url) => { if (!/^https?:|^file:/.test(url)) e.preventDefault(); });
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
  main.webContents.on('did-start-loading', () => { if (mode === 'chat') status('Loading your servers…'); if (mode === 'login') status('Opening log in…'); });
  main.webContents.on('did-finish-load', reveal);
  setTimeout(reveal, 15000); // never get stuck on the splash

  main.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 = aborted (redirects)
    if (NET_ERRORS.has(code) || !net.isOnline()) showOffline(net.isOnline() ? 'server' : 'net');
    reveal();
  });
  // Logged in? When claude.ai leaves the login pages, go to the chat.
  main.webContents.on('did-navigate', (e, url) => {
    if (host(url) !== 'claude.ai') return;
    const p = new URL(url).pathname;
    const onLogin = /^\/(login|signup|magic-link|oauth|verify|onboarding)/.test(p);
    if (mode === 'login' && !onLogin) { state.loggedIn = true; saveState(); showChat(); }
    else if (mode === 'chat' && onLogin) { state.loggedIn = false; saveState(); showWelcome(); }
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

// Watch the connection while the app is open.
let wasOnline = true;
setInterval(() => {
  if (!main) return;
  const on = net.isOnline();
  if (!on && wasOnline && mode !== 'offline') showOffline('net');
  wasOnline = on;
}, 4000);

app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.show(); main.focus(); } });

app.whenReady().then(async () => {
  loadState();
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'View', submenu: [
    { role: 'reload', accelerator: 'F5' }, { role: 'toggleDevTools', accelerator: 'Ctrl+Shift+I' },
    { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
    { label: 'Log out', click: () => logout() }] }]));
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
