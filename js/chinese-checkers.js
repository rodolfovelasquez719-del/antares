// Damas chinas para 2 jugadores en el tablero de estrella de 121 casillas.
// Coordenadas cúbicas (x, y, z) con x + y + z = 0. La estrella es la unión de dos triángulos grandes:
// A = {x, y, z ≤ 4} y B = {x, y, z ≥ −4}. Usted (1) sale de la punta de abajo (z ≥ 5) hacia la de arriba
// (z ≤ −5); Antares (2) hace lo contrario. Reglas: un paso a una casilla vecina libre, o una cadena de saltos
// sobre fichas (de cualquier color) a la casilla libre del otro lado. Una ficha que ya entró a su meta no sale.
export const HUMAN = 1, AI = 2;
export const DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
const SQ3 = Math.sqrt(3);

export const CELLS = [];
const index = new Map();
for (let z = -8; z <= 8; z++) {
  for (let x = -8; x <= 8; x++) {
    const y = -x - z;
    const inA = x <= 4 && y <= 4 && z <= 4;
    const inB = x >= -4 && y >= -4 && z >= -4;
    if (!inA && !inB) continue;
    index.set(`${x},${z}`, CELLS.length);
    CELLS.push({ i: CELLS.length, x, y, z, px: SQ3 * (x + z / 2), py: 1.5 * z });
  }
}
export const N = CELLS.length; // 121
const at = (x, z) => (index.has(`${x},${z}`) ? index.get(`${x},${z}`) : -1);
export const NB = CELLS.map((c) => DIRS.map(([dx, , dz]) => at(c.x + dx, c.z + dz)));
export const START = { [HUMAN]: CELLS.filter((c) => c.z >= 5).map((c) => c.i), [AI]: CELLS.filter((c) => c.z <= -5).map((c) => c.i) };
export const GOAL = { [HUMAN]: START[AI], [AI]: START[HUMAN] };
const GOALSET = { [HUMAN]: new Set(GOAL[HUMAN]), [AI]: new Set(GOAL[AI]) };
export const inGoal = (player, i) => GOALSET[player].has(i);
export const MAX_PLIES = 400; // tablas si se llega aquí sin ganador

// distancia "de filas" a la punta de la meta (0 = en la punta)
const rowDist = (player, i) => (player === HUMAN ? CELLS[i].z + 8 : 8 - CELLS[i].z);
const lateral = (i) => Math.abs(CELLS[i].x - CELLS[i].y);

export function newGame({ difficulty = "normal" } = {}) {
  const board = new Array(N).fill(0);
  for (const i of START[HUMAN]) board[i] = HUMAN;
  for (const i of START[AI]) board[i] = AI;
  return { board, turn: HUMAN, winner: 0, plies: 0, difficulty, last: null, undo: [], score: null };
}

// Destinos de la ficha en «from»: Map(destino → camino [from, …, destino]). Los saltos en cadena usan BFS (camino más corto).
export function destinations(state, from) {
  const b = state.board, player = b[from], out = new Map();
  if (!player) return out;
  for (const n of NB[from]) if (n >= 0 && !b[n]) out.set(n, [from, n]);
  const saved = b[from]; b[from] = 0;
  const seen = new Set([from]);
  const queue = [[from]];
  while (queue.length) {
    const path = queue.shift();
    const cur = path[path.length - 1];
    for (let d = 0; d < 6; d++) {
      const mid = NB[cur][d];
      if (mid < 0 || !b[mid]) continue;
      const land = NB[mid][d];
      if (land < 0 || b[land] || seen.has(land)) continue;
      seen.add(land);
      const np = [...path, land];
      if (!out.has(land)) out.set(land, np);
      queue.push(np);
    }
  }
  b[from] = saved;
  // regla de meta: una ficha que ya está en su meta no puede salir
  if (inGoal(player, from)) for (const k of [...out.keys()]) if (!inGoal(player, k)) out.delete(k);
  return out;
}

export function legalMoves(state, player = state.turn) {
  const moves = [];
  for (let i = 0; i < N; i++) {
    if (state.board[i] !== player) continue;
    for (const [to, path] of destinations(state, i)) moves.push({ from: i, to, path });
  }
  return moves;
}

export function isLegal(state, move) {
  if (state.winner || !move || state.board[move.from] !== state.turn) return false;
  return destinations(state, move.from).has(move.to);
}

// ¿Ganó «player»? Todas sus fichas en la meta, o la meta llena con al menos una suya (evita que el rival la bloquee).
export function hasWon(board, player) {
  const goal = GOAL[player];
  let own = 0, full = true;
  for (const i of goal) { if (board[i] === player) own++; else if (!board[i]) full = false; }
  return own === goal.length || (full && own > 0);
}
export const inGoalCount = (board, player) => GOAL[player].reduce((n, i) => n + (board[i] === player ? 1 : 0), 0);

export function applyMove(state, move, { record = true } = {}) {
  const path = move.path || destinations(state, move.from).get(move.to) || [move.from, move.to];
  const board = state.board.slice();
  const player = board[move.from];
  board[move.to] = player; board[move.from] = 0;
  let winner = hasWon(board, player) ? player : 0;
  const plies = state.plies + 1;
  if (!winner && plies >= MAX_PLIES) winner = -1; // tablas
  const undo = record && player === HUMAN ? [...state.undo, { board: state.board, last: state.last, plies: state.plies }].slice(-30) : state.undo;
  return { ...state, board, winner, plies, turn: player === HUMAN ? AI : HUMAN, last: { from: move.from, to: move.to, path, player }, undo };
}

