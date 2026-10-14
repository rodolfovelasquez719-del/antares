// Antares Web - lógica de la interfaz (estilo "Jarvis").
import { GeminiClient, DEFAULT_ASSISTANT_NAME, needsSearch } from "./gemini.js";
import { memory, thumbs, requestPersistence, LS_LIMIT, flushWrites, isVaultMode, isUnlocked } from "./memory.js";
import * as Lock from "./lock.js";
import * as Vault from "./vault.js";
import { showLock, runPinFlow, runTapFlow, isShowing as lockShowing } from "./lockui.js";
import { looksLikeImportantFact, buildConfirmationQuestion } from "./facts.js";
import { Voice, isIOS, speechErrorMessage } from "./voice.js";
import { WakeWord } from "./wake.js";
import * as Robotics from "./robotics.js";
import { prepareFile, toGeminiMedia, formatBytes, MAX_ATTACHMENTS } from "./media.js";
import { fetchWeather } from "./weather.js";
import * as Reminders from "./reminders.js";
import * as Shopping from "./shopping.js";
import * as Digest from "./digest.js";
import * as Notify from "./notify.js";
import { initPanels, openPanel, openGroup, currentView, groupOf, GROUP_LABEL, render as renderPanel, resetPanels } from "./panels.js";
import * as Routes from "./routes.js";
import * as Cubic from "./cubic.js";
import * as Mail from "./mail.js";
import * as Logbook from "./logbook.js";
import * as Social from "./social.js";
import * as Tools from "./tools.js";
import * as Photo from "./photo.js";
import * as Code from "./code.js";
import * as Sheet from "./sheet.js";
import * as Brain from "./brain.js";
import * as Hud from "./hud.js";
import { mountAvatar, setAvatarState } from "./avatar.js";
import { openVision } from "./vision.js";
import { MODELS as GEM_MODELS } from "./gemini.js";
import * as Agent from "./agent.js";
import * as LB from "./localbrain.js";
import { newDamasGame } from "./ocio.js";

const APP_VERSION = "1.19.3";
// Pregunta por defecto cuando se manda solo la foto o el video (v1.8.1)
const DEFAULT_MEDIA_PROMPT = "¿Qué es esto? Dígamelo en pocas palabras y, si tiene texto o datos importantes (montos, fechas, avisos o errores), léamelos.";
const DEFAULT_VIDEO_PROMPT = "¿Qué se ve en este video? Resúmalo en pocas palabras y léame el texto importante que aparezca.";
const DEFAULT_PROMPTS_RE = /^(Describa lo que ve\.|¿Qué es esto\? Dígamelo en pocas palabras.*|¿Qué se ve en este video\? Resúmalo.*|Resuma este documento: puntos clave.*)$/;
// Fotos y videos recientes que siguen "a la vista" para preguntas de seguimiento ("¿y cuánto pagué de pañales?").
// Solo en memoria RAM (nunca en disco): se borran al bloquear, al borrar la conversación o al recargar.
const sessionMedia = new Map(); // id del mensaje -> { items, ts }
const FOLLOW_MAX_MSGS = 8, FOLLOW_MAX_MS = 30 * 60 * 1000, FOLLOW_MAX_TURNS = 2;
function rememberMedia(id, items) {
  if (!id || !items.length) return;
  sessionMedia.set(id, { items, ts: Date.now() });
  while (sessionMedia.size > FOLLOW_MAX_TURNS) sessionMedia.delete(sessionMedia.keys().next().value);
}
// Historial para el modelo; las fotos recientes vuelven a ir con su mensaje (como items, se convierten en runJob)
function historyForModel(limit) {
  const h = memory.getHistory(limit);
  const recent = new Set(h.slice(-FOLLOW_MAX_MSGS).map((m) => m.id));
  return h.map((m) => {
    const { id, role } = m;
    const content = Social.modelContent(m);
    const sm = sessionMedia.get(id);
    const keep = sm && recent.has(id) && Date.now() - sm.ts < FOLLOW_MAX_MS;
    return keep ? { role, content, items: sm.items } : { role, content };
  });
}
function forgetSessionMedia() { sessionMedia.clear(); }
const mediaWord = (items) => {
  const n = items.length, v = items.filter((i) => i.kind === "video").length, d = items.filter((i) => i.kind === "pdf").length;
  if (n > 1) return v === n ? `los ${n} videos` : d === n ? `los ${n} documentos` : v || d ? `los ${n} archivos` : `las ${n} fotos`;
  return v ? "el video" : d ? "el documento" : "la foto";
};
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
  pickPhoto: $("pick-photo"), pickVideo: $("pick-video"), pickGallery: $("pick-gallery"), pickPdf: $("pick-pdf"), pickFile: $("pick-file"),
  closePanel: $("close-panel"), panelView: $("panel-view"), panelRoot: $("panel-root"), panelTitle: $("panel-title"), tabbar: $("tabbar"), wakeStatus: $("wake-status"),
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
  stickerBtn: $("sticker-btn"), stickerMenu: $("sticker-menu"), socialOn: $("social-on"), socialFreq: $("social-freq"),
  modal: $("modal"), modalTitle: $("modal-title"), modalBody: $("modal-body"), modalCopy: $("modal-copy"), modalClose: $("modal-close"),
  toast: $("update-toast"), updateBtn: $("update-btn"), updateDismiss: $("update-dismiss"),
  // seguridad
  secStatus: $("sec-status"), secStatusText: $("sec-status-text"), secOffRow: $("sec-off-row"), secOn: $("sec-on"),
  pinCreate: $("pin-create"), pinChange: $("pin-change"), lockNow: $("lock-now"), pinRemove: $("pin-remove"),
  passkeySwitch: $("passkey-switch"), passkeyNote: $("passkey-note"), comboRow: $("combo-row"), comboSwitch: $("combo-switch"), secType: $("sec-type"), lockOnHide: $("lock-on-hide"), idleLock: $("idle-lock"),
  // modos (1.8)
  wakeBtn: $("wake-btn"), wakeLabel: $("wake-label"), driveBtn: $("drive-btn"), driveLabel: $("drive-label"),
  tutorChip: $("tutor-chip"), tutorExit: $("tutor-exit"),
  wakeWord: $("wake-word"), wakeIdle: $("wake-idle"), wakeNote: $("wake-note"), drivingMode: $("driving-mode"), fontSize: $("font-size"),
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
let currentJob = null;          // promesa de la respuesta en curso (la usa el modo «Hey Antares»)
let tutorMode = false;          // modo tutor de robótica en el chat (solo esta sesión)
let wake = null;                // escucha continua «Hey Antares»

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
// v1.18: cerebro local (WebLLM). auto = Gemini si hay red y key; local si no (cuando el modelo ya está descargado)
const brainMode = () => (["auto", "gemini", "local"].includes(config.brainMode) ? config.brainMode : "auto");
const useLocal = () => {
  const m = brainMode();
  if (m === "local") return true;
  if (m === "gemini") return false;
  return LB.isDownloaded() && (!navigator.onLine || !(client && client.isConfigured()));
};
const baseEstado = () => (useLocal() || (client && client.isConfigured()) ? "reposo" : "sinkey");

// ---------- Estados de la interfaz ----------
const STATE_TEXT = { reposo: "EN ESPERA", escuchando: "ESCUCHANDO…", hablando: "RESPONDIENDO…", error: "EN PAUSA", sinkey: "SIN CONFIGURAR" };

function setEstado(e) {
  estado = e;
  body.dataset.estado = e;
  // v1.13: el cerebro 3D sigue los estados reales (hablando = esperando a Gemini; cambia a respondiendo al llegar texto o voz)
  try { paintPresence(); Hud.setHudMode(e === "escuchando" ? "escuchando" : e === "hablando" ? "pensando" : "reposo"); } catch { /* */ }
  try { Brain.setMode(e === "escuchando" ? "escuchando" : e === "hablando" ? "pensando" : "reposo"); Brain.setDim(e === "error" || e === "sinkey"); if (e === "reposo") refreshBrainCounts(); } catch { /* */ }
  els.stateLabel.textContent = STATE_TEXT[e] || "";
  els.stateLabel.classList.toggle("warn", e === "error" || e === "sinkey");
  if (e !== "error") { els.sideHint.hidden = true; els.sideHint.textContent = ""; }
  updateMic();
  updateComposer();
  updateConn();
  updateLayout();
}

// v1.19: avatar sigue los estados reales: escuchando → listen, esperando respuesta → think, voz sonando → speak
let voiceAudible = false;
const presence = () => (["cerebro", "avatar", "ambos"].includes(config.presence) ? config.presence : "ambos"); // v1.19.3: por defecto Ambos
function paintPresence() {
  body.dataset.presencia = presence();
  const s = voiceAudible ? "speak" : estado === "escuchando" ? "listen" : estado === "hablando" ? "think" : "idle";
  setAvatarState(document.getElementById("avatar-home"), s);
}
function refreshBrainCounts() {
  if (!isUnlocked()) { Brain.setCounts(null); Hud.setHudCounts(null); return; }
  const n = (k) => { try { const v = memory.getData(k); return Array.isArray(v) ? v.length : 0; } catch { return 0; } };
  const c = { Recuerdos: n("antares.facts.v1"), Recordatorios: n(Reminders.K_REMINDERS), Compras: n(Shopping.K_SHOPPING), Rutas: n(Logbook.K_LOG), Trabajo: n(Logbook.K_LOG) };
  Brain.setCounts(c); Hud.setHudCounts(c);
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
  if (voice.speaking && (estado === "reposo" || estado === "error")) { els.micHint.textContent = "Toque para callar"; els.mic.setAttribute("aria-label", "Callar la lectura"); }
  if (conv && conv.on) { els.micHint.textContent = voice.speaking ? "Toque para interrumpir y hablar" : "Conversación: toque para salir"; els.mic.disabled = false; }
}

function updateComposer() {
  const noKey = estado === "sinkey";
  els.input.disabled = noKey;
  els.input.placeholder = noKey ? "Primero configure su API key" : tutorMode ? "Pregúntele al tutor de robótica…" : `Escríbale a ${assistantName()}…`;
  els.send.disabled = noKey || busy;
  els.attachBtn.disabled = noKey;
  els.send.setAttribute("aria-label", busy ? "Enviar (espere a que termine la respuesta)" : "Enviar");
}

