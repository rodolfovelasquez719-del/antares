// Antares Web - Cliente de la API de Google Gemini (REST, directo desde el navegador).
// La key se envía solo a generativelanguage.googleapis.com y nunca sale de este dispositivo.

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Modelos con plan gratuito, en orden de preferencia (IDs verificados en
// ai.google.dev/gemini-api/docs/models, 2026-10). El último que funcionó se prueba primero.
export const MODELS = [
  "gemini-3.5-flash-lite",   // ~0.6 s, usa "usted" con naturalidad
  "gemini-3.1-flash-lite",   // ~1.2 s
  "gemini-3.8-flash",        // ~2.2 s
  "gemini-flash-latest",     // ~2.0 s
  "gemini-3.6-flash",        // ~2.5 s
  "gemini-3.5-flash",        // ~3.1 s
  "gemini-3.7-flash",        // a veces 503
];
// Modelo rápido para tareas internas (extraer datos para la memoria)
export const FAST_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest"];

const RETRYABLE = [429, 500, 502, 503, 504];
const RETRY_DELAY_MS = 1500;
const TIMEOUT_MS = 45000;
const TOTAL_BUDGET_MS = 60000;
const STREAM_IDLE_MS = 30000; // máximo sin recibir nada a mitad de una respuesta
const MAX_OUTPUT_TOKENS = 2048;
const THINKING_LEVEL = "low";

export const AUTH_LABELS = { header: "header x-goog-api-key", query: "?key=", bearer: "Bearer" };
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
    p += `\n\nEl usuario se llama ${userName}. Llámelo así de vez en cuando, con naturalidad (no en cada mensaje), siempre tratándolo de usted.`;
  }
  if (personality) {
    p += "\n\nPersonalidad y estilo que el usuario definió para usted " +
      "(sígalo siempre que no contradiga lo anterior sobre el trato de usted y el formato):\n" + personality;
  }
  return p;
}

export const MISSING_KEY_MSG =
  "No tengo configurada la API key de Gemini todavía. Consígala gratis en " +
  "Google AI Studio (aistudio.google.com/apikey) y agréguela en Configuración " +
  "(el engranaje arriba a la derecha) para que pueda responder.";

// Mensajes que suelen necesitar info actual -> activar búsqueda de Google (grounding)
const SEARCH_HINTS = /\b(hoy|ahora|actual(es|mente)?|últim[oa]s?|ultim[oa]s?|noticias?|clima|pron[oó]stico|temperatura|precio|cu[aá]nto (cuesta|vale|est[aá])|tipo de cambio|d[oó]lar|colones|resultado|marcador|partido|jug[oó]|gan[oó]|elecci[oó]n|presidente|esta semana|este (mes|año)|ma[nñ]ana|ayer|20[2-3]\d|horario|abierto|estreno|lanzamiento|busc[aá]|googlea)\b/i;

