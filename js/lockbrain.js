// v1.27: cerebro en red animado de la pantalla de bloqueo (reemplaza la foto). Canvas 2D liviano: ~70 nodos, ~30 cuadros/s,
// nitidez máx. 2x; se detiene con la app en segundo plano, con el bloqueo oculto y con «reducir movimiento».
const QUIETO = matchMedia("(prefers-reduced-motion: reduce)");
// ---------- cerebro en red: ~70 nodos en una esfera, verde y rojo, pulsos por las conexiones ----------
let cv = null, ctx = null, activo = false;
const N = 70, nodos = [], aristas = [], pulsos = [];
for (let i = 0; i < N; i++) { const y = 1 - 2 * (i + .5) / N, r = Math.sqrt(1 - y * y), t = i * 2.39996, k = .78 + Math.random() * .2; nodos.push({ x: Math.cos(t) * r * k, y: y * k, z: Math.sin(t) * r * k, rojo: i % 5 === 0 }); }
for (let i = 0; i < N; i++) { const d = nodos.map((m, j) => [j, (m.x - nodos[i].x) ** 2 + (m.y - nodos[i].y) ** 2 + (m.z - nodos[i].z) ** 2]).sort((a, b) => a[1] - b[1]); for (const [j] of d.slice(1, 3)) if (j > i) aristas.push([i, j]); }
let W = 0, H = 0, dpr = 1, rot = 0, flash = 0, color = [0, 255, 156], ultimo = 0, raf = 0;
const P = nodos.map(() => ({ x: 0, y: 0, z: 0 }));
function medir() { if (!cv) return; const r = cv.getBoundingClientRect(); if (!r.width) return; dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); dibujar(); }
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
function andar() { if (!raf && activo && !document.hidden && !QUIETO.matches) raf = requestAnimationFrame(cuadro); }
function parar() { cancelAnimationFrame(raf); raf = 0; }
document.addEventListener("visibilitychange", () => (document.hidden ? parar() : andar()));
QUIETO.addEventListener?.("change", () => { if (QUIETO.matches) { parar(); dibujar(); } else andar(); });
export function chispa(rojo = false, n = 3) { if (!cv) return; flash = Math.min(1, flash + .45); for (let i = 0; i < n; i++) pulsos.push({ e: (Math.random() * aristas.length) | 0, t: 0, v: 2.2, rojo }); if (QUIETO.matches) dibujar(); else andar(); }

export function montar(canvas) {
  if (cv || !canvas) return; cv = canvas; ctx = cv.getContext("2d", { alpha: true });
  if ("ResizeObserver" in window) new ResizeObserver(medir).observe(cv); medir();
}
export function activar(on) { activo = !!on; if (activo) { medir(); dibujar(); andar(); } else parar(); }
export function tono(c) { color = c === "error" ? [255, 45, 74] : [0, 255, 156]; if (QUIETO.matches) dibujar(); }
export function rafaga() { color = [0, 255, 156]; chispa(false, 10); }
