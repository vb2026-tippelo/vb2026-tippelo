// VB 2026 Tippelő service worker
const CACHE = 'vb2026-v2';
const SHELL = ['/', '/index.html', '/manifest.json', '/trophy.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache API / functions / cross-origin data — always go to network.
  if (url.origin !== self.location.origin || url.pathname.includes('/.netlify/') || url.hostname.includes('netlify') || url.hostname.includes('rapidapi') || url.hostname.includes('firestore') || url.hostname.includes('googleapis')) {
    return; // default browser fetch
  }
  // HTML: network-first (so a new deploy always shows), fall back to cache offline.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; }).catch(() => caches.match(req).then((m) => m || caches.match('/index.html')))
    );
    return;
  }
  // Other same-origin static assets: cache-first.
  e.respondWith(caches.match(req).then((m) => m || fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; }).catch(() => m)));
});
