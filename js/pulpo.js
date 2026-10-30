// v1.28: «Antares Pulpo» holográfico. Reemplaza el cerebro en inicio, bloqueo y conversación.
// Manto translúcido con el cerebro verde/rojo dentro, 2 ojos expresivos, 3 corazones (Gemini, cerebro local, sin internet),
// 8 brazos (en inicio son accesos reales), barrido de holograma, proyector. ~30 cps, se pausa en segundo plano o fuera de vista.
const QUIETO = matchMedia("(prefers-reduced-motion: reduce)");
const insts = new Set();
let raf = 0, ult = 0, t0 = performance.now();
// señales compartidas desde la app
let modo = "reposo", hablando = false, voz = 0, tenue = false;
const corazones = { gem: "ok", pc: "off", off: "ok" };
const ANG = [-2.55, -0.6, -2.95, -0.2, 2.6, 0.55, 2.05, 1.1];

function red() {
  const N = [], E = [];
  for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * .92; N.push({ x: Math.cos(a) * r * 1.12, y: Math.sin(a) * r * .9, f: Math.random() * 6.28, izq: Math.cos(a) * r < 0 }); }
  for (let i = 0; i < N.length; i++) { const d = N.map((n, j) => [j, Math.hypot(n.x - N[i].x, n.y - N[i].y)]).sort((a, b) => a[1] - b[1]); for (let k = 1; k <= 3; k++) if (d[k][0] > i) E.push([i, d[k][0]]); }
  return { N, E };
}

export function montar(wrap, opts = {}) {
  const prev = [...insts].find((x) => x.wrap === wrap); if (prev) return prev;
  const cv = opts.canvas || document.createElement("canvas");
  if (!opts.canvas) { cv.className = "pulpo-cv"; cv.setAttribute("aria-hidden", "true"); wrap.prepend(cv); }
  const I = { wrap, cv, cx: cv.getContext("2d"), op: { ...opts }, W: 0, H: 0, dpr: 1, R: 0, HX: 0, HY: 0, LEN: 0, BOB: 0, GX: 0, activo: !opts.manual,
    red: red(), flash: 0, rojoFlash: 0, chispas: [], color: null,
    brazos: ANG.map((a, i) => ({ i, a, e: "idle", luz: 0, pulsos: [], fase: Math.random() * 6.28, pts: [], el: null, id: (opts.brazos || [])[i]?.id })),
    ojo: { x: 0, y: 0, mx: null, my: null, animo: "normal", hasta: 0, rojo: 0, parp: 0, prox: 2 + Math.random() * 3, ultimo: performance.now() } };
  if (opts.brazos) {
    const capa = document.createElement("div"); capa.className = "pulpo-brazos"; wrap.appendChild(capa);
    opts.brazos.forEach((d, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "pulpo-brazo"; b.dataset.e = "idle"; b.dataset.id = d.id; b.textContent = d.n; b.setAttribute("aria-label", d.n + ": " + (d.d || ""));
      b.addEventListener("click", (ev) => { ev.stopPropagation(); tocar(I, i); try { d.abrir && d.abrir(); } catch (e) { console.warn("Antares: brazo", d.id, e); } });
      capa.appendChild(b); I.brazos[i].el = b; });
  }
  const caja = opts.canvas ? cv : wrap;
  const fit = () => { const w = caja.clientWidth, h = caja.clientHeight; if (!w || !h) return; const dpr = Math.min(devicePixelRatio || 1, 2);
    if (w === I.W && h === I.H && dpr === I.dpr) return; I.W = w; I.H = h; I.dpr = dpr; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); medir(I); cuadro(I, performance.now()); };
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(caja); else addEventListener("resize", fit);
  if (opts.mirarToques !== false) wrap.addEventListener("pointerdown", (e) => { const r = wrap.getBoundingClientRect(); mirar(I, e.clientX - r.left, e.clientY - r.top, "normal", 1800); });
  insts.add(I); fit(); andar();
  return I;
}
function medir(I) {
  const { W, H, op } = I;
  if (op.brazos) { I.R = Math.min(W * .15, H * .14); I.HX = W / 2; I.HY = H * .36; I.LEN = Math.min(W * .46, H * .42); }
  else { I.R = Math.min(W, H) * .2; I.HX = W / 2; I.HY = H * .4; I.LEN = Math.min(W, H) * .36; }
}
export function activar(I, on) { if (!I) return; I.activo = !!on; if (on) { andar(); cuadro(I, performance.now()); } }

