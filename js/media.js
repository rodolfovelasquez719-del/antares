// Antares Web - Fotos y videos: compresión, miniaturas y subida a la Files API de Gemini.
const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_FILES_URL = "https://generativelanguage.googleapis.com/v1beta";

export const MAX_ATTACHMENTS = 4;
export const INLINE_LIMIT = 18 * 1024 * 1024;   // tamaño máximo total (base64) dentro de la petición
export const FILES_API_FROM = 4 * 1024 * 1024;  // cada archivo de más de 4 MB va por la Files API
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // límite práctico para subir desde el celular
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_SIDE = 1600, JPEG_QUALITY = 0.85, THUMB_SIDE = 160;

export const base64Size = (bytes) => Math.ceil(bytes / 3) * 4;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error || new Error("No se pudo leer el archivo"));
    r.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

function drawScaled(source, w, h, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); // PNG transparentes -> fondo blanco
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

async function loadImage(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fallback */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

// HEIC/HEIF (fotos del iPhone): Chrome y Firefox no las abren, pero Gemini sí las entiende, así que se envían tal cual.
// (Un JPG/PNG/WEBP que el navegador no puede abrir está dañado: ese no se envía.)
const RAW_IMAGE_MIME = { heic: "image/heic", heif: "image/heif" };
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;
export const MAX_RAW_IMAGE_BYTES = 20 * 1024 * 1024;
export function isHeic(file) {
  return /image\/hei[cf]/i.test(file.type || "") || /\.hei[cf]$/i.test(file.name || "");
}
function rawImageMime(file) {
  const ext = ((file.name || "").split(".").pop() || "").toLowerCase();
  if (RAW_IMAGE_MIME[ext]) return RAW_IMAGE_MIME[ext];
  const t = (file.type || "").toLowerCase();
  return Object.values(RAW_IMAGE_MIME).includes(t) ? t : "";
}
export function isImageFile(file) {
  const t = (file.type || "").toLowerCase();
  return t.startsWith("image/") || (!t || t === "application/octet-stream") && IMAGE_EXT.test(file.name || "");
}

// Foto -> JPEG comprimido (máx 1600 px, orientación EXIF aplicada) + miniatura pequeña.
// Si el navegador no puede abrirla (p. ej. HEIC en Chrome), se envía el archivo original:
// Gemini sí entiende HEIC/HEIF, PNG, WEBP y JPEG.
async function prepareImage(file) {
  let img;
  try {
    img = await loadImage(file);
    if (!(img.width || img.naturalWidth)) throw new Error("sin tamaño");
  } catch {
    const mime = rawImageMime(file);
    if (mime && file.size <= MAX_RAW_IMAGE_BYTES) {
      return { kind: "image", mime, blob: file, size: file.size, thumb: "", url: "", name: file.name, raw: true, label: isHeic(file) ? "HEIC" : "FOTO" };
    }
    if (mime) throw new Error(`la foto HEIC pesa ${formatBytes(file.size)} y este navegador no puede reducirla. Envíela en JPG o tome la foto de nuevo.`);
    throw new Error("este navegador no puede abrir esa foto (formato no compatible o archivo dañado). Pruebe con JPG o PNG.");
  }
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const big = drawScaled(img, w, h, MAX_SIDE);
  const blob = await canvasToBlob(big, JPEG_QUALITY);
  const thumb = drawScaled(big, big.width, big.height, THUMB_SIDE).toDataURL("image/jpeg", 0.7);
  if (img.close) img.close();
  if (!blob) throw new Error("No se pudo comprimir la foto");
  return { kind: "image", mime: "image/jpeg", blob, size: blob.size, thumb, url: URL.createObjectURL(blob), name: file.name };
}

// Video -> se envía tal cual; miniatura del primer segundo (si el navegador puede)
function videoThumb(url) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    let settled = false;
    const finish = (val) => { if (!settled) { settled = true; v.removeAttribute("src"); v.load(); resolve(val); } };
    const t = setTimeout(() => finish(""), 5000);
    v.muted = true; v.playsInline = true; v.preload = "auto";
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch { finish(""); } };
    v.onseeked = () => {
      try {
        const c = drawScaled(v, v.videoWidth, v.videoHeight, THUMB_SIDE);
        clearTimeout(t); finish(c.toDataURL("image/jpeg", 0.7));
      } catch { clearTimeout(t); finish(""); }
    };
    v.onerror = () => { clearTimeout(t); finish(""); };
    v.src = url;
  });
}

// Tipo MIME que Gemini acepta. Los .MOV del iPhone llegan como video/quicktime (o sin tipo).
const EXT_MIME = { mov: "video/mov", mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", "3gp": "video/3gpp",
  avi: "video/avi", mpeg: "video/mpeg", mpg: "video/mpg", wmv: "video/wmv", flv: "video/x-flv" };
export function videoMime(file) {
  const t = (file.type || "").toLowerCase();
  if (t === "video/quicktime") return "video/mov";
  if (t.startsWith("video/")) return t;
  const ext = ((file.name || "").split(".").pop() || "").toLowerCase();
  return EXT_MIME[ext] || "video/mp4";
}
function isVideoFile(file) {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) return true;
  const ext = ((file.name || "").split(".").pop() || "").toLowerCase();
  return !t && ext in EXT_MIME;
}

async function prepareVideo(file) {
  const url = URL.createObjectURL(file);
  const thumb = await videoThumb(url);
  return { kind: "video", mime: videoMime(file), blob: file, size: file.size, thumb, url, name: file.name };
}

