// Viernes - service worker propio (alcance /viernes/). No intercepta llamadas a Gemini.
const VERSION = "viernes-v0.3.0";
const SHELL = ["./", "./index.html", "./styles.css", "./manifest.webmanifest", "./js/app.js", "./js/editor.js", "./js/gemini.js", "./js/aiedit.js", "./js/poster.js", "./js/precios.js", "./js/bgremove.js", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("viernes-") && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || !u.pathname.includes("/viernes/")) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))));
});
