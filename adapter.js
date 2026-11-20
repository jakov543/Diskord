// Diskord ⇄ Nostr connector.
// No server of your own: Diskord saves everything on free public Nostr relays (several at once, so if one is down the others keep working).
// Every change is signed with your key; everyone's app checks the rules before showing anything. DMs are end-to-end encrypted (NIP-44).
(() => {
'use strict';
const NT = window.NostrTools;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k) { try { return localStorage.getItem('diskord.' + k); } catch (_) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem('diskord.' + k) : localStorage.setItem('diskord.' + k, v); } catch (_) {} } };
const NS = 'diskord1:';
const KIND = 30078, EKIND = 20078;
const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom'];
const RELAYS = (window.DISKORD_RELAYS && window.DISKORD_RELAYS.length ? window.DISKORD_RELAYS : JSON.parse(store.get('relays') || 'null') || DEFAULT_RELAYS).slice(0, 8);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const USER_RE = /^[a-z0-9._]{2,24}$/;
const COLORS = ['#ff4d7d', '#a64dff', '#22c1ee', '#2bd98a', '#ffb020', '#ff7a45', '#5b5cf6', '#e94cd8'];
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const deepMerge = (a, b) => { const out = isObj(a) ? { ...a } : {}; for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v; return out; };
const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
const colOf = p => p.slice(0, p.lastIndexOf('/'));
const DOC_RE = /^(users|profiles|gifs|servers|channels|friendships|dms|usernames|joined)\/[A-Za-z0-9_.-]{1,140}$|^ch\/[A-Za-z0-9_-]{1,140}\/m\/[A-Za-z0-9_-]{1,40}$/;
const err = (code, message) => Object.assign(new Error(message), { code });

let ready, resolveReady; ready = new Promise(r => { resolveReady = r; });
window.claude = { use: async name => { const api = await ready; return api ? api[name] || null : null; } };

// ------------------------------------------------------------ keys (made from username + password, so you can log in anywhere)
let sk = null, me = null;
async function deriveKey(username, password) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('diskord-v1/' + username), iterations: 310000 }, base, 256);
  return new Uint8Array(bits);
}

// ------------------------------------------------------------ rules (every app checks these, so nobody can fake owners, edit others' messages, …)
const isDm = cid => String(cid).startsWith('dm_');
const dmPair = cid => String(cid).slice(3).split('_');
const inDm = (cid, uid) => { const p = dmPair(cid); return p.length === 2 && (p[0] === uid || p[1] === uid); };
const changed = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]));
const onlyChanged = (a, b, keys) => changed(a, b).every(k => keys.includes(k));
const arr = v => Array.isArray(v) ? v : [];
const getDoc = p => resolved.get(p) || null;
const manages = (uid, sid) => { const s = getDoc('servers/' + sid); return !!s && (s.owner === uid || arr(s.admins).includes(uid)); };
const managesChannel = (uid, cid) => { const ch = getDoc('channels/' + cid); return !!ch && manages(uid, ch.sid); };
function canWrite(uid, kind, path, before, after) {
  const p = path.split('/'), col = p[0], id = p[1];
  switch (col) {
    case 'users': return id === uid && kind !== 'delete' && String(after.name || '').length <= 32;
    case 'profiles': case 'joined': return id === uid && kind !== 'delete';
    case 'usernames': if (!USER_RE.test(id)) return false; if (kind === 'create') return after.uid === uid; if (kind === 'delete') return before.uid === uid; return before.uid === uid && after.uid === uid;
    case 'gifs': if (kind === 'create') return after.by === uid; if (kind === 'delete') return before.by === uid; return false;
    case 'servers':
      if (kind === 'create') return after.owner === uid && String(after.name || '').length <= 40;
      if (kind === 'delete') return before.owner === uid;
      return after.owner === before.owner && (before.owner === uid || (arr(before.admins).includes(uid) && !changed(before, after).some(k => k === 'admins' || k === 'owner')));
    case 'channels':
      if (kind === 'create') return manages(uid, after.sid);
      if (kind === 'delete') return manages(uid, before.sid);
      return after.sid === before.sid && (onlyChanged(before, after, ['last', 'lastUid']) || manages(uid, before.sid));
    case 'ch': {
      const cid = id; if (isDm(cid) && !inDm(cid, uid)) return false;
      if (kind === 'create') return after.uid === uid && String(after.text || '').length <= 4000;
      if (kind === 'delete') return before.uid === uid || (!isDm(cid) && managesChannel(uid, cid));
      return after.uid === before.uid && ((before.uid === uid && onlyChanged(before, after, ['text', 'edited', 'react', 'poll', 'pinned'])) || onlyChanged(before, after, ['react', 'poll']) || (onlyChanged(before, after, ['pinned']) && (isDm(cid) || managesChannel(uid, cid))));
    }
    case 'friendships':
      if (kind === 'create') { const m = arr(after.members); return after.from === uid && m.includes(uid) && m.length === 2 && id === m.join('_') && after.status === 'pending'; }
      if (kind === 'delete') return arr(before.members).includes(uid);
      return arr(before.members).includes(uid) && uid !== before.from && after.status === 'accepted' && onlyChanged(before, after, ['status', 'at']);
    case 'dms':
      if (kind === 'create') { const m = arr(after.members); return m.includes(uid) && m.length === 2 && id === m.join('_'); }
      if (kind === 'delete') return false;
      return arr(before.members).includes(uid) && JSON.stringify(after.members) === JSON.stringify(before.members);
  }
  return false;
}
// private paths are encrypted between the two people
function privateOther(path) {
  let pair = null;
  if (path.startsWith('dms/')) pair = path.slice(4).split('_');
  else if (path.startsWith('ch/dm_')) pair = path.split('/')[1].slice(3).split('_');
  if (!pair || pair.length !== 2) return null;
  return pair;
}

