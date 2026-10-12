// Paneles de Ocio: Damas internacionales contra Antares, Trivia de historia y misterios, y Robótica.
import { memory } from "./memory.js";
import * as CC from "./draughts.js";
import * as TV from "./trivia.js";
import * as RB from "./robotics.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const K_CC = "antares.games.damas.v1";

let deps = { askJson: null, hasKey: () => false, askTutor: () => {}, setTutor: () => {}, onChange: () => {} };
let rerender = () => {};
export function initOcio(d, rerenderFn) { deps = { ...deps, ...d }; rerender = rerenderFn; }

// ---------- Estado en memoria (se borra al bloquear) ----------
let cc = null, sel = -1, aiTimer = null, ccMsg = "";
let tv = { topic: "mezcla", queue: [], cur: null, chosen: null, busy: false, ctrl: null, error: "", note: "" };
let rbOpen = null;
export function resetOcio() {
  clearTimeout(aiTimer); aiTimer = null; aiReq++;
  if (tv.ctrl) tv.ctrl.abort();
  cc = null; sel = -1; ccMsg = "";
  tv = { topic: "mezcla", queue: [], cur: null, chosen: null, busy: false, ctrl: null, error: "", note: "" };
  rbOpen = null;
}
export function clearStatus() { ccMsg = ""; }

