// Antares v1.18 · Cerebro local (sin internet) con WebLLM (MLC, Apache-2.0) y Qwen2.5-1.5B en la tarjeta gráfica (WebGPU).
// El modelo se descarga una sola vez (~1 GB) y WebLLM lo guarda en la Cache Storage del navegador ("webllm/…").
export const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const MODEL_ID_F32 = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";
export const LABEL = "Cerebro local · 1.5B";
export const APPROX_MB = 1100;
const RUNTIME = new URL("../prueba-cerebro/vendor/web-llm/web-llm.js", import.meta.url).href;
const FLAG = "antares.localbrain.v1"; // localStorage: {downloaded:true, model}

let webllm = null, engine = null, loading = null, modelInUse = null;
const listeners = new Set();
export const state = { phase: "idle", progress: 0, text: "", mb: 0, error: "" }; // idle | loading | ready | error
const emit = (patch) => { Object.assign(state, patch); listeners.forEach((f) => { try { f(state); } catch { /* */ } }); };
export const onState = (f) => { listeners.add(f); return () => listeners.delete(f); };

const flag = () => { try { return JSON.parse(localStorage.getItem(FLAG) || "{}"); } catch { return {}; } };
export const isDownloaded = () => !!flag().downloaded;
export const isReady = () => !!engine;
export const hasWebGPU = () => typeof navigator !== "undefined" && !!navigator.gpu;

async function runtime() {
  if (webllm) return webllm;
  webllm = typeof window !== "undefined" && window.__antaresWebLLM ? window.__antaresWebLLM : await import(RUNTIME); // (las pruebas inyectan un motor falso)
  return webllm;
}
async function pickModel() {
  try {
    const a = await navigator.gpu.requestAdapter();
    if (a && !a.features.has("shader-f16")) return MODEL_ID_F32;
  } catch { /* */ }
  return MODEL_ID;
}
export async function checkCache() {
  try { const w = await runtime(); const m = flag().model || MODEL_ID; return w.hasModelInCache ? !!(await w.hasModelInCache(m)) : isDownloaded(); } catch { return false; }
}

export function friendly(e) {
  const m = String((e && (e.message || e.name)) || e || "");
  if (/QuotaExceeded|quota|storage/i.test(m)) return "No hay espacio para guardar el modelo (necesita unos 1,2 GB libres). Libere espacio e intente de nuevo.";
  if (/Failed to fetch|NetworkError|network|Load failed|fetch/i.test(m)) return "Se cortó la descarga. Conéctese a Wi-Fi e intente de nuevo; lo ya descargado se aprovecha.";
  if (/device.*lost|DeviceLost|GPUDevice/i.test(m)) return "El teléfono cerró la tarjeta gráfica (casi siempre por falta de memoria). Cierre otras apps e intente de nuevo.";
  if (/out of memory|OOM|allocation|memory/i.test(m)) return "El teléfono se quedó sin memoria para el modelo. Cierre otras apps e intente de nuevo.";
  if (/WebGPU|navigator\.gpu|adapter/i.test(m)) return "Este navegador no puede usar la tarjeta gráfica (WebGPU). Use Chrome actualizado en Android.";
  if (/import|module|SyntaxError/i.test(m)) return "No se pudo cargar el motor del cerebro local. Actualice Chrome e intente de nuevo.";
  return "No se pudo preparar el cerebro local.";
}

// Descarga (primera vez) o carga desde la caché. Idempotente.
export function load() {
  if (engine) return Promise.resolve(engine);
  if (loading) return loading;
  if (!hasWebGPU() && !(typeof window !== "undefined" && window.__antaresWebLLM)) {
    const err = new Error("WebGPU no disponible"); emit({ phase: "error", error: friendly(err) }); return Promise.reject(err);
  }
  loading = (async () => {
    const was = isDownloaded();
    emit({ phase: "loading", progress: 0, mb: 0, error: "", text: was ? "Cargando el cerebro guardado…" : "Descargando el cerebro local…" });
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* */ }
    const w = await runtime();
    const model = await pickModel();
    engine = await w.CreateMLCEngine(model, {
      initProgressCallback: (r) => {
        const txt = String(r.text || "");
        const mb = +((txt.match(/(\d+)\s*MB (?:fetched|loaded)/i) || [])[1] || state.mb || 0);
        const es = /shader|Compil|pipeline|GPU/i.test(txt) ? "Preparando la tarjeta gráfica…" : was || /Loading model from cache/i.test(txt) ? "Cargando el cerebro guardado…" : "Descargando el cerebro local…";
        emit({ phase: "loading", progress: r.progress || 0, mb, text: es });
      },
    });
    modelInUse = model;
    try { localStorage.setItem(FLAG, JSON.stringify({ downloaded: true, model, at: Date.now() })); } catch { /* */ }
    emit({ phase: "ready", progress: 1, text: "Cerebro local listo." });
    return engine;
  })().catch((e) => { engine = null; emit({ phase: "error", error: friendly(e), text: "" }); throw e; }).finally(() => { loading = null; });
  return loading;
}

