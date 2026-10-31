// Viernes - app principal. Almacenamiento propio (prefijo "viernes."), separado de Antares.
import { ask, testKey, PERSONA } from "./gemini.js";
import { initEditor } from "./editor.js";
import { initPoster, initCollage } from "./poster.js";
import { initPrecios } from "./precios.js";
import { loadCanvas, busy } from "./img.js";
import { crearMemoria } from "../../comun/memoria.js";
import { initFotos, abrirFotos } from "./fotos.js";
export const mem = crearMemoria("viernes"); // carpeta "viernes" en este teléfono
export const VERSION = "0.8.0";
const $ = (id) => document.getElementById(id);
const CFG = "viernes.config.v1", CHAT = "viernes.chat.v1";
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };
// Configuración robusta: copia de respaldo y almacenamiento persistente (el navegador no la borra solo)
const CFG_BAK = "viernes.config.bak";
export let config = (() => { const a = load(CFG, null), b = load(CFG_BAK, null); return (a && (a.keys || a.key)) ? a : (b && (b.keys || b.key)) ? b : (a || b || {}); })();
if (config.key && !config.keys) config.keys = [config.key];
const saveCfg = () => { save(CFG, config); save(CFG_BAK, config); };
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* */ }
export const toast = (t, ms = 2600) => { const e = $("toast"); e.textContent = t; e.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.add("hidden"), ms); };
export const hasKey = () => !!(config.keys && config.keys.length);
export const apiKey = () => (config.keys || [])[0] || "";
export const apiKeys = () => (config.keys || []).slice();
const persona = () => PERSONA.replace("tratas a Wendy de 'tú' con cariño", config.trato === "usted" ? "tratas a Wendy de 'usted' con mucho cariño" : "tratas a Wendy de 'tú' con cariño") +
  (config.extra ? "\nIndicaciones de Freddy: " + config.extra : "");
const hoy = () => "\nHoy es " + new Date().toLocaleString("es-CR", { timeZone: "America/Costa_Rica", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }) + " (hora de Costa Rica). Si no tienes datos actualizados de algo (precios, noticias, horarios), dilo con sencillez.";
export const askViernes = (history, opts = {}) => ask(apiKeys(), history, { ...opts, system: (opts.system || persona()) + hoy() });

// ---- Configuración por enlace de Freddy: #setup=<base64url(JSON)> ----
// #sync=<base64url {u,k}>: conecta la memoria con la PC de Freddy (solo un aviso; nada nuevo en pantalla)
function readSync(txt = location.hash) {
  const m = String(txt).match(/sync=([A-Za-z0-9_-]+)/); if (!m) return false;
  history.replaceState({ v: "v-chat" }, "", location.pathname + location.search);
  try { const j = JSON.parse(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))); if (!/^https:\/\//.test(j.u) || !j.k) throw 0; mem.configurarSync({ url: j.u, token: j.k }); toast("¡Listo! Mi memoria queda guardada también en la compu de Freddy 💜", 4000); }
  catch { toast("Ese enlace no sirvió. Pídele a Freddy uno nuevo."); }
  return true;
}
async function readSetup() {
  if (readSync()) return;
  const m = location.hash.match(/setup=([A-Za-z0-9_-]+)/);
  if (!m) return;
  history.replaceState({ v: "v-chat" }, "", location.pathname + location.search); // borra la key de la barra y del historial
  try {
    const json = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")))));
    if (json.v !== 1) throw 0;
    config = { ...config, keys: [json.k, json.k2].map((k) => String(k || "").replace(/\s+/g, "")).filter(Boolean), name: json.n || "Wendy", trato: json.t || "tu", extra: json.x || "", wa: json.w || config.wa || "", brand: json.b || config.brand || "", setupAt: new Date().toISOString() };
    if (!config.keys.length) throw 0; delete config.key;
    if (json.s && json.s.u && json.s.k) mem.configurarSync({ url: json.s.u, token: json.s.k });
    saveCfg();
    let ok = false; for (const k of config.keys) if (await testKey(k)) { ok = true; break; }
    toast(ok ? "¡Listo! Viernes quedó preparada 💜" : "Recibí el enlace, pero la conexión no respondió. Avísale a Freddy.", 4000);
  } catch { toast("Ese enlace no sirvió. Pídele a Freddy uno nuevo."); }
}

