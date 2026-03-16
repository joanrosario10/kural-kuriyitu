// IMPORTANT:
// - Never cache `index.html` long-term across deployments: it contains hashed asset URLs.
//   If you serve a stale HTML after a redeploy, it will reference assets that no longer exist -> 404.
// - Cache only the app "shell" files that are stable, and treat navigations as network-first.
const CACHE_NAME = 'kural-kuriyitu-v3';
const PRECACHE_URLS = ['/favicon.svg', '/manifest.json'];

// Install: precache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch:
// - Network-first for navigations (HTML) to avoid stale asset manifests.
// - Stale-while-revalidate for versioned build assets under /assets/.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Let the browser handle cross-origin requests directly. Intercepting CDN assets
  // here can force CORS-mode fetches that fail for fonts and other opaque responses.
  if (url.origin !== self.location.origin) return;

  // Skip WebSocket and API calls
  if (url.protocol === 'wss:' || url.hostname === 'generativelanguage.googleapis.com') return;

  // Navigations / HTML — network-first (do NOT serve stale index.html)
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Versioned assets — stale-while-revalidate
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default: just go to network (avoid caching random routes)
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