export async function unload() { const e = engine; engine = null; if (e) { try { await e.unload(); } catch { /* */ } } emit({ phase: "idle", progress: 0, text: "" }); }
export async function forget() {
  await unload();
  try { const w = await runtime(); if (w.deleteModelAllInfoInCache) await w.deleteModelAllInfoInCache(flag().model || MODEL_ID); } catch { /* */ }
  try { localStorage.removeItem(FLAG); } catch { /* */ }
}
export function stop() { try { engine && engine.interruptGenerate(); } catch { /* */ } }

// Indicaciones cortas (el modelo es pequeño: menos texto = más rápido y más obediente)
export function systemPrompt({ assistantName = "Antares", userName = "", facts = [], spoken = false } = {}) {
  const d = new Date();
  return [
    `Usted es ${assistantName}, el asistente personal de ${userName || "su dueño"}, que vive en Costa Rica. Trate SIEMPRE de usted, en español claro, amable y directo, como un mayordomo experto.`,
    "Sabe de: sistemas y programación (Python, JavaScript, SQL, redes), robótica (Arduino, ESP32, sensores, motores), electromecánica (motores eléctricos, circuitos, mantenimiento), arqueología, historia, geografía (sobre todo de Costa Rica y Centroamérica), matemáticas y física, y ofimática (Excel, Word).",
    "Ahora está SIN internet: no invente noticias, clima, precios ni el tipo de cambio; si se lo piden, diga que necesita conexión. Si no sabe algo, dígalo.",
    spoken ? "Su respuesta se leerá en voz alta: 1 a 3 oraciones, sin listas ni markdown." : "Responda breve (máximo 6 oraciones) salvo que le pidan detalle; puede usar listas cortas y bloques de código.",
    `Hoy es ${d.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}.`,
    facts.length ? "Lo que sabe del usuario: " + facts.slice(0, 12).join("; ") + "." : "",
  ].filter(Boolean).join("\n");
}

// Respuesta en streaming. history: [{role:"user"|"assistant", content}]
export async function chat(text, { history = [], system = "", onChunk, signal, maxTokens = 320 } = {}) {
  const e = await load();
  const messages = [{ role: "system", content: system }, ...history.filter((m) => m.content && (m.role === "user" || m.role === "assistant")).slice(-6), { role: "user", content: text }];
  const onAbort = () => stop();
  signal && signal.addEventListener("abort", onAbort);
  const t0 = performance.now();
  let out = "", usage = null;
  try {
    const stream = await e.chat.completions.create({ messages, stream: true, temperature: 0.6, top_p: 0.9, max_tokens: maxTokens, stream_options: { include_usage: true } });
    for await (const ch of stream) {
      const delta = ch.choices && ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content;
      if (delta) { out += delta; onChunk && onChunk(out); }
      if (ch.usage) usage = ch.usage;
    }
  } finally { signal && signal.removeEventListener("abort", onAbort); }
  const ex = (usage && usage.extra) || {};
  return { ok: !!out.trim(), text: out.trim(), stopped: !!(signal && signal.aborted), model: modelInUse, tps: ex.decode_tokens_per_s || null, ms: performance.now() - t0 };
}

