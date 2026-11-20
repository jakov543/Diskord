// Minimal Discord Rich Presence over local IPC (no extra packages).
const net = require('net');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class DiscordRPC {
  constructor(clientId) {
    this.clientId = clientId;
    this.sock = null;
    this.ready = false;
    this.activity = null;
    this.buffer = Buffer.alloc(0);
    this.retryTimer = null;
    this.stopped = false;
  }

  start() {
    if (!this.clientId || /^0+$/.test(this.clientId)) return; // not configured
    this.stopped = false;
    this._connect(0);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    if (this.sock) { try { this._send(2, {}); this.sock.destroy(); } catch (_) {} }
    this.sock = null; this.ready = false;
  }

  setActivity(activity) {
    this.activity = activity;
    if (this.ready) this._push();
  }

  clear() { this.setActivity(null); }

  _paths(i) {
    const name = `discord-ipc-${i}`;
    if (process.platform === 'win32') return [`\\\\?\\pipe\\${name}`];
    const bases = [process.env.XDG_RUNTIME_DIR, process.env.TMPDIR, process.env.TMP, process.env.TEMP, '/tmp'].filter(Boolean);
    const subs = ['', 'app/com.discordapp.Discord', 'snap.discord', '.flatpak/com.discordapp.Discord/xdg-run'];
    const out = [];
    for (const b of bases) for (const s of subs) out.push(path.join(b, s, name));
    return out.filter(p => process.platform === 'win32' || fs.existsSync(p));
  }

  _connect(i) {
    if (this.stopped) return;
    if (i > 9) return this._retry();
    const candidates = this._paths(i);
    if (!candidates.length) return this._connect(i + 1);
    const sock = net.createConnection(candidates[0]);
    sock.once('connect', () => {
      this.sock = sock;
      this._send(0, { v: 1, client_id: this.clientId });
    });
    sock.on('data', d => this._onData(d));
    sock.once('error', () => { sock.destroy(); if (!this.sock) this._connect(i + 1); });
    sock.once('close', () => {
      if (this.sock === sock) { this.sock = null; this.ready = false; this._retry(); }
    });
  }

  _retry() {
    clearTimeout(this.retryTimer);
    if (!this.stopped) this.retryTimer = setTimeout(() => this._connect(0), 15000);
  }

  _send(op, obj) {
    const body = Buffer.from(JSON.stringify(obj));
    const header = Buffer.alloc(8);
    header.writeInt32LE(op, 0);
    header.writeInt32LE(body.length, 4);
    this.sock.write(Buffer.concat([header, body]));
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const op = this.buffer.readInt32LE(0);
      const len = this.buffer.readInt32LE(4);
      if (this.buffer.length < 8 + len) break;
      const msg = JSON.parse(this.buffer.subarray(8, 8 + len).toString());
      this.buffer = this.buffer.subarray(8 + len);
      if (op === 2) { this.sock.destroy(); return; }
      if (msg.evt === 'READY') { this.ready = true; this._push(); }
    }
  }

  _push() {
    if (!this.sock) return;
    this._send(1, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: this.activity },
      nonce: crypto.randomUUID()
    });
  }
}

module.exports = DiscordRPC;