// ================= Damas (internacionales 10x10) =================
const stats = () => (cc && cc.score) || { w: 0, l: 0, d: 0 };
const DIFF_LABEL = { normal: "Normal", medio: "Medio", pro: "Pro" };
let aiWorker = null, aiReq = 0, animKey = "";
function loadCC() {
  if (cc) return cc;
  const saved = CC.deserialize(memory.getData(K_CC, null));
  cc = saved || CC.newGame();
  if (!DIFF_LABEL[cc.difficulty]) cc.difficulty = "medio";
  if (!cc.score) cc.score = { w: 0, l: 0, d: 0 };
  return cc;
}
function saveCC() {
  const r = memory.saveData(K_CC, CC.serialize(cc));
  if (r && r.ok === false) ccMsg = "No pude guardar la partida: el almacenamiento está lleno.";
}
function finishIfWon() {
  if (!cc.winner || cc.counted) return;
  const s = { ...stats() };
  if (cc.winner === CC.HUMAN) s.w++; else if (cc.winner === CC.AI) s.l++; else s.d++;
  cc.score = s; cc.counted = true;
}
function computeAI(game, difficulty) {
  return new Promise((resolve) => {
    try {
      if (!aiWorker) aiWorker = new Worker(new URL("./draughts-worker.js", import.meta.url), { type: "module" });
      const id = ++aiReq;
      const t = setTimeout(() => { resolve(CC.aiMove(game, difficulty)); }, 8000);
      aiWorker.onmessage = (e) => { if (e.data.id !== id) return; clearTimeout(t); resolve(e.data.move); };
      aiWorker.onerror = () => { clearTimeout(t); aiWorker = null; resolve(CC.aiMove(game, difficulty)); };
      aiWorker.postMessage({ id, game: { board: game.board, turn: game.turn }, difficulty });
    } catch { setTimeout(() => resolve(CC.aiMove(game, difficulty)), 0); }
  });
}
function scheduleAI() {
  clearTimeout(aiTimer);
  if (!cc || cc.winner || cc.turn !== CC.AI) return;
  const plies = cc.plies;
  aiTimer = setTimeout(async () => {
    if (!cc || cc.turn !== CC.AI || cc.winner) { aiTimer = null; return; }
    const m = await computeAI(cc, cc.difficulty);
    aiTimer = null;
    if (!cc || cc.turn !== CC.AI || cc.plies !== plies) return; // se deshizo o se reinició mientras pensaba
    const legal = m && CC.legalMoves(cc).find((x) => x.from === m.from && x.to === m.to && x.caps.join() === m.caps.join());
    if (!legal) { cc = { ...cc, winner: CC.HUMAN }; finishIfWon(); saveCC(); rerender(); return; }
    const score = cc.score;
    cc = CC.applyMove(cc, legal); cc.score = score;
    ccMsg = legal.caps.length ? `Antares capturó ${legal.caps.length} ${legal.caps.length === 1 ? "pieza" : "piezas"}.` : "";
    if (cc.last.promoted) ccMsg = (ccMsg + " Antares coronó una dama.").trim();
    finishIfWon(); saveCC(); rerender();
  }, 450);
  aiTimer = aiTimer || 1;
}
const xy = (i) => [(i % 10) + 0.5, ((i / 10) | 0) + 0.5];
function boardSvg() {
  const g = cc, moves = g.turn === CC.HUMAN && !g.winner ? CC.legalMoves(g) : [];
  const movable = new Set(moves.map((m) => m.from));
  const dests = sel >= 0 ? moves.filter((m) => m.from === sel) : [];
  const last = g.last, k = last ? `${g.plies}` : "";
  const animate = k && k !== animKey; if (animate) animKey = k;
  let sq = "";
  for (let i = 0; i < 100; i++) {
    const [x, y] = xy(i), dark = CC.isDark(i);
    const cls = ["sq", dark ? "dk" : "lt", last && (last.from === i || last.to === i) ? "last" : "", dests.some((m) => m.to === i) ? "dest" : ""].filter(Boolean).join(" ");
    sq += `<rect class="${cls}" data-i="${i}" x="${x - .5}" y="${y - .5}" width="1" height="1"/>`;
  }
  let path = "";
  if (last && last.path.length > 1) path = `<polyline class="d-path ${last.player === CC.AI ? "p2" : "p1"}" points="${last.path.map((i) => xy(i).join(",")).join(" ")}"/>`;
  let pcs = "";
  for (let i = 0; i < 100; i++) {
    const v = g.board[i]; if (!v) continue;
    const [x, y] = xy(i);
    let style = "";
    if (animate && last.to === i) { const [fx, fy] = xy(last.from); style = ` style="--dx:${fx - x}px;--dy:${fy - y}px"`; }
    const cls = ["pc", v > 0 ? "p1" : "p2", Math.abs(v) === 2 ? "king" : "", sel === i ? "sel" : "", movable.has(i) && sel < 0 ? "can" : "", style ? "moving" : ""].filter(Boolean).join(" ");
    pcs += `<g class="${cls}" data-i="${i}"${style}><g transform="translate(${x} ${y})"><circle r=".41" class="rim"/><circle r=".33" class="top"/><circle r=".2" class="ring"/>${Math.abs(v) === 2 ? `<path class="crown" d="M-.2 .08 L-.22 -.12 L-.11 -.02 L0 -.17 L.11 -.02 L.22 -.12 L.2 .08 Z"/>` : ""}</g></g>`;
  }
  if (animate && last.caps.length) for (const c of last.caps) { const [x, y] = xy(c); pcs += `<g class="pc ghost ${last.player === CC.AI ? "p1" : "p2"}"><g transform="translate(${x} ${y})"><circle r=".41" class="rim"/><circle r=".33" class="top"/></g></g>`; }
  const dots = dests.map((m) => { const [x, y] = xy(m.to); return `<circle class="d-dot" cx="${x}" cy="${y}" r=".16" data-i="${m.to}"/>`; }).join("");
  const h = g.board.filter((v) => v > 0).length, a = g.board.filter((v) => v < 0).length;
  return `<svg class="dr-board" id="cc-board" viewBox="-0.25 -0.25 10.5 10.5" role="img" aria-label="Tablero de damas internacionales. Sus piezas: ${h}. Piezas de Antares: ${a}.">
    <rect class="frame" x="-.25" y="-.25" width="10.5" height="10.5" rx=".18"/>${sq}${path}${pcs}${dots}</svg>`;
}
function ccStatus() {
  const g = cc;
  if (g.winner === CC.HUMAN) return "¡Ganó usted! Excelente partida.";
  if (g.winner === CC.AI) return "Ganó Antares esta vez. ¿La revancha?";
  if (g.winner === CC.DRAW) return "Tablas.";
  if (g.turn === CC.AI) return "Turno de Antares: está pensando…";
  const moves = CC.legalMoves(g), n = moves[0]?.caps.length || 0;
  if (sel >= 0) { const c = moves.filter((m) => m.from === sel).length; return c ? `Toque una casilla marcada (${c} ${c === 1 ? "opción" : "opciones"}).` : "Esa pieza no puede mover ahora. Elija una que brille."; }
  return n ? `Su turno: captura obligatoria de ${n} ${n === 1 ? "pieza" : "piezas"}.` : "Su turno: toque una de sus piezas doradas.";
}
function ccHtml() {
  loadCC();
  const s = stats();
  if (cc.turn === CC.AI && !cc.winner && !aiTimer) scheduleAI();
  const diff = Object.entries(DIFF_LABEL).map(([id, l]) => `<button type="button" class="pick${cc.difficulty === id ? " on" : ""}" data-diff="${id}" aria-pressed="${cc.difficulty === id}">${l}</button>`).join("");
  const cap = cc.captured || { h: 0, a: 0 };
  return `
    <div class="cc-head">
      <div class="seg-mini" role="group" aria-label="Dificultad">${diff}</div>
      <p class="cc-score" aria-label="Marcador">Usted ${s.w} · Antares ${s.l}${s.d ? ` · Tablas ${s.d}` : ""}</p>
    </div>
    <div class="dr-turn"><span class="turn-chip p1${cc.turn === CC.HUMAN && !cc.winner ? " on" : ""}"><i></i>Usted · capturó ${cap.h}</span><span class="turn-chip p2${cc.turn === CC.AI && !cc.winner ? " on" : ""}"><i></i>Antares · capturó ${cap.a}</span></div>
    <p class="cc-status${cc.winner ? " done" : ""}" id="cc-status" role="status" aria-live="polite">${esc(ccStatus())}</p>
    <div class="cc-wrap">${boardSvg()}</div>
    ${ccMsg ? `<p class="wp-status">${esc(ccMsg)}</p>` : ""}
    <div class="btn-row">
      <button type="button" class="btn" id="cc-undo"${cc.undo.length && cc.turn === CC.HUMAN ? "" : " disabled"}>Deshacer</button>
      <button type="button" class="btn primary" id="cc-new">Nueva partida</button>
    </div>
    <details class="howto"><summary>Cómo se juega</summary>
      <p>Damas internacionales: tablero de 10×10, 20 piezas por lado. Usted juega con las doradas y empieza.
      Los peones avanzan en diagonal una casilla, pero capturan hacia adelante y hacia atrás. Capturar es obligatorio y
      debe tomar la jugada que capture más piezas; puede encadenar saltos.</p>
      <p>Un peón se corona dama solo si termina su jugada en la última fila. La dama «vuela»: se mueve y captura a cualquier distancia en diagonal.
      Pierde quien se queda sin piezas o sin jugadas. Hay tablas por triple repetición o 25 jugadas seguidas solo con damas sin capturar.</p>
      <p>Normal: Antares juega suelto y a veces se equivoca. Medio: calcula unas 4 jugadas. Pro: piensa hasta 1,5 segundos y calcula a fondo.</p>
    </details>`;
}
function ccBind(body) {
  const svg = body.querySelector("#cc-board");
  svg?.addEventListener("click", (ev) => {
    if (!cc || cc.winner || cc.turn !== CC.HUMAN) return;
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const mtx = svg.getScreenCTM(); if (!mtx) return;
    const p = pt.matrixTransform(mtx.inverse());
    const c = Math.floor(p.x), r = Math.floor(p.y);
    if (c < 0 || c > 9 || r < 0 || r > 9) { sel = -1; rerender(); return; }
    const i = r * 10 + c;
    const moves = CC.legalMoves(cc);
    if (cc.board[i] > 0) { sel = sel === i ? -1 : i; ccMsg = ""; rerender(); return; }
    if (sel >= 0) {
      const m = moves.find((x) => x.from === sel && x.to === i);
      if (m) {
        const score = cc.score;
        cc = CC.applyMove(cc, m); cc.score = score; sel = -1;
        ccMsg = m.caps.length > 1 ? `¡Captura múltiple: ${m.caps.length} piezas!` : m.caps.length ? "Captura." : "";
        if (cc.last.promoted) ccMsg = (ccMsg + " ¡Coronó una dama!").trim();
        finishIfWon(); saveCC(); rerender(); scheduleAI(); return;
      }
      sel = -1; rerender();
    }
  });
  body.querySelector("#cc-undo")?.addEventListener("click", () => {
    clearTimeout(aiTimer); aiTimer = null; aiReq++;
    const score = cc.score, counted = cc.counted;
    cc = CC.undoMove(cc); cc.score = score; cc.counted = cc.winner ? counted : false; sel = -1; animKey = String(cc.plies); ccMsg = "Jugada deshecha.";
    saveCC(); rerender();
  });
  body.querySelector("#cc-new")?.addEventListener("click", () => {
    if (!cc.winner && cc.plies > 0 && !confirm("¿Empezar una partida nueva? La actual se pierde.")) return;
    clearTimeout(aiTimer); aiTimer = null; aiReq++;
    const score = stats(), difficulty = cc.difficulty;
    cc = CC.newGame({ difficulty }); cc.score = score; sel = -1; ccMsg = "Nueva partida. Usted empieza con las doradas.";
    saveCC(); rerender();
  });
  body.querySelectorAll("[data-diff]").forEach((b) => b.addEventListener("click", () => {
    cc = { ...cc, difficulty: b.dataset.diff }; ccMsg = `Dificultad: ${DIFF_LABEL[b.dataset.diff]}.`; saveCC(); rerender();
  }));
}

