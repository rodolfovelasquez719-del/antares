// v1.25: «cerebro doble» y «Mi compu». La PC ANTARES (Ollama qwen2.5:3b detrás del portero con clave, por Tailscale Funnel)
// contesta SOLO charla y redacción; Gemini contesta manejo, seguridad, salud, datos, actualidad, fotos, y todo cuando la PC
// no está o no hay clave (reglas en ruteo.mjs). Reversión: PC_ENABLED = false (todo vuelve a ser como en v1.24).
import { elegirCerebro, respuestaDelicada, ustedear } from "./ruteo.mjs";
export const PC_ENABLED = true;
export const PC_URL_DEF = "https://antares.tail1d77f2.ts.net";
export const MODELO_PC = "qwen2.5:3b";
const LEGADO = "antares.cerebroDoble.v1"; // dirección/clave guardadas por las muestras (mismo sitio)
let leerCfg = () => null;
export function initPC(getConfig) { leerCfg = getConfig; }

function legado() { try { return JSON.parse(localStorage.getItem(LEGADO) || "{}"); } catch { return {}; } }
export function credenciales() {
  const c = leerCfg() || {}, l = legado();
  const tok = (c.pcToken || l.tok || "").trim();
  const url = (c.pcUrl || l.url || PC_URL_DEF).trim().replace(/\/+$/, "");
  return { url, tok };
}
export const tieneClave = () => PC_ENABLED && !!credenciales().tok;
export const modoPC = () => { const m = (leerCfg() || {}).cerebroPC; return m === "gem" || m === "pc" ? m : "auto"; };
const cab = (tok) => ({ "X-Antares-Token": tok });

let estado = { on: false, t: 0, code: "sin clave" };
const oyentes = new Set();
export const onEstadoPC = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
export const estadoPC = () => estado;
export async function revisarPC(force = false) {
  const { url, tok } = credenciales();
  if (!PC_ENABLED || !tok) { estado = { on: false, t: Date.now(), code: "sin clave" }; oyentes.forEach((f) => f(estado)); return estado; }
  if (!force && Date.now() - estado.t < 60000) return estado;
  let nuevo;
  try {
    const r = await fetch(url + "/api/version", { headers: cab(tok), signal: AbortSignal.timeout(6000) });
    nuevo = { on: r.ok, t: Date.now(), code: r.ok ? "en línea" : r.status === 401 ? "clave incorrecta" : "error " + r.status };
  } catch { nuevo = { on: false, t: Date.now(), code: "apagada o sin red" }; }
  estado = nuevo; oyentes.forEach((f) => f(estado));
  return estado;
}

// ¿quién contesta este mensaje? {cerebro:"pc"|"gem", motivo}
export function decidir(texto, { adjunto = false } = {}) {
  if (!tieneClave()) return { cerebro: "gem", motivo: "" };
  return elegirCerebro(texto, { pcEnLinea: estado.on, adjunto, modo: modoPC() });
}

const sistema = (nombre) => `Usted es Antares, el asistente personal de don ${nombre}, en Costa Rica. Responda siempre en español de Costa Rica, ` +
  "tratándolo de usted (nunca de tú ni de vos), con calidez y de forma breve y clara (2 a 5 frases salvo que pida más). " +
  `Llámelo «don ${nombre}» de vez en cuando, con naturalidad. Use colones, kilómetros y la hora de Costa Rica (UTC-6). ` +
  "Texto plano, sin markdown. Si no sabe algo o necesita datos actuales (clima, noticias, precios), dígalo con honestidad. " +
  "REGLAS FIJAS: trate SIEMPRE al usuario de usted; nunca use tú ni vos (diga «usted puede», nunca «puedes» ni «podés»). " +
  "Nunca dé consejos de manejo, seguridad, salud, medicina o electricidad, ni datos como distancias, cifras, fechas, precios o definiciones: " +
  `en esos casos responda solo «Eso prefiero consultarlo con Gemini, don ${nombre}» y nada más. Usted es solo para conversar y para redactar textos.`;

// Respuesta en vivo desde la PC. Devuelve {ok, text, ms, model, delicada} (delicada = la red de seguridad pide Gemini).
export async function preguntarPC(texto, historial = [], { signal, onChunk, nombre = "Freddy" } = {}) {
  const { url, tok } = credenciales();
  const t0 = performance.now();
  const msgs = [{ role: "system", content: sistema(nombre) },
    ...historial.filter((m) => m && m.content && (m.role === "user" || m.role === "assistant")).slice(-8).map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
    { role: "user", content: texto }];
  const r = await fetch(url + "/api/chat", { method: "POST", signal, headers: { ...cab(tok), "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO_PC, stream: true, keep_alive: "30m", messages: msgs, options: { temperature: 0.6, num_predict: 400 } }) });
  if (!r.ok) { if (r.status === 401) estado = { ...estado, on: false, code: "clave incorrecta" }; throw Error("PC " + r.status); }
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", out = "";
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue;
      const j = JSON.parse(l);
      if (j.error) throw Error(j.error);
      if (j.message && j.message.content) { out += j.message.content; onChunk && onChunk(out); }
    }
  }
  const delicada = respuestaDelicada(out) || /consultarlo con gemini/i.test(out);
  return { ok: true, text: delicada ? out : ustedear(out.trim(), texto), ms: performance.now() - t0, model: MODELO_PC, delicada };
}

// v1.25: salud de la compu (para avisar en la app si hay alertas)
export async function saludPC() {
  const { url, tok } = credenciales(); if (!tok) return null;
  const r = await fetch(url + "/salud", { headers: cab(tok), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw Error(r.status);
  return r.json();
}
