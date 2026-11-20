// Diskord ⇄ Diskord server connector.
// Shows Diskord's own Server / Log in / Sign up screens, then gives the app the small API it uses
// (db, user, room, assets), all talking to YOUR Diskord server over a WebSocket. No Google, no Firebase.
(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k) { try { return localStorage.getItem('diskord.' + k); } catch (_) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem('diskord.' + k) : localStorage.setItem('diskord.' + k, v); } catch (_) {} } };

// Server address: same website the app came from, or the one baked into the desktop app, or the one the user typed.
const fromPage = /^https?:$/.test(location.protocol) ? location.origin : '';
const baked = (window.DISKORD_SERVER || '').trim();
let SERVER = (store.get('server') || baked || fromPage).replace(/\/+$/, '');
const wsUrl = base => base.replace(/^http/, 'ws') + '/ws';
window.diskordServer = () => SERVER;

let ready, resolveReady;
ready = new Promise(r => { resolveReady = r; });
window.claude = { use: async name => { const api = await ready; return api ? api[name] || null : null; } };

// ------------------------------------------------------------ connection with auto-reconnect
let ws = null, wsOpen = false, nextRid = 1, hello = null, token = store.get('token');
const pending = new Map(), queue = [];
const subs = new Map(); // id -> {path, q, cb, err}
const evHandlers = {}; let peersCb = null, lastPresence = null, authed = false;
let backoff = 500, connectTimer = null;
const statusCbs = new Set();
const setConn = s => statusCbs.forEach(f => { try { f(s); } catch (_) {} });

function connect() {
  clearTimeout(connectTimer);
  if (!SERVER) return;
  try { ws = new WebSocket(wsUrl(SERVER)); } catch (_) { return retry(); }
  ws.onopen = async () => {
    wsOpen = true; backoff = 500;
    try {
      hello = await rawCall('hello', {}); window.DISKORD_TENOR = hello.tenorKey || '';
      if (token) { try { await rawCall('auth', { token }); authed = true; } catch (e) { token = null; store.set('token', null); authed = false; } }
      if (authed) await resume();
    } catch (_) {}
    for (const q of queue.splice(0)) q();
    setConn('online');
    if (onConnected) { const f = onConnected; onConnected = null; f(); }
  };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.t === 'res') { const p = pending.get(m.rid); if (!p) return; pending.delete(m.rid); m.err ? p.rej(Object.assign(new Error(m.err.message), { code: m.err.code })) : p.res(m.result); }
    else if (m.t === 'snap') { const s = subs.get(m.id); if (s) s.deliver(m); }
    else if (m.t === 'peers') { lastPeers = m.peers || []; emitPeers(); }
    else if (m.t === 'ev') (evHandlers[m.topic] || []).forEach(h => { try { h({ by: m.by, data: m.data, sameTab: false }); } catch (_) {} });
  };
  ws.onclose = () => { wsOpen = false; for (const [, p] of pending) p.rej(Object.assign(new Error('Connection lost'), { code: 'unavailable' })); pending.clear(); setConn('offline'); retry(); };
  ws.onerror = () => {};
}
function retry() { clearTimeout(connectTimer); connectTimer = setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 8000); }
addEventListener('online', () => { if (!wsOpen) { backoff = 300; connect(); } });
let onConnected = null;
function rawCall(op, a) {
  return new Promise((res, rej) => {
    const rid = nextRid++;
    pending.set(rid, { res, rej });
    ws.send(JSON.stringify({ op, rid, a }));
    setTimeout(() => { if (pending.has(rid)) { pending.delete(rid); rej(Object.assign(new Error('The server did not answer'), { code: 'unavailable' })); } }, 20000);
  });
}
// call: waits while offline (like messages that send when you're back)
const call = (op, a) => wsOpen ? rawCall(op, a) : new Promise((res, rej) => queue.push(() => rawCall(op, a).then(res, rej)));
async function resume() {
  for (const [id, s] of subs) rawCall('sub', { id, path: s.path, q: s.q }).catch(e => s.err && s.err(e));
  if (lastPresence) rawCall('presence', { data: lastPresence }).catch(() => {});
}
let lastPeers = [];
function emitPeers() { if (peersCb) peersCb({ peers: lastPeers.map(p => ({ ...p, isMe: p.by === myUid, sameTab: false })), joined: [], left: [], updated: [] }); }
let myUid = null;