// ---- señales de la app (mismo contrato que el cerebro anterior) ----
export function setMode(m) { modo = m; andar(); }
export function setSpeaking(on) { hablando = !!on; andar(); }
export function word() { voz = 1; for (const I of insts) { I.flash = Math.min(1, I.flash + .25); const b = I.brazos[(Math.random() * 8) | 0]; b.luz = Math.max(b.luz, .7); } }
export function chunk() { voz = Math.max(voz, .5); }
export function setDim(on) { tenue = !!on; }
export function setCorazones(c) { Object.assign(corazones, c); }
export function setBrazo(I, id, e, alerta = "") {
  if (!I) return; const b = I.brazos.find((x) => x.id === id); if (!b || b.e === e) return;
  b.e = e; if (b.el) { b.el.dataset.e = e; b.el.title = alerta || ""; }
  if (e === "alerta") { pulso(I, b, true, 3); mirarBrazo(I, b, "sorpresa", 2600, true); }
}
export function chispa(I, rojo = false, n = 3) { if (!I) return; I.flash = Math.min(1, I.flash + .45); for (let k = 0; k < n; k++) { const b = I.brazos[(Math.random() * 8) | 0]; pulso(I, b, rojo, 1); } }
export function tono(I, c) { if (!I) return; I.color = c === "error" ? "error" : null; if (c === "error") { I.ojo.rojo = 1; I.ojo.animo = "sorpresa"; I.ojo.hasta = performance.now() + 1200; } }
export function rafaga(I) { if (!I) return; I.color = null; I.ojo.animo = "feliz"; I.ojo.hasta = performance.now() + 1500; I.brazos.forEach((b) => pulso(I, b, false, 1)); I.flash = 1; }

function pulso(I, b, rojo = false, n = 3) { b.luz = 1; for (let k = 0; k < n; k++) b.pulsos.push({ s: 1 + k * .12, v: .018 + Math.random() * .006, rojo }); for (let k = 0; k < 8; k++) I.chispas.push({ x: I.HX, y: I.HY, vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4, a: 1, rojo }); if (I.chispas.length > 80) I.chispas.splice(0, I.chispas.length - 80); }
function tocar(I, i) { const b = I.brazos[i]; pulso(I, b, b.e === "alerta", 4); mirarBrazo(I, b, b.e === "alerta" ? "sorpresa" : "normal", 2500, b.e === "alerta"); try { navigator.vibrate?.(12); } catch { /* */ } }
function mirar(I, x, y, animo = "normal", ms = 2500, rojo = false) { const o = I.ojo; o.mx = x; o.my = y; o.animo = animo; o.hasta = performance.now() + ms; o.ultimo = performance.now(); if (rojo) o.rojo = 1; }
function mirarBrazo(I, b, animo, ms, rojo) { const p = b.pts[b.pts.length - 1]; if (p) mirar(I, p[0], p[1], animo, ms, rojo); }

