// Antares Web - lógica de la interfaz (estilo "Jarvis").
import { GeminiClient, DEFAULT_ASSISTANT_NAME, needsSearch } from "./gemini.js";
import { memory, thumbs, requestPersistence, LS_LIMIT, flushWrites, isVaultMode, isUnlocked } from "./memory.js";
import * as Lock from "./lock.js";
import { showLock, runPinFlow, isShowing as lockShowing } from "./lockui.js";
import { looksLikeImportantFact, buildConfirmationQuestion } from "./facts.js";
import { Voice } from "./voice.js";
import { prepareFile, toGeminiMedia, formatBytes, MAX_ATTACHMENTS } from "./media.js";
import { fetchWeather } from "./weather.js";
import * as Reminders from "./reminders.js";
import * as Shopping from "./shopping.js";
import * as Digest from "./digest.js";
import * as Notify from "./notify.js";
import { initPanels, openPanel, render as renderPanel } from "./panels.js";

const APP_VERSION = "1.6.0";
const DEFAULT_MEDIA_PROMPT = "Describa lo que ve.";
const DEFAULT_PDF_PROMPT = "Resuma este documento: puntos clave, fechas, montos y lo que usted deba hacer.";
const $ = (id) => document.getElementById(id);
const body = document.body;

const els = {
  app: $("app"), chatView: $("chat-view"), settingsView: $("settings-view"),
  title: $("assistant-title"), status: $("status-line"), toggleChat: $("toggle-chat"), openSettings: $("open-settings"),
  hud: $("hud"), hora: $("hora"), fecha: $("fecha"), weatherCell: $("weather-cell"), weatherTemp: $("weather-temp"), weatherDesc: $("weather-desc"),
  connCell: $("conn-cell"), conn: $("conn"), connSub: $("conn-sub"),
  stateLabel: $("state-label"), wave: $("wave"), sideHint: $("side-hint"), saludo: $("saludo"), openChat: $("open-chat"),
  interimText: $("interim-text"), saludoSinkey: $("saludo-sinkey"), setupOpen: $("setup-open"),
  messages: $("messages"), announcer: $("announcer"),
  attachments: $("attachments"), stop: $("stop-btn"), micZone: $("mic-zone"), mic: $("mic-btn"), micHint: $("mic-hint"),
  form: $("composer"), input: $("msg-input"), send: $("send-btn"),
  attachBtn: $("attach-btn"), attachMenu: $("attach-menu"),
  pickPhoto: $("pick-photo"), pickVideo: $("pick-video"), pickGallery: $("pick-gallery"), pickPdf: $("pick-pdf"),
  openPanel: $("open-panel"), closePanel: $("close-panel"), panelView: $("panel-view"), panelRoot: $("panel-root"), panelTitle: $("panel-title"), quickbar: $("quickbar"),
  exportTxt: $("export-txt"), exportJson: $("export-json"),
  // configuración
  closeSettings: $("close-settings"), settingsTitle: $("settings-title"), settingsScroll: $("settings-scroll"),
  apiKey: $("api-key"), toggleKey: $("toggle-key"), pasteKey: $("paste-key"), testConn: $("test-conn"),
  connStatus: $("conn-status"), connStatusText: $("conn-status-text"), connDetails: $("conn-details"),
  assistantName: $("assistant-name"), userName: $("user-name"), personality: $("personality"),
  speakReplies: $("speak-replies"), speechLang: $("speech-lang"), voiceUnsupported: $("voice-unsupported"),
  webSearch: $("web-search"), autoLearn: $("auto-learn"), factsList: $("facts-list"), factsCount: $("facts-count"),
  storageMeter: $("storage-meter"), storageText: $("storage-text"), storageBar: $("storage-bar"), storageFill: $("storage-fill"),
  clearHistory: $("clear-history"), clearFacts: $("clear-facts"), version: $("app-version"),
  unsaved: $("unsaved"), settingsStatus: $("settings-status"), save: $("save-settings"),
  modal: $("modal"), modalTitle: $("modal-title"), modalBody: $("modal-body"), modalCopy: $("modal-copy"), modalClose: $("modal-close"),
  toast: $("update-toast"), updateBtn: $("update-btn"), updateDismiss: $("update-dismiss"),
  // seguridad
  secStatus: $("sec-status"), secStatusText: $("sec-status-text"), secOffRow: $("sec-off-row"), secOn: $("sec-on"),
  pinCreate: $("pin-create"), pinChange: $("pin-change"), lockNow: $("lock-now"), pinRemove: $("pin-remove"),
  passkeySwitch: $("passkey-switch"), passkeyNote: $("passkey-note"), lockOnHide: $("lock-on-hide"), idleLock: $("idle-lock"),
};

let config = memory.getConfig();
let client = null;
const voice = new Voice();
let estado = "reposo";
let vista = "inicio";           // "inicio" (reactor grande) o "chat" (conversación visible)
let busy = false;               // hay una respuesta en curso: no se puede enviar otra
let abortCtrl = null;
let attachments = [];
let pendingConfirm = null;
let rateUntil = 0;              // fin de la pausa por límite de consultas
let lastModelShort = "";
let lockEpoch = 0;              // cambia al bloquear: lo que termine después se descarta

// ---------- Cliente Gemini ----------
function makeClient(apiKey = config.geminiApiKey) {
  return new GeminiClient({
    apiKey,
    assistantName: config.assistantName,
    userName: config.userName,
    personality: config.personality,
    preferredModel: config.geminiModel,
    noGrounding: config.noGrounding,
    onModelOk: ({ model, noGrounding }) => {
      if (model) config.geminiModel = model;
      if (noGrounding) config.noGrounding = { ...noGrounding };
      memory.saveConfig(config);
    },
  });
}
const assistantName = () => (config.assistantName || "").trim() || DEFAULT_ASSISTANT_NAME;
const shortModel = (m) => (m || "").replace(/^gemini-/, "");
const baseEstado = () => (client && client.isConfigured() ? "reposo" : "sinkey");

// ---------- Estados de la interfaz ----------
const STATE_TEXT = { reposo: "EN ESPERA", escuchando: "ESCUCHANDO…", hablando: "RESPONDIENDO…", error: "EN PAUSA", sinkey: "SIN CONFIGURAR" };

function setEstado(e) {
  estado = e;
  body.dataset.estado = e;
  els.stateLabel.textContent = STATE_TEXT[e] || "";
  els.stateLabel.classList.toggle("warn", e === "error" || e === "sinkey");
  if (e !== "error") { els.sideHint.hidden = true; els.sideHint.textContent = ""; }
  updateMic();
  updateComposer();
  updateConn();
  updateLayout();
}

function setVista(v) {
  vista = v;
  updateLayout();
}

function hasMessages() { return !!els.messages.querySelector(".msg, .error-card"); }

function updateLayout() {
  const compact = estado === "hablando" || estado === "error" || (estado === "reposo" && vista === "chat");
  body.classList.toggle("compact", compact);
  const showingChat = compact;
  els.toggleChat.setAttribute("aria-pressed", String(showingChat));
  els.toggleChat.setAttribute("aria-label", showingChat ? "Ocultar la conversación" : "Ver conversación");
  els.toggleChat.hidden = estado === "sinkey" && !hasMessages();
  els.openChat.hidden = !(estado === "reposo" && vista === "inicio" && hasMessages());
  if (showingChat) scrollToBottom(false);
}

function updateMic() {
  const hints = { reposo: "Toque para hablar", escuchando: "Toque para terminar", sinkey: "Disponible al configurar su key", error: "Toque para hablar", hablando: "" };
  els.micHint.textContent = voice.canListen ? hints[estado] : (estado === "sinkey" ? hints.sinkey : "Use el micrófono del teclado");
  els.mic.disabled = estado === "sinkey" || estado === "hablando";
  els.mic.setAttribute("aria-label", estado === "escuchando" ? "Terminar de hablar" : "Hablar");
}

function updateComposer() {
  const noKey = estado === "sinkey";
  els.input.disabled = noKey;
  els.input.placeholder = noKey ? "Primero configure su API key" : `Escríbale a ${assistantName()}…`;
  els.send.disabled = noKey || busy;
  els.attachBtn.disabled = noKey;
  els.send.setAttribute("aria-label", busy ? "Enviar (espere a que termine la respuesta)" : "Enviar");
}