const statusDefault = () => (useLocal() ? LB.LABEL : "Asistente personal");
function updateConn() {
  if ([LB.LABEL, "Asistente personal"].includes(els.status.textContent)) els.status.textContent = statusDefault();
  els.status.classList.toggle("local", useLocal());
  let main = "En línea", sub = lastModelShort || shortModel(config.geminiModel) || "Gemini", cls = "";
  const wait = Math.ceil((rateUntil - Date.now()) / 1000);
  if (useLocal()) { main = LB.LABEL; sub = LB.state.phase === "loading" ? `Cargando ${Math.round(LB.state.progress * 100)} %` : navigator.onLine ? "En el teléfono" : "Sin conexión · funciona igual"; }
  else if (!navigator.onLine) { main = "Sin conexión"; sub = LB.isDownloaded() ? "Active el cerebro local" : "Revise su internet"; cls = "off"; }
  else if (!client || !client.isConfigured()) { main = "Sin key"; sub = "Por configurar"; cls = "warn"; }
  else if (wait > 0) { main = "Límite"; sub = `Vuelve en ${wait} s`; cls = "warn"; }
  if (estado === "escuchando") sub = "Escuchando";
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
  const fc = $("fecha-c"); if (fc) fc.textContent = `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
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
// v1.9.0: el teclado se detecta contra la altura "en reposo" del área visible (por ancho de pantalla), no contra
// innerHeight. En la PWA instalada de iPhone y en Android, innerHeight también se encoge con el teclado, así que la
// comparación vieja (innerHeight - visualViewport.height) nunca detectaba el teclado y el campo quedaba debajo.
const vpBase = new Map();          // ancho → mayor altura visible vista (sin teclado)
let vpRaf = 0, kbSeen = false, typingTimer = 0;
const coarse = window.matchMedia ? window.matchMedia("(pointer: coarse)") : { matches: false };
function isTyping() { return document.activeElement === els.input; }
function syncViewport() {
  vpRaf = 0;
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const top = vv ? Math.max(0, vv.offsetTop) : 0;
  const w = Math.round(window.innerWidth);
  const base = Math.max(vpBase.get(w) || 0, window.innerHeight, h);
  // la base solo crece cuando no hay campo de texto enfocado (evita aprender la altura con el teclado abierto)
  const field = document.activeElement && document.activeElement.matches && document.activeElement.matches("input, textarea, select, [contenteditable]");
  if (!field || !vpBase.has(w)) vpBase.set(w, base);
  const ref = vpBase.get(w);
  const near = isNearBottom();
  const kb = Math.max(0, Math.round(ref - h));
  const open = kb > 120 || window.innerHeight - h > 120;
  document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
  document.documentElement.style.setProperty("--kb", `${open ? kb : 0}px`);
  els.app.style.top = `${Math.round(top)}px`;
  body.classList.toggle("kb-open", open);
  if (open && isTyping()) kbSeen = true;
  // Android: el botón Atrás esconde el teclado pero deja el foco → salir del modo escritura
  if (!open && kbSeen && isTyping() && body.classList.contains("typing")) { kbSeen = false; els.input.blur(); }
  if (near || isTyping()) scrollToBottom(false);
}
function queueViewport() { if (!vpRaf) vpRaf = requestAnimationFrame(syncViewport); }
// el teclado se anima: volver a medir varias veces tras enfocar o soltar
function settleViewport() { queueViewport(); [80, 200, 350, 600, 900].forEach((t) => setTimeout(queueViewport, t)); }
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", queueViewport);
  window.visualViewport.addEventListener("scroll", queueViewport);
}
window.addEventListener("resize", queueViewport);
window.addEventListener("orientationchange", settleViewport);
// iOS desplaza la página para mostrar el campo: mientras se escribe se acompaña (la app sigue al área visible);
// fuera del modo escritura se devuelve la página arriba.
window.addEventListener("scroll", () => { if (window.scrollY && !isTyping()) window.scrollTo(0, 0); queueViewport(); });
function setTyping(on) {
  clearTimeout(typingTimer);
  if (on) {
    if (!coarse.matches && !body.classList.contains("kb-open")) return; // escritorio: sin modo escritura
    body.classList.add("typing");
    settleViewport();
    return;
  }
  // pequeña espera: al tocar Enviar o un adjunto el diseño no salta bajo el dedo
  typingTimer = setTimeout(() => {
    if (isTyping()) return;
    body.classList.remove("typing");
    kbSeen = false;
    if (window.scrollY) window.scrollTo(0, 0);
    settleViewport();
  }, 220);
}
els.input.addEventListener("focus", () => setTyping(true));
els.input.addEventListener("blur", () => setTyping(false));
syncViewport();

// ---------- Render del chat ----------
function isNearBottom() {
  const m = els.messages;
  return m.scrollHeight - m.scrollTop - m.clientHeight < 140;
}
// v1.11: una respuesta larga queda "fijada" desde su primera línea un momento, aunque cambie el diseño
// (estado, teclado); se suelta al tocar la conversación, al escribir otro mensaje o a los 2,5 s
let replyPin = null;
const pinValid = () => replyPin && replyPin.wrap.isConnected && Date.now() < replyPin.until && [...els.messages.querySelectorAll(".msg")].pop() === replyPin.wrap;
function pinTop(wrap) {
  const m = els.messages;
  const top = m.scrollTop + wrap.getBoundingClientRect().top - m.getBoundingClientRect().top - 24; // debajo del desvanecido
  m.scrollTo({ top: Math.max(0, top), behavior: "auto" });
}
function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    if (replyPin) { if (pinValid()) { pinTop(replyPin.wrap); return; } replyPin = null; }
    els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  });
}
// respuesta larga (más alta que el 80 % de la pantalla): se muestra desde su primera línea, no desde el final
function scrollToReply(wrap) {
  requestAnimationFrame(() => {
    const m = els.messages;
    if (!wrap.isConnected) return;
    if (wrap.offsetHeight > m.clientHeight * 0.8) { replyPin = { wrap, until: Date.now() + 2500 }; pinTop(wrap); }
    else { replyPin = null; m.scrollTo({ top: m.scrollHeight, behavior: "smooth" }); }
  });
}
["touchstart", "wheel", "keydown", "pointerdown"].forEach((ev) => els.messages.addEventListener(ev, () => { replyPin = null; }, { passive: true }));
// el desvanecido superior solo cuando hay mensajes ocultos arriba
const syncFade = () => els.messages.classList.toggle("faded", els.messages.scrollTop > 2);
els.messages.addEventListener("scroll", syncFade, { passive: true });
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

// v1.11: texto con bloques ``` -> párrafos + bloques de código resaltados (Copiar, Descargar, Ver cambios, Ejecutar)
let lastUserCode = null; // último código que mandó el usuario (para "Ver cambios")
function appendRich(parent, text, role) {
  if (!Code.hasFence(text)) { appendLinkified(parent, text); return false; }
  for (const seg of Code.splitFences(text)) {
    if (seg.type === "text") {
      const t = document.createElement("span"); t.className = "t-seg";
      appendLinkified(t, seg.text.replace(/^\n+|\n+$/g, ""));
      parent.appendChild(t);
    } else parent.appendChild(codeBlockEl(seg, role));
  }
  return true;
}
function codeBlockEl({ lang, code }, role) {
  const prev = role === "bot" && lastUserCode && (lastUserCode.lang === lang || lastUserCode.lang === "text") && lastUserCode.code !== code ? lastUserCode : null;
  if (role === "user") lastUserCode = { lang, code };
  const box = document.createElement("div"); box.className = "code-block";
  const head = document.createElement("div"); head.className = "code-head";
  const lab = document.createElement("span"); lab.className = "code-lang"; lab.textContent = `${Code.LANG_LABEL[lang] || lang} · ${code.split("\n").length} líneas`;
  head.appendChild(lab);
  const pre = document.createElement("pre"); pre.className = "code-pre"; pre.tabIndex = 0;
  pre.setAttribute("aria-label", `Código ${Code.LANG_LABEL[lang] || ""}`);
  const el = document.createElement("code"); el.innerHTML = Code.highlight(code, lang); // highlight() escapa todo el texto
  pre.appendChild(el);
  const extra = document.createElement("div"); extra.className = "code-extra";
  const btn = (label, fn, cls = "") => { const b = document.createElement("button"); b.type = "button"; b.className = "mini-btn " + cls; b.textContent = label; b.onclick = () => fn(b); head.appendChild(b); return b; };
  btn("Copiar", async (b) => { if (await copyText(code)) { b.textContent = "Copiado"; setTimeout(() => { b.textContent = "Copiar"; }, 1500); } });
  btn("Descargar", () => downloadFile(`codigo.${Code.LANG_EXT[lang] || "txt"}`, code, "text/plain"));
  if (prev) {
    btn("Ver cambios", (b) => {
      const open = extra.dataset.mode === "diff";
      extra.replaceChildren(); extra.dataset.mode = "";
      b.setAttribute("aria-expanded", String(!open));
      if (open) { b.textContent = "Ver cambios"; return; }
      const d = Code.lineDiff(prev.code, code);
      const wrap = document.createElement("div"); wrap.className = "code-diff"; wrap.tabIndex = 0;
      if (!d) wrap.textContent = "El código es muy largo para comparar aquí.";
      else { const st = Code.diffStats(d); const h = document.createElement("p"); h.className = "diff-sum"; h.textContent = `${st.add} líneas nuevas o cambiadas, ${st.del} quitadas`; extra.appendChild(h); wrap.innerHTML = Code.diffHtml(d); }
      extra.appendChild(wrap); extra.dataset.mode = "diff"; b.textContent = "Ocultar cambios";
    }).setAttribute("aria-expanded", "false");
  }
  if (Code.isRunnable(lang)) {
    btn("Ejecutar", async (b) => {
      b.disabled = true; b.textContent = "Ejecutando…";
      const r = await Code.runJs(code, { timeoutMs: 3000 });
      b.disabled = false; b.textContent = "Ejecutar";
      extra.replaceChildren(); extra.dataset.mode = "run";
      const out = document.createElement("pre"); out.className = "tl-console " + (r.ok ? "ok" : "ko"); out.setAttribute("role", "status");
      const lines = r.logs.map((l) => `${l.level === "error" ? "✖ " : l.level === "warn" ? "⚠ " : ""}${l.text}`);
      if (r.value !== undefined && r.value !== null) lines.push(`← ${r.value}`);
      if (r.error) lines.push(`✖ ${r.error}`);
      out.textContent = lines.join("\n") || "(sin salida: use console.log para ver valores)";
      extra.appendChild(out);
    }, "run");
  }
  box.append(head, pre, extra);
  return box;
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
      // la foto carga después de pintar la burbuja: si es de los últimos mensajes, se baja para que se vea
      // también la burbuja "Analizando la foto…" (antes quedaba tapada por el botón Detener)
      img.addEventListener("load", () => {
        const wrap = img.closest(".msg"), kids = els.messages.children;
        if (wrap && [...kids].slice(-3).includes(wrap)) scrollToBottom(false);
      }, { once: true });
      const src = m.url || m.thumb;
      if (src) item.appendChild(img), (img.src = src);
      else if (m.thumbId) {
        thumbs.get(m.thumbId).then((t) => { if (t) { img.src = t; item.prepend(img); ph.remove(); } });
      }
      const ph = document.createElement("div");
      ph.className = "ph"; ph.textContent = m.kind === "video" ? "[video]" : m.label === "HEIC" ? "[foto HEIC]" : "[foto]";
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

function renderUser(text, media = null, { id = "", sticker = "", reactions = null } = {}) {
  replyPin = null;
  const wrap = document.createElement("div");
  wrap.className = "msg user";
  if (id) wrap.dataset.id = id;
  const b = document.createElement("div");
  b.className = "bubble";
  if (sticker) {
    const st = Social.stickerEl(sticker);
    if (st) { b.classList.add("sticker-only"); b.appendChild(st); text = ""; }
  }
  if (media && media.length) {
    b.classList.add("has-media");
    renderMedia(b, media);
    if (!text) b.classList.add("media-only");
  }
  if (text) {
    const rich = Code.hasFence(text);
    const t = document.createElement(rich ? "div" : "span");
    t.className = "t";
    appendRich(t, text, "user");
    if (rich) { b.classList.add("has-code"); wrap.classList.add("wide"); }
    b.appendChild(t);
  }
  wrap.appendChild(b);
  paintReactions(wrap, reactions);
  els.messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function renderBot(text, { sources = [], meta = "", id = "", sticker = "", reactions = null, media = null, reply = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  if (id) wrap.dataset.id = id;
  const st = sticker ? Social.stickerEl(sticker) : null;
  const b = document.createElement("div");
  b.className = "bubble";
  if (media && media.length) { b.classList.add("has-media"); renderMedia(b, media); }
  if (text && appendRich(b, text, "bot")) { b.classList.add("has-code"); wrap.classList.add("wide"); }
  if (st && !text) { b.classList.add("sticker-only"); b.appendChild(st); }
  wrap.appendChild(b);
  if (st && text) { st.classList.add("after-text"); wrap.appendChild(st); }
  paintReactions(wrap, reactions);
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
  if (reply) scrollToReply(wrap); else scrollToBottom();
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
  noticeTimer = setTimeout(() => { els.status.textContent = statusDefault(); }, 4000);
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
  if (r && r.id) {
    // v1.10: la burbuja recién dibujada recibe el id del mensaje guardado (para reaccionar)
    const m = memory.getHistory(1)[0];
    if (m && m.id === r.id) {
      const last = [...els.messages.querySelectorAll(`.msg.${m.role === "user" ? "user" : "bot"}:not([data-id])`)].pop();
      if (last && last === [...els.messages.querySelectorAll(".msg")].pop()) last.dataset.id = r.id;
    }
  }
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
  // crece hasta 5 líneas (22 px c/u + 22 px de relleno); después se desplaza por dentro
  // si el campo está oculto (scrollHeight = 0) no se fija una altura: antes podía quedar sin espacio para el texto
  if (!els.input.offsetParent || !els.input.scrollHeight) { els.input.style.height = ""; els.input.style.overflowY = ""; return; }
  const near = isNearBottom();
  const cs = getComputedStyle(els.input);
  const lh = parseFloat(cs.lineHeight) || 22;
  const max = Math.round(lh * 5 + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0));
  els.input.style.height = "auto";
  const full = els.input.scrollHeight;
  els.input.style.height = Math.max(Math.min(full, max), 44) + "px";
  els.input.style.maxHeight = max + "px";
  els.input.style.overflowY = full > max ? "auto" : "hidden";
  if (full <= max) els.input.scrollTop = 0; // el texto nunca queda desplazado fuera del cuadro
  if (near) scrollToBottom(false);
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
  let pending = null; // burbuja "Analizando la foto…" hasta que llega el primer texto
  const setPending = (txt) => {
    if (!pending) { stream = createStreamingBubble(); stream.bubble.classList.add("pending"); pending = stream; scrollToBottom(false); setTimeout(() => scrollToBottom(false), 350); }
    if (stream === pending && stream.bubble.classList.contains("pending")) stream.bubble.textContent = txt;
    els.connSub.textContent = txt.replace(/^Gemini /, "");
  };
  try {
    let media = null, history = job.history;
    const histItems = (job.history || []).flatMap((h) => h.items || []);
    if ((job.items.length || histItems.length) && client.isConfigured()) {
      const tUp = performance.now();
      if (job.items.length) setPending(`Analizando ${mediaWord(job.items)}…`);
      try {
        const all = [...histItems, ...job.items];
        const res = await toGeminiMedia(config.geminiApiKey, all, {
          signal: abortCtrl.signal,
          onProgress: (st, pct, it) => {
            const w = it && it.kind === "video" ? "el video" : it && it.kind === "pdf" ? "el documento" : "la foto";
            setPending(st === "subiendo" ? `Subiendo ${w}${it ? " (" + formatBytes(it.size) + ")" : ""}… ${pct || 0} %` : `Gemini está procesando ${w}…`);
          },
        });
        // se reparten las partes: primero las del historial (en orden), luego las del mensaje nuevo
        let k = 0;
        history = (job.history || []).map((h) => {
          if (!h.items) return h;
          const m = res.media.slice(k, k + h.items.length); k += h.items.length;
          return { role: h.role, content: h.content, media: m };
        });
        media = job.items.length ? res.media.slice(k) : null;
        uploadMs = res.uploaded ? Math.round(performance.now() - tUp) : 0;
        if (res.uploaded && job.items.length) setPending(`Analizando ${mediaWord(job.items)}…`);
      } catch (e) {
        if (stream) { stream.wrap.remove(); stream = null; }
        if (epoch !== lockEpoch) return;
        if (abortCtrl.signal.aborted) { showNote("Respuesta detenida."); setEstado(baseEstado()); return; }
        console.warn("Antares media:", e);
        const what = job.items.length ? mediaWord(job.items) : "la foto anterior";
        const big = job.items.some((i) => i.kind === "video" && i.size > 50 * 1024 * 1024);
        renderError({ kind: "media", title: "No pude enviar el archivo",
          text: `No pude subir ${what}. Revise su conexión e intente de nuevo${big ? ", o grabe un video más corto" : ""}.`,
          details: String(e.message || e) }, () => runJob(job));
        setEstado("error");
        return;
      }
    }
    if (abortCtrl.signal.aborted) { if (stream) stream.wrap.remove(); showNote("Respuesta detenida."); setEstado(baseEstado()); return; }
    const search = !media && !!config.webSearch && needsSearch(job.prompt);
    const r = await client.ask(job.prompt, history, job.facts, {
      search, media, signal: abortCtrl.signal, extraSystem: job.extraSystem || "",
      onChunk: (partial) => {
        Brain.chunk();
        if (!stream) stream = createStreamingBubble();
        const near = isNearBottom();
        if (stream.bubble.classList.contains("pending")) { stream.bubble.classList.remove("pending"); els.connSub.textContent = "Respondiendo…"; }
        stream.bubble.textContent = Social.stripPartial(partial); // las etiquetas ocultas nunca se ven
        if (near) scrollToBottom(false);
      },
    });
    if (stream) stream.wrap.remove();
    if (epoch !== lockEpoch) return; // se bloqueó mientras respondía: no se muestra ni se guarda nada
    if (r.ok) {
      lastModelShort = shortModel(r.model);
      // v1.10: etiquetas ocultas [[react:…]] / [[sticker:…]] (se quitan siempre; se aplican solo si está activado)
      const parsed = Social.parseReply(r.text);
      let { react, sticker } = job.social ? Social.gate({ ...parsed, userText: job.text || (job.kind === "sticker" ? "" : job.prompt), history: memory.getHistory(30), freq: job.social, textEmpty: !parsed.text, replyToSticker: job.kind === "sticker", rnd: typeof window.__antaresRnd === "function" ? window.__antaresRnd : Math.random }) : { react: null, sticker: null };
      if (react && !job.userMsgId) react = null;
      const text = parsed.text || (!react && !sticker ? (r.text.trim() && !Social.hasTag(r.text) ? r.text.trim() : "") : "");
      if (react) applyReaction(job.userMsgId, "a", react, { animate: true });
      let saved = null;
      if (text || sticker) {
        const botWrap = renderBot(text, { sources: r.sources, meta: formatMeta(r, uploadMs), sticker, reply: true });
        if (job.kind === "mail") addMailActions(botWrap, text);
        const photoItem = (job.items || []).find((i) => i.kind === "image" && i.blob);
        if (photoItem) addActions(botWrap, [{ label: "Editar esta foto", run: () => openPhotoTool(photoItem, job.text || "") }]);
        saved = memory.addMessage("assistant", text, { sources: r.sources || [], sticker });
        handleSave(saved, "la respuesta");
        const st = sticker ? Social.sticker(sticker) : null;
        announce(`${assistantName()}: ${text}${st ? (text ? " · " : "") + "Sticker: " + st.label : ""}${react ? " · Reaccionó: " + Social.reaction(react).label : ""}`);
      } else if (react) {
        // solo reacción (como una persona ante un «gracias»): sin burbuja; queda en el historial para el modelo
        saved = memory.addMessage("assistant", "", { reactOnly: react });
        handleSave(saved, "la respuesta");
        announce(`${assistantName()} reaccionó: ${Social.reaction(react).label}`);
      } else {
        renderBot("", { meta: formatMeta(r, uploadMs) });
        handleSave(memory.addMessage("assistant", ""), "la respuesta");
      }
      if (text && (wantsVoice() || job.speak) && !r.stopped) voice.speak(Code.hasFence(text) ? Code.splitFences(text).map((x) => (x.type === "text" ? x.text : " Le dejé el código en la pantalla. ")).join(" ") : text);
      if (job.kind !== "mail" && job.text && looksLikeImportantFact(job.text)) {
        if (config.autoLearn) autoLearn(job.text, text); // en segundo plano, no bloquea
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
    setTimeout(maybeResumeWake, 50);
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
  if (Mail.looksLikeMail(t)) return "mail";
  if (Logbook.looksLikeLog(t)) return "log";
  if (Routes.looksLikeRoute(t)) return "route";
  if (Cubic.looksLikeCubic(t)) return "cubic";
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
  if (kind === "route") {
    setVista("chat");
    renderUser(t);
    handleSave(memory.addMessage("user", t), "el mensaje");
    const req = Routes.parseRouteRequest(t);
    if (req.stops.length < 2) {
      const reply = "Indíqueme los lugares, el primero es el punto de partida. Por ejemplo: «Calcule la ruta: CEDI Sysco El Coyol, KFC Escazú, Subway Lindora». También puede usar el panel Rutas.";
      renderBot(reply); handleSave(memory.addMessage("assistant", reply), "la respuesta");
      return true;
    }
    const epoch = lockEpoch;
    busy = true; abortCtrl = new AbortController(); setEstado("hablando");
    const note = showNote("Calculando la ruta…");
    try {
      const res = await Routes.calcRoute(req.stops, { roundTrip: req.roundTrip, signal: abortCtrl.signal, onProgress: (p) => { const tx = note.querySelector(".txt"); if (tx) tx.textContent = p; } });
      if (epoch !== lockEpoch) return true;
      note.remove();
      memory.saveData(Routes.K_ROUTE_DRAFT, { text: req.stops.join("\n"), roundTrip: req.roundTrip, optimize: true, serviceMin: 0, result: res.ok ? res : null });
      const reply = res.ok ? Routes.routeText(res) : res.error;
      const sources = res.ok ? [{ title: "Abrir la ruta en Google Maps", uri: res.mapsUrl }] : [];
      const w = renderBot(reply, { sources, meta: res.ok ? "Distancias: OSRM · lugares: Open-Meteo / OpenStreetMap" : "" });
      if (res.ok) addActions(w, [{ label: "Copiar lista", run: () => copyText(reply) }, { label: "Ver en el panel Rutas", run: () => showPanel("rutas") }]);
      handleSave(memory.addMessage("assistant", reply, sources.length ? { sources } : null), "la respuesta");
    } catch (e) {
      note.remove();
      if (epoch === lockEpoch) showNote(e.name === "AbortError" ? "Cálculo de ruta detenido." : "No pude calcular la ruta. Intente de nuevo.", { warn: e.name !== "AbortError" });
    } finally {
      busy = false; abortCtrl = null;
      if (epoch === lockEpoch) { setEstado(baseEstado()); updateComposer(); }
    }
    return true;
  }
  if (kind === "cubic") {
    setVista("chat");
    renderUser(t);
    handleSave(memory.addMessage("user", t), "el mensaje");
    const p = Cubic.parseCubic(t);
    let reply;
    if (!p) reply = "Indíqueme las cantidades con sus m³. Por ejemplo: «¿Caben 300 cajas de 0,03 m³ y 2 m³ de pollo en un camión de 12 m³ y 4000 kg?»";
    else {
      let truck = p.truck, name = p.truckName;
      if (!truck) {
        const load = Cubic.loadLoad(), trucks = Cubic.loadTrucks();
        const tr = trucks.find((x) => x.id === load.truckId) || (trucks.length === 1 ? trucks[0] : null);
        if (tr) { truck = tr; name = tr.name; }
      }
      reply = truck ? Cubic.fitText(Cubic.computeFit(p.items, truck), name)
        : "¿En qué camión? Diga la capacidad, por ejemplo «en un camión de 12 m³ y 4000 kg», o guarde sus camiones en el panel Cúbica.";
    }
    renderBot(reply); handleSave(memory.addMessage("assistant", reply), "la respuesta");
    return true;
  }
  if (kind === "log") {
    setVista("chat");
    renderUser(t);
    handleSave(memory.addMessage("user", t), "el mensaje");
    const p = Logbook.parseLogRequest(t);
    let reply;
    if (!p.stops.length && /^Ruta del \d/.test(p.name)) {
      reply = "Abrí la bitácora para que anote la ruta. También puede decirlo completo: «Anote la ruta de hoy: Ruta 3 Escazú, paradas KFC Escazú, Subway Lindora. Nota: …»";
      renderBot(reply); handleSave(memory.addMessage("assistant", reply), "la respuesta");
      showPanel("bitacora");
      return true;
    }
    const res = Logbook.addEntry(p);
    if (!res.ok) storageFullNote("No pude guardar la ruta");
    reply = Logbook.entryText(res.entry);
    const w = renderBot(reply);
    addActions(w, [{ label: "Ver bitácora", run: () => showPanel("bitacora") }]);
    handleSave(memory.addMessage("assistant", reply), "la respuesta");
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

// v1.15: modo de respuesta. "texto" = sin audio · "voz" = siempre lee · "mic" = lee solo si usted habló por micrófono
const replyMode = () => (["texto", "voz", "mic"].includes(config.replyMode) ? config.replyMode : config.speakReplies ? "voz" : "mic");
const wantsVoice = () => replyMode() === "voz" || !!config.drivingMode;
const micSpeaks = () => replyMode() !== "texto" || !!config.drivingMode;
const REPLY_LABEL = { texto: "Solo texto", voz: "Texto y voz", mic: "Voz cuando hablo por micrófono" };
function paintReplyMode() {
  const m = replyMode(), b = document.getElementById("reply-mode-btn");
  if (b) { b.dataset.mode = m; b.setAttribute("aria-label", "Modo de respuesta: " + REPLY_LABEL[m]); b.title = REPLY_LABEL[m]; }
}
function applyVoicePrefs() { voice.setPrefs({ voiceURI: config.voiceURI, rate: config.voiceRate ?? 0.95, pitch: config.voicePitch ?? 0.8 }); }
document.getElementById("reply-mode-btn")?.addEventListener("click", () => {
  voice.unlock();
  const order = ["mic", "voz", "texto"], m = order[(order.indexOf(replyMode()) + 1) % order.length];
  config = { ...config, replyMode: m, speakReplies: m === "voz" };
  memory.saveConfig(config); paintReplyMode();
  if (els.replyModeSel) els.replyModeSel.value = m;
  if (snapshot) { snapshot.replyMode = m; snapshot.speakReplies = m === "voz"; }
  chatNotice("Modo de respuesta: " + REPLY_LABEL[m]);
  if (m === "texto") voice.stop(); else if (m === "voz") voice.speak("Le responderé también en voz alta.");
});
document.getElementById("stop-voice")?.addEventListener("click", () => voice.stop());
// Lee en voz alta la última respuesta local (recordatorios, rutas…) cuando corresponde
function speakLastBot() {
  const b = [...els.messages.querySelectorAll(".msg.bot .bubble")].pop();
  if (b && b.textContent.trim()) voice.speak(b.textContent.trim());
}

function sendMessage(text, items = [], opts = {}) {
  text = (text || "").trim();
  if (busy || (!text && !items.length)) return false;
  if (useLocal() && !items.length) { currentJob = localJob(text, opts); return true; }
  if (useLocal() && items.length) { chatNotice("El cerebro local no puede ver fotos, PDF ni videos. Para eso necesita internet y Gemini."); return false; }
  if (!client.isConfigured()) { setEstado("sinkey"); return false; }
  const speak = !!opts.speak;
  // v1.17: confirmación hablada de una acción destructiva pendiente («¿seguro?» -> «sí»)
  if (pendingDanger && !items.length) {
    const p = pendingDanger; pendingDanger = null;
    if (Date.now() < p.until) {
      if (/^\s*(?:s[ií]|claro|confirmo|dale|h[aá]galo|de acuerdo|ok(?:ay)?|seguro|adelante)(?=$|[\s,.!¡])/i.test(text)) {
        currentJob = (async () => { const x = await Agent.execute(p.call, agentDeps, { confirmed: true }); quickReply(text, x.say || "Listo.", opts); })();
        return true;
      }
      if (/^\s*(?:no|cancel\w*|mejor no|olv[ií]delo|deje)(?=$|[\s,.!¡])/i.test(text)) { quickReply(text, "Entendido, no borro nada.", opts); currentJob = Promise.resolve(); return true; }
    }
  }
  // v1.17: acciones por voz o chat con herramientas de Gemini (si falla, sigue el camino de siempre)
  if (!items.length && !opts.noAgent && !tutorMode && (opts.spoken || (conv && conv.on) || Agent.looksActionable(text))) {
    currentJob = agentJob(text, opts);
    return true;
  }
  // modo tutor de robótica: activar / salir por chat
  if (!items.length && (tutorMode ? Robotics.looksLikeTutorOff(text) : Robotics.looksLikeTutorOn(text))) {
    setVista("chat");
    renderUser(text);
    handleSave(memory.addMessage("user", text), "el mensaje");
    setTutor(!tutorMode, { note: false });
    const reply = tutorMode
      ? "Modo tutor de robótica activado. Pregúnteme lo que quiera sobre Arduino, ESP32, sensores, motores o ROS 2. Para volver al asistente normal diga «salir del modo tutor»."
      : "Salí del modo tutor de robótica. Sigo a sus órdenes como siempre.";
    renderBot(reply); handleSave(memory.addMessage("assistant", reply), "la respuesta");
    if (speak || wantsVoice()) speakLastBot();
    currentJob = Promise.resolve();
    return true;
  }
  const intent = items.length ? null : localIntent(text);
  if (intent === "mail") {
    const history = memory.getHistory(10).map(({ role, content }) => ({ role, content }));
    setVista("chat");
    renderUser(text);
    handleSave(memory.addMessage("user", text), "el mensaje");
    currentJob = runJob({ text, items: [], prompt: Mail.mailPrompt(text, Mail.detectTemplate(text)), history, facts: memory.getFacts(), kind: "mail", speak });
    return true;
  }
  if (intent) {
    currentJob = handleLocal(intent, text)
      .then(() => { if (speak || wantsVoice()) speakLastBot(); })
      .catch((e) => { console.warn("Antares local:", e); showNote("No pude completar eso. Intente de nuevo.", { warn: true }); });
    return true;
  }
  // v1.11: archivos de código adjuntos -> van dentro del mensaje como bloque de código
  const codeItems = items.filter((i) => i.kind === "code");
  if (codeItems.length) {
    items = items.filter((i) => i.kind !== "code");
    text = codeItems.reduce((acc, c) => Tools.codeMessage(c.text, { name: c.name, lang: c.lang, task: "errores", detail: acc }), text);
  }
  // v1.11: foto + pedido de edición (quitar, cambiar fondo, poner pared, arrugas…) -> edición de imagen
  const editPhoto = items.length && items.every((i) => i.kind === "image") && Photo.looksLikePhotoEdit(text) ? items.find((i) => i.blob) : null;
  if (editPhoto) { currentJob = photoEditJob(text, items, editPhoto, { speak }); return true; }
  const codeMode = Code.looksLikeCode(text) || /\b(c[oó]digo|script|programa|funci[oó]n|bug|depur\w*|python|javascript|html|css|sql|java|c#)\b/i.test(text) && /\b(arregl\w*|corrig\w*|error(es)?|falla|revis\w*|escrib\w*|haga|hag[aá]me|cr[eé]e?\w*|explique)\b/i.test(text);
  const label = items.map((i) => (i.kind === "video" ? "[video]" : i.kind === "pdf" ? "[pdf]" : "[foto]")).join(" ");
  const prompt = text || (items.some((i) => i.kind === "pdf") ? DEFAULT_PDF_PROMPT
    : items.length && items.every((i) => i.kind === "video") ? DEFAULT_VIDEO_PROMPT : DEFAULT_MEDIA_PROMPT);
  // historial en texto; las fotos/videos recientes de esta sesión vuelven a ir para las preguntas de seguimiento
  const history = historyForModel(20);
  const facts = memory.getFacts();
  setVista("chat");
  renderUser(text, items.map((i) => ({ kind: i.kind, url: i.url, thumb: i.thumb, name: i.name, label: i.label })));
  const thumbsToKeep = items.map((i) => ({ kind: i.kind, thumb: i.thumb && i.thumb.length < 16000 ? i.thumb : "", ...(i.kind === "pdf" ? { name: String(i.name || "").slice(0, 80) } : {}) }));
  const saved = memory.addMessage("user", [label, prompt].filter(Boolean).join(" "), items.length ? { media: thumbsToKeep } : null);
  handleSave(saved, "el mensaje");
  if (items.length) rememberMedia(saved.id, items);
  const social = socialMode();
  currentJob = runJob({ text, items, prompt, history, facts, speak, userMsgId: saved.id, social, kind: codeMode ? "code" : undefined,
    extraSystem: [tutorMode ? Robotics.TUTOR_SYSTEM : "", codeMode ? Code.CODE_RULES : "", social ? Social.socialRules(social) : "", opts.spoken ? SPOKEN_RULES : ""].filter(Boolean).join("\n\n") });
  return true;
}
// ---------- v1.17: agente con herramientas ----------
let pendingDanger = null;
function quickReply(userText, reply, opts = {}) {
  setVista("chat");
  renderUser(userText); handleSave(memory.addMessage("user", userText), "el mensaje");
  if (reply) {
    renderBot(reply); handleSave(memory.addMessage("assistant", reply), "la respuesta");
    if (opts.speak || wantsVoice() || (conv && conv.on)) voice.speak(reply);
  }
  try { if (panelOpen) renderPanel(); } catch { /* */ }
  refreshBrainCounts();
}
const agentDeps = {
  openSection: (s) => {
    if (s === "inicio") { if (panelOpen) hidePanelNow(); setVista("inicio"); return; }
    if (s === "ajustes") { els.openSettings?.click(); return; }
    if (["personal", "trabajo", "ocio", "herramientas"].includes(s)) showGroup(s); else showPanel(s);
  },
  endConversation: () => stopConv("Listo. Salgo del modo conversación."),
  setReplyMode: (m) => { config = { ...config, replyMode: m, speakReplies: m === "voz" }; memory.saveConfig(config); paintReplyMode(); },
  setVoice: ({ preset, velocidad } = {}) => {
    const next = { ...config };
    if (preset === "jarvis") Object.assign(next, { voiceURI: "", voiceRate: 0.95, voicePitch: 0.8 });
    if (typeof velocidad === "number" && velocidad > 0) next.voiceRate = Math.min(1.4, Math.max(0.6, velocidad));
    config = next; memory.saveConfig(config); applyVoicePrefs();
  },
  startDamas: (n) => { const l = newDamasGame(n); showPanel("damas"); return l; },
  clearHistory: () => { memory.clearHistory(); forgetSessionMedia(); els.messages.replaceChildren(); },
};
async function agentJob(text, opts) {
  if (busy) return;
  busy = true; abortCtrl = new AbortController(); setEstado("hablando");
  els.connSub.textContent = "Pensando…";
  let r;
  try {
    r = await client.askTools(text, historyForModel(12).map(({ role, content }) => ({ role, content })), memory.getFacts(), {
      functions: Agent.FUNCTIONS, extraSystem: Agent.agentSystem() + (opts.spoken || (conv && conv.on) ? "\n\n" + SPOKEN_RULES : ""), signal: abortCtrl.signal });
  } catch (e) { console.warn("Antares agente:", e); r = { ok: false }; }
  busy = false; abortCtrl = null;
  if (r.stopped) { setEstado(baseEstado()); showNote("Respuesta detenida."); return; }
  const calls = r.ok ? (r.calls || []) : [];
  if (!r.ok || calls.some((c) => c.name === "responder_normal") || (!calls.length && !r.text)) {
    // sin herramientas (modelo no las acepta, error o pregunta general): respuesta normal con streaming y búsqueda
    setEstado(baseEstado());
    if (sendMessage(text, [], { ...opts, noAgent: true })) await currentJob;
    return;
  }
  const says = [];
  if (!calls.length) says.push(r.text);
  let ended = false;
  for (const c of calls.slice(0, 5)) {
    try {
      const x = await Agent.execute(c, agentDeps);
      if (x.ask) pendingDanger = { call: c, until: Date.now() + 60000 };
      if (x.ended) ended = true;
      if (x.say) says.push(x.say);
    } catch (e) { console.warn("Antares herramienta:", c.name, e); says.push("No pude completar esa acción."); }
  }
  setEstado(baseEstado());
  const reply = says.join(" ").trim();
  if (ended) { setVista("chat"); renderUser(text); handleSave(memory.addMessage("user", text), "el mensaje"); return; }
  quickReply(text, reply, opts);
}

// ---------- v1.18: respuesta con el cerebro local ----------
async function localJob(text, opts = {}) {
  if (busy) return;
  const speak = !!opts.speak || !!(conv && conv.on);
  // confirmación hablada pendiente y acciones de la app (recordatorios, compras, bitácora): sin modelo, al instante
  if (pendingDanger) {
    const p = pendingDanger; pendingDanger = null;
    if (Date.now() < p.until && /^\s*(?:s[ií]|claro|confirmo|dale|h[aá]galo|de acuerdo|ok(?:ay)?|seguro|adelante)(?=$|[\s,.!¡])/i.test(text)) {
      const x = await Agent.execute(p.call, agentDeps, { confirmed: true }); quickReply(text, x.say || "Listo.", { speak }); return;
    }
  }
  const act = LB.parseAction(text);
  if (act && act.name === "_net") { quickReply(text, `Para ${act.args.what} necesito internet; el cerebro local no tiene esos datos. Cuando vuelva la conexión se lo consulto con Gemini.`, { speak }); return; }
  if (act) { try { const x = await Agent.execute(act, agentDeps); if (x.ask) pendingDanger = { call: act, until: Date.now() + 60000 }; quickReply(text, x.say || "Listo.", { speak }); } catch { quickReply(text, "No pude completar esa acción.", { speak }); } return; }
  const intent = localIntent(text);
  if (intent && intent !== "mail" && intent !== "digest") {
    try { await handleLocal(intent, text); if (speak || wantsVoice()) speakLastBot(); } catch (e) { console.warn("Antares local:", e); showNote("No pude completar eso.", { warn: true }); }
    return;
  }
  busy = true;
  const epoch = lockEpoch;
  abortCtrl = new AbortController();
  setVista("chat");
  renderUser(text);
  const history = historyForModel(8).map(({ role, content }) => ({ role, content: String(content || "").slice(0, 1200) }));
  handleSave(memory.addMessage("user", text), "el mensaje");
  setEstado("hablando"); updateComposer();
  const stream = createStreamingBubble();
  stream.bubble.classList.add("pending");
  stream.bubble.textContent = LB.isReady() ? "Pensando…" : LB.isDownloaded() ? "Despertando el cerebro local…" : "Descargando el cerebro local…";
  els.connSub.textContent = "Pensando (local)…";
  scrollToBottom(false);
  const off = LB.onState((st) => { if (st.phase === "loading" && stream.bubble.classList.contains("pending")) stream.bubble.textContent = `${st.text} ${Math.round(st.progress * 100)} %`; });
  try {
    if (!LB.isDownloaded() && !LB.isReady()) {
      off(); stream.wrap.remove();
      const reply = "El cerebro local aún no está descargado. Vaya a Ajustes › Cerebro y toque «Descargar cerebro local» (≈1,1 GB, con Wi-Fi).";
      renderBot(reply); handleSave(memory.addMessage("assistant", reply), "la respuesta");
      if (speak || wantsVoice()) voice.speak(reply);
      setEstado("reposo"); return;
    }
    const r = await LB.chat(text, {
      history, signal: abortCtrl.signal,
      system: LB.systemPrompt({ assistantName: assistantName(), userName: config.userName || "", facts: memory.getFacts().map((f) => (typeof f === "string" ? f : f.text || f.content || "")).filter(Boolean), spoken: !!opts.spoken || speak }),
      maxTokens: opts.spoken || speak ? 160 : 360,
      onChunk: (partial) => {
        Brain.chunk();
        const near = isNearBottom();
        if (stream.bubble.classList.contains("pending")) { stream.bubble.classList.remove("pending"); els.connSub.textContent = "Respondiendo (local)…"; }
        stream.bubble.textContent = partial;
        if (near) scrollToBottom(false);
      },
    });
    off(); stream.wrap.remove();
    if (epoch !== lockEpoch) return;
    if (r.stopped && !r.text) { showNote("Respuesta detenida."); return; }
    const reply = r.text || "No obtuve respuesta del cerebro local. Intente de nuevo.";
    const meta = `${(r.ms / 1000).toFixed(1).replace(".", ",")} s · ${LB.LABEL}${r.tps ? ` · ${r.tps.toFixed(1).replace(".", ",")} tok/s` : ""}${r.stopped ? " · detenida" : ""}`;
    const w = renderBot(reply, { meta, reply: true });
    w?.querySelector?.(".meta")?.classList.add("local");
    handleSave(memory.addMessage("assistant", reply), "la respuesta");
    announce(`${assistantName()}: ${reply}`);
    if (r.text && (wantsVoice() || speak) && !r.stopped) voice.speak(Code.hasFence(reply) ? Code.splitFences(reply).map((x) => (x.type === "text" ? x.text : " Le dejé el código en la pantalla. ")).join(" ") : reply);
  } catch (e) {
    off(); stream.wrap.remove();
    console.warn("Antares cerebro local:", e);
    if (epoch !== lockEpoch) return;
    const msg = LB.friendly(e);
    renderBot(msg); handleSave(memory.addMessage("assistant", msg), "la respuesta");
    if (speak || wantsVoice()) voice.speak(msg);
  } finally {
    busy = false; abortCtrl = null;
    setEstado(baseEstado()); updateComposer(); updateConn();
    setTimeout(maybeResumeWake, 50);
  }
}

// v1.17: reglas para turnos hablados (dictado del iPhone)
const SPOKEN_RULES = "Esta es una CONVERSACIÓN HABLADA: el mensaje del usuario viene del dictado por voz y su respuesta se leerá en voz alta. " +
  "Responda corto y natural, en 1 a 3 oraciones, sin listas, sin markdown, sin emojis ni enlaces. " +
  "Use el contexto de los mensajes anteriores para entender preguntas de seguimiento (por ejemplo «¿y mañana?»). " +
  "El dictado puede equivocarse: interprete con buena fe palabras mal reconocidas; si el texto no tiene sentido, pida amablemente que lo repita.";

// ---------- v1.11: herramientas desde el chat ----------
function openPhotoTool(item, instruction = "", mode = "ia") {
  if (!item || !item.blob) return false;
  Tools.openPhotoWith(item.blob, { name: item.name || "foto.jpg", instruction, mode })
    .then(() => showPanel("fotos"))
    .catch(() => chatNotice("No pude abrir esa foto en el editor."));
  return true;
}
// Sugerencia de herramientas locales según lo que pidió
function localPhotoTip(text) {
  const t = String(text || "").toLowerCase(), tips = [];
  if (/quit|borr|elimin|pared|fondo|cortina|tap/.test(t)) tips.push("con el pincel «Pintar color» puede cubrir la zona (por ejemplo, la cortina) con el color de la pared; use «Tomar color» para copiar el tono exacto");
  if (/arrug|alis|planch|suav|mancha|limpi/.test(t)) tips.push("con «Suavizar (arrugas)» pase el dedo sobre las arrugas para disimularlas");
  if (/luz|oscur|aclar|ilumin|mejor|brillo|color/.test(t)) tips.push("en «Ajustes» puede subir el brillo, el contraste y la calidez");
  if (/recort|endere|gir/.test(t)) tips.push("en «Ajustes» y «Recortar» puede girar, enderezar y recortar");
  return tips.length ? `Mientras tanto, en el editor ${tips.join("; ")}.` : "Mientras tanto puede usar el editor: recortar, ajustar la luz, pintar o suavizar zonas.";
}
async function photoEditJob(text, items, item, { speak = false } = {}) {
  setVista("chat");
  renderUser(text, items.map((i) => ({ kind: i.kind, url: i.url, thumb: i.thumb, name: i.name, label: i.label })));
  const thumbsToKeep = items.map((i) => ({ kind: i.kind, thumb: i.thumb && i.thumb.length < 16000 ? i.thumb : "" }));
  const saved = memory.addMessage("user", `${items.map(() => "[foto]").join(" ")} ${text}`, { media: thumbsToKeep });
  handleSave(saved, "el mensaje");
  rememberMedia(saved.id, items);
  busy = true;
  const epoch = lockEpoch, t0 = performance.now();
  abortCtrl = new AbortController();
  setEstado("hablando");
  updateComposer();
  const stream = createStreamingBubble();
  stream.bubble.classList.add("pending"); stream.bubble.textContent = "Editando la foto con IA…";
  els.connSub.textContent = "Editando la foto…";
  scrollToBottom(false);
  try {
    let blob = item.blob;
    try { // la foto se envía como JPG de máximo 1536 px (también convierte HEIC si el navegador puede)
      const c = await Photo.loadImage(blob);
      const k = Math.min(1, 1536 / Math.max(c.width, c.height));
      const o = Photo.canvas(Math.round(c.width * k), Math.round(c.height * k));
      o.getContext("2d").drawImage(c, 0, 0, o.width, o.height);
      blob = await Photo.toBlob(o, "image/jpeg", 0.9);
    } catch { /* se envía tal cual */ }
    const r = await Photo.aiEdit(config.geminiApiKey, blob, text, { signal: abortCtrl.signal, onStatus: (st) => { if (stream.bubble.isConnected) stream.bubble.textContent = st.replace(/^Editando con .*/, "Editando la foto con IA…"); } });
    stream.wrap.remove();
    if (epoch !== lockEpoch) return;
    if (r.ok) {
      const url = URL.createObjectURL(r.blob);
      let thumb = "";
      try { thumb = await Photo.thumbDataUrl(await Photo.loadImage(r.blob), 360); } catch { /* */ }
      const msg = "Listo, aquí está la foto editada. Revise que todo se vea bien; puede compararla, descargarla o seguir ajustándola en el editor.";
      const wrap = renderBot(msg, { media: [{ kind: "image", url }], meta: `${((performance.now() - t0) / 1000).toFixed(1).replace(".", ",")} s · ${r.model}`, reply: true });
      const name = (item.name || "foto").replace(/\.\w+$/, "") + "-editada." + (r.blob.type === "image/png" ? "png" : "jpg");
      addActions(wrap, [
        { label: "Guardar / compartir", run: () => Photo.shareOrDownload(r.blob, name) },
        { label: "Abrir en el editor", run: () => { Tools.openPhotoWith(r.blob, { name, mode: "ajustes" }).then(() => showPanel("fotos")); } },
        { label: "Ver original", run: () => openPhotoTool(item, text, "ia") },
      ]);
      handleSave(memory.addMessage("assistant", msg, { media: thumb && thumb.length < 60000 ? [{ kind: "image", thumb }] : null }), "la respuesta");
      announce(`${assistantName()}: ${msg}`);
      if (speak || wantsVoice()) voice.speak("Listo, aquí está la foto editada.");
    } else if (r.stopped) {
      showNote("Respuesta detenida.");
    } else {
      const why = String(r.text || "").replace(/\s*Mientras tanto[^.]*\.\s*$/, "").replace(/ o use las herramientas del editor/, "");
      const msg = `${r.title}. ${why} ${localPhotoTip(text)}`;
      const wrap = renderBot(msg, { reply: true });
      addActions(wrap, [{ label: "Abrir el editor de fotos", run: () => openPhotoTool(item, text, /quit|pared|fondo|cortina|arrug|alis|suav|borr/i.test(text) ? "pincel" : "ajustes") }]);
      handleSave(memory.addMessage("assistant", msg), "la respuesta");
      announce(`${assistantName()}: ${msg}`);
      if (speak || wantsVoice()) voice.speak(msg);
    }
  } catch (e) {
    if (stream.wrap.isConnected) stream.wrap.remove();
    if (epoch !== lockEpoch) return;
    if (e && e.name === "AbortError") showNote("Respuesta detenida.");
    else {
      const wrap = renderBot("No pude editar la foto por un error inesperado. " + localPhotoTip(text), { reply: true });
      addActions(wrap, [{ label: "Abrir el editor de fotos", run: () => openPhotoTool(item, text, "pincel") }]);
    }
  } finally {
    busy = false; abortCtrl = null;
    if (epoch === lockEpoch) setEstado(baseEstado());
    updateComposer();
    setTimeout(maybeResumeWake, 50);
  }
}

// ---------- v1.10: reacciones y stickers ----------
const socialMode = () => (config.socialOn === false ? null : config.socialFreq === "poco" ? "poco" : "normal");
function paintReactions(wrap, reactions) {
  Social.renderReactions(wrap, reactions, { botName: assistantName(), onMine: (w) => openReactions(w) });
}
function applyReaction(id, who, emoji, { animate = false } = {}) {
  if (!id) return;
  const r = memory.setReaction(id, who, emoji);
  if (!r.ok) { storageFullNote("No pude guardar la reacción"); return; }
  const wrap = els.messages.querySelector(`.msg[data-id="${CSS.escape(id)}"]`);
  if (!wrap) return;
  paintReactions(wrap, r.reactions);
  if (animate) { const pill = wrap.querySelector(".react-pill.from-bot"); if (pill) pill.classList.add("pop"); }
}
function openReactions(wrap, back = null) {
  if (!socialMode() || !wrap || !wrap.dataset.id || !isUnlocked()) return;
  const m = memory.getMessage(wrap.dataset.id);
  if (!m) return;
  const bubble = wrap.querySelector(":scope > .bubble");
  Social.openReactBar(wrap, (m.reactions && m.reactions.u) || null, (emoji) => {
    applyReaction(wrap.dataset.id, "u", emoji);
    announce(emoji ? `Reaccionó con ${Social.reaction(emoji).label}` : "Reacción quitada");
  }, { returnFocus: back || bubble });
}
// tocar (o mantener presionado) un mensaje abre la barra de reacciones; enlaces, botones y fotos siguen igual
els.messages.addEventListener("click", (ev) => {
  if (ev.target.closest(".react-bar, .react-pill, a, button, input, textarea, .media-grid, .media-item")) return;
  const bubble = ev.target.closest(".msg > .bubble, .msg > .sticker");
  if (!bubble || bubble.classList.contains("streaming") || bubble.classList.contains("pending")) return;
  if (String(getSelection && getSelection()).length) return; // seleccionando texto
  const wrap = bubble.parentElement;
  if (wrap.querySelector(":scope > .react-bar")) { Social.closeReactBar(); return; }
  openReactions(wrap, bubble);
});
els.messages.addEventListener("contextmenu", (ev) => {
  const bubble = ev.target.closest(".msg > .bubble, .msg > .sticker");
  if (!bubble || !socialMode() || ev.target.closest("a, img, video")) return;
  ev.preventDefault();
  openReactions(bubble.parentElement, bubble);
});
els.messages.addEventListener("keydown", (ev) => {
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".msg > .bubble[tabindex]")) { ev.preventDefault(); openReactions(ev.target.parentElement, ev.target); }
});
document.addEventListener("click", (ev) => { if (!ev.target.closest(".react-bar, .msg")) Social.closeReactBar(); });
// burbujas con id: se pueden enfocar con el teclado para reaccionar
new MutationObserver(() => {
  const on = !!socialMode();
  for (const b of els.messages.querySelectorAll(".msg[data-id] > .bubble:not([tabindex])")) if (on) { b.tabIndex = 0; b.setAttribute("aria-describedby", "react-hint"); }
}).observe(els.messages, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-id"] });

// Selector de stickers
function buildStickerMenu() {
  for (const s of Social.STICKERS) {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "menuitem"); b.dataset.sticker = s.id;
    b.setAttribute("aria-label", `Enviar sticker: ${s.label}`);
    b.innerHTML = Social.stickerSvg(s.id);
    els.stickerMenu.appendChild(b);
  }
}
function setStickerMenu(open) {
  els.stickerMenu.hidden = !open;
  els.stickerBtn.setAttribute("aria-expanded", String(open));
  if (open) { setMenu(false); els.stickerMenu.querySelector("button").focus(); }
}
els.stickerBtn.addEventListener("click", () => setStickerMenu(els.stickerMenu.hidden));
els.stickerMenu.addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-sticker]");
  if (!b) return;
  setStickerMenu(false);
  sendSticker(b.dataset.sticker);
});
els.stickerMenu.addEventListener("keydown", (ev) => {
  const btns = [...els.stickerMenu.querySelectorAll("button")];
  const i = btns.indexOf(document.activeElement);
  if (ev.key === "Escape") { setStickerMenu(false); els.stickerBtn.focus(); }
  else if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(ev.key)) {
    ev.preventDefault();
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[ev.key];
    btns[(i + d + btns.length) % btns.length].focus();
  }
});
document.addEventListener("click", (ev) => {
  if (!els.stickerMenu.hidden && !els.stickerMenu.contains(ev.target) && !els.stickerBtn.contains(ev.target)) setStickerMenu(false);
});
function sendSticker(id) {
  const st = Social.sticker(id);
  if (!st || !isUnlocked()) return false;
  if (busy) { chatNotice("Espere a que termine la respuesta."); return false; }
  if (!client.isConfigured()) { setEstado("sinkey"); return false; }
  const history = historyForModel(20);
  const facts = memory.getFacts();
  setVista("chat");
  renderUser("", null, { sticker: st.id });
  const saved = memory.addMessage("user", `[sticker:${st.id}]`, { sticker: st.id });
  handleSave(saved, "el sticker");
  const social = socialMode() || "poco";
  currentJob = runJob({ text: "", items: [], prompt: Social.stickerPrompt(st), history, facts, userMsgId: saved.id, social, kind: "sticker",
    extraSystem: [tutorMode ? Robotics.TUTOR_SYSTEM : "", Social.socialRules(social)].filter(Boolean).join("\n\n") });
  return true;
}
els.socialOn.addEventListener("change", () => { els.socialFreq.disabled = !els.socialOn.checked; });
function applySocial() {
  const on = !!socialMode();
  body.classList.toggle("no-social", !on);
  els.stickerBtn.hidden = !on;
  if (!on) { setStickerMenu(false); Social.closeReactBar(); }
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
els.input.addEventListener("focus", () => { scrollToBottom(false); setTimeout(() => scrollToBottom(false), 350); });

// Detener la respuesta en curso
function stopResponse() {
  voice.stop();
  if (abortCtrl) abortCtrl.abort();
}
els.stop.addEventListener("click", stopResponse);

// ---------- v1.16: Modo conversación (manos libres: escuchar → enviar → hablar → volver a escuchar) ----------
var conv = { on: false, lastHeard: 0, fails: 0, timer: null, turn: 0 };
const CONV_EXIT = /^\s*(?:listo|adi[oó]s|terminar|termina|termine|salir|salga|ya terminamos|eso es todo|hasta luego|chao|chau)\b[\s.!¡]*$/i;
const CONV_START = /\bmodo (?:de )?conversaci[oó]n\b/i;
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
function paintConv() {
  const pill = $("conv-pill"); if (pill) pill.hidden = !conv.on;
  document.body.classList.toggle("conv-on", conv.on);
  updateMic();
}
function startConv() {
  voice.unlock(); // dentro del toque: habilita la voz en iPhone
  if (conv.on) return;
  if (!client || !client.isConfigured()) { setVista("chat"); showNote("Primero configure su API key para conversar.", { warn: true }); return; }
  if (!voice.canListen) {
    setVista("chat");
    showNote(isIOS() && isStandalone()
      ? "En la app instalada del iPhone el dictado no está disponible. Abra Antares en Safari (misma dirección) para el modo conversación, o use el micrófono del teclado."
      : "Este navegador no permite dictado por voz. Pruebe con Chrome o Safari.", { warn: true });
    return;
  }
  if (panelOpen) hidePanelNow();
  conv.on = true; conv.fails = 0; conv.lastHeard = Date.now(); conv.turn++;
  if (wake && wake.enabled) wake.pause("conversacion");
  paintConv();
  chatNotice("Conversación activa");
  const t = conv.turn;
  voice.speak("Modo conversación. Le escucho.").finally(() => { if (conv.on && conv.turn === t) convListen(250); });
}
function stopConv(say = "") {
  if (!conv.on) return;
  conv.on = false; conv.turn++; clearTimeout(conv.timer);
  voice.cancelListening();
  els.interimText.textContent = "";
  if (estado === "escuchando") setEstado(baseEstado());
  paintConv();
  chatNotice("Conversación terminada");
  if (say) voice.speak(say).finally(() => setTimeout(maybeResumeWake, 500)); else setTimeout(maybeResumeWake, 500);
}
function convListen(delay = 600) {
  clearTimeout(conv.timer);
  const t = conv.turn;
  conv.timer = setTimeout(() => {
    if (!conv.on || conv.turn !== t) return;
    if (busy || voice.speaking) { convListen(300); return; } // espera a que termine de responder/hablar
    // v1.17: respiro tras la voz (el altavoz del iPhone sigue sonando un instante y el micrófono lo oía)
    const since = Date.now() - (voice.lastSpokeEnd || 0);
    if (since < 900) { convListen(900 - since); return; }
    if (voice.listening) return;
    if (Date.now() - conv.lastHeard > 30000) { stopConv("No le escuché. Salgo del modo conversación."); return; }
    voice.listen({
      lang: config.speechLang || "es-CR",
      silenceMs: isIOS() ? 1900 : 1700, // v1.17: 1,2 s lo cortaba a media frase
      onState: (on) => { if (!conv.on) return; if (on) { els.interimText.textContent = "Le escucho…"; setEstado("escuchando"); } else if (estado === "escuchando") setEstado(baseEstado()); },
      onInterim: (txt) => { conv.lastHeard = Date.now(); els.interimText.textContent = txt ? `“${txt}` : "Le escucho…"; },
      onFinal: (txt) => { if (conv.on && conv.turn === t) convHandle(txt); },
      onEnd: ({ heard, error }) => {
        if (!conv.on || conv.turn !== t || heard) return;
        // sin voz o error pasajero (iOS instalado es inestable): reintentar con espera creciente
        conv.fails = error && error !== "no-speech" ? conv.fails + 1 : 0;
        if (conv.fails >= 6) { stopConv(); setVista("chat"); showNote(isIOS() && isStandalone() ? "El dictado se cortó varias veces en la app instalada. Abra Antares en Safari para conversar sin tocar." : "El dictado se cortó varias veces. Toque el micrófono para seguir.", { warn: true }); return; }
        convListen(Math.min(3000, 250 + conv.fails * 500));
      },
      onError: (code, msg) => { stopConv(); if (msg) { setVista("chat"); showNote(msg, { warn: true }); } },
    });
  }, delay);
}
function convHandle(text) {
  conv.lastHeard = Date.now(); conv.fails = 0;
  els.interimText.textContent = "";
  const t = text.trim();
  const nt = t.toLowerCase();
  // v1.17: descartar eco de su propia voz, repeticiones del turno anterior y turnos que se cruzan
  if (voice.isEcho(t)) { console.info("Antares: eco descartado:", t); convListen(400); return; }
  if (conv.lastSent && conv.lastSent.text === nt && Date.now() - conv.lastSent.at < 15000) { convListen(400); return; }
  if (busy) { convListen(500); return; }
  conv.lastSent = { text: nt, at: Date.now() };
  if (CONV_EXIT.test(t)) { stopConv("Listo. Salgo del modo conversación."); return; }
  if (/^(?:silencio|c[aá]llese|c[aá]llate|basta)\b/i.test(t)) { voice.stop(); convListen(400); return; }
  if (!sendMessage(t, [], { speak: true, spoken: true })) { stopConv(); return; }
  // al terminar la respuesta y la voz, vuelve a escuchar (con un respiro para no oírse a sí mismo)
  Promise.resolve(currentJob).finally(() => convListen(700));
}
$("conv-exit")?.addEventListener("click", () => stopConv());
$("conv-start")?.addEventListener("click", () => startConv());
$("conv-start-settings")?.addEventListener("click", () => { closeSettingsIfOpen(); startConv(); });
function closeSettingsIfOpen() { if (!els.settingsView.hidden) { const back = $("close-settings") || document.querySelector("#settings-view .back, #settings-view [data-close]"); if (back) back.click(); } }
// pulsación larga en el micrófono = modo conversación
{
  let lp = null, longFired = false;
  els.mic.addEventListener("pointerdown", () => { longFired = false; clearTimeout(lp); lp = setTimeout(() => { longFired = true; if (navigator.vibrate) navigator.vibrate(30); conv.on ? stopConv() : startConv(); }, 650); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((e) => els.mic.addEventListener(e, () => clearTimeout(lp)));
  els.mic.addEventListener("click", (ev) => { if (longFired) { longFired = false; ev.stopImmediatePropagation(); } }, true);
  els.mic.addEventListener("contextmenu", (ev) => ev.preventDefault());
}
// tocar el cerebro durante la conversación: si habla, lo interrumpe y escucha; si no, sale
document.querySelector("#stage .reactor-wrap")?.addEventListener("click", () => { if (conv.on) convTap(); });
function convTap() {
  voice.unlock();
  if (voice.speaking) { voice.stop(); convListen(200); return; }
  if (busy) { stopResponse(); stopConv(); return; }
  stopConv();
}

// ---------- Micrófono ----------
els.mic.addEventListener("click", () => {
  voice.unlock();
  if (conv.on) { convTap(); return; }
  if (estado === "hablando") { stopResponse(); return; }
  if (voice.speaking) { voice.stop(); return; } // callar la lectura en voz alta
  if (!voice.canListen) { showNote("Este navegador no permite dictado por voz. Use el micrófono del teclado.", { warn: true }); setVista("chat"); return; }
  if (busy) return;
  if (wake && wake.enabled && !voice.listening) wake.pause("dictado");
  voice.listen({
    lang: config.speechLang || "es-CR",
    onState: (on) => {
      if (on) { els.interimText.textContent = ""; setEstado("escuchando"); }
      else { if (estado === "escuchando") setEstado(baseEstado()); setTimeout(maybeResumeWake, 300); }
    },
    onInterim: (t) => { els.interimText.textContent = t ? `“${t}` : ""; },
    onFinal: (t) => { els.interimText.textContent = ""; if (CONV_START.test(t) && t.length < 40) { startConv(); return; } sendMessage(t, [], { speak: micSpeaks(), spoken: true }); },
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
      if (a.kind === "pdf" || a.kind === "code") {
        const chip = document.createElement("span");
        chip.className = "pdf-chip" + (a.kind === "code" ? " code-chip" : ""); chip.textContent = (a.name || "PDF").slice(0, 18);
        box.appendChild(chip);
      } else if (a.thumb || (a.kind === "image" && a.url)) {
        const img = document.createElement("img");
        img.src = a.thumb || a.url; img.alt = a.kind === "video" ? "Video adjunto" : "Foto adjunta";
        box.appendChild(img);
      } else {
        // HEIC u otra foto que el navegador no puede mostrar: se envía igual, con una etiqueta
        const chip = document.createElement("span");
        chip.className = "pdf-chip img-chip"; chip.dataset.label = a.kind === "video" ? "VIDEO" : a.label || "FOTO";
        chip.textContent = formatBytes(a.size);
        chip.title = a.name || "";
        box.appendChild(chip);
      }
      if (a.kind === "video") {
        const bd = document.createElement("span"); bd.className = "badge"; bd.textContent = "▶ " + formatBytes(a.size);
        box.appendChild(bd);
      }
    }
    const rm = document.createElement("button");
    rm.type = "button"; rm.className = "rm"; rm.setAttribute("aria-label", a.kind === "video" ? "Quitar el video" : a.kind === "code" ? `Quitar ${a.name || "el archivo"}` : a.kind === "pdf" ? "Quitar el documento" : "Quitar la foto");
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
  let files = [...(fileList || [])];
  if (!files.length) return;
  // v1.11: hojas de cálculo -> herramienta Excel (con el texto escrito como pregunta)
  const sheets = files.filter((f) => Sheet.isSheetName(f.name));
  if (sheets.length) {
    files = files.filter((f) => !sheets.includes(f));
    const q = els.input.value.trim();
    Tools.openSheetWith(sheets[0], q).then((ok) => { if (ok && q) { els.input.value = ""; autosize(); } showPanel("excel"); });
    if (!files.length) return;
  }
  // archivos de código -> se adjuntan como texto y van dentro del mensaje
  const codeFiles = files.filter((f) => Code.langFromName(f.name) && !/^(image|video)\//.test(f.type) && !/\.pdf$/i.test(f.name));
  if (codeFiles.length) {
    files = files.filter((f) => !codeFiles.includes(f));
    for (const f of codeFiles) {
      if (attachments.length >= MAX_ATTACHMENTS) break;
      const r = await Tools.readCodeFile(f);
      if (!r.ok) { setVista("chat"); showNote(`No pude usar "${f.name}": ${r.error.replace(/^[A-Z]/, (c) => c.toLowerCase())}`, { warn: true }); continue; }
      attachments.push({ kind: "code", name: r.name, text: r.text, lang: r.lang, size: f.size });
    }
    renderAttachments();
    if (!files.length) return;
  }
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
      const msg = String(e.message || e);
      // los errores del navegador vienen en inglés: se muestra un mensaje claro en español
      const es = /[áéíóúñ¿]|^(la|el|este|solo|pruebe)\b/i.test(msg) ? msg : "no pude abrir ese archivo (formato no compatible o archivo dañado). Pruebe con una foto JPG o PNG.";
      showNote(`No pude usar "${f.name || "el archivo"}": ${es.replace(/^[A-ZÁÉÍÓÚ]/, (c) => c.toLowerCase())}`, { warn: true });
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
const pickers = { photo: els.pickPhoto, video: els.pickVideo, gallery: els.pickGallery, pdf: els.pickPdf, file: els.pickFile };
els.attachMenu.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-pick]");
  if (!btn) return;
  setMenu(false);
  expectAway(AWAY_PICKER_MS); // v1.9.1: margen corto (antes 3 min)
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

// ---------- Pestañas (Inicio · Personal · Trabajo · Ocio) y paneles ----------
// Historial: una sola entrada para los paneles ({ antares: "panel", group, tab }); la vista se dibuja siempre al
// instante y el historial solo se ajusta. Atrás: panel → portada de su pestaña → Inicio (botón de la app y del sistema).
let panelOpen = false;
let panelPushed = false;   // hay una entrada de historial de paneles
let skipPops = 0;          // retrocesos hechos por la propia app (la vista ya se dibujó)
let histQueue = [];        // cambios de historial esperando a que termine un retroceso
function histDo(fn) { if (skipPops > 0) histQueue.push(fn); else { try { fn(); } catch { /* */ } } }
function syncHistory() {
  histDo(() => {
    if (!panelOpen) return;
    if (panelPushed) history.replaceState(navState(), "");
    else { history.pushState(navState(), ""); panelPushed = true; }
  });
}
const PANEL_NAME = { noticias: "Resumen del día", recordatorios: "Recordatorios", compras: "Compras", rutas: "Rutas", cubica: "Cúbica", correo: "Correo", bitacora: "Bitácora", damas: "Damas", trivia: "Trivia", robotica: "Robótica", fotos: "Fotos", codigo: "Código", excel: "Excel" };
function markTab(section) {
  els.tabbar.querySelectorAll(".tab").forEach((t) => { if (t.dataset.section === section) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
}
function paintPanelHeader(focus = true) {
  const v = currentView();
  els.panelTitle.textContent = v.landing ? GROUP_LABEL[v.group].toUpperCase() : (PANEL_NAME[v.tab] || "").toUpperCase();
  els.closePanel.setAttribute("aria-label", v.landing ? "Volver al inicio" : `Volver a ${GROUP_LABEL[v.group]}`);
  els.panelView.dataset.tabGroup = v.group;
  markTab(v.group);
  if (focus) els.panelTitle.focus({ preventScroll: true });
}
function navState() { const v = currentView(); return { antares: "panel", group: v.group, tab: v.tab }; }
function enterPanelView() {
  if (!els.settingsView.hidden) closeSettings();
  if (!els.settingsView.hidden) return false; // canceló por cambios sin guardar
  if (document.activeElement === els.input) els.input.blur();
  els.chatView.hidden = true;
  els.panelView.hidden = false;
  panelOpen = true;
  return true;
}
// abre un panel concreto (desde la portada, el chat, ?panel= o el service worker)
function showPanel(name) {
  if (!isUnlocked()) return;
  if (!enterPanelView()) return;
  openPanel(name);
  paintPanelHeader();
  syncHistory();
}
// abre la portada de una pestaña
function showGroup(group) {
  if (!isUnlocked()) return;
  if (!enterPanelView()) return;
  openGroup(group);
  paintPanelHeader();
  syncHistory();
}
function selectTab(section) {
  if (section === "inicio") { if (panelOpen) goHome(); else setVista("inicio"); return; }
  showGroup(section);
}
window.addEventListener("popstate", (ev) => {
  const st = ev.state && ev.state.antares === "panel" ? ev.state : null;
  if (skipPops > 0) {
    if (--skipPops === 0) { const q = histQueue; histQueue = []; q.forEach((fn) => { try { fn(); } catch { /* */ } }); }
    return;
  }
  if (st) { // adelante del navegador hacia un panel: solo si los paneles siguen abiertos
    if (panelOpen) { panelPushed = true; if (st.tab) openPanel(st.tab); else openGroup(st.group); paintPanelHeader(); }
    return;
  }
  panelPushed = false;
  if (!panelOpen) return;
  // Atrás del sistema: desde un panel vuelve a la portada de su pestaña; desde la portada, a Inicio
  const v = currentView();
  if (!v.landing) { openGroup(v.group); paintPanelHeader(); syncHistory(); return; }
  hidePanel();
});
function hidePanel() {
  if (!panelOpen && els.panelView.hidden) { if (els.panelRoot) els.panelRoot.replaceChildren(); return; }
  els.panelView.hidden = true;
  els.panelRoot.replaceChildren();
  if (els.settingsView.hidden) els.chatView.hidden = false;
  panelOpen = false;
  markTab("inicio");
  const t = $("tab-inicio");
  if (t && t.offsetParent) t.focus({ preventScroll: true });
}
// vuelve a Inicio desde cualquier nivel de paneles
function goHome() {
  hidePanel();
  if (panelPushed) {
    panelPushed = false; skipPops++;
    try { history.back(); } catch { skipPops--; }
    // si el navegador no avisa el retroceso, no dejar el historial en espera
    setTimeout(() => { if (skipPops > 0) { skipPops = 0; const q = histQueue; histQueue = []; q.forEach((fn) => { try { fn(); } catch { /* */ } }); } }, 1200);
  }
}
els.closePanel.addEventListener("click", () => {
  const v = currentView();
  if (v.landing) { goHome(); return; }
  showGroup(v.group); // en un panel: volver a la portada de su pestaña
});
els.tabbar.addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-section]");
  if (b) selectTab(b.dataset.section);
});
// navegación dentro de los paneles (tarjeta de la portada o pestaña interna)
function onPanelNav(v) { paintPanelHeader(v.from === "landing"); syncHistory(); }
initPanels(els.panelRoot, (what) => { if (what === "reminders" || what === "notify") syncReminders(); }, {
  hasKey: () => !!(client && client.isConfigured()),
  download: (name, text, type) => downloadFile(name, text, type),
  // redacción de correos desde el panel: misma conexión con Gemini, se descarta si se bloquea a mitad
  ask: async (prompt, { signal, onChunk } = {}) => {
    const epoch = lockEpoch;
    const r = await client.ask(prompt, [], memory.getFacts(), { signal, onChunk });
    return epoch === lockEpoch ? r : { ok: false, stopped: true };
  },
}, {
  hasKey: () => !!(client && client.isConfigured()),
  // trivia: preguntas en JSON y su verificación; se descarta si se bloquea a mitad
  askJson: async (system, content, { signal } = {}) => {
    const epoch = lockEpoch;
    const r = await client.askJson(system, content, { signal });
    return epoch === lockEpoch ? r : { ok: false, stopped: true };
  },
  askTutor: (q) => {
    if (!client.isConfigured()) { hidePanelNow(); setEstado("sinkey"); return; }
    setTutor(true, { note: false });
    hidePanelNow();
    if (busy) { chatNotice("Espere a que termine la respuesta en curso."); return; }
    sendMessage(q);
  },
  setTutor: (on) => { setTutor(on); hidePanelNow(); },
}, onPanelNav, {
  hasKey: () => !!(client && client.isConfigured()),
  getKey: () => (isUnlocked() && config ? config.geminiApiKey || "" : ""),
  // Excel: plan de operaciones en JSON; se descarta si se bloquea a mitad
  askJson: async (system, content, { signal } = {}) => {
    const epoch = lockEpoch;
    const r = await client.askJson(system, content, { signal, maxTokens: 3072 });
    return epoch === lockEpoch ? r : { ok: false, stopped: true };
  },
  // Código: se envía al chat como mensaje (con las reglas del modo programación)
  sendCode: (msg) => {
    if (!client.isConfigured()) { hidePanelNow(); setEstado("sinkey"); return; }
    if (busy) { chatNotice("Espere a que termine la respuesta en curso."); return; }
    hidePanelNow();
    sendMessage(msg);
  },
});
function hidePanelNow() { goHome(); setVista("chat"); }

// ---------- Modo tutor de robótica ----------
function setTutor(on, { note = true } = {}) {
  tutorMode = !!on;
  els.tutorChip.hidden = !tutorMode;
  body.classList.toggle("tutor", tutorMode);
  updateComposer();
  if (note) {
    setVista("chat");
    showNote(tutorMode ? "Modo tutor de robótica activado: sus preguntas van al tutor. Toque «Salir» para volver al asistente normal." : "Salió del modo tutor de robótica.");
  }
}
els.tutorExit.addEventListener("click", () => setTutor(false));

// Botones pequeños bajo una respuesta (copiar, abrir panel…)
function addActions(wrap, actions) {
  if (!wrap) return;
  const row = document.createElement("div");
  row.className = "msg-actions";
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "mini-btn"; b.textContent = a.label;
    b.onclick = async () => { const r = await a.run(); if (a.done && r !== false) { b.textContent = a.done; setTimeout(() => { b.textContent = a.label; }, 1500); } };
    row.appendChild(b);
  }
  wrap.appendChild(row);
}
async function copyText(text) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { ok = document.execCommand("copy"); } catch { /* */ } ta.remove();
  }
  chatNotice(ok ? "Copiado" : "No pude copiar; mantenga presionado el texto.");
  return ok;
}
function addMailActions(wrap, text) {
  const d = Mail.parseDraft(text);
  addActions(wrap, [
    { label: "Copiar asunto", run: () => copyText(d.subject), done: "Copiado" },
    { label: "Copiar cuerpo", run: () => copyText(d.body), done: "Copiado" },
    { label: "Copiar todo", run: () => copyText(`Asunto: ${d.subject}\n\n${d.body}`), done: "Copiado" },
  ]);
}

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


// ---------- Modos: «Hey Antares», conducción y tamaño de letra ----------
function applyModes() {
  body.classList.toggle("driving", !!config.drivingMode);
  els.driveBtn.setAttribute("aria-pressed", String(!!config.drivingMode));
  els.driveLabel.textContent = config.drivingMode ? "Conducción: sí" : "Conducción";
  document.documentElement.dataset.fs = String(config.fontSize || 1);
  paintWake();
  applySocial();
}
function saveModes() {
  const r = memory.saveConfig(config);
  if (r && r.ok === false) storageFullNote("No pude guardar el cambio");
}
els.driveBtn.addEventListener("click", () => {
  voice.unlock();
  config.drivingMode = !config.drivingMode;
  saveModes(); applyModes();
  const msg = config.drivingMode
    ? "Modo conducción activado: botones grandes y respuestas en voz alta." + (voice.canListen && !config.wakeWord ? " Si quiere usarme sin tocar, active «Hey Antares»." : "")
    : "Modo conducción desactivado.";
  announce(msg);
  chatNotice(config.drivingMode ? "Modo conducción activado" : "Modo conducción desactivado");
  if (config.drivingMode) voice.speak(config.wakeWord ? "Modo conducción activado. Diga «Antares» y su pregunta." : "Modo conducción activado.");
});

function wakeNoteText() {
  if (!voice.canListen) return "Este navegador no permite la escucha por voz. «Hey Antares» funciona con la app abierta en Chrome para Android (también en Chrome de computadora).";
  if (isIOS()) return "En iPhone funciona solo con Antares abierto y la pantalla encendida, y Safari puede cortar la escucha; para manos libres es mejor Chrome en Android. Se pausa al bloquear, al cambiar de app o mientras Antares habla.";
  return "Solo funciona con Antares abierto y en pantalla: se pausa al bloquear, al cambiar de app o mientras Antares habla. Funciona mejor en Chrome para Android.";
}
const WAKE_TEXT = { off: "Hey Antares", listening: "Escuchando «Antares»", command: "Le escucho…", paused: "Hey Antares · en pausa", idle: "En pausa: toque para seguir", error: "Hey Antares" };
function paintWake() {
  const st = config.wakeWord ? (wake ? wake.state : "paused") : "off";
  const shown = st === "off" && config.wakeWord ? "paused" : st;
  els.wakeBtn.dataset.state = shown;
  els.wakeBtn.setAttribute("aria-pressed", String(!!config.wakeWord));
  els.wakeLabel.textContent = WAKE_TEXT[shown] || WAKE_TEXT.off;
  // línea visible solo cuando "Hey Antares" está activo (el botón es un icono)
  els.wakeStatus.textContent = shown === "off" || shown === "error" ? "" : (WAKE_TEXT[shown] || "");
  body.dataset.wake = shown;
}
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  } catch { /* sin sonido */ }
}
function wakeAllowed() {
  return !!config.wakeWord && voice.canListen && isUnlocked() && !lockShowing() && document.visibilityState === "visible";
}
// Arranca, pausa o reanuda la escucha según el estado de la app
function syncWake() {
  if (!wakeAllowed()) { if (wake && wake.enabled && !config.wakeWord) wake.stop("off"); paintWake(); return; }
  if (!wake || (!wake.enabled && wake.state !== "idle")) startWake();
  else maybeResumeWake();
  paintWake();
}
function startWake() {
  if (wake) wake.stop("off");
  wake = new WakeWord({
    SR: voice.SR, lang: config.speechLang || "es-CR", name: assistantName(),
    idleMs: (Number(config.wakeIdleMin) || 10) * 60 * 1000,
    onState: (st, info) => {
      if (st !== "command" && estado === "escuchando" && !voice.listening) { els.interimText.textContent = ""; setEstado(baseEstado()); }
      if (st === "idle") { chatNotice("«Hey Antares» en pausa"); showNote(`«Hey Antares» en pausa: no me llamó en ${Number(config.wakeIdleMin) || 10} minutos y dejé de escuchar para ahorrar batería. Toque el botón para seguir.`); }
      paintWake();
    },
    onWake: () => {
      chime();
      if (panelOpen) hidePanelNow();
      els.interimText.textContent = "Le escucho…";
      if (estado !== "hablando") setEstado("escuchando");
    },
    onInterim: (t) => { if (estado === "escuchando" && !voice.listening) els.interimText.textContent = t ? `“${t}` : "Le escucho…"; },
    onCommand: handleWakeCommand,
    onError: (code) => {
      config.wakeWord = false; saveModes(); paintWake();
      setVista("chat");
      showNote(code === "unsupported" ? wakeNoteText() : (speechErrorMessage(code) || "No pude activar la escucha.") + " Desactivé «Hey Antares».", { warn: true });
    },
  });
  wake.start();
  if (busy || voice.speaking || voice.listening || !els.settingsView.hidden) wake.pause("ocupado");
}
function maybeResumeWake() {
  if (!wake || !wake.enabled || !wake.paused) return;
  if (conv.on || busy || voice.speaking || voice.listening || !wakeAllowed() || !els.settingsView.hidden) return;
  wake.resume();
  paintWake();
}
function handleWakeCommand(text) {
  els.interimText.textContent = "";
  if (estado === "escuchando" && !voice.listening) setEstado(baseEstado());
  const t = text.trim();
  if (/^(?:silencio|c[aá]llese|c[aá]llate|basta|pare|det[eé]ngase|detente)\b/i.test(t)) { stopResponse(); return; }
  if (/\b(?:deje de escuchar|desactive (?:el )?modo hey|apague (?:el )?(?:micr[oó]fono|modo hey))\b/i.test(t)) {
    config.wakeWord = false; saveModes(); if (wake) wake.stop("off"); paintWake();
    showNote("Desactivé «Hey Antares». Puede volver a activarlo con el botón."); voice.speak("Listo, dejé de escuchar.");
    return;
  }
  if (busy) { chatNotice("Espere a que termine la respuesta en curso."); return; }
  if (CONV_START.test(t) && t.length < 40) { startConv(); return; }
  if (panelOpen) hidePanelNow();
  if (!els.settingsView.hidden) return;
  if (wake) wake.pause("respondiendo");
  if (!sendMessage(t, [], { speak: micSpeaks(), spoken: true })) { setVista("chat"); if (!client.isConfigured()) voice.speak("Primero configure su API key."); setTimeout(maybeResumeWake, 600); return; }
  Promise.resolve(currentJob).finally(() => setTimeout(maybeResumeWake, 300));
}
voice.onWord = () => Brain.word();
voice.onAudio = (on) => { Brain.setSpeaking(on); voiceAudible = !!on; try { Hud.setHudSpeaking(on); paintPresence(); } catch { /* */ } }; // v1.15: el cerebro sigue el sonido real (onstart/onboundary/onend)
voice.onSpeaking = (on) => {
  const sv = document.getElementById("stop-voice"); if (sv) sv.hidden = !on;
  if (!on) { Brain.setSpeaking(false); voiceAudible = false; try { Hud.setHudSpeaking(false); paintPresence(); } catch { /* */ } }
  updateMic();
  if (on) { if (wake && wake.enabled) wake.pause("hablando"); }
  else setTimeout(maybeResumeWake, 500); // pequeña espera para no oír el final de su propia voz
};
els.wakeBtn.addEventListener("click", () => {
  voice.unlock();
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume && audioCtx.resume(); } catch { /* */ }
  if (config.wakeWord && wake && wake.state === "idle") { startWake(); paintWake(); chatNotice("Sigo escuchando"); return; }
  if (!config.wakeWord && !voice.canListen) { setVista("chat"); showNote(wakeNoteText(), { warn: true }); return; }
  config.wakeWord = !config.wakeWord;
  saveModes();
  if (config.wakeWord) {
    syncWake();
    const msg = "«Hey Antares» activado: diga «Antares» y su pregunta. Solo escucho con la app abierta.";
    chatNotice("«Hey Antares» activado");
    announce(msg);
    if (isIOS()) { setVista("chat"); showNote(wakeNoteText(), { warn: true }); }
  } else {
    if (wake) wake.stop("off");
    paintWake();
    chatNotice("«Hey Antares» desactivado.");
  }
});

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
    speakReplies: els.replyModeSel ? els.replyModeSel.value === "voz" : els.speakReplies.checked,
    replyMode: els.replyModeSel ? els.replyModeSel.value : replyMode(),
    voiceURI: els.voiceSel ? els.voiceSel.value : (config.voiceURI || ""),
    voiceRate: els.voiceRate ? Number(els.voiceRate.value) : 0.95,
    voicePitch: els.voicePitch ? Number(els.voicePitch.value) : 0.8,
    speechLang: els.speechLang.value,
    webSearch: els.webSearch.checked,
    autoLearn: els.autoLearn.checked,
    wakeWord: els.wakeWord.checked,
    wakeIdleMin: Number(els.wakeIdle.value) || 10,
    drivingMode: els.drivingMode.checked,
    fontSize: Number(els.fontSize.value) || 1,
    socialOn: els.socialOn.checked,
    socialFreq: els.socialFreq.value === "poco" ? "poco" : "normal",
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
  if (els.replyModeSel) els.replyModeSel.value = replyMode();
  fillVoiceList();
  if (els.voiceRate) { els.voiceRate.value = String(config.voiceRate ?? 0.95); els.voicePitch.value = String(config.voicePitch ?? 0.8); paintVoiceVals(); }
  els.speechLang.value = config.speechLang || "es-CR";
  els.webSearch.checked = !!config.webSearch;
  els.autoLearn.checked = !!config.autoLearn;
  els.wakeWord.checked = !!config.wakeWord && voice.canListen;
  els.wakeWord.disabled = !voice.canListen;
  els.wakeIdle.value = String(config.wakeIdleMin || 10);
  els.wakeNote.textContent = wakeNoteText();
  els.drivingMode.checked = !!config.drivingMode;
  els.fontSize.value = String(config.fontSize || 1);
  els.socialOn.checked = config.socialOn !== false;
  els.socialFreq.value = config.socialFreq === "poco" ? "poco" : "normal";
  els.socialFreq.disabled = !els.socialOn.checked;
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
  if (wake && wake.enabled) wake.pause("ajustes");
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
  setTimeout(syncWake, 100);
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

// ---------- v1.15: Ajustes de voz ----------
Object.assign(els, { replyModeSel: $("reply-mode-sel"), voiceSel: $("voice-sel"), voiceRate: $("voice-rate"), voicePitch: $("voice-pitch") });
const fmt2 = (n) => Number(n).toFixed(2).replace(".", ",");
function paintVoiceVals() {
  const r = $("voice-rate-val"), p = $("voice-pitch-val");
  if (r) r.textContent = fmt2(els.voiceRate.value); if (p) p.textContent = fmt2(els.voicePitch.value);
}
function fillVoiceList() {
  if (!els.voiceSel) return;
  const cur = els.voiceSel.value || config.voiceURI || "";
  const list = voice.listVoices();
  els.voiceSel.innerHTML = `<option value="">Automática (masculina, tipo Jarvis)${voice.voice ? " · " + voice.voice.name : ""}</option>` +
    list.map((v) => `<option value="${v.uri.replace(/"/g, "&quot;")}">${v.male ? "♂ " : ""}${v.name.replace(/</g, "&lt;")} (${v.lang})</option>`).join("");
  els.voiceSel.value = list.some((v) => v.uri === cur) ? cur : "";
}
voice.onVoices = () => { if (!els.settingsView.hidden) fillVoiceList(); };
els.voiceRate?.addEventListener("input", () => { paintVoiceVals(); updateDirty(); });
els.voicePitch?.addEventListener("input", () => { paintVoiceVals(); updateDirty(); });
els.voiceSel?.addEventListener("change", () => updateDirty());
els.replyModeSel?.addEventListener("change", () => updateDirty());
$("voice-jarvis")?.addEventListener("click", () => {
  voice.unlock();
  els.voiceSel.value = ""; els.voiceRate.value = "0.95"; els.voicePitch.value = "0.8"; paintVoiceVals(); updateDirty();
  voice.setPrefs({ voiceURI: "", rate: 0.95, pitch: 0.8 });
  voice.speak("Voz Jarvis lista. A sus órdenes, don " + (config.userName || "Freddy") + ".");
});
$("voice-test")?.addEventListener("click", () => {
  voice.unlock(); // dentro del toque: necesario en iPhone
  voice.setPrefs({ voiceURI: els.voiceSel.value, rate: els.voiceRate.value, pitch: els.voicePitch.value });
  voice.speak(`Buenas, ${config.userName ? "don " + config.userName : "don Freddy"}. Soy ${assistantName()}, su asistente. Así sueno con esta voz.`)
    .then((ok) => { if (!ok) setSettingsStatus("No pude reproducir la voz. Revise que el iPhone no esté en silencio y suba el volumen.", true); });
});

function applyConfig() {
  applyVoicePrefs(); paintReplyMode();
  client = makeClient();
  els.title.textContent = assistantName().toUpperCase();
  document.title = assistantName();
  renderGreeting();
  applyModes();
}

els.save.addEventListener("click", async () => {
  const { lockOnHide, idleMin, ...v } = formValues();
  const next = { ...config, ...v, assistantName: v.assistantName || DEFAULT_ASSISTANT_NAME };
  const r = memory.saveConfig(next);
  const ok = r.ok && (await flushWrites()).ok && (!Lock.hasPin() || await Lock.savePrefs({ lockOnHide, idleMin }));
  if (!ok) { setSettingsStatus("No se pudo guardar: el almacenamiento está lleno o el navegador está en modo privado.", true); return; }
  if (next.wakeWord && !config.wakeWord) voice.unlock();
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
  forgetSessionMedia();
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
  // v1.13: la versión nueva toma el control sola (skipWaiting + clients.claim) y la página se recarga UNA vez
  const hadController = !!navigator.serviceWorker.controller;
  const RK = "antares.swReloaded";
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return; // primera instalación: no hace falta recargar
    let last = 0; try { last = Number(sessionStorage.getItem(RK) || 0); } catch { /* */ }
    if (Date.now() - last < 60000) { els.toast.hidden = false; return; } // evita bucles de recarga
    try { sessionStorage.setItem(RK, String(Date.now())); } catch { /* */ }
    // si está escribiendo o Antares está respondiendo, solo avisa; si no, recarga en silencio
    if (estado === "hablando" || estado === "escuchando" || (els.input && els.input.value)) { els.toast.hidden = false; return; }
    location.reload();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    if (!reg) return;
    if (reg.waiting && hadController) reg.waiting.postMessage("SKIP_WAITING");
    reg.update().catch(() => {});
    let lastCheck = Date.now();
    const check = () => { if (Date.now() - lastCheck > 60 * 1000) { lastCheck = Date.now(); reg.update().catch(() => {}); } };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    // v1.19.2: respaldo — si el servidor ya tiene otra versión y el SW no la tomó, se actualiza y recarga UNA vez
    const verCheck = async () => {
      try {
        const r = await fetch("sw.js?vc=" + Date.now(), { cache: "no-store" }); const m = /antares-v([\d.]+)/.exec(await r.text());
        if (!m || m[1] === APP_VERSION) return;
        let last = 0; try { last = Number(sessionStorage.getItem("antares.verReload") || 0); } catch { /* */ }
        if (Date.now() - last < 5 * 60000) { els.toast.hidden = false; return; }
        try { sessionStorage.setItem("antares.verReload", String(Date.now())); } catch { /* */ }
        await reg.update().catch(() => {}); if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
        if (estado === "hablando" || estado === "escuchando" || (els.input && els.input.value)) { els.toast.hidden = false; return; }
        setTimeout(() => location.replace(location.pathname + "?v=" + m[1] + location.hash), 1200);
      } catch { /* sin red */ }
    };
    setTimeout(verCheck, 2500);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setTimeout(verCheck, 800); });
  }).catch((e) => console.warn("Antares: service worker no registrado", e));
  els.updateBtn.addEventListener("click", async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
    } catch { /* */ }
    location.reload();
  });
  els.updateDismiss.addEventListener("click", () => { els.toast.hidden = true; });
  const force = document.getElementById("force-update");
  force && force.addEventListener("click", forceUpdate);
}
// Ajustes › Buscar actualización: pide la versión nueva al servidor, borra solo las copias guardadas de la app y recarga.
// Los datos (key, memoria, código, bóveda) no se tocan.
async function forceUpdate() {
  const st = document.getElementById("update-status"), say = (t) => { if (st) st.textContent = t; };
  say("Buscando actualización…");
  let remote = "";
  try { const r = await fetch("sw.js?check=" + Date.now(), { cache: "no-store" }); const m = /antares-v([\d.]+)/.exec(await r.text()); remote = m ? m[1] : ""; } catch { /* */ }
  say(remote ? (remote === APP_VERSION ? `Ya tiene la última versión (${APP_VERSION}). Recargando copia limpia…` : `Hay una versión nueva: ${remote}. Actualizando…`) : "Sin conexión con el servidor. Recargando…");
  try { flushWrites && (await flushWrites()); } catch { /* */ }
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) { await reg.update().catch(() => {}); if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING"); } } catch { /* */ }
  try { const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.startsWith("antares-")).map((k) => caches.delete(k))); } catch { /* */ }
  // se reinstala el service worker desde cero para que vuelva a guardar la copia sin conexión de la versión nueva
  try { const rs = await navigator.serviceWorker?.getRegistrations(); if (rs) await Promise.all(rs.map((r) => r.unregister())); } catch { /* */ }
  try { sessionStorage.setItem("antares.swReloaded", String(Date.now())); } catch { /* */ }
  setTimeout(() => location.replace(location.pathname + "?v=" + Date.now() + location.hash), 900);
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
const AWAY_PICKER_MS = 60 * 1000;   // elegir foto/video/PDF
const AWAY_PASSKEY_MS = 45 * 1000;  // registrar o usar Face ID / huella
let pendingPanel = null;      // OPEN_PANEL recibido con la app bloqueada
let hiddenAt = 0;
let lastActivity = Date.now();
function expectAway(ms) { awayUntil = Date.now() + ms; }

