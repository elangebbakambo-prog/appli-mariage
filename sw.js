// Service worker : l'appli s'ouvre même sans réseau (programme et tâches du dernier chargement).
// Pages et fichiers : on essaie le réseau d'abord (toujours la dernière version), sinon la copie gardée.
// Les appels à Supabase ne passent pas par ici (autre domaine) : ils ne sont jamais mis en cache.
const CACHE = "mariage-v22";
const FICHIERS = ["./", "index.html", "style.css", "app.js", "config.js", "demo.js", "live.js", "infos.js", "wizz.js", "annonces.js", "souvenirs.js", "menu.js", "photos.js", "contacts.js", "vendor/qrcode.js", "manifest.webmanifest", "icon-192.png"];

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
    // « no-cache » : on demande toujours à GitHub si le fichier a changé (sinon il garde l'ancien jusqu'à 10 min)
    fetch(e.request, { cache: "no-cache" }).then(r => {
      if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// Notifications (wizz) : la base envoie { title, body, tag, url } ; toucher la notification ouvre l'appli, qui affiche le wizz.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "⚡ Wizz", {
    body: d.body || "Quelqu'un a besoin de toi !",
    icon: "icon-192.png", badge: "icon-192.png",
    tag: d.tag || "wizz", renotify: true, requireInteraction: true,
    vibrate: [300, 120, 300, 120, 600],
    data: { url: self.registration.scope }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const app = list.find(c => c.url.startsWith(self.registration.scope));
    return app ? app.focus() : self.clients.openWindow(self.registration.scope);
  }));
});
