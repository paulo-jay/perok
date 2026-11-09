/*
 * Perok service worker.
 *
 * The app must start and fly WITHOUT a network: that is a design goal, not an
 * optimisation. The whole shell is therefore cached on install and served from
 * the cache first.
 *
 * Every URL is relative: the app is served from a sub-path on GitHub Pages,
 * where an absolute path would miss.
 */

/*
 * The cache name carries the build id, substituted by the deploy workflow. A
 * fixed cache name made deployments invisible: `sw.js` stayed byte-identical,
 * the browser saw no update, and the phone served the first shell it had
 * installed forever.
 */
const CACHE = 'perok-__BUILD_ID__';

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
  'dist/i18n.js',
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

/*
 * Serve from the cache immediately, then refresh it in the background. The
 * cache therefore always answers, network or not — that is the "fly without a
 * network" goal — while the next version is already in place for the following
 * load. A strict cache-first strategy, by contrast, froze the app for good.
 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const update = fetch(event.request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  event.waitUntil(update);

  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        update.then(
          (response) => response || new Response('offline', { status: 503 }),
        ),
    ),
  );
});