// ------------------------------------------------------------ relay pool
const relays = new Map(); // url -> {ws, open, backoff}
const subs = new Map();   // subId -> {filters, onEvent, onEose, eose:Set}
const seen = new Set();
let subSeq = 1;
const statusCbs = new Set();
const openCount = () => [...relays.values()].filter(r => r.open).length;
function connStatus() { const n = openCount(); statusCbs.forEach(f => { try { f(n ? 'online' : 'offline', n); } catch (_) {} }); }
function relaySend(r, msg) { if (r.open) try { r.ws.send(JSON.stringify(msg)); } catch (_) {} }
function connectRelay(url) {
  let r = relays.get(url); if (!r) { r = { url, open: false, backoff: 1000, pending: new Map() }; relays.set(url, r); }
  try { r.ws = new WebSocket(url); } catch (_) { return setTimeout(() => connectRelay(url), r.backoff); }
  r.ws.onopen = () => { r.open = true; r.backoff = 1000; for (const [id, s] of subs) relaySend(r, ['REQ', id, ...s.filters]); for (const ev of outbox.values()) relaySend(r, ['EVENT', ev]); connStatus(); };
  r.ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m[0] === 'EVENT') { const s = subs.get(m[1]); const ev = m[2]; if (!s || !ev || seen.has(m[1] + ev.id)) return; seen.add(m[1] + ev.id); if (!NT.verifyEvent(ev)) return; s.onEvent(ev); }
    else if (m[0] === 'EOSE') { const s = subs.get(m[1]); if (s) { s.eose.add(url); if (s.onEose) s.onEose(s.eose.size); } }
    else if (m[0] === 'OK') { if (m[2]) { outbox.delete(m[1]); saveOutbox(); } const w = acks.get(m[1]); if (w) w(m[2], m[3]); }
  };
  r.ws.onclose = () => { const was = r.open; r.open = false; if (was) connStatus(); setTimeout(() => connectRelay(url), r.backoff); r.backoff = Math.min(r.backoff * 2, 30000); };
  r.ws.onerror = () => {};
}
function subscribe(filters, onEvent, onEose) {
  const id = 'd' + (subSeq++).toString(36);
  subs.set(id, { filters, onEvent, onEose, eose: new Set() });
  for (const r of relays.values()) relaySend(r, ['REQ', id, ...filters]);
  return () => { subs.delete(id); for (const r of relays.values()) relaySend(r, ['CLOSE', id]); };
}
// wait until most relays answered (or a timeout)
function fetchOnce(filters, ms = 4000) {
  return new Promise(res => {
    const out = []; let done = false;
    const fin = () => { if (done) return; done = true; unsub(); res(out); };
    const unsub = subscribe(filters, ev => out.push(ev), n => { if (n >= Math.max(1, Math.ceil(openCount() * 0.6))) setTimeout(fin, 150); });
    setTimeout(fin, openCount() ? ms : 1500);
  });
}
// outgoing events wait here until a relay confirms them (survives offline + restarts)
const outbox = new Map(JSON.parse(store.get('outbox') || '[]').map(e => [e.id, e]));
const saveOutbox = () => store.set('outbox', JSON.stringify([...outbox.values()].slice(-300)));
const acks = new Map();
function publish(ev) {
  outbox.set(ev.id, ev); saveOutbox();
  for (const r of relays.values()) relaySend(r, ['EVENT', ev]);
  return new Promise(res => { const t = setTimeout(() => { acks.delete(ev.id); res(false); }, 6000); acks.set(ev.id, ok => { if (ok) { clearTimeout(t); acks.delete(ev.id); res(true); } }); });
}
addEventListener('online', () => { for (const r of relays.values()) if (!r.open) { try { r.ws.close(); } catch (_) {} } });
window.diskordOnConn = cb => { statusCbs.add(cb); cb(openCount() ? 'online' : 'offline', openCount()); };
window.diskordRelays = () => RELAYS.slice();

