// Antares Web - Cliente de la API de Google Gemini (REST, directo desde el navegador).
// La key se envía solo en el encabezado x-goog-api-key a generativelanguage.googleapis.com.
import { wordRegex } from "./facts.js";

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Modelos con plan gratuito, en orden de preferencia. El último que funcionó se prueba primero.
export const MODELS = [
  "gemini-3.5-flash-lite",   // ~0.6-1 s, usa "usted" con naturalidad
  "gemini-3.1-flash-lite",   // ~1.2 s
  "gemini-3.8-flash",        // ~2.2 s
  "gemini-flash-latest",     // ~2.0 s
  "gemini-3.6-flash",        // ~2.5 s
  "gemini-3.5-flash",        // ~3.1 s
  "gemini-3.7-flash",        // a veces 503
];
// Modelos rápidos para tareas internas (extraer datos para la memoria)
export const FAST_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

const MAX_MODELS = 3;            // cuántos modelos distintos se prueban como máximo por mensaje
const MAX_MODELS_MEDIA = 2;      // con fotos/videos (cada intento reenvía el archivo)
const RETRY_DELAY_MS = 1200;     // una sola espera corta ante 500/503 (nunca ante 429)
const TIMEOUT_MS = 45000;
const TOTAL_BUDGET_MS = 60000;
const STREAM_IDLE_MS = 30000;    // máximo sin recibir nada a mitad de una respuesta
const MAX_OUTPUT_TOKENS = 2048;
const THINKING_LEVEL = "low";

export const DEFAULT_ASSISTANT_NAME = "Antares";

const SYSTEM_PROMPT_TEMPLATE = (name) =>
  `Usted es ${name}, un asistente virtual personal. Habla en español de Costa Rica, ` +
  `con el "usted" respetuoso y cálido propio de los costarricenses.\n` +
  `REGLA OBLIGATORIA: trate SIEMPRE al usuario de "usted", en todas las respuestas sin ` +
  `excepción: usted tiene, usted puede, ¿le ayudo?, dígame, cuénteme, con mucho gusto. ` +
  `NUNCA use "vos" (tenés, podés, decime, contame) ni "tú" (tienes, puedes, dime). ` +
  `Antes de responder, revise que cada verbo y pronombre dirigido al usuario esté en forma de usted.\n` +
  `No use jerga ni modismos coloquiales: nada de "mae", "pura vida", "diay", "tuanis" ni ` +
  `expresiones similares.\n` +
  `Su tono es amable, cálido y profesional: cortés, claro y honesto, sin sonar frío ni robótico.\n` +
  `Por defecto responda de forma breve y directa (2 a 4 oraciones). Extiéndase solo si ` +
  `el usuario pide detalle o el tema realmente lo necesita. Si no sabe algo, ` +
  `dígalo con franqueza.\n` +
  `Escriba en texto plano: sin Markdown (nada de asteriscos, numerales ni ` +
  `tablas) y sin emojis, porque la app muestra texto simple y lo lee en voz alta.\n` +
  `Tiene acceso a datos que el usuario le pidió recordar; úselos solo cuando ` +
  `sean relevantes para la conversación.`;

export function buildSystemPrompt(assistantName = "", userName = "", personality = "") {
  const name = (assistantName || "").trim() || DEFAULT_ASSISTANT_NAME;
  let p = SYSTEM_PROMPT_TEMPLATE(name);
  userName = (userName || "").trim();
  personality = (personality || "").trim();
  if (userName) {
    p += `\n\nAl usuario le gusta que lo llamen "${userName}". Llámelo así de vez en cuando, con naturalidad (no en cada mensaje), siempre tratándolo de usted.`;
  }
  if (personality) {
    p += "\n\nPersonalidad y estilo que el usuario definió para usted " +
      "(sígalo siempre que no contradiga lo anterior sobre el trato de usted y el formato):\n" + personality;
  }
  return p;
}

// Mensajes que suelen necesitar info actual -> activar búsqueda de Google (grounding)
const SEARCH_HINTS = wordRegex(
  "hoy|ahora|actual(es|mente)?|[uú]ltim[oa]s?|noticias?|clima|pron[oó]stico|temperatura|lluvia|precio|" +
  "cu[aá]nto (cuesta|vale|est[aá])|tipo de cambio|d[oó]lar|colones|euro|resultado|marcador|partido|jug[oó]|gan[oó]|" +
  "elecci[oó]n(es)?|presidente|esta semana|este (mes|a[nñ]o)|ma[nñ]ana|ayer|20[2-3]\\d|horario|abierto|estreno|" +
  "lanzamiento|busque|b[uú]squeme|googlee|busca|buscá");

