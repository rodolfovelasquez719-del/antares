// Antares · Prueba de cerebro propio (paso 1). Página independiente: no usa ni modifica los datos de la app.
// Detecta WebGPU, memoria y almacenamiento; luego prueba un modelo pequeño con WebLLM (MLC, Apache-2.0).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const RUNTIME = "./vendor/web-llm/web-llm.js";
const RUNTIME_VERSION = "0.2.85";
const PROMPT = "Explique en tres oraciones cortas, tratando de usted, por qué conviene revisar la presión de las llantas de un camión antes de salir a ruta.";
const SYSTEM = "Usted es Antares, un asistente que habla español de Guatemala y trata siempre de usted. Responda claro y breve.";
const MODELS = {
  small: { label: "0.5B", f16: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC", approxMB: 400 },
  big: { label: "1.5B", f16: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", approxMB: 1100 },
};
const RUN_KEY = "pruebaCerebro.enCurso"; // sessionStorage: detecta si el teléfono cerró la pestaña a mitad de prueba
const GB = 1024 ** 3, MB = 1024 ** 2;
const fmtBytes = (n) => (n == null ? "—" : n >= GB ? `${(n / GB).toFixed(1)} GB` : `${Math.round(n / MB)} MB`);
const fmtNum = (n, d = 1) => (n == null || !isFinite(n) ? "—" : Number(n).toFixed(d));

const S = { device: {}, gpu: null, storage: {}, tests: {}, notes: [], busy: false, engine: null };

// ---------- Errores en español sencillo ----------
export function friendly(e) {
  const m = String((e && (e.message || e.name)) || e || "");
  if (/QuotaExceeded|quota|storage/i.test(m)) return "No hay espacio suficiente para guardar el modelo. Libere espacio en el teléfono (o borre modelos descargados) e intente de nuevo.";
  if (/Failed to fetch|NetworkError|network|ERR_|Load failed|fetch/i.test(m)) return "Se cortó la descarga (sin internet o conexión inestable). Conéctese a Wi-Fi e intente de nuevo; lo ya descargado se aprovecha.";
  if (/device.*lost|DeviceLost|lost the device|GPUDevice/i.test(m)) return "El teléfono cerró la tarjeta gráfica a mitad de la prueba, casi siempre por falta de memoria. Cierre otras apps y pruebe de nuevo, o quédese con el modelo más pequeño.";
  if (/out of memory|OOM|allocation|Cannot allocate|memory/i.test(m)) return "El teléfono se quedó sin memoria para este modelo. Cierre otras apps o use el modelo más pequeño.";
  if (/shader-f16|f16/i.test(m)) return "Este teléfono no admite el formato f16; se debe usar la versión f32 del modelo.";
  if (/maxStorageBufferBindingSize|maxBufferSize|limit/i.test(m)) return "La tarjeta gráfica del teléfono tiene límites muy bajos para este modelo.";
  if (/WebGPU|navigator\.gpu|adapter/i.test(m)) return "Chrome no pudo usar la tarjeta gráfica (WebGPU) en este teléfono.";
  if (/import|module|Unexpected token|SyntaxError/i.test(m)) return "No se pudo cargar el motor de IA en este navegador. Actualice Chrome e intente de nuevo.";
  if (/abort|interrupt/i.test(m)) return "Prueba detenida.";
  return "Ocurrió un error inesperado durante la prueba.";
}

// ---------- Detección ----------
async function detect() {
  const d = S.device;
  d.ua = navigator.userAgent;
  d.cores = navigator.hardwareConcurrency || null;
  d.memoryGB = navigator.deviceMemory || null; // Chrome redondea y nunca reporta más de 8
  try {
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      const h = await navigator.userAgentData.getHighEntropyValues(["model", "platformVersion", "fullVersionList"]);
      d.model = h.model || ""; d.platform = navigator.userAgentData.platform || ""; d.platformVersion = h.platformVersion || "";
      const br = (h.fullVersionList || []).find((b) => /Chrome|Chromium/.test(b.brand) && !/Not/.test(b.brand));
      d.browser = br ? `${br.brand} ${br.version}` : "";
    }
  } catch { /* */ }
  if (!d.browser) { const m = d.ua.match(/(Chrome|CriOS|Firefox|Version)\/([\d.]+)/); d.browser = m ? `${m[1] === "Version" ? "Safari" : m[1]} ${m[2]}` : "desconocido"; }
  if (!d.platform) d.platform = /Android/.test(d.ua) ? "Android" : /iPhone|iPad/.test(d.ua) ? "iOS" : navigator.platform || "";
  if (!d.platformVersion) { const m = d.ua.match(/Android ([\d.]+)/); d.platformVersion = m ? m[1] : ""; }
  if (!d.model) { const m = d.ua.match(/Android [\d.]+; ([^;)]+)/); d.model = m && m[1] !== "K" ? m[1] : ""; }
  // almacenamiento
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      S.storage = { quota: e.quota, usage: e.usage, free: e.quota != null && e.usage != null ? e.quota - e.usage : null };
      S.storage.persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    }
  } catch { S.storage = {}; }
  // WebGPU
  const g = { available: false };
  if (!("gpu" in navigator) || !navigator.gpu) g.reason = window.isSecureContext ? "Este navegador no tiene WebGPU." : "La página no está en https (WebGPU necesita conexión segura).";
  else {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) g.reason = "Chrome tiene WebGPU, pero no encontró una tarjeta gráfica compatible (puede estar bloqueada para este teléfono).";
      else {
        let info = adapter.info || null;
        if (!info && adapter.requestAdapterInfo) { try { info = await adapter.requestAdapterInfo(); } catch { /* */ } }
        g.info = info ? { vendor: info.vendor || "", architecture: info.architecture || "", device: info.device || "", description: info.description || "" } : {};
        g.fallback = !!(adapter.isFallbackAdapter || (info && info.isFallbackAdapter));
        g.f16 = adapter.features.has("shader-f16");
        const L = adapter.limits;
        g.limits = { maxBufferSize: L.maxBufferSize, maxStorageBufferBindingSize: L.maxStorageBufferBindingSize, maxComputeWorkgroupStorageSize: L.maxComputeWorkgroupStorageSize, maxComputeInvocationsPerWorkgroup: L.maxComputeInvocationsPerWorkgroup };
        try { // confirmar que se puede abrir el dispositivo
          const dev = await adapter.requestDevice();
          g.available = true; dev.destroy && dev.destroy();
        } catch (e) { g.reason = "La tarjeta gráfica no se pudo abrir: " + friendly(e); }
      }
    } catch (e) { g.reason = friendly(e); }
  }
  S.gpu = g;
}

