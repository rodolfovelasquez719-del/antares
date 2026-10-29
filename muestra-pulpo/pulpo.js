// Muestra «Antares Pulpo»: cabeza = cerebro verde/rojo, 8 brazos que trabajan solos, 3 corazones.
// No guarda ni muestra claves: la clave de la PC se lee (igual que la app) de la app padre o de lo guardado en el mismo sitio, solo para el encabezado.
const BRAZOS = [
  { id: "rutas", n: "Rutas", d: "Planea viajes en carro con desvíos, peajes y avisos de tránsito.", l: ["Calcula la mejor ruta y la hora de salida", "Avisa de presas y cierres", "Abre Waze o Google Maps"] },
  { id: "salud", n: "Salud de ANTARES", d: "Vigila la PC ANTARES: temperatura, disco, memoria y el cerebro local.", l: ["Revisa si Ollama responde", "Avisa si el disco se llena", "Muestra el estado en «Mi compu»"] },
  { id: "noticias", n: "Noticias", d: "Resume las noticias del día que a usted le interesan.", l: ["Titulares de Costa Rica y el mundo", "Resumen corto en voz", "Solo fuentes confiables"] },
  { id: "estudio", n: "Estudio", d: "Simuladores y repasos para estudiar a su ritmo.", l: ["Preguntas tipo examen", "Explica paso a paso", "Lleva su progreso"] },
  { id: "record", n: "Recordatorios", d: "Le recuerda citas, pagos y tareas a la hora justa.", l: ["Avisos con notificación", "Repetición diaria o semanal", "Se dicen por voz"] },
  { id: "juegos", n: "Juegos", d: "Damas, trivia y retos para descansar la mente.", l: ["Damas contra Antares", "Trivia con niveles", "Juegos rápidos"] },
  { id: "vision", n: "Visión", d: "Mira por la cámara o una foto y le explica lo que ve.", l: ["Lee textos y etiquetas", "Describe objetos", "Ayuda con documentos"] },
  { id: "memoria", n: "Memoria", d: "Recuerda lo que usted le pide guardar, solo en este teléfono.", l: ["Datos y preferencias", "Notas rápidas", "Se borra cuando usted quiera"] },
];
const EST = { idle: "en reposo", pensando: "pensando…", alerta: "¡alerta!" };
const QUIETO = matchMedia("(prefers-reduced-motion: reduce)");
const cv = document.getElementById("c"), cx = cv.getContext("2d");
const $ = (s) => document.querySelector(s);
let W = 0, H = 0, DPR = 1, HX = 0, HY = 0, R = 0, LEN = 0, sel = -1, t0 = performance.now();
const brazos = BRAZOS.map((b, i) => ({ ...b, i, e: "idle", luz: 0, hasta: 0, pulsos: [], fase: Math.random() * 6.28, pts: [] }));
const nodos = [], aristas = [], chispas = [];
let flash = 0, rojoFlash = 0;

