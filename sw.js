// sw.js — service worker: met le jeu en cache pour une utilisation hors-ligne.
// Incrémente CACHE à chaque mise à jour des fichiers pour forcer le rafraîchissement.
const CACHE = 'bigmario-v54';
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

self.addEventListener('install', (e) => {
  // Mise en cache tolérante : un asset manquant ne casse pas tout le hors-ligne.
  // Bypass du cache HTTP du navigateur (cache: no-cache) pour garantir les nouveaux fichiers
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, {cache: 'no-cache'})).catch((err) => console.warn('SW: non mis en cache', u, err)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Ne pas intercepter les connexions WebSocket / temps réel
  const url = new URL(req.url);
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.status === 200 && url.origin === location.origin) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => cached))
  );
});
