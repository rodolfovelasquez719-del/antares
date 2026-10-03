// Antares Web - Cliente de la API de Google Gemini (REST, directo desde el navegador).
// La key se envía solo a generativelanguage.googleapis.com y nunca sale de este dispositivo.

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Modelos con plan gratuito, en orden de preferencia (IDs verificados en
// ai.google.dev/gemini-api/docs/models, 2026-10). El último que funcionó se prueba primero.
export const MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

const RETRYABLE = [429, 500, 502, 503, 504];
const RETRY_DELAY_MS = 1500;
const TIMEOUT_MS = 45000;
const TOTAL_BUDGET_MS = 60000;
const MAX_OUTPUT_TOKENS = 2048;
const THINKING_LEVEL = "low";

export const AUTH_LABELS = { header: "header x-goog-api-key", query: "?key=", bearer: "Bearer" };
export const DEFAULT_ASSISTANT_NAME = "Antares";

const SYSTEM_PROMPT_TEMPLATE = (name) =>
  `Sos ${name}, un asistente virtual personal. Hablás en español de Costa Rica ` +
  `y tratás al usuario de "vos" (vos podés, mirá, tenés, contame). Tu tono es ` +
  `cálido, cercano y relajado, como un amigo que sabe mucho del tema: claro, ` +
  `honesto y con buena onda, sin sonar formal ni robótico. Podés usar alguna ` +
  `expresión tica con naturalidad (pura vida, mae, diay, tuanis), sin exagerar.\n` +
  `Por defecto respondé corto y al grano (2 a 4 oraciones). Extendete solo si ` +
  `el usuario te pide detalle o el tema realmente lo necesita. Si no sabés algo, ` +
  `decilo con franqueza.\n` +
  `Escribí en texto plano: sin Markdown (nada de asteriscos, numerales ni ` +
  `tablas) y sin emojis, porque la app muestra texto simple y lo lee en voz alta.\n` +
  `Tenés acceso a datos que el usuario te pidió recordar; usalos solo cuando ` +
  `sean relevantes para la conversación.`;

export function buildSystemPrompt(assistantName = "", userName = "", personality = "") {
  const name = (assistantName || "").trim() || DEFAULT_ASSISTANT_NAME;
  let p = SYSTEM_PROMPT_TEMPLATE(name);
  userName = (userName || "").trim();
  personality = (personality || "").trim();
  if (userName) {
    p += `\n\nEl usuario se llama ${userName}. Llamalo así de vez en cuando, con naturalidad (no en cada mensaje).`;
  }
  if (personality) {
    p += "\n\nPersonalidad y estilo que el usuario definió para vos " +
      "(seguilo siempre que no contradiga lo anterior sobre formato):\n" + personality;
  }
  return p;
}

export const MISSING_KEY_MSG =
  "No tengo configurada la API key de Gemini todavía. Conseguila gratis en " +
  "Google AI Studio (aistudio.google.com/apikey) y agregala en Configuración " +
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
  async ask(userMessage, history, knownFacts, { search = false } = {}) {
    if (!this.isConfigured()) { this.lastOk = false; return { text: MISSING_KEY_MSG, ok: false, sources: [] }; }
    let system = this.systemPrompt;
    if (knownFacts && knownFacts.length) {
      system += "\n\nDatos que el usuario te pidió recordar:\n" + knownFacts.map((f) => `- ${f}`).join("\n");
    }
    if (search) {
      system += "\n\nSi usás resultados de búsqueda, resumilos con tus palabras en texto plano.";
    }
    const messages = [...history, { role: "user", content: userMessage }];
    return this.callApi(system, messages, { search });
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
      if (!text) continue;
      const role = (m.role === "assistant" || m.role === "model") ? "model" : "user";
      if (contents.length && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += "\n\n" + text;
      } else {
        contents.push({ role, parts: [{ text }] });
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
                                          maxTokens = MAX_OUTPUT_TOKENS } = {}) {
    const generationConfig = { maxOutputTokens: maxTokens, temperature: 0.7 };
    if (thinking) generationConfig.thinkingConfig = { thinkingLevel: THINKING_LEVEL };
    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents: GeminiClient.toContents(messages),
      generationConfig,
    };
    if (search) body.tools = [{ google_search: {} }];
    let url = `${GEMINI_BASE_URL}/${model}:generateContent`;
    const headers = { "Content-Type": "application/json" };
    if (auth === "query") url += "?key=" + encodeURIComponent(this.apiKey);
    else if (auth === "bearer") headers["Authorization"] = "Bearer " + this.apiKey;
    else headers["x-goog-api-key"] = this.apiKey;
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
      if (reason) return { text: `Gemini bloqueó la consulta por seguridad (${reason}). Probá reformularla.`, ok: false, sources: [] };
      return { text: "Gemini no devolvió ninguna respuesta. Probá de nuevo.", ok: false, sources: [] };
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
    if (c.finishReason === "SAFETY") return { text: "Gemini bloqueó la respuesta por seguridad. Probá reformular la pregunta.", ok: false, sources: [] };
    if (c.finishReason === "MAX_TOKENS") return { text: "La respuesta de Gemini quedó vacía por límite de longitud. Probá con una pregunta más corta.", ok: false, sources: [] };
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
    if (code === 400 && low.includes("api key")) return "La API key de Gemini no es válida. Revisala en Configuración (el engranaje arriba a la derecha).";
    if (code === 401 || code === 403) return "Gemini rechazó la API key (sin permiso). Verificá que la key de Google AI Studio sea correcta y esté activa.";
    if (code === 429) return "Se alcanzó el límite gratuito de Gemini en todos los modelos (demasiadas consultas). Esperá un momento y probá de nuevo.";
    if (code === 504) return "Gemini no respondió a tiempo (timeout/504), ni siquiera con los modelos livianos. Probá de nuevo en un rato.";
    if (code >= 500) return `Los servidores de Gemini están saturados o no disponibles ahora (error ${code}). Probá de nuevo en un rato.`;
    if (code === 404) return "Ningún modelo de Gemini está disponible para tu API key ahora mismo.";
    return `Error de la API de Gemini (${code}): ${short || "sin detalle"}`;
  }

  withSummary(msg) {
    if (!this.attempts.length) return msg;
    return msg + "\n\nIntentos:\n" + this.attemptsSummaryLines().join("\n");
  }

  async callApi(system, messages, { search = false, maxTokens = MAX_OUTPUT_TOKENS } = {}) {
    this.lastOk = false;
    this.attempts = [];
    const fail = (text) => ({ text, ok: false, sources: [] });
    if (!this.isConfigured()) return fail(MISSING_KEY_MSG);
    if (!GeminiClient.toContents(messages).length) return fail("No hay mensaje para enviar.");

    const deadline = performance.now() + TOTAL_BUDGET_MS;
    const queue = this.modelOrder();
    const authOrder = this.authOrder();
    let lastCode = null, lastShort = "";

    const record = (model, auth, code, msg, usedSearch) => {
      this.attempts.push({ model, auth, code, msg, search: usedSearch });
      console.log(`Antares LLM: ${model} [${auth}${usedSearch ? "+search" : ""}] -> ${code} ${msg}`);
    };
    const promoteLite = () => {
      const i = queue.findIndex((m) => m.includes("lite"));
      if (i > 0) queue.unshift(queue.splice(i, 1)[0]);
    };

    while (queue.length) {
      if (performance.now() > deadline) { record("(resto)", "-", "-", "se agotó el tiempo total", false); break; }
      const model = queue.shift();
      let authI = 0, retried = false, thinking = true;
      let useSearch = search && !this.noGrounding[model];
      for (;;) {
        const remaining = deadline - performance.now();
        if (remaining < 3000) break;
        const auth = authOrder[authI];
        const { url, init } = this.buildRequest(system, messages, model, { auth, thinking, search: useSearch, maxTokens });
        const ctrl = new AbortController();
        const tmo = Math.min(TIMEOUT_MS, remaining);
        const timer = setTimeout(() => ctrl.abort(), tmo);
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
            "No pude conectarme a Gemini. Revisá tu conexión a internet" +
            (navigator.onLine === false ? " (estás sin conexión)." : ".")));
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
          if (r.ok) {
            this.lastModel = model;
            const changed = model !== this.preferredModel || auth !== this.authMethod;
            this.preferredModel = model;
            this.authMethod = auth;
            if (changed && this.onModelOk) {
              try { this.onModelOk({ model, authMethod: auth, noGrounding: this.noGrounding }); } catch { /* */ }
            }
          }
          return r;
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
          if (this.onModelOk) { try { this.onModelOk({ noGrounding: this.noGrounding }); } catch { /* */ } }
          continue;
        }
        if (GeminiClient.isModelUnavailable(code, short)) break;
        if (code === 504) { promoteLite(); break; }
        if (RETRYABLE.includes(code) && !retried) { retried = true; await sleep(RETRY_DELAY_MS); continue; }
        if (RETRYABLE.includes(code)) break;
        return fail(this.withSummary(GeminiClient.httpErrorMessage(code, short)));
      }
    }
    if (lastCode !== null) return fail(this.withSummary(GeminiClient.httpErrorMessage(lastCode, lastShort)));
    return fail(this.withSummary("Ningún modelo de Gemini respondió a tiempo."));
  }
}
