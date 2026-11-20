// Diskord ⇄ Firebase connector.
// Shows Diskord's own Log in / Sign up screen, then gives the app the same small API it already uses
// (db, user, room, assets) backed by Firebase Auth + Cloud Firestore. No Claude account involved.
(() => {
'use strict';
const cfg = window.DISKORD_FIREBASE;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const USER_RE = /^[a-z0-9._]{2,24}$/;
const normUser = v => String(v || '').trim().toLowerCase().replace(/^@/, '');
async function claimUsername(uid, name, old) {
  const ref = fs.doc('usernames/' + name);
  await fs.runTransaction(async t => {
    const s = await t.get(ref);
    if (s.exists && s.data().uid !== uid) throw { message: `@${name} is taken — try another username.` };
    t.set(ref, { uid, at: Date.now() });
    t.set(fs.doc('users/' + uid), { username: name }, { merge: true });
  });
  if (old && old !== name) fs.doc('usernames/' + old).delete().catch(() => {});
}
const COLORS = ['#ff4d7d', '#a64dff', '#22c1ee', '#2bd98a', '#ffb020', '#ff7a45', '#5b5cf6', '#e94cd8'];

let ready, resolveReady;
ready = new Promise(r => { resolveReady = r; });
window.claude = { use: async name => { const api = await ready; return api ? api[name] || null : null; } };

if (!cfg || !cfg.apiKey || typeof firebase === 'undefined') {
  document.addEventListener('DOMContentLoaded', () => showAuth('setup'));
  return;
}

firebase.initializeApp(cfg);
const auth = firebase.auth();
const fs = firebase.firestore();
try { fs.settings({ ignoreUndefinedProperties: true, merge: true }); } catch (_) {}
try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (_) {}

// ------------------------------------------------------------ auth screen
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
  'auth/invalid-email': 'That email address doesn\'t look right.',
  'auth/missing-password': 'Type your password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email — sign up first.',
  'auth/email-already-in-use': 'There\'s already an account with that email. Log in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/network-request-failed': 'No internet connection. Check your Wi-Fi and try again.',
  'auth/operation-not-allowed': 'Email sign-in is turned off. In Firebase: Authentication → Sign-in method → enable Email/Password.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/configuration-not-found': 'Login isn\'t switched on in Firebase yet. Owner: Firebase console → Authentication → Get started → Sign-in method → turn on Email/Password.',
  'auth/admin-restricted-operation': 'New sign-ups are turned off. Owner: Firebase console → Authentication → Settings → User actions → allow "Enable create (sign-up)".',
  'auth/missing-email': 'Type your email.',
  'auth/invalid-api-key': 'Diskord\'s Firebase key is wrong — the owner needs to check firebase-config.js.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Diskord\'s Firebase key is wrong — the owner needs to check firebase-config.js.',
  'auth/app-not-authorized': 'This app isn\'t allowed to use the Firebase project. Owner: Authentication → Settings → Authorized domains.',
  'auth/unauthorized-domain': 'This website isn\'t allowed yet. Owner: Firebase → Authentication → Settings → Authorized domains → add this site.',
  'auth/internal-error': 'Firebase had a problem. Check that Authentication is set up (Get started) and Email/Password is on, then try again.',
  'permission-denied': 'Account made, but the database blocked it. Owner: Firestore Database → Rules → paste firestore.rules → Publish.'
};
const niceErr = e => {
  const code = e && (e.code || ((String(e.message || '').match(/\((auth\/[^)]+)\)/) || [])[1]));
  if (code && ERR[code]) return ERR[code];
  let m = e && e.message ? String(e.message).replace(/^Firebase:\s*/, '').replace(/\s*\(auth\/[^)]+\)\.?/, '').trim() : '';
  if (!m || m === 'Error') m = 'Something went wrong.';
  return code ? `${m} (${code})` : m;
};

