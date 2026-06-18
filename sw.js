// ============================================================
// sw.js – Service Worker Contrôle Cabine
// Version auto-incrémentée à chaque déploiement via timestamp
// ============================================================

const CACHE_VERSION = 'v11-20260618';
const CACHE_NAME = `controle-cabine-${CACHE_VERSION}`;

// Assets mis en cache pour le mode hors-ligne (images, manifest)
const OFFLINE_ASSETS = [
  '/index.html',
  '/agent.html',
  '/admin.html',
  '/manifest.json',
  '/images/logo.png',
];

// ── INSTALL : mise en cache minimale + activation immédiate ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(OFFLINE_ASSETS))
      .catch(err => console.warn('[SW] Erreur cache install :', err))
  );
  // Activation immédiate sans attendre confirmation utilisateur
  self.skipWaiting();
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

// ── FETCH : stratégies différenciées par type de ressource ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Requêtes externes (Supabase, CDN, fonts) → réseau direct, pas de cache
  if (url.hostname !== self.location.hostname) return;

  const path = url.pathname;
  const isJS  = path.endsWith('.js');
  const isCSS = path.endsWith('.css');
  const isNav = event.request.mode === 'navigate';

  // JS, CSS, HTML → NETWORK FIRST : toujours la dernière version si en ligne
  if (isJS || isCSS || isNav) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          // Hors-ligne : fallback sur le cache
          return (await caches.match(event.request)) || (await caches.match('/index.html'));
        }
      })()
    );
    return;
  }

  // Images, manifest → CACHE FIRST : stable, rarement modifié
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

// ── MESSAGE : skipWaiting (conservé pour compatibilité) ───────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
