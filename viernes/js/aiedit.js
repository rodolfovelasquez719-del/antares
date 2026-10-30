// Viernes - edición con IA (reutilizado de Antares js/photo.js)
// ---------- Edición con IA (modelos de Gemini que devuelven imágenes) ----------
const API = "https://generativelanguage.googleapis.com/v1beta";
const PREFER = ["gemini-2.5-flash-image", "gemini-3.1-flash-image", "gemini-3.1-flash-image-preview", "gemini-3.1-flash-lite-image", "gemini-nano-banana-2.1", "gemini-3-pro-image", "gemini-3-pro-image-preview", "nano-banana-pro-preview"];
let modelCache = null; // {key, list}
let noTierUntil = 0;   // la key no tiene cuota de imágenes (se recuerda en la sesión)
export async function imageModels(apiKey, { signal } = {}) {
  if (modelCache && modelCache.key === apiKey) return modelCache.list;
  let names = [];
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey }, signal });
    if (r.ok) names = ((await r.json()).models || []).filter((m) => /image/i.test(m.name) && !/imagen/i.test(m.name) && (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
  } catch (e) { if (e && e.name === "AbortError") throw e; }
  if (!names.length) names = PREFER.slice(0, 3);
  const list = [...PREFER.filter((n) => names.includes(n)), ...names.filter((n) => !PREFER.includes(n))];
  modelCache = { key: apiKey, list };
  return list;
}
export function editPrompt(instruction) {
  return "Edite esta fotografía siguiendo la instrucción del usuario.\n" +
    "Reglas: cambie SOLO lo que se pide y deje todo lo demás exactamente igual. Si hay personas o bebés, conserve su identidad: " +
    "mismo rostro, rasgos, expresión, tono de piel, pelo, ropa y pose. Mantenga el encuadre, la proporción, la perspectiva, " +
    "la iluminación y la calidad de la foto original; que el resultado se vea natural y realista, sin texto ni marcas de agua añadidas. " +
    "Si la instrucción menciona texto escrito en la foto (un cartel, por ejemplo), consérvelo tal cual salvo que pida cambiarlo.\n" +
    "Instrucción: " + String(instruction || "").trim();
}
// Clasifica el error de la API en algo que se pueda explicar en español
export function classifyImageError(status, body = "") {
  const msg = String(body || "");
  if (status === 429 && /limit:\s*0\b/.test(msg)) return { kind: "no_tier", title: "Edición con IA no disponible con esta key",
    text: "Tu key de Gemini es del plan gratuito y Google no incluye edición de imágenes en ese plan (el límite para imágenes es 0). Para usarla hay que activar la facturación del proyecto en Google AI Studio. Mientras tanto puede editar la foto a mano con las herramientas del editor." };
  if (status === 429) { const m = msg.match(/retry in ([\d.]+)s|"retryDelay":\s*"(\d+)s"/); return { kind: "rate", retryAfter: m ? Math.ceil(Number(m[1] || m[2])) : 60, title: "Límite de uso alcanzado",
    text: "Google limitó por ahora la edición de imágenes con su key. Intenta de nuevo más tarde o use las herramientas del editor." }; }
  if (status === 403 || status === 401) return { kind: "permission", title: "La key no permite editar imágenes", text: "Google rechazó la edición de imágenes con esta key (permiso denegado). Revisa la key en Configuración o use las herramientas del editor." };
  if (status === 400 && /API key/i.test(msg)) return { kind: "key_invalid", title: "Key no válida", text: "La API key no es válida. Revísela en Configuración." };
  if (status === 404) return { kind: "model", title: "Modelo no disponible", text: "Ese modelo de imágenes no está disponible para su key." };
  if (status === 0) return { kind: "network", title: "Sin conexión", text: "No pude conectar con Gemini. Revisa su conexión e intente de nuevo." };
  return { kind: "server", title: "No se pudo editar la foto", text: "Gemini no pudo editar la foto en este momento. Intenta de nuevo o use las herramientas del editor." };
}
// Envía la foto + instrucción; devuelve {ok, blob, model, text} o {ok:false, kind, title, text, retryAfter}
export async function aiEdit(apiKey, blob, instruction, { signal, onStatus = () => {} } = {}) {
  if (!apiKey) return { ok: false, kind: "missing_key", title: "Falta la key", text: "Configura tu API key de Gemini para editar con IA." };
  if (Date.now() < noTierUntil) return { ok: false, ...classifyImageError(429, "limit: 0") };
  const data = await blobToBase64(blob);
  const models = await imageModels(apiKey, { signal });
  let last = null, tried = 0;
  for (const model of models) {
    if (tried >= 4) break;
    tried++;
    onStatus(`Editando con ${model}…`);
    let resp, text = "";
    try {
      resp = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ inline_data: { mime_type: blob.type || "image/jpeg", data } }, { text: editPrompt(instruction) }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      });
      text = await resp.text();
    } catch (e) {
      if (e && e.name === "AbortError") return { ok: false, kind: "stopped", stopped: true };
      last = classifyImageError(0); continue;
    }
    if (!resp.ok) {
      last = classifyImageError(resp.status, text);
      if (last.kind === "key_invalid") break;
      continue; // otro modelo puede tener cuota
    }
    let j; try { j = JSON.parse(text); } catch { last = classifyImageError(500); continue; }
    const cand = (j.candidates || [])[0] || {};
    const parts = (cand.content && cand.content.parts) || [];
    const imgPart = parts.find((p) => p.inlineData || p.inline_data);
    const note = parts.filter((p) => p.text).map((p) => p.text).join(" ").trim();
    if (!imgPart) {
      last = cand.finishReason && /SAFETY|PROHIBITED|IMAGE_SAFETY/i.test(cand.finishReason)
        ? { kind: "safety", title: "Edición no permitida", text: "Gemini no quiso hacer esa edición por sus reglas de seguridad. Prueba con otra instrucción." }
        : { kind: "no_image", title: "No recibí una imagen", text: note ? `Gemini respondió sin imagen: ${note.slice(0, 200)}` : "Gemini respondió sin imagen. Intenta con una instrucción más concreta." };
      continue;
    }
    const d = imgPart.inlineData || imgPart.inline_data;
    const out = base64ToBlob(d.data, d.mimeType || d.mime_type || "image/png");
    return { ok: true, blob: out, model, text: note };
  }
  if (last && last.kind === "no_tier") noTierUntil = Date.now() + 30 * 60 * 1000;
  return { ok: false, ...(last || classifyImageError(500)) };
}
export function resetPhotoSession() { modelCache = null; noTierUntil = 0; }
function blobToBase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
function base64ToBlob(b64, type) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