function updateConn() {
  let main = "En línea", sub = lastModelShort || shortModel(config.geminiModel) || "Gemini", cls = "";
  const wait = Math.ceil((rateUntil - Date.now()) / 1000);
  if (!navigator.onLine) { main = "Sin conexión"; sub = "Revise su internet"; cls = "off"; }
  else if (!client || !client.isConfigured()) { main = "Sin key"; sub = "Por configurar"; cls = "warn"; }
  else if (wait > 0) { main = "Límite"; sub = `Vuelve en ${wait} s`; cls = "warn"; }
  else if (estado === "escuchando") sub = "Escuchando";
  else if (estado === "hablando") sub = "Respondiendo…";
  els.conn.textContent = main;
  els.connSub.textContent = sub;
  els.connCell.classList.toggle("warn", cls === "warn");
  els.connCell.classList.toggle("off", cls === "off");
}

// ---------- Reloj, saludo y clima ----------
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function saludoHora(h) { return h >= 5 && h < 12 ? "Buenos días" : h >= 12 && h < 19 ? "Buenas tardes" : "Buenas noches"; }

function renderGreeting() {
  const d = new Date();
  const s = saludoHora(d.getHours());
  const name = (config.userName || "").trim();
  els.saludo.replaceChildren();
  if (name) {
    const strong = document.createElement("strong");
    strong.textContent = name;
    els.saludo.append(`${s}, `, strong, ".", document.createElement("br"), "¿En qué le puedo ayudar?");
  } else {
    els.saludo.append(`${s}.`, document.createElement("br"), "¿En qué le puedo ayudar?");
  }
  const st = document.createElement("strong");
  st.textContent = assistantName();
  els.saludoSinkey.replaceChildren(`${s}. Soy `, st, ",", document.createElement("br"), "su asistente personal.");
}

function tick() {
  const d = new Date();
  els.hora.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  els.hora.dateTime = d.toISOString();
  els.fecha.textContent = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  renderGreeting();
  updateConn();
}

let weatherAt = 0;
async function refreshWeather() {
  const w = navigator.onLine ? await fetchWeather() : null;
  if (w) {
    weatherAt = Date.now();
    els.weatherTemp.textContent = `${w.temp}°C`;
    els.weatherDesc.textContent = w.desc || "Clima actual";
    els.weatherCell.hidden = false;
    els.weatherCell.setAttribute("aria-label", `Alajuela: ${w.temp} grados, ${w.desc}`);
  } else if (Date.now() - weatherAt > 60 * 60 * 1000) {
    els.weatherCell.hidden = true; // nunca se muestran datos inventados ni viejos
  }
  els.hud.classList.toggle("no-weather", els.weatherCell.hidden);
}

// ---------- Teclado móvil: la app ocupa solo el área visible ----------
function syncViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  const near = isNearBottom();
  document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
  els.app.style.top = `${Math.round(top)}px`;
  body.classList.toggle("kb-open", window.innerHeight - h > 120);
  if (near) scrollToBottom(false);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
}
window.addEventListener("resize", syncViewport);
window.addEventListener("scroll", () => { if (window.scrollY) window.scrollTo(0, 0); });

// ---------- Render del chat ----------
function isNearBottom() {
  const m = els.messages;
  return m.scrollHeight - m.scrollTop - m.clientHeight < 140;
}
function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: smooth ? "smooth" : "auto" }));
}
function announce(text) {
  els.announcer.textContent = "";
  setTimeout(() => { els.announcer.textContent = text; }, 60);
}

