// Diskord desktop app: opens the Diskord chat, and opens calls in their own window with mic, camera and screen share allowed.
const { app, BrowserWindow, shell, session, desktopCapturer, Menu } = require('electron');
const path = require('path');

const CHAT_URL = 'https://claude.ai/artifact/JmfsXjNXdnXfMiNrJP5a3t';
const CALL_PREFIX = 'https://jakov543.github.io/Diskord/';
const ICON = path.join(__dirname, 'build', 'icon.png');
// A normal Chrome user agent, so sites don't treat the app as an unknown browser.
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
const SIGN_IN_HOSTS = ['claude.ai', 'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com'];

if (!app.requestSingleInstanceLock()) app.quit();
let main = null;
app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.focus(); } });

const isCall = u => u.startsWith(CALL_PREFIX);
const hostOf = u => { try { return new URL(u).hostname; } catch (_) { return ''; } };
const isSignIn = u => SIGN_IN_HOSTS.some(h => hostOf(u) === h || hostOf(u).endsWith('.' + h));

function wire(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isCall(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 720, minWidth: 640, minHeight: 480, backgroundColor: '#0b0912', icon: ICON, autoHideMenuBar: true, title: 'Diskord Call' } };
    if (isSignIn(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, icon: ICON, autoHideMenuBar: true } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', child => wire(child));
}

function createMain() {
  main = new BrowserWindow({ width: 1360, height: 860, minWidth: 900, minHeight: 600, backgroundColor: '#0b0912', icon: ICON, title: 'Diskord', autoHideMenuBar: true, show: false });
  wire(main);
  main.once('ready-to-show', () => main.show());
  main.loadURL(CHAT_URL);
  main.on('closed', () => { main = null; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const ses = session.defaultSession;
  ses.setUserAgent(UA);
  // Mic and camera for call windows (and notifications for the chat).
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => ['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  // Screen share: share the main screen (with system audio on Windows).
  ses.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then(srcs => cb({ video: srcs[0], audio: process.platform === 'win32' ? 'loopback' : undefined })).catch(() => cb({}));
  });
  createMain();
  app.on('activate', () => { if (!main) createMain(); });
});
app.on('window-all-closed', () => app.quit());
