// Diskord server — accounts, database, live updates, uploads and calls signalling-free chat backend.
// Run: npm install && node server.js   (Node.js 18 or newer)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { WebSocketServer } = require('ws');
const rules = require('./rules');

// ------------------------------------------------------------------ config
const ROOT = __dirname;
const cfgFile = path.join(ROOT, 'config.json');
const CFG = Object.assign({ port: 3000, name: 'Diskord', allowSignup: true, maxUploadMB: 15, tenorKey: '' }, fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {});
const PORT = Number(process.env.SERVER_PORT || process.env.PORT || CFG.port || 3000);
const HOST = process.env.SERVER_IP || process.env.HOST || '0.0.0.0';
const DATA = path.join(ROOT, 'data');
const BLOBS = path.join(DATA, 'blobs');
const PUBLIC = path.join(ROOT, 'public');
fs.mkdirSync(BLOBS, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------ storage (in memory, saved to data/db.json)
const DB_FILE = path.join(DATA, 'db.json');
let db = { docs: {}, accounts: {}, sessions: {}, usernames: {}, meta: {} };
try { if (fs.existsSync(DB_FILE)) db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); log('Loaded database:', Object.keys(db.docs).length, 'documents,', Object.keys(db.accounts).length, 'accounts'); }
catch (e) { console.error('Could not read data/db.json — starting a new database. Old file kept as db.broken.json', e.message); try { fs.copyFileSync(DB_FILE, DB_FILE.replace('.json', '.broken.json')); } catch (_) {} }
const byCol = new Map(); // collection path -> Set(doc path)
const colOf = p => p.slice(0, p.lastIndexOf('/'));
for (const p of Object.keys(db.docs)) { const c = colOf(p); if (!byCol.has(c)) byCol.set(c, new Set()); byCol.get(c).add(p); }

let saveTimer = null, saving = false;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null; if (saving) return save(); saving = true;
    const tmp = DB_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), err => {
      if (err) { saving = false; return console.error('Save failed', err.message); }
      fs.rename(tmp, DB_FILE, () => { saving = false; });
    });
  }, 800);
}
function saveNow() { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) { console.error('Save failed', e.message); } }
// daily backup
setInterval(() => { try { fs.copyFileSync(DB_FILE, path.join(DATA, 'backup-' + new Date().toISOString().slice(0, 10) + '.json')); } catch (_) {} }, 6 * 3600e3);

const getDoc = p => db.docs[p] || null;
function putDoc(p, data) {
  const c = colOf(p);
  if (data === null) { delete db.docs[p]; if (byCol.has(c)) byCol.get(c).delete(p); }
  else { db.docs[p] = data; if (!byCol.has(c)) byCol.set(c, new Set()); byCol.get(c).add(p); }
  save(); notify(p);
}

// ------------------------------------------------------------------ helpers
const rid = (n = 20) => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; const b = crypto.randomBytes(n); let s = ''; for (const x of b) s += a[x % a.length]; return s; };
const uidGen = () => { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const b = crypto.randomBytes(20); let s = ''; for (const x of b) s += a[x % a.length]; return s; }; // no "_" so DM ids stay "a_b"
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const USER_RE = /^[a-z0-9._]{2,24}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const COLORS = ['#ff4d7d', '#a64dff', '#22c1ee', '#2bd98a', '#ffb020', '#ff7a45', '#5b5cf6', '#e94cd8'];
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(a, b) { const out = isObj(a) ? { ...a } : {}; for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v; return out; }
const clean = v => JSON.parse(JSON.stringify(v === undefined ? null : v)); // drop undefined / functions
const DOC_RE = /^(users|profiles|gifs|servers|channels|friendships|dms)\/[A-Za-z0-9_-]{1,80}$|^ch\/[A-Za-z0-9_-]{1,90}\/m\/[A-Za-z0-9_-]{1,40}$/;
const COL_RE = /^(users|profiles|gifs|servers|channels|friendships|dms)$|^ch\/[A-Za-z0-9_-]{1,90}\/m$/;
const owner = () => db.meta.owner || null;
const err = (code, message) => { const e = new Error(message); e.code = code; return e; };