function appendLinkified(parent, text) {
  const re = /(https:\/\/[^\s<>()]+[^\s<>().,;:!?¿¡"'])/g; // solo enlaces https
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const a = document.createElement("a");
    a.href = m[0]; a.textContent = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer";
    parent.appendChild(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function safeHttps(uri) {
  try { const u = new URL(uri); return u.protocol === "https:" ? u.href : ""; } catch { return ""; }
}

function renderMedia(b, media) {
  const grid = document.createElement("div");
  grid.className = "bubble-media" + (media.length === 1 ? " single" : "");
  for (const m of media) {
    const item = document.createElement("div");
    item.className = "media-item";
    const label = m.kind === "video" ? "Video adjunto" : m.kind === "pdf" ? "Documento PDF" : "Foto adjunta";
    if (m.kind === "pdf") {
      const chip = document.createElement("span");
      chip.className = "pdf-chip";
      chip.textContent = m.name || "Documento PDF";
      item.appendChild(chip);
    } else if (m.kind === "video" && m.url) {
      const v = document.createElement("video");
      v.src = m.url; v.controls = true; v.playsInline = true; v.preload = "metadata"; v.muted = true;
      v.setAttribute("aria-label", label);
      if (m.thumb) v.poster = m.thumb;
      item.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.alt = label;
      const src = m.url || m.thumb;
      if (src) item.appendChild(img), (img.src = src);
      else if (m.thumbId) {
        thumbs.get(m.thumbId).then((t) => { if (t) { img.src = t; item.prepend(img); ph.remove(); } });
      }
      const ph = document.createElement("div");
      ph.className = "ph"; ph.textContent = m.kind === "video" ? "[video]" : "[foto]";
      if (!src) item.appendChild(ph);
    }
    if (m.kind === "video" && !m.url) {
      const bd = document.createElement("span"); bd.className = "badge"; bd.textContent = "VIDEO"; item.appendChild(bd);
    } else if (m.kind !== "video" && m.kind !== "pdf") {
      const bd = document.createElement("span"); bd.className = "badge"; bd.textContent = "FOTO"; item.appendChild(bd);
    }
    grid.appendChild(item);
  }
  b.appendChild(grid);
}

function renderUser(text, media = null) {
  const wrap = document.createElement("div");
  wrap.className = "msg user";
  const b = document.createElement("div");
  b.className = "bubble";
  if (media && media.length) {
    b.classList.add("has-media");
    renderMedia(b, media);
    if (!text) b.classList.add("media-only");
  }
  if (text) {
    const t = document.createElement("span");
    t.className = "t";
    appendLinkified(t, text);
    b.appendChild(t);
  }
  wrap.appendChild(b);
  els.messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function renderBot(text, { sources = [], meta = "" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  const b = document.createElement("div");
  b.className = "bubble";
  appendLinkified(b, text);
  wrap.appendChild(b);
  const links = (sources || []).map((s) => ({ ...s, uri: safeHttps(s.uri) })).filter((s) => s.uri);
  if (links.length) {
    const s = document.createElement("div");
    s.className = "sources";
    for (const src of links) {
      const a = document.createElement("a");
      a.href = src.uri; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = src.title || new URL(src.uri).hostname;
      s.appendChild(a);
    }
    wrap.appendChild(s);
  }
  if (meta) {
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = meta;
    wrap.appendChild(m);
  }
  els.messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function formatMeta(r, uploadMs = 0) {
  const secs = ((r.ms + uploadMs) / 1000).toFixed(1).replace(".", ",");
  const up = uploadMs >= 1000 ? ` (incl. ${(uploadMs / 1000).toFixed(1).replace(".", ",")} s de subida)` : "";
  return `${secs} s${up}${r.model ? " · " + shortModel(r.model) : ""}${r.stopped ? " · detenida" : ""}`;
}

const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17 19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3Zm0 6v5m0 3v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Nota pequeña dentro de la conversación (memoria, avisos de almacenamiento, etc.)
function showNote(text, { warn = false, bold = "", action = null } = {}) {
  const note = document.createElement("div");
  note.className = "memory-note" + (warn ? " warn" : "");
  note.setAttribute("role", "status");
  note.innerHTML = warn ? ICON_WARN : ICON_CHECK;
  const txt = document.createElement("span");
  txt.className = "txt";
  if (bold) { const b = document.createElement("b"); b.textContent = bold; txt.append(b, " "); }
  txt.append(text);
  note.appendChild(txt);
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "link-btn"; btn.textContent = action.label;
    btn.onclick = () => action.run(note, txt, btn);
    note.appendChild(btn);
  }
  const near = isNearBottom();
  els.messages.appendChild(note);
  if (near) scrollToBottom();
  return note;
}

let noticeTimer = null;
function chatNotice(text) {
  els.status.textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { els.status.textContent = "Asistente personal"; }, 4000);
}

// Tarjeta de error amigable: mensaje corto, Reintentar y "Ver detalles" con el texto técnico
function renderError(r, retry) {
  const card = document.createElement("div");
  card.className = "error-card";
  card.setAttribute("role", "alert");
  const h = document.createElement("h3");
  h.innerHTML = ICON_WARN;
  h.append(r.title || "Algo salió mal");
  const p = document.createElement("p");
  p.textContent = r.text;
  const row = document.createElement("div");
  row.className = "btn-row";
  const keyProblem = ["missing_key", "key_invalid", "key_expired", "key_restricted", "service_disabled", "permission"].includes(r.kind);
  if (keyProblem) {
    const cfg = document.createElement("button");
    cfg.type = "button"; cfg.className = "btn retry"; cfg.textContent = "Abrir Configuración";
    cfg.onclick = () => openSettings({ focusKey: true });
    row.appendChild(cfg);
  } else if (retry) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "btn retry";
    const until = r.retryAfter ? Date.now() + r.retryAfter * 1000 : 0;
    const paint = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (until && left > 0) { btn.textContent = `Reintentar · ${left} s`; btn.disabled = true; return true; }
      btn.textContent = "Reintentar"; btn.disabled = false; return false;
    };
    if (paint()) {
      const iv = setInterval(() => { if (!paint() || !card.isConnected) clearInterval(iv); }, 1000);
    }
    btn.onclick = () => { if (busy) return; card.remove(); retry(); };
    row.appendChild(btn);
  }
  if (r.details) {
    const det = document.createElement("button");
    det.type = "button"; det.className = "btn"; det.textContent = "Ver detalles";
    det.onclick = () => openModal("Detalles técnicos", r.details, det);
    row.appendChild(det);
  }
  card.append(h, p);
  if (row.children.length) card.appendChild(row);
  els.messages.appendChild(card);
  scrollToBottom();
  return card;
}

// Burbuja que se va llenando con el streaming (aria-live apagado: se anuncia al terminar)
function createStreamingBubble() {
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  const b = document.createElement("div");
  b.className = "bubble streaming";
  wrap.appendChild(b);
  els.messages.appendChild(wrap);
  return { wrap, bubble: b };
}

// ---------- Memoria automática ----------
async function autoLearn(userText, assistantText) {
  try {
    if (!config.autoLearn || !client.isConfigured()) return;
    const extractor = new GeminiClient({ apiKey: config.geminiApiKey });
    const facts = await extractor.extractFacts(userText, assistantText, memory.getFacts());
    if (!facts.length) return;
    const saved = [], failed = [];
    for (const fact of facts) {
      const r = memory.saveFact(fact, { auto: true });
      if (r.id) saved.push({ fact, id: r.id }); else failed.push(fact);
    }
    if (saved.length && !(await flushWrites()).ok) { failed.push(...saved.map((i) => i.fact)); saved.length = 0; }
    if (!isUnlocked()) return; // se bloqueó mientras tanto
    if (saved.length) {
      showNote(saved.map((i) => i.fact).join(" · "), {
        bold: "Guardé:",
        action: {
          label: "Deshacer",
          run: (note, txt, btn) => {
            for (const i of saved) memory.deleteFact(i.id);
            txt.textContent = "Listo, no lo guardé.";
            note.classList.add("undone");
            btn.remove();
            if (!els.settingsView.hidden) renderFactsList();
          },
        },
      });
    }
    if (failed.length) storageFullNote("No pude guardar lo que aprendí");
  } catch (e) {
    console.warn("Antares memoria:", e);
  }
}

function storageFullNote(prefix) {
  showNote(`${prefix}: el almacenamiento de este navegador está lleno. Borre la conversación o datos viejos en Configuración › Memoria.`, {
    warn: true, action: { label: "Abrir", run: () => openSettings({ scrollTo: "storage-meter" }) },
  });
}
function handleSave(r, what) {
  if (!r.ok) storageFullNote(`No pude guardar ${what}`);
  else if (r.pruned) showNote(`Liberé espacio borrando ${r.pruned} mensajes antiguos de la conversación.`, { warn: true });
}

function renderConfirm(factText) {
  const card = document.createElement("div");
  card.className = "confirm-card";
  const p = document.createElement("p");
  p.textContent = buildConfirmationQuestion(factText);
  const row = document.createElement("div");
  row.className = "btn-row";
  const yes = document.createElement("button");
  yes.type = "button"; yes.className = "btn primary"; yes.textContent = "Sí, guárdelo";
  const no = document.createElement("button");
  no.type = "button"; no.className = "btn"; no.textContent = "No";
  const done = async (accepted) => {
    card.remove();
    if (!pendingConfirm) return;
    const fact = pendingConfirm; pendingConfirm = null;
    if (!accepted) return;
    const r = memory.saveFact(fact);
    const ok = r.id && (await flushWrites()).ok;
    if (ok) showNote(fact, { bold: "Guardé:" }); else storageFullNote("No pude guardar el dato");
  };
  yes.onclick = () => done(true);
  no.onclick = () => done(false);
  row.append(yes, no);
  card.append(p, row);
  els.messages.appendChild(card);
  scrollToBottom();
}

// ---------- Envío ----------
function autosize() {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, 120) + "px";
}

// job: {text, items, prompt, history, facts}; en un reintento se reutiliza el mismo job (y los archivos ya subidos)
async function runJob(job) {
  if (busy) return;
  busy = true;
  const epoch = lockEpoch;
  abortCtrl = new AbortController();
  setVista("chat");
  setEstado("hablando");
  let stream = null, uploadMs = 0;
  try {
    let media = null;
    if (job.items.length && client.isConfigured()) {
      const tUp = performance.now();
      try {
        const res = await toGeminiMedia(config.geminiApiKey, job.items, {
          onProgress: (st) => { els.connSub.textContent = st === "subiendo" ? "Subiendo archivo…" : "Procesando archivo…"; },
        });
        media = res.media;
        uploadMs = res.uploaded ? Math.round(performance.now() - tUp) : 0;
      } catch (e) {
        if (epoch !== lockEpoch) return;
        console.warn("Antares media:", e);
        const what = job.items.length > 1 ? "los archivos" : (job.items[0].kind === "video" ? "el video" : job.items[0].kind === "pdf" ? "el PDF" : "la foto");
        renderError({ kind: "media", title: "No pude enviar el archivo", text: `No pude subir ${what}. Revise su conexión e intente de nuevo, o pruebe con un video más corto.`, details: String(e.message || e) }, () => runJob(job));
        setEstado("error");
        return;
      }
    }
    if (abortCtrl.signal.aborted) { showNote("Respuesta detenida."); setEstado(baseEstado()); return; }
    const search = !media && !!config.webSearch && needsSearch(job.prompt);
    const r = await client.ask(job.prompt, job.history, job.facts, {
      search, media, signal: abortCtrl.signal,
      onChunk: (partial) => {
        if (!stream) stream = createStreamingBubble();
        const near = isNearBottom();
        stream.bubble.textContent = partial;
        if (near) scrollToBottom(false);
      },
    });
    if (stream) stream.wrap.remove();
    if (epoch !== lockEpoch) return; // se bloqueó mientras respondía: no se muestra ni se guarda nada
    if (r.ok) {
      lastModelShort = shortModel(r.model);
      renderBot(r.text, { sources: r.sources, meta: formatMeta(r, uploadMs) });
      announce(`${assistantName()}: ${r.text}`);
      handleSave(memory.addMessage("assistant", r.text), "la respuesta");
      if (config.speakReplies && !r.stopped) voice.speak(r.text);
      if (job.text && looksLikeImportantFact(job.text)) {
        if (config.autoLearn) autoLearn(job.text, r.text); // en segundo plano, no bloquea
        else { pendingConfirm = job.text; renderConfirm(job.text); }
      }
      setEstado(baseEstado());
    } else if (r.stopped) {
      showNote("Respuesta detenida.");
      setEstado(baseEstado());
    } else {
      if (r.kind === "rate" && r.retryAfter) rateUntil = Date.now() + r.retryAfter * 1000;
      renderError(r, () => runJob(job));
      announce(`${r.title}. ${r.text}`);
      setEstado("error");
      if (r.kind === "rate" && r.retryAfter) startRateCountdown();
    }
  } catch (e) {
    console.error(e);
    if (stream) stream.wrap.remove();
    if (epoch !== lockEpoch) return;
    renderError({ kind: "unknown", title: "Algo salió mal", text: "Ocurrió un error inesperado en la app. Intente de nuevo.", details: `${e && e.name ? e.name + ": " : ""}${e && e.message ? e.message : e}` }, () => runJob(job));
    setEstado("error");
  } finally {
    busy = false;
    abortCtrl = null;
    updateComposer();
  }
}

let rateTimer = null;
function startRateCountdown() {
  clearInterval(rateTimer);
  const paint = () => {
    const left = Math.ceil((rateUntil - Date.now()) / 1000);
    updateConn();
    if (estado === "error") {
      els.sideHint.hidden = left <= 0;
      els.sideHint.textContent = left > 0 ? `Podrá seguir en ${left} s.` : "";
    }
    if (left <= 0) clearInterval(rateTimer);
  };
  paint();
  rateTimer = setInterval(paint, 1000);
}

// Intenciones locales (recordatorios, compras, resumen del día): no llaman a Gemini
let pendingReminder = null; // texto de un recordatorio al que le faltó la hora
function localIntent(text) {
  const t = text.trim();
  if (pendingReminder && Reminders.parseReminder("Recuérdeme " + pendingReminder + " " + t)
      && /\b(a\s+las?|mañana|hoy|el\s+\d|en\s+\d|lunes|martes|mi[eé]rcoles|jueves|viernes|s[áa]bado|domingo)\b/i.test(t)) return "reminder-followup";
  pendingReminder = null;
  if (Shopping.looksLikeShopping(t) && Shopping.parseShopping(t)) return "shopping";
  if (Reminders.looksLikeReminder(t)) {
    if (Reminders.parseReminder(t)) return "reminder";
    if (!/^\s*(?:por favor[,\s]+)?rec[uú][eé]rd[ea]me\s+que\b/i.test(t)) return "reminder-ask";
  }
  if (t.length <= 60 && Digest.looksLikeDigest(t) && !/\b(sobre|acerca|de\s+(?!hoy|costa))\b/i.test(t.replace(/tipo\s+de\s+cambio|resumen\s+del\s+d[ií]a|c[oó]mo\s+est[aá]\s+el\s+d[ií]a/gi, ""))) return "digest";
  return null;
}
async function handleLocal(kind, text) {
  const t = text.trim();
  if (kind === "reminder" || kind === "reminder-ask" || kind === "reminder-followup") {
    const full = kind === "reminder-followup" ? "Recuérdeme " + pendingReminder + " " + t : t;
    pendingReminder = null;
    const parsed = Reminders.parseReminder(full);
    setVista("chat");
    renderUser(t);
    handleSave(memory.addMessage("user", t), "el mensaje");
    if (!parsed) {
      pendingReminder = t.replace(/^\s*(?:por favor[,\s]+)?\S+\s*/, "");
      const reply = "¿Para cuándo lo dejo? Diga, por ejemplo, «a las 5», «mañana a las 8» o «el 10 de octubre».";
      renderBot(reply); handleSave(memory.addMessage("assistant", reply), "la respuesta");
    } else {
      const res = Reminders.addReminder(parsed);
      if (!res.ok) storageFullNote("No pude guardar el recordatorio");
      const when = `${Reminders.formatWhen(res.reminder ? res.reminder.at : parsed.at)}${parsed.kind === "yearly" ? ", todos los años" : ""}`;
      const reply = res.duplicate ? `Ya tenía ese recordatorio: «${res.reminder.title}» ${when}.` : `Listo. Le recuerdo «${parsed.title}» ${when}.`;
      renderBot(reply); handleSave(memory.addMessage("assistant", reply), "la respuesta");
      await syncReminders();
    }
    return true;
  }
  if (kind === "shopping") {
    const p = Shopping.parseShopping(t);
    setVista("chat");
    renderUser(t);
    handleSave(memory.addMessage("user", t), "el mensaje");
    let reply = "No entendí qué hacer con la lista. Pruebe «Agregue pañales a la lista» o «¿Qué falta?».";
    if (p) {
      if (p.action === "list") {
        const g = Shopping.grouped();
        const nOpen = g.open.length;
        reply = nOpen ? `Le faltan ${nOpen} ${nOpen === 1 ? "artículo" : "artículos"}: ` +
          Shopping.STORES.filter((st) => (g.byStore[st] || []).length)
            .map((st) => `${st}: ${(g.byStore[st] || []).map((i) => i.name + (i.qty && i.qty !== "1" ? ` (${i.qty})` : "")).join(", ")}`).join(". ") + "."
          : "La lista de compras está vacía.";
      } else if (p.action === "clear") {
        Shopping.clearBought(); reply = "Quité de la lista lo que ya estaba comprado.";
      } else if (p.action === "bought") {
        const n = Shopping.markByName(p.name, true);
        reply = n ? `Marqué «${p.name}» como comprado.` : `No encontré «${p.name}» en la lista.`;
      } else if (p.action === "add") {
        const res = Shopping.addItem(p);
        if (!res.ok) storageFullNote("No pude guardar el artículo");
        reply = `Agregué ${p.qty && p.qty !== "1" ? p.qty + " " : ""}«${p.name}» a la lista${p.store && p.store !== "Otro" ? " (" + p.store + ")" : ""}.`;
      }
    }
    renderBot(reply); handleSave(memory.addMessage("assistant", reply), "la respuesta");
    if (!els.panelView.hidden && document.querySelector(".panel-tab.on")?.dataset.tab === "compras") renderPanel();
    return true;
  }
  if (kind === "digest") {
    setVista("chat");
    renderUser(t);
    handleSave(memory.addMessage("user", t), "el mensaje");
    const note = showNote("Reuniendo el resumen del día…");
    const d = await Digest.getDigest({});
    note.remove();
    const reply = Digest.digestText(d, { links: false }) + "\nToque un titular abajo para leer la nota.";
    const sources = (d.news || []).map((n) => ({ title: n.source + ": " + n.title, uri: n.link }));
    renderBot(reply, { sources });
    handleSave(memory.addMessage("assistant", reply, sources.length ? { sources } : null), "la respuesta");
    return true;
  }
  return false;
}

function sendMessage(text, items = []) {
  text = (text || "").trim();
  if (busy || (!text && !items.length)) return false;
  if (!client.isConfigured()) { setEstado("sinkey"); return false; }
  const intent = items.length ? null : localIntent(text);
  if (intent) { handleLocal(intent, text).catch((e) => { console.warn("Antares local:", e); showNote("No pude completar eso. Intente de nuevo.", { warn: true }); }); return true; }
  const label = items.map((i) => (i.kind === "video" ? "[video]" : i.kind === "pdf" ? "[pdf]" : "[foto]")).join(" ");
  const prompt = text || (items.some((i) => i.kind === "pdf") ? DEFAULT_PDF_PROMPT : DEFAULT_MEDIA_PROMPT);
  // al modelo solo le mandamos el texto del historial (las miniaturas no)
  const history = memory.getHistory(20).map(({ role, content }) => ({ role, content }));
  const facts = memory.getFacts();
  setVista("chat");
  renderUser(text, items.map((i) => ({ kind: i.kind, url: i.url, thumb: i.thumb, name: i.name })));
  const thumbsToKeep = items.map((i) => ({ kind: i.kind, thumb: i.thumb && i.thumb.length < 16000 ? i.thumb : "", ...(i.kind === "pdf" ? { name: String(i.name || "").slice(0, 80) } : {}) }));
  handleSave(memory.addMessage("user", [label, prompt].filter(Boolean).join(" "), items.length ? { media: thumbsToKeep } : null), "el mensaje");
  runJob({ text, items, prompt, history, facts });
  return true;
}

els.form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  voice.unlock(); // gesto del usuario: habilita la voz en iOS
  if (busy) { chatNotice("Espere a que termine la respuesta o tóquela para detenerla."); return; }
  if (attachments.some((a) => a.loading)) { chatNotice("Espere un momento, todavía estoy preparando los archivos…"); return; }
  const text = els.input.value;
  const items = attachments;
  if (!text.trim() && !items.length) return;
  if (sendMessage(text, items)) {
    els.input.value = "";
    attachments = [];
    renderAttachments();
    autosize();
  }
});
els.input.addEventListener("input", autosize);
els.input.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    if (busy) return;
    els.form.requestSubmit ? els.form.requestSubmit() : els.form.dispatchEvent(new Event("submit", { cancelable: true }));
  }
});
els.input.addEventListener("focus", () => setTimeout(() => scrollToBottom(false), 300));

