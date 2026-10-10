// Antares Web - Excel (v1.11.0): abrir .xlsx/.xls/.csv con SheetJS (vendor/, Apache-2.0), vista previa,
// cálculos LOCALES exactos (el modelo solo propone operaciones; nunca hace las cuentas) y exportación a .xlsx.

export const SHEET_ACCEPT = ".xlsx,.xlsm,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";
export const isSheetName = (n) => /\.(xlsx|xlsm|xls|csv|ods)$/i.test(String(n || ""));
export const MAX_SHEET_BYTES = 15 * 1024 * 1024;
let xlsxPromise = null;
export function loadXLSX() {
  if (typeof window !== "undefined" && window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) xlsxPromise = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = new URL("../vendor/sheetjs/xlsx.full.min.js", import.meta.url).href;
    s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error("SheetJS no cargó")));
    s.onerror = () => { xlsxPromise = null; rej(new Error("No pude cargar el lector de Excel (¿sin conexión la primera vez?).")); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

// ---------- Lectura ----------
export async function readWorkbook(file) {
  const X = await loadXLSX();
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name || "");
  const wb = isCsv ? X.read(new TextDecoder().decode(buf), { type: "string", cellDates: true, dateNF: "dd/mm/yyyy" }) /* fechas de Guatemala: día/mes/año */ : X.read(buf, { type: "array", cellDates: true });
  return { wb, name: file.name || "hoja.xlsx", sheets: wb.SheetNames.slice() };
}
const blank = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim());
export function tableFromSheet(wb, sheetName) {
  const X = window.XLSX, ws = wb.Sheets[sheetName];
  // blankrows: true para que los números de fila coincidan con Excel; si la hoja no empieza en la fila 1, se rellenan las de arriba
  const aoa = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: true });
  const r0 = ws["!ref"] ? X.utils.decode_range(ws["!ref"]).s.r : 0;
  for (let i = 0; i < r0; i++) aoa.unshift([]);
  const formulas = [];
  for (const addr of Object.keys(ws)) { if (addr[0] !== "!" && ws[addr] && ws[addr].f && formulas.length < 25) formulas.push({ cell: addr, f: "=" + ws[addr].f }); }
  return tableFromAoa(aoa, sheetName, formulas);
}
export function tableFromAoa(aoa, name = "Hoja1", formulas = []) {
  const width = Math.max(0, ...aoa.map((r) => r.length));
  // fila de encabezados: la primera con al menos la mitad de celdas llenas (y mayormente texto)
  let h = 0;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const r = aoa[i] || [], filled = r.filter((v) => !blank(v));
    if (filled.length >= Math.max(1, Math.ceil(width / 2)) && filled.filter((v) => typeof v === "string").length >= filled.length / 2) { h = i; break; }
  }
  const raw = (aoa[h] || []).slice();
  const seen = {};
  const headers = Array.from({ length: width }, (_, i) => {
    let n = blank(raw[i]) ? `Columna ${colLetter(i)}` : String(raw[i]).trim();
    if (seen[n]) n = `${n} (${++seen[n]})`; else seen[n] = 1;
    return n;
  });
  const rows = aoa.slice(h + 1).map((r) => Array.from({ length: width }, (_, i) => (r[i] === undefined ? "" : r[i]))).filter((r) => r.some((v) => !blank(v)));
  const t = { name, headers, rows, pre: aoa.slice(0, h).map((r) => r.slice()), formulas };
  t.types = inferTypes(t);
  return t;
}
export const colLetter = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
export const excelRow = (t, i) => t.pre.length + 2 + i;
// Números con formato humano: "Q 1,250.50", "1.250,50", "(300)"
export function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean" || v instanceof Date || blank(v)) return null;
  let s = String(v).trim().replace(/^(Q|\$|US\$|€|GTQ|USD)\s*/i, "").replace(/\s*(Q|GTQ|USD|%)$/i, "").replace(/\s/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (!/^[-+]?[\d.,]+$/.test(s)) return null;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc > -1) s = /,\d{3}$/.test(s) && (s.match(/,/g) || []).length >= 1 && !/^[-+]?0,/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
