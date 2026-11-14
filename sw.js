// Service worker: guarda o app para funcionar offline.
// Ao publicar uma versão nova, mude o número abaixo para forçar a atualização.
const CACHE = "ligalab-calc-v1";
const ARQUIVOS = [
  "./",
  "index.html",
  "calc.js",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Responde do cache na hora e atualiza em segundo plano quando há internet.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const guardado = await c.match(e.request);
      const rede = fetch(e.request)
        .then((r) => {
          if (r && (r.ok || r.type === "opaque")) c.put(e.request, r.clone());
          return r;
        })
        .catch(() => guardado);
      return guardado || rede;
    })
  );
});
