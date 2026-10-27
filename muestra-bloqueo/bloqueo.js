// Antares · muestra del bloqueo nuevo: cerebro en red animado (canvas 2D liviano) en lugar de la foto, y teclado sin «pantalla rara».
const $ = (id) => document.getElementById(id);
const raiz = $("bloqueo"), msg = $("msg"), puntosBox = $("puntos"), puntos = [...puntosBox.children];
const QUIETO = matchMedia("(prefers-reduced-motion: reduce)");
let pin = "", ocupado = false;

// ---------- cerebro en red: ~70 nodos en una esfera, verde y rojo, pulsos por las conexiones ----------
const cv = $("cerebro"), ctx = cv.getContext("2d", { alpha: true });
const N = 70, nodos = [], aristas = [], pulsos = [];
for (let i = 0; i < N; i++) { const y = 1 - 2 * (i + .5) / N, r = Math.sqrt(1 - y * y), t = i * 2.39996, k = .78 + Math.random() * .2; nodos.push({ x: Math.cos(t) * r * k, y: y * k, z: Math.sin(t) * r * k, rojo: i % 5 === 0 }); }
for (let i = 0; i < N; i++) { const d = nodos.map((m, j) => [j, (m.x - nodos[i].x) ** 2 + (m.y - nodos[i].y) ** 2 + (m.z - nodos[i].z) ** 2]).sort((a, b) => a[1] - b[1]); for (const [j] of d.slice(1, 3)) if (j > i) aristas.push([i, j]); }
let W = 0, H = 0, dpr = 1, rot = 0, flash = 0, color = [0, 255, 156], ultimo = 0, raf = 0;
const P = nodos.map(() => ({ x: 0, y: 0, z: 0 }));
function medir() { const r = cv.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); dibujar(); }
function dibujar() {
  if (!W) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = W * .46, cs = Math.cos(rot), sn = Math.sin(rot), inc = -.3, ci = Math.cos(inc), si = Math.sin(inc);
  for (let i = 0; i < N; i++) { const n = nodos[i]; const x = n.x * cs + n.z * sn, z0 = -n.x * sn + n.z * cs, y = n.y * ci - z0 * si, z = n.y * si + z0 * ci; const s = 1 / (1.9 - z * .6); P[i].x = cx + x * R * s * 1.25; P[i].y = cy + y * R * s * 1.25; P[i].z = z; }
  // núcleo
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * .55); const a = .35 + flash * .5;
  g.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${a})`); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * .55, 0, 6.29); ctx.fill();
  // conexiones
  ctx.lineWidth = 1;
  for (const [i, j] of aristas) { const z = (P[i].z + P[j].z) / 2; ctx.strokeStyle = `rgba(0,255,156,${.10 + (z + 1) * .16})`; ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke(); }
  // pulsos
  for (const p of pulsos) { const [i, j] = aristas[p.e], t = p.t; const x = P[i].x + (P[j].x - P[i].x) * t, y = P[i].y + (P[j].y - P[i].y) * t; ctx.fillStyle = p.rojo ? "rgba(255,45,74,.95)" : "rgba(200,255,228,.95)"; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 6.29); ctx.fill(); }
  // nodos
  for (let i = 0; i < N; i++) { const z = P[i].z, r = 1 + (z + 1) * 1.1, n = nodos[i]; ctx.fillStyle = n.rojo ? `rgba(255,45,74,${.45 + (z + 1) * .27})` : `rgba(0,255,156,${.45 + (z + 1) * .27})`; ctx.beginPath(); ctx.arc(P[i].x, P[i].y, r, 0, 6.29); ctx.fill(); }
}
function cuadro(t) {
  raf = 0;
  if (t - ultimo >= 33) { // ~30 cuadros por segundo: suficiente y liviano para el iPhone
    const dt = Math.min(.1, (t - ultimo) / 1000 || .033); ultimo = t;
    rot += dt * (.25 + flash * .8); flash = Math.max(0, flash - dt * 1.6);
    for (let k = pulsos.length - 1; k >= 0; k--) { pulsos[k].t += dt * pulsos[k].v; if (pulsos[k].t >= 1) pulsos.splice(k, 1); }
    if (Math.random() < dt * 1.2) pulsos.push({ e: (Math.random() * aristas.length) | 0, t: 0, v: 1.2, rojo: Math.random() < .3 });
    dibujar();
  }
  andar();
}
function andar() { if (!raf && !document.hidden && !QUIETO.matches) raf = requestAnimationFrame(cuadro); }
function parar() { cancelAnimationFrame(raf); raf = 0; }
document.addEventListener("visibilitychange", () => (document.hidden ? parar() : andar()));
QUIETO.addEventListener?.("change", () => { if (QUIETO.matches) { parar(); dibujar(); } else andar(); });
new ResizeObserver(medir).observe(cv); medir(); andar();
function chispa(rojo = false, n = 3) { flash = Math.min(1, flash + .45); for (let i = 0; i < n; i++) pulsos.push({ e: (Math.random() * aristas.length) | 0, t: 0, v: 2.2, rojo }); if (QUIETO.matches) dibujar(); else andar(); }

// ---------- teclado ----------
const pintar = () => { puntos.forEach((d, i) => d.classList.toggle("on", i < pin.length)); puntosBox.setAttribute("aria-label", `${pin.length} de 6 dígitos ingresados`); };
const estado = (s, t) => { raiz.dataset.st = s; if (t != null) msg.textContent = t; };
function marcar(b) { if (!b || QUIETO.matches) return; b.classList.add("pulsada"); setTimeout(() => b.classList.remove("pulsada"), 110); }
function tecla(d, b) {
  if (ocupado || pin.length >= 6) return;
  if (raiz.dataset.st !== "normal") estado("normal", "\u00a0");
  pin += d; pintar(); marcar(b); chispa(false, 2);
  if (pin.length === 6) { ocupado = true; setTimeout(revisar, 140); }
}
function borrar(b) { if (ocupado || !pin) return; pin = pin.slice(0, -1); pintar(); marcar(b); chispa(true, 1); if (raiz.dataset.st !== "normal") estado("normal", "\u00a0"); }
function revisar() {
  if (pin === "123456") { estado("ok", "Desbloqueado ✓ (muestra)"); color = [0, 255, 156]; chispa(false, 10); $("arco").setAttribute("d", "M8 10.5V8a4 4 0 0 1 7.6-1.7"); setTimeout(() => { pin = ""; pintar(); ocupado = false; estado("normal", "Muestra: el código es 123456"); $("arco").setAttribute("d", "M8 10.5V8a4 4 0 0 1 8 0v2.5"); }, 1800); return; }
  estado("error", "Código incorrecto"); color = [255, 45, 74]; chispa(true, 6); navigator.vibrate?.(120);
  setTimeout(() => { pin = ""; pintar(); ocupado = false; color = [0, 255, 156]; }, 450);
}
// pointerdown responde al instante (sin esperar el «click»); el click queda para teclado/lectores de pantalla
let porToque = 0;
$("teclado").addEventListener("pointerdown", (e) => { const b = e.target.closest("button"); if (!b || e.button > 0) return; porToque = Date.now(); if (b.dataset.d) tecla(b.dataset.d, b); else if (b.id === "borrar") borrar(b); else return; e.preventDefault(); });
$("teclado").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || Date.now() - porToque < 600) return; if (b.dataset.d) tecla(b.dataset.d, b); else if (b.id === "borrar") borrar(b); });
// ARREGLO 5: sin dblclick/gestos de zoom en Safari viejo
document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => { if (/^\d$/.test(e.key)) { e.preventDefault(); tecla(e.key); } else if (e.key === "Backspace") { e.preventDefault(); borrar(); } });
$("cara").addEventListener("click", () => estado("normal", "En la muestra, Face ID no está conectado."));
$("bio").addEventListener("click", () => estado("normal", "En la muestra, Face ID no está conectado."));
$("olvido").addEventListener("click", () => estado("normal", "En la app, aquí se explica cómo restablecer el código."));
pintar(); $("titulo").focus({ preventScroll: true });
