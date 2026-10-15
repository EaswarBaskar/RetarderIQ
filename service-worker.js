const CACHE_NAME = 'retarder-iq-shell-v116';
const SHELL = [
  '/',
  '/index.html',
  '/admin.html',
  '/js/app.js',
  '/js/index-inline.js',
  '/js/admin.js',
  '/js/diagnosticSteps.js',
  '/data/diagnosticSteps.v1.0.0.json',
  '/data/tmlDiagnostic.v1.0.0.json',
  '/data/languages/en.json',
  '/data/languages/ta.json',
  '/data/languages/ml.json',
  '/data/languages/hi.json',
  '/data/languages/te.json',
  '/data/languages/kn.json',
  '/js/languages.js',
  '/css/index-inline.css',
  '/css/admin-inline.css',
  '/css/fonts.css',
  '/asset/fonts/outfit-300.ttf',
  '/asset/fonts/outfit-400.ttf',
  '/asset/fonts/outfit-500.ttf',
  '/asset/fonts/outfit-600.ttf',
  '/asset/fonts/outfit-700.ttf',
  '/asset/fonts/outfit-800.ttf',
  '/js/reportRenderer.js',
  '/tml.js',
  '/css/style.css',
  '/manifest.json',
  '/asset/optimized/ashokleyland.png',
  '/asset/optimized/retarder-icon.png',
  '/asset/music/machine-start.mp3',
  '/asset/music/car-accelerate.mp3',
  '/asset/music/car-brake.mp3',
  '/asset/optimized/customermating.jpg',
  '/asset/optimized/retarderswitch.jpg',
  '/asset/optimized/retarderassy.jpg',
  '/asset/optimized/ecuspeedbox1.jpg',
  '/asset/albs6/customermatingbs6.webp',
  '/asset/albs6/ecuspeedboxbs6.webp',
  '/asset/optimized/airpressureswitch.jpg',
  '/asset/optimized/relaybox1.png',
  '/asset/optimized/retarder.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  const isApplicationCode = requestUrl.pathname.endsWith('.js');
  const isStylesheet = requestUrl.pathname.endsWith('.css');
  const isDocument = event.request.mode === 'navigate' || requestUrl.pathname === '/' || requestUrl.pathname.endsWith('.html');
  if (isDocument) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }
  if (isApplicationCode || isStylesheet) {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('/index.html')))
  );
});
