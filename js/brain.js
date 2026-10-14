// Cerebro 3D en red (reemplaza el reactor): canvas 2D con proyección 3D manual, reacciona a los estados de Antares.
// Estados: reposo (lento, suave), escuchando (nodos brillan; nivel real del micrófono si ya hay permiso),
// pensando (pulsos de luz por las conexiones), respondiendo (respira con la voz, ondas y anillo de audio).
const CATS = ["Recuerdos", "Rutas", "Trabajo", "Evangeline", "Recordatorios", "Compras", "Robótica"];
const COL = [[0, 255, 156], [255, 45, 74], [25, 230, 140], [255, 59, 59], [0, 220, 120], [255, 80, 110], [120, 255, 190]]; // v1.14: verde y rojo equilibrados
const rnd = (a, b) => a + Math.random() * (b - a);
const instances = [];
let raf = 0, mode = "reposo", dim = false, amp = 0, env = 0, sylT = 0, pauseT = 0, boost = 0, lastNow = 0;
let showLabels = true;
export function setLabels(on) { showLabels = !!on; }
let speaking = false, gotChunk = false, mic = null, micWanted = false, counts = null;

function fib(i, n) { const y = 1 - 2 * (i + .5) / n, r = Math.sqrt(1 - y * y), th = i * 2.39996; return [Math.cos(th) * r, y, Math.sin(th) * r]; }
function buildGraph(nPts) {
  const N = [], E = [], hubs = [];
  CATS.forEach((c, i) => { const p = fib(i, CATS.length); hubs.push(N.length); N.push({ x: p[0] * .82, y: p[1] * .82, z: p[2] * .82, hub: 1, cat: i, label: c }); });
  for (let k = 0; k < nPts; k++) {
    const cat = k % CATS.length, h = N[hubs[cat]]; let x, y, z, l;
    do { x = h.x + rnd(-.55, .55); y = h.y + rnd(-.55, .55); z = h.z + rnd(-.55, .55); l = Math.hypot(x, y, z); } while (l > 1);
    if (Math.random() < .6) { const s = rnd(.88, 1) / l; x *= s; y *= s; z *= s; }
    const id = N.length; N.push({ x, y, z, cat, hub: 0 }); E.push([hubs[cat], id]);
    let b1 = -1, b2 = -1, d1 = 9, d2 = 9;
    for (let j = CATS.length; j < id; j++) { const m = N[j], d = (m.x - x) ** 2 + (m.y - y) ** 2 + (m.z - z) ** 2; if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = j; } else if (d < d2) { d2 = d; b2 = j; } }
    if (b1 >= 0) E.push([b1, id]); if (b2 >= 0) E.push([b2, id]);
  }
  for (let i = 0; i < hubs.length; i++) E.push([hubs[i], hubs[(i + 2) % hubs.length]]);
  for (const n of N) n.r = Math.hypot(n.x, n.y, n.z);
  return { N, E, hubs };
}

export function mountBrain(wrap, opts = {}) {
  if (!wrap || wrap.querySelector("canvas.brain")) return;
  const old = wrap.querySelector("svg.reactor"); if (old) old.remove();
  wrap.querySelectorAll(".ripple").forEach((r) => r.remove());
  const cv = document.createElement("canvas"); cv.className = "brain"; cv.setAttribute("aria-hidden", "true");
  wrap.prepend(cv);
  const g = buildGraph(opts.lite ? 120 : 240);
  const inst = { wrap, cv, ctx: cv.getContext("2d"), g, lite: !!opts.lite, P: g.N.map(() => ({ sx: 0, sy: 0, z: 0, s: 1 })), pulses: [], ry: Math.random() * 6, rx: -.25, vy: .003, W: 0, H: 0, dpr: 1, lvl: .35 };
  const fit = () => {
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (w === inst.W && h === inst.H && dpr === inst.dpr) return;
    inst.W = w; inst.H = h; inst.dpr = dpr; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    try { draw(inst, performance.now() / 1000, effMode(), 0); } catch { /* */ } // v1.16: sin parpadeo al cambiar de tamaño
  };
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(wrap); else addEventListener("resize", fit);
  fit(); instances.push(inst); start();
}

// ---- señales desde la app ----
export function setMode(m) {
  if (m === mode) return;
  if (m === "pensando") gotChunk = false;
  mode = m; micWanted = m === "escuchando"; syncMic(); start();
}
export function setDim(on) { dim = !!on; }
export function chunk() { gotChunk = true; boost = Math.max(boost, .6); }
export function word() { boost = 1; env = 1; }
export function setSpeaking(on) { speaking = !!on; start(); }
export function setCounts(c) { counts = c; }
const effMode = () => (speaking ? "respondiendo" : mode === "pensando" && gotChunk ? "respondiendo" : mode);

