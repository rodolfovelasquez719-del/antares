// Antares Web - Programación (v1.11.0): resaltado ligero, bloques de código, diferencias por línea
// y ejecución de JavaScript en un Worker aislado con límite de tiempo.

export const CODE_EXT = { js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", html: "html", htm: "html", xml: "xml", css: "css", java: "java", cs: "csharp", sql: "sql", json: "json",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", php: "php", rb: "ruby", go: "go", kt: "kotlin", swift: "swift", sh: "bash", ps1: "powershell",
  vb: "vb", bas: "vb", txt: "text", md: "text", yml: "yaml", yaml: "yaml", ino: "cpp" };
export const CODE_ACCEPT = Object.keys(CODE_EXT).map((e) => "." + e).join(",");
export const MAX_CODE_BYTES = 200 * 1024;
const ALIAS = { js: "javascript", javascript: "javascript", node: "javascript", ts: "typescript", typescript: "typescript", py: "python", python: "python",
  html: "html", xml: "xml", css: "css", java: "java", cs: "csharp", csharp: "csharp", "c#": "csharp", sql: "sql", json: "json", c: "c", cpp: "cpp", "c++": "cpp",
  php: "php", ruby: "ruby", go: "go", kotlin: "kotlin", swift: "swift", bash: "bash", sh: "bash", shell: "bash", powershell: "powershell", vb: "vb", vba: "vb", yaml: "yaml", text: "text", txt: "text" };
export const LANG_LABEL = { javascript: "JavaScript", typescript: "TypeScript", python: "Python", html: "HTML", xml: "XML", css: "CSS", java: "Java", csharp: "C#", sql: "SQL",
  json: "JSON", c: "C", cpp: "C++", php: "PHP", ruby: "Ruby", go: "Go", kotlin: "Kotlin", swift: "Swift", bash: "Bash", powershell: "PowerShell", vb: "Visual Basic", yaml: "YAML", text: "Texto" };
export const LANG_EXT = { javascript: "js", typescript: "ts", python: "py", html: "html", xml: "xml", css: "css", java: "java", csharp: "cs", sql: "sql", json: "json",
  c: "c", cpp: "cpp", php: "php", ruby: "rb", go: "go", kotlin: "kt", swift: "swift", bash: "sh", powershell: "ps1", vb: "vb", yaml: "yml", text: "txt" };
export const normLang = (l) => ALIAS[String(l || "").trim().toLowerCase()] || "text";
export const langFromName = (name) => CODE_EXT[String(name || "").split(".").pop().toLowerCase()] || null;