function kv(label, value, cls = "", wide = false) { return `<div class="kv ${cls}${wide ? " wide" : ""}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`; }
function renderDetect() {
  const d = S.device, g = S.gpu, st = S.storage;
  const memCls = d.memoryGB == null ? "" : d.memoryGB >= 6 ? "ok" : d.memoryGB >= 4 ? "mid" : "bad";
  const freeCls = st.free == null ? "" : st.free > 2 * GB ? "ok" : st.free > 600 * MB ? "mid" : "bad";
  let html = kv("Teléfono", [d.model, d.platform && `${d.platform} ${d.platformVersion}`.trim()].filter(Boolean).join(" · ") || "desconocido", "", true) +
    kv("Navegador", d.browser) +
    kv("Memoria RAM", d.memoryGB == null ? "no informa" : `${d.memoryGB} GB${d.memoryGB >= 8 ? " o más" : ""}`, memCls) +
    kv("Núcleos", d.cores ?? "—") +
    kv("Espacio para la app", st.free == null ? "no informa" : `${fmtBytes(st.free)} libres`, freeCls) +
    kv("WebGPU", g.available ? (g.fallback ? "sí (emulado, lento)" : "sí") : "no", g.available ? (g.fallback ? "mid" : "ok") : "bad");
  if (g.available) {
    const i = g.info || {};
    html += kv("Tarjeta gráfica", [i.vendor, i.architecture, i.description || i.device].filter(Boolean).join(" · ") || "sin detalle (Chrome lo oculta)", "", true) +
      kv("Formato f16", g.f16 ? "sí (modelos más livianos)" : "no (se usa f32)", g.f16 ? "ok" : "mid") +
      kv("Búfer máximo", fmtBytes(g.limits.maxBufferSize)) +
      kv("Búfer de datos", fmtBytes(g.limits.maxStorageBufferBindingSize)) +
      kv("Memoria de grupo", `${Math.round(g.limits.maxComputeWorkgroupStorageSize / 1024)} KB`);
  } else html += `<p class="warn wide" style="grid-column:1/-1">${esc(g.reason || "WebGPU no está disponible.")} Sin WebGPU este teléfono no puede correr un cerebro propio a buena velocidad en Chrome.</p>`;
  $("detect").innerHTML = html;
}

