// Antares · Cerebro doble (muestra). PC (Ollama qwen2.5:3b detrás de un portero con clave y un túnel) + Gemini.
// La dirección, la clave del cerebro y la key de Gemini se guardan SOLO en este dispositivo (localStorage).
import { GeminiClient, needsSearch } from "../js/gemini.js";
const $ = (s) => document.querySelector(s);
const K = "antares.cerebroDoble.v1";
const cfg = (() => { try { return JSON.parse(localStorage.getItem(K) || "{}"); } catch { return {}; } })();
const guardarCfg = () => localStorage.setItem(K, JSON.stringify(cfg));
const MODELO_PC = "qwen2.5:3b";
const SISTEMA = "Usted es Antares, el asistente personal de don Freddy, en Costa Rica. Responda siempre en español de Costa Rica, " +
  "tratándolo de usted (nunca de tú ni de vos), con calidez y de forma breve y clara (2 a 5 frases salvo que pida más). " +
  "Llámelo «don Freddy» de vez en cuando, con naturalidad. Use colones, kilómetros y la hora de Costa Rica (UTC-6). " +
  "Texto plano, sin markdown. Si no sabe algo o necesita datos actuales (clima, noticias, precios), dígalo con honestidad.";
let estado = "nada", historial = [], modo = "auto", adjunto = null;

function keyGemini() {
  if (cfg.gk) return cfg.gk;
  try { const c = JSON.parse(localStorage.getItem("antares.config.v1") || "{}"); return c.geminiApiKey || ""; } catch { return ""; }
}
const URL_PC = "https://antares.tail1d77f2.ts.net"; // dirección fija (Tailscale Funnel)
const base = () => (cfg.url || URL_PC).trim().replace(/\/+$/, "");
const cab = () => ({ "Content-Type": "application/json", "X-Antares-Token": cfg.tok || "" });

function pintarEstado(e, t) { estado = e; const el = $("#estado"); el.className = "estado " + ({ on: "on", off: "off", tok: "tok" }[e] || ""); $("#estado-t").textContent = t; }
async function revisarPC() {
  if (!base()) { pintarEstado("nada", "SIN CONFIGURAR"); return; }
  try {
    const r = await fetch(base() + "/api/version", { headers: cab(), signal: AbortSignal.timeout(8000) });
    if (r.status === 401) { pintarEstado("tok", "CLAVE INCORRECTA"); return; }
    if (!r.ok) throw Error(r.status);
    pintarEstado("on", "COMPU EN LÍNEA");
  } catch { pintarEstado("off", "COMPU APAGADA"); }
}
// precarga el modelo en la PC para que la primera respuesta no tarde (queda cargado 30 min)
async function calentar() { if (estado !== "on") return; try { await fetch(base() + "/api/generate", { method: "POST", headers: cab(), body: JSON.stringify({ model: MODELO_PC, keep_alive: "30m" }) }); } catch { /* */ } }