// --- cabeza: red de nodos (mismo estilo que el cerebro de la app) ---
function armarCerebro() {
  nodos.length = aristas.length = 0;
  for (let i = 0; i < 64; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * .92; nodos.push({ x: Math.cos(a) * r * 1.12, y: Math.sin(a) * r * .9, f: Math.random() * 6.28, izq: Math.cos(a) * r < 0 }); }
  for (let i = 0; i < nodos.length; i++) { const d = nodos.map((n, j) => [j, Math.hypot(n.x - nodos[i].x, n.y - nodos[i].y)]).sort((a, b) => a[1] - b[1]); for (let k = 1; k <= 3; k++) if (d[k][0] > i) aristas.push([i, d[k][0]]); }
}
function medir() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  HX = W / 2; HY = H * (W < 600 ? .41 : .40); R = Math.min(W, H) * (W < 600 ? .16 : .12); LEN = Math.min(W * .5, H * .36);
}
// ángulo base de cada brazo (sale de la base del manto)
const ang = (i) => [-2.55, -0.6, -2.95, -0.2, 2.6, 0.55, 2.05, 1.1][i];
let BOB = 0, GX = 0;
const baseY = () => HY + R * .78 + BOB;
function puntos(b, t) {
  const a = ang(b.i), N = 18, pts = b.pts; pts.length = 0; const viva = QUIETO.matches ? 0 : 1;
  const lado = Math.cos(a);
  let x = HX + lado * R * .62 + GX, y = baseY() + Math.sin(a) * R * .12, dir = a;
  const paso = LEN / N, giro = lado >= 0 ? 1 : -1;
  for (let k = 0; k <= N; k++) {
    pts.push([x, y]);
    const u = k / N;
    dir = a + viva * (Math.sin(t * 1.2 + b.fase + u * 3) * .45 * u + Math.sin(t * .6 + b.fase * 2) * .14)
      + giro * Math.max(0, u - .62) ** 2 * (7 + 2 * Math.sin(t * .8 + b.fase)) ; // punta enroscada
    x += Math.cos(dir) * paso; y += Math.sin(dir) * paso * .92;
  }
  return pts;
}
function colorBrazo(b) { return b.e === "alerta" ? [255, 45, 74] : [0, 255, 200]; }
function dibujarBrazo(b, t) {
  const p = puntos(b, t), [r, g, bl] = colorBrazo(b), N = p.length - 1, l = Math.max(b.luz, b.e === "pensando" ? .55 : b.e === "alerta" ? .8 : .2);
  cx.lineCap = "round";
  // cuerpo translúcido: halo + núcleo + bordes de malla
  for (let pase = 0; pase < 2; pase++) for (let k = 0; k < N; k++) {
    const u = k / N, ancho = (1 - u) ** 1.2 * R * .36 + 1.2;
    cx.strokeStyle = pase ? `rgba(${r},${g},${bl},${.07 + .16 * l})` : `rgba(${r},${g},${bl},${.03 + .07 * l})`;
    cx.lineWidth = pase ? ancho : ancho * 1.7;
    cx.beginPath(); cx.moveTo(p[k][0], p[k][1]); cx.lineTo(p[k + 1][0], p[k + 1][1]); cx.stroke();
  }
  // contornos (alambre) y anillos de malla
  const izq = [], der = [];
  for (let k = 0; k <= N; k++) { const u = k / N, w = ((1 - u) ** 1.2 * R * .36 + 1.2) / 2, q = p[Math.min(N, k + 1)], o = p[Math.max(0, k - 1)], dx = q[0] - o[0], dy = q[1] - o[1], m = Math.hypot(dx, dy) || 1; izq.push([p[k][0] - dy / m * w, p[k][1] + dx / m * w]); der.push([p[k][0] + dy / m * w, p[k][1] - dx / m * w]); }
  cx.strokeStyle = `rgba(${r},${g},${bl},${.45 + .45 * l})`; cx.lineWidth = 1;
  for (const lado of [izq, der]) { cx.beginPath(); lado.forEach(([x, y], k) => (k ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.stroke(); }
  cx.strokeStyle = `rgba(${r},${g},${bl},${.14 + .2 * l})`;
  for (let k = 1; k < N - 2; k += 2) { cx.beginPath(); cx.moveTo(...izq[k]); cx.lineTo(...der[k]); cx.stroke(); }
  // ventosas en un costado
  for (let k = 2; k < N; k++) { const u = k / N, rr = Math.max(.8, (1 - u) * R * .055); const [x, y] = [(p[k][0] * 2 + der[k][0]) / 3, (p[k][1] * 2 + der[k][1]) / 3]; cx.strokeStyle = `rgba(${b.e === "alerta" ? "255,120,140" : "200,255,240"},${.35 + .45 * l})`; cx.beginPath(); cx.arc(x, y, rr, 0, 6.28); cx.stroke(); }
  b.pulsos = b.pulsos.filter((q) => (q.s -= q.v) > 0);
  for (const q of b.pulsos) {
    const f = q.s * N, k = Math.min(N - 1, f | 0), w = f - k, x = p[k][0] + (p[k + 1][0] - p[k][0]) * w, y = p[k][1] + (p[k + 1][1] - p[k][1]) * w;
    const gr = cx.createRadialGradient(x, y, 0, x, y, 14); gr.addColorStop(0, `rgba(${q.rojo ? "255,90,110" : "200,255,240"},1)`); gr.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = gr; cx.beginPath(); cx.arc(x, y, 14, 0, 6.28); cx.fill();
    if (q.s - q.v <= 0) { flash = Math.min(1, flash + .5); if (q.rojo) rojoFlash = 1; }
  }
  b.luz *= .965;
}
function proyector(t) {
  const py = Math.min(H - 70, baseY() - BOB + LEN * 1.2), rx = Math.min(W * .32, R * 1.6);
  const g = cx.createLinearGradient(0, py, 0, HY - R * 1.6);
  g.addColorStop(0, "rgba(0,255,200,.22)"); g.addColorStop(1, "rgba(0,255,200,0)");
  cx.fillStyle = g; cx.beginPath(); cx.moveTo(HX - rx * .55, py); cx.lineTo(HX - rx * 2.2, HY - R * 1.6); cx.lineTo(HX + rx * 2.2, HY - R * 1.6); cx.lineTo(HX + rx * .55, py); cx.fill();
  for (let k = 0; k < 3; k++) { cx.strokeStyle = `rgba(0,255,200,${.5 - k * .14})`; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(HX, py + k * 5, rx * (.55 + k * .12), rx * (.1 + k * .03), 0, 0, 6.28); cx.stroke(); }
  const gb = cx.createRadialGradient(HX, py, 0, HX, py, rx * .6); gb.addColorStop(0, `rgba(180,255,240,${.5 + .2 * Math.sin(t * 5)})`); gb.addColorStop(1, "rgba(0,0,0,0)");
  cx.fillStyle = gb; cx.beginPath(); cx.ellipse(HX, py, rx * .6, rx * .14, 0, 0, 6.28); cx.fill();
}
function corazonCanvas(x, y, s, e, t, k) {
  const ok = e === "ok", rev = e === "rev", lat = ok ? 1 + .18 * Math.max(0, Math.sin(t * 7 + k * 2)) ** 8 : rev ? 1 + .08 * Math.sin(t * 4) : 1;
  const c = ok ? "0,255,156" : rev ? "255,200,74" : "120,140,135";
  s *= lat; cx.save(); cx.translate(x, y); cx.scale(s, s);
  cx.beginPath(); cx.moveTo(0, .35); cx.bezierCurveTo(-1, -.25, -.5, -1, 0, -.45); cx.bezierCurveTo(.5, -1, 1, -.25, 0, .35);
  cx.fillStyle = `rgba(${c},${ok ? .75 : .35})`; cx.shadowColor = `rgb(${c})`; cx.shadowBlur = ok ? 12 : 0; cx.fill(); cx.restore();
}
function dibujarCabeza(t) {
  const cy = HY - R * .25 + BOB, mx = HX + GX, rx = R * 1.15, ry = R * 1.35, lat = 1 + .02 * Math.sin(t * 6.9) * (QUIETO.matches ? 0 : 1);
  // manto translúcido (forma de pulpo: domo con base más angosta)
  const forma = () => { cx.beginPath(); cx.moveTo(mx - rx * .62, cy + ry * .78); cx.bezierCurveTo(mx - rx * 1.25, cy + ry * .2, mx - rx * 1.05, cy - ry * 1.02, mx, cy - ry * lat); cx.bezierCurveTo(mx + rx * 1.05, cy - ry * 1.02, mx + rx * 1.25, cy + ry * .2, mx + rx * .62, cy + ry * .78); cx.quadraticCurveTo(mx, cy + ry * .98, mx - rx * .62, cy + ry * .78); cx.closePath(); };
  const g = cx.createRadialGradient(mx, cy - ry * .2, R * .1, mx, cy, ry * 1.2);
  g.addColorStop(0, `rgba(0,255,200,${.10 + .2 * flash})`); g.addColorStop(.7, `rgba(${rojoFlash > .1 ? "255,45,74" : "0,200,170"},${.07 + .2 * Math.max(flash, rojoFlash)})`); g.addColorStop(1, "rgba(0,255,200,.02)");
  forma(); cx.fillStyle = g; cx.fill();
  cx.save(); forma(); cx.clip();
  // malla (alambre): meridianos y paralelos
  cx.strokeStyle = "rgba(0,255,200,.16)"; cx.lineWidth = 1;
  for (let k = -3; k <= 3; k++) { cx.beginPath(); cx.ellipse(mx, cy, Math.abs(k) / 3 * rx * 1.1 + .1, ry * 1.05, 0, 0, 6.28); cx.stroke(); }
  for (let k = -4; k <= 4; k++) { cx.beginPath(); const yy = cy + k / 4.5 * ry; cx.moveTo(mx - rx * 1.3, yy); cx.quadraticCurveTo(mx, yy + R * .18, mx + rx * 1.3, yy); cx.stroke(); }
  // cerebro dentro del manto
  const bx = mx, by = cy - ry * .28, br = R * .62;
  const P = nodos.map((n) => [bx + n.x * br * lat, by + n.y * br * lat]);
  for (const [i, j] of aristas) { const iz = nodos[i].izq && nodos[j].izq; cx.strokeStyle = iz ? `rgba(255,45,74,${.25 + .35 * flash})` : `rgba(0,255,156,${.25 + .4 * flash})`; cx.beginPath(); cx.moveTo(...P[i]); cx.lineTo(...P[j]); cx.stroke(); }
  nodos.forEach((n, i) => { const v = .5 + .5 * Math.sin(t * 2 + n.f); cx.fillStyle = n.izq ? `rgba(255,${60 + 60 * v},90,${.5 + .5 * v})` : `rgba(${90 + 120 * v},255,190,${.5 + .5 * v})`; cx.beginPath(); cx.arc(P[i][0], P[i][1], 1.1 + 1.2 * v, 0, 6.28); cx.fill(); });
  // 3 corazones dentro del cuerpo
  ["cz-gem", "cz-pc", "cz-off"].forEach((id, k) => corazonCanvas(mx + (k - 1) * R * .32, cy + ry * .5, R * .13, document.getElementById(id).dataset.e, t, k));
  cx.restore();
  forma(); cx.strokeStyle = `rgba(120,255,225,${.55 + .4 * flash})`; cx.lineWidth = 1.6; cx.shadowColor = "#00ffc8"; cx.shadowBlur = 14; cx.stroke(); cx.shadowBlur = 0;
  dibujarOjos(mx, cy + ry * .3, rx * .52, t);
  for (let k = chispas.length - 1; k >= 0; k--) { const c = chispas[k]; c.x += c.vx; c.y += c.vy; c.a *= .93; if (c.a < .03) { chispas.splice(k, 1); continue; } cx.fillStyle = `rgba(${c.rojo ? "255,45,74" : "0,255,200"},${c.a})`; cx.fillRect(c.x, c.y, 2, 2); }
  flash *= .94; rojoFlash *= .96;
}
// --- ojos expresivos: parpadean, siguen el brazo activo o el toque, se sorprenden con alertas, sonríen en reposo ---
const OJO = { x: 0, y: 0, mx: null, my: null, animo: "normal", hasta: 0, rojo: 0, parp: 0, prox: 2 + Math.random() * 3, ultimo: performance.now() };
function mirar(x, y, animo = "normal", ms = 2500, rojo = false) { OJO.mx = x; OJO.my = y; OJO.animo = animo; OJO.hasta = performance.now() + ms; OJO.ultimo = performance.now(); if (rojo) OJO.rojo = 1; }
function mirarBrazo(b, animo, ms, rojo) { const p = b.pts[b.pts.length - 1]; if (p) mirar(p[0], p[1], animo, ms, rojo); }
function dibujarOjos(mx, ey, sep, t) {
  const now = performance.now();
  if (now > OJO.hasta) { OJO.mx = OJO.my = null; OJO.animo = now - OJO.ultimo > 5000 ? "feliz" : "normal"; }
  // parpadeo de vez en cuando (a veces doble)
  if (t > OJO.prox) { OJO.parp = 1; OJO.n = (OJO.n || 0) + 1; OJO.prox = t + 2.5 + Math.random() * 4; if (Math.random() < .2) OJO.prox = t + .35; }
  const cierre = OJO.parp > 0 ? Math.sin(OJO.parp * Math.PI) : 0; OJO.parp = Math.max(0, OJO.parp - .18);
  // dirección de la mirada (suavizada); sin objetivo, mira alrededor despacio
  const tx = OJO.mx == null ? Math.sin(t * .5) * .35 : Math.max(-1, Math.min(1, (OJO.mx - mx) / (W * .4)));
  const ty = OJO.my == null ? Math.sin(t * .37) * .2 : Math.max(-1, Math.min(1, (OJO.my - ey) / (H * .3)));
  OJO.x += (tx - OJO.x) * .25; OJO.y += (ty - OJO.y) * .25;
  OJO.rojo *= .985; const rojo = OJO.rojo > .15 || rojoFlash > .3;
  const sorpresa = OJO.animo === "sorpresa", feliz = OJO.animo === "feliz";
  const rr = R * (sorpresa ? .2 : .16), col = rojo ? "255,45,74" : "0,255,200";
  for (const s of [-1, 1]) {
    const ex = mx + s * sep;
    const ge = cx.createRadialGradient(ex, ey, 0, ex, ey, rr * 2); ge.addColorStop(0, `rgba(${col},.55)`); ge.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = ge; cx.beginPath(); cx.arc(ex, ey, rr * 2, 0, 6.28); cx.fill();
    const abierto = Math.max(.06, (1 - cierre) * (feliz ? .45 : 1));
    if (feliz && cierre < .5) { // ojos sonrientes (arco ^)
      cx.strokeStyle = `rgba(${col},.95)`; cx.lineWidth = R * .06; cx.lineCap = "round"; cx.beginPath(); cx.arc(ex + OJO.x * rr * .3, ey + rr * .35, rr * .85, Math.PI * 1.15, Math.PI * 1.85); cx.stroke(); continue;
    }
    cx.save(); cx.beginPath(); cx.ellipse(ex, ey, rr, rr * abierto, 0, 0, 6.28); cx.clip();
    cx.fillStyle = "rgba(225,255,248,.92)"; cx.fillRect(ex - rr, ey - rr, rr * 2, rr * 2);
    const px = ex + OJO.x * rr * .45, py = ey + OJO.y * rr * .4, pr = rr * (sorpresa ? .38 : .52);
    cx.fillStyle = `rgba(${rojo ? "200,20,50" : "0,150,120"},1)`; cx.beginPath(); cx.arc(px, py, pr, 0, 6.28); cx.fill();
    cx.fillStyle = "rgba(2,10,10,.95)"; cx.beginPath(); cx.arc(px, py, pr * .5, 0, 6.28); cx.fill();
    cx.fillStyle = "rgba(255,255,255,.9)"; cx.beginPath(); cx.arc(px - pr * .35, py - pr * .35, pr * .22, 0, 6.28); cx.fill();
    cx.restore();
    if (sorpresa) { cx.strokeStyle = `rgba(${col},.8)`; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(ex, ey - rr * 1.6, rr * .8, Math.PI * 1.2, Math.PI * 1.8); cx.stroke(); } // ceja alzada
  }
}
function holograma(t) {
  // líneas de barrido + banda que recorre de arriba abajo
  const top = HY - R * 2, bot = Math.min(H - 50, baseY() + LEN);
  cx.fillStyle = "rgba(0,0,0,.18)"; for (let y = top; y < bot; y += 4) cx.fillRect(0, y, W, 1.5);
  if (!QUIETO.matches) { const y = top + ((t * 90) % (bot - top + 80)) - 40; const g = cx.createLinearGradient(0, y - 30, 0, y + 30); g.addColorStop(0, "rgba(0,255,200,0)"); g.addColorStop(.5, "rgba(120,255,230,.14)"); g.addColorStop(1, "rgba(0,255,200,0)"); cx.fillStyle = g; cx.fillRect(0, y - 30, W, 60); }
}
// --- etiquetas (botones) en la punta de cada brazo ---
const capa = $("#brazos");
brazos.forEach((b) => { const e = document.createElement("button"); e.className = "brazo"; e.type = "button"; e.dataset.e = "idle"; e.textContent = b.n; e.setAttribute("aria-label", b.n + ": " + EST.idle); e.onclick = () => tocar(b.i); b.el = e; capa.appendChild(e); });
function ubicarEtiquetas() {
  for (const b of brazos) {
    const p = b.pts[b.pts.length - 1]; if (!p) continue;
    const ew = b.el.offsetWidth / 2 + 6, eh = b.el.offsetHeight / 2 + 4;
    const x = Math.max(ew, Math.min(W - ew, p[0])), y = Math.max(eh + 70, Math.min(H - eh - 40, p[1]));
    b.lx = x; b.ly = y; b.lw = ew * 2 - 12; b.lh = eh * 2 - 8;
  }
  // separa etiquetas que se encimen (empuja en vertical, dentro de la pantalla)
  for (let pase = 0; pase < 6; pase++) for (const a of brazos) for (const o of brazos) {
    if (a === o || a.lx == null || o.lx == null) continue;
    const dx = Math.abs(a.lx - o.lx) - (a.lw + o.lw) / 2 - 4, dy = Math.abs(a.ly - o.ly) - (a.lh + o.lh) / 2 - 4;
    if (dx < 0 && dy < 0) {
      if (dx > dy) { const s = a.lx <= o.lx ? -1 : 1; a.lx += s * (-dx / 2 + .5); o.lx -= s * (-dx / 2 + .5); } // empuje por el lado más corto
      else { const s = a.ly <= o.ly ? -1 : 1; a.ly += s * (-dy / 2 + .5); o.ly -= s * (-dy / 2 + .5); }
    }
    for (const b of [a, o]) { b.lx = Math.max(b.lw / 2 + 6, Math.min(W - b.lw / 2 - 6, b.lx)); b.ly = Math.max(b.lh / 2 + 74, Math.min(H - b.lh / 2 - 44, b.ly)); }
  }
  for (const b of brazos) { if (b.lx == null) continue; b.ly = Math.max(b.lh / 2 + 74, Math.min(H - b.lh / 2 - 44, b.ly)); b.el.style.left = b.lx + "px"; b.el.style.top = b.ly + "px"; }
}
function ponerEstado(b, e, ms = 0) { b.e = e; b.hasta = ms ? performance.now() + ms : 0; b.el.dataset.e = e; b.el.setAttribute("aria-label", b.n + ": " + EST[e]); if (sel === b.i) $("#h-e").textContent = "Estado: " + EST[e]; }
function pulso(b, rojo = false, n = 3) { b.luz = 1; for (let k = 0; k < n; k++) b.pulsos.push({ s: 1 + k * .12, v: .018 + Math.random() * .006, rojo }); for (let k = 0; k < 10; k++) chispas.push({ x: HX, y: HY, vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4, a: 1, rojo }); }
function tocar(i) {
  const b = brazos[i]; mirarBrazo(b, b.e === "alerta" ? "sorpresa" : "normal", 3000, b.e === "alerta"); sel = i; brazos.forEach((o) => o.el.classList.toggle("sel", o.i === i));
  pulso(b, b.e === "alerta", 4); navigator.vibrate?.(12);
  $("#h-t").textContent = b.n; $("#h-e").textContent = "Estado: " + EST[b.e]; $("#h-d").textContent = b.d;
  $("#h-l").replaceChildren(...b.l.map((x) => Object.assign(document.createElement("li"), { textContent: x })));
  $("#hoja").classList.toggle("alerta", b.e === "alerta"); $("#hoja").classList.add("ver");
  if (b.e === "alerta") setTimeout(() => ponerEstado(b, "idle"), 1200);
}
$("#h-c").onclick = () => { $("#hoja").classList.remove("ver"); sel = -1; brazos.forEach((o) => o.el.classList.remove("sel")); };
// --- demo: los brazos piensan solos ---
const ALERTAS = { rutas: "Presa fuerte en la ruta 27", salud: "Disco de ANTARES al 92 %", noticias: "Noticia importante de hoy", estudio: "Repaso pendiente", record: "Cita en 30 minutos", juegos: "Nuevo reto disponible", vision: "Foto lista para revisar", memoria: "Dato nuevo guardado" };
let tDemo = 0;
function demo(now) {
  for (const b of brazos) if (b.hasta && now > b.hasta) { const pens = b.e === "pensando"; ponerEstado(b, "idle"); if (pens) pulso(b, false, 2); }
  if (!$("#demo").checked) return;
  if (now < tDemo) return; tDemo = now + 1400 + Math.random() * 1800;
  const libres = brazos.filter((b) => b.e === "idle"); if (!libres.length) return;
  const b = libres[(Math.random() * libres.length) | 0];
  if (Math.random() < .18) { ponerEstado(b, "alerta", 6000); pulso(b, true, 3); mirarBrazo(b, "sorpresa", 2200, true); avisar(`<b>${b.n}:</b> ${ALERTAS[b.id]}`, true); }
  else { ponerEstado(b, "pensando", 2200 + Math.random() * 2000); b.luz = .8; mirarBrazo(b, "normal", 2000); avisar(`<b>${b.n}</b> está pensando…`); }
}
let tAviso; function avisar(h, alerta = false) { const e = $("#estado"); e.innerHTML = h; e.classList.toggle("alerta", alerta); clearTimeout(tAviso); tAviso = setTimeout(() => { e.textContent = "Toque un brazo para ver qué hace."; e.classList.remove("alerta"); }, 3500); }
// --- bucle (~30 cps, se pausa en segundo plano) ---
let raf = 0, ult = 0;
function unCuadro(now = performance.now()) {
  const t = (now - t0) / 1000; cx.clearRect(0, 0, W, H);
  const mueve = !QUIETO.matches;
  BOB = mueve ? Math.sin(t * 1.4) * R * .06 : 0;
  GX = mueve && Math.random() < .03 ? (Math.random() - .5) * 6 : 0; // pequeña falla de holograma
  cx.globalAlpha = mueve && Math.random() < .04 ? .7 : 1; // parpadeo
  proyector(t);
  cx.globalCompositeOperation = "lighter";
  for (const b of brazos) dibujarBrazo(b, t);
  cx.globalCompositeOperation = "source-over";
  dibujarCabeza(t); holograma(t); cx.globalAlpha = 1; ubicarEtiquetas(); demo(now);
}
let cuadros = 0;
function bucle(now) { raf = requestAnimationFrame(bucle); if (now - ult < 32) return; ult = now; cuadros++; unCuadro(now); }
function andar() { if (!raf && !document.hidden) raf = requestAnimationFrame(bucle); }
function parar() { cancelAnimationFrame(raf); raf = 0; }
document.addEventListener("visibilitychange", () => (document.hidden ? parar() : andar()));
cv.addEventListener("pointerdown", (e) => mirar(e.clientX, e.clientY, "normal", 1800));
addEventListener("keydown", (e) => { if (e.key === "Escape") $("#h-c").click(); });
addEventListener("resize", () => { medir(); unCuadro(); });
armarCerebro(); medir(); unCuadro(); andar();
// en movimiento reducido el bucle sigue a menor costo pero sin ondulación; el demo sigue funcionando

// --- 3 corazones ---
const URL_PC = "https://antares.tail1d77f2.ts.net";
function leer(k) { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } }
function credPC() {
  try { const p = window.parent !== window && window.parent.__antaresPC?.(); if (p && p.tok) return { url: (p.url || URL_PC).replace(/\/+$/, ""), tok: p.tok }; } catch { /* otro origen */ }
  const l = leer("antares.cerebroDoble.v1"); return { url: (l.url || URL_PC).replace(/\/+$/, ""), tok: (l.tok || "").trim() };
}
function corazon(id, e, txt) { const c = document.getElementById(id); c.dataset.e = e; c.querySelector("i").textContent = txt; c.title = c.querySelector("b").textContent + ": " + txt; }
async function revisarCorazones() {
  const en = navigator.onLine;
  corazon("cz-gem", en ? "ok" : "off", en ? "late" : "sin internet");
  corazon("cz-off", "ok", en ? "listo" : "activo");
  const { url, tok } = credPC();
  if (!tok) { corazon("cz-pc", "off", "sin clave"); return; }
  if (!en) { corazon("cz-pc", "off", "sin red"); return; }
  corazon("cz-pc", "rev", "revisando");
  try { const r = await fetch(url + "/api/version", { headers: { "X-Antares-Token": tok }, signal: AbortSignal.timeout(6000) }); corazon("cz-pc", r.ok ? "ok" : "off", r.ok ? "late" : r.status === 401 ? "clave incorrecta" : "error " + r.status); }
  catch { corazon("cz-pc", "off", "apagada"); }
}
addEventListener("online", revisarCorazones); addEventListener("offline", revisarCorazones);
document.querySelectorAll(".cz").forEach((c) => (c.onclick = () => { avisar(`<b>${c.querySelector("b").textContent}</b>: ${c.querySelector("i").textContent}. Si un corazón se detiene, los otros siguen latiendo.`); revisarCorazones(); }));
revisarCorazones(); setInterval(revisarCorazones, 60000);

// solo para pruebas automáticas (sin datos privados)
window.__pulpo = { ojo: () => ({ ...OJO }), brazos: () => brazos.map((b) => ({ n: b.n, e: b.e, pulsos: b.pulsos.length })), cuadros: () => cuadros, chispas: () => chispas.length, corriendo: () => !!raf };