export function needsSearch(text) {
  return SEARCH_HINTS.test(text || "");
}

// ---------- Errores: mensaje corto para la persona + detalle técnico aparte ----------
export const ERRORS = {
  missing_key: ["Falta la API key", "Todavía no tengo una API key de Gemini. Agréguela en Configuración para que pueda responder."],
  rate: ["Un momento, por favor", "Se usaron las consultas gratuitas de Gemini de este momento. Espere unos segundos e intente de nuevo; su mensaje no se perdió."],
  daily: ["Cuota de hoy agotada", "Se agotaron las consultas gratuitas de hoy en los modelos disponibles. La cuota se renueva cada día; su mensaje no se perdió."],
  key_invalid: ["La API key no es válida", "Google no reconoce esta API key. Revísela en Configuración o cree una nueva en AI Studio."],
  key_expired: ["La API key venció", "Esta API key ya expiró. Cree una nueva en aistudio.google.com/apikey y péguela en Configuración."],
  key_restricted: ["La key tiene restricciones", "Esta API key está restringida (por sitio web, IP o app) y no permite usarla desde aquí. Quite la restricción o cree una key nueva en AI Studio."],
  service_disabled: ["API no activada", "La API de Gemini no está activada en el proyecto de esta key. Actívela en Google Cloud o cree la key desde AI Studio."],
  permission: ["Sin permiso", "Google rechazó la key por falta de permisos. Verifique que sea una key de Google AI Studio activa."],
  location: ["No disponible aquí", "Google indica que Gemini no está disponible desde su ubicación o red actual."],
  overloaded: ["Gemini está saturado", "Los servidores de Gemini están ocupados en este momento. Intente de nuevo en unos segundos."],
  timeout: ["Sin respuesta a tiempo", "Gemini tardó demasiado en responder. Intente de nuevo."],
  network: ["Sin conexión", "No pude comunicarme con Gemini. Revise su conexión a internet e intente de nuevo."],
  blocked: ["Respuesta bloqueada", "Gemini no respondió a esto por sus filtros de seguridad. Intente reformular la pregunta."],
  empty: ["Sin respuesta", "Gemini no devolvió ninguna respuesta. Intente de nuevo."],
  media: ["No pude procesar el archivo", "Gemini no pudo procesar el archivo adjunto. Pruebe con otro archivo o con uno más pequeño."],
  no_model: ["Sin modelos disponibles", "Ningún modelo de Gemini está disponible para su key en este momento."],
  unknown: ["Algo salió mal", "Gemini devolvió un error inesperado. Intente de nuevo; si sigue pasando, revise los detalles."],
};

export function parseApiError(bodyText) {
  const out = { status: "", message: "", reason: "", retryDelay: 0, daily: false };
  try {
    const err = JSON.parse(bodyText).error || {};
    out.status = err.status || "";
    out.message = err.message || "";
    for (const d of err.details || []) {
      const type = d["@type"] || "";
      if (type.endsWith("ErrorInfo") && d.reason) out.reason = d.reason;
      if (type.endsWith("RetryInfo") && d.retryDelay) out.retryDelay = parseFloat(d.retryDelay) || 0;
      if (type.endsWith("QuotaFailure")) {
        for (const v of d.violations || []) if (/PerDay/i.test(v.quotaId || "")) out.daily = true;
      }
    }
    if (!out.retryDelay) {
      const m = /retry in ([\d.]+)\s*s/i.exec(out.message);
      if (m) out.retryDelay = parseFloat(m[1]) || 0;
    }
  } catch { out.message = String(bodyText || "").slice(0, 200); }
  return out;
}