// Detener la respuesta en curso
function stopResponse() {
  voice.stop();
  if (abortCtrl) abortCtrl.abort();
}
els.stop.addEventListener("click", stopResponse);

// ---------- Micrófono ----------
els.mic.addEventListener("click", () => {
  voice.unlock();
  if (estado === "hablando") { stopResponse(); return; }
  if (!voice.canListen) { showNote("Este navegador no permite dictado por voz. Use el micrófono del teclado.", { warn: true }); setVista("chat"); return; }
  if (busy) return;
  voice.listen({
    lang: config.speechLang || "es-CR",
    onState: (on) => {
      if (on) { els.interimText.textContent = ""; setEstado("escuchando"); }
      else if (estado === "escuchando") setEstado(baseEstado());
    },
    onInterim: (t) => { els.interimText.textContent = t ? `“${t}` : ""; },
    onFinal: (t) => { els.interimText.textContent = ""; sendMessage(t); },
    onError: (code, msg) => { if (msg) { setVista("chat"); showNote(msg, { warn: true }); } },
  });
});

// ---------- Adjuntar fotos y videos ----------
function renderAttachments() {
  els.attachments.hidden = attachments.length === 0;
  els.attachments.replaceChildren();
  for (const a of attachments) {
    const box = document.createElement("div");
    box.className = "att" + (a.loading ? " loading" : "");
    if (!a.loading) {
      if (a.kind === "pdf") {
        const chip = document.createElement("span");
        chip.className = "pdf-chip"; chip.textContent = (a.name || "PDF").slice(0, 18);
        box.appendChild(chip);
      } else if (a.thumb || a.kind === "image") {
        const img = document.createElement("img");
        img.src = a.thumb || a.url; img.alt = a.kind === "video" ? "Video adjunto" : "Foto adjunta";
        box.appendChild(img);
      } else box.append("video");
      if (a.kind === "video") {
        const bd = document.createElement("span"); bd.className = "badge"; bd.textContent = "▶ " + formatBytes(a.size);
        box.appendChild(bd);
      }
    }
    const rm = document.createElement("button");
    rm.type = "button"; rm.className = "rm"; rm.setAttribute("aria-label", a.kind === "video" ? "Quitar el video" : "Quitar la foto");
    rm.innerHTML = '<span aria-hidden="true">×</span>';
    rm.onclick = () => {
      attachments = attachments.filter((x) => x !== a);
      if (a.url) URL.revokeObjectURL(a.url);
      renderAttachments();
    };
    box.appendChild(rm);
    els.attachments.appendChild(box);
  }
}