// Adivina el lenguaje por el contenido
export function guessLang(src) {
  const s = String(src || "");
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(s)) { try { JSON.parse(s); return "json"; } catch { /* */ } }
  if (/^\s*<(!doctype|html|div|head|body|\w+[^>]*>)/i.test(s)) return "html";
  if (/^\s*(def |import \w+|from \w+ import|class \w+.*:\s*$|print\()/m.test(s) && !/[;{}]\s*$/m.test(s)) return "python";
  if (/\b(SELECT|INSERT INTO|UPDATE|CREATE TABLE|DELETE FROM)\b/i.test(s) && !/function|=>/.test(s)) return "sql";
  if (/\b(public|private)\s+(static\s+)?(void|class|int|string)\b/.test(s)) return /\bstring\b|using System|Console\./.test(s) ? "csharp" : "java";
  if (/^\s*[.#]?[\w-]+\s*\{[^}]*:[^}]*;?\s*\}/m.test(s) && !/function|=>|const |let /.test(s)) return "css";
  if (/\b(function|const|let|var|=>|console\.log|document\.)\b/.test(s)) return "javascript";
  if (/#include\s*</.test(s)) return "cpp";
  if (/\b(while|for|if|return|switch)\b\s*\(?/.test(s) && /[;{}]/.test(s)) return "javascript"; // fragmento corto estilo C
  return "text";
}
// ¿El texto del chat parece código pegado?
export function looksLikeCode(t) {
  const s = String(t || "");
  if (/```/.test(s)) return true;
  const lines = s.split("\n").filter((l) => l.trim());
  if (lines.length < 3) return false;
  const codey = lines.filter((l) => /[;{}]\s*$|^\s*(def |class |import |from \S+ import|function\b|const |let |var |return\b|if\s*\(|for\s*\(|while\s*\(|public |private |#include|SELECT |<\/?\w+[^>]*>|\w+\s*=\s*[^=])/.test(l)).length;
  return codey / lines.length >= 0.5;
}

// ---------- Bloques ``` en el texto ----------
// Devuelve segmentos [{type:"text", text} | {type:"code", lang, code}]
export function splitFences(text) {
  const out = [], s = String(text || ""), re = /```([\w#+.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ type: "text", text: s.slice(last, m.index) });
    const code = m[2].replace(/\n$/, "");
    out.push({ type: "code", lang: m[1] ? normLang(m[1]) : guessLang(code), code });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ type: "text", text: s.slice(last) });
  return out.filter((p) => p.type === "code" || p.text.trim());
}
export const hasFence = (t) => /```[\s\S]*?\n/.test(String(t || ""));

// ---------- Resaltado ----------
const KW = {
  javascript: "await async break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while yield null undefined true false NaN",
  python: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self print len range",
  java: "abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long new package private protected public return short static super switch this throw throws try void volatile while null true false String var",
  csharp: "abstract as base bool break byte case catch char class const continue decimal default do double else enum false finally float for foreach if in int interface internal is long namespace new null object out override private protected public readonly ref return static string struct switch this throw true try using var virtual void while async await",
  sql: "select from where and or not insert into values update set delete create table alter drop join left right inner outer on group by order having limit as distinct null is in like between case when then else end count sum avg min max primary key",
  css: "important media keyframes from to",
  c: "auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while include define bool true false class public private new delete namespace using std",
  php: "echo function if else elseif foreach for while return class public private new null true false array as",
  go: "func package import var const type struct interface map chan go defer return if else for range switch case nil true false",
  bash: "if then else fi for do done while case esac function echo exit return in export local",
};
KW.typescript = KW.javascript + " interface type enum implements private public readonly";
KW.cpp = KW.c; KW.kotlin = KW.java + " fun val when"; KW.swift = KW.java + " func let guard"; KW.ruby = KW.python + " end def puts"; KW.vb = "Dim As If Then Else End Sub Function For Next Return Each In Set Integer String Boolean Long True False Nothing";
KW.powershell = KW.bash; KW.json = "true false null"; KW.yaml = "true false null";
const kwSets = {};
const kwSet = (lang) => kwSets[lang] || (kwSets[lang] = new Set((KW[lang] || "").split(" ").map((w) => (lang === "sql" || lang === "vb" ? w.toLowerCase() : w))));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function highlight(code, lang) {
  lang = normLang(lang);
  const src = String(code || "");
  if (lang === "text" || src.length > 120000) return esc(src);
  if (lang === "html" || lang === "xml") return highlightMarkup(src);
  const hashCom = ["python", "ruby", "bash", "powershell", "yaml"].includes(lang);
  const sqlCom = lang === "sql";
  const parts = [
    hashCom ? "#[^\\n]*" : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/",
    sqlCom ? "--[^\\n]*" : null,
    lang === "python" ? "\"\"\"[\\s\\S]*?\"\"\"|'''[\\s\\S]*?'''" : null,
    "\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'" + (["javascript", "typescript"].includes(lang) ? "|`(?:\\\\.|[^`\\\\])*`" : ""),
    "\\b\\d+(?:\\.\\d+)?\\b|\\b0x[\\da-f]+\\b",
    "[A-Za-z_$][\\w$]*",
  ].filter(Boolean);
  const re = new RegExp(parts.map((p) => `(${p})`).join("|"), "gi");
  const kws = kwSet(lang), ci = lang === "sql" || lang === "vb";
  let out = "", last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    const tok = m[0];
    let cls = null;
    const isCom = (hashCom && tok[0] === "#") || tok.startsWith("//") || tok.startsWith("/*") || (sqlCom && tok.startsWith("--"));
    if (isCom) cls = "com";
    else if (/^["'`]/.test(tok)) cls = lang === "json" && /^\s*:/.test(src.slice(re.lastIndex)) ? "attr" : "str";
    else if (/^\d|^0x/i.test(tok)) cls = "num";
    else if (kws.has(ci ? tok.toLowerCase() : tok)) cls = "kw";
    else if (/^\s*\(/.test(src.slice(re.lastIndex))) cls = "fn";
    out += cls ? `<span class="hl-${cls}">${esc(tok)}</span>` : esc(tok);
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}
function highlightMarkup(src) {
  return esc(src)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-com">$1</span>')
    .replace(/(&lt;\/?)([\w:-]+)([\s\S]*?)(\/?&gt;)/g, (all, a, tag, attrs, b) =>
      `${a}<span class="hl-kw">${tag}</span>${attrs.replace(/([\w:-]+)(=)(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, '<span class="hl-attr">$1</span>$2<span class="hl-str">$3</span>')}${b}`);
}

// ---------- Diferencias por línea (LCS) ----------
export function lineDiff(a, b) {
  const A = String(a || "").split("\n"), B = String(b || "").split("\n");
  if (A.length * B.length > 4e6) return null; // demasiado grande para el teléfono
  const n = A.length, m = B.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: " ", s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: "-", s: A[i++] });
    else out.push({ t: "+", s: B[j++] });
  }
  while (i < n) out.push({ t: "-", s: A[i++] });
  while (j < m) out.push({ t: "+", s: B[j++] });
  return out;
}
export function diffStats(d) { return { add: d.filter((x) => x.t === "+").length, del: d.filter((x) => x.t === "-").length }; }
// HTML compacto: solo cambios con 2 líneas de contexto
export function diffHtml(d, ctx = 2) {
  const keep = new Array(d.length).fill(false);
  d.forEach((x, k) => { if (x.t !== " ") for (let q = Math.max(0, k - ctx); q <= Math.min(d.length - 1, k + ctx); q++) keep[q] = true; });
  let html = "", gap = false;
  d.forEach((x, k) => {
    if (!keep[k]) { if (!gap) html += '<div class="df-gap">⋯</div>'; gap = true; return; }
    gap = false;
    const cls = x.t === "+" ? "df-add" : x.t === "-" ? "df-del" : "df-ctx";
    html += `<div class="${cls}"><span class="df-sign" aria-hidden="true">${x.t === " " ? " " : x.t === "+" ? "+" : "−"}</span>${esc(x.s) || " "}</div>`;
  });
  return html || '<div class="df-ctx">Sin cambios.</div>';
}

// ---------- Ejecutar JavaScript en un Worker aislado ----------
// El Worker corre en otro hilo: un bucle infinito no congela la app (se termina al vencer el tiempo).
// Antes del código del usuario se bloquean red y almacenamiento.
const RUNNER = `
"use strict";
(() => {
  const kill = ["fetch","XMLHttpRequest","WebSocket","EventSource","indexedDB","caches","importScripts","BroadcastChannel","Worker","SharedWorker","WebTransport","cookieStore","navigator"];
  for (const k of kill) {
    try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }); } catch (e) {}
    try { let p = Object.getPrototypeOf(self); while (p) { if (Object.prototype.hasOwnProperty.call(p, k)) { try { Object.defineProperty(p, k, { value: undefined, configurable: false }); } catch (e) {} } p = Object.getPrototypeOf(p); } } catch (e) {}
  }
})();
const __post = self.postMessage.bind(self);
let __n = 0;
const __fmt = (v) => { try { if (typeof v === "string") return v; if (v instanceof Error) return v.name + ": " + v.message; if (typeof v === "function") return "[función " + (v.name || "anónima") + "]"; if (typeof v === "undefined") return "undefined"; return JSON.stringify(v, (k, x) => typeof x === "bigint" ? x + "n" : x, 2) ?? String(v); } catch (e) { return String(v); } };
const __out = (level) => (...a) => { if (++__n > 500) return; __post({ type: "log", level, text: a.map(__fmt).join(" ").slice(0, 4000) }); };
const console = { log: __out("log"), info: __out("log"), debug: __out("log"), warn: __out("warn"), error: __out("error"), table: __out("log") };
self.console = console;
self.onmessage = async (ev) => {
  try {
    const fn = new Function("console", "return (async () => {\\n" + ev.data + "\\n})()");
    const r = await fn(console);
    __post({ type: "done", value: r === undefined ? undefined : __fmt(r) });
  } catch (e) {
    const line = (String(e && e.stack || "").match(/<anonymous>:(\\d+)/) || [])[1];
    __post({ type: "error", text: (e && e.name ? e.name + ": " + e.message : String(e)) + (line ? " (línea " + (Number(line) - 2) + ")" : "") });
  }
};
self.addEventListener("unhandledrejection", (e) => __post({ type: "error", text: "Promesa rechazada: " + __fmt(e.reason) }));
`;
export function runJs(code, { timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    const logs = [];
    let url, w, done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(t); try { w && w.terminate(); } catch { /* */ } if (url) URL.revokeObjectURL(url); resolve({ logs, ...r }); };
    try {
      url = URL.createObjectURL(new Blob([RUNNER], { type: "text/javascript" }));
      w = new Worker(url);
    } catch (e) { resolve({ logs, ok: false, error: "Este navegador no permite ejecutar código aquí." }); return; }
    const t = setTimeout(() => finish({ ok: false, timeout: true, error: `Se detuvo: tardó más de ${Math.round(timeoutMs / 1000)} s (¿un bucle infinito?).` }), timeoutMs);
    w.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.type === "log") { if (logs.length < 500) logs.push({ level: m.level, text: m.text }); }
      else if (m.type === "done") finish({ ok: true, value: m.value });
      else if (m.type === "error") finish({ ok: false, error: m.text });
    };
    w.onerror = (e) => { e.preventDefault && e.preventDefault(); finish({ ok: false, error: (e && e.message) || "Error de sintaxis" }); };
    w.postMessage(String(code || ""));
  });
}
export const isRunnable = (lang) => normLang(lang) === "javascript";

// Instrucciones para el modelo en modo programación
export const CODE_RULES = "MODO PROGRAMACIÓN: el usuario le pide revisar, arreglar o escribir código. " +
  "Primero explique en español sencillo qué errores encontró y por qué fallan (lista numerada corta, texto plano, sin Markdown fuera del código). " +
  "Después devuelva el código corregido COMPLETO dentro de UN bloque con triple comilla invertida y el lenguaje (por ejemplo ```python), listo para copiar. " +
  "Conserve los nombres, la estructura y el estilo del usuario; cambie solo lo necesario y marque con un comentario breve en español las líneas que cambió. " +
  "No invente funciones ni librerías. Si el código ya está bien, dígalo y sugiera mejoras opcionales. " +
  "Si pide explicar código, explíquelo paso a paso. Si pide algo nuevo, escriba el código completo en un bloque.";