async function fillSecurity() {
  const on = Lock.hasPin();
  els.secStatus.classList.toggle("on", on);
  els.secStatusText.replaceChildren();
  const small = document.createElement("small");
  const type = Lock.secretType();
  if (on) {
    const combo = Lock.factor() === "pin+passkey";
    els.secStatusText.append(type === "frase" ? "Frase segura activa" : "Código de seguridad activo", small);
    small.textContent = (type === "frase" ? "Frase segura" : "6 dígitos") + (combo ? " + Face ID / huella" : "") + " · sus datos se guardan cifrados";
  } else {
    els.secStatusText.append("Sin código de seguridad", small);
    small.textContent = "Sus datos se guardan sin cifrar en este navegador";
  }
  els.secOffRow.hidden = on;
  els.secOn.hidden = !on;
  setSecTypeRadio(on ? type : selectedSecType());
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
  // código + passkey juntos: solo si la passkey ofrece cifrado (PRF)
  els.comboRow.hidden = !(pk && pk.prf);
  els.comboSwitch.checked = !!(pk && pk.combo);
  if (pk && pk.combo) els.passkeyNote.textContent = "Activo junto con su " + (type === "frase" ? "frase" : "código") + ": para abrir hacen falta los dos.";
  const supported = await Lock.passkeySupported();
  els.passkeySwitch.disabled = !supported && !pk;
  if (!supported && !pk) els.passkeyNote.textContent = "Este dispositivo o navegador no ofrece Face ID / huella para sitios web.";
}