// ---- Navegación ----
function show(v, push = true) {
  if (push && history.state?.v !== v) history.pushState({ v }, "", location.pathname);
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("active", s.id === v));
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  window.scrollTo(0, 0);
}
document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => show(!hasKey() && (b.dataset.v === "v-chat" || b.dataset.v === "v-search" || b.dataset.v === "v-vision") ? "v-nokey" : b.dataset.v));
addEventListener("popstate", (e) => show(e.state?.v || "v-chat", false));
let taps = 0; document.querySelector(".orb").onclick = () => { if (++taps >= 5) { taps = 0; renderStatus(); show("v-set"); } setTimeout(() => taps = 0, 2000); };

// ---- Chat ----
let chat = load(CHAT, []);
const log = $("chat-log");
function bubble(role, text, extra = "") {
  const d = document.createElement("div"); d.className = "msg " + (role === "user" ? "me" : "v"); if (role === "user") d.textContent = text; else d.innerHTML = md(text);
  if (extra) d.insertAdjacentHTML("beforeend", extra);
  log.appendChild(d); d.scrollIntoView({ block: "end" }); return d;
}
function renderChat() {
  log.innerHTML = "";
  if (!chat.length) bubble("v", `¡Hola, ${config.name || "Wendy"}! Soy Viernes 💜 ¿En qué te ayudo hoy? Puedes escribirme o tocar el micrófono 🎙️`);
  chat.slice(-30).forEach((m) => bubble(m.role, m.text));
}
// ---- 0.8.0: Fotos para vender ----
const abrirSeccionFotos = () => { initFotos(); show("v-fotos"); };
["go-fotos", "go-fotos2", "go-fotos3"].forEach((id) => $(id) && ($(id).onclick = abrirSeccionFotos));
let fotoChat = null;
$("chat-file").onchange = (e) => { fotoChat = e.target.files[0] || null; e.target.value = ""; $("chat-pic").classList.toggle("on", !!fotoChat);
  if (fotoChat) { toast("📷 Foto lista. Ahora dime qué hago (ej.: quitale el fondo, hazme un afiche)", 3500); $("chat-in").focus(); } };
const PIDE_FOTO = /fondo|afiche|p[oó]ster|anuncio|recort|quit|editar|edita|vender|m[aá]rmol|madera|degrad/i;
function enviarFoto(text) {
  const f = fotoChat; fotoChat = null; $("chat-pic").classList.remove("on");
  const t = text.trim() || "fondo blanco para vender";
  bubble("user", "📷 " + t);
  const modo = abrirFotosDesdeChat(f, t);
  bubble("v", modo === "afiche" ? "¡Con gusto! 🛍️ Te estoy haciendo el afiche en **Fotos para vender**." : "¡Con gusto! 🪄 Lo estoy haciendo en **Fotos para vender**.");
}
function abrirFotosDesdeChat(f, t) { initFotos(); show("v-fotos"); return abrirFotos(f, PIDE_FOTO.test(t) || /a mano/i.test(t) ? t : "fondo blanco para vender " + t); }
async function send(text) {
  if (fotoChat) return enviarFoto(text);
  if (!text.trim()) return;
  if (!hasKey()) return show("v-nokey");
  const hit = mem.buscar(text); // pregunta repetida: se responde de la memoria, sin red ni tokens
  if (hit) { chat.push({ role: "user", text }, { role: "model", text: hit.texto }); bubble("user", text); bubble("v", hit.texto); save(CHAT, chat.slice(-60)); return; }
  if (!navigator.onLine) return toast("Estás sin internet. Revisa el wifi o los datos 📶");
  chat.push({ role: "user", text }); bubble("user", text);
  const t = bubble("v", "Pensando"); t.classList.add("typing");
  const r = await askViernes(chat.slice(-12).filter((m, i, a) => i > 0 || m.role === "user"), { search: /\b(hoy|precio|dónde|donde|horario|noticia|clima|tendencia|cuánto|cuanto|abre)\b/i.test(text), system: persona() + mem.paraPrompt() + mem.instruccionAprender });
  if (r.ok) r.text = mem.extraer(r.text).texto;
  t.classList.remove("typing"); t.innerHTML = md(r.text);
  if (r.ok) { chat.push({ role: "model", text: r.text }); save(CHAT, chat.slice(-60)); if (chat.length <= 3 || !/^(y|pero|entonces)\b/i.test(text)) mem.guardar(text, r.text, { fuentes: r.sources }); } else chat.pop();
}
let sending = false;
$("chat-form").onsubmit = async (e) => { e.preventDefault(); if (sending) return; const v = $("chat-in").value; $("chat-in").value = ""; sending = true; try { await send(v); } finally { sending = false; } };
// Voz (Chrome Android)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
$("mic").onclick = () => {
  if (!SR) return toast("Este navegador no permite dictar. Usa Chrome.");
  const r = new SR(); r.lang = "es-CR"; r.interimResults = true;
  $("mic").classList.add("rec");
  r.onresult = (e) => { const t = [...e.results].map((x) => x[0].transcript).join(""); $("chat-in").value = t; if (e.results[e.results.length - 1].isFinal) { $("chat-in").value = ""; send(t); } };
  r.onend = () => $("mic").classList.remove("rec"); r.onerror = () => $("mic").classList.remove("rec");
  r.start();
};

