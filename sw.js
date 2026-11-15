// Service worker: guarda o app para funcionar offline.
// Com internet, busca sempre a versão mais nova dos arquivos; sem internet (ou com a rede lenta), usa a cópia guardada.
// Ao publicar uma versão nova, mude o número abaixo (e VERSAO no config.js).
const CACHE = "ligalab-calc-v14";
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
const LIMITE_MS = 4000; // quanto esperar pela rede antes de usar a cópia guardada

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Arquivos do app: rede primeiro (sempre a versão publicada), cópia guardada se a rede falhar ou demorar. */
async function redePrimeiro(req) {
  const cache = await caches.open(CACHE);
  const guardado = () => cache.match(req, { ignoreSearch: true });
  const daRede = fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then((r) => {
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  });
  try {
    const r = await Promise.race([daRede, new Promise((_, falha) => setTimeout(() => falha(new Error("rede lenta")), LIMITE_MS))]);
    if (r && r.ok) return r;
    return (await guardado()) || r;
  } catch (e) {
    daRede.catch(() => {}); // a resposta atrasada ainda atualiza a cópia guardada, se chegar
    const g = await guardado();
    if (g) return g;
    return daRede;
  }
}

/** Fontes: mudam raramente; usa a cópia guardada e só vai à rede se não houver. */
async function cachePrimeiro(req) {
  const cache = await caches.open(CACHE);
  const g = await cache.match(req);
  if (g) return g;
  const r = await fetch(req);
  if (r && (r.ok || r.type === "opaque")) cache.put(req, r.clone());
  return r;
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin === self.location.origin) e.respondWith(redePrimeiro(e.request));
  else if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cachePrimeiro(e.request));
  // Login e Google Drive vão sempre direto para a rede, sem passar por aqui.
});