async function addFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  const free = MAX_ATTACHMENTS - attachments.length;
  if (free <= 0) { chatNotice(`Puede adjuntar máximo ${MAX_ATTACHMENTS} archivos por mensaje.`); return; }
  if (files.length > free) chatNotice(`Solo se agregaron ${free}: el máximo es ${MAX_ATTACHMENTS} por mensaje.`);
  await Promise.all(files.slice(0, free).map(async (f) => {
    const slot = { loading: true };
    attachments.push(slot); renderAttachments();
    try {
      Object.assign(slot, await prepareFile(f), { loading: false });
    } catch (e) {
      attachments = attachments.filter((x) => x !== slot);
      setVista("chat");
      showNote(`No pude usar "${f.name || "el archivo"}": ${e.message || e}`, { warn: true });
    }
    renderAttachments();
  }));
}

function setMenu(open) {
  els.attachMenu.hidden = !open;
  els.attachBtn.setAttribute("aria-expanded", String(open));
  if (open) els.attachMenu.querySelector("button").focus();
}
els.attachBtn.addEventListener("click", () => setMenu(els.attachMenu.hidden));
document.addEventListener("click", (ev) => {
  if (!els.attachMenu.hidden && !els.attachMenu.contains(ev.target) && !els.attachBtn.contains(ev.target)) setMenu(false);
});
const pickers = { photo: els.pickPhoto, video: els.pickVideo, gallery: els.pickGallery, pdf: els.pickPdf };
els.attachMenu.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-pick]");
  if (!btn) return;
  setMenu(false);
  expectAway(3 * 60 * 1000);
  pickers[btn.dataset.pick].click();
});
els.attachMenu.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") { setMenu(false); els.attachBtn.focus(); }
});
for (const input of Object.values(pickers)) {
  input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
}

// ---------- Vista de conversación ----------
els.toggleChat.addEventListener("click", () => setVista(body.classList.contains("compact") ? "inicio" : "chat"));
els.openChat.addEventListener("click", () => setVista("chat"));
els.setupOpen.addEventListener("click", () => openSettings({ focusKey: true }));

// ---------- Paneles: recordatorios, compras, noticias ----------
let panelOpen = false;
function showPanel(name) {
  if (!isUnlocked()) return;
  if (!els.settingsView.hidden) closeSettings();
  openPanel(name);
  els.chatView.hidden = true;
  els.panelView.hidden = false;
  if (!panelOpen) { try { history.pushState({ antares: "panel" }, ""); panelPushed = true; } catch { /* */ } }
  panelOpen = true;
  els.panelTitle.focus();
}
let panelPushed = false;
window.addEventListener("popstate", () => { if (panelOpen) { panelPushed = false; hidePanel(); } });
function hidePanel() {
  if (!panelOpen && els.panelView.hidden) { if (els.panelRoot) els.panelRoot.replaceChildren(); return; }
  els.panelView.hidden = true;
  els.panelRoot.replaceChildren();
  if (els.settingsView.hidden) els.chatView.hidden = false;
  panelOpen = false;
  if (els.openPanel.isConnected) els.openPanel.focus({ preventScroll: true });
}
els.openPanel.addEventListener("click", () => showPanel("recordatorios"));
els.closePanel.addEventListener("click", () => {
  if (panelPushed) { panelPushed = false; history.back(); } else hidePanel();
});
els.quickbar.addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-panel]");
  if (b) showPanel(b.dataset.panel);
});
initPanels(els.panelRoot, (what) => { if (what === "reminders" || what === "notify") syncReminders(); });

// La agenda se escribe en orden (una escritura a la vez) y la revisión espera a que termine
let syncChain = Promise.resolve();
function syncReminders() {
  syncChain = syncChain.then(async () => {
    if (!isUnlocked()) return;
    await Notify.syncSchedule(Reminders.loadReminders(), { generic: Lock.hasPin() });
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CHECK_REMINDERS" });
    }
  }).catch((e) => console.warn("Antares: agenda", e));
  return syncChain;
}
// Revisa los recordatorios vencidos: aviso del sistema (si hay permiso) y nota dentro de la app
let tickBusy = false;
async function reminderTick() {
  if (tickBusy) return;
  if (!isUnlocked()) { // bloqueada: solo el aviso genérico de la agenda (sin descifrar nada)
    tickBusy = true;
    try { await Notify.checkDue(); } catch { /* */ } finally { tickBusy = false; }
    return;
  }
  tickBusy = true;
  try {
    await syncChain;
    await Notify.checkDue();
    const dueNow = Reminders.due();
    if (!dueNow.length) return;
    for (const r of dueNow) {
      Reminders.completeReminder(r.id);
      setVista("chat");
      showNote(`Recordatorio: ${r.title}.`, {
        bold: "⏰",
        action: { label: "Posponer 10 min", run: (note) => {
          const res = Reminders.addReminder({ title: r.title, at: Date.now() + 10 * 60 * 1000 });
          note.remove(); syncReminders();
          if (res.ok) showNote(`Le recuerdo «${r.title}» en 10 minutos.`);
        } },
      });
      announce(`Recordatorio: ${r.title}`);
    }
    if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch { /* */ } }
    if (!els.panelView.hidden && document.querySelector(".panel-tab.on")?.dataset.tab === "recordatorios") renderPanel();
    await syncReminders();
  } catch (e) { console.warn("Antares: recordatorios", e); }
  finally { tickBusy = false; }
}

// Exportar la conversación
function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
els.exportTxt.addEventListener("click", () => {
  const lines = memory.getHistory(0).map((m) => `[${m.ts || ""}] ${m.role === "user" ? "Usted" : "Antares"}: ${m.content || ""}` +
    (m.sources && m.sources.length ? "\nFuentes:\n" + m.sources.map((x) => `- ${x.title}: ${x.uri}`).join("\n") : ""));
  downloadFile(`antares-conversacion.txt`, lines.join("\n\n"), "text/plain");
  setSettingsStatus("Conversación exportada");
});
els.exportJson.addEventListener("click", () => {
  downloadFile(`antares-conversacion.json`, JSON.stringify(memory.getHistory(0), null, 2), "application/json");
  setSettingsStatus("Conversación exportada");
});