const AUTH_CSS = `
#auth{position:fixed;inset:0;z-index:200;display:grid;grid-template-columns:1.05fr .95fr;background:radial-gradient(ellipse at 15% -10%,rgba(166,77,255,.28),transparent 55%),radial-gradient(ellipse at 100% 110%,rgba(255,77,125,.2),transparent 50%),#0b0912;color:#f3effc;font-family:'Plus Jakarta Sans',system-ui,sans-serif}
#auth .l{display:flex;flex-direction:column;justify-content:center;padding:60px 70px;gap:18px}
#auth .l .lg{width:84px;filter:drop-shadow(0 12px 32px rgba(177,77,255,.5))}
#auth h1{font-size:46px;line-height:1.05;font-weight:800;letter-spacing:-1.2px}
#auth h1 span{background:linear-gradient(135deg,#ff4d7d,#5b5cf6);-webkit-background-clip:text;color:transparent}
#auth .lead{color:#a39cbd;font-size:16px;line-height:1.6;max-width:440px}
#auth .ft{display:grid;gap:10px;color:#a39cbd;font-size:14px}#auth .ft b{color:#f3effc}
#auth .r{display:grid;place-items:center;padding:30px}
#auth .card{width:100%;max-width:410px;background:#171325;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.45);animation:aIn .4s ease}
@keyframes aIn{from{opacity:0;transform:translateY(10px)}}
#auth .tabs{display:flex;background:#0b0912;border-radius:12px;padding:4px;margin-bottom:20px}
#auth .tabs button{flex:1;padding:10px;border-radius:9px;font-weight:700;color:#a39cbd;background:none;border:0;cursor:pointer;font:inherit;font-weight:700}
#auth .tabs button.on{background:#1f1a31;color:#f3effc}
#auth h2{font-size:22px;margin-bottom:4px}#auth p.s{color:#a39cbd;font-size:14px;margin-bottom:18px;line-height:1.5}
#auth label{display:block;font-size:11.5px;font-weight:800;color:#a39cbd;text-transform:uppercase;letter-spacing:.6px;margin:12px 0 7px}
#auth input{width:100%;padding:12px 14px;border-radius:10px;border:0;background:#0b0912;color:#f3effc;outline:none;font:inherit;font-size:15px}
#auth input:focus{box-shadow:0 0 0 2px #a64dff}
#auth .go{width:100%;margin-top:20px;padding:14px;border-radius:12px;border:0;cursor:pointer;background:linear-gradient(135deg,#ff4d7d,#5b5cf6);color:#fff;font:inherit;font-weight:800;font-size:15.5px;box-shadow:0 10px 28px rgba(166,77,255,.35)}
#auth .go:disabled{opacity:.6;cursor:default}
#auth .lnk{background:none;border:0;color:#8ab4ff;cursor:pointer;font:inherit;font-size:13px;padding:0;margin-top:10px}
#auth .err{background:rgba(255,77,94,.12);border:1px solid rgba(255,77,94,.4);color:#ffb3bb;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-top:14px}
#auth .ok{background:rgba(43,217,138,.12);border:1px solid rgba(43,217,138,.4);color:#a8f0cd;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-top:14px}
#auth .pw{position:relative}#auth .pw button{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:#a39cbd;cursor:pointer;font-size:12px;font-weight:700}
#auth .meter{height:4px;border-radius:2px;background:#2a2342;margin-top:7px;overflow:hidden}#auth .meter i{display:block;height:100%;width:0;transition:.2s}
#auth code{background:#0b0912;padding:2px 6px;border-radius:5px;font-size:12.5px}
@media(max-width:900px){#auth{grid-template-columns:1fr}#auth .l{display:none}}`;
const LOGO_SVG = '<svg viewBox="0 0 64 64" class="lg"><defs><linearGradient id="adk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d7d"/><stop offset=".55" stop-color="#b14dff"/><stop offset="1" stop-color="#5b5cf6"/></linearGradient></defs><path d="M32 4C16.5 4 5 14.6 5 28.6c0 7.6 3.4 14.3 9 18.9L12 60l12.6-7.4c2.4.6 4.8.9 7.4.9 15.5 0 27-10.6 27-24.9S47.5 4 32 4z" fill="url(#adk)"/><path d="M20 17h10.5C40 17 46 22 46 29.5S40 42 30.5 42H20zm7 6v13h3.4c5 0 8.4-2.6 8.4-6.5S35.4 23 30.4 23z" fill="#fff"/><rect x="29" y="26.5" width="2.6" height="6" rx="1.3" fill="#ffd84a"/><rect x="33" y="24.5" width="2.6" height="10" rx="1.3" fill="#ffd84a"/></svg>';

