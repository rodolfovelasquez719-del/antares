// Viernes - editor de fotos local (ilimitado) + edición con IA opcional (limitada).
import { toast, apiKey, hasKey } from "./app.js";
import { removeBackground } from "./bgremove.js";
import { aiEdit } from "./aiedit.js";
import { loadCanvas, busy } from "./img.js";
const $ = (id) => document.getElementById(id);
let base = null, undo = [], over = [], cut = null; // base: canvas actual; over: textos/stickers
let adj = { b: 100, c: 100, s: 100, w: 0 };
const cv = () => $("ph-canvas");
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const clone = (c) => { const n = mk(c.width, c.height); n.getContext("2d").drawImage(c, 0, 0); return n; };
const push = () => { undo.push(clone(base)); if (undo.length > 15) undo.shift(); };
const filt = () => `brightness(${adj.b}%) contrast(${adj.c}%) saturate(${adj.s}%)`;
export const FX = { "Original": "none", "Brillante": "brightness(112%) contrast(108%) saturate(115%)", "Rosa suave": "sepia(25%) hue-rotate(-30deg) saturate(130%) brightness(108%)",
  "Lila": "hue-rotate(20deg) saturate(110%) brightness(105%)", "Vintage": "sepia(45%) contrast(95%) brightness(105%)", "B y N": "grayscale(100%) contrast(110%)", "Vívido": "saturate(160%) contrast(110%)", "Pastel": "saturate(70%) brightness(115%) contrast(90%)" };