export function inferTypes(t) {
  return t.headers.map((_, c) => {
    let n = 0, d = 0, s = 0;
    for (const r of t.rows) { const v = r[c]; if (blank(v)) continue; if (v instanceof Date) d++; else if (num(v) !== null) n++; else s++; }
    const tot = n + d + s;
    if (!tot) return "vacía";
    if (d / tot >= 0.8) return "fecha";
    if (n / tot >= 0.8) return "número";
    return "texto";
  });
}
const fold = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function colIndex(t, ref) {
  if (typeof ref === "number") return ref >= 0 && ref < t.headers.length ? ref : -1;
  const r = fold(ref || "");
  let i = t.headers.findIndex((h) => fold(h) === r);
  if (i < 0) i = t.headers.findIndex((h) => fold(h).includes(r) && r.length >= 3);
  if (i < 0 && /^[a-z]{1,2}$/.test(r)) { const L = r.toUpperCase(); i = t.headers.findIndex((_, k) => colLetter(k) === L); }
  return i;
}
export const fmtVal = (v) => {
  if (v instanceof Date) return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("es-GT") : v.toLocaleString("es-GT", { maximumFractionDigits: 2 });
  return v === null || v === undefined ? "" : String(v);
};

// ---------- Para el modelo: esquema + muestra CSV compacta ----------
export function schemaText(t) {
  const lines = t.headers.map((h, i) => {
    const sample = [...new Set(t.rows.map((r) => r[i]).filter((v) => !blank(v)).slice(0, 40).map(fmtVal))].slice(0, 3).join(" | ");
    return `- ${colLetter(i)} "${h}" (${t.types[i]}) ej.: ${sample}`;
  });
  return `Hoja "${t.name}": ${t.rows.length} filas de datos, encabezados en la fila ${t.pre.length + 1}.\nColumnas:\n${lines.join("\n")}` +
    (t.formulas.length ? `\nFórmulas en la hoja (muestra): ${t.formulas.slice(0, 12).map((f) => `${f.cell}: ${f.f}`).join(" ; ")}` : "");
}
export function csvSample(t, n = 40, maxChars = 6000) {
  const q = (v) => { const s = fmtVal(v).replace(/\s+/g, " "); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  let out = t.headers.map(q).join(",");
  for (const r of t.rows.slice(0, n)) { const line = "\n" + r.map(q).join(","); if (out.length + line.length > maxChars) break; out += line; }
  return out;
}

// ---------- Expresiones seguras para columnas nuevas ----------
// [Columna], números con punto decimal, + - * / &, comparaciones, REDONDEAR, SI, ABS, MAX, MIN, SUMA (sin eval)
export function compileExpr(src, t) {
  const toks = [], s = String(src || "").replace(/^=/, "");
  const re = /\s*(?:(\d+(?:\.\d+)?)|\[([^\]]+)\]|"([^"]*)"|([A-Za-zÁÉÍÓÚáéíóúÑñ_.]+)|(<=|>=|<>|!=|==|[-+*/&(),;<>=]))/gy;
  let m;
  while (re.lastIndex < s.length) {
    const at = re.lastIndex;
    m = re.exec(s);
    if (!m) { if (/^\s*$/.test(s.slice(at))) break; throw new Error(`No entiendo la expresión cerca de “${s.slice(at, at + 8)}”`); }
    if (m[1]) toks.push({ k: "n", v: Number(m[1]) });
    else if (m[2] !== undefined) { const c = colIndex(t, m[2]); if (c < 0) throw new Error(`No existe la columna “${m[2]}”`); toks.push({ k: "c", v: c }); }
    else if (m[3] !== undefined) toks.push({ k: "s", v: m[3] });
    else if (m[4]) toks.push({ k: "id", v: m[4].toUpperCase() });
    else toks.push({ k: "op", v: m[5] });
  }
  let p = 0;
  const peek = () => toks[p], eat = (v) => { if (toks[p] && toks[p].v === v) { p++; return true; } return false; };
  const FN = { REDONDEAR: (a, b = 0) => { const k = 10 ** b; return Math.round((a + Number.EPSILON) * k) / k; }, ROUND: null, ABS: Math.abs, MAX: Math.max, MIN: Math.min, SUMA: (...a) => a.reduce((x, y) => x + y, 0), SUM: null,
    SI: "if", IF: "if", MAYUSC: (a) => String(a).toUpperCase(), MINUSC: (a) => String(a).toLowerCase(), ESPACIOS: (a) => String(a).trim().replace(/\s+/g, " "), TRIM: null, CONCATENAR: (...a) => a.join("") };
  FN.ROUND = FN.REDONDEAR; FN.SUM = FN.SUMA; FN.TRIM = FN.ESPACIOS;
  const numOr = (v) => { if (typeof v === "number") return v; const n = num(v); return n === null ? 0 : n; };
  function primary() {
    const tk = toks[p++];
    if (!tk) throw new Error("Expresión incompleta");
    if (tk.k === "n") return () => tk.v;
    if (tk.k === "s") return () => tk.v;
    if (tk.k === "c") return (r) => r[tk.v];
    if (tk.v === "(") { const e = cmp(); if (!eat(")")) throw new Error("Falta “)”"); return e; }
    if (tk.v === "-") { const e = primary(); return (r) => -numOr(e(r)); }
    if (tk.k === "id") {
      const f = FN[tk.v];
      if (f === undefined) throw new Error(`Función no permitida: ${tk.v}`);
      if (!eat("(")) throw new Error(`Falta “(” después de ${tk.v}`);
      const args = [];
      if (!eat(")")) { do { args.push(cmp()); } while (eat(";") || eat(",")); if (!eat(")")) throw new Error("Falta “)”"); }
      if (f === "if") return (r) => (truthy(args[0](r)) ? (args[1] ? args[1](r) : true) : (args[2] ? args[2](r) : false));
      const textFn = [FN.MAYUSC, FN.MINUSC, FN.ESPACIOS, FN.CONCATENAR].includes(f);
      return (r) => f(...args.map((a) => (textFn ? fmtVal(a(r)) : numOr(a(r)))));
    }
    throw new Error(`No esperaba “${tk.v}”`);
  }
  const truthy = (v) => !!v && v !== "0";
  function mul() { let l = primary(); while (peek() && (peek().v === "*" || peek().v === "/")) { const o = toks[p++].v, a = l, b = primary(); l = o === "*" ? (r) => numOr(a(r)) * numOr(b(r)) : (r) => { const d = numOr(b(r)); return d === 0 ? null : numOr(a(r)) / d; }; } return l; }
  function add() { let l = mul(); while (peek() && ["+", "-", "&"].includes(peek().v)) { const o = toks[p++].v, a = l, b = mul(); l = o === "&" ? (r) => fmtVal(a(r)) + fmtVal(b(r)) : o === "+" ? (r) => numOr(a(r)) + numOr(b(r)) : (r) => numOr(a(r)) - numOr(b(r)); } return l; }
  function cmp() {
    const l = add();
    const o = peek() && ["<", ">", "<=", ">=", "=", "==", "<>", "!="].includes(peek().v) ? toks[p++].v : null;
    if (!o) return l;
    const r2 = add();
    return (r) => { const a = l(r), b = r2(r), na = num(a), nb = num(b);
      if ((na === null) !== (nb === null) && ["<", ">", "<=", ">="].includes(o)) return false; // texto contra número
      const x = na !== null && nb !== null ? na : fold(fmtVal(a)), y = na !== null && nb !== null ? nb : fold(fmtVal(b));
      return o === "<" ? x < y : o === ">" ? x > y : o === "<=" ? x <= y : o === ">=" ? x >= y : (o === "<>" || o === "!=") ? x !== y : x === y; };
  }
  const e = cmp();
  if (p < toks.length) throw new Error(`Sobra “${toks[p].v}” en la expresión`);
  return (r) => { const v = e(r); return typeof v === "number" ? (Number.isFinite(v) ? Math.round(v * 1e10) / 1e10 : null) : v === true ? "SÍ" : v === false ? "NO" : v; };
}

