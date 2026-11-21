// Diskord desktop app
// splash -> (offline screen | welcome / log in / sign up | chat). Calls open in their own window with mic, camera and screen share.
const { app, BrowserWindow, shell, session, desktopCapturer, Menu, Tray, ipcMain, net, dialog, nativeImage, protocol } = require('electron');
const { pathToFileURL } = require('url');
const DiscordRPC = require('./discord');
const DISCORD_APP_ID = '1571423751231373405';
// new file name so Discord doesn't keep showing its cached copy of the old logo
const RPC_LOGO = 'https://raw.githubusercontent.com/jakov543/Diskord/main/icons/rpc-logo-v2.png';
const RPC_STATUS = s => ['online', 'idle', 'dnd'].includes(s) ? `https://raw.githubusercontent.com/jakov543/Diskord/main/icons/status-${s}.png` : undefined;
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
// custom update popup inside the Diskord window
const toApp = u => { try { if (main && !main.isDestroyed()) main.webContents.send('update', u); } catch (_) {} };
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
// Picture / GIF uploads go to catbox.moe (free, no account) so they can be bigger than the network allows.
ipcMain.handle('upload', async (e, a) => {
  if (!fromLocal(e) || !a || !(a.buf instanceof Uint8Array)) throw new Error('bad request');
  if (!/^image\/(png|jpeg|gif|webp)$/.test(a.type) || a.buf.length > 15 * 1024 * 1024) throw new Error('Pictures can be PNG, JPG, GIF or WebP up to 15 MB');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[a.type];
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', new Blob([a.buf], { type: a.type }), 'diskord.' + ext);
  const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd });
  const t = (await r.text()).trim();
  if (!r.ok || !/^https:\/\/files\.catbox\.moe\/[A-Za-z0-9]+\.(png|jpg|gif|webp)$/.test(t)) throw new Error('Upload failed');
  return t;
});
// ---------------------------------------------------------------- Discord Rich Presence
const clip = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
const img = v => typeof v === 'string' && /^https:\/\/[^\s"']+$/.test(v) && v.length < 256 ? v : undefined;
function setPresence(p) {
  rpcLast = p || rpcLast || {};
  if (!rpc) return;
  const a = rpcLast;
  if (state.rpcOff || a.off) return rpc.clear();
  const inCall = !!a.call;
  const party = Array.isArray(a.party) && a.party[0] > 0 && a.party[1] >= a.party[0] ? { id: 'diskord-' + (inCall ? 'call' : 'srv'), size: [a.party[0], a.party[1]] } : undefined;
  const buttons = [];
  if (a.joinUrl) buttons.push({ label: a.joinLabel || 'Join server', url: a.joinUrl });
  buttons.push({ label: 'Get Diskord', url: 'https://github.com/jakov543/Diskord/releases/latest' });
  rpc.setActivity({
    type: 0,
    details: clip(a.details, 100) || 'Using Diskord',
    state: clip(a.state, 100) || 'Chatting with friends',
    timestamps: { start: inCall && a.callStart ? a.callStart : rpcStart },
    assets: {
      large_image: img(a.big) || RPC_LOGO, large_text: clip(a.bigText, 100) || ('Diskord ' + app.getVersion()),
      small_image: img(a.small) || RPC_STATUS(a.status), small_text: clip(a.smallText, 100) || (inCall ? (a.video ? 'In a video call' : 'In a voice call') : undefined)
    },
    party, buttons, instance: false
  });
}
ipcMain.on('presence', (e, p) => {
  if (!fromLocal(e) || !p || typeof p !== 'object') return;
  if (p.off) return setPresence({ off: true });
  const join = typeof p.joinUrl === 'string' && p.joinUrl.startsWith('https://jakov543.github.io/Diskord/?invite=dk-') && p.joinUrl.length < 120 ? p.joinUrl : '';
  setPresence({ details: clip(p.details, 100), state: clip(p.state, 100), call: !!p.call, video: !!p.video, callStart: Number(p.callStart) || 0,
    party: Array.isArray(p.party) ? p.party.slice(0, 2).map(n => Math.max(0, Math.min(999, Number(n) || 0))) : null,
    big: p.big, bigText: clip(p.bigText, 100), small: p.small, smallText: clip(p.smallText, 100), status: clip(p.status, 10), joinUrl: join, joinLabel: join ? clip(p.joinLabel, 32) : '' });
});
function toggleRpc() { state.rpcOff = !state.rpcOff; saveState(); setPresence(); createTray(); }
ipcMain.on('quit', e => { if (fromLocal(e)) { quitting = true; app.quit(); } });
ipcMain.on('retry', e => { if (fromLocal(e) && net.isOnline()) { mode = 'retry'; route(); } });

// ---------------------------------------------------------------- windows
function wire(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isCall(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 720, minWidth: 640, minHeight: 480, backgroundColor: '#0a0f1c', icon: ICON, autoHideMenuBar: true, title: 'Diskord Call', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } } };
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
    backgroundColor: '#0a0f1c', icon: ICON, title: 'Diskord', autoHideMenuBar: true, show: false,
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
      ...(updateReady ? [{ label: `⬆️ Restart to update to ${updateReady}`, click: () => { quitting = true; autoUpdater.quitAndInstall(true, true); } }] : []),
      { label: 'Check for updates', click: () => checkForUpdatesNow() },
      { label: "What's new", click: () => dialog.showMessageBox(main, { type: 'info', title: "What's new", message: 'Diskord ' + app.getVersion(), detail: notesFor(app.getVersion()) || 'New features and fixes.' }) },
      { type: 'separator' },
      { label: 'Log out', click: async () => { const r = await dialog.showMessageBox(main, { type: 'question', buttons: ['Log out', 'Cancel'], defaultId: 1, title: 'Log out', message: 'Log out of Diskord?' }); if (r.response === 0) logout(); } },
      { label: 'Quit Diskord', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', () => { if (main) { main.show(); main.focus(); } });
  } catch (_) {}
}