function isPdfFile(file) {
  const t = (file.type || "").toLowerCase();
  if (t === "application/pdf") return true;
  return !t && /\.pdf$/i.test(file.name || "");
}
async function preparePdf(file) {
  if (file.size > MAX_PDF_BYTES) throw new Error(`El PDF pesa ${formatBytes(file.size)}; el máximo es ${formatBytes(MAX_PDF_BYTES)}. Pruebe con un documento más corto.`);
  const url = URL.createObjectURL(file);
  return { kind: "pdf", mime: "application/pdf", blob: file, size: file.size, thumb: "", url, name: file.name || "documento.pdf", pages: null };
}

export async function prepareFile(file) {
  if (isImageFile(file)) return prepareImage(file);
  if (isPdfFile(file)) return preparePdf(file);
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error(`El video pesa ${formatBytes(file.size)}; el máximo es ${formatBytes(MAX_VIDEO_BYTES)}. Por favor grabe uno más corto.`);
    }
    return prepareVideo(file);
  }
  throw new Error("Solo se pueden adjuntar fotos, videos o PDF.");
}

export function formatBytes(n) {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

// Subida con porcentaje (fetch no informa el avance de la subida)
function xhrUpload(url, headers, blob, { onPct = null, signal = null } = {}) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.responseType = "text";
    if (onPct) x.upload.onprogress = (ev) => { if (ev.lengthComputable) onPct(Math.min(100, Math.round((ev.loaded / ev.total) * 100))); };
    x.onload = () => resolve({ ok: x.status >= 200 && x.status < 300, status: x.status, text: x.responseText || "" });
    x.onerror = () => reject(new Error("Falló la conexión durante la subida"));
    x.onabort = () => { const e = new Error("Subida cancelada"); e.name = "AbortError"; reject(e); };
    if (signal) { if (signal.aborted) { x.abort(); return; } signal.addEventListener("abort", () => x.abort(), { once: true }); }
    x.send(blob);
  });
}

// Sube un archivo a la Files API (subida reanudable) y espera a que quede ACTIVE.
// onProgress(etapa, porcentaje): etapa = "subiendo" | "procesando"
export async function uploadToFilesApi(apiKey, item, { onProgress = null, timeoutMs = 180000, signal = null } = {}) {
  const start = await fetch(GEMINI_UPLOAD_URL, {
    signal,
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(item.size),
      "X-Goog-Upload-Header-Content-Type": item.mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: (item.name || "antares-media").slice(0, 100) } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new Error(`No se pudo iniciar la subida (HTTP ${start.status})`);
  onProgress && onProgress("subiendo", 0);
  const up = await xhrUpload(uploadUrl, { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" }, item.blob,
    { signal, onPct: (pct) => onProgress && onProgress("subiendo", pct) });
  if (!up.ok) throw new Error(`La subida falló (HTTP ${up.status})`);
  let file = {};
  try { file = JSON.parse(up.text).file || {}; } catch { /* */ }
  const t0 = performance.now();
  onProgress && onProgress("procesando", 100);
  while (file.state === "PROCESSING") {
    if (performance.now() - t0 > timeoutMs) throw new Error("Gemini tardó demasiado en procesar el archivo");
    await new Promise((r) => setTimeout(r, 2000));
    if (signal && signal.aborted) { const e = new Error("Subida cancelada"); e.name = "AbortError"; throw e; }
    const r = await fetch(`${GEMINI_FILES_URL}/${file.name}`, { headers: { "x-goog-api-key": apiKey }, signal });
    if (!r.ok) throw new Error(`No se pudo consultar el archivo (HTTP ${r.status})`);
    file = await r.json();
  }
  if (file.state !== "ACTIVE" || !file.uri) throw new Error(`Gemini no pudo procesar el archivo (${file.state || "sin estado"})`);
  return { mime: file.mimeType || item.mime, fileUri: file.uri };
}

// Convierte los adjuntos en partes para Gemini: inline si son pequeños, Files API si pesan más de 4 MB
// (o si juntos no caben). El resultado queda guardado en cada adjunto (it.part), así un reintento
// reutiliza el mismo fileUri / base64 sin volver a subir ni a codificar nada.
export async function toGeminiMedia(apiKey, items, { onProgress = null, signal = null } = {}) {
  const viaFiles = new Set(items.filter((it) => it.size > FILES_API_FROM));
  let total = 0;
  for (const it of items) if (!viaFiles.has(it)) total += base64Size(it.size);
  for (const it of [...items].sort((a, b) => b.size - a.size)) {
    if (total <= INLINE_LIMIT) break;
    if (!viaFiles.has(it)) { viaFiles.add(it); total -= base64Size(it.size); }
  }
  const out = [];
  let uploaded = 0;
  for (const it of items) {
    const fresh = it.part && (!it.part.fileUri || Date.now() < (it.part.expires || 0));
    if (!fresh) {
      if (viaFiles.has(it)) {
        // Los archivos de la Files API duran 48 h; se reutilizan por un margen menor
        it.part = { ...(await uploadToFilesApi(apiKey, it, { onProgress: onProgress && ((st, pct) => onProgress(st, pct, it)), signal })), expires: Date.now() + 40 * 3600 * 1000 };
        uploaded++;
      } else {
        it.part = { mime: it.mime, data: await blobToBase64(it.blob) };
      }
    }
    out.push(it.part.fileUri ? { mime: it.part.mime, fileUri: it.part.fileUri } : { mime: it.part.mime, data: it.part.data });
  }
  return { media: out, uploaded };
}