function showAuth(tab) {
  if (!document.getElementById('authCss')) { const st = document.createElement('style'); st.id = 'authCss'; st.textContent = AUTH_CSS; document.head.appendChild(st); }
  let el = $('auth');
  if (!el) { el = document.createElement('div'); el.id = 'auth'; document.body.appendChild(el); }
  const sp = $('splash'); if (sp) sp.classList.add('hidden');
  el.innerHTML = `<div class="l">${LOGO_SVG}<h1>Welcome to <span>Diskord</span></h1><p class="lead">Your servers, your crew — chat, GIFs, voice calls, video calls and screen sharing in one app.</p>
    <div class="ft"><div>💬 <b>Servers & channels</b> with custom emoji and GIFs</div><div>📞 <b>Voice & video calls</b> with screen share</div><div>🛡️ <b>Owners & co-owners</b> to run your server</div></div></div>
    <div class="r"><div class="card" id="aCard"></div></div>`;
  draw(tab || 'login');
}
function draw(tab) {
  const c = $('aCard');
  if (tab === 'setup') {
    c.innerHTML = `<h2>Almost ready ⚙️</h2><p class="s">Diskord isn't connected to its Firebase project yet. The owner pastes the Firebase web config into <code>firebase-config.js</code>.</p>`;
    return;
  }
  const tabs = `<div class="tabs"><button data-t="login" class="${tab === 'login' ? 'on' : ''}">Log in</button><button data-t="signup" class="${tab === 'signup' ? 'on' : ''}">Sign up</button></div>`;
  if (tab === 'login') c.innerHTML = tabs + `<h2>Welcome back! 👋</h2><p class="s">We're so excited to see you again.</p>
    <form id="aForm"><label>Email</label><input id="aEmail" type="email" autocomplete="email" required>
    <label>Password</label><div class="pw"><input id="aPass" type="password" autocomplete="current-password" required><button type="button" id="aEye">SHOW</button></div>
    <button type="button" class="lnk" id="aForgot">Forgot your password?</button>
    <div id="aMsg"></div><button class="go" id="aGo">Log in</button></form>`;
  else if (tab === 'signup') c.innerHTML = tabs + `<h2>Create an account ✨</h2><p class="s">Free forever. Takes 20 seconds.</p>
    <form id="aForm"><label>Display name</label><input id="aName" maxlength="32" autocomplete="nickname" required placeholder="What should everyone call you?">
    <label>Username</label><input id="aUser" maxlength="24" autocomplete="username" required placeholder="lowercase, e.g. bandera">
    <label>Email</label><input id="aEmail" type="email" autocomplete="email" required>
    <label>Password</label><div class="pw"><input id="aPass" type="password" autocomplete="new-password" minlength="6" required placeholder="At least 6 characters"><button type="button" id="aEye">SHOW</button></div><div class="meter"><i id="aMeter"></i></div>
    <div id="aMsg"></div><button class="go" id="aGo">Create account</button></form>`;
  else if (tab === 'reset') c.innerHTML = `<h2>Reset your password 🔑</h2><p class="s">Type your email and we'll send you a link to make a new password.</p>
    <form id="aForm"><label>Email</label><input id="aEmail" type="email" autocomplete="email" required><div id="aMsg"></div><button class="go" id="aGo">Send reset link</button></form>
    <button class="lnk" id="aBack">← Back to log in</button>`;
  c.querySelectorAll('[data-t]').forEach(b => b.onclick = () => draw(b.dataset.t));
  const eye = $('aEye'); if (eye) eye.onclick = () => { const p = $('aPass'); p.type = p.type === 'password' ? 'text' : 'password'; eye.textContent = p.type === 'password' ? 'SHOW' : 'HIDE'; };
  const meter = $('aMeter'); if (meter) $('aPass').oninput = e => { const v = e.target.value; const sc = (v.length >= 6) + (v.length >= 10) + /[A-Z]/.test(v) + /[0-9]/.test(v) + /[^A-Za-z0-9]/.test(v); meter.style.width = sc * 20 + '%'; meter.style.background = ['#ff4d5e', '#ff4d5e', '#ffb020', '#ffb020', '#2bd98a', '#2bd98a'][sc]; };
  if ($('aForgot')) $('aForgot').onclick = () => draw('reset');
  if ($('aBack')) $('aBack').onclick = () => draw('login');
  const msg = (t, ok) => { $('aMsg').innerHTML = t ? `<div class="${ok ? 'ok' : 'err'}">${esc(t)}</div>` : ''; };
  $('aForm').onsubmit = async e => {
    e.preventDefault();
    const go = $('aGo'), label = go.textContent; go.disabled = true; go.textContent = 'Please wait…'; msg('');
    const email = $('aEmail').value.trim();
    try {
      if (tab === 'login') await auth.signInWithEmailAndPassword(email, $('aPass').value);
      else if (tab === 'signup') {
        const name = $('aName').value.trim().slice(0, 32);
        if (name.length < 2) throw { message: 'Pick a display name (2+ letters).' };
        const uname = normUser($('aUser').value);
        if (!USER_RE.test(uname)) throw { message: 'Username: 2–24 characters, only a–z, 0–9, dot and underscore.' };
        const taken = await fs.doc('usernames/' + uname).get().catch(() => null);
        if (taken && taken.exists) throw { message: `@${uname} is taken — try another username.` };
        const cred = await auth.createUserWithEmailAndPassword(email, $('aPass').value);
        try { await claimUsername(cred.user.uid, uname); } catch (_) {}
        await cred.user.updateProfile({ displayName: name });
        await fs.doc('users/' + cred.user.uid).set({ name, color: COLORS[Math.floor(Math.random() * COLORS.length)], created: Date.now() }, { merge: true });
        start(cred.user);
      } else if (tab === 'reset') { await auth.sendPasswordResetEmail(email); msg('Check your inbox (and spam) for the reset link.', true); go.disabled = false; go.textContent = label; return; }
    } catch (er) { console.warn('Diskord auth error', er && er.code, er && er.message); msg(niceErr(er)); go.disabled = false; go.textContent = label; }
  };
  setTimeout(() => { const f = c.querySelector('input'); if (f) f.focus(); }, 30);
}

