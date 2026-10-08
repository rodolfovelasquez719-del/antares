// Antares Web - Service worker: abre rápido y sin conexión, y recibe las versiones nuevas.
// Las llamadas a Gemini, Open-Meteo y otros dominios NO se interceptan ni se guardan.
const VERSION = "antares-v1.4.0";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/gemini.js",
  "./js/memory.js",
  "./js/facts.js",
  "./js/voice.js",
  "./js/media.js",
  "./js/weather.js",
  "./fonts/orbitron-latin.woff2",
  "./fonts/rajdhani-600-latin.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      // solo se borran cachés viejas de Antares, nunca otras del mismo dominio
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("antares-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// Red primero (con 3 s de espera máxima); si la red tarda o falla, se usa la copia guardada.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  event.respondWith(networkFirst(req, isPage, event));
});

async function networkFirst(req, isPage, event) {
  // un worker viejo no debe recrear su caché después de que la versión nueva la borró
  const cache = (await caches.has(VERSION)) ? await caches.open(VERSION) : { put: async () => {}, match: (r, o) => caches.match(r, o) };
  // la página siempre se revalida con el servidor (cache: no-cache) para no quedar en una versión vieja
  const netReq = isPage ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" }) : req;
  const network = fetch(netReq).then((resp) => {
    if (resp && resp.ok && resp.type === "basic") {
      const copy = resp.clone();
      const key = isPage ? "./index.html" : req;
      event.waitUntil(cache.put(key, copy).catch(() => {}));
    }
    return resp;
  });
  const cachedLookup = () => (isPage ? cache.match("./index.html") : cache.match(req, { ignoreSearch: true }));
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, NETWORK_TIMEOUT_MS, "timeout"); });
  try {
    const first = await Promise.race([network, timeout]);
    clearTimeout(timer);
    if (first !== "timeout") return first;
    // la red tarda: usar la copia guardada si existe (la red sigue actualizando la caché en segundo plano)
    const cached = await cachedLookup();
    if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
    return await network;
  } catch {
    clearTimeout(timer);
    const cached = await cachedLookup();
    if (cached) return cached;
    if (isPage) {
      const fallback = await cache.match("./");
      if (fallback) return fallback;
    }
    return new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
