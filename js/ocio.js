// Paneles de Ocio: Damas chinas contra Antares, Trivia de historia y misterios, y Robótica.
import { memory } from "./memory.js";
import * as CC from "./chinese-checkers.js";
import * as TV from "./trivia.js";
import * as RB from "./robotics.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const K_CC = "antares.games.cc.v1";

let deps = { askJson: null, hasKey: () => false, askTutor: () => {}, setTutor: () => {}, onChange: () => {} };
let rerender = () => {};
export function initOcio(d, rerenderFn) { deps = { ...deps, ...d }; rerender = rerenderFn; }

// ---------- Estado en memoria (se borra al bloquear) ----------
let cc = null, sel = -1, aiTimer = null, ccMsg = "";
let tv = { topic: "mezcla", queue: [], cur: null, chosen: null, busy: false, ctrl: null, error: "", note: "" };
let rbOpen = null;
export function resetOcio() {
  clearTimeout(aiTimer); aiTimer = null;
  if (tv.ctrl) tv.ctrl.abort();
  cc = null; sel = -1; ccMsg = "";
  tv = { topic: "mezcla", queue: [], cur: null, chosen: null, busy: false, ctrl: null, error: "", note: "" };
  rbOpen = null;
}
export function clearStatus() { ccMsg = ""; }

// ================= Damas chinas =================
const stats = () => (cc && cc.score) || { w: 0, l: 0, d: 0 };
function loadCC() {
  if (cc) return cc;
  const saved = CC.deserialize(memory.getData(K_CC, null));
  cc = saved || CC.newGame();
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
function scheduleAI() {
  clearTimeout(aiTimer);
  if (!cc || cc.winner || cc.turn !== CC.AI) return;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (!cc || cc.turn !== CC.AI || cc.winner) return;
    const m = CC.aiMove(cc, cc.difficulty);
    if (!m) { cc = { ...cc, winner: CC.HUMAN }; finishIfWon(); saveCC(); rerender(); return; }
    const score = cc.score;
    cc = CC.applyMove(cc, m); cc.score = score;
    finishIfWon(); saveCC(); rerender();
  }, 550);
}

