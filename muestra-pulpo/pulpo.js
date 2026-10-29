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
  HX = W / 2; HY = H * (W < 600 ? .47 : .46); R = Math.min(W, H) * (W < 600 ? .17 : .13); LEN = Math.min(W * .48, H * .38);
}
// ángulo base de cada brazo: abanico alrededor de la cabeza, más hacia abajo (como pulpo)
const ang = (i) => { const a0 = [-2.5, -0.64, -3.0, -0.14, 2.65, 0.49, 2.05, 1.09][i]; return a0; };
function puntos(b, t) {
  const a = ang(b.i), N = 16, pts = b.pts; pts.length = 0;
  let x = HX + Math.cos(a) * R * .85, y = HY + Math.sin(a) * R * .75, dir = a;
  const paso = LEN / N, viva = QUIETO.matches ? 0 : 1;
  for (let k = 0; k <= N; k++) {
    pts.push([x, y]);
    const u = k / N;
    dir = a + viva * (Math.sin(t * 1.3 + b.fase + u * 3.2) * .55 * u + Math.sin(t * .7 + b.fase * 2) * .18) + (b.i % 2 ? .5 : -.5) * u * u * (.6 + .4 * Math.sin(t * .9 + b.fase));
    x += Math.cos(dir) * paso; y += Math.sin(dir) * paso * .92;
  }
  return pts;
}
function colorBrazo(b) { return b.e === "alerta" ? [255, 45, 74] : [0, 255, 156]; }
function dibujarBrazo(b, t) {
  const p = puntos(b, t), [r, g, bl] = colorBrazo(b), N = p.length - 1, l = Math.max(b.luz, b.e === "pensando" ? .55 : b.e === "alerta" ? .8 : .18);
  cx.lineCap = "round";
  for (let pase = 0; pase < 2; pase++) {
    for (let k = 0; k < N; k++) {
      const u = k / N, ancho = (1 - u) * R * .32 + 1.5;
      cx.strokeStyle = pase ? `rgba(${r},${g},${bl},${.35 + .55 * l * (1 - u * .5)})` : `rgba(${r},${g},${bl},${.06 + .14 * l})`;
      cx.lineWidth = pase ? ancho * .45 : ancho * 1.6;
      cx.beginPath(); cx.moveTo(p[k][0], p[k][1]); cx.lineTo(p[k + 1][0], p[k + 1][1]); cx.stroke();
    }
  }
  // ventosas
  cx.fillStyle = `rgba(${r},${g},${bl},${.25 + .5 * l})`;
  for (let k = 2; k < N; k += 2) { const u = k / N; cx.beginPath(); cx.arc(p[k][0], p[k][1], Math.max(1, (1 - u) * R * .06), 0, 6.28); cx.fill(); }
  // pulsos de energía: viajan de la punta a la cabeza
  b.pulsos = b.pulsos.filter((q) => (q.s -= q.v) > 0);
  for (const q of b.pulsos) {
    const f = q.s * N, k = Math.min(N - 1, f | 0), w = f - k, x = p[k][0] + (p[k + 1][0] - p[k][0]) * w, y = p[k][1] + (p[k + 1][1] - p[k][1]) * w;
    const gr = cx.createRadialGradient(x, y, 0, x, y, 14); gr.addColorStop(0, `rgba(${q.rojo ? "255,90,110" : "190,255,225"},1)`); gr.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = gr; cx.beginPath(); cx.arc(x, y, 14, 0, 6.28); cx.fill();
    if (q.s - q.v <= 0) { flash = Math.min(1, flash + .5); if (q.rojo) rojoFlash = 1; }
  }
  b.luz *= .965;
}
function dibujarCabeza(t) {
  const lat = 1 + .025 * Math.sin(t * 6.28 * 1.1) * (QUIETO.matches ? 0 : 1);
  const g = cx.createRadialGradient(HX, HY, R * .2, HX, HY, R * 1.9);
  g.addColorStop(0, `rgba(0,255,156,${.16 + .25 * flash})`); g.addColorStop(.5, `rgba(${rojoFlash > .1 ? "255,45,74" : "0,120,80"},${.08 + .2 * Math.max(flash, rojoFlash)})`); g.addColorStop(1, "rgba(0,0,0,0)");
  cx.fillStyle = g; cx.beginPath(); cx.arc(HX, HY, R * 1.9, 0, 6.28); cx.fill();
  cx.strokeStyle = `rgba(0,255,156,${.35 + .4 * flash})`; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(HX, HY, R * 1.2 * lat, R * 1.0 * lat, 0, 0, 6.28); cx.stroke();
  const P = nodos.map((n) => [HX + n.x * R * lat, HY + n.y * R * lat]);
  for (const [i, j] of aristas) { const izq = nodos[i].izq && nodos[j].izq; cx.strokeStyle = izq ? `rgba(255,45,74,${.22 + .3 * flash})` : `rgba(0,255,156,${.22 + .35 * flash})`; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(...P[i]); cx.lineTo(...P[j]); cx.stroke(); }
  nodos.forEach((n, i) => { const b = .5 + .5 * Math.sin(t * 2 + n.f); cx.fillStyle = n.izq ? `rgba(255,${60 + 60 * b},90,${.5 + .5 * b})` : `rgba(${90 + 120 * b},255,190,${.5 + .5 * b})`; cx.beginPath(); cx.arc(P[i][0], P[i][1], 1.4 + 1.4 * b, 0, 6.28); cx.fill(); });
  // chispas de la cabeza
  for (let k = chispas.length - 1; k >= 0; k--) { const c = chispas[k]; c.x += c.vx; c.y += c.vy; c.a *= .93; if (c.a < .03) { chispas.splice(k, 1); continue; } cx.fillStyle = `rgba(${c.rojo ? "255,45,74" : "0,255,156"},${c.a})`; cx.fillRect(c.x, c.y, 2, 2); }
  flash *= .94; rojoFlash *= .96;
}
// --- etiquetas (botones) en la punta de cada brazo ---
const capa = $("#brazos");
brazos.forEach((b) => { const e = document.createElement("button"); e.className = "brazo"; e.type = "button"; e.dataset.e = "idle"; e.textContent = b.n; e.setAttribute("aria-label", b.n + ": " + EST.idle); e.onclick = () => tocar(b.i); b.el = e; capa.appendChild(e); });
function ubicarEtiquetas() {
  for (const b of brazos) {
    const p = b.pts[b.pts.length - 1]; if (!p) continue;
    const ew = b.el.offsetWidth / 2 + 6, eh = b.el.offsetHeight / 2 + 4;
    const x = Math.max(ew, Math.min(W - ew, p[0])), y = Math.max(eh + 70, Math.min(H - eh - 40, p[1]));
    b.el.style.left = x + "px"; b.el.style.top = y + "px";
  }
}
function ponerEstado(b, e, ms = 0) { b.e = e; b.hasta = ms ? performance.now() + ms : 0; b.el.dataset.e = e; b.el.setAttribute("aria-label", b.n + ": " + EST[e]); if (sel === b.i) $("#h-e").textContent = "Estado: " + EST[e]; }
function pulso(b, rojo = false, n = 3) { b.luz = 1; for (let k = 0; k < n; k++) b.pulsos.push({ s: 1 + k * .12, v: .018 + Math.random() * .006, rojo }); for (let k = 0; k < 10; k++) chispas.push({ x: HX, y: HY, vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4, a: 1, rojo }); if (QUIETO.matches) unCuadro(); }
function tocar(i) {
  const b = brazos[i]; sel = i; brazos.forEach((o) => o.el.classList.toggle("sel", o.i === i));
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
  if (!$("#demo").checked) return;
  for (const b of brazos) if (b.hasta && now > b.hasta) { if (b.e === "pensando") pulso(b, false, 2); ponerEstado(b, "idle"); }
  if (now < tDemo) return; tDemo = now + 1400 + Math.random() * 1800;
  const libres = brazos.filter((b) => b.e === "idle"); if (!libres.length) return;
  const b = libres[(Math.random() * libres.length) | 0];
  if (Math.random() < .18) { ponerEstado(b, "alerta", 6000); pulso(b, true, 3); avisar(`<b>${b.n}:</b> ${ALERTAS[b.id]}`, true); }
  else { ponerEstado(b, "pensando", 2200 + Math.random() * 2000); b.luz = .8; avisar(`<b>${b.n}</b> está pensando…`); }
}
let tAviso; function avisar(h, alerta = false) { const e = $("#estado"); e.innerHTML = h; e.classList.toggle("alerta", alerta); clearTimeout(tAviso); tAviso = setTimeout(() => { e.textContent = "Toque un brazo para ver qué hace."; e.classList.remove("alerta"); }, 3500); }
// --- bucle (~30 cps, se pausa en segundo plano) ---
let raf = 0, ult = 0;
function unCuadro(now = performance.now()) {
  const t = (now - t0) / 1000; cx.clearRect(0, 0, W, H);
  for (const b of brazos) dibujarBrazo(b, t);
  dibujarCabeza(t); ubicarEtiquetas(); demo(now);
}
function bucle(now) { raf = requestAnimationFrame(bucle); if (now - ult < 32) return; ult = now; unCuadro(now); }
function andar() { if (!raf && !document.hidden) raf = requestAnimationFrame(bucle); }
function parar() { cancelAnimationFrame(raf); raf = 0; }
document.addEventListener("visibilitychange", () => (document.hidden ? parar() : andar()));
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
