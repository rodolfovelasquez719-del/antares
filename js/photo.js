// Antares Web - Editor de fotos (v1.11.0): herramientas locales en canvas y edición con IA de Gemini (si la key lo permite).
// Todo ocurre en el navegador; la foto solo sale hacia Gemini al pedir una edición con IA.

export const MAX_EDGE = 2400;        // lado máximo para editar (las fotos de iPhone se reducen)
const PREVIEW_EDGE = 1000;           // vista previa rápida de los ajustes
const UNDO_MAX = 10;

// ---------- Carga ----------
export async function loadImage(src) {
  let blob = src;
  if (typeof src === "string") blob = await (await fetch(src)).blob();
  let bmp;
  try { bmp = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch {
    bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error("No pude abrir la imagen")); img.src = URL.createObjectURL(blob); });
  }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
  const k = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const c = canvas(Math.round(w0 * k), Math.round(h0 * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c;
}
export function canvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
const clone = (src) => { const c = canvas(src.width, src.height); c.getContext("2d").drawImage(src, 0, 0); return c; };

// ---------- Editor (estado) ----------
export function createEditor(base) {
  return { base, undo: [], adj: { brightness: 0, contrast: 0, saturation: 0, warmth: 0 }, original: clone(base) };
}
export function pushUndo(ed) { ed.undo.push(clone(ed.base)); if (ed.undo.length > UNDO_MAX) ed.undo.shift(); }
export function undo(ed) { if (!ed.undo.length) return false; ed.base = ed.undo.pop(); return true; }
export function reset(ed) { pushUndo(ed); ed.base = clone(ed.original); ed.adj = { brightness: 0, contrast: 0, saturation: 0, warmth: 0 }; }

// Girar 90° (dir = 1 derecha, -1 izquierda)
export function rotate90(ed, dir = 1) {
  pushUndo(ed);
  const s = ed.base, c = canvas(s.height, s.width), x = c.getContext("2d");
  x.translate(c.width / 2, c.height / 2); x.rotate(dir * Math.PI / 2); x.drawImage(s, -s.width / 2, -s.height / 2);
  ed.base = c;
}
// Enderezar: gira unos grados y recorta lo justo para no dejar esquinas vacías
export function straighten(ed, deg) {
  if (!deg) return;
  pushUndo(ed);
  ed.base = straightenCanvas(ed.base, deg);
}
export function straightenCanvas(s, deg) {
  const a = Math.abs(deg) * Math.PI / 180, w = s.width, h = s.height;
  // mayor rectángulo con la misma proporción que cabe dentro de la imagen girada
  const k = 1 / (Math.cos(a) + Math.max(w / h, h / w) * Math.sin(a));
  const c = canvas(Math.round(w * k), Math.round(h * k)), x = c.getContext("2d");
  x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180); x.drawImage(s, -w / 2, -h / 2);
  return c;
}
// Recortar (rect en fracciones 0..1 de la imagen actual)
export function crop(ed, r) {
  const s = ed.base;
  const x0 = Math.round(clamp(r.x, 0, 1) * s.width), y0 = Math.round(clamp(r.y, 0, 1) * s.height);
  const w = Math.round(clamp(r.w, 0.02, 1) * s.width), h = Math.round(clamp(r.h, 0.02, 1) * s.height);
  if (w < 8 || h < 8) return false;
  pushUndo(ed);
  const c = canvas(Math.min(w, s.width - x0), Math.min(h, s.height - y0));
  c.getContext("2d").drawImage(s, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  ed.base = c;
  return true;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Ajustes de color (píxel por píxel; funciona igual en Safari y Chrome) ----------
export function adjustPixels(data, { brightness = 0, contrast = 0, saturation = 0, warmth = 0 }) {
  if (!brightness && !contrast && !saturation && !warmth) return data;
  const b = brightness * 1.28;                                  // -128..128
  const cf = (259 * (contrast * 1.28 + 255)) / (255 * (259 - contrast * 1.28));
  const sf = 1 + saturation / 100;                              // 0..2
  const wr = warmth * 0.35, wb = -warmth * 0.35;
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], bl = d[i + 2];
    r += b; g += b; bl += b;
    r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; bl = cf * (bl - 128) + 128;
    const l = 0.299 * r + 0.587 * g + 0.114 * bl;
    r = l + (r - l) * sf; g = l + (g - l) * sf; bl = l + (bl - l) * sf;
    r += wr; bl += wb;
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
  }
  return data;
}
// Imagen final (tamaño completo o vista previa) con los ajustes aplicados
export function render(ed, { preview = false } = {}) {
  const s = ed.base;
  const k = preview ? Math.min(1, PREVIEW_EDGE / Math.max(s.width, s.height)) : 1;
  const c = canvas(Math.round(s.width * k), Math.round(s.height * k)), x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(s, 0, 0, c.width, c.height);
  const a = ed.adj;
  if (a.brightness || a.contrast || a.saturation || a.warmth) {
    const img = x.getImageData(0, 0, c.width, c.height);
    x.putImageData(adjustPixels(img, a), 0, 0);
  }
  return c;
}
// Los ajustes se "hornean" en la base (antes de pintar o editar con IA)
export function bakeAdjustments(ed) {
  const a = ed.adj;
  if (!a.brightness && !a.contrast && !a.saturation && !a.warmth) return;
  pushUndo(ed);
  ed.base = render(ed);
  ed.adj = { brightness: 0, contrast: 0, saturation: 0, warmth: 0 };
}