// ------------------------------------------------------------ API for the app
let started = false;
function start(u) {
  if (started) return; started = true;
  const a = $('auth'); if (a) a.remove();
  const sp = $('splash'); if (sp) sp.classList.remove('hidden');
  resolveReady(makeApi(u));
}
auth.onAuthStateChanged(u => {
  if (u) { if (u.displayName || started) start(u); else setTimeout(() => start(u), 800); }
  else if (started) location.reload();
  else showAuth('login');
});
window.diskordLogout = () => auth.signOut().then(() => location.reload());

function makeApi(u) {
  const uid = u.uid;
  // ---- user
  const pcache = {};
  const user = {
    async id() { return uid; },
    async me() {
      let d = {};
      try { const s = await fs.doc('users/' + uid).get(); d = s.exists ? s.data() : {}; } catch (_) {}
      if (!d.name) { d = { name: u.displayName || (u.email || 'user').split('@')[0], color: COLORS[uid.charCodeAt(0) % COLORS.length], created: Date.now(), ...d }; fs.doc('users/' + uid).set(d, { merge: true }).catch(() => {}); }
      // The first account ever becomes the Diskord owner (can manage every server).
      let owner = false;
      try {
        const ref = fs.doc('meta/app');
        owner = await fs.runTransaction(async t => { const s = await t.get(ref); if (!s.exists) { t.set(ref, { owner: uid, at: Date.now() }); return true; } return s.data().owner === uid; });
      } catch (_) {}
      pcache[uid] = { name: d.name, color: d.color, avatarUrl: '', username: d.username || '' };
      return { id: uid, name: d.name, color: d.color, username: d.username || '', avatarUrl: '', email: u.email, isOwner: owner, canEdit: owner, isMe: true };
    },
    async profiles(ids) {
      const out = {};
      await Promise.all([].concat(ids).map(async id => {
        if (!pcache[id]) { try { const s = await fs.doc('users/' + id).get(); const d = s.exists ? s.data() : {}; pcache[id] = { name: d.name || 'User', color: d.color || '#8b5cf6', avatarUrl: '', username: d.username || '' }; } catch (_) { pcache[id] = { name: 'User', color: '#8b5cf6', avatarUrl: '' }; } }
        out[id] = { id, ...pcache[id] };
      }));
      return out;
    },
    async rename(name) { await fs.doc('users/' + uid).set({ name }, { merge: true }); await u.updateProfile({ displayName: name }); pcache[uid] = { ...(pcache[uid] || {}), name }; },
    async can() { return true; },
    async setColor(color) { await fs.doc('users/' + uid).set({ color }, { merge: true }); pcache[uid] = { ...(pcache[uid] || {}), color }; },
    async setUsername(name, old) { name = normUser(name); if (!USER_RE.test(name)) throw { message: 'Username: 2–24 characters, only a–z, 0–9, dot and underscore.' }; await claimUsername(uid, name, old); pcache[uid] = { ...(pcache[uid] || {}), username: name }; return name; },
    async findUsername(name) { name = normUser(name); if (!USER_RE.test(name)) return null; const s = await fs.doc('usernames/' + name).get(); return s.exists ? s.data().uid : null; },
    forget(id) { delete pcache[id]; },
    email: u.email
  };
  // ---- room (presence + live events), stored in Firestore
  let myPresence = null, peersCb = null, peerDocs = {};
  const PRES_TTL = 120000;
  const pushPres = () => myPresence && fs.doc('presence/' + uid).set({ ...myPresence, at: Date.now() }).catch(() => {});
  setInterval(pushPres, 45000);
  addEventListener('beforeunload', () => { try { fs.doc('presence/' + uid).delete(); } catch (_) {} });
  const emitPeers = () => {
    if (!peersCb) return;
    const now = Date.now();
    const peers = Object.entries(peerDocs).filter(([, d]) => d && now - (d.at || 0) < PRES_TTL).map(([id, d]) => ({ by: id, kind: 'viewer', presence: d, isMe: id === uid, sameTab: id === uid }));
    peersCb({ peers, joined: [], left: [], updated: [] });
  };
  setInterval(emitPeers, 20000);
  const handlers = {};
  const since = Date.now() - 2000;
  let lastEvent = null, evSub = false;
  const subEvents = () => {
    if (evSub) return; evSub = true;
    fs.collection('events').where('at', '>', since).orderBy('at').onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data(); if (!d || d.by === uid || Date.now() - d.at > 30000) return;
        (handlers[d.topic] || []).forEach(h => { try { h({ by: d.by, data: d.data, sameTab: false }); } catch (_) {} });
      });
    }, () => {});
  };
  const room = {
    async presence(p) { myPresence = p || {}; await pushPres(); },
    onPeers(cb) { peersCb = cb; fs.collection('presence').onSnapshot(s => { peerDocs = {}; s.forEach(d => { peerDocs[d.id] = d.data(); }); emitPeers(); }, () => {}); return () => { peersCb = null; }; },
    on(topic, h) { (handlers[topic] = handlers[topic] || []).push(h); subEvents(); return () => {}; },
    async emit(topic, data) {
      const ref = await fs.collection('events').add({ topic, data: data || {}, by: uid, at: Date.now() });
      if (lastEvent) fs.doc('events/' + lastEvent).delete().catch(() => {});
      lastEvent = ref.id;
    }
  };
  // ---- assets: pictures saved in Firestore (no paid Storage needed)
  const MAX = 740 * 1024;
  const readURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  async function shrink(file) {
    if (file.type === 'image/gif') { if (file.size > MAX) throw new Error('That GIF is too big — keep GIFs under 740 KB.'); return readURL(file); }
    if (file.size <= MAX * 0.7 && file.type !== 'image/bmp') return readURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = URL.createObjectURL(file); });
    for (const [side, q] of [[1600, .85], [1280, .8], [1024, .75], [800, .7], [600, .65]]) {
      const k = Math.min(1, side / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL('image/webp', q);
      if (url.length * 0.75 < MAX) return url;
    }
    throw new Error('That picture is too big.');
  }
  const assets = {
    async upload(file) {
      const d = await shrink(file);
      const ref = await fs.collection('blobs').add({ d, by: uid, at: Date.now(), type: file.type });
      window.__diskordBlob && window.__diskordBlob(ref.id, d);
      return { id: ref.id, url: d, sizeBytes: Math.round(d.length * .75), contentType: file.type };
    }
  };
  return { db: fs, user, room, assets };
}
})();