// Deshacer: vuelve al momento antes de la última jugada suya (quita también la respuesta de Antares)
export function undoMove(state) {
  if (!state.undo.length) return state;
  const prev = state.undo[state.undo.length - 1];
  return { ...state, board: prev.board.slice(), last: prev.last, plies: prev.plies, winner: 0, turn: HUMAN, undo: state.undo.slice(0, -1) };
}

// ---------- IA ----------
// Evaluación desde el punto de vista de «player»: menos filas por recorrer es mejor; castiga fichas rezagadas y
// alejadas del eje central (estorban los saltos largos).
export function evaluate(board, player) {
  let sum = 0, worst = 0, side = 0;
  for (let i = 0; i < N; i++) {
    if (board[i] !== player) continue;
    const d = rowDist(player, i);
    sum += d; if (d > worst) worst = d;
    if (!inGoal(player, i)) side += lateral(i);
  }
  return -(sum + 0.6 * worst + 0.15 * side);
}
const other = (p) => (p === HUMAN ? AI : HUMAN);
const gainOf = (player, m) => rowDist(player, m.from) - rowDist(player, m.to);

function bestGain(board, player) {
  let best = -Infinity;
  const st = { board };
  for (let i = 0; i < N; i++) {
    if (board[i] !== player) continue;
    for (const to of destinations(st, i).keys()) { const g = rowDist(player, i) - rowDist(player, to); if (g > best) best = g; }
  }
  return best === -Infinity ? 0 : best;
}

// level: "facil" (codicioso con algo de azar) o "normal" (mira la mejor respuesta del rival)
export function aiMove(state, level = state.difficulty || "normal", rng = Math.random) {
  const player = state.turn;
  const moves = legalMoves(state, player);
  if (!moves.length) return null;
  const opp = other(player);
  const last = state.last && state.last.player === player ? state.last : null;
  // jugada ganadora inmediata
  for (const m of moves) { const b = state.board.slice(); b[m.to] = player; b[m.from] = 0; if (hasWon(b, player)) return m; }
  if (level === "facil") {
    const scored = moves.map((m) => ({ m, s: gainOf(player, m) + rng() * 2.2 - (last && m.to === last.from && m.from === last.to ? 3 : 0) }))
      .sort((a, b) => b.s - a.s);
    return (rng() < 0.25 && scored[1] ? scored[1] : scored[0]).m;
  }
  // 2 jugadas: para cada una de mis mejores jugadas se busca la mejor respuesta del rival (minimax) y se suma
  // cuánto podré avanzar después.
  const base = evaluate(state.board, player) - evaluate(state.board, opp);
  const ranked = moves.map((m) => {
    const b = state.board.slice(); b[m.to] = player; b[m.from] = 0;
    return { m, b, quick: evaluate(b, player) - evaluate(b, opp) - base };
  }).sort((a, b) => b.quick - a.quick).slice(0, 18);
  let best = null, bestScore = -Infinity;
  for (const c of ranked) {
    let worst = Infinity;
    const st = { board: c.b };
    for (let i = 0; i < N && worst > bestScore - 50; i++) {
      if (c.b[i] !== opp) continue;
      for (const to of destinations(st, i).keys()) {
        const b2 = c.b.slice(); b2[to] = opp; b2[i] = 0;
        if (hasWon(b2, opp)) { worst = -1e6; break; }
        const v = evaluate(b2, player) - evaluate(b2, opp) + 0.45 * bestGain(b2, player);
        if (v < worst) worst = v;
      }
    }
    if (worst === Infinity) worst = evaluate(c.b, player) - evaluate(c.b, opp);
    let s = worst + rng() * 0.05;
    if (last && c.m.to === last.from && c.m.from === last.to) s -= 2; // no ir y volver
    if (s > bestScore) { bestScore = s; best = c.m; }
  }
  return best;
}

// ---------- Guardar ----------
export function serialize(state) {
  return {
    v: 1, board: state.board.join(""), turn: state.turn, winner: state.winner, plies: state.plies, difficulty: state.difficulty,
    last: state.last, undo: state.undo.slice(-10).map((u) => ({ board: u.board.join(""), last: u.last, plies: u.plies })), score: state.score || null,
  };
}
export function deserialize(o) {
  if (!o || o.v !== 1 || typeof o.board !== "string" || o.board.length !== N) return null;
  const board = o.board.split("").map(Number);
  if (board.some((v) => v !== 0 && v !== 1 && v !== 2)) return null;
  return {
    board, turn: o.turn === AI ? AI : HUMAN, winner: o.winner || 0, plies: o.plies || 0, difficulty: o.difficulty === "facil" ? "facil" : "normal",
    last: o.last || null, undo: (o.undo || []).filter((u) => u && typeof u.board === "string" && u.board.length === N).map((u) => ({ board: u.board.split("").map(Number), last: u.last, plies: u.plies || 0 })),
    score: o.score || null,
  };
}
