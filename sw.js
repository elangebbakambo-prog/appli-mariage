// Service worker : l'appli s'ouvre même sans réseau (programme et tâches du dernier chargement).
// Pages et fichiers : on essaie le réseau d'abord (toujours la dernière version), sinon la copie gardée.
// Les appels à Supabase ne passent pas par ici (autre domaine) : ils ne sont jamais mis en cache.
const CACHE = "mariage-v10";
const FICHIERS = ["./", "index.html", "style.css", "app.js", "config.js", "demo.js", "live.js", "infos.js", "vendor/qrcode.js", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
