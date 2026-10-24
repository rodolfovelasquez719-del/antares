// Antares v1.25 · Mi compu: dirección y clave de la PC. Dentro de la app las da la app (window.parent.__antaresPC);
// abierta sola, usa lo guardado por las muestras en este mismo sitio.
export const $ = (s) => document.querySelector(s);
const K = "antares.cerebroDoble.v1";
export const URL_PC = "https://antares.tail1d77f2.ts.net";
const local = () => { try { return JSON.parse(localStorage.getItem(K) || "{}"); } catch { return {}; } };
function desdeApp() { try { return window.parent !== window && window.parent.__antaresPC ? window.parent.__antaresPC() : null; } catch { return null; } }
export function creds() { const a = desdeApp(); if (a && a.tok) return a; const l = local(); return { url: (l.url || URL_PC).replace(/\/+$/, ""), tok: l.tok || "" }; }
export const base = () => creds().url;
export const cab = () => ({ "X-Antares-Token": creds().tok || "" });
export const guardarLocal = (url, tok) => { const l = local(); l.url = url === URL_PC ? "" : url; l.tok = tok; localStorage.setItem(K, JSON.stringify(l)); };
export const keyGemini = () => { try { const k = window.parent !== window && window.parent.__antaresGemKey ? window.parent.__antaresGemKey() : ""; if (k) return k; } catch { /* */ } const l = local(); return l.gk || ""; };
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const hora = (d) => new Date(d).toLocaleString("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export function estado(c, t) { $("#estado").className = "estado " + c; $("#estado-t").textContent = t; }
export const abrirConf = () => { const c = $("#conf"); if (c) c.open = true; };