// ---------- Prueba del modelo ----------
let webllmPromise = null;
const loadRuntime = () => (webllmPromise ||= import(RUNTIME).catch((e) => { webllmPromise = null; throw e; }));
function pickModel(kind) {
  const m = MODELS[kind];
  const forced = new URLSearchParams(location.search).get("modelo"); // solo para pruebas: debe ser un modelo del catálogo de WebLLM
  if (forced && /^[\w.-]+-MLC$/.test(forced)) return forced;
  return S.gpu && S.gpu.f16 ? m.f16 : m.f32;
}
function setProgress(p, text) {
  const pct = Math.max(0, Math.min(100, Math.round((p || 0) * 100)));
  $("bar-fill").style.width = pct + "%"; $("bar").setAttribute("aria-valuenow", String(pct));
  if (text != null) $("run-status").textContent = text;
}
function heapMB() { try { return performance.memory ? Math.round(performance.memory.usedJSHeapSize / MB) : null; } catch { return null; } }

async function runTest(kind) {
  if (S.busy) return;
  const g = S.gpu;
  if (!g || !g.available) { S.tests[kind] = { ok: false, error: "Este teléfono no tiene WebGPU disponible en Chrome." }; renderSummary(); return; }
  const m = MODELS[kind];
  if (kind === "big" && !confirm(`El modelo mediano descarga ${m.approxMB >= 1000 ? "1 GB o más" : m.approxMB + " MB"}. ¿Está conectado a Wi-Fi y desea continuar?`)) return;
  if (S.storage.free != null && S.storage.free < m.approxMB * MB * 1.3) {
    if (!confirm(`Parece que hay poco espacio (${fmtBytes(S.storage.free)} libres y el modelo necesita unos ${m.approxMB} MB). ¿Intentar de todos modos?`)) return;
  }
  const model = pickModel(kind);
  S.busy = true; setButtons();
  const t = { kind, model, ok: false, startedAt: new Date().toISOString(), warnings: [] };
  S.tests[kind] = t;
  $("run-card").hidden = false; $("run-out").hidden = true; $("run-out").textContent = ""; $("run-stop").hidden = true;
  $("h-run").textContent = `Prueba ${m.label} en curso`;
  $("run-model").textContent = `Modelo: ${model}`;
  setProgress(0, "Cargando el motor de IA…");
  $("run-card").scrollIntoView({ behavior: "smooth", block: "start" });
  try { sessionStorage.setItem(RUN_KEY, JSON.stringify({ kind, model, at: Date.now() })); } catch { /* */ }
  try { if (navigator.storage && navigator.storage.persist) t.persisted = await navigator.storage.persist(); } catch { /* */ }
  const heap0 = heapMB();
  let engine = null;
  try {
    const webllm = await loadRuntime();
    const cfg = webllm.prebuiltAppConfig && webllm.prebuiltAppConfig.model_list.find((x) => x.model_id === model);
    if (!cfg) throw new Error("modelo no está en el catálogo");
    t.vramMB = cfg.vram_required_MB ? Math.round(cfg.vram_required_MB) : null;
    if (t.vramMB && g.limits && g.limits.maxBufferSize && g.limits.maxBufferSize < 256 * MB) t.warnings.push("La tarjeta gráfica permite búferes pequeños; puede fallar.");
    if (t.vramMB && S.device.memoryGB && t.vramMB > S.device.memoryGB * 1024 * 0.45) t.warnings.push(`El modelo usa unos ${t.vramMB} MB de memoria gráfica, mucho para ${S.device.memoryGB} GB de RAM: cierre otras apps.`);
    const cached = webllm.hasModelInCache ? await webllm.hasModelInCache(model).catch(() => false) : false;
    t.cached = !!cached;
    const tLoad = performance.now();
    engine = await webllm.CreateMLCEngine(model, {
      initProgressCallback: (r) => {
        const txt = String(r.text || "");
        const es = /Fetching|Loading model from cache|cache/i.test(txt) ? (cached ? "Cargando el modelo guardado…" : "Descargando el modelo…")
          : /shader|Compil|pipeline/i.test(txt) ? "Preparando la tarjeta gráfica…" : "Preparando el modelo…";
        const mb = txt.match(/(\d+)MB (?:fetched|loaded)/i);
        setProgress(r.progress, `${es} ${Math.round((r.progress || 0) * 100)} %${mb ? ` (${mb[1]} MB)` : ""}`);
      },
    });
    S.engine = engine;
    t.loadSec = (performance.now() - tLoad) / 1000;
    setProgress(1, "Modelo listo. Haciendo la pregunta de prueba…");
    $("run-out").hidden = false; $("run-stop").hidden = false;
    const t0 = performance.now();
    let first = null, text = "", chunks = 0, usage = null;
    const stream = await engine.chat.completions.create({
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: PROMPT }],
      stream: true, temperature: 0, max_tokens: 160, stream_options: { include_usage: true },
    });
    for await (const ch of stream) {
      const delta = ch.choices && ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content;
      if (delta) { if (first == null) first = performance.now(); text += delta; chunks++; $("run-out").textContent = text; }
      if (ch.usage) usage = ch.usage;
    }
    const tEnd = performance.now();
    t.ttftMs = first != null ? first - t0 : null;
    t.tokens = (usage && usage.completion_tokens) || chunks;
    t.promptTokens = usage && usage.prompt_tokens;
    const ex = (usage && usage.extra) || {};
    t.decodeTps = ex.decode_tokens_per_s || (first != null && tEnd > first ? (t.tokens - 1) / ((tEnd - first) / 1000) : null);
    t.prefillTps = ex.prefill_tokens_per_s || null;
    t.totalSec = (tEnd - t0) / 1000;
    t.answer = text.trim();
    t.ok = !!text.trim();
    if (!t.ok) t.error = "El modelo no devolvió texto.";
    const heap1 = heapMB();
    if (heap0 != null && heap1 != null) t.heapMB = heap1;
    if (t.decodeTps != null && t.decodeTps < 3) t.warnings.push("Muy lento para conversar (menos de 3 palabras por segundo, aprox.).");
    setProgress(1, t.ok ? `Listo: ${fmtNum(t.decodeTps)} tokens por segundo.` : t.error);
    renderSummary(); // el resultado se muestra ya; liberar el motor puede tardar en teléfonos lentos
  } catch (e) {
    console.warn("prueba-cerebro:", e);
    t.ok = false; t.error = friendly(e); t.detail = String((e && e.message) || e).slice(0, 300);
    $("run-status").innerHTML = `<span class="err">${esc(t.error)}</span>`;
  } finally {
    try { if (engine) await engine.unload(); } catch { /* */ }
    S.engine = null; S.busy = false;
    $("h-run").textContent = `Prueba ${m.label} ${t.ok ? "terminada" : "con problema"}`;
    try { sessionStorage.removeItem(RUN_KEY); } catch { /* */ }
    $("run-stop").hidden = true;
    try { const e2 = await navigator.storage.estimate(); S.storage.free = e2.quota - e2.usage; S.storage.usage = e2.usage; } catch { /* */ }
    setButtons(); renderSummary();
  }
}