// ------------------------------------------------------------------ queries
function runQuery(col, q, uid) {
  const paths = byCol.get(col) ? [...byCol.get(col)] : [];
  let docs = paths.map(p => ({ id: p.slice(p.lastIndexOf('/') + 1), path: p, data: db.docs[p] })).filter(d => d.data && rules.canRead(ctx(uid), d.path, d.data));
  for (const [f, op, v] of (q.where || [])) {
    docs = docs.filter(d => { const x = d.data[f]; return op === '==' ? x === v : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : op === '>' ? x > v : op === '<' ? x < v : op === '>=' ? x >= v : op === '<=' ? x <= v : true; });
  }
  if (q.orderBy) { const [f, dir] = q.orderBy; docs = docs.filter(d => d.data[f] !== undefined && d.data[f] !== null); docs.sort((a, b) => (a.data[f] > b.data[f] ? 1 : a.data[f] < b.data[f] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
  else docs.sort((a, b) => a.id < b.id ? -1 : 1);
  if (q.limit) docs = docs.slice(0, Math.min(Number(q.limit) || 1000, 1000));
  return docs.map(d => ({ id: d.id, data: d.data }));
}
const ctx = uid => ({ uid, owner: owner(), get: getDoc });

// ------------------------------------------------------------------ live connections
const clients = new Set();
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function notify(docPath) {
  const col = colOf(docPath);
  for (const ws of clients) {
    if (!ws.uid) continue;
    for (const [sid, sub] of ws.subs) {
      if (sub.kind === 'col' && sub.path === col) pushSub(ws, sid, sub);
      else if (sub.kind === 'doc' && sub.path === docPath) pushSub(ws, sid, sub);
    }
  }
}
function pushSub(ws, sid, sub) {
  if (sub.kind === 'doc') {
    const d = getDoc(sub.path);
    const ok = !d || rules.canRead(ctx(ws.uid), sub.path, d);
    send(ws, { t: 'snap', id: sid, doc: { id: sub.path.split('/').pop(), exists: !!d && ok, data: ok ? d : null } });
  } else send(ws, { t: 'snap', id: sid, docs: runQuery(sub.path, sub.q || {}, ws.uid) });
}
function peers() {
  const m = new Map();
  for (const ws of clients) if (ws.uid && ws.presence) m.set(ws.uid, ws.presence);
  return [...m].map(([by, presence]) => ({ by, kind: 'viewer', presence }));
}
let peerTimer = null;
function broadcastPeers() { if (peerTimer) return; peerTimer = setTimeout(() => { peerTimer = null; const list = peers(); for (const ws of clients) if (ws.uid) send(ws, { t: 'peers', peers: list }); }, 150); }

// ------------------------------------------------------------------ accounts
const loginTries = new Map(); // ip -> {n, until}
function limited(ip) { const t = loginTries.get(ip); return t && t.n >= 8 && Date.now() < t.until; }
function failed(ip) { const t = loginTries.get(ip) || { n: 0, until: 0 }; t.n++; t.until = Date.now() + 5 * 60e3; loginTries.set(ip, t); }
function newSession(uid) { const token = rid(40); db.sessions[sha(token)] = { uid, at: Date.now() }; save(); return token; }
function userPublic(uid) { const u = getDoc('users/' + uid) || {}; return { id: uid, name: u.name || 'User', color: u.color || '#8b5cf6', username: u.username || '', isOwner: owner() === uid, canEdit: owner() === uid }; }

const commands = {
  async hello() { return { name: CFG.name, allowSignup: !!CFG.allowSignup, tenorKey: CFG.tenorKey || '', version: require('./package.json').version }; },
  async signup(ws, a) {
    if (!CFG.allowSignup) throw err('permission-denied', 'Sign-ups are closed on this server.');
    const email = String(a.email || '').trim().toLowerCase(), name = String(a.name || '').trim().slice(0, 32), username = String(a.username || '').trim().toLowerCase().replace(/^@/, ''), pw = String(a.password || '');
    if (name.length < 2) throw err('invalid-argument', 'Pick a display name (2+ letters).');
    if (!USER_RE.test(username)) throw err('invalid-argument', 'Username: 2–24 characters, only a–z, 0–9, dot and underscore.');
    if (!EMAIL_RE.test(email)) throw err('invalid-argument', 'That email address doesn\'t look right.');
    if (pw.length < 6) throw err('invalid-argument', 'Password must be at least 6 characters.');
    if (Object.values(db.accounts).some(x => x.email === email)) throw err('already-exists', 'There\'s already an account with that email. Log in instead.');
    if (db.usernames[username]) throw err('already-exists', `@${username} is taken — try another username.`);
    const uid = uidGen(), salt = rid(16);
    db.accounts[uid] = { email, salt, hash: hashPw(pw, salt), created: Date.now() };
    db.usernames[username] = uid;
    if (!owner()) { db.meta.owner = uid; log('First account — owner is now', username); }
    putDoc('users/' + uid, { name, username, color: COLORS[crypto.randomInt(COLORS.length)], created: Date.now() });
    log('New account', '@' + username);
    const token = newSession(uid); ws.uid = uid; return { token, uid };
  },
  async login(ws, a) {
    if (limited(ws.ip)) throw err('resource-exhausted', 'Too many tries. Wait 5 minutes and try again.');
    const id = String(a.email || '').trim().toLowerCase().replace(/^@/, ''), pw = String(a.password || '');
    const uid = id.includes('@') ? Object.keys(db.accounts).find(k => db.accounts[k].email === id) : db.usernames[id];
    const acc = uid && db.accounts[uid];
    if (!acc || acc.disabled || hashPw(pw, acc.salt) !== acc.hash) { failed(ws.ip); throw err('invalid-credential', 'Wrong email/username or password.'); }
    loginTries.delete(ws.ip);
    const token = newSession(uid); ws.uid = uid; return { token, uid };
  },
  async auth(ws, a) {
    const s = db.sessions[sha(String(a.token || ''))];
    if (!s || !db.accounts[s.uid] || db.accounts[s.uid].disabled) throw err('unauthenticated', 'Please log in again.');
    ws.uid = s.uid; return { uid: s.uid };
  },
  async logout(ws, a) { delete db.sessions[sha(String(a.token || ''))]; save(); ws.uid = null; return {}; },
  async changePassword(ws, a) {
    need(ws); const acc = db.accounts[ws.uid];
    if (hashPw(String(a.old || ''), acc.salt) !== acc.hash) throw err('invalid-credential', 'Your current password is wrong.');
    if (String(a.password || '').length < 6) throw err('invalid-argument', 'Password must be at least 6 characters.');
    acc.salt = rid(16); acc.hash = hashPw(String(a.password), acc.salt);
    for (const [k, s] of Object.entries(db.sessions)) if (s.uid === ws.uid) delete db.sessions[k];
    save(); return { token: newSession(ws.uid) };
  },
  async me(ws) { need(ws); return userPublic(ws.uid); },
  async profiles(ws, a) { need(ws); const out = {}; for (const id of [].concat(a.ids || []).slice(0, 200)) out[id] = userPublic(String(id)); return out; },
  async setUsername(ws, a) {
    need(ws); const n = String(a.name || '').trim().toLowerCase().replace(/^@/, '');
    if (!USER_RE.test(n)) throw err('invalid-argument', 'Username: 2–24 characters, only a–z, 0–9, dot and underscore.');
    if (db.usernames[n] && db.usernames[n] !== ws.uid) throw err('already-exists', `@${n} is taken — try another username.`);
    for (const [k, v] of Object.entries(db.usernames)) if (v === ws.uid && k !== n) delete db.usernames[k];
    db.usernames[n] = ws.uid;
    putDoc('users/' + ws.uid, { ...(getDoc('users/' + ws.uid) || {}), username: n });
    return { name: n };
  },
  async findUsername(ws, a) { need(ws); return { uid: db.usernames[String(a.name || '').trim().toLowerCase().replace(/^@/, '')] || null }; },
  async get(ws, a) {
    need(ws); const p = String(a.path || '');
    if (DOC_RE.test(p)) { const d = getDoc(p); const ok = d && rules.canRead(ctx(ws.uid), p, d); return { id: p.split('/').pop(), exists: !!ok, data: ok ? d : null }; }
    if (COL_RE.test(p)) return { docs: runQuery(p, a.q || {}, ws.uid) };
    throw err('invalid-argument', 'Bad path');
  },
  async write(ws, a) {
    need(ws);
    const p = String(a.path || ''), op = a.op;
    if (!DOC_RE.test(p)) throw err('invalid-argument', 'Bad path');
    const before = getDoc(p);
    let after;
    if (op === 'delete') after = null;
    else {
      const data = clean(a.data || {});
      if (!isObj(data)) throw err('invalid-argument', 'Bad data');
      if (op === 'set') after = a.merge && before ? deepMerge(before, data) : data;
      else if (op === 'update') { if (!before) throw err('not-found', 'That no longer exists.'); after = { ...before, ...data }; }
      else throw err('invalid-argument', 'Bad op');
      if (Buffer.byteLength(JSON.stringify(after)) > 1024 * 1024) throw err('invalid-argument', 'That is too big.');
    }
    const kind = !before && after ? 'create' : before && !after ? 'delete' : before ? 'update' : 'noop';
    if (kind === 'noop') return {};
    if (!rules.canWrite(ctx(ws.uid), kind, p, before, after)) throw err('permission-denied', 'You don\'t have permission to do that.');
    putDoc(p, after);
    return {};
  },
  async sub(ws, a) {
    need(ws); const p = String(a.path || ''), sid = String(a.id || '');
    if (ws.subs.size > 200) throw err('resource-exhausted', 'Too many listeners');
    if (DOC_RE.test(p)) ws.subs.set(sid, { kind: 'doc', path: p });
    else if (COL_RE.test(p)) ws.subs.set(sid, { kind: 'col', path: p, q: a.q || {} });
    else throw err('invalid-argument', 'Bad path');
    pushSub(ws, sid, ws.subs.get(sid)); return {};
  },
  async unsub(ws, a) { ws.subs.delete(String(a.id || '')); return {}; },
  async presence(ws, a) { need(ws); ws.presence = isObj(a.data) ? clean(a.data) : {}; broadcastPeers(); return {}; },
  async emit(ws, a) {
    need(ws); const topic = String(a.topic || '').slice(0, 40);
    if (!['typing', 'stoptyping', 'ring'].includes(topic)) throw err('invalid-argument', 'Bad topic');
    const msg = { t: 'ev', topic, by: ws.uid, data: clean(a.data || {}) };
    for (const c of clients) if (c !== ws && c.uid) send(c, msg);
    return {};
  }
};
function need(ws) { if (!ws.uid) throw err('unauthenticated', 'Please log in.'); }

// ------------------------------------------------------------------ HTTP: app files, uploads, pictures
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const IMG_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const cors = res => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); };
const server = http.createServer((req, res) => {
  cors(res);
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (url.pathname === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, name: CFG.name, users: Object.keys(db.accounts).length })); }
  if (url.pathname === '/upload' && req.method === 'POST') {
    const s = db.sessions[sha(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))];
    if (!s) { res.writeHead(401); return res.end('{"error":"Please log in"}'); }
    const type = String(req.headers['content-type'] || '').split(';')[0];
    if (!IMG_TYPES.has(type)) { res.writeHead(415); return res.end('{"error":"Only PNG, JPG, GIF or WebP pictures"}'); }
    const max = (CFG.maxUploadMB || 15) * 1024 * 1024, chunks = []; let size = 0, dead = false;
    req.on('data', c => { size += c.length; if (size > max) { dead = true; res.writeHead(413); res.end(JSON.stringify({ error: `Pictures can be at most ${CFG.maxUploadMB || 15} MB` })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (dead) return;
      const id = rid(24);
      fs.writeFile(path.join(BLOBS, id), Buffer.concat(chunks), e => {
        if (e) { res.writeHead(500); return res.end('{"error":"Could not save"}'); }
        fs.writeFileSync(path.join(BLOBS, id + '.type'), type);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id, size, type }));
      });
    });
    return;
  }
  const bm = /^\/blob\/([A-Za-z0-9]{24})$/.exec(url.pathname);
  if (bm) {
    const f = path.join(BLOBS, bm[1]);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    let type = 'application/octet-stream'; try { type = fs.readFileSync(f + '.type', 'utf8'); } catch (_) {}
    res.writeHead(200, { 'Content-Type': IMG_TYPES.has(type) ? type : 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    return fs.createReadStream(f).pipe(res);
  }
  // the web app itself
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (!fs.existsSync(PUBLIC)) { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(`${CFG.name} server is running. Open it with the Diskord app.`); }
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

// ------------------------------------------------------------------ WebSocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2 * 1024 * 1024 });
wss.on('connection', (ws, req) => {
  ws.ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  ws.subs = new Map(); ws.alive = true; clients.add(ws);
  let n = 0, windowStart = Date.now();
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', async raw => {
    if (Date.now() - windowStart > 10000) { windowStart = Date.now(); n = 0; }
    if (++n > 400) return; // flood guard
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    const fn = commands[m && m.op];
    if (!fn) return send(ws, { t: 'res', rid: m && m.rid, err: { code: 'invalid-argument', message: 'Unknown command' } });
    try { const result = await fn(ws, m.a || {}); send(ws, { t: 'res', rid: m.rid, result }); }
    catch (e) { send(ws, { t: 'res', rid: m.rid, err: { code: e.code || 'internal', message: e.code ? e.message : 'Server error' } }); if (!e.code) console.error(e); }
    if (m.op === 'auth' || m.op === 'login' || m.op === 'signup') { send(ws, { t: 'peers', peers: peers() }); }
  });
  ws.on('close', () => { clients.delete(ws); if (ws.presence) broadcastPeers(); });
});
setInterval(() => { for (const ws of clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (_) {} } }, 30000);

