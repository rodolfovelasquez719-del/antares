// Damas internacionales (10x10, reglas FMJD): motor de reglas + IA de Antares.
// Tablero: índice r*10+c (r=0 arriba). Casillas oscuras: (r+c)%2===1.
// Valores: 1 peón de usted, 2 dama de usted, -1 peón de Antares, -2 dama de Antares, 0 vacío.
export const HUMAN = 1, AI = -1, DRAW = 2;
export const N = 10;
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
export const isDark = (i) => ((((i / N) | 0) + (i % N)) & 1) === 1;
const own = (v, side) => v * side > 0;

export function newBoard() {
  const b = new Array(100).fill(0);
  for (let i = 0; i < 100; i++) if (isDark(i)) { const r = (i / N) | 0; if (r < 4) b[i] = -1; else if (r > 5) b[i] = 1; }
  return b;
}
export function newGame(opts = {}) {
  return { board: newBoard(), turn: HUMAN, winner: 0, plies: 0, quiet: 0, captured: { h: 0, a: 0 },
    difficulty: opts.difficulty || "medio", undo: [], last: null, reps: {} };
}

// Capturas desde s (secuencias completas). Las piezas capturadas quedan en el tablero hasta el final (no se saltan dos veces).
function capturesFrom(b, s, side, out) {
  const king = Math.abs(b[s]) === 2, piece = b[s];
  b[s] = 0; // la casilla de salida queda libre durante la secuencia
  const path = [s], caps = [];
  const dfs = (cur) => {
    let ext = false;
    const r = (cur / N) | 0, c = cur % N;
    for (const [dr, dc] of DIRS) {
      let rr = r + dr, cc = c + dc;
      if (king) while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === 0) { rr += dr; cc += dc; }
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
      const m = rr * N + cc;
      if (!(b[m] * side < 0) || caps.includes(m)) continue;
      let lr = rr + dr, lc = cc + dc;
      while (lr >= 0 && lr < N && lc >= 0 && lc < N && b[lr * N + lc] === 0) {
        const l = lr * N + lc;
        ext = true; caps.push(m); path.push(l);
        dfs(l);
        caps.pop(); path.pop();
        if (!king) break;
        lr += dr; lc += dc;
      }
    }
    if (!ext && caps.length) out.push({ from: s, to: cur, path: path.slice(), caps: caps.slice() });
  };
  dfs(s);
  b[s] = piece;
}
export function legalMoves(g, side = g.turn) {
  const b = g.board ? g.board : g;
  const caps = [];
  for (let s = 0; s < 100; s++) if (own(b[s], side)) capturesFrom(b, s, side, caps);
  if (caps.length) {
    const mx = Math.max(...caps.map((m) => m.caps.length));
    // quitar duplicados (misma ruta final y mismas piezas)
    const seen = new Set(), res = [];
    for (const m of caps) if (m.caps.length === mx) { const k = m.from + ">" + m.to + ":" + [...m.caps].sort((a, z) => a - z).join(","); if (!seen.has(k)) { seen.add(k); res.push(m); } }
    return res;
  }
  const res = [];
  for (let s = 0; s < 100; s++) {
    if (!own(b[s], side)) continue;
    const king = Math.abs(b[s]) === 2, r = (s / N) | 0, c = s % N;
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== -side) continue; // peón: solo hacia adelante (usted sube, Antares baja)
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === 0) {
        res.push({ from: s, to: rr * N + cc, path: [s, rr * N + cc], caps: [] });
        if (!king) break;
        rr += dr; cc += dc;
      }
    }
  }
  return res;
}
// Aplica sobre el tablero (sin historial). Devuelve info para deshacer rápido en la búsqueda.
function doMove(b, m) {
  const p = b[m.from], capVals = m.caps.map((x) => b[m.to === x ? -1 : x]);
  b[m.from] = 0; for (const x of m.caps) b[x] = 0;
  const r = (m.to / N) | 0;
  let np = p;
  if (Math.abs(p) === 1 && ((p > 0 && r === 0) || (p < 0 && r === N - 1))) np = 2 * p; // corona solo si TERMINA en la última fila
  b[m.to] = np;
  return { p, capVals };
}
function undoDo(b, m, u) { b[m.to] = 0; m.caps.forEach((x, k) => { b[x] = u.capVals[k]; }); b[m.from] = u.p; }
const key = (b, t) => b.join("") + t;