// Clasifica un error HTTP de Gemini
export function classifyError(code, e) {
  const low = `${e.status} ${e.reason} ${e.message}`.toLowerCase();
  if (code === 429 || e.status === "RESOURCE_EXHAUSTED") return e.daily ? "daily" : "rate";
  if (/api_key_invalid|api key not valid/.test(low)) return /expired/.test(low) ? "key_expired" : "key_invalid";
  if (/expired/.test(low) && /key/.test(low)) return "key_expired";
  if (/referrer|referer|ip_address_blocked|android_app_blocked|ios_app_blocked|api_key_service_blocked|blocked/.test(low) && (code === 403 || code === 400)) return "key_restricted";
  if (/service_disabled|has not been used|is disabled/.test(low)) return "service_disabled";
  if (/location is not supported|user location/.test(low)) return "location";
  if (code === 401) return "key_invalid";
  if (code === 403) return "permission";
  if (code === 404) return "no_model";
  if (code === 504) return "timeout";
  if (code >= 500) return "overloaded";
  return "unknown";
}

const STOP_KINDS = new Set(["key_invalid", "key_expired", "key_restricted", "service_disabled", "permission", "location"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pausas por modelo después de un 429 (se respeta el retryDelay que manda Google), compartidas entre clientes
const cooldown = {};

export class GeminiClient {
  constructor({ apiKey = "", assistantName = DEFAULT_ASSISTANT_NAME, userName = "", personality = "",
                preferredModel = "", noGrounding = {}, onModelOk = null } = {}) {
    this.apiKey = (apiKey || "").replace(/\s+/g, "");
    this.assistantName = (assistantName || "").trim() || DEFAULT_ASSISTANT_NAME;
    this.systemPrompt = buildSystemPrompt(this.assistantName, userName, personality);
    this.preferredModel = (preferredModel || "").trim();
    this.noGrounding = { ...noGrounding }; // modelos donde la búsqueda de Google falló
    this.onModelOk = onModelOk;            // callback({model, noGrounding})
    this.lastModel = "";
    this.attempts = [];
  }

  isConfigured() { return !!this.apiKey; }

  keyDescription() {
    const k = this.apiKey;
    const kind = k.startsWith("AIza") ? "AIza (key estándar)" : k.startsWith("AQ.") ? "AQ. (key nueva de AI Studio)" : "formato desconocido";
    return `Key: ${kind}, ${k.length} caracteres`;
  }

  static cooldownLeft(model) {
    const t = cooldown[model] || 0;
    return Math.max(0, Math.ceil((t - Date.now()) / 1000));
  }

  // ---------- API pública ----------
  // onChunk(textoAcumulado) se llama a medida que llega la respuesta (streaming).
  // media: [{mime, data}] (inline base64) o [{mime, fileUri}] (Files API). signal: AbortSignal (botón Detener).
  async ask(userMessage, history, knownFacts, { search = false, onChunk = null, media = null, signal = null, extraSystem = "" } = {}) {
    if (!this.isConfigured()) return this.errorResult("missing_key", 0, "");
    let system = this.systemPrompt;
    if (extraSystem) system += "\n\n" + extraSystem;
    if (knownFacts && knownFacts.length) {
      system += "\n\nLo que sabe del usuario (úselo con naturalidad cuando sea relevante, " +
        "sin repetirlo en cada mensaje):\n" + knownFacts.map((f) => `- ${f}`).join("\n");
    }
    if (search) system += "\n\nSi usa resultados de búsqueda, resúmalos con sus palabras en texto plano.";
    const hasMedia = !!(media && media.length);
    if (hasMedia) {
      system += "\n\nEl usuario adjuntó fotos, videos o documentos: descríbalos o analícelos según lo que pida, " +
        "con precisión y sin inventar detalles que no aparezcan.";
    }
    const messages = [...history, { role: "user", content: userMessage, media: hasMedia ? media : undefined }];
    return this.callApi(system, messages, {
      search: search && !hasMedia, onChunk, stream: !!onChunk, signal,
      ...(hasMedia ? { timeoutMs: 120000, budgetMs: 240000, maxModels: MAX_MODELS_MEDIA, retries: false } : {}),
    });
  }

  // Consulta que debe responder solo JSON (trivia y su verificación). Sin historial ni datos personales.
  async askJson(system, content, { signal = null, maxTokens = 2048 } = {}) {
    if (!this.isConfigured()) return this.errorResult("missing_key", 0, "");
    return this.callApi(system, [{ role: "user", content }], { json: true, maxTokens, signal, budgetMs: 60000, maxModels: 3, models: this.modelOrder() });
  }

  // Extrae datos personales duraderos del usuario (memoria automática). Devuelve solo los nuevos.
  async extractFacts(userText, assistantText, knownFacts = []) {
    if (!this.isConfigured() || !userText) return [];
    const system =
      "Usted extrae datos personales DURADEROS sobre el usuario a partir de su mensaje: nombre, " +
      "familia y nombres de familiares o mascotas, dónde vive, trabajo o estudios, gustos y " +
      "preferencias, fechas importantes (cumpleaños, aniversarios), salud o rutinas relevantes. " +
      "Ignore estados pasajeros (\"tengo hambre\"), preguntas, opiniones del asistente y datos de " +
      "otras personas que no se relacionen con el usuario. Escriba cada dato como frase corta en " +
      "español, en tercera persona y autocontenida (ej.: \"Se llama Freddy\", \"Su hija se llama " +
      "Evangeline\", \"Le gusta el café negro\"). No repita datos que ya están en la lista de " +
      "datos conocidos (aunque estén redactados distinto). Responda SOLO con JSON: " +
      "{\"facts\": [\"...\"]}. Si no hay datos nuevos, responda {\"facts\": []}.";
    const known = knownFacts.length ? knownFacts.map((f) => `- ${f}`).join("\n") : "(ninguno)";
    const content = `Datos conocidos:\n${known}\n\nMensaje del usuario:\n${userText}` +
      (assistantText ? `\n\nRespuesta del asistente (solo contexto):\n${assistantText.slice(0, 600)}` : "");
    const r = await this.callApi(system, [{ role: "user", content }], {
      models: FAST_MODELS, json: true, maxTokens: 512, budgetMs: 20000, retries: false, thinking: false, maxModels: 2,
    });
    if (!r.ok) return [];
    let facts = [];
    try {
      const txt = r.text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
      const data = JSON.parse(txt);
      facts = Array.isArray(data) ? data : (data.facts || []);
    } catch { return []; }
    const norm = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
    const seen = new Set(knownFacts.map(norm));
    const out = [];
    for (const f of facts) {
      if (typeof f !== "string") continue;
      const clean = f.trim().replace(/\s+/g, " ").slice(0, 160);
      const n = norm(clean);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(clean);
    }
    return out.slice(0, 5);
  }

  async testConnection() {
    if (!this.isConfigured()) return { ok: false, ms: 0, report: ERRORS.missing_key[1], r: this.errorResult("missing_key", 0, "") };
    const r = await this.callApi("Responda solamente con la palabra OK.",
      [{ role: "user", content: "Probando la conexión" }], { maxTokens: 256, maxModels: 3, budgetMs: 30000 });
    const lines = [`${r.ok ? "Conexión correcta" : "La conexión falló"} (${(r.ms / 1000).toFixed(1)} s)`, this.keyDescription()];
    if (r.ok) {
      lines.push(`Modelo: ${r.model} · envío de la key: encabezado x-goog-api-key`);
      lines.push(`Respuesta: ${r.text.slice(0, 80)}`);
      if (this.attempts.length > 1) lines.push("", "Intentos:", ...this.attemptsSummaryLines());
    } else {
      lines.push(r.text, "", r.details || "");
    }
    return { ok: r.ok, ms: r.ms, model: r.model, report: lines.join("\n").trim(), r };
  }

  attemptsSummaryLines() {
    const out = [];
    let prev = null, count = 0, last = null;
    const fmt = (a, n) => `- ${a.model}${a.search ? " + búsqueda" : ""} -> ${a.code} ${a.msg}`.trim() + (n > 1 ? ` (x${n})` : "");
    for (const a of this.attempts) {
      const key = [a.model, a.code, a.msg, a.search].join("|");
      if (key === prev) { count++; continue; }
      if (prev !== null) out.push(fmt(last, count));
      prev = key; last = a; count = 1;
    }
    if (prev !== null) out.push(fmt(last, count));
    return out;
  }

  errorResult(kind, ms, extra = "", retryAfter = 0) {
    const [title, text] = ERRORS[kind] || ERRORS.unknown;
    let details = this.attempts.length ? "Intentos:\n" + this.attemptsSummaryLines().join("\n") : "";
    if (extra) details = (extra + (details ? "\n\n" + details : "")).trim();
    if (this.apiKey) details = details.split(this.apiKey).join("***");
    return { ok: false, kind, title, text, details, retryAfter, sources: [], model: "", ms };
  }

  // ---------- Internos ----------
  static toContents(messages) {
    const contents = [];
    for (const m of messages) {
      const text = String(m.content || "").trim();
      const media = (m.media || []).filter((x) => x && x.mime && (x.data || x.fileUri)).map((x) => x.fileUri
        ? { file_data: { mime_type: x.mime, file_uri: x.fileUri } }
        : { inline_data: { mime_type: x.mime, data: x.data } });
      if (!text && !media.length) continue;
      const role = (m.role === "assistant" || m.role === "model") ? "model" : "user";
      const last = contents[contents.length - 1];
      if (last && last.role === role) {
        const tp = last.parts.find((p) => "text" in p);
        if (text) { if (tp) tp.text += "\n\n" + text; else last.parts.push({ text }); }
        last.parts.unshift(...media);
      } else {
        // las fotos/videos van antes del texto (recomendado por Gemini)
        contents.push({ role, parts: [...media, ...(text ? [{ text }] : [])] });
      }
    }
    while (contents.length && contents[0].role !== "user") contents.shift();
    return contents;
  }

  modelOrder() {
    const order = [];
    if (this.preferredModel && MODELS.includes(this.preferredModel)) order.push(this.preferredModel);
    for (const m of MODELS) if (!order.includes(m)) order.push(m);
    return order;
  }

  // El cuerpo se arma una sola vez por mensaje: los adjuntos en base64 no se vuelven a serializar en cada intento.
  static bodyString(sysJson, contentsJson, { thinking, search, maxTokens, json }) {
    const generationConfig = { maxOutputTokens: maxTokens, temperature: json ? 0.2 : 0.7 };
    if (thinking) generationConfig.thinkingConfig = { thinkingLevel: THINKING_LEVEL };
    if (json) generationConfig.responseMimeType = "application/json";
    return `{"system_instruction":${sysJson},"contents":${contentsJson},"generationConfig":${JSON.stringify(generationConfig)}` +
      (search ? `,"tools":[{"google_search":{}}]` : "") + "}";
  }

  static parseResponse(data) {
    const cands = data.candidates || [];
    if (!cands.length) return { ok: false, kind: (data.promptFeedback || {}).blockReason ? "blocked" : "empty" };
    const c = cands[0];
    const parts = (c.content || {}).parts || [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
    const sources = GeminiClient.sourcesOf(c, []);
    if (text) return { text, ok: true, sources };
    return { ok: false, kind: c.finishReason === "SAFETY" ? "blocked" : "empty" };
  }

  static sourcesOf(c, sources) {
    for (const ch of ((c.groundingMetadata || {}).groundingChunks || [])) {
      const uri = ch.web && ch.web.uri;
      if (uri && /^https:\/\//i.test(uri) && !sources.some((x) => x.uri === uri)) {
        sources.push({ uri, title: ch.web.title || new URL(uri).hostname });
      }
    }
    return sources.slice(0, 5);
  }

  // Lee un stream SSE de Gemini. Devuelve {text, sources, finishReason, blockReason}.
  async readStream(resp, onChunk, resetIdle) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", text = "", finishReason = "", blockReason = "";
    let sources = [];
    const handle = (json) => {
      let data;
      try { data = JSON.parse(json); } catch { return; }
      if (data.error) throw new Error(data.error.message || "error en el stream");
      if (data.promptFeedback && data.promptFeedback.blockReason) blockReason = data.promptFeedback.blockReason;
      const c = (data.candidates || [])[0];
      if (!c) return;
      const parts = (c.content || {}).parts || [];
      const piece = parts.filter((p) => !p.thought).map((p) => p.text || "").join("");
      if (c.finishReason) finishReason = c.finishReason;
      sources = GeminiClient.sourcesOf(c, sources);
      if (piece) { text += piece; if (onChunk) { try { onChunk(text); } catch { /* */ } } }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      resetIdle();
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
        const event = buf.slice(0, idx);
        buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
        const dataLines = event.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
        if (dataLines.length) handle(dataLines.join("\n"));
      }
    }
    if (buf.trim().startsWith("data:")) handle(buf.trim().slice(5).trim());
    return { text: text.trim(), sources, finishReason, blockReason };
  }

  async callApi(system, messages, {
    search = false, maxTokens = MAX_OUTPUT_TOKENS, stream = false, onChunk = null, models = null, json = false,
    budgetMs = TOTAL_BUDGET_MS, retries = true, timeoutMs = TIMEOUT_MS, thinking: thinkingOpt = true,
    maxModels = MAX_MODELS, signal = null,
  } = {}) {
    this.attempts = [];
    const t0 = performance.now();
    const elapsed = () => Math.round(performance.now() - t0);
    const hasMedia = messages.some((m) => m.media && m.media.length);
    const internal = !!models; // llamadas internas no cambian el modelo preferido
    const deadline = t0 + budgetMs;
    const sysJson = JSON.stringify({ parts: [{ text: system }] });
    const contentsJson = JSON.stringify(GeminiClient.toContents(messages));
    let queue = models ? [...models] : this.modelOrder();
    let lastKind = "", lastExtra = "", rateDelays = [], tried = 0;

    const record = (model, code, msg, usedSearch) => {
      msg = String(msg || "").replace(/\s+/g, " ").trim().slice(0, 160);
      if (this.apiKey) msg = msg.split(this.apiKey).join("***");
      this.attempts.push({ model, code, msg, search: usedSearch });
      console.log(`Antares LLM: ${model}${usedSearch ? " +search" : ""} -> ${code} ${msg}`);
    };
    const ok = (r, model, extra = {}) => {
      this.lastModel = model;
      if (!internal) {
        const changed = model !== this.preferredModel;
        this.preferredModel = model;
        if (changed && this.onModelOk) { try { this.onModelOk({ model, noGrounding: this.noGrounding }); } catch { /* */ } }
      }
      return { ...r, ok: true, model, ms: elapsed(), ...extra };
    };
    const aborted = () => !!(signal && signal.aborted);
    const stopped = (partial, model) => partial
      ? ok({ text: partial, sources: [] }, model, { stopped: true })
      : { ok: false, kind: "stopped", stopped: true, text: "", sources: [], model: "", ms: elapsed() };

    // Los modelos en pausa por un 429 reciente se dejan para el final (o se saltan)
    const cooling = queue.filter((m) => GeminiClient.cooldownLeft(m) > 0);
    queue = [...queue.filter((m) => !cooling.includes(m))];
    if (!queue.length) {
      const wait = Math.min(...cooling.map((m) => GeminiClient.cooldownLeft(m)));
      for (const m of cooling) record(m, 429, `en pausa ${GeminiClient.cooldownLeft(m)} s por límite de consultas`, false);
      return this.errorResult("rate", elapsed(), "", wait);
    }

    while (queue.length && tried < maxModels) {
      if (aborted()) return stopped("", "");
      if (performance.now() > deadline) { record("(resto)", "-", "se agotó el tiempo total", false); lastKind = lastKind || "timeout"; break; }
      const model = queue.shift();
      let thinking = thinkingOpt, retried = false, countedModel = false;
      let useSearch = search && !this.noGrounding[model];
      for (;;) {
        const remaining = deadline - performance.now();
        if (remaining < 3000) break;
        if (!countedModel) { tried++; countedModel = true; }
        const url = `${GEMINI_BASE_URL}/${model}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;
        const body = GeminiClient.bodyString(sysJson, contentsJson, { thinking, search: useSearch, maxTokens, json });
        const ctrl = new AbortController();
        const onAbort = () => ctrl.abort();
        if (signal) signal.addEventListener("abort", onAbort, { once: true });
        let timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, remaining));
        const cleanup = () => { clearTimeout(timer); if (signal) signal.removeEventListener("abort", onAbort); };
        let resp;
        try {
          resp = await fetch(url, {
            method: "POST", signal: ctrl.signal,
            headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
            body,
          });
        } catch (e) {
          cleanup();
          if (aborted()) return stopped("", "");
          if (e.name === "AbortError") {
            record(model, "timeout", `sin respuesta en ${Math.round(Math.min(timeoutMs, remaining) / 1000)} s`, useSearch);
            lastKind = "timeout";
            break;
          }
          record(model, "red", e.message || e, useSearch);
          return this.errorResult("network", elapsed(), String(e.message || e));
        }

        if (resp.ok && stream && resp.body) {
          // Streaming: los errores después del primer texto ya no cambian de modelo
          let partial = "";
          try {
            const st = await this.readStream(resp, (t) => { partial = t; onChunk && onChunk(t); }, () => {
              clearTimeout(timer);
              timer = setTimeout(() => ctrl.abort(), STREAM_IDLE_MS);
            });
            cleanup();
            if (st.text) {
              record(model, 200, "OK (stream)", useSearch);
              return ok({ text: st.text, sources: st.sources }, model);
            }
            const blocked = !!(st.blockReason || st.finishReason === "SAFETY");
            record(model, 200, `vacío ${st.finishReason || st.blockReason || ""}`, useSearch);
            if (blocked) return this.errorResult("blocked", elapsed(), st.blockReason || st.finishReason);
            lastKind = "empty";
            break; // respuesta vacía: probar otro modelo
          } catch (e) {
            cleanup();
            if (aborted()) { record(model, 200, "detenido por el usuario", useSearch); return stopped(partial, model); }
            if (partial) {
              record(model, 200, "stream cortado", useSearch);
              return ok({ text: partial + "\n\n(La respuesta se cortó por un problema de conexión.)", sources: [] }, model, { cut: true });
            }
            record(model, e.name === "AbortError" ? "timeout" : "stream", e.message || e, useSearch);
            lastKind = "timeout";
            break;
          }
        }

        let bodyText = "";
        try { bodyText = await resp.text(); } catch { bodyText = ""; }
        cleanup();
        if (aborted()) return stopped("", "");

        if (resp.ok) {
          let data = {};
          try { data = JSON.parse(bodyText); } catch { /* vacío */ }
          const r = GeminiClient.parseResponse(data);
          record(model, 200, r.ok ? "OK" : r.kind, useSearch);
          if (r.ok) return ok(r, model);
          if (r.kind === "blocked") return this.errorResult("blocked", elapsed());
          lastKind = "empty";
          break;
        }

        const code = resp.status;
        const err = parseApiError(bodyText);
        const kind = classifyError(code, err);
        record(model, code, `${err.status}${err.reason ? " " + err.reason : ""}: ${err.message}`, useSearch);
        lastExtra = `HTTP ${code} ${err.status} ${err.reason}\n${err.message}`.trim();

        if (code === 400 && thinking && /thinking/i.test(err.message)) { thinking = false; continue; }
        // La búsqueda de Google no está en todos los planes/modelos: reintentar sin ella
        if (useSearch && code >= 400 && code < 500 && code !== 429 && !STOP_KINDS.has(kind)) {
          useSearch = false;
          this.noGrounding[model] = true;
          if (this.onModelOk && !internal) { try { this.onModelOk({ noGrounding: this.noGrounding }); } catch { /* */ } }
          continue;
        }
        if (STOP_KINDS.has(kind)) return this.errorResult(kind, elapsed(), lastExtra);
        if (kind === "rate" || kind === "daily") {
          // No se reintenta el mismo modelo: se respeta el retryDelay y se prueba el siguiente
          const delay = Math.max(err.retryDelay || 0, kind === "daily" ? 3600 : 20);
          cooldown[model] = Date.now() + delay * 1000;
          rateDelays.push({ delay: err.retryDelay || 20, daily: kind === "daily" });
          lastKind = kind;
          break;
        }
        if (kind === "no_model") { tried--; lastKind = lastKind || "no_model"; break; } // modelo inexistente: no cuenta
        if (hasMedia && code === 400) { lastKind = "media"; break; }
        if ((code === 500 || code === 503) && retries && !retried && !hasMedia) { retried = true; await sleep(RETRY_DELAY_MS); continue; }
        if (code >= 500) { lastKind = kind; break; }
        return this.errorResult(kind, elapsed(), lastExtra);
      }
    }
    if (rateDelays.length && (lastKind === "rate" || lastKind === "daily" || !lastKind)) {
      const allDaily = rateDelays.every((d) => d.daily);
      const wait = Math.ceil(Math.min(...rateDelays.map((d) => d.delay)));
      return this.errorResult(allDaily ? "daily" : "rate", elapsed(), lastExtra, allDaily ? 0 : Math.min(Math.max(wait, 5), 120));
    }
    return this.errorResult(lastKind || "no_model", elapsed(), lastExtra);
  }
}