// ================= Trivia =================
function tvHtml() {
  const s = TV.loadScore();
  const topics = Object.entries(TV.TOPICS).map(([id, t]) => `<button type="button" class="pick${tv.topic === id ? " on" : ""}" data-topic="${id}" aria-pressed="${tv.topic === id}">${esc(t.label)}</button>`).join("");
  const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
  let card = "";
  if (!deps.hasKey()) card = `<p class="empty-note">Configure su API key de Gemini para jugar a la trivia.</p>`;
  else if (tv.busy) card = `<div class="trivia-card"><p class="empty-note">Preparando y verificando preguntas…</p><button type="button" class="btn" id="tv-stop">Cancelar</button></div>`;
  else if (tv.cur) {
    const q = tv.cur, answered = tv.chosen !== null;
    const opts = q.options.map((o, k) => {
      const cls = answered ? (k === q.answer ? " right" : k === tv.chosen ? " wrong" : " dim") : "";
      return `<button type="button" class="opt${cls}" data-opt="${k}"${answered ? ` aria-disabled="true"` : ""}><b>${"ABCD"[k]}</b><span>${esc(o)}</span></button>`;
    }).join("");
    const ok = answered && tv.chosen === q.answer;
    card = `<div class="trivia-card">
      <p class="tv-topic">${esc(TV.TOPICS[q.topic]?.label || "")}</p>
      <h3 class="tv-q" id="tv-q">${esc(q.question)}</h3>
      <div class="opts" role="group" aria-labelledby="tv-q">${opts}</div>
      ${answered ? `<div class="tv-result ${ok ? "ok" : "ko"}" role="status">
        <p><strong>${ok ? "¡Correcto!" : `Incorrecto. Era la ${"ABCD"[q.answer]}: ${esc(q.options[q.answer])}.`}</strong></p>
        ${q.explanation ? `<p>${esc(q.explanation)}</p>` : ""}
        ${q.source ? `<p class="hint">Tipo de fuente: ${esc(q.source)}</p>` : ""}
      </div>
      <button type="button" class="btn primary" id="tv-next">Siguiente pregunta</button>` : ""}
    </div>`;
  } else card = `<button type="button" class="btn primary" id="tv-start">Empezar</button>`;
  return `
    <div class="picks" role="group" aria-label="Tema">${topics}</div>
    <div class="kpis">
      <div><span>ACIERTOS</span><b id="tv-score">${s.correct}/${s.total}</b></div>
      <div><span>PORCENTAJE</span><b>${pct} %</b></div>
      <div><span>RACHA</span><b>${s.streak}${s.best ? ` <small>(mejor ${s.best})</small>` : ""}</b></div>
    </div>
    ${tv.error ? `<div class="warn-box"><p>${esc(tv.error)}</p></div>` : ""}
    ${tv.note ? `<p class="hint">${esc(tv.note)}</p>` : ""}
    ${card}
    <p class="hint panel-note">Preguntas generadas por Gemini y revisadas por una segunda consulta independiente; solo se muestran las que pasan la revisión. Aun así puede haber errores: si algo le parece raro, consulte una fuente confiable.</p>
    ${s.total ? `<button type="button" class="btn" id="tv-reset">Reiniciar puntaje</button>` : ""}`;
}
async function nextQuestion() {
  tv.chosen = null; tv.error = ""; tv.note = "";
  const q = tv.queue.shift();
  if (q) { tv.cur = q; rerender(); return; }
  tv.cur = null; tv.busy = true; tv.ctrl = new AbortController(); rerender();
  const topic = tv.topic;
  try {
    const r = await TV.fetchQuestions(deps.askJson, topic, { n: 5, signal: tv.ctrl.signal });
    if (!tv.busy) return; // cancelada o bloqueada
    if (r.ok) {
      TV.rememberAsked(r.questions);
      tv.queue = r.questions.slice(1); tv.cur = r.questions[0];
      if (r.dropped) tv.note = `Descarté ${r.dropped} ${r.dropped === 1 ? "pregunta que no pasó" : "preguntas que no pasaron"} la verificación.`;
    } else if (!r.stopped) tv.error = r.error;
  } catch (e) {
    if (e && e.name !== "AbortError") tv.error = "No pude preparar preguntas. Intente de nuevo.";
  } finally {
    tv.busy = false; tv.ctrl = null; rerender();
  }
}
function tvBind(body) {
  body.querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => {
    if (tv.topic === b.dataset.topic) return;
    tv.topic = b.dataset.topic; tv.queue = [];
    if (tv.chosen !== null || !tv.cur) tv.cur = null;
    rerender();
  }));
  body.querySelector("#tv-start")?.addEventListener("click", nextQuestion);
  body.querySelector("#tv-next")?.addEventListener("click", nextQuestion);
  body.querySelector("#tv-stop")?.addEventListener("click", () => { if (tv.ctrl) tv.ctrl.abort(); tv.busy = false; tv.note = "Cancelado."; rerender(); });
  body.querySelector("#tv-reset")?.addEventListener("click", () => { if (confirm("¿Reiniciar el puntaje de la trivia?")) { TV.resetScore(); rerender(); } });
  body.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => {
    if (!tv.cur || tv.chosen !== null) return;
    tv.chosen = Number(b.dataset.opt);
    TV.recordAnswer(tv.cur, tv.chosen === tv.cur.answer);
    rerender();
    document.getElementById("tv-next")?.focus({ preventScroll: true });
  }));
}

