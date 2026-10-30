// Viernes - quitar fondo en el teléfono, gratis e ilimitado.
// 1) Modelo IA local @imgly/background-removal (se descarga una vez ~40 MB y queda en caché del navegador; no gasta cuota de Gemini).
// 2) Si falla (sin internet o teléfono sin memoria): método simple por color del borde, ideal para fondos lisos.
let lib = null;
export async function removeBackground(canvas, onStatus = () => {}) {
  try {
    onStatus("Cargando el quitafondos (la primera vez tarda un poco)…");
    if (!lib) lib = await import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm");
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    onStatus("Quitando el fondo…");
    const out = await lib.removeBackground(blob, { model: "isnet_quint8", output: { format: "image/png" },
      progress: (k, cur, tot) => { if (tot) onStatus(`Descargando modelo… ${Math.round(cur / tot * 100)}%`); } });
    const bmp = await createImageBitmap(out);
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
    onStatus("¡Listo! Fondo quitado ✨");
    return { canvas: c, method: "ia-local" };
  } catch (e) {
    console.warn("bg-removal IA local falló, uso método simple", e);
    onStatus("Usé el método simple (funciona mejor con fondo liso).");
    return { canvas: simpleRemove(canvas), method: "simple" };
  }
}
// Quita los píxeles conectados al borde cuyo color se parece al del borde (relleno por inundación).
export function simpleRemove(src, tol = 34) {
  const w = src.width, h = src.height, c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  let r = 0, g = 0, b = 0, n = 0;
  const samp = (x, y) => { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; };
  for (let x = 0; x < w; x += 4) { samp(x, 0); samp(x, h - 1); }
  for (let y = 0; y < h; y += 4) { samp(0, y); samp(w - 1, y); }
  r /= n; g /= n; b /= n;
  const seen = new Uint8Array(w * h), st = [];
  const ok = (p) => { const i = p * 4; return Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b) < tol * 3; };
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) {
    const p = st.pop(); if (seen[p]) continue; seen[p] = 1; if (!ok(p)) continue;
    d[p * 4 + 3] = 0; const x = p % w;
    if (x > 0) st.push(p - 1); if (x < w - 1) st.push(p + 1); if (p >= w) st.push(p - w); if (p < w * (h - 1)) st.push(p + w);
  }
  ctx.putImageData(img, 0, 0);
  // suaviza el borde
  const c2 = document.createElement("canvas"); c2.width = w; c2.height = h; const x2 = c2.getContext("2d");
  x2.filter = "blur(1px)"; x2.drawImage(c, 0, 0); x2.filter = "none"; x2.globalCompositeOperation = "source-in"; x2.drawImage(src, 0, 0);
  return c2;
}