const VB = (() => {
  const xs = CC.CELLS.map((c) => c.px), ys = CC.CELLS.map((c) => c.py);
  const m = 1.3;
  const minX = Math.min(...xs) - m, minY = Math.min(...ys) - m;
  return { minX, minY, w: Math.max(...xs) - minX + m, h: Math.max(...ys) - minY + m };
})();
const f2 = (n) => Number(n.toFixed(3));
function starPolys() {
  // dos triángulos grandes que forman la estrella
  const tri = (pts) => pts.map(([x, z]) => `${f2(Math.sqrt(3) * (x + z / 2))},${f2(1.5 * z)}`).join(" ");
  const pad = 1.1;
  return `<polygon class="star" points="${tri([[4 * pad, -8 * pad], [4 * pad, 4 * pad], [-8 * pad, 4 * pad]])}"/>` +
         `<polygon class="star" points="${tri([[-4 * pad, 8 * pad], [-4 * pad, -4 * pad], [8 * pad, -4 * pad]])}"/>`;
}
function boardSvg() {
  const g = cc;
  const dests = sel >= 0 ? CC.destinations(g, sel) : new Map();
  const last = g.last;
  const lastPath = last && last.path ? last.path.map((i) => `${f2(CC.CELLS[i].px)},${f2(CC.CELLS[i].py)}`).join(" ") : "";
  const cells = CC.CELLS.map((c) => {
    const v = g.board[c.i];
    const cls = ["cell", CC.inGoal(CC.HUMAN, c.i) ? "goal-h" : CC.inGoal(CC.AI, c.i) ? "goal-a" : "",
      dests.has(c.i) ? "dest" : "", sel === c.i ? "sel" : "", last && (last.to === c.i) ? "last-to" : "", last && last.from === c.i ? "last-from" : ""].filter(Boolean).join(" ");
    const piece = v ? `<circle class="peg ${v === CC.HUMAN ? "p1" : "p2"}" cx="${f2(c.px)}" cy="${f2(c.py)}" r="0.62"/>` : "";
    return `<g class="${cls}" data-i="${c.i}"><circle class="hole" cx="${f2(c.px)}" cy="${f2(c.py)}" r="${dests.has(c.i) ? 0.5 : 0.36}"/>${piece}</g>`;
  }).join("");
  const mine = CC.inGoalCount(g.board, CC.HUMAN), theirs = CC.inGoalCount(g.board, CC.AI);
  return `<svg class="cc-board" id="cc-board" viewBox="${f2(VB.minX)} ${f2(VB.minY)} ${f2(VB.w)} ${f2(VB.h)}" role="img"
    aria-label="Tablero de damas chinas. Sus fichas en la meta: ${mine} de 10. Fichas de Antares en su meta: ${theirs} de 10.">
    ${starPolys()}
    ${lastPath ? `<polyline class="last-path ${last.player === CC.AI ? "p2" : "p1"}" points="${lastPath}"/>` : ""}
    ${cells}
  </svg>`;
}
function ccStatus() {
  const g = cc;
  if (g.winner === CC.HUMAN) return "¡Ganó usted! Excelente partida.";
  if (g.winner === CC.AI) return "Ganó Antares esta vez. ¿La revancha?";
  if (g.winner === -1) return "Tablas: se alcanzó el límite de jugadas.";
  if (g.turn === CC.AI) return "Antares está pensando…";
  if (sel >= 0) { const n = CC.destinations(g, sel).size; return n ? `Toque una casilla marcada (${n} ${n === 1 ? "opción" : "opciones"}).` : "Esa ficha no tiene jugadas. Elija otra."; }
  return "Su turno: toque una de sus fichas cian. Puede saltar en cadena.";
}
function ccHtml() {
  loadCC();
  const s = stats();
  if (cc.turn === CC.AI && !cc.winner && !aiTimer) scheduleAI();
  return `
    <div class="cc-head">
      <div class="seg-mini" role="group" aria-label="Dificultad">
        <button type="button" class="pick${cc.difficulty === "facil" ? " on" : ""}" data-diff="facil" aria-pressed="${cc.difficulty === "facil"}">Fácil</button>
        <button type="button" class="pick${cc.difficulty === "normal" ? " on" : ""}" data-diff="normal" aria-pressed="${cc.difficulty === "normal"}">Normal</button>
      </div>
      <p class="cc-score" aria-label="Marcador">Usted ${s.w} · Antares ${s.l}${s.d ? ` · Tablas ${s.d}` : ""}</p>
    </div>
    <p class="cc-status${cc.winner ? " done" : ""}" id="cc-status" role="status" aria-live="polite">${esc(ccStatus())}</p>
    <div class="cc-wrap">${boardSvg()}</div>
    <p class="cc-legend"><span class="dot p1"></span>Usted: de abajo hacia arriba · <span class="dot p2"></span>Antares: de arriba hacia abajo · En meta: ${CC.inGoalCount(cc.board, CC.HUMAN)}/10 contra ${CC.inGoalCount(cc.board, CC.AI)}/10</p>
    ${ccMsg ? `<p class="wp-status">${esc(ccMsg)}</p>` : ""}
    <div class="btn-row">
      <button type="button" class="btn" id="cc-undo"${cc.undo.length && cc.turn === CC.HUMAN ? "" : " disabled"}>Deshacer</button>
      <button type="button" class="btn primary" id="cc-new">Nueva partida</button>
    </div>
    <details class="howto"><summary>Cómo se juega</summary>
      <p>Gana quien lleve primero sus 10 fichas a la punta opuesta. En cada turno mueve una ficha a una casilla vecina libre,
      o salta sobre una ficha vecina (suya o de Antares) a la casilla libre del otro lado; puede encadenar varios saltos.
      Las fichas no se comen. Una ficha que ya entró a la meta no puede salir. La partida se guarda sola.</p>
      <p>Fácil: Antares avanza a lo más directo. Normal: piensa también en su mejor respuesta.</p>
    </details>`;
}
function ccBind(body) {
  const svg = body.querySelector("#cc-board");
  svg?.addEventListener("click", (ev) => {
    if (!cc || cc.winner || cc.turn !== CC.HUMAN) return;
    let i = Number(ev.target.closest("[data-i]")?.dataset.i);
    if (!Number.isInteger(i)) {
      // tocar cerca de una casilla también vale
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const m = svg.getScreenCTM(); if (!m) return;
      const p = pt.matrixTransform(m.inverse());
      let best = -1, bd = 1.0;
      for (const c of CC.CELLS) { const d = Math.hypot(c.px - p.x, c.py - p.y); if (d < bd) { bd = d; best = c.i; } }
      i = best;
    }
    if (i < 0) { sel = -1; rerender(); return; }
    if (cc.board[i] === CC.HUMAN) { sel = sel === i ? -1 : i; ccMsg = ""; rerender(); return; }
    if (sel >= 0) {
      const path = CC.destinations(cc, sel).get(i);
      if (path) {
        const score = cc.score;
        cc = CC.applyMove(cc, { from: sel, to: i, path }); cc.score = score;
        sel = -1;
        const jumps = CC.NB[path[0]].includes(path[1]) ? 0 : path.length - 1;
        ccMsg = jumps > 1 ? `Salto en cadena: ${jumps} saltos.` : jumps === 1 ? "Salto." : "";
        finishIfWon(); saveCC(); rerender(); scheduleAI(); return;
      }
      sel = -1; rerender();
    }
  });
  body.querySelector("#cc-undo")?.addEventListener("click", () => {
    clearTimeout(aiTimer); aiTimer = null;
    const score = cc.score;
    cc = CC.undoMove(cc); cc.score = score; cc.counted = false; sel = -1; ccMsg = "Jugada deshecha.";
    saveCC(); rerender();
  });
  body.querySelector("#cc-new")?.addEventListener("click", () => {
    if (!cc.winner && cc.plies > 0 && !confirm("¿Empezar una partida nueva? La actual se pierde.")) return;
    clearTimeout(aiTimer); aiTimer = null;
    const score = stats(), difficulty = cc.difficulty;
    cc = CC.newGame({ difficulty }); cc.score = score; sel = -1; ccMsg = "Nueva partida. Usted empieza.";
    saveCC(); rerender();
  });
  body.querySelectorAll("[data-diff]").forEach((b) => b.addEventListener("click", () => {
    cc = { ...cc, difficulty: b.dataset.diff }; ccMsg = `Dificultad: ${b.dataset.diff === "facil" ? "fácil" : "normal"}.`; saveCC(); rerender();
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
