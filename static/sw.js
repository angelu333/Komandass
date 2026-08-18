const CACHE = "comandas-static-v1";
const STATIC = [
  "/",
  "/static/index.html",
  "/static/style.css",
  "/static/app.js",
  "/static/icons.js",
  "/static/icons/favicon.svg",
  "/static/manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  // Las APIs conservan su manejo normal; la app ya tiene cola de pedidos offline.
  if (new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then(response => {
    const copia = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copia));
    return response;
  }).catch(() => caches.match(event.request).then(respuesta => respuesta || caches.match("/"))));
});
