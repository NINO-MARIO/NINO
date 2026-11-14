/* the game adds a cache-busting ?v=... to its files; the precached copies are keyed without it, so game lookups ignore the query */
function gameLookup(req){return new URL(req.url).pathname.indexOf('/games/')>=0?{ignoreSearch:true}:undefined;}
function ovrMatch(req){return caches.open('nino-ovr').then((c)=>c.match(req.url.split('?')[0])).then((o)=>o||caches.match(req,gameLookup(req))).catch(()=>caches.match(req,gameLookup(req)));}
importScripts('./version.js');
const CACHE = 'nino-v' + self.NINO_VERSION + '-g' + (self.NINO_GEN || 1);
const BASE_ASSETS = ['./', './index.html', './style.css', './manifest.json', './version.js', './home.json', './skills/manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

async function listAssets() {
  const list = BASE_ASSETS.slice();
  try {
    const res = await fetch('./index.html', { cache: 'reload' });
    const html = await res.text();
    const re = /<script[^>]+src=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      if (!/^(https?:)?\/\//.test(m[1])) list.push(m[1].indexOf('./') === 0 ? m[1] : './' + m[1]);
    }
  } catch (e) {}
  return Array.from(new Set(list));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([caches.open(CACHE), listAssets()])
      .then(([c, assets]) => Promise.all(assets.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => /^nino-v\d/.test(k) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
  event.waitUntil(precacheGame());
});

/* The game (games/outlaw) is not in the install list above: it is many files in folders. Its complete list is written by
   tools/make-manifests.py. Files already in the cache are kept; the rest are added here so the game opens with no network,
   even if it was never opened online. A failed file is skipped, and the game's own requests fill any gap when online. */
const GAME_LIST = './games/outlaw/offline-files.json';
async function precacheGame() {
  try {
    const c = await caches.open(CACHE);
    const res = await fetch(GAME_LIST, { cache: 'no-cache' });
    if (!res.ok) return;
    const files = await res.json();
    const todo = [];
    for (const p of files) {
      const u = './' + p;
      if (!(await c.match(u))) todo.push(u);
    }
    let next = 0;
    const lane = async () => {
      while (next < todo.length) {
        const u = todo[next++];
        await c.add(new Request(u, { cache: 'no-cache' })).catch(() => null);
      }
    };
    await Promise.all([lane(), lane(), lane(), lane(), lane(), lane()]);
  } catch (e) { /* offline or blocked: nothing to do, the game still caches what it loads */ }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isHTML) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || (url.pathname.indexOf('/games/') >= 0
          ? new Response('', { status: 503, statusText: 'game not cached' })
          : caches.match('./index.html'))))
    );
    return;
  }

  event.respondWith(
    ovrMatch(req).then((hit) => {
      const refresh = fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => hit);
      if (hit) { event.waitUntil(refresh); return hit; }
      return refresh;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