const selectedSecType = () => { const r = els.secType.querySelector("input:checked"); return r && r.value === "frase" ? "frase" : "pin"; };
function setSecTypeRadio(t) {
  for (const r of els.secType.querySelectorAll("input")) r.checked = r.value === t;
  paintSecType();
}
function paintSecType() {
  const sel = selectedSecType(), on = Lock.hasPin(), cur = Lock.secretType();
  els.pinCreate.textContent = sel === "frase" ? "Crear frase segura" : "Crear código de seguridad";
  els.pinChange.textContent = !on ? "Cambiar código" : sel !== cur ? (sel === "frase" ? "Cambiar a frase segura" : "Cambiar a código de 6 dígitos") : (cur === "frase" ? "Cambiar frase" : "Cambiar código");
}
els.secType.addEventListener("change", (ev) => { ev.stopPropagation(); paintSecType(); }); // no es un "cambio sin guardar"
els.secType.addEventListener("input", (ev) => ev.stopPropagation());

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
  const type = els.settingsView.hidden ? "pin" : selectedSecType();
  const r = await runPinFlow("create", "", { type });
  if (r && r.ok) {
    setSettingsStatus(type === "frase" ? "Frase segura activada: sus datos se guardan cifrados" : "Código activado: sus datos se guardan cifrados");
    syncReminders();
    if (els.settingsView.hidden) { setVista("chat"); showNote("Código activado. Su key, la conversación y la memoria se guardan cifradas en este dispositivo."); }
    lastActivity = Date.now();
  }
}
els.pinCreate.addEventListener("click", () => securityAction(createPinFlow));
els.pinChange.addEventListener("click", () => securityAction(async () => {
  const r = await runPinFlow("change", "", { newType: selectedSecType() });
  if (r && r.ok) setSettingsStatus(r.type === "frase" ? "Frase segura guardada" : "Código cambiado");
}));
els.lockNow.addEventListener("click", () => lockApp("manual"));
els.pinRemove.addEventListener("click", () => securityAction(async () => {
  if (!confirm("¿Quitar el código? Sus datos volverán a guardarse sin cifrar en este navegador.")) return;
  const v = await runPinFlow("verify", Lock.secretType() === "frase" ? "Escriba su frase para quitarla" : "Ingrese su código para quitarlo");
  if (!v || !v.ok) return;
  if (Lock.passkeyInfo()) await Lock.disablePasskey(v);
  const r = await Lock.removePin(v.dekX);
  Lock.forgetVerified(v);
  if (r.ok) syncReminders();
  setSettingsStatus(r.ok ? "Código quitado. Sus datos ya no están cifrados." : "No se pudo quitar el código: no hay espacio para guardar los datos sin cifrar.", !r.ok);
}));
els.passkeySwitch.addEventListener("change", (ev) => {
  ev.stopPropagation(); // no cuenta como "cambio sin guardar": se aplica de inmediato
  const want = els.passkeySwitch.checked;
  securityAction(async () => {
    if (!want) {
      if (!confirm("¿Desactivar el desbloqueo con Face ID / huella? El código seguirá funcionando.")) return;
      let v = null;
      if (Lock.factor() === "pin+passkey") { // hay que volver a cifrar solo con el código: se confirman ambos
        expectAway(AWAY_PASSKEY_MS);
        v = await runPinFlow("verify", "Confirme su código y Face ID / huella para desactivarlo");
        awayUntil = 0;
        if (!v || !v.ok) return;
      }
      const r = await Lock.disablePasskey(v);
      Lock.forgetVerified(v);
      setSettingsStatus(r && r.ok === false ? (r.error || "No se pudo desactivar Face ID / huella.") : "Face ID / huella desactivado", r && r.ok === false);
      return;
    }
    const v = await runPinFlow("verify", "Confirme su código para activar Face ID / huella");
    if (!v || !v.ok) return;
    try {
      expectAway(AWAY_PASSKEY_MS);
      const r = await Lock.enrollPasskey(v.dekX);
      setSettingsStatus(r.prf ? "Face ID / huella activado" : "Face ID / huella activado en modo comodidad (sin cifrado)");
    } catch (e) {
      console.warn("Antares passkey:", e);
      setSettingsStatus(e && e.name === "NotAllowedError" ? "Se canceló la activación de Face ID / huella." : "No se pudo activar Face ID / huella en este dispositivo.", true);
    } finally { awayUntil = 0; Lock.forgetVerified(v); }
  });
});
// v1.9.1: exigir código (o frase) y Face ID / huella juntos (la llave depende de los dos)
els.comboSwitch.addEventListener("change", (ev) => {
  ev.stopPropagation();
  const want = els.comboSwitch.checked;
  securityAction(async () => {
    if (want) {
      if (!confirm("Protección doble: desde ahora, para abrir Antares hará falta su " + (Lock.secretType() === "frase" ? "frase" : "código") + " y también Face ID / huella.\n\nSi pierde esta passkey (por ejemplo, al cambiar de teléfono), no habrá forma de abrir sus datos y habría que borrarlos. ¿Continuar?")) return;
      const v = await runPinFlow("verify", "Confirme su código para unirlo a Face ID / huella");
      if (!v || !v.ok) return;
      try {
        expectAway(AWAY_PASSKEY_MS);
        const r = await Lock.bindPasskey(v, () => runTapFlow("PROTECCIÓN DOBLE", "Toque el botón para confirmar con Face ID / huella"));
        setSettingsStatus(r.ok ? "Protección doble activada: código + Face ID / huella" : (r.cancelled ? "Se canceló Face ID / huella. No cambió nada." : (r.error || "No se pudo activar la protección doble.")), !r.ok);
      } finally { awayUntil = 0; Lock.forgetVerified(v); }
    } else {
      expectAway(AWAY_PASSKEY_MS);
      const v = await runPinFlow("verify", "Confirme su código y Face ID / huella para quitar la protección doble");
      awayUntil = 0;
      if (!v || !v.ok) return;
      const r = await Lock.unbindPasskey(v);
      Lock.forgetVerified(v);
      setSettingsStatus(r.ok ? "Protección doble desactivada: basta con el código" : (r.error || "No se pudo desactivar la protección doble."), !r.ok);
    }
  });
});

