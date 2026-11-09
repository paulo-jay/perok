/*
 * Service worker de Perok.
 *
 * L'application doit se lancer et voler SANS réseau : c'est un objectif de
 * conception, pas une optimisation. La coquille est donc entièrement mise en
 * cache à l'installation, et servie depuis le cache en priorité.
 *
 * Toutes les URL sont relatives : l'application est servie depuis un
 * sous-chemin sur GitHub Pages, où un chemin absolu pointerait à côté.
 */

const CACHE = 'perok-v1';

const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/favicon.ico',
  'dist/ui/app.js',
  'dist/ui/slide-to-confirm.js',
  'dist/drone/drone.js',
  'dist/drone/loop.js',
  'dist/input/dualstick.js',
  'dist/transport/ble.js',
  'dist/protocol/uuids.js',
  'dist/protocol/frames.js',
  'dist/protocol/sequence.js',
  'dist/protocol/notifications.js',
  'dist/axes.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request);
    }),
  );
});