// ---------- Pinceles: pintar con un color o suavizar (arrugas, manchas) ----------
// pts en coordenadas de la imagen base; size = diámetro en píxeles de la base
export function brushStroke(ed, pts, { mode = "paint", color = "#ffffff", size = 40, blurCopy = null } = {}) {
  const x = ed.base.getContext("2d");
  x.save();
  x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = size;
  x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
  if (pts.length === 1) x.lineTo(pts[0].x + 0.1, pts[0].y);
  if (mode === "paint") { x.strokeStyle = color; x.globalAlpha = 0.92; x.stroke(); }
  else {
    // suavizar: copia desenfocada recortada a la forma del trazo
    const blurred = blurCopy || blurCanvas(ed.base, Math.max(4, Math.round(size / 5)));
    const path = new Path2D();
    pts.forEach((p) => path.arc(p.x, p.y, size / 2, 0, Math.PI * 2));
    x.clip(path);
    x.drawImage(blurred, 0, 0);
  }
  x.restore();
}
// Desenfoque de caja (3 pasadas ≈ gaussiano), sin depender de ctx.filter
export function blurCanvas(src, radius = 6) {
  const k = Math.min(1, 900 / Math.max(src.width, src.height)); // se desenfoca en chico y se escala: rápido y suave
  const small = canvas(Math.round(src.width * k), Math.round(src.height * k));
  const sx = small.getContext("2d", { willReadFrequently: true });
  sx.drawImage(src, 0, 0, small.width, small.height);
  const r = Math.max(1, Math.round(radius * k));
  const img = sx.getImageData(0, 0, small.width, small.height);
  for (let pass = 0; pass < 3; pass++) boxBlur(img, r);
  sx.putImageData(img, 0, 0);
  const out = canvas(src.width, src.height), ox = out.getContext("2d");
  ox.imageSmoothingQuality = "high"; ox.drawImage(small, 0, 0, out.width, out.height);
  return out;
}
function boxBlur(img, r) {
  const { width: w, height: h, data: d } = img, tmp = new Float32Array(d.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += d[(y * w + clamp(i, 0, w - 1)) * 4 + c];
    for (let x = 0; x < w; x++) {
      tmp[(y * w + x) * 4 + c] = acc / n;
      acc += d[(y * w + clamp(x + r + 1, 0, w - 1)) * 4 + c] - d[(y * w + clamp(x - r, 0, w - 1)) * 4 + c];
    }
  }
  for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += tmp[(clamp(i, 0, h - 1) * w + x) * 4 + c];
    for (let y = 0; y < h; y++) {
      d[(y * w + x) * 4 + c] = acc / n;
      acc += tmp[(clamp(y + r + 1, 0, h - 1) * w + x) * 4 + c] - tmp[(clamp(y - r, 0, h - 1) * w + x) * 4 + c];
    }
  }
}
export function pickColor(ed, x, y) {
  const d = ed.base.getContext("2d", { willReadFrequently: true }).getImageData(clamp(Math.round(x), 0, ed.base.width - 1), clamp(Math.round(y), 0, ed.base.height - 1), 1, 1).data;
  return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ---------- Exportar ----------
export const toBlob = (c, type = "image/jpeg", q = 0.92) => new Promise((res) => c.toBlob((b) => res(b), type, q));
export async function shareOrDownload(blob, name, { share = true } = {}) {
  const file = new File([blob], name, { type: blob.type });
  if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return "downloaded";
}
export const canShareFiles = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(["x"], { type: "image/jpeg" })], "x.jpg", { type: "image/jpeg" })] })); } catch { return false; } };
export async function thumbDataUrl(c, edge = 320) {
  const k = Math.min(1, edge / Math.max(c.width, c.height));
  const t = canvas(Math.round(c.width * k), Math.round(c.height * k));
  t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", 0.72);
}

