// Service worker : coque de l'app disponible hors ligne ; l'API et les tuiles de carte ne sont jamais mises en cache.
const CACHE = "geodam-v3";
const SHELL = ["/", "/index.html", "/css/style.css", "/js/app.js", "/js/shared.js", "/js/i18n.js", "/data/dams.json", "/data/countries.json",
  "/vendor/leaflet/leaflet.js", "/vendor/leaflet/leaflet.css", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // réseau d'abord (les mises à jour arrivent tout de suite), cache en secours hors ligne
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match("/index.html"))));
});
