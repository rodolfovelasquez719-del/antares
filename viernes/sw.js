// Viernes - service worker propio (alcance /viernes/). No intercepta llamadas a Gemini.
const VERSION = "viernes-v0.4.2";
const SHELL = ["./", "./index.html", "./styles.css", "./manifest.webmanifest", "./js/app.js", "./js/editor.js", "./js/gemini.js", "./js/aiedit.js", "./js/poster.js", "./js/precios.js", "./js/img.js", "./version.json", "./js/bgremove.js", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("viernes-") && k !== VERSION && k !== VERSION + "-fonts").map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  // Letras de Google: se guardan para que los pósteres se vean bien sin internet
  if (e.request.method === "GET" && /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.open(VERSION + "-fonts").then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (e.request.method !== "GET" || u.origin !== location.origin || !u.pathname.includes("/viernes/")) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))));
});
