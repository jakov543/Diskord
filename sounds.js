// Diskord sounds — every sound is made right here with Web Audio (no sound files).
// Packs: classic, christmas, halloween, easter. "auto" picks the holiday pack by date.
(() => {
  'use strict';
  const KEY = 'flix.sounds';
  const load = () => { try { return Object.assign({ pack: 'auto', volume: 0.8, on: true }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { return { pack: 'auto', volume: 0.8, on: true }; } };
  const save = cfg => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) {} };
  // sounds -> boost -> limiter -> volume -> speakers (loud and even, never clipping)
  let ac = null, master = null, out = null;
  const BOOST = 5;
  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = BOOST;
      const lim = ac.createDynamicsCompressor(); lim.threshold.value = -9; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = .002; lim.release.value = .15;
      out = ac.createGain(); master.connect(lim); lim.connect(out); out.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    out.gain.value = Math.max(0, Math.min(1, load().volume));
    return ac;
  }
  // browsers only allow sound after you click or press a key once
  const unlock = () => { try { ctx(); } catch (_) {} if (ac && ac.state === 'running') ['pointerdown', 'keydown'].forEach(e => removeEventListener(e, unlock, true)); };
  ['pointerdown', 'keydown'].forEach(e => addEventListener(e, unlock, true));
  // easter sunday (anonymous Gregorian algorithm)
  function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
  function seasonal(now = new Date()) {
    const m = now.getMonth() + 1, d = now.getDate();
    if ((m === 12) || (m === 1 && d <= 6)) return 'christmas';
    if ((m === 10 && d >= 15) || (m === 11 && d <= 2)) return 'halloween';
    const e = easter(now.getFullYear()), diff = (now - e) / 864e5;
    if (diff >= -10 && diff <= 7) return 'easter';
    return 'classic';
  }
  const activePack = () => { const p = load().pack; return p === 'auto' ? seasonal() : (PACKS[p] ? p : 'classic'); };

  // ---- building blocks
  function tone(f, at, dur, o = {}) {
    const a = ctx(), t = a.currentTime + at, osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
    if (o.vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = o.vib; lg.gain.value = f * 0.03; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + .1); }
    const v = o.v ?? .25, atk = o.atk ?? .005;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + atk); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    let node = g;
    if (o.lp) { const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; g.connect(fl); node = fl; }
    osc.connect(g); node.connect(master); osc.start(t); osc.stop(t + dur + .05);
  }
  const bell = (f, at, dur = .9, v = .18) => { tone(f, at, dur, { v }); tone(f * 2.01, at, dur * .6, { v: v * .35 }); tone(f * 3.02, at, dur * .3, { v: v * .15 }); };
  function noise(at, dur, o = {}) {
    const a = ctx(), t = a.currentTime + at, n = a.createBufferSource(), b = a.createBuffer(1, Math.max(1, a.sampleRate * dur), a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    n.buffer = b; const f = a.createBiquadFilter(); f.type = o.type || 'highpass'; f.frequency.value = o.f || 6000; const g = a.createGain();
    g.gain.setValueAtTime(o.v ?? .12, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur); n.connect(f); f.connect(g); g.connect(master); n.start(t);
  }
  const jingle = (at, v = .08) => { for (let i = 0; i < 4; i++) noise(at + i * .035, .18, { f: 7000, v }); };
  const chirp = (at, f1, f2, dur = .09, v = .16) => tone(f1, at, dur, { to: f2, v });
  const N = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784, A5: 880, B5: 987.8, C6: 1046.5, E6: 1318.5, G6: 1568, Cs5: 554.4, A3: 220, D3: 146.8, Cs4: 277.2 };

  // ---- packs: message, mention, join, leave, mute, unmute, deafen, undeafen, ring (one loop), friend
  const PACKS = {
    classic: {
      name: 'Diskord (Google sounds)', icon: '💙',
      message: () => { tone(N.E6, 0, .12, { v: .12 }); tone(N.G6 * 1.0, .06, .16, { v: .1 }); },
      mention: () => { tone(N.C6, 0, .1, { v: .14 }); tone(N.E6, .08, .1, { v: .14 }); tone(N.G6, .16, .2, { v: .12 }); },
      join: () => { tone(N.C5, 0, .14, { v: .18 }); tone(N.G5, .1, .22, { v: .18 }); },
      leave: () => { tone(N.G5, 0, .14, { v: .18 }); tone(N.C5, .1, .22, { v: .18 }); },
      mute: () => tone(700, 0, .09, { to: 420, v: .16 }),
      unmute: () => tone(420, 0, .09, { to: 700, v: .16 }),
      deafen: () => { tone(600, 0, .1, { to: 300, v: .16 }); tone(300, .08, .12, { v: .1 }); },
      undeafen: () => { tone(300, 0, .1, { to: 600, v: .16 }); tone(600, .08, .12, { v: .1 }); },
      ring: () => { [N.E5, N.G5, N.C6, N.G5].forEach((f, i) => tone(f, i * .16, .3, { v: .12, type: 'triangle' })); },
      friend: () => { tone(N.G5, 0, .1, { v: .14 }); tone(N.C6, .09, .1, { v: .14 }); tone(N.E6, .18, .25, { v: .12 }); }
    },
    christmas: {
      name: 'Christmas', icon: '🎄',
      message: () => { bell(N.E6, 0, .7, .12); jingle(0, .05); },
      mention: () => { bell(N.G5, 0, .5, .14); bell(N.C6, .1, .5, .14); bell(N.E6, .2, .8, .12); jingle(.05, .06); },
      join: () => { bell(N.C5, 0, .6); bell(N.G5, .12, .9); jingle(0); },
      leave: () => { bell(N.G5, 0, .6); bell(N.C5, .12, .9); },
      mute: () => { bell(N.A5, 0, .25, .12); },
      unmute: () => { bell(N.E6, 0, .25, .12); },
      deafen: () => { bell(N.E5, 0, .3, .12); bell(N.C5, .08, .4, .1); },
      undeafen: () => { bell(N.C5, 0, .3, .12); bell(N.E5, .08, .4, .1); },
      // Jingle Bells (1857, public domain): E E E · E E E · E G C D E
      ring: () => { const s = .17; [[N.E5, 0], [N.E5, 1], [N.E5, 2], [N.E5, 4], [N.E5, 5], [N.E5, 6], [N.E5, 8], [N.G5, 9], [N.C5, 10], [N.D5, 11.5], [N.E5, 12]].forEach(([f, i]) => bell(f, i * s, .45, .13)); for (let i = 0; i < 13; i += 2) jingle(i * s, .04); },
      friend: () => { bell(N.C6, 0, .5); bell(N.E6, .1, .5); bell(N.G6, .2, .9); jingle(0, .06); }
    },
    halloween: {
      name: 'Halloween', icon: '🎃',
      message: () => { tone(N.A4, 0, .45, { to: N.E5, glide: .3, v: .12, vib: 6, type: 'sine' }); },
      mention: () => { tone(N.D5, 0, .25, { v: .12, type: 'triangle', vib: 7 }); tone(N.Cs5, .2, .25, { v: .12, type: 'triangle' }); tone(N.A4, .4, .5, { v: .12, type: 'triangle', vib: 6 }); },
      join: () => { tone(180, 0, .7, { to: 420, glide: .6, v: .09, type: 'sawtooth', lp: 900 }); tone(N.D5, .45, .5, { v: .1, vib: 6 }); }, // creaky door
      leave: () => { tone(N.A4, 0, .8, { to: 160, glide: .7, v: .12, vib: 5 }); }, // ghost "oooo"
      mute: () => { tone(220, 0, .18, { to: 110, v: .14, type: 'triangle' }); },
      unmute: () => { tone(110, 0, .18, { to: 220, v: .14, type: 'triangle' }); },
      deafen: () => { tone(N.D4, 0, .3, { v: .12, type: 'square', lp: 700 }); tone(N.A3, .15, .4, { v: .1, type: 'square', lp: 600 }); },
      undeafen: () => { tone(N.A3, 0, .3, { v: .12, type: 'square', lp: 700 }); tone(N.D4, .15, .4, { v: .1, type: 'square', lp: 600 }); },
      // Toccata and Fugue in D minor (Bach, public domain) opening, on a spooky organ
      ring: () => { const org = (f, at, d) => { tone(f, at, d, { v: .07, type: 'square', lp: 1600 }); tone(f / 2, at, d, { v: .06, type: 'sawtooth', lp: 900 }); }; [[N.A4, 0, .12], [N.G4, .12, .12], [N.A4, .24, .5], [N.G4, .9, .1], [N.F4, 1.0, .1], [N.E4, 1.1, .1], [N.D4, 1.2, .1], [N.Cs4, 1.3, .25], [N.D4, 1.6, .7]].forEach(([f, at, d]) => org(f, at, d)); },
      friend: () => { tone(N.D5, 0, .2, { v: .12, vib: 6 }); tone(N.F5, .15, .2, { v: .12, vib: 6 }); tone(N.A5, .3, .5, { v: .12, vib: 6 }); }
    },
    easter: {
      name: 'Easter', icon: '🐣',
      message: () => { chirp(0, 2600, 3600, .07); chirp(.09, 2900, 4200, .07); },
      mention: () => { chirp(0, 2400, 3400); chirp(.1, 2700, 3900); chirp(.2, 3000, 4400, .12); },
      join: () => { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * .07, .28, { v: .14, type: 'triangle' })); chirp(.3, 3000, 4200); },
      leave: () => { [N.C6, N.G5, N.E5, N.C5].forEach((f, i) => tone(f, i * .07, .28, { v: .14, type: 'triangle' })); },
      mute: () => chirp(0, 3200, 2200, .08, .12),
      unmute: () => chirp(0, 2200, 3200, .08, .12),
      deafen: () => { tone(N.G5, 0, .15, { v: .12, type: 'triangle' }); tone(N.D5, .08, .2, { v: .12, type: 'triangle' }); },
      undeafen: () => { tone(N.D5, 0, .15, { v: .12, type: 'triangle' }); tone(N.G5, .08, .2, { v: .12, type: 'triangle' }); },
      ring: () => { [N.C5, N.D5, N.E5, N.G5, N.A5, N.G5, N.E5, N.D5].forEach((f, i) => tone(f, i * .11, .22, { v: .12, type: 'triangle' })); chirp(.95, 2800, 4000); chirp(1.05, 3000, 4300); },
      friend: () => { chirp(0, 2600, 3800); [N.E5, N.G5, N.C6].forEach((f, i) => tone(f, .1 + i * .08, .3, { v: .12, type: 'triangle' })); }
    }
  };
  // ---- the Diskord pack uses real Google Android sounds (sounds/*.ogg, Apache 2.0 — see sounds/NOTICE.txt)
  const BASE = (() => { try { return new URL('sounds/', document.currentScript.src).href; } catch (_) { return 'sounds/'; } })();
  const FILES = ['message', 'mention', 'friend', 'ring', 'join', 'leave', 'mute', 'unmute', 'deafen', 'undeafen'];
  const buffers = new Map(); let ringSrc = null;
  function getBuf(name) {
    if (!buffers.has(name)) buffers.set(name, fetch(BASE + name + '.ogg').then(r => { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); }).then(b => ctx().decodeAudioData(b)).catch(e => { buffers.delete(name); throw e; }));
    return buffers.get(name);
  }
  async function playFile(name) {
    const a = ctx(), buf = await getBuf(name);
    if (name === 'ring' && ringSrc) return; // already ringing
    const src = a.createBufferSource(), g = a.createGain(); src.buffer = buf; g.gain.value = name === 'ring' ? .5 : .6;
    src.connect(g); g.connect(out);
    if (name === 'ring') { src.loop = true; ringSrc = src; src.onended = () => { if (ringSrc === src) ringSrc = null; }; }
    src.start();
  }
  function stop(name) { if (name === 'ring' && ringSrc) { try { ringSrc.stop(); } catch (_) {} ringSrc = null; } }
  // load the Google sounds early so the first one plays right away
  setTimeout(() => { if (activePack() === 'classic') FILES.forEach(n => getBuf(n).catch(() => {})); }, 1500);
  function play(name, force) {
    const cfg = load(); if (!cfg.on && !force) return;
    const pack = activePack();
    if (pack === 'classic' && FILES.includes(name)) { playFile(name).catch(() => { try { PACKS.classic[name](); } catch (_) {} }); return; }
    const p = PACKS[pack] || PACKS.classic;
    try { (p[name] || PACKS.classic[name] || (() => {}))(); } catch (_) {}
  }
  function preview(pack) {
    const k = pack === 'auto' ? seasonal() : pack; ctx();
    if (k === 'classic') { playFile('join').catch(() => {}); setTimeout(() => playFile('message').catch(() => {}), 600); setTimeout(() => { playFile('ring').catch(() => {}); setTimeout(() => stop('ring'), 3500); }, 1700); return; }
    const p = PACKS[k] || PACKS.classic; try { p.join(); setTimeout(() => p.message(), 600); setTimeout(() => p.ring(), 1200); } catch (_) {}
  }
  window.DiskordSounds = { _ctx: () => ctx(), _out: () => out, stop, play, preview, load, save, seasonal, activePack, packs: () => Object.entries(PACKS).map(([k, v]) => ({ key: k, name: v.name, icon: v.icon })) };
})();