// ------------------------------------------------------------ document store built from signed events
const versions = new Map(); // path -> Map(author -> {ts, data})
const resolved = new Map(); // path -> data (after rules)
const colIndex = new Map(); // collection -> Set(path)
const listeners = new Map(); // collection or doc path -> Set(fn)
const convKeys = new Map();
function convKey(other) { if (!convKeys.has(other)) convKeys.set(other, NT.nip44.getConversationKey(sk, other)); return convKeys.get(other); }
function decode(ev, path) {
  const pair = privateOther(path);
  let text = ev.content;
  if (pair) {
    if (!pair.includes(me)) return null; // not our conversation
    const other = ev.pubkey === me ? pair.find(x => x !== me) || me : ev.pubkey;
    try { text = NT.nip44.decrypt(ev.content, convKey(other)); } catch (_) { return null; }
  }
  try { const o = JSON.parse(text); return o && typeof o.ts === 'number' ? o : null; } catch (_) { return null; }
}
function ingest(ev) {
  if (ev.kind !== KIND) return;
  const d = (ev.tags.find(t => t[0] === 'd') || [])[1] || '';
  if (!d.startsWith(NS)) return;
  const path = d.slice(NS.length);
  if (!DOC_RE.test(path)) return;
  const o = decode(ev, path); if (!o) return;
  if (Math.abs(o.ts / 1000 - ev.created_at) > 120) return; // timestamps must match the signed time
  if (!versions.has(path)) versions.set(path, new Map());
  const cur = versions.get(path).get(ev.pubkey);
  if (cur && cur.ts >= o.ts) return;
  versions.get(path).set(ev.pubkey, { ts: o.ts, data: o.del ? null : (isObj(o.data) ? o.data : null) });
  recompute(path);
}
function resolve(path) {
  const vs = [...(versions.get(path) || new Map())].sort((a, b) => a[1].ts - b[1].ts || (a[0] < b[0] ? -1 : 1));
  let state = null;
  for (const [author, v] of vs) {
    const kind = !state && v.data ? 'create' : state && !v.data ? 'delete' : state ? 'update' : null;
    if (kind && canWrite(author, kind, path, state, v.data)) state = v.data;
  }
  return state;
}
let fullTimer = null;
function recompute(path) {
  const before = resolved.get(path), after = resolve(path);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const c = colOf(path);
  if (after) { resolved.set(path, after); if (!colIndex.has(c)) colIndex.set(c, new Set()); colIndex.get(c).add(path); }
  else { resolved.delete(path); if (colIndex.has(c)) colIndex.get(c).delete(path); }
  fire(path);
  // owner / co-owner changes can make other changes valid or invalid → re-check everything (debounced)
  if (path.startsWith('servers/') || path.startsWith('channels/')) { clearTimeout(fullTimer); fullTimer = setTimeout(() => { for (const p of versions.keys()) if (!p.startsWith('servers/')) recompute(p); }, 250); }
}
const fireQ = new Set(); let fireT = null;
function fire(path) {
  fireQ.add(path); fireQ.add(colOf(path));
  if (!fireT) fireT = setTimeout(() => { fireT = null; const keys = [...fireQ]; fireQ.clear(); for (const k of keys) for (const fn of (listeners.get(k) || [])) try { fn(); } catch (e) { console.warn(e); } }, 30);
}
function listen(key, fn) { if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(fn); return () => listeners.get(key).delete(fn); }

