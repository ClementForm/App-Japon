// Changer la version pour forcer la mise à jour de l'app sur les téléphones.
const SHELL_CACHE = 'shell-v31';
const TILE_CACHE = 'tiles-v1'; // doit correspondre à app.js
const PHOTO_CACHE = 'photos-v1'; // idem
const TILE_HOSTS = ['tiles.openfreemap.org', 'server.arcgisonline.com', 'a.tile.openstreetmap.fr']; // fonds de carte de app.js

const SHELL = [
  'index.html',
  'styles.css',
  'itineraire.js',
  'app.js',
  'manifest.webmanifest',
  'vendor/maplibre/maplibre-gl.js',
  'vendor/maplibre/maplibre-gl.css',
  'vendor/fonts/source-sans-3-latin.woff2',
  'vendor/fonts/source-sans-3-latin-ext.woff2',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// Même règle que dans app.js : les tuiles OpenFreeMap sont rangées sans leur version.
const tileKey = (url) => url.replace(/(tiles\.openfreemap\.org\/planet\/)[^/]+\//, '$1_/');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (TILE_HOSTS.includes(url.hostname)) {
    // Style et description des tuiles (sans extension) : le réseau d'abord pour rester à jour.
    const fresh = url.hostname === 'tiles.openfreemap.org' && !/\.\w+$/.test(url.pathname);
    e.respondWith(fresh ? networkFirst(req) : tile(req));
  } else if (url.origin === location.origin && url.pathname.includes('/photos/')) {
    e.respondWith(photo(req));
  } else if (url.origin === location.origin) {
    e.respondWith(shell(e));
  }
});

// Tuiles : le cache d'abord, le réseau sinon (et on garde la tuile).
async function tile(req) {
  const cache = await caches.open(TILE_CACHE);
  const key = tileKey(req.url);
  const hit = await cache.match(key, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

// Photos des lieux (mises en cache par app.js au lancement) : le cache d'abord.
async function photo(req) {
  const cache = await caches.open(PHOTO_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

// Le réseau d'abord (4 s max), le cache si pas de connexion.
async function networkFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (res.ok) cache.put(req.url, res.clone());
    return res;
  } catch {
    return (await cache.match(req.url, { ignoreVary: true })) || new Response('', { status: 504 });
  }
}

// Fichiers de l'app : le réseau d'abord (pour voir tout de suite les mises à jour),
// le cache si pas de connexion ou si le réseau traîne plus de 3 s.
async function shell(e) {
  const req = e.request;
  const cache = await caches.open(SHELL_CACHE);
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  try {
    return await Promise.race([net, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))]);
  } catch {
    const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' && (await cache.match('index.html')));
    return hit || new Response('Hors ligne', { status: 503 });
  }
}
