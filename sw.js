// Antares Web - Service worker: abre rápido y sin conexión, y recibe las versiones nuevas.
// Las llamadas a Gemini, Open-Meteo y otros dominios NO se interceptan ni se guardan.
const VERSION = "antares-v1.18.0";
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
  "./js/vault.js",
  "./js/lock.js",
  "./js/lockui.js",
  "./js/reminders.js",
  "./js/shopping.js",
  "./js/digest.js",
  "./js/notify.js",
  "./js/panels.js",
  "./js/workpanels.js",
  "./js/routes.js",
  "./js/cubic.js",
  "./js/mail.js",
  "./js/logbook.js",
  "./js/ocio.js",
  "./js/draughts.js",
  "./js/brain.js",
  "./js/agent.js",
  "./js/localbrain.js",
  "./js/draughts-worker.js",
  "./js/trivia.js",
  "./js/robotics.js",
  "./js/social.js",
  "./js/photo.js",
  "./js/code.js",
  "./js/sheet.js",
  "./js/tools.js",
  "./js/wake.js",
  "./fonts/orbitron-latin.woff2",
  "./fonts/rajdhani-600-latin.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];
const NETWORK_TIMEOUT_MS = 3000;
// v1.13: la página (index.html) espera más a la red antes de usar la copia guardada, para no quedarse en una versión vieja
const PAGE_TIMEOUT_MS = 9000;

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
      .then(() => checkReminders().catch(() => {}))
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "CHECK_REMINDERS" || (event.data && event.data.type === "CHECK_REMINDERS")) event.waitUntil(checkReminders());
});

// ---------- Recordatorios (agenda en IndexedDB "notify"; sin texto personal si hay código) ----------
function openDb() {
  return new Promise((resolve) => {
    const req = indexedDB.open("antares");
    req.onupgradeneeded = () => req.transaction.abort(); // no crear la base desde el SW: la crea la app
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
async function checkReminders() {
  const db = await openDb();
  if (!db || !db.objectStoreNames.contains("notify")) { if (db) db.close(); return; }
  const items = await new Promise((resolve) => {
    const t = db.transaction("notify", "readonly");
    const r = t.objectStore("notify").getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => resolve([]);
  });
  const now = Date.now();
  for (const it of items) {
    if (!it || it.fired || it.at > now) continue;
    it.fired = true;
    await new Promise((resolve) => {
      const t = db.transaction("notify", "readwrite");
      t.objectStore("notify").put(it, it.id);
      t.oncomplete = t.onerror = () => resolve();
    });
    try {
      await self.registration.showNotification(it.title, { body: it.body, tag: it.id, icon: "icons/icon-192.png", data: { url: "./?panel=recordatorios" } });
    } catch { /* sin permiso */ }
  }
  db.close();
}
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "antares-reminders") event.waitUntil(checkReminders());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { c.postMessage({ type: "OPEN_PANEL", panel: "recordatorios" }); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});

// Red primero (con 3 s de espera máxima); si la red tarda o falla, se usa la copia guardada.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // v1.18: el motor WebLLM (6 MB) se guarda aparte y no se borra al cambiar de versión, para que el cerebro local
  // funcione sin internet. Los archivos del modelo (Hugging Face / GitHub) son de otro dominio: el SW no los toca y
  // WebLLM los guarda en sus propias cachés "webllm/…", que este SW nunca borra.
  if (url.pathname.includes("/prueba-cerebro/vendor/web-llm/")) { event.respondWith(runtimeCacheFirst(req)); return; }
  // la página de prueba de "cerebro propio" es independiente: el SW de la app no la toca ni la guarda
  if (url.pathname.includes("/prueba-cerebro/")) return;
  if (url.pathname.includes("/muestra-cerebro/")) return;
  if (url.pathname.includes("/muestra-verde/")) return;
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  event.respondWith(networkFirst(req, isPage, event));
});

async function networkFirst(req, isPage, event) {
  // un worker viejo no debe recrear su caché después de que la versión nueva la borró
  const cache = (await caches.has(VERSION)) ? await caches.open(VERSION) : { put: async () => {}, match: (r, o) => caches.match(r, o) };
  // la página siempre se revalida con el servidor (cache: no-cache) para no quedar en una versión vieja
  const netReq = isPage ? new Request(req.url, { cache: "no-store", credentials: "same-origin" }) : req;
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
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, isPage ? PAGE_TIMEOUT_MS : NETWORK_TIMEOUT_MS, "timeout"); });
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

const RUNTIME_CACHE = "webllm-runtime-0.2.85";
async function runtimeCacheFirst(req) {
  const c = await caches.open(RUNTIME_CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const resp = await fetch(req);
  if (resp && resp.ok && resp.type === "basic") c.put(req, resp.clone()).catch(() => {});
  return resp;
}
