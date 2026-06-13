// ============================================================
// sw.js – Service Worker Contrôle Cabine
// Incrémenter CACHE_VERSION à chaque déploiement majeur
// ============================================================

const CACHE_VERSION = 'v2';
const CACHE_NAME = `controle-cabine-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/index.html',
  '/agent.html',
  '/admin.html',
  '/css/style.css',
  '/js/auth.js',
  '/js/agent.js',
  '/js/admin.js',
  '/js/supabase-client.js',
  '/js/utils.js',
  '/js/pwa.js',
  '/images/logo.png',
  '/manifest.json',
];

// ── INSTALL : mise en cache des assets statiques ──────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.warn('[SW] Erreur cache install :', err))
  );
  // Ne pas appeler skipWaiting ici — on attend la confirmation utilisateur
});

// ── ACTIVATE : suppression des anciens caches ─────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH : stratégie de cache ────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Requêtes externes (Supabase, CDN, fonts) → réseau direct
  if (url.hostname !== self.location.hostname) return;

  // Navigations (HTML) → réseau en priorité, cache en fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Essayer avec .html si l'URL n'a pas d'extension (ex: /agent → /agent.html)
        const withHtml = url.pathname.endsWith('.html')
          ? null
          : new Request(url.origin + url.pathname + '.html');
        return (withHtml ? caches.match(withHtml) : Promise.resolve(null))
          .then(r => r || caches.match(event.request))
          .then(r => r || caches.match('/index.html'));
      })
    );
    return;
  }

  // Assets statiques → cache en priorité, réseau en fallback + mise à jour du cache
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ── MESSAGE : skipWaiting déclenché par l'utilisateur ─────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