// Oferta única del cumpleaños de Evangeline
const K_BDAY_OFFER = "antares.bdayOffer.v1";
function maybeOfferBirthday() {
  try {
    if (Reminders.hasBirthdayReminder() || localStorage.getItem(K_BDAY_OFFER)) return;
    localStorage.setItem(K_BDAY_OFFER, "1");
  } catch { return; }
  const card = document.createElement("div");
  card.className = "confirm-card";
  const p = document.createElement("p");
  p.textContent = "¿Quiere que le recuerde el cumpleaños de Evangeline cada 10 de octubre?";
  const row = document.createElement("div"); row.className = "btn-row";
  const yes = document.createElement("button"); yes.type = "button"; yes.className = "btn primary"; yes.textContent = "Sí, recordármelo";
  const no = document.createElement("button"); no.type = "button"; no.className = "btn"; no.textContent = "No, gracias";
  yes.onclick = () => { card.remove(); Reminders.offerEvangelineBirthday(); syncReminders(); showNote("Listo: le avisaré cada 10 de octubre."); };
  no.onclick = () => card.remove();
  row.append(yes, no); card.append(p, row);
  els.messages.appendChild(card);
}


// ---------- Configuración ----------
let snapshot = null;
let settingsOpener = null;
let historyPushed = false;

function formValues() {
  return {
    geminiApiKey: els.apiKey.value.replace(/\s+/g, ""),
    assistantName: els.assistantName.value.trim(),
    userName: els.userName.value.trim(),
    personality: els.personality.value.trim(),
    speakReplies: els.speakReplies.checked,
    speechLang: els.speechLang.value,
    webSearch: els.webSearch.checked,
    autoLearn: els.autoLearn.checked,
    ...(Lock.hasPin() ? { lockOnHide: els.lockOnHide.checked, idleMin: Number(els.idleLock.value) } : {}),
  };
}
const isDirty = () => !!snapshot && JSON.stringify(formValues()) !== JSON.stringify(snapshot);
function updateDirty() {
  const dirty = isDirty();
  els.unsaved.hidden = !dirty;
  els.save.disabled = !dirty;
  if (dirty) setSettingsStatus("");
}
function setSettingsStatus(text, isError = false) {
  els.settingsStatus.textContent = text;
  els.settingsStatus.classList.toggle("err", isError);
}
function setConnStatus(kind, text, details = "") {
  els.connStatus.hidden = !kind;
  els.connStatus.classList.toggle("pending", kind === "pending");
  els.connStatus.classList.toggle("err", kind === "err");
  els.connStatusText.textContent = text;
  els.connDetails.hidden = !details;
  els.connDetails.onclick = details ? () => openModal("Diagnóstico de conexión", details, els.connDetails) : null;
}

function fillSettings() {
  els.apiKey.value = config.geminiApiKey || "";
  setKeyVisible(false);
  els.assistantName.value = config.assistantName || DEFAULT_ASSISTANT_NAME;
  els.userName.value = config.userName || "";
  els.personality.value = config.personality || "";
  els.speakReplies.checked = !!config.speakReplies;
  els.speechLang.value = config.speechLang || "es-CR";
  els.webSearch.checked = !!config.webSearch;
  els.autoLearn.checked = !!config.autoLearn;
  fillSecurity();
  els.voiceUnsupported.hidden = voice.canListen;
  if (config.geminiApiKey) setConnStatus("ok", "Key guardada en este dispositivo. Toque «Probar conexión» para verificarla.");
  else setConnStatus("pending", "Todavía no hay una key guardada");
  snapshot = formValues();
  setSettingsStatus("");
  updateDirty();
  renderFactsList();
  renderStorage();
}

function openSettings({ focusKey = false, scrollTo = "" } = {}) {
  settingsOpener = document.activeElement;
  fillSettings();
  els.chatView.hidden = true;
  els.settingsView.hidden = false;
  if (!historyPushed) { history.pushState({ antares: "settings" }, ""); historyPushed = true; }
  requestAnimationFrame(() => {
    if (focusKey) { els.apiKey.focus(); $("api").scrollIntoView({ block: "start" }); }
    else if (scrollTo) { $(scrollTo).scrollIntoView({ block: "center" }); els.settingsTitle.focus(); }
    else { els.settingsScroll.scrollTop = 0; els.settingsTitle.focus(); }
  });
}

function confirmDiscard() {
  return !isDirty() || confirm("Tiene cambios sin guardar. ¿Desea salir sin guardarlos?");
}
function hideSettings() {
  els.settingsView.hidden = true;
  els.chatView.hidden = false;
  snapshot = null;
  setEstado(busy ? "hablando" : (estado === "error" ? "error" : baseEstado()));
  if (settingsOpener && settingsOpener.isConnected && !settingsOpener.disabled) settingsOpener.focus();
  if (isUnlocked() && !lockShowing()) setTimeout(maybeOfferPin, 300);
}
function closeSettings() {
  if (!confirmDiscard()) return;
  snapshot = null; // ya confirmado: el popstate no vuelve a preguntar
  if (historyPushed) { historyPushed = false; history.back(); }
  hideSettings();
}
window.addEventListener("popstate", () => {
  if (els.settingsView.hidden) { historyPushed = false; return; }
  historyPushed = false;
  if (!confirmDiscard()) { history.pushState({ antares: "settings" }, ""); historyPushed = true; return; }
  hideSettings();
});
window.addEventListener("beforeunload", (ev) => {
  if (!els.settingsView.hidden && isDirty()) { ev.preventDefault(); ev.returnValue = ""; }
});

els.openSettings.addEventListener("click", () => openSettings());
els.closeSettings.addEventListener("click", closeSettings);
els.settingsView.addEventListener("input", updateDirty);
els.settingsView.addEventListener("change", updateDirty);

function setKeyVisible(visible) {
  els.apiKey.type = visible ? "text" : "password";
  els.toggleKey.setAttribute("aria-pressed", String(visible));
  els.toggleKey.setAttribute("aria-label", visible ? "Ocultar la key" : "Mostrar la key");
}
els.toggleKey.addEventListener("click", () => setKeyVisible(els.apiKey.type === "password"));
els.pasteKey.addEventListener("click", async () => {
  try {
    const t = await navigator.clipboard.readText();
    const clean = (t || "").replace(/\s+/g, "");
    if (clean) { els.apiKey.value = clean; updateDirty(); setConnStatus("pending", "Key pegada. Toque «Probar conexión» para verificarla y guardarla."); }
    else setConnStatus("pending", "El portapapeles está vacío");
  } catch {
    setConnStatus("pending", "Su navegador no deja pegar con el botón: mantenga presionado el campo y elija Pegar.");
  }
});

function applyConfig() {
  client = makeClient();
  els.title.textContent = assistantName().toUpperCase();
  document.title = assistantName();
  renderGreeting();
}

els.save.addEventListener("click", async () => {
  const { lockOnHide, idleMin, ...v } = formValues();
  const next = { ...config, ...v, assistantName: v.assistantName || DEFAULT_ASSISTANT_NAME };
  const r = memory.saveConfig(next);
  const ok = r.ok && (await flushWrites()).ok && (!Lock.hasPin() || await Lock.savePrefs({ lockOnHide, idleMin }));
  if (!ok) { setSettingsStatus("No se pudo guardar: el almacenamiento está lleno o el navegador está en modo privado.", true); return; }
  config = next;
  applyConfig();
  snapshot = formValues();
  updateDirty();
  setSettingsStatus("Cambios guardados");
  renderStorage();
});

// "Probar conexión": si funciona, la key se guarda de una vez
els.testConn.addEventListener("click", async () => {
  const key = els.apiKey.value.replace(/\s+/g, "");
  if (!key) { setConnStatus("pending", "Primero pegue su API key"); els.apiKey.focus(); return; }
  els.testConn.disabled = true;
  setConnStatus("pending", "Probando conexión…");
  try {
    const tester = makeClient(key);
    const t = await tester.testConnection();
    if (t.ok) {
      config.geminiApiKey = key;
      if (t.model) config.geminiModel = t.model;
      const r0 = memory.saveConfig(config);
      const r = { ok: r0.ok && (await flushWrites()).ok };
      if (snapshot) snapshot.geminiApiKey = key;
      updateDirty();
      applyConfig();
      setConnStatus("ok", `Conexión verificada · ${(t.ms / 1000).toFixed(1).replace(".", ",")} s · ${shortModel(t.model)}${r.ok ? " · key guardada" : " · no se pudo guardar la key"}`, t.report);
    } else {
      setConnStatus("err", `${t.r.title}: ${t.r.text}`, t.report);
    }
  } catch (e) {
    setConnStatus("err", "La prueba falló por un error inesperado.", String(e && e.message ? e.message : e));
  } finally {
    els.testConn.disabled = false;
  }
});