// nivel real del micrófono: solo si el permiso YA está concedido (nunca pide permiso por su cuenta)
async function syncMic() {
  if (!micWanted) { if (mic) { try { mic.stream.getTracks().forEach((t) => t.stop()); mic.ac.close(); } catch { /* */ } mic = null; } return; }
  if (mic || !navigator.mediaDevices || !navigator.permissions) return;
  // en iPhone, abrir otro micrófono a la vez interrumpe el dictado: allí se usa la simulación
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return;
  try {
    const p = await navigator.permissions.query({ name: "microphone" });
    if (p.state !== "granted" || !micWanted) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    if (!micWanted) { stream.getTracks().forEach((t) => t.stop()); return; }
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an);
    mic = { stream, ac, an, buf: new Uint8Array(an.fftSize) };
  } catch { mic = null; }
}
function micLevel() {
  mic.an.getByteTimeDomainData(mic.buf); let q = 0;
  for (let i = 0; i < mic.buf.length; i++) { const v = (mic.buf[i] - 128) / 128; q += v * v; }
  return Math.min(1, Math.sqrt(q / mic.buf.length) * 5);
}
function simEnv(now, dt) {
  if (now > pauseT && now > sylT) { sylT = now + rnd(110, 230); env = Math.max(env, rnd(.45, 1)); if (Math.random() < .07) { pauseT = now + rnd(250, 600); sylT = pauseT; } }
  env *= Math.pow(.006, dt); return env;
}

function start() { if (!raf && !document.hidden) { lastNow = performance.now(); raf = requestAnimationFrame(frame); } }
document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); });

function frame(now) {
  raf = 0;
  const dt = Math.min(.05, (now - lastNow) / 1000); lastNow = now;
  const m = effMode();
  let a = 0;
  if (m === "respondiendo") a = simEnv(now, dt);
  else if (m === "escuchando") a = mic ? micLevel() : simEnv(now, dt) * (.5 + .5 * Math.sin(now / 330)) * .8;
  else env *= .9;
  boost *= .9; a = Math.min(1, a + boost * .4);
  amp += (a - amp) * (a > amp ? .45 : .12);
  const wave = m === "escuchando" || m === "respondiendo" ? amp : 0;
  let any = false;
  for (const it of instances) if (it.wrap.offsetParent !== null && it.W) { draw(it, now / 1000, m, wave); any = true; }
  if (any) raf = requestAnimationFrame(frame);
  else setTimeout(start, 400); // nada visible: revisar de vez en cuando sin gastar batería
}

