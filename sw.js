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
  'dist/ui/updates.js',
  'dist/drone/drone.js',
  'dist/drone/loop.js',
  'dist/input/dualstick.js',
  'dist/transport/ble.js',
  'dist/protocol/uuids.js',
  'dist/protocol/frames.js',
  'dist/protocol/sequence.js',
  'dist/protocol/notifications.js',
  'dist/protocol/args.js',
  'dist/protocol/parse.js',
  'dist/drone/limits.js',
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
 * The page asks which build is actually serving it. Without this, "is my phone
 * up to date?" is unanswerable from the app itself, which is precisely how an
 * update problem goes unnoticed.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'version' && event.ports[0]) {
    event.ports[0].postMessage({ version: CACHE });
  }
});

/*
 * Serve from the cache immediately, then refresh it in the background. The
 * cache therefore always answers, network or not — that is the "fly without a
 * network" goal — while the next version is already in place for the following
 * load. A strict cache-first strategy, by contrast, froze the app for good.
 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // A page load may carry a query string the precache has never seen, and the
  // cache matches URLs including their search. Without this, opening the app
  // offline at anything but the exact cached URL answered 503.
  const navigation = event.request.mode === 'navigate';

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
    (async () => {
      const hit = await caches.match(event.request, { ignoreSearch: navigation });
      if (hit) return hit;

      const fresh = await update;
      if (fresh) return fresh;

      // Offline and never cached under this exact URL: any navigation is the
      // same shell, so serve it rather than failing the launch.
      if (navigation) {
        const shell = await caches.match('index.html');
        if (shell) return shell;
      }

      return new Response('offline', { status: 503 });
    })(),
  );
});
