// Viernes - cliente mínimo de Gemini (misma API y modelos gratuitos que Antares). La key va solo en x-goog-api-key.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash"];
export const PERSONA = "Eres Viernes, la asistente personal de Wendy, en Costa Rica. Eres cálida, alegre, elegante y muy práctica. " +
  "Hablas español de Costa Rica, tratas a Wendy de 'tú' con cariño (puedes decir 'mae' o 'pura vida' muy de vez en cuando, sin exagerar). " +
  "Wendy hace pulseras y artesanías y vende por Instagram, Facebook y WhatsApp: ayúdala con ideas, textos de venta y fotos. " +
  "No saludes ni digas 'Pura vida' al inicio de cada respuesta: ve directo al punto (saluda solo si Wendy saluda primero). " +
  "Respuestas breves y claras, con listas cortas cuando ayuden. Usa colones (₡) para precios en Costa Rica.";
// v0.5: varias keys con cambio silencioso. Pausas por key (general y solo búsqueda), guardadas para no reintentar en vano.
const KS = "viernes.keystate.v1";
const ks = (() => { try { return JSON.parse(localStorage.getItem(KS)) || {}; } catch { return {}; } })();
const kid = (k) => { let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) | 0; return "k" + (h >>> 0).toString(36); }; // nunca se guarda la key aquí
const st = (k) => (ks[kid(k)] ||= { gen: 0, srch: 0 });
const saveKs = () => { try { localStorage.setItem(KS, JSON.stringify(ks)); } catch { /* */ } };
function cool(k, kind, ms) { const s = st(k); s[kind] = Date.now() + ms; saveKs(); }
const okNow = (k, kind) => Date.now() > st(k)[kind];
function pauseFor(status, t) {
  const m = String(t).match(/"retryDelay":\s*"(\d+)s"/); if (status === 429 && m) return Math.max(30, +m[1]) * 1000;
  if (status === 429) return /per ?day|PerDay|limit:\s*0/i.test(t) ? 60 * 60 * 1000 : 2 * 60 * 1000;
  return 6 * 60 * 60 * 1000; // key mala o sin permiso
}
let preferred = 0;
export async function ask(keys, history, { search = false, system = PERSONA, image = null, json = false } = {}) {
  keys = (Array.isArray(keys) ? keys : [keys]).map((k) => String(k || "").replace(/\s+/g, "")).filter(Boolean);
  if (!keys.length) return { ok: false, text: "Viernes aún no está preparada." };
  const contents = history.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
  if (image) contents[contents.length - 1].parts.unshift({ inline_data: { mime_type: image.type, data: image.data } });
  const order = (kind) => { const o = keys.map((k, i) => i).sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : a - b)); const ready = o.filter((i) => okNow(keys[i], kind)); return ready.length ? ready : (kind === "gen" ? o : []); };
  let last = "";
  for (const model of MODELS) {
    for (const useSearch of search ? [true, false] : [false]) {
      const body = JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 2048, temperature: 0.7, ...(json ? { responseMimeType: "application/json" } : {}) }, ...(useSearch ? { tools: [{ google_search: {} }] } : {}) });
      for (const i of order(useSearch ? "srch" : "gen")) {
        const key = keys[i]; if (!okNow(key, "gen") && order("gen").some((x) => x !== i && okNow(keys[x], "gen"))) continue;
        let r, t;
        try { r = await fetch(`${BASE}/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body }); t = await r.text(); }
        catch { last = "Sin conexión. Revisa tu internet."; break; }
        if (r.ok) {
          let j; try { j = JSON.parse(t); } catch { last = "Respuesta rara de Gemini."; break; }
          const c = (j.candidates || [])[0] || {};
          const text = ((c.content || {}).parts || []).filter((p) => p.text).map((p) => p.text).join("").trim();
          if (!text) { last = "No me salió una respuesta. ¿Lo intentamos otra vez?"; break; }
          preferred = i;
          const sources = ((c.groundingMetadata || {}).groundingChunks || []).map((x) => x.web).filter(Boolean).slice(0, 5);
          return { ok: true, text, sources, model, searched: useSearch };
        }
        const badKey = r.status === 401 || r.status === 403 || (r.status === 400 && /API.?key/i.test(t));
        if (useSearch && r.status === 429) { cool(key, "srch", 30 * 60 * 1000); continue; } // la otra key quizá sí puede buscar
        if (badKey || r.status === 429) { cool(key, "gen", pauseFor(r.status, t)); last = "Estoy un poquito ocupada ahora mismo. Intenta en un ratito 💜"; continue; }
        last = "No pude responder en este momento. Intenta de nuevo 💜"; break; // 5xx/404: probar otro modelo
      }
    }
  }
  return { ok: false, text: last || "No pude responder ahora. Intenta en un ratito 💜" };
}
export async function testKey(apiKey) {
  try { const r = await fetch(`${BASE}?pageSize=5`, { headers: { "x-goog-api-key": apiKey } }); return r.ok; } catch { return false; }
}