// v1.9.1: al bloquear no queda en el DOM nada personal (key, nombre, personalidad, memoria, saludo, modal…)
function wipePersonalDom() {
  for (const el of [els.apiKey, els.userName, els.assistantName, els.personality]) { if (el) el.value = ""; }
  if (els.apiKey) els.apiKey.type = "password";
  els.factsList.replaceChildren();
  els.factsCount.textContent = "";
  els.saludo.replaceChildren();
  els.saludoSinkey.replaceChildren();
  els.modalTitle.textContent = "";
  els.modalBody.replaceChildren();
  els.connStatusText.textContent = "";
  clearTimeout(noticeTimer);
  els.status.textContent = statusDefault();
  els.settingsStatus.textContent = "";
}

// Bloquear: se borra lo descifrado, el contenido de la pantalla y se cancela lo que esté en curso
function lockApp(reason = "manual") {
  if (!Lock.hasPin() || !isUnlocked()) { if (Lock.hasPin() && !lockShowing()) showLock(afterUnlock); return; }
  lockEpoch++;
  stopResponse();
  if (wake) wake.stop("lock");
  paintWake();
  setTutor(false, { note: false });
  if (estado === "escuchando") voice.cancelListening();
  voice.stop();
  if (!els.modal.hidden) closeModal();
  if (!els.settingsView.hidden) {
    snapshot = null;
    if (historyPushed) { historyPushed = false; history.back(); }
    hideSettings();
  }
  goHome();
  resetPanels();
  setMenu(false);
  setStickerMenu(false);
  Social.closeReactBar();
  for (const a of attachments) if (a.url) URL.revokeObjectURL(a.url);
  attachments = []; renderAttachments();
  forgetSessionMedia();
  els.input.value = ""; autosize();
  els.messages.replaceChildren();
  els.announcer.textContent = "";
  els.interimText.textContent = "";
  pendingConfirm = null;
  pendingPanel = null;
  wipePersonalDom();
  Lock.lockNow();
  config = memory.getConfig();
  // pantalla genérica: sin nombre del usuario ni del asistente
  renderGreeting();
  els.title.textContent = DEFAULT_ASSISTANT_NAME.toUpperCase();
  document.title = DEFAULT_ASSISTANT_NAME;
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
  lastUserCode = null;
  for (const m of memory.getHistory(40)) {
    if (m.role === "user") {
      const text = String(m.content || "").replace(/^(\[(foto|video|pdf)\]\s*)+/, "").replace(DEFAULT_PROMPTS_RE, "");
      renderUser(m.media ? text : m.content, m.media, { id: m.id, sticker: m.sticker, reactions: m.reactions });
    } else if (m.content || m.sticker) renderBot(m.content, { sources: m.sources || [], id: m.id, sticker: m.sticker, reactions: m.reactions, media: m.media });
  }
  vista = "inicio";
  setEstado(baseEstado());
}
function afterUnlock() {
  lastActivity = Date.now();
  loadData();
  bootReady();
  maybeOfferBirthday();
  syncReminders();
  reminderTick();
  openPanelFromUrl();
  if (pendingPanel) { const p = pendingPanel; pendingPanel = null; showPanel(p); }
  syncWake();
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
  if (document.visibilityState === "hidden") { if (wake && wake.enabled) wake.pause("oculta"); onHidden(); }
  else {
    setTimeout(syncWake, 300);
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

// ---------- Arranque vigilado (v1.9.0) ----------
function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label}: sin respuesta en ${ms / 1000} s`)), ms); })]).finally(() => clearTimeout(t));
}
// metadatos del código: si IndexedDB falla o no responde se reintenta una vez. Nunca se asume "sin código" por un
// fallo, salvo que haya datos en claro en localStorage (con código todo eso se guarda cifrado y se borra de ahí).
async function loadMetaSafe() {
  try { return await withTimeout(Lock.loadMeta({ strict: true }), 2000, "Base local"); }
  catch {
    Vault.resetDb();
    try { indexedDB.open("antares-ping").onsuccess = (ev) => { try { ev.target.result.close(); } catch { /* */ } }; } catch { /* */ }
    try { return await withTimeout(Lock.loadMeta({ strict: true }), 1500, "La base local (IndexedDB) no responde"); }
    catch (e) {
      let plain = false;
      try { plain = !!localStorage.getItem("antares.config.v1"); } catch { /* */ }
      if (!("indexedDB" in window) || plain) { console.warn("Antares: sin base local, sigue sin código", e); Lock.assumeNoPin(); return null; }
      throw new Error(`La base local (IndexedDB) no responde: ${e && e.message ? e.message : e}`);
    }
  }
}
function bootReady() {
  body.classList.remove("booting");
  if (window.__antaresBoot) window.__antaresBoot.ready();
}
// al volver a la app (iOS PWA, bfcache): medir de nuevo la pantalla, el reloj y repintar
function resumeRepaint() {
  els.app.style.top = "0px";
  if (window.scrollY && !isTyping()) window.scrollTo(0, 0);
  syncViewport(); settleViewport();
  try { tick(); } catch { /* */ }
  if (!document.getElementById("boot-rescue") && window.__antaresBoot && window.__antaresBoot.done) body.classList.remove("booting");
}
window.addEventListener("pageshow", (ev) => { if (ev.persisted) resumeRepaint(); });
window.addEventListener("focus", () => queueViewport());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resumeRepaint(); });

async function init() {
  buildWave();
  buildStickerMenu();
  els.version.textContent = `Antares Web ${APP_VERSION} · sus datos y su key se guardan solo en este navegador`;
  { const vl = document.getElementById("version-label"); if (vl) vl.textContent = `Versión ${APP_VERSION}`; }
  tick();
  setTimeout(() => { tick(); setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000 + 50);
  refreshWeather();
  setInterval(refreshWeather, 15 * 60 * 1000);
  setInterval(reminderTick, 20000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reminderTick(); });
  navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", (ev) => {
    const d = ev.data || {};
    if (d.type === "OPEN_PANEL") {
      // v1.9.1: con la app bloqueada no se abre nada; se deja pendiente hasta desbloquear
      if (!isUnlocked() || lockShowing()) { pendingPanel = String(d.panel || "recordatorios"); return; }
      showPanel(d.panel || "recordatorios");
    }
  });
  syncViewport();
  try { mountAvatar(document.getElementById("avatar-home"), "./assets/avatar-antares.jpg"); { const al = document.getElementById("avatar-lock"); mountAvatar(al, "./assets/avatar-lock.jpg"); al.classList.add("av-lock"); const lv = document.getElementById("lock-ver"); if (lv) lv.textContent = "v" + APP_VERSION; }
    { const hv = document.getElementById("home-ver"); if (hv) { hv.textContent = "v" + APP_VERSION + " · buscar actualización"; hv.addEventListener("click", () => { hv.textContent = "Buscando…"; forceUpdate(); }); } } Hud.mountHud(document.getElementById("stage")); paintPresence(); } catch (e) { console.warn("Antares: avatar/HUD", e); }
  try {
    const ps = document.getElementById("presence-sel"); ps.value = presence();
    ps.addEventListener("change", () => { config = { ...config, presence: ps.value }; memory.saveConfig(config); paintPresence(); });
    document.getElementById("vision-btn").addEventListener("click", () => openVision({ getKey: () => config.geminiApiKey || "", model: GEM_MODELS[0], speak: (t) => { try { voice.speak(t); } catch { /* */ } } }));
  } catch (e) { console.warn("Antares: presencia/visión", e); }
  try { Brain.mountBrain(document.querySelector("#stage .reactor-wrap")); } catch (e) { console.warn("Antares: cerebro 3D", e); }
  setupServiceWorker();
  await loadMetaSafe();
  if (Lock.hasPin()) {
    // con código: siempre arranca bloqueada; nada se descifra hasta ingresar el código
    config = memory.getConfig();
    client = makeClient("");
    setEstado("sinkey");
    showLock(afterUnlock);
    bootReady();
  } else {
    await withTimeout(memory.init(), 6000, "migración").catch((e) => console.warn("Antares: migración", e));
    loadData();
    bootReady();
    maybeOfferPin();
    maybeOfferBirthday();
    syncReminders();
    reminderTick();
    openPanelFromUrl();
    syncWake();
  }
  requestPersistence();
}
init().catch((e) => {
  console.error("Antares: arranque", e);
  if (window.__antaresBoot) window.__antaresBoot.fail(`Arranque: ${e && e.message ? e.message : e}`);
});

// ---------- v1.18: Ajustes › Cerebro (Gemini / local) ----------
(function initLocalBrainUI() {
  const sel = $("brain-mode"), st = $("lb-state"), bar = $("lb-bar"), fill = $("lb-fill"), prog = $("lb-prog"), dl = $("lb-download"), fg = $("lb-forget");
  if (!sel) return;
  let armed = false;
  const paint = () => {
    sel.value = brainMode();
    const s = LB.state, ok = LB.isDownloaded();
    const loading = s.phase === "loading";
    bar.hidden = prog.hidden = !loading;
    if (loading) {
      fill.style.width = `${Math.round(s.progress * 100)}%`;
      const mb = s.mb || Math.round(s.progress * LB.APPROX_MB);
      prog.textContent = `${s.text} ${Math.round(s.progress * 100)} % · ${mb} de ~${LB.APPROX_MB} MB`;
    }
    st.className = "lb-state" + (s.phase === "error" ? " err" : ok ? " ok" : "");
    st.textContent = s.phase === "error" ? s.error
      : loading ? "Preparando el cerebro local… no cierre la app."
      : !LB.hasWebGPU() && !window.__antaresWebLLM ? "Este navegador no tiene WebGPU: el cerebro local funciona en Chrome para Android (por ejemplo el Xiaomi 12T)."
      : LB.isReady() ? `${LB.LABEL}: listo y en memoria.`
      : ok ? `${LB.LABEL}: descargado y guardado en el teléfono.` : "Cerebro local: no descargado.";
    dl.hidden = loading || LB.isReady();
    dl.textContent = armed ? "Sí, descargar ahora (≈1,1 GB)" : ok ? "Cargar cerebro local" : "Descargar cerebro local (≈1,1 GB)";
    fg.hidden = !ok || loading;
    updateConn();
  };
  LB.onState(paint);
  sel.addEventListener("change", () => {
    config = { ...config, brainMode: sel.value }; memory.saveConfig(config);
    if (sel.value === "local" && !LB.isDownloaded()) { st.className = "lb-state err"; st.textContent = "Primero descargue el cerebro local (abajo). Mientras tanto no podré responder."; }
    setEstado(baseEstado()); updateComposer(); paint();
  });
  dl.addEventListener("click", () => {
    if (!LB.isDownloaded() && !armed) {
      armed = true; paint();
      st.className = "lb-state err";
      st.textContent = "Atención: son unos 1,1 GB. Use Wi-Fi, deje la pantalla encendida y no cambie de app hasta que termine. Toque de nuevo para confirmar.";
      return;
    }
    armed = false;
    LB.load().then(() => { setEstado(baseEstado()); updateComposer(); }).catch(() => {}).finally(paint);
  });
  fg.addEventListener("click", async () => {
    if (fg.dataset.armed !== "1") { fg.dataset.armed = "1"; fg.textContent = "Toque otra vez para borrarlo"; setTimeout(() => { fg.dataset.armed = ""; fg.textContent = "Borrar modelo"; }, 5000); return; }
    fg.dataset.armed = ""; fg.textContent = "Borrar modelo";
    await LB.forget(); setEstado(baseEstado()); updateComposer(); paint();
  });
  els.openSettings?.addEventListener("click", () => setTimeout(paint, 0));
  window.addEventListener("online", paint); window.addEventListener("offline", () => { paint(); setEstado(baseEstado()); updateComposer(); });
  // pestaña oculta: se corta la generación (libera la tarjeta gráfica); si pasa mucho tiempo oculta, se descarga de memoria
  let hideTimer = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      LB.stop();
      hideTimer = setTimeout(() => { if (LB.isReady()) LB.unload(); }, 10 * 60 * 1000);
    } else { clearTimeout(hideTimer); paint(); }
  });
  // si ya va a responder el cerebro local, se va cargando (el modelo ya está en el teléfono)
  setTimeout(() => { if (useLocal() && LB.isDownloaded() && document.visibilityState === "visible") LB.load().catch(() => {}); }, 2500);
  paint();
})();