const ERR = {
  'invalid-credential': 'Wrong email/username or password.',
  'already-exists': null, 'invalid-argument': null, 'permission-denied': null,
  'resource-exhausted': 'Too many tries. Wait a few minutes and try again.',
  'unavailable': 'Can\'t reach the Diskord server. Check your internet, or the server address.',
  'unauthenticated': 'Please log in again.'
};
const niceErr = e => (e && ERR[e.code]) || (e && e.message) || 'Something went wrong.';

function showAuth(tab) {
  if (!document.getElementById('authCss')) { const st = document.createElement('style'); st.id = 'authCss'; st.textContent = AUTH_CSS; document.head.appendChild(st); }
  let el = $('auth');
  if (!el) { el = document.createElement('div'); el.id = 'auth'; document.body.appendChild(el); }
  const sp = $('splash'); if (sp) sp.classList.add('hidden');
  el.innerHTML = `<div class="l">${LOGO_SVG}<h1>Welcome to <span>${esc((hello && hello.name) || 'Diskord')}</span></h1><p class="lead">Your servers, your crew — chat, GIFs, voice calls, video calls and screen sharing in one app.</p>
    <div class="ft"><div>💬 <b>Servers & channels</b> with custom emoji and GIFs</div><div>📞 <b>Voice & video calls</b> with screen share</div><div>🛡️ <b>Owners & co-owners</b> to run your server</div></div></div>
    <div class="r"><div class="card" id="aCard"></div></div>`;
  draw(tab || 'login');
}
function draw(tab) {
  const c = $('aCard');
  const tabs = `<div class="tabs"><button data-t="login" class="${tab === 'login' ? 'on' : ''}">Log in</button><button data-t="signup" class="${tab === 'signup' ? 'on' : ''}">Sign up</button></div>`;
  const serverLine = `<button type="button" class="lnk" id="aSrv" style="display:block;margin-top:14px">🌐 Server: ${esc(SERVER.replace(/^https?:\/\//, '') || 'not set')} — change</button>`;
  if (tab === 'server') {
    c.innerHTML = `<h2>Connect to a server 🌐</h2><p class="s">Type the address of your Diskord server — the owner gets it when they start the server (for example <code>123.45.67.89:3000</code> or <code>chat.mydomain.com</code>).</p>
      <form id="aForm"><label>Server address</label><input id="aAddr" placeholder="123.45.67.89:3000" value="${esc(SERVER.replace(/^https?:\/\//, ''))}" autocomplete="url"><div id="aMsg"></div><button class="go" id="aGo">Connect</button></form>`;
  } else if (tab === 'login') c.innerHTML = tabs + `<h2>Welcome back! 👋</h2><p class="s">We're so excited to see you again.</p>
    <form id="aForm"><label>Email or username</label><input id="aEmail" autocomplete="username" required>
    <label>Password</label><div class="pw"><input id="aPass" type="password" autocomplete="current-password" required><button type="button" id="aEye">SHOW</button></div>
    <button type="button" class="lnk" id="aForgot">Forgot your password?</button>
    <div id="aMsg"></div><button class="go" id="aGo">Log in</button></form>` + serverLine;
  else if (tab === 'signup') c.innerHTML = tabs + `<h2>Create an account ✨</h2><p class="s">${hello && hello.allowSignup === false ? 'Sign-ups are closed on this server.' : 'Free forever. Takes 20 seconds.'}</p>
    <form id="aForm"><label>Display name</label><input id="aName" maxlength="32" autocomplete="nickname" required placeholder="What should everyone call you?">
    <label>Username</label><input id="aUser" maxlength="24" autocomplete="username" required placeholder="lowercase, e.g. bandera">
    <label>Email</label><input id="aEmail" type="email" autocomplete="email" required>
    <label>Password</label><div class="pw"><input id="aPass" type="password" autocomplete="new-password" minlength="6" required placeholder="At least 6 characters"><button type="button" id="aEye">SHOW</button></div><div class="meter"><i id="aMeter"></i></div>
    <div id="aMsg"></div><button class="go" id="aGo">Create account</button></form>` + serverLine;
  else if (tab === 'reset') c.innerHTML = `<h2>Forgot your password? 🔑</h2><p class="s">Ask the owner of this Diskord server to reset it. They type <code>resetpw yourname newpassword</code> in the server console, then you log in with the new password and change it in Settings.</p><button class="lnk" id="aBack">← Back to log in</button>`;
  c.querySelectorAll('[data-t]').forEach(b => b.onclick = () => draw(b.dataset.t));
  const eye = $('aEye'); if (eye) eye.onclick = () => { const p = $('aPass'); p.type = p.type === 'password' ? 'text' : 'password'; eye.textContent = p.type === 'password' ? 'SHOW' : 'HIDE'; };
  const meter = $('aMeter'); if (meter) $('aPass').oninput = e => { const v = e.target.value; const sc = (v.length >= 6) + (v.length >= 10) + /[A-Z]/.test(v) + /[0-9]/.test(v) + /[^A-Za-z0-9]/.test(v); meter.style.width = sc * 20 + '%'; meter.style.background = ['#ff4d5e', '#ff4d5e', '#ffb020', '#ffb020', '#2bd98a', '#2bd98a'][sc]; };
  if ($('aForgot')) $('aForgot').onclick = () => draw('reset');
  if ($('aBack')) $('aBack').onclick = () => draw('login');
  if ($('aSrv')) $('aSrv').onclick = () => draw('server');
  const msg = (t, ok) => { const m = $('aMsg'); if (m) m.innerHTML = t ? `<div class="${ok ? 'ok' : 'err'}">${esc(t)}</div>` : ''; };
  const form = $('aForm'); if (!form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const go = $('aGo'), label = go.textContent; go.disabled = true; go.textContent = 'Please wait…'; msg('');
    try {
      if (tab === 'server') {
        let v = $('aAddr').value.trim().replace(/\/+$/, '');
        if (!v) throw { message: 'Type the server address.' };
        if (!/^https?:\/\//.test(v)) v = (/^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(v) || /:\d+$/.test(v) ? 'http://' : 'https://') + v;
        const r = await fetch(v + '/api/health', { cache: 'no-store' }).then(x => x.json()).catch(() => null);
        if (!r || !r.ok) throw { message: 'No Diskord server answered at that address. Check the address and that the server is running.' };
        SERVER = v; store.set('server', v); try { ws && ws.close(); } catch (_) {} connect();
        msg(`Connected to ${r.name} ✅`, true); setTimeout(() => draw('login'), 500); return;
      }
      if (!wsOpen) throw { code: 'unavailable' };
      let res;
      if (tab === 'login') res = await rawCall('login', { email: $('aEmail').value, password: $('aPass').value });
      else res = await rawCall('signup', { name: $('aName').value, username: $('aUser').value, email: $('aEmail').value, password: $('aPass').value });
      token = res.token; store.set('token', token); authed = true;
      start();
    } catch (er) { msg(niceErr(er)); go.disabled = false; go.textContent = label; }
  };
  setTimeout(() => { const f = c.querySelector('input'); if (f) f.focus(); }, 30);
}

// ------------------------------------------------------------ boot
let started = false;
async function start() {
  if (started) return; started = true;
  const a = $('auth'); if (a) a.remove();
  const sp = $('splash'); if (sp) sp.classList.remove('hidden');
  const me = await call('me', {});
  myUid = me.id;
  resolveReady(makeApi(me));
}
window.diskordLogout = async () => { try { await call('logout', { token }); } catch (_) {} store.set('token', null); location.reload(); };
window.diskordChangeServer = () => { store.set('server', null); store.set('token', null); location.reload(); };
window.diskordOnConn = cb => { statusCbs.add(cb); };
document.addEventListener('DOMContentLoaded', () => {
  if (!SERVER) return showAuth('server');
  onConnected = () => { if (authed) start(); else showAuth('login'); };
  connect();
  setTimeout(() => { if (!wsOpen && !started && !$('auth')) { showAuth(token ? 'login' : 'login'); const m = $('aMsg'); if (m) m.innerHTML = '<div class="err">Can\'t reach the Diskord server right now. Is it running? It will connect by itself when it comes back.</div>'; } }, 6000);
});

// ------------------------------------------------------------ Firestore-like database API backed by the server
function snapOfDocs(docs, prevIds) {
  const list = docs.map(d => ({ id: d.id, exists: true, data: () => JSON.parse(JSON.stringify(d.data)) }));
  const changes = list.filter(d => !prevIds.has(d.id)).map(d => ({ type: 'added', doc: d }));
  return { docs: list, size: list.length, empty: !list.length, forEach: f => list.forEach(f), docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } };
}
const docSnap = d => ({ id: d.id, exists: !!d.exists, data: () => d.exists ? JSON.parse(JSON.stringify(d.data)) : undefined });
let subSeq = 1;
function docRef(path) {
  return {
    id: path.split('/').pop(), path,
    get: () => call('get', { path }).then(docSnap),
    set: (data, opts) => call('write', { op: 'set', path, data, merge: !!(opts && opts.merge) }),
    update: data => call('write', { op: 'update', path, data }),
    delete: () => call('write', { op: 'delete', path }),
    collection: p => colRef(path + '/' + p),
    onSnapshot(cb, errCb) {
      const id = 's' + subSeq++;
      subs.set(id, { path, deliver: m => cb(docSnap(m.doc)), err: errCb });
      call('sub', { id, path }).catch(e => errCb && errCb(e));
      return () => { subs.delete(id); if (wsOpen) rawCall('unsub', { id }).catch(() => {}); };
    }
  };
}
const autoId = () => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; const r = crypto.getRandomValues(new Uint8Array(20)); for (const x of r) s += a[x % a.length]; return s; };
function colRef(path, q = {}) {
  const self = {
    path,
    where: (f, op, v) => colRef(path, { ...q, where: [...(q.where || []), [f, op, v]] }),
    orderBy: (f, dir = 'asc') => colRef(path, { ...q, orderBy: [f, dir] }),
    limit: n => colRef(path, { ...q, limit: n }),
    doc: id => docRef(path + '/' + (id || autoId())),
    async add(data) { const r = self.doc(); await r.set(data); return r; },
    get: () => call('get', { path, q }).then(r => snapOfDocs(r.docs || [], new Set())),
    onSnapshot(cb, errCb) {
      const id = 's' + subSeq++;
      let prev = new Set();
      subs.set(id, { path, q, deliver: m => { const snap = snapOfDocs(m.docs || [], prev); prev = new Set((m.docs || []).map(d => d.id)); cb(snap); }, err: errCb });
      call('sub', { id, path, q }).catch(e => errCb && errCb(e));
      return () => { subs.delete(id); if (wsOpen) rawCall('unsub', { id }).catch(() => {}); };
    }
  };
  return self;
}