// ---------- Intención de edición desde el chat ----------
const EDIT_RE = /\b(quit[ae]\w*|quitarle|borr[ae]\w*|elimin[ae]\w*|remuev[ae]|cambi[ae]\w*\s+(el|la|los|las)?\s*(fondo|color|pared|cielo|cortina)|fondo\s+(blanco|negro|liso|azul|de)|pon(ga|er|gale|erle)\s+(una?|el|la)?\s*(pared|fondo|cielo|color)|pared\s+blanca|mejor[ae]\w*\s+(la|esta)?\s*(foto|imagen|calidad|luz)|retoc\w*|arrug\w*|alis[ae]\w*|planch[ae]\w*|edit[ae]\w*|aclar[ae]\w*|ilumin[ae]\w*|enderez\w*|recort[ae]\w*|desenfoc\w*|limpi[ae]\w*\s+(el|la)?\s*(fondo|foto)|agreg[ae]\w*\s+.{0,20}(a|en)\s+la\s+foto|restaur[ae]\w*|colore[ae]\w*|blanco\s+y\s+negro|sin\s+(la|el|las|los)\s+\w+)\b/i;
const ASK_RE = /^\s*(qu[eé]|cu[aá]nt|cu[aá]l|d[oó]nde|qui[eé]n|por\s*qu[eé]|describ|lea|l[eé]ame|traduzc|expl[ií]c)/i;
export const looksLikePhotoEdit = (t) => { const s = String(t || ""); return !!s.trim() && EDIT_RE.test(s) && !ASK_RE.test(s); };

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
    text: "Su key de Gemini es del plan gratuito y Google no incluye edición de imágenes en ese plan (el límite para imágenes es 0). Para usarla hay que activar la facturación del proyecto en Google AI Studio. Mientras tanto puede editar la foto a mano con las herramientas del editor." };
  if (status === 429) { const m = msg.match(/retry in ([\d.]+)s|"retryDelay":\s*"(\d+)s"/); return { kind: "rate", retryAfter: m ? Math.ceil(Number(m[1] || m[2])) : 60, title: "Límite de uso alcanzado",
    text: "Google limitó por ahora la edición de imágenes con su key. Intente de nuevo más tarde o use las herramientas del editor." }; }
  if (status === 403 || status === 401) return { kind: "permission", title: "La key no permite editar imágenes", text: "Google rechazó la edición de imágenes con esta key (permiso denegado). Revise la key en Configuración o use las herramientas del editor." };
  if (status === 400 && /API key/i.test(msg)) return { kind: "key_invalid", title: "Key no válida", text: "La API key no es válida. Revísela en Configuración." };
  if (status === 404) return { kind: "model", title: "Modelo no disponible", text: "Ese modelo de imágenes no está disponible para su key." };
  if (status === 0) return { kind: "network", title: "Sin conexión", text: "No pude conectar con Gemini. Revise su conexión e intente de nuevo." };
  return { kind: "server", title: "No se pudo editar la foto", text: "Gemini no pudo editar la foto en este momento. Intente de nuevo o use las herramientas del editor." };
}
// Envía la foto + instrucción; devuelve {ok, blob, model, text} o {ok:false, kind, title, text, retryAfter}
export async function aiEdit(apiKey, blob, instruction, { signal, onStatus = () => {} } = {}) {
  if (!apiKey) return { ok: false, kind: "missing_key", title: "Falta la key", text: "Configure su API key de Gemini para editar con IA." };
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
        ? { kind: "safety", title: "Edición no permitida", text: "Gemini no quiso hacer esa edición por sus reglas de seguridad. Pruebe con otra instrucción." }
        : { kind: "no_image", title: "No recibí una imagen", text: note ? `Gemini respondió sin imagen: ${note.slice(0, 200)}` : "Gemini respondió sin imagen. Intente con una instrucción más concreta." };
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