// ---- dibujo ----
const baseY = (I) => I.HY + I.R * .78 + I.BOB;
function puntos(I, b, t) {
  const N = 18, pts = b.pts; pts.length = 0; const viva = QUIETO.matches ? 0 : 1, lado = Math.cos(b.a);
  const ag = (modo === "escuchando" ? .25 : 0) + (hablando ? .35 * voz : 0);
  let x = I.HX + lado * I.R * .62 + I.GX, y = baseY(I) + Math.sin(b.a) * I.R * .12, dir;
  const paso = I.LEN / N, giro = lado >= 0 ? 1 : -1;
  for (let k = 0; k <= N; k++) {
    pts.push([x, y]); const u = k / N;
    dir = b.a + viva * (Math.sin(t * (1.2 + ag * 2) + b.fase + u * 3) * (.45 + ag) * u + Math.sin(t * .6 + b.fase * 2) * .14) + giro * Math.max(0, u - .62) ** 2 * (7 + 2 * Math.sin(t * .8 + b.fase));
    x += Math.cos(dir) * paso; y += Math.sin(dir) * paso * .92;
  }
  return pts;
}
function brazo(I, b, t) {
  const cx = I.cx, p = puntos(I, b, t), roja = b.e === "alerta" || I.color === "error", [r, g, bl] = roja ? [255, 45, 74] : [0, 255, 200], N = p.length - 1, R = I.R;
  const l = Math.max(b.luz, b.e === "pensando" ? .55 : roja ? .8 : .2) * (tenue ? .5 : 1);
  cx.lineCap = "round";
  for (let pase = 0; pase < 2; pase++) for (let k = 0; k < N; k++) {
    const u = k / N, ancho = (1 - u) ** 1.2 * R * .36 + 1.2;
    cx.strokeStyle = pase ? `rgba(${r},${g},${bl},${.07 + .16 * l})` : `rgba(${r},${g},${bl},${.03 + .07 * l})`; cx.lineWidth = pase ? ancho : ancho * 1.7;
    cx.beginPath(); cx.moveTo(p[k][0], p[k][1]); cx.lineTo(p[k + 1][0], p[k + 1][1]); cx.stroke();
  }
  const iz = [], de = [];
  for (let k = 0; k <= N; k++) { const u = k / N, w = ((1 - u) ** 1.2 * R * .36 + 1.2) / 2, q = p[Math.min(N, k + 1)], o = p[Math.max(0, k - 1)], dx = q[0] - o[0], dy = q[1] - o[1], m = Math.hypot(dx, dy) || 1; iz.push([p[k][0] - dy / m * w, p[k][1] + dx / m * w]); de.push([p[k][0] + dy / m * w, p[k][1] - dx / m * w]); }
  cx.strokeStyle = `rgba(${r},${g},${bl},${.45 + .45 * l})`; cx.lineWidth = 1;
  for (const s of [iz, de]) { cx.beginPath(); s.forEach(([x, y], k) => (k ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.stroke(); }
  cx.strokeStyle = `rgba(${r},${g},${bl},${.14 + .2 * l})`;
  for (let k = 1; k < N - 2; k += 2) { cx.beginPath(); cx.moveTo(...iz[k]); cx.lineTo(...de[k]); cx.stroke(); }
  if (R > 22) for (let k = 2; k < N; k++) { const u = k / N, rr = Math.max(.8, (1 - u) * R * .055); cx.strokeStyle = `rgba(${roja ? "255,120,140" : "200,255,240"},${.35 + .45 * l})`; cx.beginPath(); cx.arc((p[k][0] * 2 + de[k][0]) / 3, (p[k][1] * 2 + de[k][1]) / 3, rr, 0, 6.28); cx.stroke(); }
  b.pulsos = b.pulsos.filter((q) => (q.s -= q.v) > 0);
  for (const q of b.pulsos) {
    const f = q.s * N, k = Math.min(N - 1, f | 0), w = f - k, x = p[k][0] + (p[k + 1][0] - p[k][0]) * w, y = p[k][1] + (p[k + 1][1] - p[k][1]) * w;
    const gr = cx.createRadialGradient(x, y, 0, x, y, 12); gr.addColorStop(0, `rgba(${q.rojo ? "255,90,110" : "200,255,240"},1)`); gr.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = gr; cx.beginPath(); cx.arc(x, y, 12, 0, 6.28); cx.fill();
    if (q.s - q.v <= 0) { I.flash = Math.min(1, I.flash + .5); if (q.rojo) I.rojoFlash = 1; }
  }
  b.luz *= .965;
}
function proyector(I, t) {
  const cx = I.cx, py = Math.min(I.H - 8, baseY(I) - I.BOB + I.LEN * 1.05), rx = Math.min(I.W * .32, I.R * 1.6), top = I.HY - I.R * 1.6;
  const g = cx.createLinearGradient(0, py, 0, top); g.addColorStop(0, "rgba(0,255,200,.18)"); g.addColorStop(1, "rgba(0,255,200,0)");
  cx.fillStyle = g; cx.beginPath(); cx.moveTo(I.HX - rx * .55, py); cx.lineTo(I.HX - rx * 2.2, top); cx.lineTo(I.HX + rx * 2.2, top); cx.lineTo(I.HX + rx * .55, py); cx.fill();
  for (let k = 0; k < 3; k++) { cx.strokeStyle = `rgba(0,255,200,${.45 - k * .13})`; cx.lineWidth = 1.3; cx.beginPath(); cx.ellipse(I.HX, py - k * 4, rx * (.55 + k * .12), rx * (.1 + k * .03), 0, 0, 6.28); cx.stroke(); }
  const gb = cx.createRadialGradient(I.HX, py, 0, I.HX, py, rx * .6); gb.addColorStop(0, `rgba(180,255,240,${.45 + .2 * Math.sin(t * 5)})`); gb.addColorStop(1, "rgba(0,0,0,0)");
  cx.fillStyle = gb; cx.beginPath(); cx.ellipse(I.HX, py, rx * .6, rx * .14, 0, 0, 6.28); cx.fill();
}
function corazon(cx, x, y, s, e, t, k) {
  const ok = e === "ok", rev = e === "rev", lat = ok ? 1 + .18 * Math.max(0, Math.sin(t * 7 + k * 2)) ** 8 : rev ? 1 + .08 * Math.sin(t * 4) : 1, c = ok ? "0,255,156" : rev ? "255,200,74" : "120,140,135";
  s *= lat; cx.save(); cx.translate(x, y); cx.scale(s, s); cx.beginPath(); cx.moveTo(0, .35); cx.bezierCurveTo(-1, -.25, -.5, -1, 0, -.45); cx.bezierCurveTo(.5, -1, 1, -.25, 0, .35);
  cx.fillStyle = `rgba(${c},${ok ? .75 : .35})`; cx.shadowColor = `rgb(${c})`; cx.shadowBlur = ok ? 10 : 0; cx.fill(); cx.restore();
}
function cabeza(I, t) {
  const cx = I.cx, R = I.R, cy = I.HY - R * .25 + I.BOB, mx = I.HX + I.GX, rx = R * 1.15, ry = R * 1.35;
  const habla = hablando ? voz : 0, lat = 1 + (QUIETO.matches ? 0 : .02 * Math.sin(t * 6.9)) + habla * .05;
  const roja = I.rojoFlash > .1 || I.color === "error", fl = I.flash * (tenue ? .5 : 1);
  const forma = () => { cx.beginPath(); cx.moveTo(mx - rx * .62, cy + ry * .78); cx.bezierCurveTo(mx - rx * 1.25, cy + ry * .2, mx - rx * 1.05, cy - ry * 1.02, mx, cy - ry * lat); cx.bezierCurveTo(mx + rx * 1.05, cy - ry * 1.02, mx + rx * 1.25, cy + ry * .2, mx + rx * .62, cy + ry * .78); cx.quadraticCurveTo(mx, cy + ry * .98, mx - rx * .62, cy + ry * .78); cx.closePath(); };
  const g = cx.createRadialGradient(mx, cy - ry * .2, R * .1, mx, cy, ry * 1.2);
  g.addColorStop(0, `rgba(0,255,200,${.1 + .2 * fl + .15 * habla})`); g.addColorStop(.7, `rgba(${roja ? "255,45,74" : "0,200,170"},${.07 + .2 * Math.max(fl, I.rojoFlash)})`); g.addColorStop(1, "rgba(0,255,200,.02)");
  forma(); cx.fillStyle = g; cx.fill();
  cx.save(); forma(); cx.clip();
  cx.strokeStyle = "rgba(0,255,200,.16)"; cx.lineWidth = 1;
  for (let k = -3; k <= 3; k++) { cx.beginPath(); cx.ellipse(mx, cy, Math.abs(k) / 3 * rx * 1.1 + .1, ry * 1.05, 0, 0, 6.28); cx.stroke(); }
  for (let k = -4; k <= 4; k++) { const yy = cy + k / 4.5 * ry; cx.beginPath(); cx.moveTo(mx - rx * 1.3, yy); cx.quadraticCurveTo(mx, yy + R * .18, mx + rx * 1.3, yy); cx.stroke(); }
  const bx = mx, by = cy - ry * .28, br = R * .62 * lat, { N, E } = I.red, P = N.map((n) => [bx + n.x * br, by + n.y * br]);
  const esc = modo === "escuchando" ? .25 : 0, pen = modo === "pensando" ? .3 * (.5 + .5 * Math.sin(t * 8)) : 0;
  for (const [i, j] of E) { const iz = N[i].izq && N[j].izq; cx.strokeStyle = iz ? `rgba(255,45,74,${.25 + .35 * fl + pen})` : `rgba(0,255,156,${.25 + .4 * fl + esc + pen})`; cx.beginPath(); cx.moveTo(...P[i]); cx.lineTo(...P[j]); cx.stroke(); }
  N.forEach((n, i) => { const v = .5 + .5 * Math.sin(t * (2 + esc * 6) + n.f); cx.fillStyle = n.izq ? `rgba(255,${60 + 60 * v},90,${.5 + .5 * v})` : `rgba(${90 + 120 * v},255,190,${.5 + .5 * v})`; cx.beginPath(); cx.arc(P[i][0], P[i][1], Math.max(.8, R / 60) * (1.1 + 1.2 * v), 0, 6.28); cx.fill(); });
  ["gem", "pc", "off"].forEach((id, k) => corazon(cx, mx + (k - 1) * R * .32, cy + ry * .55, R * .13, corazones[id], t, k));
  cx.restore();
  forma(); cx.strokeStyle = `rgba(${roja ? "255,140,160" : "120,255,225"},${.55 + .4 * fl})`; cx.lineWidth = 1.6; cx.shadowColor = roja ? "#ff2d4a" : "#00ffc8"; cx.shadowBlur = 14; cx.stroke(); cx.shadowBlur = 0;
  ojos(I, mx, cy + ry * .3, rx * .52, t);
  for (let k = I.chispas.length - 1; k >= 0; k--) { const c = I.chispas[k]; c.x += c.vx; c.y += c.vy; c.a *= .93; if (c.a < .03) { I.chispas.splice(k, 1); continue; } cx.fillStyle = `rgba(${c.rojo ? "255,45,74" : "0,255,200"},${c.a})`; cx.fillRect(c.x, c.y, 2, 2); }
  I.flash *= .94; I.rojoFlash *= .96;
}
function ojos(I, mx, ey, sep, t) {
  const cx = I.cx, O = I.ojo, now = performance.now(), R = I.R;
  if (now > O.hasta) { O.mx = O.my = null; O.animo = modo === "escuchando" || hablando ? "atento" : now - O.ultimo > 6000 && modo === "reposo" ? "feliz" : "normal"; }
  if (t > O.prox) { O.parp = 1; O.prox = t + 2.5 + Math.random() * 4; if (Math.random() < .2) O.prox = t + .35; }
  const cierre = O.parp > 0 ? Math.sin(O.parp * Math.PI) : 0; O.parp = Math.max(0, O.parp - .18);
  const tx = O.mx == null ? (modo === "escuchando" ? 0 : Math.sin(t * .5) * .35) : Math.max(-1, Math.min(1, (O.mx - mx) / (I.W * .4)));
  const ty = O.my == null ? (modo === "escuchando" ? .1 : Math.sin(t * .37) * .2) : Math.max(-1, Math.min(1, (O.my - ey) / (I.H * .3)));
  O.x += (tx - O.x) * .25; O.y += (ty - O.y) * .25; O.rojo *= .985;
  const rojo = O.rojo > .15 || I.rojoFlash > .3 || I.color === "error", sorpresa = O.animo === "sorpresa", feliz = O.animo === "feliz", atento = O.animo === "atento";
  const rr = R * (sorpresa ? .2 : atento ? .18 : .16) * (1 + (hablando ? voz * .08 : 0)), col = rojo ? "255,45,74" : "0,255,200";
  for (const s of [-1, 1]) {
    const ex = mx + s * sep;
    const ge = cx.createRadialGradient(ex, ey, 0, ex, ey, rr * 2); ge.addColorStop(0, `rgba(${col},.55)`); ge.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = ge; cx.beginPath(); cx.arc(ex, ey, rr * 2, 0, 6.28); cx.fill();
    if (feliz && cierre < .5) { cx.strokeStyle = `rgba(${col},.95)`; cx.lineWidth = Math.max(1.5, R * .06); cx.lineCap = "round"; cx.beginPath(); cx.arc(ex + O.x * rr * .3, ey + rr * .35, rr * .85, Math.PI * 1.15, Math.PI * 1.85); cx.stroke(); continue; }
    const abierto = Math.max(.06, 1 - cierre);
    cx.save(); cx.beginPath(); cx.ellipse(ex, ey, rr, rr * abierto, 0, 0, 6.28); cx.clip();
    cx.fillStyle = "rgba(225,255,248,.92)"; cx.fillRect(ex - rr, ey - rr, rr * 2, rr * 2);
    const px = ex + O.x * rr * .45, py = ey + O.y * rr * .4, pr = rr * (sorpresa ? .38 : .52);
    cx.fillStyle = rojo ? "rgb(200,20,50)" : "rgb(0,150,120)"; cx.beginPath(); cx.arc(px, py, pr, 0, 6.28); cx.fill();
    cx.fillStyle = "rgba(2,10,10,.95)"; cx.beginPath(); cx.arc(px, py, pr * .5, 0, 6.28); cx.fill();
    cx.fillStyle = "rgba(255,255,255,.9)"; cx.beginPath(); cx.arc(px - pr * .35, py - pr * .35, pr * .22, 0, 6.28); cx.fill();
    cx.restore();
    if (sorpresa) { cx.strokeStyle = `rgba(${col},.8)`; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(ex, ey - rr * 1.6, rr * .8, Math.PI * 1.2, Math.PI * 1.8); cx.stroke(); }
  }
}
function holo(I, t) {
  const cx = I.cx, top = I.HY - I.R * 2, bot = Math.min(I.H, baseY(I) + I.LEN);
  cx.fillStyle = "rgba(0,0,0,.18)"; for (let y = Math.max(0, top); y < bot; y += 4) cx.fillRect(0, y, I.W, 1.5);
  if (!QUIETO.matches) { const y = top + ((t * 90) % (bot - top + 80)) - 40, g = cx.createLinearGradient(0, y - 30, 0, y + 30); g.addColorStop(0, "rgba(0,255,200,0)"); g.addColorStop(.5, "rgba(120,255,230,.12)"); g.addColorStop(1, "rgba(0,255,200,0)"); cx.fillStyle = g; cx.fillRect(0, y - 30, I.W, 60); }
}
function etiquetas(I) {
  const L = I.brazos.filter((b) => b.el); if (!L.length) return;
  for (const b of L) { const p = b.pts[b.pts.length - 1]; if (!p) continue; const w = b.el.offsetWidth, h = b.el.offsetHeight; b.lw = w; b.lh = h; b.lx = Math.max(w / 2 + 4, Math.min(I.W - w / 2 - 4, p[0])); b.ly = Math.max(h / 2 + 2, Math.min(I.H - h / 2 - 2, p[1])); }
  for (let pase = 0; pase < 6; pase++) for (const a of L) for (const o of L) {
    if (a === o) continue; const dx = Math.abs(a.lx - o.lx) - (a.lw + o.lw) / 2 - 3, dy = Math.abs(a.ly - o.ly) - (a.lh + o.lh) / 2 - 3;
    if (dx < 0 && dy < 0) { if (dx > dy) { const s = a.lx <= o.lx ? -1 : 1; a.lx += s * (-dx / 2 + .5); o.lx -= s * (-dx / 2 + .5); } else { const s = a.ly <= o.ly ? -1 : 1; a.ly += s * (-dy / 2 + .5); o.ly -= s * (-dy / 2 + .5); } }
    for (const b of [a, o]) { b.lx = Math.max(b.lw / 2 + 4, Math.min(I.W - b.lw / 2 - 4, b.lx)); b.ly = Math.max(b.lh / 2 + 2, Math.min(I.H - b.lh / 2 - 2, b.ly)); }
  }
  for (const b of L) b.el.style.transform = `translate(${(b.lx - b.lw / 2).toFixed(1)}px,${(b.ly - b.lh / 2).toFixed(1)}px)`;
}
function calma(I, now) {
  // en reposo, un brazo sin estado real «piensa» de vez en cuando (sin alertas inventadas)
  if (!I.op.brazos || now < (I.tCalma || 0)) return; I.tCalma = now + 3000 + Math.random() * 4000;
  const b = I.brazos[(Math.random() * 8) | 0]; if (b.e === "idle") { b.luz = .6; if (!QUIETO.matches) pulso(I, b, false, 1); }
}
function cuadro(I, now) {
  if (!I.W) return;
  const t = (now - t0) / 1000, cx = I.cx, mueve = !QUIETO.matches;
  cx.setTransform(I.dpr, 0, 0, I.dpr, 0, 0); cx.clearRect(0, 0, I.W, I.H);
  I.BOB = mueve ? Math.sin(t * 1.4) * I.R * .06 : 0; I.GX = mueve && Math.random() < .02 ? (Math.random() - .5) * 5 : 0;
  cx.globalAlpha = (mueve && Math.random() < .03 ? .75 : 1) * (tenue ? .7 : 1);
  proyector(I, t); cx.globalCompositeOperation = "lighter"; for (const b of I.brazos) brazo(I, b, t); cx.globalCompositeOperation = "source-over";
  cabeza(I, t); holo(I, t); cx.globalAlpha = 1; etiquetas(I); calma(I, now);
}
const visible = (I) => I.activo && I.wrap.isConnected && I.wrap.offsetParent !== null && I.W > 0 && getComputedStyle(I.cv).visibility !== "hidden";
function bucle(now) {
  raf = 0; if (document.hidden) return;
  const vis = [...insts].filter(visible); if (!vis.length) { setTimeout(andar, 700); return; } // nada a la vista: revisa despacio
  raf = requestAnimationFrame(bucle); if (now - ult < (QUIETO.matches ? 120 : 32)) return; ult = now; // movimiento reducido: ~8 cps, sin ondular
  voz *= hablando ? .9 : .8; if (hablando) voz = Math.max(voz, .25 + .2 * Math.sin(now / 90));
  for (const I of vis) cuadro(I, now);
}
function andar() { if (!raf && !document.hidden) raf = requestAnimationFrame(bucle); }
document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else andar(); });
QUIETO.addEventListener?.("change", andar);
// compatibilidad con el contrato del cerebro anterior
export function setCounts() { /* el pulpo no muestra conteos */ }
export function setLabels() { /* las etiquetas son los brazos */ }