server.listen(PORT, HOST, () => {
  log(`✅ ${CFG.name} server is running on port ${PORT}`);
  log(`   Open http://YOUR-SERVER-IP:${PORT} in a browser, or put that address into the Diskord app.`);
  log('   Type "help" here for owner commands.');
});

// ------------------------------------------------------------------ owner console commands
const rl = readline.createInterface({ input: process.stdin });
const findUid = x => { x = String(x || '').toLowerCase().replace(/^@/, ''); return db.usernames[x] || Object.keys(db.accounts).find(k => db.accounts[k].email === x) || (db.accounts[x] ? x : null); };
rl.on('line', line => {
  const [cmd, ...args] = line.trim().split(/\s+/);
  if (!cmd) return;
  if (cmd === 'help') return log('Commands: users | resetpw <username|email> <newpassword> | owner <username> | ban <username> | unban <username> | signups on|off | save | stop');
  if (cmd === 'users') { for (const [uid, a] of Object.entries(db.accounts)) log(`@${(getDoc('users/' + uid) || {}).username || '?'}  ${a.email}${uid === owner() ? '  👑 owner' : ''}${a.disabled ? '  ⛔ banned' : ''}`); return; }
  if (cmd === 'resetpw') { const uid = findUid(args[0]); if (!uid || !args[1] || args[1].length < 6) return log('Usage: resetpw <username|email> <newpassword (6+ chars)>'); const a = db.accounts[uid]; a.salt = rid(16); a.hash = hashPw(args[1], a.salt); for (const [k, s] of Object.entries(db.sessions)) if (s.uid === uid) delete db.sessions[k]; save(); return log('Password changed for', args[0]); }
  if (cmd === 'owner') { const uid = findUid(args[0]); if (!uid) return log('No such user'); db.meta.owner = uid; save(); return log('Owner is now', args[0]); }
  if (cmd === 'ban' || cmd === 'unban') { const uid = findUid(args[0]); if (!uid) return log('No such user'); db.accounts[uid].disabled = cmd === 'ban'; if (cmd === 'ban') { for (const [k, s] of Object.entries(db.sessions)) if (s.uid === uid) delete db.sessions[k]; for (const ws of clients) if (ws.uid === uid) ws.close(); } save(); return log(cmd === 'ban' ? 'Banned' : 'Unbanned', args[0]); }
  if (cmd === 'signups') { CFG.allowSignup = args[0] !== 'off'; try { fs.writeFileSync(cfgFile, JSON.stringify(CFG, null, 2)); } catch (_) {} return log('Sign-ups', CFG.allowSignup ? 'ON' : 'OFF'); }
  if (cmd === 'save') { saveNow(); return log('Saved'); }
  if (cmd === 'stop') { saveNow(); log('Saved. Bye!'); process.exit(0); }
  log('Unknown command. Type help');
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { saveNow(); process.exit(0); });
