// Viernes - pósteres y collage 100% locales (canvas). Ilimitados: no usan IA para la imagen.
import { toast, askViernes, hasKey } from "./app.js";
import { removeBackground } from "./bgremove.js";
import { shareCanvas } from "./editor.js";
const $ = (id) => document.getElementById(id);
const FMT = { sq: [1080, 1080], st: [1080, 1920], wa: [800, 800] };
let photo = null, cut = null, tpl = 0, fmt = "sq", step = 1, focus = [{ u: 0.25, v: 0.2 }, { u: 0.55, v: 0.8 }], pickIdx = 0;
const val = (id) => $(id).value.trim();
// ---------- dibujo ----------
function heart(x, cx, cy, s, fill, stroke) {
  x.save(); x.translate(cx, cy); x.scale(s / 32, s / 32); x.beginPath(); x.moveTo(0, 10);
  x.bezierCurveTo(-30, -10, -12, -32, 0, -16); x.bezierCurveTo(12, -32, 30, -10, 0, 10); x.closePath();
  if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.lineWidth = 2.5; x.strokeStyle = stroke; x.stroke(); } x.restore();
}
function flower(x, cx, cy, r, col, center = "#ffe08a") {
  x.save(); x.translate(cx, cy); x.fillStyle = col;
  for (let i = 0; i < 5; i++) { x.rotate(Math.PI * 2 / 5); x.beginPath(); x.ellipse(0, -r * 0.55, r * 0.38, r * 0.55, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = center; x.beginPath(); x.arc(0, 0, r * 0.22, 0, Math.PI * 2); x.fill(); x.restore();
}
function sparkle(x, cx, cy, r, col) {
  x.save(); x.fillStyle = col; x.beginPath(); x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r); x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r); x.fill(); x.restore();
}
function diamond(x, cx, cy, r, col) { x.save(); x.strokeStyle = col; x.lineWidth = r / 7; x.beginPath(); x.moveTo(cx - r, cy - r * 0.3); x.lineTo(cx - r * 0.5, cy - r * 0.8); x.lineTo(cx + r * 0.5, cy - r * 0.8); x.lineTo(cx + r, cy - r * 0.3); x.lineTo(cx, cy + r); x.closePath(); x.moveTo(cx - r, cy - r * 0.3); x.lineTo(cx + r, cy - r * 0.3); x.stroke(); x.restore(); }
const ICONS = [(x, c, y, r, col) => diamond(x, c, y, r * 0.6, col), (x, c, y, r, col) => heart(x, c, y + r * 0.1, r * 1.2, null, col), (x, c, y, r, col) => sparkle(x, c, y, r * 0.7, col), (x, c, y, r, col) => flower(x, c, y, r * 0.75, col, "#fff")];
function pill(x, cx, cy, text, font, size, bg, fg, padX = 0.9, maxW = 1e9) {
  x.font = `${font.startsWith("italic") ? "" : "600 "}${size}px ${font}`; let w = Math.min(maxW, x.measureText(text).width + size * padX * 2);
  x.fillStyle = bg; x.beginPath(); x.roundRect(cx - w / 2, cy - size * 0.95, w, size * 1.9, size * 0.95); x.fill();
  x.fillStyle = fg; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, cx, cy + size * 0.05, w - size); return w;
}
function wrap(x, text, maxW) { const words = text.split(/\s+/), lines = []; let l = ""; for (const w of words) { const t = l ? l + " " + w : w; if (x.measureText(t).width > maxW && l) { lines.push(l); l = w; } else l = t; } if (l) lines.push(l); return lines; }
function fitText(x, text, font, size, maxW) { do { x.font = `${size}px ${font}`; size -= 2; } while (x.measureText(text).width > maxW && size > 20); return size + 2; }
function src() { return ($("po-usecut").checked && cut) || photo; }
function drawProduct(x, box, opts = {}) {
  const im = src(); if (!im) { x.save(); x.fillStyle = "rgba(255,255,255,.5)"; x.beginPath(); x.roundRect(box.x, box.y, box.w, box.h, 30); x.fill(); x.fillStyle = "#b07"; x.font = "600 40px Quicksand"; x.textAlign = "center"; x.fillText("Tu foto aquí 📷", box.x + box.w / 2, box.y + box.h / 2); x.restore(); return; }
  const sc = +$("po-scale").value / 100, dx = +$("po-dx").value / 100 * box.w, dy = +$("po-dy").value / 100 * box.h;
  const isCut = im === cut;
  const k = (isCut ? Math.min : Math.max)(box.w / im.width, box.h / im.height) * sc * (isCut ? 0.92 : 1);
  const w = im.width * k, h = im.height * k;
  x.save();
  if (!isCut) { x.beginPath(); x.roundRect(box.x, box.y, box.w, box.h, opts.r ?? 36); x.clip(); }
  else { x.shadowColor = "rgba(90,20,60,.35)"; x.shadowBlur = 40; x.shadowOffsetY = 18; }
  x.drawImage(im, box.x + (box.w - w) / 2 + dx, box.y + (box.h - h) / 2 + dy, w, h); x.restore();
}
function detail(x, cx, cy, r, i, ring, label, lblBg, lblFg, lblFont) {
  const im = photo; x.save();
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = "#fff"; x.fill(); x.clip();
  if (im) { const f = focus[i], z = Math.min(im.width, im.height) * 0.28; x.drawImage(im, f.u * im.width - z / 2, f.v * im.height - z / 2, z, z, cx - r, cy - r, r * 2, r * 2); }
  x.restore(); x.lineWidth = r * 0.07; x.strokeStyle = ring; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
  if (label) { x.font = `600 ${r * 0.2}px ${lblFont}`; const lines = wrap(x, label, r * 1.9); lines.forEach((l, j) => pill(x, cx, cy + r + r * 0.25 + j * r * 0.3, l, lblFont, r * 0.15, lblBg, lblFg)); }
}
function bgGrad(x, W, H, a, b, c) { const g = x.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, a); g.addColorStop(0.6, b); g.addColorStop(1, c || a); x.fillStyle = g; x.fillRect(0, 0, W, H); }
function bokeh(x, W, H, col, n = 18, seed = 7) { let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; x.save(); for (let i = 0; i < n; i++) { x.globalAlpha = 0.08 + r() * 0.15; x.fillStyle = col; x.beginPath(); x.arc(r() * W, r() * H, 20 + r() * 90, 0, 7); x.fill(); } x.restore(); }
function feats() { return val("po-feat").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 4); }
function brand(x, W, H, col) { const b = val("po-brand"); if (!b) return; x.font = `600 ${W * 0.03}px Quicksand`; x.fillStyle = col; x.textAlign = "center"; x.fillText(b, W / 2, H - W * 0.025); }