function makeApi(meInfo) {
  const uid = meInfo.id;
  const pcache = {};
  const db = { doc: docRef, collection: p => colRef(p) };
  const user = {
    async id() { return uid; },
    async me() { const m = await call('me', {}); pcache[uid] = { name: m.name, color: m.color, username: m.username, avatarUrl: '' }; return { ...m, avatarUrl: '', isMe: true }; },
    async profiles(ids) {
      const need = [].concat(ids).filter(id => !pcache[id]);
      if (need.length) { const r = await call('profiles', { ids: need }); for (const [id, p] of Object.entries(r)) pcache[id] = { name: p.name, color: p.color, username: p.username, avatarUrl: '' }; }
      const out = {}; for (const id of [].concat(ids)) out[id] = { id, ...(pcache[id] || { name: 'User', color: '#8b5cf6', username: '' }) }; return out;
    },
    async rename(name) { await db.doc('users/' + uid).set({ name }, { merge: true }); pcache[uid] = { ...(pcache[uid] || {}), name }; },
    async setColor(color) { await db.doc('users/' + uid).set({ color }, { merge: true }); pcache[uid] = { ...(pcache[uid] || {}), color }; },
    async setUsername(name) { const r = await call('setUsername', { name }); pcache[uid] = { ...(pcache[uid] || {}), username: r.name }; return r.name; },
    async findUsername(name) { const r = await call('findUsername', { name }); return r.uid; },
    async changePassword(old, pw) { const r = await call('changePassword', { old, password: pw }); token = r.token; store.set('token', token); },
    async can() { return true; },
    forget(id) { delete pcache[id]; }
  };
  const room = {
    async presence(p) { lastPresence = p || {}; await call('presence', { data: lastPresence }); },
    onPeers(cb) { peersCb = cb; emitPeers(); return () => { peersCb = null; }; },
    on(topic, h) { (evHandlers[topic] = evHandlers[topic] || []).push(h); return () => {}; },
    async emit(topic, data) { await call('emit', { topic, data: data || {} }); }
  };
  const assets = {
    async upload(file) {
      const r = await fetch(SERVER + '/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      return { id: j.id, url: SERVER + '/blob/' + j.id, sizeBytes: j.size, contentType: j.type };
    }
  };
  return { db, user, room, assets, hello };
}
})();