// ---------- Operaciones ----------
function matcher(t, w) {
  if (!w || w.col === undefined) return () => true;
  const c = colIndex(t, w.col);
  if (c < 0) throw new Error(`No existe la columna “${w.col}”`);
  const cmp = w.cmp || "eq", val = w.value;
  return (r) => {
    const v = r[c], nv = num(v), nval = num(val);
    switch (cmp) {
      case "empty": return blank(v);
      case "notempty": return !blank(v);
      case "contains": return fold(fmtVal(v)).includes(fold(val));
      case "gt": return nv !== null && nval !== null && nv > nval;
      case "gte": return nv !== null && nval !== null && nv >= nval;
      case "lt": return nv !== null && nval !== null && nv < nval;
      case "lte": return nv !== null && nval !== null && nv <= nval;
      case "ne": return nv !== null && nval !== null ? nv !== nval : fold(fmtVal(v)) !== fold(val);
      default: return nv !== null && nval !== null ? nv === nval : fold(fmtVal(v)) === fold(val);
    }
  };
}
const AGG = {
  sum: (a) => a.reduce((x, y) => x + y, 0), avg: (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null),
  count: (a) => a.length, min: (a) => (a.length ? Math.min(...a) : null), max: (a) => (a.length ? Math.max(...a) : null),
};
const AGG_LABEL = { sum: "Suma", avg: "Promedio", count: "Cantidad", min: "Mínimo", max: "Máximo" };
const round2 = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
const need = (t, ref) => { const c = colIndex(t, ref); if (c < 0) throw new Error(`No existe la columna “${ref}”`); return c; };
export const cloneTable = (t) => ({ ...t, headers: t.headers.slice(), rows: t.rows.map((r) => r.slice()), pre: t.pre.map((r) => r.slice()), types: t.types.slice() });