export function applyMove(g, m) {
  const b = g.board.slice();
  const p = b[m.from];
  const u = doMove(b, m);
  const kingQuiet = Math.abs(p) === 2 && !m.caps.length;
  const captured = { ...g.captured };
  if (p > 0) captured.h += m.caps.length; else captured.a += m.caps.length;
  const turn = -g.turn;
  const ng = { ...g, board: b, turn, plies: g.plies + 1, quiet: kingQuiet ? g.quiet + 1 : 0, captured,
    last: { ...m, player: g.turn, promoted: Math.abs(u.p) === 1 && Math.abs(b[m.to]) === 2 },
    undo: [...g.undo.slice(-80), { board: g.board, turn: g.turn, plies: g.plies, quiet: g.quiet, captured: g.captured, last: g.last, reps: g.reps, winner: g.winner }] };
  const k = key(b, turn); ng.reps = { ...(kingQuiet ? g.reps : {}), [k]: ((kingQuiet ? g.reps[k] : 0) || 0) + 1 };
  ng.winner = outcome(ng);
  return ng;
}
export function outcome(g) {
  if (!legalMoves(g, g.turn).length) return -g.turn; // sin jugadas (o sin piezas) pierde
  if (g.quiet >= 50) return DRAW; // 25 jugadas de cada lado solo con damas, sin capturas
  if (Object.values(g.reps || {}).some((v) => v >= 3)) return DRAW; // triple repetición
  return 0;
}
export function undoMove(g) {
  // deshace hasta volver al turno de usted
  let x = g;
  do { const u = x.undo[x.undo.length - 1]; if (!u) break; x = { ...x, ...u, undo: x.undo.slice(0, -1) }; } while (x.turn !== HUMAN && x.undo.length);
  return x;
}
export function serialize(g) { return g ? { v: 1, board: g.board, turn: g.turn, winner: g.winner, plies: g.plies, quiet: g.quiet, captured: g.captured, difficulty: g.difficulty, score: g.score, counted: g.counted, last: g.last } : null; }
export function deserialize(o) {
  if (!o || o.v !== 1 || !Array.isArray(o.board) || o.board.length !== 100) return null;
  return { ...newGame({ difficulty: o.difficulty }), ...o, undo: [], reps: {} };
}

// ---------------- IA ----------------
const CENTER = [0, 1, 2, 4, 5, 5, 4, 2, 1, 0];
export function evaluate(b, side) {
  let s = 0, hm = 0, am = 0;
  for (let i = 0; i < 100; i++) {
    const v = b[i]; if (!v) continue;
    const r = (i / N) | 0, c = i % N;
    let x;
    if (v === 1) { x = 100 + (9 - r) * 3 + CENTER[c] + (r === 9 ? 6 : 0) + (r <= 2 ? (3 - r) * 4 : 0); hm++; }
    else if (v === -1) { x = 100 + r * 3 + CENTER[c] + (r === 0 ? 6 : 0) + (r >= 7 ? (r - 6) * 4 : 0); am++; }
    else x = 300 + CENTER[c] + CENTER[r];
    // pieza en el borde no puede ser capturada: pequeño bono de seguridad
    if (c === 0 || c === 9) x += 2;
    s += v > 0 ? x : -x;
  }
  return s * side;
}
class Timeout extends Error {}
function search(b, side, depth, alpha, beta, ply, ctx) {
  if ((++ctx.nodes & 1023) === 0 && performance.now() > ctx.deadline) throw new Timeout();
  const moves = legalMoves(b, side);
  if (!moves.length) return -100000 + ply;
  const forced = moves[0].caps.length > 0;
  if (depth <= 0 && (!forced || ply > ctx.maxPly)) return evaluate(b, side);
  // ordenar: capturas grandes y coronaciones primero
  if (moves.length > 1) moves.sort((a, z) => z.caps.length - a.caps.length);
  let best = -Infinity;
  for (const m of moves) {
    const u = doMove(b, m);
    const v = -search(b, -side, depth - (forced && moves.length === 1 ? 0 : 1), -beta, -alpha, ply + 1, ctx);
    undoDo(b, m, u);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}
function rootSearch(b, side, moves, depth, ctx, noise = 0) {
  let best = null, bv = -Infinity, alpha = -Infinity;
  for (const m of moves) {
    const u = doMove(b, m);
    let v = -search(b, -side, depth - 1, -Infinity, -alpha, 1, ctx);
    undoDo(b, m, u);
    if (noise) v += (Math.random() - 0.5) * noise;
    if (v > bv) { bv = v; best = m; }
    if (v > alpha) alpha = v;
  }
  return { best, bv };
}
export function aiMove(g, difficulty = "medio", side = g.turn) {
  const b = g.board.slice();
  const moves = legalMoves(b, side);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const ctx = { nodes: 0, deadline: Infinity, maxPly: 30 };
  if (difficulty === "normal") {
    if (Math.random() < 0.2) return moves[(Math.random() * moves.length) | 0];
    ctx.maxPly = 6;
    return rootSearch(b, side, moves, 2, ctx, 60).best;
  }
  if (difficulty === "medio") { ctx.deadline = performance.now() + 4000; try { return rootSearch(b, side, moves, 4, ctx).best; } catch { return moves[0]; } }
  // Pro: profundización iterativa con límite de tiempo
  ctx.deadline = performance.now() + 1500;
  let best = moves[0], order = moves.slice();
  for (let d = 2; d <= 30; d++) {
    try {
      const r = rootSearch(b, side, order, d, ctx);
      best = r.best; order = [best, ...order.filter((m) => m !== best)];
      if (Math.abs(r.bv) > 90000) break;
    } catch (e) { if (e instanceof Timeout) break; throw e; }
  }
  return best;
}
