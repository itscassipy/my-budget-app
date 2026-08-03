/* Cassidy Budget — service worker
   Strategy: network-first for the app shell, cache-first for static assets.
   Network-first matters here: this app is a single hand-edited index.html.
   A cache-first shell means you push a change and the PWA keeps serving the
   old code until you remember to bump CACHE_NAME. Network-first gets you the
   fresh file whenever you have signal, and the cache is the offline fallback. */

const CACHE_NAME = 'cassidy-budget-v6';
const SHELL = './index.html';
const PRECACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // addAll is all-or-nothing: one missing file kills the whole install.
            // Cache each entry independently so a typo can't silently disable the SW.
            .then(cache => Promise.all(
                PRECACHE.map(url =>
                    cache.add(url).catch(err => console.warn('[sw] skipped', url, err.message))
                )
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // let CDN requests go straight through

    const isShell = req.mode === 'navigate' || url.pathname.endsWith('index.html');

    if (isShell) {
        // Network-first: always prefer the freshly deployed HTML.
        event.respondWith(
            fetch(req)
                .then(res => {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(SHELL, copy));
                    return res;
                })
                .catch(() => caches.match(SHELL).then(r => r || caches.match('./')))
        );
        return;
    }

    // Cache-first for everything else, refreshing the cache in the background.
    event.respondWith(
        caches.match(req).then(cached => {
            const network = fetch(req).then(res => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, copy));
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});

// Lets the page trigger an immediate update instead of waiting for a tab close.
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
