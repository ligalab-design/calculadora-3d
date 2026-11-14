// Service worker: guarda o app para funcionar offline.
// Ao publicar uma versão nova, mude o número abaixo para forçar a atualização.
const CACHE = "ligalab-calc-v7";
const ARQUIVOS = [
  "./",
  "index.html",
  "app.js",
  "calc.js",
  "dados.js",
  "importar.js",
  "zip.js",
  "sync.js",
  "nuvem.js",
  "drive.js",
  "config.js",
  "manifest.webmanifest",
  "privacidade.html",
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
  // Só guarda os arquivos do próprio app e as fontes. Login e Google Drive vão sempre direto para a rede.
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin && !/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
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
