// Diskord service worker: makes the app installable and opens instantly (app shell cache).
const CACHE = 'diskord-v6';
const SHELL = ['./', './index.html', './call.html', './adapter.js', './sounds.js', './diskord-config.js', './vendor/nostr.bundle.js', './logo.svg', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || /^\/(api|ws|blob|upload)/.test(u.pathname)) return;
  // network first so updates arrive right away, cache as offline fallback
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
