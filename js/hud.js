// v1.19: capa "centro de mando" detrás del cerebro en Inicio: rejilla tipo mapa, radar, enlaces a nodos del hub
// (con conteos reales cuando la app está desbloqueada), telemetría y espectro que se densifican al pensar/hablar.
// Ligera: 2D, máx. 30 fps (8 fps en reposo), se pausa con la pestaña oculta o fuera de Inicio.
let cv, x, mode = "reposo", speaking = false, counts = null, raf = 0, last = 0, logs = [];
const G = "0,255,156", R = "#ff2d4a";
const NODES = [["RECUERDOS", -.4, -.36], ["RECORDATORIOS", .38, -.4], ["COMPRAS", -.42, .3], ["RUTAS", .4, .32], ["TRABAJO", 0, -.46]];
const LOGS = ["SYNC hub OK", "BÓVEDA sellada AES-GCM", "RED latencia OK", "LLM flujo de tokens", "CTX recuerdos", "MEM índice", "NODO enlazado", "SEÑAL ▮▮▮▯", "VOZ canal activo"];
export function mountHud(stage) {
  if (!stage || cv) return;
  cv = document.createElement("canvas"); cv.className = "hud-layer"; cv.setAttribute("aria-hidden", "true");
  stage.prepend(cv); x = cv.getContext("2d");
  document.addEventListener("visibilitychange", kick); kick();
}
export function setHudMode(m) { mode = m; kick(); }
export function setHudSpeaking(on) { speaking = !!on; kick(); }
export function setHudCounts(c) { counts = c; }
function kick() { if (!raf && cv && !document.hidden) raf = requestAnimationFrame(frame); }
function frame(t) {
  raf = 0; if (document.hidden || !cv) return;
  const act = speaking ? .85 : mode === "pensando" ? 1 : mode === "escuchando" ? .5 : .15;
  if (t - last >= 1000 / (act > .2 ? 30 : 8)) { last = t; if (cv.offsetParent !== null && !document.body.classList.contains("hud-off")) draw(t, act); }
  raf = requestAnimationFrame(frame);
}
function draw(t, act) {
  const dpr = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect(), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (!w || !h) return; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  x.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * .42, R0 = Math.min(w, h) * .26, step = 30 * dpr;
  x.lineWidth = 1; x.strokeStyle = `rgba(${G},.05)`;
  for (let X = (t / 90) % step; X < w; X += step) { x.beginPath(); x.moveTo(X, 0); x.lineTo(X, h); x.stroke(); }
  for (let Y = 0; Y < h; Y += step) { x.beginPath(); x.moveTo(0, Y); x.lineTo(w, Y); x.stroke(); }
  for (let k = 1; k <= 3; k++) { x.strokeStyle = `rgba(${G},${.06 + .05 * act})`; x.beginPath(); x.arc(cx, cy, R0 * (1 + k * .25), 0, 6.283); x.stroke(); }
  const sw = t / 1000 * (.5 + act * 1.6); x.fillStyle = `rgba(${G},${.035 + .06 * act})`; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R0 * 1.75, sw, sw + .5); x.fill();
  x.font = `${8.5 * dpr}px Orbitron,monospace`; x.textAlign = "center";
  NODES.forEach(([n, nx, ny], i) => {
    const X = cx + nx * w, Y = cy + ny * h, on = act > .3;
    x.strokeStyle = `rgba(${G},${on ? .28 : .1})`; x.setLineDash([3 * dpr, 5 * dpr]); x.lineDashOffset = -t / 40;
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(X, Y); x.stroke(); x.setLineDash([]);
    const key = n[0] + n.slice(1).toLowerCase(), v = counts && counts[key] != null ? " " + counts[key] : "";
    x.fillStyle = `rgba(${G},${on ? .8 : .35})`; x.fillText(n + v, X, Y); x.fillStyle = i % 3 === 1 && on ? R : `rgba(${G},.6)`; x.fillRect(X - 2 * dpr, Y + 4 * dpr, 4 * dpr, 4 * dpr);
  });
  if (act > .4) { if (Math.random() < act * .1) logs.unshift(LOGS[(Math.random() * LOGS.length) | 0] + " · " + (t / 1000).toFixed(1)); logs = logs.slice(0, Math.round(3 + act * 5)); } else logs = logs.slice(0, 1);
  x.textAlign = "left"; x.font = `${8 * dpr}px Orbitron,monospace`;
  logs.forEach((l, i) => { x.fillStyle = `rgba(${G},${.6 - i * .07})`; x.fillText("› " + l, 8 * dpr, 16 * dpr + i * 12 * dpr); });
  if (act > .3) for (let k = 0; k < 20; k++) { const v = (Math.sin(t / 140 + k * 1.3) * .5 + .5) * act; x.fillStyle = k % 6 === 0 ? "rgba(255,45,74,.6)" : `rgba(${G},.45)`; x.fillRect(w - 10 * dpr - k * 5 * dpr, 30 * dpr - v * 22 * dpr, 3 * dpr, v * 22 * dpr); }
}