export const BGS = [["#ffffff"], ["#fde8f1"], ["#f3e8ff"], ["#fff7ed"], ["#e0f2fe"], ["lin", "#ffd1e6", "#e9d5ff"], ["lin", "#fbcfe8", "#fef3c7"], ["lin", "#f5d0fe", "#c7d2fe"], ["#111111"]];
export function paintBg(ctx, w, h, bg) {
  if (bg[0] === "lin") { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, bg[1]); g.addColorStop(1, bg[2]); ctx.fillStyle = g; } else ctx.fillStyle = bg[0];
  ctx.fillRect(0, 0, w, h);
}
function render(preview = true) {
  const c = cv(), x = c.getContext("2d");
  c.width = base.width; c.height = base.height;
  if (preview) x.filter = filt();
  if (adj.w) { x.drawImage(base, 0, 0); x.filter = "none"; x.globalCompositeOperation = "soft-light"; x.fillStyle = adj.w > 0 ? `rgba(255,150,60,${adj.w / 100})` : `rgba(80,140,255,${-adj.w / 100})`; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = "source-over"; }
  else { x.drawImage(base, 0, 0); x.filter = "none"; }
  for (const o of over) drawOver(x, o);
  c.style.touchAction = over.length ? "none" : "pan-y";
}
function drawOver(x, o) {
  x.save(); x.translate(o.x, o.y); x.textAlign = "center"; x.textBaseline = "middle";
  let fs = o.size; x.font = `700 ${fs}px "${o.font}", sans-serif`;
  const maxW = x.canvas.width * 0.92 - (o.kind === "price" ? o.size : 0);
  while (fs > 12 && x.measureText(o.text).width > maxW) { fs -= 2; x.font = `700 ${fs}px "${o.font}", sans-serif`; }
  o = { ...o, size: fs };
  { const W = x.canvas.width, hw = (x.measureText(o.text).width + (o.kind === "price" ? fs : 0)) / 2 + 4; const nx = Math.min(W - hw, Math.max(hw, o.x)); if (nx !== o.x) x.translate(nx - o.x, 0); }
  if (o.kind === "price") {
    const w = x.measureText(o.text).width + o.size; x.fillStyle = "#ff5fa8"; x.beginPath(); x.roundRect(-w / 2, -o.size * 0.75, w, o.size * 1.5, o.size * 0.75); x.fill();
    x.fillStyle = "#fff"; x.fillText(o.text, 0, 0);
  } else {
    if (o.alpha) x.globalAlpha = o.alpha;
    x.lineWidth = o.size / 10; x.strokeStyle = "rgba(0,0,0,.35)"; if (o.kind === "text") x.strokeText(o.text, 0, 0);
    x.fillStyle = o.color; x.fillText(o.text, 0, 0);
  }
  x.restore();
}
function bake() { render(true); base = clone(cv()); over = []; adj = { b: 100, c: 100, s: 100, w: 0 }; ["a-b", "a-c", "a-s"].forEach((i) => $(i).value = 100); $("a-w").value = 0; }
async function loadFile(f) {
  const c = await loadCanvas(f, 2000); $("ph-file").value = ""; if (!c) return; base = c;
  undo = []; over = []; cut = null; $("ph-upload").classList.add("hidden"); $("ph-editor").classList.remove("hidden"); render();
}
export function initEditor() {
  $("ph-file").onchange = (e) => e.target.files[0] && loadFile(e.target.files[0]);
  $("ph-tabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return;
    $("ph-tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll("#ph-editor .panel").forEach((p) => p.classList.toggle("hidden", p.dataset.p !== b.dataset.t)); };
  [["a-b", "b"], ["a-c", "c"], ["a-s", "s"], ["a-w", "w"]].forEach(([id, k]) => $(id).oninput = (e) => { adj[k] = +e.target.value; render(); });
  $("a-apply").onclick = () => { push(); bake(); toast("Aplicado ✅"); };
  $("a-auto").onclick = () => { // luz automática: estira el histograma de luminosidad
    push(); const x = base.getContext("2d"), im = x.getImageData(0, 0, base.width, base.height), d = im.data; let lo = 255, hi = 0; const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 16) hist[(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) | 0]++;
    const tot = d.length / 16; let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > tot * 0.01 && lo === 255) lo = v; if (acc > tot * 0.99) { hi = v; break; } }
    const k = 255 / Math.max(1, hi - lo); for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = Math.min(255, Math.max(0, (d[i + j] - lo) * k * 1.03));
    x.putImageData(im, 0, 0); render(); toast("Luz mejorada ✨"); };
  const fl = $("fx-list"); fl.innerHTML = Object.keys(FX).map((n) => `<button>${n}</button>`).join("");
  fl.onclick = (e) => { if (e.target.tagName !== "BUTTON") return; push(); const n = clone(base), x = n.getContext("2d"); x.clearRect(0, 0, n.width, n.height); x.filter = FX[e.target.textContent]; x.drawImage(base, 0, 0); base = n; render(); };
  $("crop-list").onclick = (e) => { const r = +e.target.dataset.r; if (!r) return; push();
    let w = base.width, h = base.height; if (w / h > r) w = Math.round(h * r); else h = Math.round(w / r);
    const n = mk(w, h); n.getContext("2d").drawImage(base, (base.width - w) / 2, (base.height - h) / 2, w, h, 0, 0, w, h); base = n; over = []; render(); };
  const rot = (dir) => { push(); const n = mk(base.height, base.width), x = n.getContext("2d"); x.translate(n.width / 2, n.height / 2); x.rotate(dir * Math.PI / 2); x.drawImage(base, -base.width / 2, -base.height / 2); base = n; over = []; render(); };
  $("rot-l").onclick = () => rot(-1); $("rot-r").onclick = () => rot(1);
  $("flip").onclick = () => { push(); const n = mk(base.width, base.height), x = n.getContext("2d"); x.scale(-1, 1); x.drawImage(base, -base.width, 0); base = n; render(); };
  // Fondo
  const bl = $("bg-list"); bl.innerHTML = BGS.map((b, i) => `<button data-i="${i}" style="background:${b[0] === "lin" ? `linear-gradient(135deg,${b[1]},${b[2]})` : b[0]}"></button>`).join("") + '<button data-i="-1" title="Transparente">∅</button>';
  $("bg-remove").onclick = busy($("bg-remove"), async () => { push(); const r = await removeBackground(base, (t) => $("bg-status").textContent = t); cut = r.canvas; base = clone(cut); render(); });
  bl.onclick = (e) => { const i = e.target.dataset.i; if (i == null) return; if (!cut) return toast("Primero toca «🪄 Quitar fondo» y luego elige el color"); push();
    const n = mk(cut.width, cut.height), x = n.getContext("2d"); if (+i >= 0) { paintBg(x, n.width, n.height, BGS[+i]); x.shadowColor = "rgba(0,0,0,.18)"; x.shadowBlur = 30; x.shadowOffsetY = 12; } x.drawImage(cut, 0, 0); base = n; render(); };
  $("bg-blur").onclick = busy($("bg-blur"), async () => { push(); const r = await removeBackground(base, (t) => $("bg-status").textContent = t);
    const n = mk(base.width, base.height), x = n.getContext("2d"); x.filter = `blur(${Math.round(base.width / 80)}px)`; x.drawImage(base, 0, 0); x.filter = "none"; x.drawImage(r.canvas, 0, 0); base = n; render(); });
  // Texto y stickers
  $("stickers").innerHTML = ["💖", "✨", "🌸", "🎀", "💎", "⭐", "🦋", "🌷", "🛍️", "🔥", "NUEVO", "OFERTA", "HECHO A MANO"].map((s) => `<button>${s}</button>`).join("");
  const add = (o) => { over.push({ x: base.width / 2, y: base.height / 2, size: Math.round(base.width / 12), font: "Fredoka", color: "#ffffff", kind: "text", ...o }); render(); };
  $("t-add").onclick = () => { const t = $("t-text").value.trim(); if (!t) return toast("Escribe un texto"); add({ text: t, color: $("t-color").value, font: $("t-font").value }); };
  $("stickers").onclick = (e) => { if (e.target.tagName === "BUTTON") { const t = e.target.textContent; add(t.length > 2 ? { text: t, kind: "price", size: Math.round(base.width / 18) } : { text: t, kind: "emoji", size: Math.round(base.width / 7) }); } };
  $("t-wm").onclick = () => add({ text: $("t-text").value || "@mitienda", alpha: 0.45, size: Math.round(base.width / 16), y: base.height * 0.92, font: "Great Vibes" });
  $("t-price").onclick = () => add({ text: $("t-text").value || "₡5.000", kind: "price", size: Math.round(base.width / 14), x: base.width * 0.78, y: base.height * 0.85 });
  $("t-clear").onclick = () => { over = []; render(); };
  let drag = null; const c = cv();
  const pt = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; };
  c.onpointerdown = (e) => { const p = pt(e); drag = [...over].reverse().find((o) => Math.abs(o.x - p.x) < o.size * 2 && Math.abs(o.y - p.y) < o.size); if (drag) c.setPointerCapture(e.pointerId); };
  c.onpointermove = (e) => { if (!drag) return; Object.assign(drag, pt(e)); render(); };
  c.onpointerup = () => drag = null;
  // IA (limitada)
  $("ai-go").onclick = busy($("ai-go"), async () => { if (!hasKey()) return toast("La edición con IA necesita que Freddy prepare Viernes."); const ins = $("ai-in").value.trim(); if (!ins) return toast("Escribe qué cambiar");
    bake(); const blob = await new Promise((r) => base.toBlob(r, "image/jpeg", 0.9)); $("ai-status").textContent = "Editando con IA…";
    const r = await aiEdit(apiKey(), blob, ins, { onStatus: () => {} });
    if (!r.ok) { $("ai-status").textContent = r.kind === "stopped" ? "" : (r.kind === "safety" || r.kind === "no_image") ? r.text :
      "La edición con IA no está disponible ahora mismo 😔 (Google la limita). Usa Luz, Filtros, Fondo y Texto: esas son ilimitadas 💜"; console.info("aiEdit:", r.kind); return; }
    push(); const bmp = await createImageBitmap(r.blob); base = mk(bmp.width, bmp.height); base.getContext("2d").drawImage(bmp, 0, 0); render(); $("ai-status").textContent = "¡Listo! ✨"; });
  $("ph-undo").onclick = () => { if (undo.length) { base = undo.pop(); render(); } };
  $("ph-new").onclick = () => { $("ph-editor").classList.add("hidden"); $("ph-upload").classList.remove("hidden"); $("ph-file").value = ""; };
  $("ph-save").onclick = busy($("ph-save"), async () => { render(); await shareCanvas(cv(), "viernes-foto"); });
}
export async function shareCanvas(c, name) {
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const file = new File([blob], `${name}-${Date.now()}.png`, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === "AbortError") return; } }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); toast("Imagen guardada en Descargas 💾");
}
