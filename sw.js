// sw.js — service worker: met le jeu en cache pour une utilisation hors-ligne.
// Stratégie : Network-first pour les assets JS/CSS/HTML, cache-first pour le reste.
// Le cache est versionnné — à chaque push le numéro change et l'ancien cache est purgé.
const CACHE = 'bigmario-v75';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './js/main.js',
  './js/core.js',
  './js/input.js',
  './js/audio.js',
  './js/art.js',
  './js/level.js',
  './js/levels.js',
  './js/levelbuild.js',
  './js/entities.js',
  './js/scene_game.js',
  './js/scene_versus.js',
  './js/scene_minigame.js',
  './js/ai.js',
  './js/scene_map.js',
  './js/scene_replay.js',
  './js/scene_editor.js',
  './js/scene_mariokart.js',
  './js/net.js',
  './js/leaderboard.js',
  './js/ghost.js',
  './js/share.js',
  './js/medals.js',
  './js/achievements.js',
  './js/render3d.js',
  './js/vendor/three.module.js',
];

// Install : cache tous les assets et prend le contrôle immédiatement
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) =>
        c.add(new Request(u, { cache: 'no-cache' })).catch((err) => console.warn('SW: non mis en cache', u, err))
      )))
      .then(() => self.skipWaiting())
  );
});

// Activate : purge les anciens caches et prend le contrôle des clients
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      // Notifier tous les clients qu'une mise à jour est dispo
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE });
        }
      })
  );
});

// Fetch : network-first pour les fichiers du site, fallback au cache
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Ne pas intercepter WebSocket
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  // Ne pas intercepter les requêtes vers d'autres origines (CDN, API, etc.)
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    // Essayer le réseau d'abord (garantit du contenu frais)
    fetch(req).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => {
      // Hors-ligne : servir depuis le cache
      return caches.match(req);
    })
  );
});