function renderFactsList() {
  const items = memory.getFactItems();
  els.factsList.replaceChildren();
  for (const it of items) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = it.fact;
    const del = document.createElement("button");
    del.type = "button"; del.className = "icon-btn"; del.textContent = "×";
    del.setAttribute("aria-label", `Borrar: ${it.fact}`);
    del.onclick = () => {
      const next = li.nextElementSibling || li.previousElementSibling;
      memory.deleteFact(it.id);
      renderFactsList();
      renderStorage();
      const target = next && els.factsList.contains(next) ? next.querySelector("button") : els.autoLearn;
      if (target) target.focus();
    };
    li.append(span, del);
    els.factsList.appendChild(li);
  }
  els.factsCount.textContent = items.length
    ? `${items.length} dato${items.length === 1 ? "" : "s"} guardado${items.length === 1 ? "" : "s"}`
    : "Todavía no recuerdo nada sobre usted.";
}

const mb = (n) => (n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1).replace(".", ",");
async function renderStorage() {
  const u = await memory.usage();
  if (u.vault) {
    const used = u.total || u.vaultBytes, quota = u.quota || 0;
    const p = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
    els.storageText.textContent = quota ? `${mb(used)} MB cifrados · ${p} %` : `${mb(used)} MB cifrados`;
    els.storageFill.style.width = Math.max(p, used ? 2 : 0) + "%";
    els.storageBar.setAttribute("aria-valuenow", String(p));
    els.storageBar.setAttribute("aria-valuetext", `${p} % usado`);
    els.storageMeter.classList.toggle("high", p >= 80);
    return;
  }
  const pct = Math.min(100, Math.round((u.ls / LS_LIMIT) * 100));
  els.storageText.textContent = `${mb(u.ls)} MB de ~5 MB`;
  els.storageFill.style.width = Math.max(pct, u.ls ? 2 : 0) + "%";
  els.storageBar.setAttribute("aria-valuenow", String(pct));
  els.storageBar.setAttribute("aria-valuetext", `${pct} % usado`);
  els.storageMeter.classList.toggle("high", pct >= 80);
}

els.clearHistory.addEventListener("click", () => {
  if (!confirm("¿Borrar toda la conversación de este dispositivo?")) return;
  memory.clearHistory();
  els.messages.replaceChildren();
  vista = "inicio";
  setSettingsStatus("Conversación borrada");
  renderStorage();
});
els.clearFacts.addEventListener("click", () => {
  if (!confirm("¿Borrar todo lo que Antares recuerda de usted?")) return;
  memory.clearFacts();
  renderFactsList();
  renderStorage();
  setSettingsStatus("Memoria borrada");
});

// ---------- Diálogo accesible ----------
let modalOpener = null;
function openModal(title, text, opener = document.activeElement) {
  modalOpener = opener;
  els.modalTitle.textContent = title;
  els.modalBody.textContent = text;
  els.modal.hidden = false;
  els.modalClose.focus();
}
function closeModal() {
  els.modal.hidden = true;
  if (modalOpener && modalOpener.isConnected) modalOpener.focus();
  modalOpener = null;
}
els.modalClose.addEventListener("click", closeModal);
els.modal.addEventListener("click", (ev) => { if (ev.target === els.modal) closeModal(); });
els.modal.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") { ev.preventDefault(); closeModal(); return; }
  if (ev.key === "Tab") { // mantener el foco dentro del diálogo
    const f = [els.modalBody, els.modalCopy, els.modalClose];
    const i = f.indexOf(document.activeElement);
    if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
  }
});
els.modalBody.tabIndex = 0;
els.modalCopy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(els.modalBody.textContent); els.modalCopy.textContent = "Copiado"; }
  catch { els.modalCopy.textContent = "No se pudo copiar"; }
  setTimeout(() => { els.modalCopy.textContent = "Copiar"; }, 1500);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || !els.modal.hidden) return;
  if (!els.attachMenu.hidden) { setMenu(false); els.attachBtn.focus(); }
  else if (estado === "hablando") stopResponse();
  else if (estado === "escuchando") voice.stopListening();
});

// ---------- Conexión ----------
window.addEventListener("online", () => { updateConn(); refreshWeather(); });
window.addEventListener("offline", updateConn);

// ---------- Service worker y aviso de versión nueva ----------
function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let shown = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || shown) return; // primera instalación: no hace falta avisar
    shown = true;
    els.toast.hidden = false;
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    if (reg.waiting && hadController) els.toast.hidden = false;
    let lastCheck = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck > 30 * 60 * 1000) { lastCheck = Date.now(); reg.update().catch(() => {}); }
    });
  }).catch((e) => console.warn("Antares: service worker no registrado", e));
  els.updateBtn.addEventListener("click", async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
    } catch { /* */ }
    location.reload();
  });
  els.updateDismiss.addEventListener("click", () => { els.toast.hidden = true; });
}

// ---------- Inicio ----------
function buildWave() {
  for (let i = 0; i < 22; i++) {
    const b = document.createElement("i");
    b.style.setProperty("--h", (0.35 + Math.abs(Math.sin(i * 1.7)) * 0.65).toFixed(2));
    b.style.animationDelay = (-(i * 0.083)).toFixed(2) + "s";
    b.style.animationDuration = (0.7 + (i % 5) * 0.12).toFixed(2) + "s";
    els.wave.appendChild(b);
  }
}

// ---------- Seguridad: código, bloqueo y passkey ----------
let awayUntil = 0;            // se espera que el usuario salga un momento (cámara/galería): no bloquear
let hiddenAt = 0;
let lastActivity = Date.now();
function expectAway(ms) { awayUntil = Date.now() + ms; }

async function fillSecurity() {
  const on = Lock.hasPin();
  els.secStatus.classList.toggle("on", on);
  els.secStatusText.replaceChildren();
  const small = document.createElement("small");
  if (on) {
    els.secStatusText.append("Código de seguridad activo", small);
    small.textContent = "6 dígitos · sus datos se guardan cifrados";
  } else {
    els.secStatusText.append("Sin código de seguridad", small);
    small.textContent = "Sus datos se guardan sin cifrar en este navegador";
  }
  els.secOffRow.hidden = on;
  els.secOn.hidden = !on;
  if (!on) return;
  const p = Lock.prefs();
  els.lockOnHide.checked = !!p.lockOnHide;
  els.idleLock.value = String(p.idleMin);
  const pk = Lock.passkeyInfo();
  els.passkeySwitch.checked = !!pk;
  els.passkeyNote.textContent = !pk
    ? "Passkey (WebAuthn): Face ID en iPhone, huella en Android. El código sigue funcionando."
    : pk.prf
      ? "Activo: Face ID / huella también descifra sus datos. El código sigue funcionando."
      : "Activo en modo comodidad: este navegador no ofrece cifrado con passkey (PRF), así que Face ID / huella solo desbloquea mientras la app sigue abierta. Al reabrirla se pide el código.";
  const supported = await Lock.passkeySupported();
  els.passkeySwitch.disabled = !supported && !pk;
  if (!supported && !pk) els.passkeyNote.textContent = "Este dispositivo o navegador no ofrece Face ID / huella para sitios web.";
}

async function securityAction(fn) {
  const wasOpen = !els.settingsView.hidden;
  try { await fn(); } finally {
    if (wasOpen && !els.settingsView.hidden) {
      const st = els.settingsStatus.textContent, err = els.settingsStatus.classList.contains("err");
      await fillSecurity();
      if (snapshot) {
        const { lockOnHide, idleMin, ...rest } = snapshot; // el código se creó o se quitó: actualizar solo esa parte
        snapshot = { ...rest, ...secValues() };
        updateDirty();
        setSettingsStatus(st, err);
      }
      renderStorage();
    }
  }
}
const secValues = () => (Lock.hasPin() ? { lockOnHide: els.lockOnHide.checked, idleMin: Number(els.idleLock.value) } : {});