// ================= Robótica =================
function rbHtml() {
  const prog = RB.loadProgress();
  const st = RB.progressStats(prog.done);
  const firstOpen = RB.ROADMAP.find((l) => l.steps.some((s) => !prog.done[s.id]))?.id || RB.ROADMAP[0].id;
  const open = rbOpen || firstOpen;
  const levels = RB.ROADMAP.map((l) => {
    const n = l.steps.filter((s) => prog.done[s.id]).length;
    return `<details class="rb-level" data-level="${l.id}"${open === l.id ? " open" : ""}>
      <summary><span class="rb-lv">${esc(l.level)}</span><strong>${esc(l.title)}</strong><small>${n}/${l.steps.length} · ${esc(l.weeks)}</small></summary>
      <ul class="rb-steps">${l.steps.map((s) => `<li><label class="rb-step">
        <input type="checkbox" class="rb-check" data-step="${s.id}"${prog.done[s.id] ? " checked" : ""}>
        <span><b>${esc(s.t)}</b><small>${esc(s.d)}</small></span></label></li>`).join("")}</ul>
    </details>`;
  }).join("");
  const projects = RB.PROJECTS.map((p) => `<h4>${esc(p.level)}</h4><ul>${p.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`).join("");
  return `
    <div class="rb-hero">
      <p class="rb-dream">Meta: construir su propio robot</p>
      <div class="meter"><div class="row"><span>Avance de la ruta</span><b id="rb-pct">${st.n}/${st.total} · ${st.pct} %</b></div>
        <div class="bar" role="progressbar" aria-label="Avance de la ruta de robótica" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.pct}"><i style="width:${st.pct}%"></i></div></div>
      ${st.next ? `<p class="hint">Siguiente paso: <b>${esc(st.next.t)}</b></p>` : `<p class="hint">¡Completó toda la ruta! Hora de su robot autónomo.</p>`}
    </div>
    <h3 class="store-h">Ruta de aprendizaje</h3>
    ${levels}
    <h3 class="store-h">Ideas de proyectos</h3>
    <div class="rb-projects">${projects}</div>
    <h3 class="store-h">Tutor de robótica</h3>
    <form class="add-form" id="rb-form">
      <label class="field-label" for="rb-q">Pregúntele al tutor (se responde en el chat)</label>
      <textarea class="field" id="rb-q" rows="3" maxlength="600" placeholder="Ej.: ¿Cómo conecto un motor DC con un L298N a un ESP32?"></textarea>
      <button class="btn primary" type="submit">Preguntar al tutor</button>
    </form>
    <button type="button" class="btn" id="rb-tutor">Activar modo tutor en el chat</button>
    <p class="hint panel-note">Contenido de referencia sin compras ni enlaces a tiendas. Trabaje con voltajes bajos y siga las indicaciones de seguridad de baterías.</p>`;
}
function rbBind(body) {
  body.querySelectorAll(".rb-check").forEach((c) => c.addEventListener("change", () => {
    const lv = c.closest("[data-level]")?.dataset.level; if (lv) rbOpen = lv;
    RB.toggleStep(c.dataset.step); deps.onChange("robotics"); rerender();
  }));
  body.querySelectorAll("details.rb-level").forEach((d) => d.addEventListener("toggle", () => { if (d.open) rbOpen = d.dataset.level; }));
  body.querySelector("#rb-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = body.querySelector("#rb-q").value.trim();
    if (!q) { body.querySelector("#rb-q").focus(); return; }
    deps.askTutor(q);
  });
  body.querySelector("#rb-tutor")?.addEventListener("click", () => deps.setTutor(true));
}

// ================= API del panel =================
export function html(tab) {
  if (tab === "trivia") return tvHtml();
  if (tab === "robotica") return rbHtml();
  return ccHtml();
}
export function bind(tab, body) {
  if (!body) return;
  if (tab === "trivia") tvBind(body);
  else if (tab === "robotica") rbBind(body);
  else ccBind(body);
}

// v1.17: Antares puede iniciar una partida de damas por voz
export function newDamasGame(level = "medio") {
  loadCC();
  clearTimeout(aiTimer); aiTimer = null; aiReq++;
  const difficulty = DIFF_LABEL[level] ? level : "medio", score = stats();
  cc = CC.newGame({ difficulty }); cc.score = score; sel = -1; ccMsg = `Nueva partida en nivel ${DIFF_LABEL[difficulty]}. Usted empieza con las doradas.`;
  saveCC();
  return DIFF_LABEL[difficulty];
}