function burbuja(cls, txt = "") { const d = document.createElement("div"); d.className = "msg " + cls; d.textContent = txt; $("#chat").append(d); d.scrollIntoView({ block: "end" }); return d; }
function badge(div, cual, seg, extra = "") {
  const b = document.createElement("div"); b.className = "badge " + (cual === "pc" ? "pc" : "gem");
  b.innerHTML = (cual === "pc" ? "🖥 CEREBRO PC · QWEN 2.5 3B" : "✦ GEMINI") + ` <i>${seg.toFixed(1).replace(".", ",")} s${extra}</i>`;
  div.append(b);
}
// ¿quién contesta?
function elegir(texto) {
  if (modo === "pc") return estado === "on" ? "pc" : "gem";
  if (modo === "gem") return "gem";
  if (adjunto) return "gem";                 // fotos y videos: Gemini
  if (estado !== "on") return "gem";         // compu apagada o sin clave
  if (texto.length > 400) return "gem";      // textos largos
  if (needsSearch(texto)) return "gem";      // actualidad: Gemini busca en Google
  return "pc";
}
async function pcResponder(texto, div) {
  const msgs = [{ role: "system", content: SISTEMA }, ...historial.slice(-8), { role: "user", content: texto }];
  const r = await fetch(base() + "/api/chat", { method: "POST", headers: cab(), body: JSON.stringify({ model: MODELO_PC, stream: true, keep_alive: "30m", messages: msgs, options: { temperature: 0.6, num_predict: 400 } }) });
  if (!r.ok) throw Error("PC " + r.status);
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", out = "", primera = 0;
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue;
      const j = JSON.parse(l);
      if (j.message && j.message.content) { if (!primera) primera = performance.now(); out += j.message.content; div.firstChild.textContent = out; div.scrollIntoView({ block: "end" }); }
      if (j.error) throw Error(j.error);
    }
  }
  if (!out.trim()) throw Error("respuesta vacía");
  return { texto: out.trim(), primera };
}
async function gemResponder(texto, div) {
  const k = keyGemini(); if (!k) throw Error("Este dispositivo no tiene key de Gemini (péguela en Conexión).");
  const g = new GeminiClient({ apiKey: k, userName: "don Freddy" });
  let primera = 0;
  const media = adjunto ? [{ mime: adjunto.mime, data: adjunto.data }] : null;
  const r = await g.ask(texto || "Describa lo que ve.", historial.slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })), [], {
    search: needsSearch(texto) && !media, media,
    onChunk: (t) => { if (!primera) primera = performance.now(); div.firstChild.textContent = t; div.scrollIntoView({ block: "end" }); },
  });
  if (!r.ok) throw Error([r.title, r.text].filter(Boolean).join(": ") || "Gemini no respondió");
  div.firstChild.textContent = r.text;
  return { texto: r.text, primera };
}
async function enviar(e) {
  e && e.preventDefault();
  const texto = $("#q").value.trim(); if (!texto && !adjunto) return;
  $("#q").value = ""; $("#send").disabled = true;
  burbuja("yo", texto + (adjunto ? `\n📎 ${adjunto.name}` : ""));
  const div = burbuja("ant cursor"); div.append(document.createTextNode("")); div.firstChild.textContent = "";
  let cual = elegir(texto), extra = "";
  const t0 = performance.now(); let r;
  try {
    r = cual === "pc" ? await pcResponder(texto, div) : await gemResponder(texto, div);
  } catch (err) {
    if (cual === "pc") { // la compu falló a medio camino: pasa a Gemini
      extra = " · la PC no respondió"; cual = "gem"; revisarPC();
      try { r = await gemResponder(texto, div); } catch (e2) { div.firstChild.textContent = "No pude responder: " + e2.message; }
    } else div.firstChild.textContent = "No pude responder: " + err.message;
  }
  div.classList.remove("cursor");
  if (r) {
    const total = (performance.now() - t0) / 1000, pri = r.primera ? (r.primera - t0) / 1000 : total;
    badge(div, cual, total, ` · 1.ª palabra ${pri.toFixed(1).replace(".", ",")} s${extra}`);
    historial.push({ role: "user", content: texto }, { role: "assistant", content: r.texto });
  }
  adjunto = null; $("#adj").textContent = ""; $("#file").value = "";
  $("#send").disabled = false; $("#q").focus();
}
$("#f").addEventListener("submit", enviar);
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && innerWidth > 700) enviar(e); });
$("#file").addEventListener("change", async () => {
  const f = $("#file").files[0]; if (!f) return;
  if (f.size > 15 * 1024 * 1024) { $("#adj").textContent = "Archivo muy grande para la muestra (máx. 15 MB)."; return; }
  const data = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(f); });
  adjunto = { mime: f.type, data, name: f.name }; $("#adj").textContent = "📎 " + f.name + " (lo verá Gemini)";
});
document.querySelectorAll(".chip[data-modo]").forEach((b) => b.addEventListener("click", () => { modo = b.dataset.modo; document.querySelectorAll(".chip[data-modo]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
$("#url").value = cfg.url || URL_PC; $("#tok").value = cfg.tok || ""; $("#gk").value = cfg.gk || "";
$("#guardar").addEventListener("click", async () => { cfg.url = $("#url").value.trim() === URL_PC ? "" : $("#url").value.trim(); cfg.tok = $("#tok").value.trim(); cfg.gk = $("#gk").value.trim(); guardarCfg(); await revisarPC(); calentar(); if (estado === "on") $("#conf").open = false; });
$("#olvidar").addEventListener("click", () => { localStorage.removeItem(K); for (const k of ["url", "tok", "gk"]) { cfg[k] = ""; $("#" + k).value = k === "url" ? URL_PC : ""; } revisarPC(); });
if (!cfg.tok) $("#conf").open = true;
revisarPC().then(calentar); setInterval(revisarPC, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) revisarPC(); });