// ---- Buscar (con Google Search de Gemini) ----
export const plain = (t) => String(t).replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*[*-]\s+/gm, "• ").replace(/^#+\s*/gm, "").replace(/^\*{3,}$/gm, "");
const md = (t) => esc(plain(String(t).replace(/\*\*(.+?)\*\*/g, "\u0001$1\u0002"))).replace(/\u0001/g, "<b>").replace(/\u0002/g, "</b>");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let searching = false;
async function search(q) {
  if (!q.trim() || searching) return; if (!hasKey()) return show("v-nokey");
  const o = $("search-out");
  const hit = mem.buscar("buscar: " + q);
  let r = hit ? { ok: true, text: hit.texto, sources: hit.fuentes } : null;
  if (!r) {
    if (!navigator.onLine) return toast("Estás sin internet. Revisa el wifi o los datos 📶");
    searching = true; setTimeout(() => searching = false, 1500);
    o.classList.remove("hidden"); o.innerHTML = '<span class="typing">Buscando</span>';
    r = await askViernes([{ role: "user", text: q }], { search: true, system: persona() + mem.paraPrompt() });
    if (r.ok) mem.guardar("buscar: " + q, r.text, { fuentes: r.sources || [], volatil: true });
  }
  o.classList.remove("hidden");
  o.innerHTML = md(r.text) + (r.sources && r.sources.length ? "<hr><b>Fuentes:</b><br>" + r.sources.map((s) => `• <a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || "fuente")}</a>`).join("<br>") : "");
}
$("search-form").onsubmit = (e) => { e.preventDefault(); search($("search-in").value); };
$("search-chips").onclick = (e) => { if (e.target.tagName === "BUTTON") { $("search-in").value = e.target.textContent; search(e.target.textContent); } };

// ---- Mi negocio: pestañas, textos, ideas ----
$("biz-tabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return;
  $("biz-tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".bizp").forEach((p) => p.classList.toggle("hidden", p.dataset.b !== b.dataset.b)); };
const chipPick = (id) => { const el = $(id); el.onclick = (e) => { if (e.target.tagName === "BUTTON") el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.target)); }; return () => (el.querySelector(".on") || {}).dataset; };
const kind = chipPick("tx-kind");
let txImg = null;
$("tx-file").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; txImg = await shrink(f); if (txImg) { toast("Foto lista 📷"); e.target.closest("label").firstChild.nextSibling && (e.target.parentElement.lastChild.textContent = " ✅ Foto lista (toca para cambiarla)"); } };
export async function shrink(file, max = 1024) {
  const c = await loadCanvas(file, max); if (!c) return null;
  return { type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
}
const KIND = { ig: "una publicación de Instagram (texto atractivo con emojis, llamado a la acción para escribir por DM, y 15 hashtags en español relevantes para Costa Rica)",
  fb: "una publicación de Facebook (cálida, con precio, cómo pedir por WhatsApp o Messenger, y 5 hashtags)",
  wa: "la ficha del Catálogo de WhatsApp Business: nombre corto (máx 60 caracteres), descripción breve (máx 300 caracteres) y precio" };
$("tx-go").onclick = busy($("tx-go"), async () => {
  if (!hasKey()) return show("v-nokey");
  const o = $("tx-out"); o.classList.remove("hidden"); o.innerHTML = '<span class="typing">Escribiendo</span>';
  const r = await askViernes([{ role: "user", text: `Escribe ${KIND[kind().k]} para este producto hecho a mano por Wendy: ${$("tx-in").value || "(mira la foto)"}. Además da 2 opciones de título corto para póster. Solo el texto listo para copiar.` }], { image: txImg });
  o.innerHTML = md(r.text) + (r.ok ? '<br><button class="pri big" id="tx-copy">📋 Copiar texto</button>' : "");
  if (r.ok) $("tx-copy").onclick = () => navigator.clipboard.writeText(plain(r.text)).then(() => toast("Copiado ✅"));
});
$("id-go").onclick = busy($("id-go"), async () => {
  if (!hasKey()) return show("v-nokey");
  const o = $("id-out"); o.classList.remove("hidden"); o.innerHTML = '<span class="typing">Imaginando</span>';
  const r = await askViernes([{ role: "user", text: `Dame 6 ideas de nuevos diseños de pulseras, collares o accesorios hechos a mano para vender en Costa Rica${$("id-in").value ? " sobre: " + $("id-in").value : ""}. Para cada una: nombre bonito, materiales, combinación de colores (nombres de colores), público ideal y precio sugerido en colones. Formato corto con emojis.` }], { search: true });
  o.innerHTML = md(r.text);
});

// ---- Visión ----
const BABY = () => { const b = new Date(2025, 9, 15), m = Math.max(0, Math.round((Date.now() - b) / 2.63e9)); return m; };
let looking = false;
async function vision(file) {
  if (!hasKey()) return show("v-nokey");
  if (looking) return; if (!navigator.onLine) return toast("Estás sin internet. Revisa el wifi o los datos 📶");
  const img = await shrink(file, 1024); if (!img) return;
  looking = true; try { await visionRun(file, img); } finally { looking = false; $("vi-file").value = ""; $("vi-file2").value = ""; }
}
async function visionRun(file, img) {
  $("vi-img").src = URL.createObjectURL(file); $("vi-img").classList.remove("hidden");
  const o = $("vi-out"); o.classList.remove("hidden"); o.innerHTML = '<span class="typing">Mirando la foto</span>';
  const q = `Mira esta foto. ${$("vi-q").value ? "Pregunta de Wendy: " + $("vi-q").value + ". " : ""}Explícale a Wendy en español sencillo, con estas secciones cortas y emojis:
🔎 Qué es (marca/modelo si se ve)
🎯 Para qué sirve
👐 Cómo se usa (pasos breves)
🛡️ Seguridad y edad: si es para bebés o niños, di si es adecuado para Evangeline, su hija de unos ${BABY()} meses (nació en octubre 2025), con advertencias importantes (asfixia, piezas pequeñas, edad mínima del fabricante). Si no es para bebés, dilo y da precauciones generales.
🛒 Dónde comprar en Costa Rica y precio aproximado en colones: considera Walmart, PriceSmart, Pequeño Mundo, Maxi Palí, Automercado y Amazon por Aeropost. Usa la búsqueda si puedes. Deja claro que los precios son aproximados y pueden cambiar. No inventes enlaces.
Al final, en una línea aparte, escribe exactamente: BUSCAR: <nombre corto del producto para buscar en tiendas>`;
  const r = await askViernes([{ role: "user", text: q }], { image: img, search: true });
  let text = r.text, term = "";
  const m = text.match(/BUSCAR:\s*(.+)\s*$/m); if (m) { term = m[1].replace(/[<>*]/g, "").trim(); text = text.replace(m[0], "").trim(); }
  const enc = encodeURIComponent, t = enc(term), stores = term ? [
    ["🛍️ Google Shopping (Costa Rica)", `https://www.google.com/search?tbm=shop&gl=cr&hl=es&q=${t}`],
    ["Walmart", `https://www.walmart.co.cr/${t}?_q=${t}&map=ft`],
    ["PriceSmart", `https://www.google.com/search?q=${enc(term + " site:pricesmart.com/es-cr")}`],
    ["Pequeño Mundo", `https://www.google.com/search?q=${enc(term + " Pequeño Mundo Costa Rica")}`],
    ["Maxi Palí", `https://www.google.com/search?q=${enc(term + " Maxi Palí Costa Rica")}`],
    ["Automercado", `https://www.google.com/search?q=${enc(term + " site:automercado.cr")}`],
    ["Amazon (traer por Aeropost)", `https://www.amazon.com/s?k=${t}`]] : [];
  o.innerHTML = md(text) + (r.ok ? '<p class="hint">💡 Los precios son aproximados; confírmalos en la tienda.</p>' : "") +
    (r.sources && r.sources.length ? "<b>Fuentes:</b><br>" + r.sources.map((s) => `• <a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || "fuente")}</a>`).join("<br>") : "") +
    (stores.length ? `<div class="links"><b>Buscar «${esc(term)}» en:</b>` + stores.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)} ›</a>`).join("") + "</div>" : "");
}
$("vi-file").onchange = (e) => e.target.files[0] && vision(e.target.files[0]);
$("vi-file2").onchange = (e) => e.target.files[0] && vision(e.target.files[0]);

// ---- Estado (para Freddy) ----
function renderStatus() {
  const s = { app: "Viernes", version: VERSION, configurada: hasKey() ? `sí (${config.keys.length} llave${config.keys.length > 1 ? "s" : ""})` : "no", preparada: config.setupAt ? new Date(config.setupAt).toLocaleString("es-CR") : "—",
    instalada: matchMedia("(display-mode: standalone)").matches ? "sí" : "no", mensajes: chat.length,
    memoria: (({ respuestas, reutilizadas, datos }) => `${datos} datos aprendidos · ${respuestas} respuestas guardadas · ${reutilizadas} reutilizadas`)(mem.estadisticas()),
    "copia en la PC": (({ activo, ultimo, pendiente, error }) => !activo ? "no conectada" : (ultimo ? "última " + new Date(ultimo).toLocaleString("es-CR") : "aún no") + (pendiente ? " · pendiente" : "") + (error ? " · " + error : ""))(mem.estadoSync()), navegador: navigator.userAgent.match(/(Chrome|Firefox|Safari)\/[\d.]+/)?.[0] || "?" };
  $("status-box").innerHTML = Object.entries(s).map(([k, v]) => `<b>${k}:</b> ${esc(v)}`).join("<br>");
  $("mem-export").onclick = async () => {
    const txt = JSON.stringify(mem.exportar(), null, 1), name = `memoria_viernes_${new Date().toISOString().slice(0, 10)}.json`;
    const f = new File([txt], name, { type: "application/json" });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) return await navigator.share({ files: [f], title: "Memoria de Viernes" }); } catch (e) { if (e && e.name === "AbortError") return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = name; a.click(); toast("Memoria descargada");
  };
  $("status-share").onclick = () => { const t = "Estado de Viernes\n" + Object.entries(s).map(([k, v]) => `${k}: ${v}`).join("\n"); navigator.share ? navigator.share({ text: t }) : navigator.clipboard.writeText(t).then(() => toast("Copiado")); };
}
$("wipe").onclick = () => { if (confirm("¿Borrar la conversación?")) { chat = []; save(CHAT, chat); renderChat(); toast("Listo"); } };

// ---- Inicio ----
await readSetup();
if (!history.state) history.replaceState({ v: "v-chat" }, "", location.pathname + location.search + (location.hash === "#estado" ? "#estado" : ""));
$("hello").textContent = `Tu asistente, ${config.name || "Wendy"} ✨`;
renderChat();
initEditor(); initPoster(); initCollage();
initPrecios(() => { document.querySelector('#biz-tabs [data-b="ideas"]').click(); $("id-go").click(); });
if (location.hash === "#estado") { renderStatus(); show("v-set"); }
addEventListener("hashchange", async () => { if (/(setup|sync)=/.test(location.hash)) { await readSetup();
if (!history.state) history.replaceState({ v: "v-chat" }, "", location.pathname + location.search + (location.hash === "#estado" ? "#estado" : "")); $("hello").textContent = `Tu asistente, ${config.name || "Wendy"} ✨`; renderChat(); show("v-chat"); } else if (location.hash === "#estado") { renderStatus(); show("v-set"); } });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js", { scope: "./" }).then((r) => r.update && r.update()).catch(() => {});
const net = () => { document.body.classList.toggle("offline", !navigator.onLine); };
addEventListener("online", () => { net(); toast("Volvió el internet ✅"); }); addEventListener("offline", () => { net(); toast("Sin internet: pósteres, fotos y precios siguen funcionando 💜", 4000); }); net();
window.__viernesReady = true;