// Ejecuta una lista de operaciones. Devuelve {table, results, changed, errors, log}
export function runOps(table, ops) {
  let t = cloneTable(table), changed = false;
  const results = [], errors = [], log = [];
  for (const op of (Array.isArray(ops) ? ops : []).slice(0, 12)) {
    try {
      const id = op.id || `r${results.length + 1}`;
      switch (op.op) {
        case "sumBy": case "groupBy": case "countBy": {
          const g = need(t, op.group), fn = AGG[op.fn] ? op.fn : op.op === "countBy" ? "count" : "sum";
          const v = fn === "count" ? -1 : need(t, op.value), keep = matcher(t, op.where);
          const map = new Map();
          for (const r of t.rows) { if (!keep(r)) continue; const k = blank(r[g]) ? "(vacío)" : fmtVal(r[g]); if (!map.has(k)) map.set(k, []); if (v < 0) map.get(k).push(1); else { const n = num(r[v]); if (n !== null) map.get(k).push(n); } }
          const rows = [...map.entries()].map(([k, a]) => [k, round2(AGG[fn](a))]).sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity));
          const all = [...map.values()].flat();
          results.push({ id, kind: "table", title: op.title || `${AGG_LABEL[fn]} de ${v < 0 ? "filas" : t.headers[v]} por ${t.headers[g]}`, columns: [t.headers[g], v < 0 ? "Cantidad" : `${AGG_LABEL[fn]} ${t.headers[v]}`], rows, total: fn === "sum" || fn === "count" ? round2(AGG[fn](all)) : null, value: rows.length });
          break;
        }
        case "aggregate": case "total": {
          const fn = AGG[op.fn] ? op.fn : "sum", keep = matcher(t, op.where);
          const c = fn === "count" && op.col === undefined ? -1 : need(t, op.col);
          const a = []; for (const r of t.rows) { if (!keep(r)) continue; if (c < 0) a.push(1); else { const n = num(r[c]); if (n !== null) a.push(n); else if (fn === "count" && !blank(r[c])) a.push(1); } }
          results.push({ id, kind: "value", title: op.title || `${AGG_LABEL[fn]}${c < 0 ? " de filas" : ` de ${t.headers[c]}`}${op.where ? ` (${t.headers[colIndex(t, op.where.col)]} ${op.where.cmp || "="} ${op.where.value ?? ""})` : ""}`, value: round2(AGG[fn](a)) });
          break;
        }
        case "totals": {
          const rows = t.headers.map((h, c) => (t.types[c] === "número" ? [h, round2(AGG.sum(t.rows.map((r) => num(r[c])).filter((n) => n !== null)))] : null)).filter(Boolean);
          results.push({ id, kind: "table", title: op.title || "Totales por columna", columns: ["Columna", "Total"], rows, value: rows.length });
          break;
        }
        case "duplicates": {
          const cols = (op.cols && op.cols.length ? op.cols : t.headers).map((x) => need(t, x)), seen = new Map(), dup = [];
          t.rows.forEach((r, i) => { const k = cols.map((c) => fold(fmtVal(r[c]))).join("\u0001"); if (seen.has(k)) dup.push([excelRow(t, i), `igual a la fila ${excelRow(t, seen.get(k))}`, ...cols.map((c) => fmtVal(r[c]))]); else seen.set(k, i); });
          results.push({ id, kind: "table", title: op.title || `Duplicados por ${cols.map((c) => t.headers[c]).join(" + ")}`, columns: ["Fila", "Detalle", ...cols.map((c) => t.headers[c])], rows: dup.slice(0, 200), value: dup.length, empty: "No hay filas duplicadas." });
          break;
        }
        case "check": case "errors": {
          const issues = [];
          t.headers.forEach((h, c) => {
            const ty = t.types[c], nums = [];
            t.rows.forEach((r, i) => {
              const v = r[c];
              if (ty === "número") {
                if (blank(v)) issues.push([excelRow(t, i), h, "celda vacía"]);
                else if (num(v) === null) issues.push([excelRow(t, i), h, `“${fmtVal(v)}” no es un número`]);
                else { if (typeof v === "string") issues.push([excelRow(t, i), h, `número guardado como texto (“${v}”)`]); nums.push([i, num(v)]); }
              } else if (typeof v === "string" && v && v !== v.trim()) issues.push([excelRow(t, i), h, "espacios sobrantes"]);
              if (typeof v === "string" && /^#(N\/A|¡?VALOR!|VALUE!|REF!|¡?REF!|DIV\/0!|¡?DIV\/0!|NAME\?|¿NOMBRE\?|NUM!|NULL!)/i.test(v)) issues.push([excelRow(t, i), h, `error de fórmula ${v}`]);
            });
            if (nums.length >= 8) {
              const vals = nums.map((x) => x[1]).sort((a, b) => a - b), q1 = vals[Math.floor(vals.length * 0.25)], q3 = vals[Math.floor(vals.length * 0.75)], iqr = q3 - q1;
              if (iqr > 0) nums.forEach(([i, n]) => { if (n > q3 + 3 * iqr || n < q1 - 3 * iqr) issues.push([excelRow(t, i), h, `valor atípico (${fmtVal(n)})`]); });
              if (nums.some((x) => x[1] < 0) && nums.filter((x) => x[1] < 0).length <= nums.length * 0.1) nums.filter((x) => x[1] < 0).forEach(([i, n]) => issues.push([excelRow(t, i), h, `negativo (${fmtVal(n)})`]));
            }
          });
          results.push({ id, kind: "table", title: op.title || "Posibles errores", columns: ["Fila", "Columna", "Problema"], rows: issues.slice(0, 300), value: issues.length, empty: "No encontré errores evidentes." });
          break;
        }
        case "filter": {
          const keep = matcher(t, op.where || op), before = t.rows.length;
          t.rows = t.rows.filter((r) => (op.remove ? !keep(r) : keep(r)));
          changed = true; log.push(`Filtré: quedan ${t.rows.length} de ${before} filas.`);
          break;
        }
        case "sort": {
          const c = need(t, op.col), dir = op.dir === "desc" ? -1 : 1;
          t.rows.sort((a, b) => { const na = num(a[c]), nb = num(b[c]); if (a[c] instanceof Date && b[c] instanceof Date) return (a[c] - b[c]) * dir; if (na !== null && nb !== null) return (na - nb) * dir; if ((na === null) !== (nb === null)) return na === null ? 1 : -1; return fold(fmtVal(a[c])).localeCompare(fold(fmtVal(b[c])), "es") * dir; });
          changed = true; log.push(`Ordené por ${t.headers[c]} (${dir > 0 ? "ascendente" : "descendente"}).`);
          break;
        }
        case "addColumn": {
          const name = String(op.name || "Nueva columna").slice(0, 60), f = compileExpr(op.expr, t);
          t.rows.forEach((r) => r.push(f(r)));
          t.headers.push(name); changed = true; log.push(`Agregué la columna “${name}”.`);
          break;
        }
        case "replace": {
          const c = need(t, op.col); let n = 0;
          t.rows.forEach((r) => { const s = fmtVal(r[c]); if (op.whole === false ? fold(s).includes(fold(op.find)) : fold(s) === fold(op.find)) { r[c] = op.whole === false ? s.replace(new RegExp(String(op.find).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), op.with ?? "") : (num(op.with) !== null && typeof op.with !== "string" ? op.with : op.with ?? ""); n++; } });
          changed = true; log.push(`Reemplacé ${n} valores en ${t.headers[c]}.`);
          break;
        }
        case "fillEmpty": { const c = need(t, op.col); let n = 0; t.rows.forEach((r) => { if (blank(r[c])) { r[c] = op.value ?? 0; n++; } }); changed = true; log.push(`Llené ${n} celdas vacías en ${t.headers[c]}.`); break; }
        case "toNumber": { const c = need(t, op.col); let n = 0; t.rows.forEach((r) => { if (typeof r[c] === "string" && num(r[c]) !== null) { r[c] = num(r[c]); n++; } }); changed = true; log.push(`Convertí ${n} textos a número en ${t.headers[c]}.`); break; }
        case "trim": { const cs = op.col !== undefined ? [need(t, op.col)] : t.headers.map((_, i) => i); let n = 0; t.rows.forEach((r) => cs.forEach((c) => { if (typeof r[c] === "string" && r[c] !== r[c].trim().replace(/\s+/g, " ")) { r[c] = r[c].trim().replace(/\s+/g, " "); n++; } })); changed = true; log.push(`Quité espacios sobrantes en ${n} celdas.`); break; }
        case "round": { const c = need(t, op.col), k = 10 ** (op.decimals ?? 2); t.rows.forEach((r) => { const n = num(r[c]); if (n !== null) r[c] = Math.round(n * k) / k; }); changed = true; log.push(`Redondeé ${t.headers[c]} a ${op.decimals ?? 2} decimales.`); break; }
        case "setCell": {
          const c = need(t, op.col), i = Number(op.row) - t.pre.length - 2;
          if (!(i >= 0 && i < t.rows.length)) throw new Error(`La fila ${op.row} no existe`);
          t.rows[i][c] = op.value; changed = true; log.push(`Cambié ${colLetter(c)}${op.row} a “${fmtVal(op.value)}”.`);
          break;
        }
        case "deleteColumn": { const c = need(t, op.col); const n = t.headers[c]; t.headers.splice(c, 1); t.rows.forEach((r) => r.splice(c, 1)); changed = true; log.push(`Eliminé la columna “${n}”.`); break; }
        case "renameColumn": { const c = need(t, op.col); const old = t.headers[c]; t.headers[c] = String(op.name || old).slice(0, 60); changed = true; log.push(`Renombré “${old}” a “${t.headers[c]}”.`); break; }
        case "removeDuplicates": {
          const cols = (op.cols && op.cols.length ? op.cols : t.headers).map((x) => need(t, x)), seen = new Set(), before = t.rows.length;
          t.rows = t.rows.filter((r) => { const k = cols.map((c) => fold(fmtVal(r[c]))).join("\u0001"); if (seen.has(k)) return false; seen.add(k); return true; });
          changed = true; log.push(`Quité ${before - t.rows.length} filas duplicadas.`);
          break;
        }
        default: throw new Error(`Operación desconocida: ${op.op}`);
      }
    } catch (e) { errors.push(String(e && e.message ? e.message : e)); }
  }
  if (changed) t.types = inferTypes(t);
  return { table: t, results, changed, errors, log };
}

