// Who may read and write what. Same rules Diskord used before, now enforced by your own server.
'use strict';
const isDm = cid => String(cid).startsWith('dm_');
const dmPair = cid => String(cid).slice(3).split('_');
const inDm = (cid, uid) => { const p = dmPair(cid); return p.length === 2 && (p[0] === uid || p[1] === uid); };
const changed = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]));
const onlyChanged = (a, b, keys) => changed(a, b).every(k => keys.includes(k));
const arr = v => Array.isArray(v) ? v : [];

function manages(c, sid) {
  const s = c.get('servers/' + sid);
  return !!s && (s.owner === c.uid || arr(s.admins).includes(c.uid) || c.owner === c.uid);
}
function managesChannel(c, cid) { const ch = c.get('channels/' + cid); return !!ch && manages(c, ch.sid); }

function canRead(c, path, doc) {
  if (!c.uid) return false;
  const p = path.split('/'), col = p[0];
  if (['users', 'profiles', 'servers', 'channels', 'gifs'].includes(col)) return true;
  if (col === 'friendships' || col === 'dms') return arr(doc && doc.members).includes(c.uid);
  if (col === 'ch') return !isDm(p[1]) || inDm(p[1], c.uid);
  return false;
}

function canWrite(c, kind, path, before, after) {
  if (!c.uid) return false;
  const p = path.split('/'), col = p[0], id = p[1], me = c.uid, appOwner = c.owner === me;
  switch (col) {
    case 'users':
      return id === me && kind !== 'delete' && String(after.name || '').length <= 32 && (!before || after.username === before.username);
    case 'profiles':
      return id === me && kind !== 'delete';
    case 'gifs':
      if (kind === 'create') return after.by === me;
      if (kind === 'delete') return before.by === me || appOwner;
      return false;
    case 'servers':
      if (kind === 'create') return after.owner === me && String(after.name || '').length <= 40;
      if (kind === 'delete') return before.owner === me || appOwner;
      return after.owner === before.owner && (before.owner === me || appOwner ||
        (arr(before.admins).includes(me) && !changed(before, after).some(k => k === 'admins' || k === 'owner')));
    case 'channels':
      if (kind === 'create') return manages(c, after.sid);
      if (kind === 'delete') return manages(c, before.sid);
      return after.sid === before.sid && (onlyChanged(before, after, ['last', 'lastUid']) || manages(c, before.sid));
    case 'ch': {
      const cid = id;
      if (isDm(cid) && !inDm(cid, me)) return false;
      if (kind === 'create') return after.uid === me && String(after.text || '').length <= 4000;
      if (kind === 'delete') return before.uid === me || (!isDm(cid) && managesChannel(c, cid));
      return after.uid === before.uid && (
        (before.uid === me && onlyChanged(before, after, ['text', 'edited', 'react', 'poll', 'pinned'])) ||
        onlyChanged(before, after, ['react', 'poll']) ||
        (onlyChanged(before, after, ['pinned']) && (isDm(cid) || managesChannel(c, cid))));
    }
    case 'friendships': {
      if (kind === 'create') { const m = arr(after.members); return after.from === me && m.includes(me) && m.length === 2 && id === m.join('_') && after.status === 'pending'; }
      if (kind === 'delete') return arr(before.members).includes(me);
      return arr(before.members).includes(me) && me !== before.from && after.status === 'accepted' && onlyChanged(before, after, ['status', 'at']);
    }
    case 'dms': {
      if (kind === 'create') { const m = arr(after.members); return m.includes(me) && m.length === 2 && id === m.join('_'); }
      if (kind === 'delete') return false;
      return arr(before.members).includes(me) && JSON.stringify(after.members) === JSON.stringify(before.members);
    }
  }
  return false;
}
module.exports = { canRead, canWrite };