// relay subscriptions, shared and reference-counted
const relaySubs = new Map(); // key -> {n, unsub, ready:Promise}
function want(key, filters) {
  let s = relaySubs.get(key);
  if (!s) {
    let readyRes; const readyP = new Promise(r => { readyRes = r; });
    const unsub = subscribe(filters, ingest, n => { if (n >= 1) setTimeout(readyRes, 200); });
    setTimeout(readyRes, openCount() ? 3500 : 1200);
    s = { n: 0, unsub, ready: readyP }; relaySubs.set(key, s);
  }
  s.n++;
  return { ready: s.ready, release: () => { if (--s.n <= 0) { setTimeout(() => { if (s.n <= 0) { s.unsub(); relaySubs.delete(key); } }, 60000); } } };
}
const colFilter = col => [{ kinds: [KIND], '#t': [NS + col], limit: col.startsWith('ch/') ? 500 : 3000 }];
const docFilter = path => [{ kinds: [KIND], '#d': [NS + path] }];

function runQuery(col, q) {
  let docs = [...(colIndex.get(col) || [])].map(p => ({ id: p.slice(p.lastIndexOf('/') + 1), data: resolved.get(p) })).filter(d => d.data);
  for (const [f, op, v] of (q.where || [])) docs = docs.filter(d => { const x = d.data[f]; return op === '==' ? x === v : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : op === '>' ? x > v : op === '<' ? x < v : true; });
  if (q.orderBy) { const [f, dir] = q.orderBy; docs = docs.filter(d => d.data[f] != null); docs.sort((a, b) => (a.data[f] > b.data[f] ? 1 : a.data[f] < b.data[f] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
  else docs.sort((a, b) => a.id < b.id ? -1 : 1);
  if (q.limit) docs = docs.slice(0, q.limit);
  return docs;
}
function snapOf(docs, prev) {
  const list = docs.map(d => ({ id: d.id, exists: true, data: () => clone(d.data) }));
  const ch = list.filter(d => !prev.has(d.id)).map(d => ({ type: 'added', doc: d }));
  return { docs: list, size: list.length, empty: !list.length, forEach: f => list.forEach(f), docChanges: () => ch, metadata: { fromCache: false, hasPendingWrites: false } };
}
const docSnapOf = path => { const d = resolved.get(path); return { id: path.split('/').pop(), exists: !!d, data: () => d ? clone(d) : undefined }; };

async function writeDoc(path, op, data, merge) {
  if (!sk) throw err('unauthenticated', 'Please log in.');
  if (!DOC_RE.test(path)) throw err('invalid-argument', 'Bad path');
  const before = resolved.get(path) || null;
  let after;
  if (op === 'delete') after = null;
  else if (op === 'set') after = merge && before ? deepMerge(before, clone(data)) : clone(data);
  else { if (!before) throw err('not-found', 'That no longer exists.'); after = { ...before, ...clone(data) }; }
  const kind = !before && after ? 'create' : before && !after ? 'delete' : before ? 'update' : null;
  if (!kind) return;
  if (!canWrite(me, kind, path, before, after)) throw err('permission-denied', 'You don\'t have permission to do that.');
  const ts = Math.max(Date.now(), ((versions.get(path) || new Map()).get(me) || { ts: 0 }).ts + 1);
  let content = JSON.stringify(after ? { ts, data: after } : { ts, del: true });
  if (content.length > 60000) throw err('invalid-argument', 'That is too big — pictures must be smaller.');
  const pair = privateOther(path);
  if (pair) content = NT.nip44.encrypt(content, convKey(pair.find(x => x !== me) || me));
  const ev = NT.finalizeEvent({ kind: KIND, created_at: Math.floor(ts / 1000), tags: [['d', NS + path], ['t', NS + colOf(path)]], content }, sk);
  ingest(ev);           // show it right away
  publish(ev);          // and send it to the relays (retries by itself when offline)
}
function docRef(path) {
  return {
    id: path.split('/').pop(), path,
    async get() { const w = want('d:' + path, docFilter(path)); await w.ready; w.release(); return docSnapOf(path); },
    set: (data, opts) => writeDoc(path, 'set', data, !!(opts && opts.merge)),
    update: data => writeDoc(path, 'update', data),
    delete: () => writeDoc(path, 'delete'),
    collection: p => colRef(path + '/' + p),
    onSnapshot(cb) {
      const w = want('d:' + path, docFilter(path)); let last = null;
      const push = () => { const s = JSON.stringify(resolved.get(path) || null); if (s === last) return; last = s; cb(docSnapOf(path)); };
      const off = listen(path, push); w.ready.then(push);
      return () => { off(); w.release(); };
    }
  };
}
const autoId = () => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (const x of crypto.getRandomValues(new Uint8Array(20))) s += a[x % a.length]; return s; };
function colRef(path, q = {}) {
  const self = {
    path,
    where: (f, op, v) => colRef(path, { ...q, where: [...(q.where || []), [f, op, v]] }),
    orderBy: (f, dir = 'asc') => colRef(path, { ...q, orderBy: [f, dir] }),
    limit: n => colRef(path, { ...q, limit: n }),
    doc: id => docRef(path + '/' + (id || autoId())),
    async add(data) { const r = self.doc(); await r.set(data); return r; },
    async get() { const w = want('c:' + path, colFilter(path)); await w.ready; w.release(); return snapOf(runQuery(path, q), new Set()); },
    onSnapshot(cb) {
      const w = want('c:' + path, colFilter(path)); let prev = new Set(), lastSig = null, readyNow = false;
      const push = () => { if (!readyNow) return; const docs = runQuery(path, q); const sig = JSON.stringify(docs); if (sig === lastSig) return; lastSig = sig; const s = snapOf(docs, prev); prev = new Set(docs.map(d => d.id)); cb(s); };
      const off = listen(path, push); w.ready.then(() => { readyNow = true; push(); if (lastSig === null) { lastSig = '[]'; cb(snapOf([], prev)); } });
      return () => { off(); w.release(); };
    }
  };
  return self;
}

// ------------------------------------------------------------ live presence + events (not saved anywhere)
let lastPresence = null, peersCb = null;
const peerSeen = new Map(); // pubkey -> {at, presence}
const evHandlers = {};
let roomSub = null;
function startRoom() {
  if (roomSub) return;
  roomSub = subscribe([{ kinds: [EKIND], '#t': [NS + 'room'], since: Math.floor(Date.now() / 1000) - 90 }], ev => {
    let o; try { o = JSON.parse(ev.content); } catch (_) { return; }
    if (!o || Math.abs(Date.now() / 1000 - ev.created_at) > 150) return;
    if (o.type === 'p') { peerSeen.set(ev.pubkey, { at: ev.created_at * 1000, presence: isObj(o.data) ? o.data : {} }); emitPeers(); }
    else if (o.type === 'bye') { peerSeen.delete(ev.pubkey); emitPeers(); }
    else if (o.type === 'e' && ev.pubkey !== me && Date.now() / 1000 - ev.created_at < 30) (evHandlers[o.topic] || []).forEach(h => { try { h({ by: ev.pubkey, data: o.data || {}, sameTab: false }); } catch (_) {} });
  });
  setInterval(() => { if (lastPresence) sendEphemeral({ type: 'p', data: lastPresence }); emitPeers(); }, 30000);
  addEventListener('beforeunload', () => sendEphemeral({ type: 'bye' }));
}
function sendEphemeral(o) {
  if (!sk) return;
  const ev = NT.finalizeEvent({ kind: EKIND, created_at: Math.floor(Date.now() / 1000), tags: [['t', NS + 'room']], content: JSON.stringify(o) }, sk);
  for (const r of relays.values()) relaySend(r, ['EVENT', ev]);
}
function emitPeers() {
  if (!peersCb) return;
  const now = Date.now();
  const peers = [...peerSeen].filter(([, v]) => now - v.at < 80000).map(([by, v]) => ({ by, kind: 'viewer', presence: v.presence, isMe: by === me, sameTab: by === me }));
  if (me && lastPresence && !peers.some(p => p.by === me)) peers.push({ by: me, kind: 'viewer', presence: lastPresence, isMe: true, sameTab: true });
  peersCb({ peers, joined: [], left: [], updated: [] });
}

// ------------------------------------------------------------ pictures
async function shrink(file, maxBytes) {
  const readURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  if (file.type === 'image/gif') { if (file.size > maxBytes) throw new Error('GIFs must be under ' + Math.round(maxBytes / 1024) + ' KB here. The Diskord desktop app can upload bigger ones.'); return readURL(file); }
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that picture.')); i.src = URL.createObjectURL(file); });
  for (const [side, q] of [[1024, .8], [800, .72], [640, .65], [480, .6], [360, .55], [256, .5]]) {
    const k = Math.min(1, side / Math.max(img.width, img.height)), cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL('image/webp', q); if (url.length * .75 < maxBytes) return url;
  }
  throw new Error('That picture is too big.');
}

// ------------------------------------------------------------ the API the app uses
function makeApi(info) {
  const db = { doc: docRef, collection: p => colRef(p) };
  const name = id => (resolved.get('users/' + id) || {});
  const usersSub = want('c:users', colFilter('users'));
  const user = {
    async id() { return me; },
    async me() { await usersSub.ready; const u = name(me); return { id: me, name: u.name || info.name || 'You', color: u.color || '#ff4d7d', username: u.username || info.username || '', avatarUrl: '', isOwner: false, canEdit: false, isMe: true }; },
    async profiles(ids) {
      const missing = [].concat(ids).filter(id => !resolved.get('users/' + id) && /^[0-9a-f]{64}$/.test(id));
      if (missing.length) { const evs = await fetchOnce([{ kinds: [KIND], '#d': missing.slice(0, 100).map(id => NS + 'users/' + id) }], 2500); evs.forEach(ingest); }
      const out = {}; for (const id of [].concat(ids)) { const u = name(id); out[id] = { id, name: u.name || 'User', color: u.color || '#8b5cf6', username: u.username || '', avatarUrl: '' }; } return out;
    },
    async rename(n) { await db.doc('users/' + me).set({ name: n }, { merge: true }); },
    async setColor(c) { await db.doc('users/' + me).set({ color: c }, { merge: true }); },
    async setUsername(n) {
      n = String(n || '').trim().toLowerCase().replace(/^@/, '');
      if (!USER_RE.test(n)) throw err('invalid-argument', 'Username: 2–24 characters, only a–z, 0–9, dot and underscore.');
      throw err('invalid-argument', 'Your username is part of your login, so it can\'t be changed. Make a new account if you need a different one.');
    },
    async findUsername(n) {
      n = String(n || '').trim().toLowerCase().replace(/^@/, ''); if (!USER_RE.test(n)) return null;
      const w = want('d:usernames/' + n, docFilter('usernames/' + n)); await w.ready; w.release();
      const d = resolved.get('usernames/' + n); return d ? d.uid : null;
    },
    async can() { return true; },
    forget() {}
  };
  const room = {
    async presence(p) { lastPresence = p || {}; startRoom(); sendEphemeral({ type: 'p', data: lastPresence }); emitPeers(); },
    onPeers(cb) { peersCb = cb; startRoom(); emitPeers(); return () => { peersCb = null; }; },
    on(topic, h) { (evHandlers[topic] = evHandlers[topic] || []).push(h); startRoom(); return () => {}; },
    async emit(topic, data) { sendEphemeral({ type: 'e', topic, data: data || {} }); }
  };
  const assets = {
    async upload(file) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('Pick a PNG, JPG, GIF or WebP picture.');
      if (window.diskord && typeof window.diskord.upload === 'function') {
        try { const url = await window.diskord.upload(new Uint8Array(await file.arrayBuffer()), file.name, file.type); if (typeof url === 'string' && /^https:\/\/files\.catbox\.moe\//.test(url)) return { id: url, url }; } catch (_) {}
      }
      const d = await shrink(file, 40 * 1024);
      return { id: d, url: d };
    }
  };
  return { db, user, room, assets };
}
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

const niceErr = e => (e && e.message) || 'Something went wrong.';
function showAuth(tab) {
  if (!document.getElementById('authCss')) { const st = document.createElement('style'); st.id = 'authCss'; st.textContent = AUTH_CSS; document.head.appendChild(st); }
  let el = $('auth');
  if (!el) { el = document.createElement('div'); el.id = 'auth'; document.body.appendChild(el); }
  const sp = $('splash'); if (sp) sp.classList.add('hidden');
  el.innerHTML = `<div class="l">${LOGO_SVG}<h1>Welcome to <span>Diskord</span></h1><p class="lead">Your servers, your crew — chat, GIFs, voice calls, video calls and screen sharing in one app. No setup, nothing to host.</p>
    <div class="ft"><div>💬 <b>Servers & channels</b> with custom emoji and GIFs</div><div>📞 <b>Voice & video calls</b> with screen share</div><div>🔒 <b>Encrypted DMs</b> — only you and your friend can read them</div></div></div>
    <div class="r"><div class="card" id="aCard"></div></div>`;
  draw(tab || 'login');
}
function draw(tab) {
  const c = $('aCard');
  const tabs = `<div class="tabs"><button data-t="login" class="${tab === 'login' ? 'on' : ''}">Log in</button><button data-t="signup" class="${tab === 'signup' ? 'on' : ''}">Sign up</button></div>`;
  const net = `<div class="lnk" id="aNet" style="margin-top:14px;cursor:default">🌐 <span id="aNetTxt">Connecting to the Diskord network…</span></div>`;
  if (tab === 'login') c.innerHTML = tabs + `<h2>Welcome back! 👋</h2><p class="s">We're so excited to see you again.</p>
    <form id="aForm"><label>Username</label><input id="aUser" autocomplete="username" required placeholder="your username">
    <label>Password</label><div class="pw"><input id="aPass" type="password" autocomplete="current-password" required><button type="button" id="aEye">SHOW</button></div>
    <button type="button" class="lnk" id="aForgot">Forgot your password?</button>
    <div id="aMsg"></div><button class="go" id="aGo">Log in</button></form>` + net;
  else if (tab === 'signup') c.innerHTML = tabs + `<h2>Create an account ✨</h2><p class="s">Free forever. No email needed.</p>
    <form id="aForm"><label>Display name</label><input id="aName" maxlength="32" autocomplete="nickname" required placeholder="What should everyone call you?">
    <label>Username</label><input id="aUser" maxlength="24" autocomplete="username" required placeholder="lowercase, e.g. bandera">
    <label>Password</label><div class="pw"><input id="aPass" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"><button type="button" id="aEye">SHOW</button></div><div class="meter"><i id="aMeter"></i></div>
    <label>Confirm password</label><input id="aPass2" type="password" autocomplete="new-password" required>
    <p class="s" style="margin:12px 0 0;font-size:12.5px">🔑 Your username + password <b>are</b> your account key, so nobody (not even Diskord) can reset them. Write your password down somewhere safe.</p>
    <div id="aMsg"></div><button class="go" id="aGo">Create account</button></form>` + net;
  else c.innerHTML = `<h2>Forgot your password? 🔑</h2><p class="s">Diskord has no central server, so your password is the only key to your account — it can't be reset. Try the passwords you usually use (they're case-sensitive). If it's really lost, make a new account with a new username.</p><button class="lnk" id="aBack">← Back to log in</button>`;
  c.querySelectorAll('[data-t]').forEach(b => b.onclick = () => draw(b.dataset.t));
  const eye = $('aEye'); if (eye) eye.onclick = () => { const p = $('aPass'); p.type = p.type === 'password' ? 'text' : 'password'; eye.textContent = p.type === 'password' ? 'SHOW' : 'HIDE'; };
  const meter = $('aMeter'); if (meter) $('aPass').oninput = e => { const v = e.target.value; const sc = (v.length >= 8) + (v.length >= 12) + /[A-Z]/.test(v) + /[0-9]/.test(v) + /[^A-Za-z0-9]/.test(v); meter.style.width = sc * 20 + '%'; meter.style.background = ['#ff4d5e', '#ff4d5e', '#ffb020', '#ffb020', '#2bd98a', '#2bd98a'][sc]; };
  if ($('aForgot')) $('aForgot').onclick = () => draw('reset');
  if ($('aBack')) $('aBack').onclick = () => draw('login');
  const nt = $('aNetTxt'); if (nt) window.diskordOnConn((s, n) => { const x = $('aNetTxt'); if (x) x.textContent = n ? `Connected to the Diskord network (${n} of ${RELAYS.length} relays)` : 'Connecting to the Diskord network…'; });
  const msg = (t, ok) => { const m = $('aMsg'); if (m) m.innerHTML = t ? `<div class="${ok ? 'ok' : 'err'}">${esc(t)}</div>` : ''; };
  const form = $('aForm'); if (!form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const go = $('aGo'), label = go.textContent; go.disabled = true; msg('');
    try {
      const username = $('aUser').value.trim().toLowerCase().replace(/^@/, ''), pw = $('aPass').value;
      if (!USER_RE.test(username)) throw new Error('Username: 2–24 characters, only a–z, 0–9, dot and underscore.');
      if (!openCount()) throw new Error('No internet connection — Diskord can\'t reach the network right now.');
      go.textContent = 'Unlocking your key…';
      if (tab === 'signup') {
        const dname = $('aName').value.trim().slice(0, 32);
        if (dname.length < 2) throw new Error('Pick a display name (2+ letters).');
        if (pw.length < 8) throw new Error('Password must be at least 8 characters.');
        if (pw !== $('aPass2').value) throw new Error('The two passwords don\'t match.');
        const key = await deriveKey(username, pw), pub = NT.getPublicKey(key);
        go.textContent = 'Checking username…';
        (await fetchOnce(docFilter('usernames/' + username))).forEach(ingest);
        sk = key; me = pub;
        const taken = resolved.get('usernames/' + username);
        if (taken && taken.uid !== pub) { sk = me = null; throw new Error(`@${username} is taken — try another username.`); }
        go.textContent = 'Creating your account…';
        await writeDoc('usernames/' + username, 'set', { uid: pub, at: Date.now() });
        await writeDoc('users/' + pub, 'set', { name: dname, username, color: COLORS[Math.floor(Math.random() * COLORS.length)], created: Date.now() });
        login(key, username);
      } else {
        const key = await deriveKey(username, pw), pub = NT.getPublicKey(key);
        go.textContent = 'Finding your account…';
        sk = key; me = pub;
        (await fetchOnce([{ kinds: [KIND], '#d': [NS + 'users/' + pub, NS + 'usernames/' + username] }])).forEach(ingest);
        const u = resolved.get('users/' + pub), un = resolved.get('usernames/' + username);
        if (!u && !(un && un.uid === pub)) { sk = me = null; throw new Error(un ? 'Wrong password.' : 'No account with that username and password. Check them, or sign up.'); }
        login(key, username);
      }
    } catch (er) { msg(niceErr(er)); go.disabled = false; go.textContent = label; }
  };
  setTimeout(() => { const f = c.querySelector('input'); if (f) f.focus(); }, 30);
}

// ------------------------------------------------------------ boot
let started = false;
function login(key, username) { store.set('sk', hex(key)); store.set('username', username); start(username); }
function start(username) {
  if (started) return; started = true;
  const a = $('auth'); if (a) a.remove();
  const sp = $('splash'); if (sp) sp.classList.remove('hidden');
  resolveReady(makeApi({ username }));
}
window.diskordLogout = () => { sendEphemeral({ type: 'bye' }); store.set('sk', null); store.set('username', null); store.set('outbox', null); location.reload(); };
window.diskordKey = () => sk ? NT.nip19.nsecEncode(sk) : '';
for (const u of RELAYS) connectRelay(u);
document.addEventListener('DOMContentLoaded', () => {
  const saved = store.get('sk');
  if (saved && /^[0-9a-f]{64}$/.test(saved)) { sk = unhex(saved); me = NT.getPublicKey(sk); start(store.get('username') || ''); }
  else showAuth('login');
});
})();