// Sustituye {{id}} en la respuesta del modelo por los valores calculados aquí
export function fillPlaceholders(text, results) {
  return String(text || "").replace(/\{\{\s*([\w-]+)\s*\}\}/g, (all, id) => { const r = results.find((x) => x.id === id); return r ? (r.kind === "value" ? fmtVal(r.value) : r.total != null ? fmtVal(r.total) : String(r.value)) : "—"; });
}

// ---------- Exportar ----------
export function exportXlsx(wb, sheetName, t) {
  const X = window.XLSX;
  const out = X.utils.book_new();
  const aoa = [...t.pre, t.headers, ...t.rows];
  const names = wb ? wb.SheetNames : [sheetName];
  for (const n of names) {
    const ws = n === sheetName ? X.utils.aoa_to_sheet(aoa, { cellDates: true }) : wb.Sheets[n];
    if (n === sheetName) ws["!cols"] = t.headers.map((h, i) => ({ wch: Math.min(40, Math.max(8, String(h).length + 2, ...t.rows.slice(0, 200).map((r) => fmtVal(r[i]).length + 1))) }));
    X.utils.book_append_sheet(out, ws, n.slice(0, 31));
  }
  const data = X.write(out, { bookType: "xlsx", type: "array", compression: true });
  return new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
export const editedName = (name) => String(name || "hoja").replace(/\.(xlsx|xlsm|xls|csv|ods)$/i, "") + "-editado.xlsx";

// ---------- Instrucciones para el modelo ----------
export const SHEET_SYSTEM = `Usted es el analista de hojas de cálculo de Antares. Habla español de Guatemala, trata al usuario de "usted" y explica sencillo.
Recibe el esquema de la hoja, una muestra en CSV de las primeras filas y la pregunta. La app ejecuta los cálculos EXACTOS sobre TODAS las filas: usted NUNCA calcula cifras; pide operaciones.
Responda SOLO con JSON válido:
{"respuesta": "texto breve en español; para citar un resultado escriba {{id}}", "operaciones": [ ... ], "formulas": [{"formula": "=SUMAR.SI(B:B;\\"Ruta 1\\";D:D)", "explicacion": "qué hace"}]}
Operaciones disponibles (use los nombres EXACTOS de columna del esquema):
- {"op":"sumBy","id":"r1","group":"Ruta","value":"Monto","fn":"sum|avg|count|min|max","where":{...opcional}}  (totales por grupo)
- {"op":"aggregate","id":"r2","fn":"sum|avg|count|min|max","col":"Monto","where":{"col":"Ruta","cmp":"eq","value":"Ruta 1"}}
- {"op":"totals","id":"r3"}  (total de cada columna numérica)
- {"op":"duplicates","id":"r4","cols":["Factura"]}
- {"op":"check","id":"r5"}  (vacías, texto en columnas numéricas, atípicos, errores #N/A...)
Operaciones que MODIFICAN la hoja (solo si el usuario lo pide):
- {"op":"addColumn","name":"IVA","expr":"REDONDEAR([Monto]*0.12;2)"}  (expr: columnas entre corchetes, punto decimal, + - * / &, comparaciones, SI(cond;a;b), REDONDEAR, ABS, MAX, MIN, SUMA, MAYUSC, MINUSC, ESPACIOS)
- {"op":"sort","col":"Monto","dir":"asc|desc"}
- {"op":"filter","where":{"col":"Ruta","cmp":"eq|ne|contains|gt|gte|lt|lte|empty|notempty","value":"Ruta 1"},"remove":false}
- {"op":"replace","col":"Ruta","find":"ruta1","with":"Ruta 1","whole":true}
- {"op":"fillEmpty","col":"Monto","value":0}, {"op":"toNumber","col":"Monto"}, {"op":"trim"}, {"op":"round","col":"Monto","decimals":2}
- {"op":"setCell","row":5,"col":"Monto","value":120}  (row = número de fila de Excel), {"op":"deleteColumn","col":"X"}, {"op":"renameColumn","col":"X","name":"Y"}, {"op":"removeDuplicates","cols":["Factura"]}
Fórmulas de Excel: SIEMPRE en español y con punto y coma como separador (SUMA, SUMAR.SI, SUMAR.SI.CONJUNTO, CONTAR.SI, BUSCARV, BUSCARX, SI, SI.ERROR, PROMEDIO, REDONDEAR, HOY, TEXTO, CONCATENAR). Use las letras de columna del esquema y rangos reales (fila de datos desde la fila indicada).
Si pregunta qué hace una fórmula, explíquela paso a paso en "respuesta" (sin operaciones). Si la pregunta no necesita cálculos, deje "operaciones" vacío.`;
export function sheetPrompt(t, question) {
  return `${schemaText(t)}\n\nMuestra (CSV, primeras filas):\n${csvSample(t)}\n\nPregunta del usuario: ${String(question || "").trim()}`;
}
