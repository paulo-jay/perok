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

/*
 * Le nom du cache porte l'identifiant du build, substitue par le workflow de
 * deploiement. Un cache fixe rendait les mises en ligne invisibles : `sw.js`
 * restait identique octet pour octet, le navigateur ne voyait aucune mise a
 * jour, et le telephone servait indefiniment la premiere coquille installee.
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
 * Servir depuis le cache immediatement, puis le rafraichir en arriere-plan.
 * Le cache repond donc toujours, reseau ou pas — c'est l'objectif « voler sans
 * reseau » — tandis que la version suivante est deja prete au chargement
 * d'apres. Un cache-first strict, lui, figeait l'application pour de bon.
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
          (response) => response || new Response('hors ligne', { status: 503 }),
        ),
    ),
  );
});