export function needsSearch(text) {
  return SEARCH_HINTS.test(text || "");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GeminiClient {
  constructor({ apiKey = "", assistantName = DEFAULT_ASSISTANT_NAME, userName = "", personality = "",
                preferredModel = "", authMethod = "", noGrounding = {}, onModelOk = null } = {}) {
    this.apiKey = (apiKey || "").replace(/\s+/g, "");
    this.assistantName = (assistantName || "").trim() || DEFAULT_ASSISTANT_NAME;
    this.systemPrompt = buildSystemPrompt(this.assistantName, userName, personality);
    this.preferredModel = (preferredModel || "").trim();
    this.authMethod = authMethod || "";
    this.noGrounding = { ...noGrounding }; // modelos donde la búsqueda de Google falló
    this.onModelOk = onModelOk;            // callback({model, authMethod, noGrounding})
    this.lastOk = true;
    this.lastModel = "";
    this.attempts = [];
  }

  isConfigured() { return !!this.apiKey; }

  keyDescription() {
    const k = this.apiKey;
    const kind = k.startsWith("AIza") ? "AIza (key estándar)"
      : k.startsWith("AQ.") ? "AQ. (auth key nueva de AI Studio)" : "formato desconocido";
    return `Key: ${kind}, ${k.length} caracteres`;
  }

  // ---------- API pública ----------
  // onChunk(textoAcumulado) se llama a medida que llega la respuesta (streaming)
  // media: [{mime, data}] (inline base64) o [{mime, fileUri}] (Files API)
  async ask(userMessage, history, knownFacts, { search = false, onChunk = null, media = null } = {}) {
    if (!this.isConfigured()) { this.lastOk = false; return { text: MISSING_KEY_MSG, ok: false, sources: [] }; }
    let system = this.systemPrompt;
    if (knownFacts && knownFacts.length) {
      system += "\n\nLo que sabe del usuario (úselo con naturalidad cuando sea relevante, " +
        "sin repetirlo en cada mensaje):\n" + knownFacts.map((f) => `- ${f}`).join("\n");
    }
    if (search) {
      system += "\n\nSi usa resultados de búsqueda, resúmalos con sus palabras en texto plano.";
    }
    const hasMedia = !!(media && media.length);
    if (hasMedia) {
      system += "\n\nEl usuario adjuntó fotos o videos: descríbalos o analícelos según lo que pida, " +
        "con precisión y sin inventar detalles que no se vean.";
    }
    const messages = [...history, { role: "user", content: userMessage, media: hasMedia ? media : undefined }];
    return this.callApi(system, messages, {
      search: search && !hasMedia, onChunk, stream: !!onChunk,
      ...(hasMedia ? { timeoutMs: 120000, budgetMs: 240000 } : {}),
    });
  }

  // Extrae datos personales duraderos del usuario (para la memoria automática).
  // Devuelve un array de frases cortas, solo las nuevas.
  async extractFacts(userText, assistantText, knownFacts = []) {
    if (!this.isConfigured() || !userText) return [];
    const system =
      "Extraés datos personales DURADEROS sobre el usuario a partir de su mensaje: nombre, " +
      "familia y nombres de familiares o mascotas, dónde vive, trabajo o estudios, gustos y " +
      "preferencias, fechas importantes (cumpleaños, aniversarios), salud o rutinas relevantes. " +
      "Ignorá estados pasajeros (\"tengo hambre\"), preguntas, opiniones del asistente y datos de " +
      "otras personas que no se relacionen con el usuario. Escribí cada dato como frase corta en " +
      "español, en tercera persona y autocontenida (ej: \"Se llama Freddy\", \"Su hija se llama " +
      "Evangeline\", \"Le gusta el café negro\"). No repitas datos que ya están en la lista de " +
      "datos conocidos (aunque estén redactados distinto). Respondé SOLO con JSON: " +
      "{\"facts\": [\"...\"]}. Si no hay datos nuevos, {\"facts\": []}.";
    const known = knownFacts.length ? knownFacts.map((f) => `- ${f}`).join("\n") : "(ninguno)";
    const content = `Datos conocidos:\n${known}\n\nMensaje del usuario:\n${userText}` +
      (assistantText ? `\n\nRespuesta del asistente (solo contexto):\n${assistantText.slice(0, 600)}` : "");
    const r = await this.callApi(system, [{ role: "user", content }], {
      models: FAST_MODELS, json: true, maxTokens: 512, budgetMs: 20000, retries: false, thinking: false,
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
    if (!this.isConfigured()) return { report: MISSING_KEY_MSG, ok: false };
    const t0 = performance.now();
    const r = await this.callApi("Respondé solamente con la palabra OK.",
      [{ role: "user", content: "Probando conexión" }], { maxTokens: 256 });
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const lines = [`${r.ok ? "Conexión OK" : "La conexión falló"} (${secs} s)`, this.keyDescription()];
    if (r.ok) {
      lines.push(`Modelo: ${this.lastModel} | auth: ${AUTH_LABELS[this.authMethod] || "-"}`);
      lines.push(`Respuesta: ${r.text.slice(0, 80)}`);
      if (this.attempts.length > 1) lines.push("", "Intentos:", ...this.attemptsSummaryLines());
    } else {
      lines.push(r.text); // ya incluye el resumen de intentos
    }
    return { report: lines.join("\n"), ok: r.ok };
  }

  attemptsSummaryLines() {
    const out = [];
    let prev = null, count = 0, last = null;
    const fmt = (a, n) =>
      `- ${a.model} [${AUTH_LABELS[a.auth] || a.auth}${a.search ? " + búsqueda" : ""}] -> ${a.code} ${a.msg}`.trim() +
      (n > 1 ? ` (x${n})` : "");
    for (const a of this.attempts) {
      const key = [a.model, a.auth, a.code, a.msg, a.search].join("|");
      if (key === prev) { count++; continue; }
      if (prev !== null) out.push(fmt(last, count));
      prev = key; last = a; count = 1;
    }
    if (prev !== null) out.push(fmt(last, count));
    return out;
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
    if (this.preferredModel) order.push(this.preferredModel);
    for (const m of MODELS) if (!order.includes(m)) order.push(m);
    return order;
  }

  authOrder() {
    const order = this.apiKey.startsWith("AIza") ? ["header", "query"] : ["header", "query", "bearer"];
    if (order.includes(this.authMethod)) {
      order.splice(order.indexOf(this.authMethod), 1);
      order.unshift(this.authMethod);
    }
    return order;
  }

  buildRequest(system, messages, model, { auth = "header", thinking = true, search = false,
                                          maxTokens = MAX_OUTPUT_TOKENS, stream = false, json = false } = {}) {
    const generationConfig = { maxOutputTokens: maxTokens, temperature: json ? 0.2 : 0.7 };
    if (thinking) generationConfig.thinkingConfig = { thinkingLevel: THINKING_LEVEL };
    if (json) generationConfig.responseMimeType = "application/json";
    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents: GeminiClient.toContents(messages),
      generationConfig,
    };
    if (search) body.tools = [{ google_search: {} }];
    const params = [];
    if (stream) params.push("alt=sse");
    if (auth === "query") params.push("key=" + encodeURIComponent(this.apiKey));
    const method = stream ? "streamGenerateContent" : "generateContent";
    const url = `${GEMINI_BASE_URL}/${model}:${method}` + (params.length ? "?" + params.join("&") : "");
    const headers = { "Content-Type": "application/json" };
    if (auth === "bearer") headers["Authorization"] = "Bearer " + this.apiKey;
    else if (auth !== "query") headers["x-goog-api-key"] = this.apiKey;
    return { url, init: { method: "POST", headers, body: JSON.stringify(body) } };
  }

  shortError(bodyText) {
    let msg = "";
    try {
      const err = JSON.parse(bodyText).error || {};
      msg = (err.status ? `${err.status}: ` : "") + (err.message || "");
    } catch { msg = bodyText || ""; }
    msg = msg.replace(/\s+/g, " ").trim();
    if (this.apiKey) msg = msg.split(this.apiKey).join("***");
    return msg.slice(0, 150);
  }

  static parseResponse(data) {
    const cands = data.candidates || [];
    if (!cands.length) {
      const reason = (data.promptFeedback || {}).blockReason;
      if (reason) return { text: `Gemini bloqueó la consulta por seguridad (${reason}). Intente reformularla.`, ok: false, sources: [] };
      return { text: "Gemini no devolvió ninguna respuesta. Intente de nuevo.", ok: false, sources: [] };
    }
    const c = cands[0];
    const parts = (c.content || {}).parts || [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
    const sources = [];
    const chunks = ((c.groundingMetadata || {}).groundingChunks) || [];
    for (const ch of chunks) {
      if (ch.web && ch.web.uri && !sources.some((s) => s.uri === ch.web.uri)) {
        sources.push({ uri: ch.web.uri, title: ch.web.title || ch.web.uri });
      }
    }
    if (text) return { text, ok: true, sources: sources.slice(0, 5) };
    if (c.finishReason === "SAFETY") return { text: "Gemini bloqueó la respuesta por seguridad. Intente reformular la pregunta.", ok: false, sources: [] };
    if (c.finishReason === "MAX_TOKENS") return { text: "La respuesta de Gemini quedó vacía por límite de longitud. Intente con una pregunta más corta.", ok: false, sources: [] };
    return { text: "(respuesta vacía de Gemini)", ok: false, sources: [] };
  }

  static isAuthError(code, short) {
    const low = short.toLowerCase();
    if (code === 401 || code === 403) return !/search|grounding|tool/.test(low);
    return code === 400 && /api key|api_key|unauthenticated|credential/.test(low);
  }

  static isModelUnavailable(code, short) {
    if (code === 404) return true;
    const low = short.toLowerCase();
    return code === 400 && /not found|not supported for generatecontent|is not available|unknown model/.test(low);
  }

  static httpErrorMessage(code, short) {
    const low = (short || "").toLowerCase();
    if (code === 400 && low.includes("api key")) return "La API key de Gemini no es válida. Revísela en Configuración (el engranaje arriba a la derecha).";
    if (code === 401 || code === 403) return "Gemini rechazó la API key (sin permiso). Verifique que la key de Google AI Studio sea correcta y esté activa.";
    if (code === 429) return "Se alcanzó el límite gratuito de Gemini en todos los modelos (demasiadas consultas). Espere un momento e intente de nuevo.";
    if (code === 504) return "Gemini no respondió a tiempo (timeout/504), ni siquiera con los modelos livianos. Intente de nuevo en un rato.";
    if (code >= 500) return `Los servidores de Gemini están saturados o no disponibles ahora (error ${code}). Intente de nuevo en un rato.`;
    if (code === 404) return "Ningún modelo de Gemini está disponible para su API key ahora mismo.";
    return `Error de la API de Gemini (${code}): ${short || "sin detalle"}`;
  }

  withSummary(msg) {
    if (!this.attempts.length) return msg;
    return msg + "\n\nIntentos:\n" + this.attemptsSummaryLines().join("\n");
  }

  // Lee un stream SSE de Gemini. Devuelve {text, sources, finishReason, blockReason, error}.
  async readStream(resp, onChunk, resetIdle) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", text = "", finishReason = "", blockReason = "";
    const sources = [];
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
      for (const ch of ((c.groundingMetadata || {}).groundingChunks || [])) {
        if (ch.web && ch.web.uri && !sources.some((x) => x.uri === ch.web.uri)) {
          sources.push({ uri: ch.web.uri, title: ch.web.title || ch.web.uri });
        }
      }
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
    return { text: text.trim(), sources: sources.slice(0, 5), finishReason, blockReason };
  }

  async callApi(system, messages, { search = false, maxTokens = MAX_OUTPUT_TOKENS, stream = false, onChunk = null,
                                    models = null, json = false, budgetMs = TOTAL_BUDGET_MS, retries = true, timeoutMs = TIMEOUT_MS,
                                    thinking: thinkingOpt = true } = {}) {
    this.lastOk = false;
    this.attempts = [];
    const t0 = performance.now();
    const hasMedia = messages.some((m) => m.media && m.media.length);
    const done = (r, model) => ({ ...r, model, ms: Math.round(performance.now() - t0) });
    const fail = (text) => done({ text, ok: false, sources: [] }, "");
    if (!this.isConfigured()) return fail(MISSING_KEY_MSG);
    if (!GeminiClient.toContents(messages).length) return fail("No hay mensaje para enviar.");

    const deadline = t0 + budgetMs;
    const queue = models ? [...models] : this.modelOrder();
    const authOrder = this.authOrder();
    const internal = !!models; // llamadas internas no cambian el modelo preferido
    let lastCode = null, lastShort = "";

    const record = (model, auth, code, msg, usedSearch) => {
      this.attempts.push({ model, auth, code, msg, search: usedSearch });
      console.log(`Antares LLM: ${model} [${auth}${usedSearch ? "+search" : ""}] -> ${code} ${msg}`);
    };
    const promoteLite = () => {
      const i = queue.findIndex((m) => m.includes("lite"));
      if (i > 0) queue.unshift(queue.splice(i, 1)[0]);
    };
    const remember = (model, auth) => {
      this.lastModel = model;
      if (internal) return;
      const changed = model !== this.preferredModel || auth !== this.authMethod;
      this.preferredModel = model;
      this.authMethod = auth;
      if (changed && this.onModelOk) {
        try { this.onModelOk({ model, authMethod: auth, noGrounding: this.noGrounding }); } catch { /* */ }
      }
    };

    while (queue.length) {
      if (performance.now() > deadline) { record("(resto)", "-", "-", "se agotó el tiempo total", false); break; }
      const model = queue.shift();
      let authI = 0, retried = false, thinking = thinkingOpt;
      let useSearch = search && !this.noGrounding[model];
      for (;;) {
        const remaining = deadline - performance.now();
        if (remaining < 3000) break;
        const auth = authOrder[authI];
        const { url, init } = this.buildRequest(system, messages, model,
          { auth, thinking, search: useSearch, maxTokens, stream, json });
        const ctrl = new AbortController();
        const tmo = Math.min(timeoutMs, remaining);
        let timer = setTimeout(() => ctrl.abort(), tmo);
        let resp;
        try {
          resp = await fetch(url, { ...init, signal: ctrl.signal });
        } catch (e) {
          clearTimeout(timer);
          if (e.name === "AbortError") {
            record(model, auth, "timeout", `sin respuesta en ${Math.round(tmo / 1000)} s`, useSearch);
            lastCode = 504; promoteLite(); break;
          }
          record(model, auth, "red", String(e.message || e).slice(0, 150), useSearch);
          return fail(this.withSummary(
            "No pude conectarme a Gemini. Revise su conexión a internet" +
            (navigator.onLine === false ? " (está sin conexión)." : ".")));
        }

        if (resp.ok && stream && resp.body) {
          // Respuesta en streaming: los errores después del primer texto ya no cambian de modelo
          let partial = "";
          try {
            const st = await this.readStream(resp, (t) => { partial = t; onChunk && onChunk(t); }, () => {
              clearTimeout(timer);
              timer = setTimeout(() => ctrl.abort(), STREAM_IDLE_MS);
            });
            clearTimeout(timer);
            if (st.text) {
              record(model, auth, 200, "OK (stream)", useSearch);
              this.lastOk = true;
              remember(model, auth);
              return done({ text: st.text, ok: true, sources: st.sources }, model);
            }
            const msg = st.blockReason || st.finishReason === "SAFETY"
              ? "Gemini bloqueó la respuesta por seguridad. Intente reformular la pregunta."
              : "Gemini no devolvió ninguna respuesta. Intente de nuevo.";
            record(model, auth, 200, `vacío ${st.finishReason || st.blockReason || ""}`.trim(), useSearch);
            if (st.blockReason || st.finishReason === "SAFETY") return fail(msg);
            break; // respuesta vacía: probar otro modelo
          } catch (e) {
            clearTimeout(timer);
            if (partial) {
              record(model, auth, 200, "stream cortado", useSearch);
              this.lastOk = true;
              remember(model, auth);
              return done({ text: partial + "\n\n(La respuesta se cortó por un problema de conexión.)", ok: true, sources: [] }, model);
            }
            record(model, auth, e.name === "AbortError" ? "timeout" : "stream", String(e.message || e).slice(0, 150), useSearch);
            lastCode = 504; promoteLite(); break;
          }
        }

        let bodyText = "";
        try { bodyText = await resp.text(); } catch { bodyText = ""; }
        clearTimeout(timer);

        if (resp.ok) {
          let data = {};
          try { data = JSON.parse(bodyText); } catch { /* vacío */ }
          const r = GeminiClient.parseResponse(data);
          record(model, auth, 200, r.ok ? "OK" : r.text.slice(0, 150), useSearch);
          this.lastOk = r.ok;
          if (r.ok) remember(model, auth);
          return done(r, model);
        }

        const code = resp.status;
        const short = this.shortError(bodyText);
        record(model, auth, code, short, useSearch);
        lastCode = code; lastShort = short;

        if (code === 400 && thinking && /thinking/i.test(short)) { thinking = false; continue; }
        if (GeminiClient.isAuthError(code, short)) {
          if (authI + 1 < authOrder.length) { authI++; continue; }
          return fail(this.withSummary(GeminiClient.httpErrorMessage(code, short)));
        }
        // La búsqueda de Google no está en todos los planes/modelos: reintentar sin ella
        if (useSearch && code >= 400 && code < 500 && code !== 404) {
          useSearch = false;
          this.noGrounding[model] = true;
          if (this.onModelOk && !internal) { try { this.onModelOk({ noGrounding: this.noGrounding }); } catch { /* */ } }
          continue;
        }
        if (GeminiClient.isModelUnavailable(code, short)) break;
        // con fotos/videos, un 400 puede ser un formato que este modelo no acepta: probar otro
        if (hasMedia && code === 400) break;
        if (code === 504) { promoteLite(); break; }
        if (RETRYABLE.includes(code) && !retried && retries) { retried = true; await sleep(RETRY_DELAY_MS); continue; }
        if (RETRYABLE.includes(code)) break;
        return fail(this.withSummary(GeminiClient.httpErrorMessage(code, short)));
      }
    }
    if (lastCode !== null) return fail(this.withSummary(GeminiClient.httpErrorMessage(lastCode, lastShort)));
    return fail(this.withSummary("Ningún modelo de Gemini respondió a tiempo."));
  }
}
