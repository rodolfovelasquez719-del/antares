// Viernes - cliente mínimo de Gemini (misma API y modelos gratuitos que Antares). La key va solo en x-goog-api-key.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash"];
export const PERSONA = "Eres Viernes, la asistente personal de Wendy, en Costa Rica. Eres cálida, alegre, elegante y muy práctica. " +
  "Hablas español de Costa Rica, tratas a Wendy de 'tú' con cariño (puedes decir 'mae' o 'pura vida' muy de vez en cuando, sin exagerar). " +
  "Wendy hace pulseras y artesanías y vende por Instagram, Facebook y WhatsApp: ayúdala con ideas, textos de venta y fotos. " +
  "No saludes ni digas 'Pura vida' al inicio de cada respuesta: ve directo al punto (saluda solo si Wendy saluda primero). " +
  "Respuestas breves y claras, con listas cortas cuando ayuden. Usa colones (₡) para precios en Costa Rica.";
let searchOffUntil = 0; // si Google limita la búsqueda, se responde sin ella un rato (no se gastan llamadas)
export async function ask(apiKey, history, { search = false, system = PERSONA, image = null, json = false } = {}) {
  const contents = history.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
  if (image) contents[contents.length - 1].parts.unshift({ inline_data: { mime_type: image.type, data: image.data } });
  let last = "";
  for (const model of MODELS) {
    for (const useSearch of search && Date.now() > searchOffUntil ? [true, false] : [false]) {
      const body = { system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 2048, temperature: 0.7, ...(json ? { responseMimeType: "application/json" } : {}) } };
      if (useSearch) body.tools = [{ google_search: {} }];
      let r, t;
      try { r = await fetch(`${BASE}/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body) }); t = await r.text(); }
      catch { last = "Sin conexión. Revisa tu internet."; continue; }
      if (r.status === 400 && /API key/i.test(t)) return { ok: false, text: "La key de Gemini no es válida. Revísala en Ajustes." };
      if (!r.ok && useSearch && r.status === 429) { searchOffUntil = Date.now() + 15 * 60 * 1000; continue; }
      if (!r.ok) { last = r.status === 429 ? "Se agotó la cuota gratuita por ahora. Intenta en un rato." : `Gemini no respondió (${r.status}).`; continue; }
      const j = JSON.parse(t), c = (j.candidates || [])[0] || {};
      const text = ((c.content || {}).parts || []).filter((p) => p.text).map((p) => p.text).join("").trim();
      if (!text) { last = "Gemini respondió vacío."; continue; }
      const g = c.groundingMetadata || {};
      const sources = (g.groundingChunks || []).map((x) => x.web).filter(Boolean).slice(0, 5);
      return { ok: true, text, sources, model, searched: useSearch };
    }
  }
  return { ok: false, text: last || "No pude responder ahora." };
}
export async function testKey(apiKey) {
  try { const r = await fetch(`${BASE}?pageSize=5`, { headers: { "x-goog-api-key": apiKey } }); return r.ok; } catch { return false; }
}