// Acciones simples sin internet (además de los recordatorios/compras/bitácora que la app ya entiende por frases)
export function parseAction(text) {
  const t = String(text || "").trim();
  let m;
  if ((m = t.match(/^\s*(?:por favor[,\s]+)?(?:recuerde|sepa|aprenda|guarde|anote en (?:su )?memoria)\s+que\s+(.{3,200})$/i))) return { name: "guardar_memoria", args: { dato: thirdPerson(m[1].replace(/[.!]+$/, "")) } };
  const LIST = "(?:a|en)\\s+(?:la\\s+)?(?:lista(?:\\s+de(?:\\s+las)?\\s+compras|\\s+del\\s+s[uú]per)?|las\\s+compras|el\\s+s[uú]per)";
  if ((m = t.match(new RegExp("^\\s*(?:por favor[,\\s]+)?(?:agr[eé]gue(?:me)?|a[nñ][aá]da(?:me)?|apunte|ponga|anote|meta)\\s+(.{2,80}?)\\s+" + LIST + "\\s*[.!]?$", "i")))) {
    const q = m[1].match(/^(\d+(?:[.,]\d+)?\s*(?:kg|kilos?|litros?|l|g|gramos|paquetes?|cajas?|bolsas?|unidades)?)\s+(?:de\s+)?(.+)$/i);
    return { name: "agregar_compra", args: q ? { producto: q[2], cantidad: q[1].trim() } : { producto: m[1] } };
  }
  if ((m = t.match(new RegExp("^\\s*(?:por favor[,\\s]+)?(?:quite|borre|elimine|saque|tache)\\s+(.{2,60}?)\\s+(?:de|en)\\s+(?:la\\s+)?(?:lista(?:\\s+de(?:\\s+las)?\\s+compras|\\s+del\\s+s[uú]per)?|las\\s+compras|el\\s+s[uú]per)\\s*[.!]?$", "i")))) return { name: "quitar_compra", args: { producto: m[1].replace(/^(?:el|la|los|las|un|una)\s+/i, "") } };
  if ((m = t.match(/^\s*¿?\s*qu[eé]\s+(?:recuerda|sabe)\s+(?:de\s+m[ií]\s+)?(?:sobre|de|acerca de)\s+(.{2,60}?)\s*\??$/i))) return { name: "recordar_memoria", args: { tema: m[1].replace(/^(?:mi|mis|el|la|los|las)\s+/i, "") } };
  if (/^\s*¿?\s*qu[eé]\s+(?:hay\s+en\s+)?(?:la\s+)?lista\s+de\s+(?:compras|s[uú]per)/i.test(t) || /^\s*¿?\s*qu[eé]\s+(?:tengo\s+que|hay\s+que)\s+comprar/i.test(t)) return { name: "listar_compras", args: {} };
  if (/^\s*¿?\s*(?:qu[eé]|cu[aá]les)\s+recordatorios/i.test(t) || /^\s*¿?\s*qu[eé]\s+tengo\s+pendiente/i.test(t)) return { name: "listar_recordatorios", args: {} };
  if (/\b(clima|tiempo hace|llover|lluvia|temperatura)\b/i.test(t) && /\b(hoy|ahora|mañana|hace|va a)\b/i.test(t)) return { name: "_net", args: { what: "el clima" } };
  if (/\b(tipo de cambio|d[oó]lar)\b/i.test(t) && /\b(c[oó]mo|cu[aá]nto|precio|est[aá]|hoy)\b/i.test(t)) return { name: "_net", args: { what: "el tipo de cambio" } };
  if (/\b(noticias|busque en internet|b[uú]squeme|en google)\b/i.test(t)) return { name: "_net", args: { what: "buscar en internet" } };
  return null;
}

// «mi camión es…» -> «su camión es…» (los datos se guardan en tercera persona)
export function thirdPerson(x) {
  const map = { mi: "su", mis: "sus", yo: "", me: "le", tengo: "tiene", soy: "es", estoy: "está", trabajo: "trabaja", vivo: "vive", prefiero: "prefiere", uso: "usa", "mío": "suyo", "mía": "suya" };
  let out = String(x).replace(/\b(mi|mis|yo|me|tengo|soy|estoy|trabajo|vivo|prefiero|uso|m[ií]o|m[ií]a)\b/gi, (w) => { const r = map[w.toLowerCase().replace("i", "í").replace("í", w.toLowerCase().includes("í") || /^m[ií][oa]$/i.test(w) ? "í" : "i")] ?? map[w.toLowerCase()]; return r ?? w; });
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}