// ---------------------------------------------------------------- screen-share picker
// GIF search (KLIPY) from the app process, so it works whatever the site allows for browsers
ipcMain.handle('gif-fetch', async (e, url) => {
  if (!fromLocal(e) || typeof url !== 'string' || url.length > 800 || !url.startsWith('https://api.klipy.com/api/v1/')) return null;
  try { const r = await net.fetch(url); if (!r.ok) return { status: r.status }; const t = await r.text(); return t.length > 3e6 ? null : { status: 200, body: t }; } catch (_) { return null; }
});
// in-call picker: the call page asks for the list, then says which one to share
const sharePick = new Map(), shareLists = new Map();
ipcMain.handle('screen-sources', async e => {
  if (!fromLocal(e)) return [];
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 480, height: 270 }, fetchWindowIcons: true });
  const own = new Set(BrowserWindow.getAllWindows().map(w => w.getMediaSourceId && w.getMediaSourceId()));
  const keep = sources.filter(x => !own.has(x.id) && !/^Diskord( Call)?$/.test(x.name) && !/^Share your screen$/.test(x.name));
  shareLists.set(e.sender.id, keep);
  return keep.map(x => ({ id: x.id, name: x.name, type: x.id.startsWith('screen') ? 'screen' : 'window', thumb: x.thumbnail.toDataURL(), icon: x.appIcon ? x.appIcon.toDataURL() : '' }));
});
ipcMain.handle('share-source', (e, a) => {
  if (!fromLocal(e) || !a || typeof a.id !== 'string') return false;
  const src = (shareLists.get(e.sender.id) || []).find(x => x.id === a.id);
  if (!src) return false;
  sharePick.set(e.sender.id, { src, audio: !!a.audio, at: Date.now() });
  return true;
});
let pickerBusy = false;
async function openPicker(cb) {
  if (pickerBusy) return cb({});
  pickerBusy = true;
  let done = false;
  const finish = r => { if (done) return; done = true; pickerBusy = false; try { cb(r); } catch (_) {} };
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true });
  const own = new Set(BrowserWindow.getAllWindows().map(w => w.getMediaSourceId && w.getMediaSourceId()));
  const list = sources.filter(s => !own.has(s.id) && !/^Diskord( Call)?$/.test(s.name)).map(s => ({ id: s.id, name: s.name, type: s.id.startsWith('screen') ? 'screen' : 'window', thumb: s.thumbnail.toDataURL(), icon: s.appIcon ? s.appIcon.toDataURL() : '' }));
  const parent = BrowserWindow.getFocusedWindow() || undefined;
  const win = new BrowserWindow({ width: 820, height: 600, parent, modal: !!parent, resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true, backgroundColor: '#0f1729', icon: ICON, title: 'Share your screen',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } });
  const onChoice = (e, a) => {
    if (e.sender !== win.webContents) return;
    ipcMain.removeListener('picker-choice', onChoice);
    const src = a && a.id && sources.find(s => s.id === a.id);
    finish(src ? { video: src, audio: a.audio && process.platform === 'win32' ? 'loopback' : undefined } : {});
    if (!win.isDestroyed()) win.close();
  };
  ipcMain.on('picker-choice', onChoice);
  win.on('closed', () => { ipcMain.removeListener('picker-choice', onChoice); finish({}); });
  win.webContents.once('did-finish-load', () => win.webContents.send('sources', list));
  win.loadFile(UI('picker.html'));
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
  autoUpdater.on('download-progress', p => { if (phase === 'startup') return status(`Downloading update… ${Math.round(p.percent || 0)}%`); toApp({ state: 'downloading', version: dlVersion, percent: p.percent || 0 }); });
  let dlVersion = '';
  autoUpdater.on('update-available', info => { dlVersion = info.version; if (phase === 'startup') { startupDownloading = true; status('Downloading update ' + info.version + '… 0%'); return; } toApp({ state: 'downloading', version: info.version, percent: 0 }); });
  autoUpdater.on('update-not-available', () => { if (phase === 'startup' && startupDone) return startupDone(false); if (manualCheck) toApp({ state: 'latest', version: app.getVersion() }); manualCheck = false; });
  autoUpdater.on('error', err => { if (phase === 'startup' && startupDone) return startupDone(false); if (manualCheck) toApp({ state: 'error' }); manualCheck = false; });
  autoUpdater.on('update-downloaded', async info => {
    updateReady = info.version; manualCheck = false;
    if (phase === 'startup' && startupDone) { status('Installing update…'); setTimeout(() => { quitting = true; autoUpdater.quitAndInstall(true, true); }, 700); return startupDone(true); }
    // While Diskord is open: no popup. It installs by itself when Diskord closes, so it's ready the next time you open it.
    createTray();
    const rn = typeof info.releaseNotes === 'string' ? info.releaseNotes : Array.isArray(info.releaseNotes) ? info.releaseNotes.map(x => x && x.note || '').join('\n') : '';
    const fromGh = String(rn).replace(/<li>/gi, '\n- ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    toApp({ state: 'ready', version: info.version, notes: notesFor(info.version) || fromGh });
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
    setTimeout(() => { if (!startupDownloading && startupDone) startupDone(false); }, 15000);
    setTimeout(() => { if (startupDone) startupDone(false); }, 180000);
    autoUpdater.checkForUpdates().catch(() => startupDone && startupDone(false));
  });
}
function checkForUpdatesNow() {
  if (!autoUpdater || !app.isPackaged) return dialog.showMessageBox(main, { type: 'info', message: 'Updates work in the installed app.' });
  if (updateReady) return autoUpdater.quitAndInstall(false, true);
  manualCheck = true; autoUpdater.checkForUpdates().catch(() => {});
}
ipcMain.on('update-now', e => { if (fromLocal(e) && updateReady && autoUpdater) { quitting = true; autoUpdater.quitAndInstall(true, true); } });
ipcMain.on('update-check', e => { if (!fromLocal(e)) return; if (!autoUpdater || !app.isPackaged) return toApp({ state: 'latest', version: app.getVersion() }); if (updateReady) return toApp({ state: 'ready', version: updateReady, notes: notesFor(updateReady) || '' }); manualCheck = true; autoUpdater.checkForUpdates().catch(() => toApp({ state: 'error' })); });
function whatsNew() {
  const v = app.getVersion();
  if (state.lastVersion && state.lastVersion !== v) {
    const notes = notesFor(v);
    setTimeout(() => toApp({ state: 'installed', version: v, notes: notes || '' }), 4000);
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
  // Screen share: let the user pick a whole screen or one app window (like Discord).
  ses.setDisplayMediaRequestHandler((req, cb) => {
    // the call window already showed its own picker and told us what to share
    let wc = null; try { wc = req.frame && require('electron').webContents.fromFrame(req.frame); } catch (_) {}
    const p = wc && sharePick.get(wc.id);
    if (p && Date.now() - p.at < 15000) { sharePick.delete(wc.id); return cb({ video: p.src, audio: p.audio && process.platform === 'win32' ? 'loopback' : undefined }); }
    openPicker(cb).catch(() => cb({}));
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