function draw(it, t, m, wave) {
  const { ctx, g, P, W, H } = it, dpr = it.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const target = dim ? .2 : { reposo: .35, escuchando: 1, pensando: .8, respondiendo: .9 }[m] ?? .35;
  it.lvl += (target - it.lvl) * .06; const lvl = it.lvl;
  const base = dim ? .0012 : { reposo: .0025, escuchando: .003, pensando: .006, respondiendo: .004 }[m] ?? .0025;
  it.vy += (base - it.vy) * .03; it.ry += it.vy;
  const small = W < 140, R0 = Math.min(W, H) * (small ? .40 : .36), R = R0 * (1 + .09 * wave), ox = W / 2, oy = H / 2, f = 2.6;
  const cy = Math.cos(it.ry), sy = Math.sin(it.ry), cx = Math.cos(it.rx), sx = Math.sin(it.rx);
  for (let i = 0; i < g.N.length; i++) {
    const n = g.N[i]; let x = n.x, y = n.y, z = n.z;
    if (wave > .01) { const k = 1 + wave * .11 * Math.sin(n.r * 9 - t * 11); x *= k; y *= k; z *= k; }
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx, s = f / (f + z2);
    const p = P[i]; p.sx = ox + x1 * R * s; p.sy = oy + y1 * R * s; p.z = z2; p.s = s;
  }
  const breath = m === "reposo" ? .5 + .5 * Math.sin(t * 1.4) : .7;
  let gr = ctx.createRadialGradient(ox, oy, 0, ox, oy, R * 1.3);
  gr.addColorStop(0, `rgba(0, 255, 156,${.10 + .10 * lvl * breath + .25 * wave})`); gr.addColorStop(.6, "rgba(0, 255, 156,.03)"); gr.addColorStop(1, "rgba(0, 255, 156,0)");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = `rgba(0, 255, 156,${.14 + .15 * lvl})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ox, oy, R * 1.08, 0, 7); ctx.stroke();
  if (wave > .02) {
    for (let L = 0; L < 2; L++) {
      ctx.beginPath();
      for (let k = 0; k <= 96; k++) {
        const th = k / 96 * Math.PI * 2, w = Math.sin(th * 6 + t * (7 + L * 3)) * .6 + Math.sin(th * 11 - t * 9) * .4;
        const rr = R * (1.14 + L * .05) + w * R * .10 * wave * (1 - L * .4), X = ox + Math.cos(th) * rr, Y = oy + Math.sin(th) * rr;
        k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      const rc = L === 0 ? '255,45,74' : '0,255,156'; ctx.strokeStyle = `rgba(${rc},${(.8 - L * .3) * Math.min(1, wave * 1.6)})`; ctx.lineWidth = L ? 1.2 : 1.8; ctx.stroke();
    }
  }
  ctx.lineWidth = small ? .5 : .6;
  for (const [a, b] of g.E) {
    const p = P[a], q = P[b], d = (2 - (p.z + q.z) / 2) / 3, c = COL[g.N[b].cat];
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(.07 + .20 * lvl + .35 * wave) * d})`;
    ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); ctx.stroke();
  }
  const rate = dim ? 0 : m === "pensando" ? 6 : m === "respondiendo" ? 2 : m === "escuchando" ? .5 : 0;
  for (let k = 0; k < rate; k++) if (Math.random() < .5 && it.pulses.length < (it.lite ? 60 : 140)) it.pulses.push({ e: g.E[(Math.random() * g.E.length) | 0], p: 0, v: rnd(.012, .03), r: Math.random() < .5 });
  ctx.globalCompositeOperation = "lighter";
  for (let i = it.pulses.length - 1; i >= 0; i--) {
    const u = it.pulses[i]; u.p += u.v; if (u.p >= 1) { it.pulses.splice(i, 1); continue; }
    let [a, b] = u.e; if (u.r) [a, b] = [b, a];
    const p = P[a], q = P[b], x = p.sx + (q.sx - p.sx) * u.p, y = p.sy + (q.sy - p.sy) * u.p, al = Math.sin(u.p * Math.PI);
    const red = i % 2 === 0; ctx.fillStyle = red ? `rgba(255,200,205,${.95 * al})` : `rgba(200,255,225,${.9 * al})`; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = red ? `rgba(255,45,74,${.35 * al})` : `rgba(0,255,156,${.25 * al})`; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill();
  }
  const hubScale = small ? .55 : 1;
  for (let i = 0; i < g.N.length; i++) {
    const n = g.N[i], p = P[i], d = (2 - p.z) / 3, c = COL[n.cat];
    if (n.hub) {
      const cnt = counts && counts[n.label] ? Math.min(1, Math.log10(1 + counts[n.label]) / 2) : 0;
      const rr = (6 + 3 * lvl + 4 * cnt) * p.s * hubScale * (1 + .15 * Math.sin(t * 2 + i) * lvl);
      gr = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rr * 3); gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${.45 * d + .35 * lvl})`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.sx, p.sy, rr * 3, 0, 7); ctx.fill();
      ctx.fillStyle = c[0] > 200 ? `rgba(255,225,228,${.6 + .4 * d})` : `rgba(225,255,240,${.6 + .4 * d})`; ctx.beginPath(); ctx.arc(p.sx, p.sy, rr * .45, 0, 7); ctx.fill();
    } else {
      const tw = m === "escuchando" ? .6 + .4 * Math.sin(t * 6 + i * 1.7) : 1, a = (.25 + .6 * lvl * tw) * d, rr = (small ? .7 : 1) * (1 + 1.2 * d);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`; ctx.fillRect(p.sx - rr / 2, p.sy - rr / 2, rr, rr);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  if (!it.lite && W >= 180) {
    ctx.font = "600 8.5px Orbitron, Rajdhani, monospace"; ctx.textAlign = "center";
    if (showLabels) for (const i of g.hubs) { const p = P[i], d = (2 - p.z) / 3; if (d < .45) continue; ctx.fillStyle = `rgba(232,255,243,${.15 + .65 * d * d})`; ctx.fillText(g.N[i].label.toUpperCase(), p.sx, p.sy - 11 * p.s); }
  }
}