async function createPinFlow() {
  if (Lock.hasPin()) return;
  if (!isUnlocked()) return;
  await flushWrites();
  const r = await runPinFlow("create");
  if (r && r.ok) {
    setSettingsStatus("Código activado: sus datos se guardan cifrados");
    syncReminders();
    if (els.settingsView.hidden) { setVista("chat"); showNote("Código activado. Su key, la conversación y la memoria se guardan cifradas en este dispositivo."); }
    lastActivity = Date.now();
  }
}
els.pinCreate.addEventListener("click", () => securityAction(createPinFlow));
els.pinChange.addEventListener("click", () => securityAction(async () => {
  const r = await runPinFlow("change");
  if (r && r.ok) setSettingsStatus("Código cambiado");
}));
els.lockNow.addEventListener("click", () => lockApp("manual"));
els.pinRemove.addEventListener("click", () => securityAction(async () => {
  if (!confirm("¿Quitar el código? Sus datos volverán a guardarse sin cifrar en este navegador.")) return;
  const v = await runPinFlow("verify", "Ingrese su código para quitarlo");
  if (!v || !v.ok) return;
  if (Lock.passkeyInfo()) await Lock.disablePasskey();
  const r = await Lock.removePin(v.dekX);
  if (r.ok) syncReminders();
  setSettingsStatus(r.ok ? "Código quitado. Sus datos ya no están cifrados." : "No se pudo quitar el código: no hay espacio para guardar los datos sin cifrar.", !r.ok);
}));
els.passkeySwitch.addEventListener("change", (ev) => {
  ev.stopPropagation(); // no cuenta como "cambio sin guardar": se aplica de inmediato
  const want = els.passkeySwitch.checked;
  securityAction(async () => {
    if (!want) {
      if (confirm("¿Desactivar el desbloqueo con Face ID / huella? El código seguirá funcionando.")) { await Lock.disablePasskey(); setSettingsStatus("Face ID / huella desactivado"); }
      return;
    }
    const v = await runPinFlow("verify", "Confirme su código para activar Face ID / huella");
    if (!v || !v.ok) return;
    try {
      expectAway(60 * 1000);
      const r = await Lock.enrollPasskey(v.dekX);
      setSettingsStatus(r.prf ? "Face ID / huella activado" : "Face ID / huella activado en modo comodidad (sin cifrado)");
    } catch (e) {
      console.warn("Antares passkey:", e);
      setSettingsStatus(e && e.name === "NotAllowedError" ? "Se canceló la activación de Face ID / huella." : "No se pudo activar Face ID / huella en este dispositivo.", true);
    } finally { awayUntil = 0; }
  });
});

// Bloquear: se borra lo descifrado, el contenido de la pantalla y se cancela lo que esté en curso
function lockApp(reason = "manual") {
  if (!Lock.hasPin() || !isUnlocked()) { if (Lock.hasPin() && !lockShowing()) showLock(afterUnlock); return; }
  lockEpoch++;
  stopResponse();
  if (estado === "escuchando") voice.stopListening();
  voice.stop();
  if (!els.modal.hidden) closeModal();
  if (!els.settingsView.hidden) {
    snapshot = null;
    if (historyPushed) { historyPushed = false; history.back(); }
    hideSettings();
  }
  hidePanel();
  setMenu(false);
  for (const a of attachments) if (a.url) URL.revokeObjectURL(a.url);
  attachments = []; renderAttachments();
  els.input.value = ""; autosize();
  els.messages.replaceChildren();
  els.announcer.textContent = "";
  els.interimText.textContent = "";
  pendingConfirm = null;
  Lock.lockNow();
  config = memory.getConfig();
  client = makeClient("");
  vista = "inicio";
  setEstado("sinkey");
  showLock(afterUnlock);
  console.info("Antares: bloqueado", reason);
}

function loadData() {
  config = memory.getConfig();
  applyConfig();
  els.messages.replaceChildren();
  for (const m of memory.getHistory(40)) {
    if (m.role === "user") {
      const text = String(m.content || "").replace(/^(\[(foto|video|pdf)\]\s*)+/, "").replace(/^Describa lo que ve\.$/, "");
      renderUser(m.media ? text : m.content, m.media);
    } else renderBot(m.content, { sources: m.sources || [] });
  }
  vista = "inicio";
  setEstado(baseEstado());
}
function afterUnlock() {
  lastActivity = Date.now();
  loadData();
  body.classList.remove("booting");
  maybeOfferBirthday();
  syncReminders();
  reminderTick();
  openPanelFromUrl();
}
// Accesos directos del manifiesto: ?panel=recordatorios|compras|noticias (se usa una sola vez)
function openPanelFromUrl() {
  const params = new URLSearchParams(location.search);
  const name = params.get("panel");
  if (!name) return;
  params.delete("panel");
  history.replaceState(history.state, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
  showPanel(name);
}

// Ofrecer el código una sola vez (es opcional)
const K_PIN_OFFER = "antares.pinOffer.v1";
function maybeOfferPin() {
  try {
    if (Lock.hasPin() || !config.geminiApiKey || localStorage.getItem(K_PIN_OFFER)) return;
    localStorage.setItem(K_PIN_OFFER, String(Date.now()));
  } catch { return; }
  const card = document.createElement("div");
  card.className = "confirm-card";
  const p = document.createElement("p");
  p.textContent = "¿Desea proteger Antares con un código de 6 dígitos? Su key, la conversación y la memoria quedarían cifradas en este dispositivo. Es opcional.";
  const row = document.createElement("div");
  row.className = "btn-row";
  const yes = document.createElement("button");
  yes.type = "button"; yes.className = "btn primary"; yes.textContent = "Crear código";
  const no = document.createElement("button");
  no.type = "button"; no.className = "btn"; no.textContent = "Ahora no";
  yes.onclick = () => { card.remove(); createPinFlow(); };
  no.onclick = () => { card.remove(); showNote("Puede crearlo cuando quiera en Configuración › Seguridad."); };
  row.append(yes, no);
  card.append(p, row);
  els.messages.appendChild(card);
  setVista("chat");
  scrollToBottom();
}

// Al salir de la app (cambiar de app, apagar la pantalla) y por inactividad
function onHidden() {
  hiddenAt = Date.now();
  if (!Lock.hasPin() || !isUnlocked()) return;
  if (Date.now() < awayUntil) return; // eligiendo una foto o video
  if (Lock.prefs().lockOnHide) lockApp("salir");
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") onHidden();
  else {
    if (Lock.hasPin() && isUnlocked() && awayUntil && hiddenAt && Date.now() > awayUntil && Lock.prefs().lockOnHide) lockApp("salir");
    awayUntil = 0;
    checkIdle();
  }
});
window.addEventListener("pagehide", onHidden);
for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "input"]) {
  window.addEventListener(ev, () => { lastActivity = Date.now(); }, { capture: true, passive: true });
}
function checkIdle() {
  if (!Lock.hasPin() || !isUnlocked() || lockShowing()) return;
  if (busy || estado === "escuchando") { lastActivity = Date.now(); return; }
  const min = Number(Lock.prefs().idleMin) || 0;
  if (min > 0 && Date.now() - lastActivity >= min * 60 * 1000) lockApp("inactividad");
}
setInterval(checkIdle, 10 * 1000);
for (const input of Object.values(pickers)) {
  input.addEventListener("change", () => { awayUntil = 0; });
  input.addEventListener("cancel", () => { awayUntil = 0; });
}
window.addEventListener("antares:save-error", () => { if (isUnlocked()) storageFullNote("No pude guardar los últimos cambios"); });

async function init() {
  buildWave();
  els.version.textContent = `Antares Web ${APP_VERSION} · sus datos y su key se guardan solo en este navegador`;
  tick();
  setTimeout(() => { tick(); setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000 + 50);
  refreshWeather();
  setInterval(refreshWeather, 15 * 60 * 1000);
  setInterval(reminderTick, 20000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reminderTick(); });
  navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", (ev) => {
    const d = ev.data || {};
    if (d.type === "OPEN_PANEL") showPanel(d.panel || "recordatorios");
  });
  syncViewport();
  setupServiceWorker();
  await Lock.loadMeta();
  if (Lock.hasPin()) {
    // con código: siempre arranca bloqueada; nada se descifra hasta ingresar el código
    config = memory.getConfig();
    client = makeClient("");
    setEstado("sinkey");
    showLock(afterUnlock);
    body.classList.remove("booting");
  } else {
    await memory.init().catch((e) => console.warn("Antares: migración", e));
    loadData();
    body.classList.remove("booting");
    maybeOfferPin();
    maybeOfferBirthday();
    syncReminders();
    reminderTick();
    openPanelFromUrl();
  }
  requestPersistence();
}
init();