// ---------- Recomendación ----------
export function recommend(st) {
  const g = st.gpu || {}, mem = st.device && st.device.memoryGB, s = st.tests.small, b = st.tests.big;
  const notes = [];
  if (!g.available) return { level: "no apto", cls: "no", why: "Chrome no puede usar la tarjeta gráfica (WebGPU) en este teléfono.", notes };
  if (g.fallback) notes.push("WebGPU funciona en modo emulado: todo será lento.");
  if (b && b.ok) {
    if (b.decodeTps >= 12 && (mem == null || mem >= 8)) return { level: "3B", cls: "", why: `El 1.5B corrió a ${fmtNum(b.decodeTps)} tokens/s: hay margen para un modelo de 3B (conviene probarlo antes de decidir).`, notes };
    if (b.decodeTps >= 5) return { level: "1.5B", cls: "", why: `El 1.5B corrió a ${fmtNum(b.decodeTps)} tokens/s: buen equilibrio entre calidad y velocidad.`, notes };
    notes.push(`El 1.5B corrió lento (${fmtNum(b.decodeTps)} tokens/s).`);
  } else if (b && !b.ok) notes.push(`El 1.5B no funcionó: ${b.error}`);
  if (s && s.ok) {
    if (s.decodeTps >= 25 && (mem == null || mem >= 6) && !(b && b.ok)) return { level: "1.5B", cls: "mid", why: `El 0.5B corrió rápido (${fmtNum(s.decodeTps)} tokens/s). Probablemente aguante 1.5B: confírmelo con la prueba 3.`, notes };
    if (s.decodeTps >= 6) return { level: "0.5B", cls: "", why: `El 0.5B corrió a ${fmtNum(s.decodeTps)} tokens/s: sirve para tareas simples sin internet.`, notes };
    if (s.decodeTps >= 3) return { level: "0.5B", cls: "mid", why: `El 0.5B funciona pero lento (${fmtNum(s.decodeTps)} tokens/s): solo para respuestas cortas.`, notes };
    return { level: "no apto", cls: "no", why: `Demasiado lento (${fmtNum(s.decodeTps)} tokens/s con el modelo más pequeño).`, notes };
  }
  if (s && !s.ok) return { level: "no apto", cls: "no", why: `El modelo pequeño no funcionó: ${s.error}`, notes };
  return { level: "pendiente", cls: "pend", why: "Toque «Probar modelo pequeño» para medir la velocidad real.", notes };
}
function testLines(t, label) {
  if (!t) return [`${label}: no probado`];
  if (!t.ok) return [`${label}: FALLÓ (${t.model}) — ${t.error}${t.detail ? ` [${t.detail}]` : ""}`];
  return [
    `${label}: ${t.model}${t.cached ? " (ya estaba descargado)" : ""}`,
    `  carga ${fmtNum(t.loadSec)} s · primer token ${t.ttftMs != null ? Math.round(t.ttftMs) + " ms" : "—"} · ${t.tokens} tokens en ${fmtNum(t.totalSec)} s`,
    `  velocidad ${fmtNum(t.decodeTps)} tokens/s (lectura del prompt ${fmtNum(t.prefillTps, 0)} tokens/s)` + (t.vramMB ? ` · memoria gráfica ~${t.vramMB} MB` : ""),
    ...(t.warnings || []).map((w) => `  aviso: ${w}`),
    `  respuesta: ${String(t.answer || "").replace(/\s+/g, " ").slice(0, 300)}`,
  ];
}
export function reportText(st) {
  const d = st.device || {}, g = st.gpu || {}, sto = st.storage || {}, r = recommend(st), i = g.info || {};
  return [
    `PRUEBA CEREBRO ANTARES (${new Date().toLocaleString("es-GT")})`,
    `Teléfono: ${[d.model, `${d.platform || ""} ${d.platformVersion || ""}`.trim()].filter(Boolean).join(" · ") || "desconocido"} · ${d.browser || ""}`,
    `RAM: ${d.memoryGB != null ? d.memoryGB + " GB (Chrome informa máx. 8)" : "no informa"} · núcleos: ${d.cores ?? "—"}`,
    `Almacenamiento: ${fmtBytes(sto.free)} libres de ${fmtBytes(sto.quota)}${sto.persisted ? " (persistente)" : ""}`,
    g.available
      ? `WebGPU: sí${g.fallback ? " (emulado)" : ""} · ${[i.vendor, i.architecture, i.description || i.device].filter(Boolean).join(" / ") || "sin detalle"} · f16: ${g.f16 ? "sí" : "no"} · maxBufferSize ${fmtBytes(g.limits.maxBufferSize)} · maxStorageBufferBindingSize ${fmtBytes(g.limits.maxStorageBufferBindingSize)} · workgroup ${Math.round(g.limits.maxComputeWorkgroupStorageSize / 1024)} KB`
      : `WebGPU: no — ${g.reason || ""}`,
    ...testLines(st.tests.small, "Prueba 0.5B"),
    ...testLines(st.tests.big, "Prueba 1.5B"),
    `RECOMENDACIÓN: ${r.level.toUpperCase()} — ${r.why}`,
    ...r.notes.map((n) => `Nota: ${n}`),
    ...(st.notes || []).map((n) => `Nota: ${n}`),
    `Motor: WebLLM ${RUNTIME_VERSION} · UA: ${d.ua || ""}`,
  ].join("\n");
}
function renderSummary() {
  const r = recommend(S);
  const label = r.level === "pendiente" ? "Pendiente" : r.level === "no apto" ? "No apto" : `Cerebro de ${r.level}`;
  const rows = ["small", "big"].map((k) => S.tests[k]).filter(Boolean).map((t) => t.ok
    ? `<li>${esc(MODELS[t.kind].label)}: <strong>${fmtNum(t.decodeTps)} tokens/s</strong>, primer token en ${t.ttftMs != null ? Math.round(t.ttftMs) + " ms" : "—"}, carga ${fmtNum(t.loadSec)} s${(t.warnings || []).length ? ` · <span class="err">${esc(t.warnings.join(" "))}</span>` : ""}</li>`
    : `<li class="err">${esc(MODELS[t.kind].label)}: ${esc(t.error)}</li>`).join("");
  $("summary").innerHTML = `<p class="muted" style="margin:0">Tamaño de cerebro recomendado para este teléfono:</p>
    <p class="verdict ${r.cls}" id="verdict">${esc(label)}</p><p style="margin:0">${esc(r.why)}</p>
    ${rows || r.notes.length ? `<ul class="notes">${rows}${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}`;
  $("report").textContent = reportText(S);
}
function setButtons() {
  const ok = S.gpu && S.gpu.available;
  $("run-small").disabled = S.busy || !ok;
  $("run-big").disabled = S.busy || !ok;
  $("clear-models").disabled = S.busy;
  $("run-small").textContent = S.busy ? "Prueba en curso…" : S.tests.small && S.tests.small.ok ? "Repetir prueba pequeña" : "Probar modelo pequeño";
}

// ---------- Botones ----------
$("run-small").addEventListener("click", () => runTest("small"));
$("run-big").addEventListener("click", () => runTest("big"));
$("run-stop").addEventListener("click", () => { try { S.engine && S.engine.interruptGenerate(); } catch { /* */ } });
$("copy").addEventListener("click", async () => {
  const txt = reportText(S);
  let ok = false;
  try { await navigator.clipboard.writeText(txt); ok = true; }
  catch { const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand("copy"); } catch { /* */ } ta.remove(); }
  $("copy-msg").textContent = ok ? "Resultados copiados. Péguelos en el chat." : "No pude copiar automáticamente: abra «Ver el texto que se copia» y cópielo a mano.";
  if (!ok) document.querySelector("details").open = true;
});
$("clear-models").addEventListener("click", async () => {
  if (!confirm("¿Borrar los modelos de prueba descargados? Libera espacio; la app Antares no se ve afectada.")) return;
  let n = 0;
  try { for (const k of await caches.keys()) if (/^webllm/i.test(k)) { await caches.delete(k); n++; } } catch { /* */ }
  try { const dbs = indexedDB.databases ? await indexedDB.databases() : []; for (const db of dbs) if (/^webllm/i.test(db.name || "")) { indexedDB.deleteDatabase(db.name); n++; } } catch { /* */ }
  try { const e = await navigator.storage.estimate(); S.storage.free = e.quota - e.usage; S.storage.usage = e.usage; renderDetect(); } catch { /* */ }
  $("copy-msg").textContent = n ? "Modelos de prueba borrados." : "No había modelos de prueba guardados.";
  renderSummary();
});

// ---------- Inicio ----------
(async () => {
  try {
    const prev = JSON.parse(sessionStorage.getItem(RUN_KEY) || "null");
    if (prev) {
      $("resume-warn").hidden = false;
      $("resume-warn").textContent = `La prueba anterior (${prev.model}) se interrumpió: probablemente el teléfono se quedó sin memoria y recargó la página. Cierre otras apps y pruebe otra vez, o use el modelo más pequeño.`;
      S.notes.push("prueba anterior interrumpida");
      sessionStorage.removeItem(RUN_KEY);
    }
  } catch { /* */ }
  try { await detect(); } catch (e) { S.gpu = S.gpu || { available: false, reason: friendly(e) }; }
  renderDetect(); setButtons(); renderSummary();
  // si la app ya está instalada, que su service worker se actualice (la versión nueva ignora esta página)
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration("../"); if (reg) reg.update(); } catch { /* */ }
})();