// ---------- plantillas ----------
const TPL = [
  { name: "🌸 Rosa elegante", draw(x, W, H) { // estilo ejemplo 1
    const st = H > W * 1.2, u = W / 1080;
    bgGrad(x, W, H, "#fbe3ea", "#f6d3df", "#fdeef3"); bokeh(x, W, H, "#fff");
    for (const [a, b, r, c] of [[60, 80, 70, "#f9a8c9"], [20, 230, 55, "#f7b6cf"], [120, 180, 40, "#fff"], [40, 640, 60, "#f9a8c9"], [90, 760, 38, "#fff"]]) flower(x, a * u, (st ? b * 1.3 : b) * u, r * u, c);
    x.fillStyle = "#b8893b"; x.textAlign = "center"; x.textBaseline = "alphabetic";
    const tSize = fitText(x, val("po-title"), '"Great Vibes"', 190 * u, W * 0.62);
    const tx = st ? W / 2 : W * 0.38; x.fillText(val("po-title"), tx, (st ? 230 : 190) * u);
    x.fillStyle = "#a0742e"; x.font = `600 ${44 * u}px "Playfair Display"`; x.fillText(val("po-sub"), tx, (st ? 300 : 255) * u, W * 0.6);
    pill(x, tx, (st ? 380 : 330) * u, val("po-pill") + " ♥", 'italic 500 "Playfair Display"'.slice(11), 32 * u, "rgba(255,255,255,.85)", "#8a4a5e", 0.9, W * 0.6);
    // panel terciopelo
    const pb = st ? { x: W * 0.1, y: 470 * u, w: W * 0.8, h: 820 * u } : { x: 70 * u, y: 400 * u, w: 500 * u, h: 540 * u };
    x.save(); x.shadowColor = "rgba(150,60,90,.3)"; x.shadowBlur = 30 * u; x.fillStyle = "#e9a6b9"; x.beginPath(); x.roundRect(pb.x, pb.y, pb.w, pb.h, 70 * u); x.fill(); x.restore();
    drawProduct(x, { x: pb.x + 20 * u, y: pb.y + 20 * u, w: pb.w - 40 * u, h: pb.h - 40 * u });
    heart(x, pb.x + 60 * u, pb.y + pb.h - 70 * u, 50 * u, null, "#fff");
    // características en círculos
    const f = feats().slice(0, st ? 4 : 3);
    f.forEach((t, i) => { const cx = st ? W * (0.14 + i * 0.24) : 680 * u, cy = st ? 1420 * u : (425 + i * 168) * u, r = 42 * u;
      x.fillStyle = "rgba(255,255,255,.75)"; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); ICONS[i % 4](x, cx, cy, r * 0.6, "#a8577a");
      x.fillStyle = "#6b3a4c"; x.font = `italic 500 ${24 * u}px "Playfair Display"`; x.textAlign = "center"; wrap(x, t, 150 * u).forEach((l, j) => x.fillText(l, cx, cy + r + 26 * u + j * 26 * u)); });
    if (!st) { detail(x, 920 * u, 260 * u, 120 * u, 0, "#fff", val("po-d1"), "rgba(255,255,255,.9)", "#7a3d55", "Quicksand"); detail(x, 920 * u, 610 * u, 110 * u, 1, "#fff", val("po-d2"), "rgba(255,255,255,.9)", "#7a3d55", "Quicksand"); }
    else { detail(x, W * 0.25, 1660 * u, 110 * u, 0, "#fff", "", "", "", ""); detail(x, W * 0.75, 1660 * u, 110 * u, 1, "#fff", "", "", "", ""); }
    // precio (nube)
    const pc = st ? { x: W / 2, y: 1830 * u } : { x: 800 * u, y: 975 * u };
    x.fillStyle = "#c46a85"; x.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * 7; x.arc(pc.x + Math.cos(a) * 150 * u, pc.y + Math.sin(a) * 55 * u, 50 * u, 0, 7); } x.fill(); x.beginPath(); x.ellipse(pc.x, pc.y, 170 * u, 70 * u, 0, 0, 7); x.fill();
    x.fillStyle = "#fff"; x.font = `600 ${92 * u}px "Playfair Display"`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(val("po-price"), pc.x, pc.y + 4 * u, 320 * u);
    flower(x, pc.x - 190 * u, pc.y + 50 * u, 34 * u, "#f9a8c9"); flower(x, pc.x + 190 * u, pc.y - 50 * u, 28 * u, "#fff");
    brand(x, W, H, "#8a4a5e"); } },
  { name: "🍬 Chicle divertido", draw(x, W, H) { // estilo ejemplo 2
    const st = H > W * 1.2, u = W / 1080;
    bgGrad(x, W, H, "#fff5fa", "#fde7f3", "#efe4ff"); bokeh(x, W, H, "#f9a8d4", 14, 3);
    // nube del título
    const tb = { x: 40 * u, y: 40 * u, w: (st ? 1000 : 640) * u, h: 340 * u };
    x.fillStyle = "#fff"; x.strokeStyle = "#f9a8d4"; x.lineWidth = 8 * u; x.beginPath(); x.roundRect(tb.x, tb.y, tb.w, tb.h, 90 * u); x.fill(); x.stroke();
    x.textAlign = "center"; x.textBaseline = "alphabetic"; const cx = tb.x + tb.w / 2;
    const s1 = fitText(x, val("po-title"), "Fredoka", 130 * u, tb.w * 0.85); x.font = `700 ${s1}px Fredoka`; x.lineWidth = 14 * u; x.strokeStyle = "#fff"; x.strokeText(val("po-title"), cx, tb.y + 150 * u); x.fillStyle = "#9b5de5"; x.fillText(val("po-title"), cx, tb.y + 150 * u);
    const s2 = fitText(x, val("po-sub"), "Fredoka", 90 * u, tb.w * 0.85); x.font = `700 ${s2}px Fredoka`; x.fillStyle = "#e9418f"; x.fillText(val("po-sub"), cx, tb.y + 250 * u);
    pill(x, cx, tb.y + 310 * u, "♥ " + val("po-pill") + " ♥", "Fredoka", 30 * u, "#b48cff", "#fff", 0.9, tb.w * 0.95);
    heart(x, tb.x + 40 * u, tb.y + 30 * u, 40 * u, "#f472b6"); heart(x, tb.x + tb.w - 30 * u, tb.y + 120 * u, 34 * u, "#f472b6"); sparkle(x, tb.x + tb.w - 70 * u, tb.y + 20 * u, 22 * u, "#c084fc");
    // producto
    const pb = st ? { x: 80 * u, y: 420 * u, w: 920 * u, h: 900 * u } : { x: 40 * u, y: 400 * u, w: 620 * u, h: 540 * u };
    x.save(); x.fillStyle = "#e8ddd8"; x.beginPath(); x.ellipse(pb.x + pb.w / 2, pb.y + pb.h * 0.55, pb.w * 0.45, pb.h * 0.5, 0, 0, 7); x.fill(); x.restore();
    drawProduct(x, pb, { r: 60 * u });
    flower(x, 50 * u, pb.y + pb.h - 20 * u, 40 * u, "#fbcfe8"); flower(x, 110 * u, pb.y + pb.h + 10 * u, 30 * u, "#fff");
    // detalles + características
    const col = ["#f472b6", "#a78bfa", "#5eead4", "#fcd34d"], bg = ["#fde2ef", "#ede4ff", "#d9f7f1", "#fff3cc"];
    const f = feats();
    if (!st) {
      detail(x, 875 * u, 175 * u, 135 * u, 0, "#f9a8d4", val("po-d1"), "#ec4899", "#fff", "Fredoka");
      f.forEach((t, i) => { const y = (450 + i * 105) * u; x.fillStyle = bg[i]; x.beginPath(); x.roundRect(700 * u, y - 42 * u, 350 * u, 84 * u, 42 * u); x.fill();
        x.fillStyle = col[i]; x.beginPath(); x.arc(745 * u, y, 36 * u, 0, 7); x.fill(); ICONS[i](x, 745 * u, y, 30 * u, "#fff");
        x.fillStyle = "#5b4366"; x.font = `500 ${24 * u}px Fredoka`; x.textAlign = "left"; x.textBaseline = "middle"; const ls = wrap(x, t, 250 * u); ls.slice(0, 2).forEach((l, j) => x.fillText(l, 795 * u, y + (j - (ls.length > 1 ? 0.5 : 0)) * 28 * u)); });
    } else {
      detail(x, 270 * u, 1460 * u, 140 * u, 0, "#f9a8d4", val("po-d1"), "#ec4899", "#fff", "Fredoka");
      detail(x, 810 * u, 1460 * u, 140 * u, 1, "#f9a8d4", val("po-d2"), "#ec4899", "#fff", "Fredoka");
    }
    // precio
    const pp = st ? { x: 860 * u, y: 1250 * u } : { x: 560 * u, y: 880 * u };
    x.fillStyle = "#e9418f"; x.beginPath(); x.arc(pp.x, pp.y, 95 * u, 0, 7); x.fill(); x.lineWidth = 6 * u; x.strokeStyle = "#fff"; x.stroke();
    x.fillStyle = "#fff"; x.font = `700 ${50 * u}px Fredoka`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(val("po-price"), pp.x, pp.y, 170 * u);
    // franja inferior
    const by = H - 120 * u; x.fillStyle = "#fbd5e8"; x.beginPath(); x.roundRect(0, by, W, 120 * u, [50 * u, 50 * u, 0, 0]); x.fill();
    const bf = st ? f.slice(0, 3) : f.slice(-3); bf.forEach((t, i) => { const cx = W * (i + 0.5) / 3; ICONS[(i + 1) % 4](x, cx, by + 35 * u, 26 * u, "#db2777"); x.fillStyle = "#6b2e57"; x.font = `500 ${26 * u}px Fredoka`; x.textAlign = "center"; x.fillText(t, cx, by + 85 * u, W / 3 - 20 * u); });
    if (val("po-brand")) { x.fillStyle = "#9d4c80"; x.font = `600 ${26 * u}px Quicksand`; x.fillText(val("po-brand"), W / 2, by - 22 * u); } } },
  { name: "💜 Lila minimal", draw(x, W, H) {
    const st = H > W * 1.2, u = W / 1080;
    bgGrad(x, W, H, "#f4efff", "#ffffff", "#fbe7f3");
    const pb = { x: 90 * u, y: (st ? 380 : 240) * u, w: 900 * u, h: (st ? 1050 : 580) * u };
    x.fillStyle = "#e9dcff"; x.beginPath(); x.arc(W / 2, pb.y + pb.h / 2, Math.min(pb.w, pb.h) * 0.48, 0, 7); x.fill();
    drawProduct(x, pb);
    x.fillStyle = "#4c1d95"; x.textAlign = "center"; x.textBaseline = "alphabetic";
    const s = fitText(x, `${val("po-title")} ${val("po-sub")}`, '"Playfair Display"', 80 * u, W * 0.86); x.font = `600 ${s}px "Playfair Display"`; x.fillText(`${val("po-title")} ${val("po-sub")}`, W / 2, (st ? 230 : 140) * u);
    x.fillStyle = "#a855f7"; x.font = `500 ${32 * u}px Quicksand`; x.fillText(val("po-pill"), W / 2, (st ? 300 : 195) * u, W * 0.85);
    const y0 = pb.y + pb.h + 70 * u; const f = feats().slice(0, 3);
    x.font = `600 ${28 * u}px Quicksand`; x.fillStyle = "#6d28d9"; x.fillText(f.join("  ·  "), W / 2, y0, W * 0.9);
    pill(x, W / 2, y0 + (st ? 160 : 110) * u, val("po-price"), "Quicksand", 56 * u, "#7c3aed", "#fff");
    sparkle(x, 150 * u, 120 * u, 30 * u, "#c4b5fd"); sparkle(x, 940 * u, H - 120 * u, 26 * u, "#f9a8d4"); brand(x, W, H, "#7c3aed"); } },
  { name: "✨ Boutique dorado", draw(x, W, H) {
    const st = H > W * 1.2, u = W / 1080;
    bgGrad(x, W, H, "#2a0f2e", "#4a1942", "#1c0a24"); bokeh(x, W, H, "#f5c2e7", 22, 11);
    x.strokeStyle = "#d4a95a"; x.lineWidth = 4 * u; x.strokeRect(30 * u, 30 * u, W - 60 * u, H - 60 * u);
    x.fillStyle = "#e8c27a"; x.textAlign = "center"; x.textBaseline = "alphabetic";
    const s = fitText(x, val("po-title"), '"Great Vibes"', 170 * u, W * 0.8); x.font = `${s}px "Great Vibes"`; x.fillText(val("po-title"), W / 2, (st ? 260 : 190) * u);
    x.font = `600 ${40 * u}px "Playfair Display"`; x.fillStyle = "#f6dfb0"; x.fillText(val("po-sub").toUpperCase(), W / 2, (st ? 330 : 250) * u, W * 0.8);
    const pb = { x: 140 * u, y: (st ? 400 : 290) * u, w: 800 * u, h: (st ? 1020 : 560) * u };
    x.save(); x.fillStyle = "rgba(255,210,230,.12)"; x.beginPath(); x.roundRect(pb.x, pb.y, pb.w, pb.h, 40 * u); x.fill(); x.restore();
    drawProduct(x, pb);
    const y0 = pb.y + pb.h + 60 * u; x.fillStyle = "#f6dfb0"; x.font = `italic 500 ${30 * u}px "Playfair Display"`; x.fillText(val("po-pill"), W / 2, y0, W * 0.85);
    pill(x, W / 2, y0 + (st ? 170 : 110) * u, val("po-price"), '"Playfair Display"', 54 * u, "#d4a95a", "#2a0f2e");
    if (st) feats().slice(0, 3).forEach((t, i) => { x.fillStyle = "#f5c2e7"; x.font = `500 ${30 * u}px Quicksand`; x.fillText("♥ " + t, W / 2, y0 + 290 * u + i * 50 * u); });
    brand(x, W, H - 20 * u, "#e8c27a"); } },
];
export async function drawPoster() {
  const [W, H] = FMT[fmt], c = $("po-canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  x.textAlign = "center"; TPL[tpl].draw(x, W, H);
}
function drawPick() {
  const p = $("po-pick"); if (!photo) return; const k = 300 / photo.width; p.width = 300; p.height = photo.height * k;
  const x = p.getContext("2d"); x.drawImage(photo, 0, 0, p.width, p.height);
  focus.forEach((f, i) => { x.strokeStyle = i ? "#a855f7" : "#ff5fa8"; x.lineWidth = 3; x.beginPath(); x.arc(f.u * p.width, f.v * p.height, p.width * 0.14, 0, 7); x.stroke(); x.fillStyle = "#fff"; x.font = "bold 16px sans-serif"; x.fillText(i + 1, f.u * p.width - 4, f.v * p.height + 5); });
}
function goStep(n) {
  step = Math.max(1, Math.min(4, n));
  document.querySelectorAll(".pstep").forEach((s) => s.classList.toggle("hidden", +s.dataset.s !== step));
  document.querySelectorAll("#po-steps span").forEach((s, i) => s.classList.toggle("on", i === step - 1));
  $("po-back").classList.toggle("hidden", step === 1); $("po-next").classList.toggle("hidden", step === 4);
  drawPoster();
}
export async function initPoster() {
  try { await Promise.all(['700 40px Fredoka', '40px "Great Vibes"', '600 40px "Playfair Display"', 'italic 500 40px "Playfair Display"', '600 40px Quicksand', '500 40px Fredoka', '500 40px Quicksand'].map((f) => document.fonts.load(f))); } catch { /* */ }
  $("po-tpl").innerHTML = TPL.map((t, i) => `<button data-i="${i}" class="${i === tpl ? "on" : ""}">${t.name}</button>`).join("");
  $("po-tpl").onclick = (e) => { const i = e.target.dataset.i; if (i == null) return; tpl = +i; $("po-tpl").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target)); drawPoster(); };
  $("po-fmt").onclick = (e) => { const f = e.target.dataset.f; if (!f) return; fmt = f; $("po-fmt").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target)); drawPoster(); };
  $("po-file").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const bmp = await createImageBitmap(f); const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    photo = document.createElement("canvas"); photo.width = bmp.width * s; photo.height = bmp.height * s; photo.getContext("2d").drawImage(bmp, 0, 0, photo.width, photo.height); cut = null;
    $("po-cut").classList.remove("hidden"); $("po-status").textContent = "¡Foto lista! Si quieres, quítale el fondo, o toca «Siguiente»."; drawPick(); drawPoster(); };
  $("po-cut").onclick = async () => { if (!photo) return; $("po-cut").disabled = true; const r = await removeBackground(photo, (t) => $("po-status").textContent = t); cut = r.canvas; $("po-cut").disabled = false; $("po-usecut-l").classList.remove("hidden"); $("po-usecut").checked = true; drawPoster(); };
  ["po-title", "po-sub", "po-pill", "po-price", "po-feat", "po-brand", "po-d1", "po-d2", "po-scale", "po-dx", "po-dy", "po-usecut"].forEach((id) => $(id).addEventListener("input", drawPoster));
  $("po-pick").onclick = (e) => { const r = e.target.getBoundingClientRect(); focus[pickIdx] = { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height }; pickIdx = 1 - pickIdx; drawPick(); drawPoster(); };
  $("po-next").onclick = () => goStep(step + 1); $("po-back").onclick = () => goStep(step - 1); $("po-again").onclick = () => goStep(1);
  $("po-save").onclick = () => shareCanvas($("po-canvas"), "viernes-poster");
  $("po-ai").onclick = async () => {
    if (!hasKey()) return toast("Para sugerencias, Freddy tiene que preparar Viernes 💜");
    $("po-ai").textContent = "✨ Pensando…";
    const r = await askViernes([{ role: "user", text: `Para un póster de venta de este producto hecho a mano: "${val("po-title")} ${val("po-sub")}" (${val("po-price")}). Responde SOLO JSON: {"title":"1-2 palabras","sub":"máx 5 palabras","pill":"3 palabras separadas por •","feats":["4 cualidades de máx 4 palabras"],"d1":"máx 4 palabras","d2":"máx 4 palabras"}` }], { json: true });
    $("po-ai").textContent = "✨ Que Viernes me sugiera los textos";
    try { const j = JSON.parse(r.text.replace(/```json|```/g, "")); $("po-title").value = j.title || val("po-title"); $("po-sub").value = j.sub || ""; $("po-pill").value = j.pill || ""; $("po-feat").value = (j.feats || []).join("\n"); $("po-d1").value = j.d1 || ""; $("po-d2").value = j.d2 || ""; drawPoster(); toast("¡Textos listos! ✨"); }
    catch { toast(r.ok ? "No entendí la sugerencia, intenta otra vez" : r.text); }
  };
  goStep(1);
}
// ---------- collage ----------
let imgs = [], coR = 1;
function drawCollage() {
  const W = 1080, H = Math.round(W * coR), c = $("co-canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  bgGrad(x, W, H, "#fde7f3", "#f3e8ff"); const t = $("co-title").value.trim(), top = t ? 150 : 30;
  if (t) { x.fillStyle = "#9d174d"; x.textAlign = "center"; x.font = `${fitText(x, t, '"Great Vibes"', 110, W * 0.9)}px "Great Vibes"`; x.fillText(t, W / 2, 115); }
  const n = imgs.length || 4, cols = n <= 2 ? (coR > 1.2 ? 1 : 2) : coR > 1.2 ? 2 : (n <= 4 ? 2 : 3), rows = Math.ceil(n / cols), g = 24;
  const cw = (W - g * (cols + 1)) / cols, ch = (H - top - g * (rows + 1)) / rows;
  for (let i = 0; i < n; i++) { const cx = g + (i % cols) * (cw + g), cy = top + g + Math.floor(i / cols) * (ch + g);
    x.save(); x.shadowColor = "rgba(120,40,90,.25)"; x.shadowBlur = 20; x.fillStyle = "#fff"; x.beginPath(); x.roundRect(cx, cy, cw, ch, 28); x.fill(); x.restore();
    const im = imgs[i]; x.save(); x.beginPath(); x.roundRect(cx + 10, cy + 10, cw - 20, ch - 20, 22); x.clip();
    if (im) { const k = Math.max((cw - 20) / im.width, (ch - 20) / im.height); x.drawImage(im, cx + cw / 2 - im.width * k / 2, cy + ch / 2 - im.height * k / 2, im.width * k, im.height * k); }
    else { x.fillStyle = "#fbe1ee"; x.fillRect(cx, cy, cw, ch); heart(x, cx + cw / 2, cy + ch / 2, 60, "#f9a8d4"); }
    x.restore(); }
}
export function initCollage() {
  $("co-files").onchange = async (e) => { imgs = await Promise.all([...e.target.files].slice(0, 6).map((f) => createImageBitmap(f))); drawCollage(); };
  document.querySelector('[data-b="collage"] .chips').onclick = (e) => { const r = +e.target.dataset.c; if (!r) return; coR = r; e.currentTarget.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target)); drawCollage(); };
  $("co-title").oninput = drawCollage; $("co-save").onclick = () => shareCanvas($("co-canvas"), "viernes-collage");
  drawCollage();
}
