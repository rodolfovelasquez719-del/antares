// Antares Web - lógica de la interfaz.
import { GeminiClient, DEFAULT_ASSISTANT_NAME, needsSearch } from "./gemini.js";
import { memory, requestPersistence } from "./memory.js";
import { looksLikeImportantFact, buildConfirmationQuestion } from "./facts.js";
import { Voice } from "./voice.js";

const APP_VERSION = "1.1.0";
const $ = (id) => document.getElementById(id);

const els = {
  app: $("app"),
  chatView: $("chat-view"), settingsView: $("settings-view"),
  avatar: $("avatar"), title: $("assistant-title"), status: $("status-line"),
  messages: $("messages"), form: $("composer"), input: $("msg-input"),
  mic: $("mic-btn"), send: $("send-btn"),
  openSettings: $("open-settings"), closeSettings: $("close-settings"),
  apiKey: $("api-key"), toggleKey: $("toggle-key"), pasteKey: $("paste-key"), clearKey: $("clear-key"),
  testConn: $("test-conn"), assistantName: $("assistant-name"), userName: $("user-name"),
  personality: $("personality"), speakReplies: $("speak-replies"), webSearch: $("web-search"),
  autoLearn: $("auto-learn"), factsList: $("facts-list"),
  save: $("save-settings"), settingsStatus: $("settings-status"),
  factsCount: $("facts-count"), clearHistory: $("clear-history"), clearFacts: $("clear-facts"),
  version: $("app-version"),
  modal: $("modal"), modalBody: $("modal-body"), modalCopy: $("modal-copy"), modalClose: $("modal-close"),
};

let config = memory.getConfig();
let client = null;
let pendingFact = null;
let pendingCount = 0;
const voice = new Voice();

// ---------- Cliente Gemini ----------
function makeClient(apiKey = config.geminiApiKey) {
  return new GeminiClient({
    apiKey,
    assistantName: config.assistantName,
    userName: config.userName,
    personality: config.personality,
    preferredModel: config.geminiModel,
    authMethod: config.authMethod,
    noGrounding: config.noGrounding,
    onModelOk: ({ model, authMethod, noGrounding }) => {
      if (model) config.geminiModel = model;
      if (authMethod) config.authMethod = authMethod;
      if (noGrounding) config.noGrounding = { ...noGrounding };
      memory.saveConfig(config);
    },
  });
}

function assistantName() {
  return (config.assistantName || "").trim() || DEFAULT_ASSISTANT_NAME;
}

function applyProfileToUI() {
  const name = assistantName();
  els.title.textContent = name;
  els.avatar.textContent = (name[0] || "A").toUpperCase();
  els.input.placeholder = `Escribile a ${name}...`;
  document.title = name;
}

// ---------- Teclado móvil: la app ocupa solo el área visible ----------
function syncViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  const nearBottom = isNearBottom();
  document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
  els.app.style.top = `${Math.round(top)}px`;
  document.body.classList.toggle("kb-open", window.innerHeight - h > 120);
  if (nearBottom) scrollToBottom(false);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
}
window.addEventListener("resize", syncViewport);
// iOS a veces desplaza la página al enfocar: la devolvemos arriba
window.addEventListener("scroll", () => { if (window.scrollY) window.scrollTo(0, 0); });

// ---------- Render del chat ----------
function isNearBottom() {
  const m = els.messages;
  return m.scrollHeight - m.scrollTop - m.clientHeight < 120;
}
function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  });
}

function appendLinkified(parent, text) {
  const re = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?¿¡"'])/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const a = document.createElement("a");
    a.href = m[0]; a.textContent = m[0]; a.target = "_blank"; a.rel = "noopener";
    parent.appendChild(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function renderBubble(role, text, { error = false, sources = [], meta = "" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "user" : "assistant"}${error ? " error" : ""}`;
  const b = document.createElement("div");
  b.className = "bubble";
  appendLinkified(b, text);
  wrap.appendChild(b);
  if (sources && sources.length) {
    const s = document.createElement("div");
    s.className = "sources";
    for (const src of sources) {
      const a = document.createElement("a");
      a.href = src.uri; a.target = "_blank"; a.rel = "noopener";
      a.textContent = src.title;
      s.appendChild(a);
    }
    wrap.appendChild(s);
  }
  if (meta) addMeta(wrap, meta);
  els.messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addMeta(wrap, text) {
  const m = document.createElement("div");
  m.className = "meta";
  m.textContent = text;
  wrap.appendChild(m);
}

function formatMeta(r, firstMs) {
  const secs = (r.ms / 1000).toFixed(1);
  const model = (r.model || "").replace(/^gemini-/, "");
  return `${secs} s${model ? " · " + model : ""}`;
}

// Burbuja que se va llenando mientras llega el streaming
function createStreamingBubble(typingNode) {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant streaming";
  const b = document.createElement("div");
  b.className = "bubble";
  wrap.appendChild(b);
  if (typingNode && typingNode.parentNode) typingNode.replaceWith(wrap);
  else els.messages.appendChild(wrap);
  return { wrap, bubble: b };
}

// ---------- Memoria automática ----------
function showMemoryNote(items) {
  const note = document.createElement("div");
  note.className = "memory-note";
  const txt = document.createElement("span");
  txt.className = "txt";
  txt.textContent = "Guardé: " + items.map((i) => i.fact).join(" · ");
  const undo = document.createElement("button");
  undo.className = "link-btn";
  undo.textContent = "Deshacer";
  undo.onclick = () => {
    for (const i of items) memory.deleteFact(i.id);
    txt.textContent = "Listo, no lo guardé.";
    note.classList.add("undone");
    undo.remove();
    if (!els.settingsView.hidden) renderFactsList();
  };
  note.append(txt, undo);
  const near = isNearBottom();
  els.messages.appendChild(note);
  if (near) scrollToBottom();
}

async function autoLearn(userText, assistantText) {
  try {
    if (!config.autoLearn || !client.isConfigured()) return;
    const extractor = new GeminiClient({ apiKey: config.geminiApiKey, authMethod: config.authMethod });
    const facts = await extractor.extractFacts(userText, assistantText, memory.getFacts());
    if (!facts.length) return;
    const saved = facts.map((fact) => ({ fact, id: memory.saveFact(fact, { auto: true }) }));
    showMemoryNote(saved);
  } catch (e) {
    console.warn("Antares memoria:", e);
  }
}

function renderConfirm(factText) {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant confirm-card";
  const b = document.createElement("div");
  b.className = "bubble";
  b.textContent = buildConfirmationQuestion(factText);
  const actions = document.createElement("div");
  actions.className = "confirm-actions";
  const yes = document.createElement("button");
  yes.className = "pill-btn primary"; yes.textContent = "Sí, guardalo";
  const no = document.createElement("button");
  no.className = "pill-btn"; no.textContent = "No";
  const done = (accepted) => {
    actions.remove();
    const fact = pendingFact; pendingFact = null;
    if (!fact) return;
    if (accepted) { memory.saveFact(fact); renderBubble("assistant", "Listo, lo guardé para recordarlo."); }
    else renderBubble("assistant", "Dale, no lo guardo.");
  };
  yes.onclick = () => done(true);
  no.onclick = () => done(false);
  actions.append(yes, no);
  b.appendChild(actions);
  wrap.appendChild(b);
  els.messages.appendChild(wrap);
  scrollToBottom();
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant typing";
  wrap.innerHTML = '<div class="bubble"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  els.messages.appendChild(wrap);
  els.status.textContent = `${assistantName()} está escribiendo…`;
  els.status.classList.add("typing");
  scrollToBottom();
  return wrap;
}
function hideTyping(node) {
  if (node) node.remove();
  if (!els.messages.querySelector(".msg.typing")) {
    els.status.textContent = "Asistente personal";
    els.status.classList.remove("typing");
  }
}

// ---------- Envío ----------
function autosize() {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, 132) + "px";
}

async function sendMessage(text) {
  text = (text || "").trim();
  if (!text) return;
  renderBubble("user", text); // la burbuja aparece antes de llamar a la API
  let typing = null, stream = null;
  try {
    const history = memory.getHistory(20);
    const facts = memory.getFacts();
    memory.addMessage("user", text);
    if (!config.autoLearn && looksLikeImportantFact(text)) { pendingFact = text; renderConfirm(text); }

    typing = showTyping();
    pendingCount++;
    const search = !!config.webSearch && needsSearch(text);
    const r = await client.ask(text, history, facts, {
      search,
      onChunk: (partial) => {
        if (!stream) { stream = createStreamingBubble(typing); typing = null; }
        const near = isNearBottom();
        stream.bubble.textContent = partial;
        if (near) scrollToBottom(false);
      },
    });
    hideTyping(typing); typing = null;
    if (stream) {
      // reemplazamos la burbuja parcial por la final (con links y fuentes)
      const final = renderBubble("assistant", r.text, { error: !r.ok, sources: r.sources, meta: r.ok ? formatMeta(r) : "" });
      stream.wrap.replaceWith(final);
    } else {
      renderBubble("assistant", r.text, { error: !r.ok, sources: r.sources, meta: r.ok ? formatMeta(r) : "" });
    }
    hideTyping(null);
    if (r.ok) {
      memory.addMessage("assistant", r.text); // los errores no se guardan en el historial
      if (config.speakReplies) voice.speak(r.text);
      autoLearn(text, r.text); // en segundo plano, no bloquea
    }
  } catch (e) {
    console.error(e);
    hideTyping(typing);
    if (stream) stream.wrap.remove();
    renderBubble("assistant", `Error interno: ${e && e.name ? e.name + ": " : ""}${e && e.message ? e.message : e}`, { error: true });
  } finally {
    pendingCount = Math.max(0, pendingCount - 1);
  }
}

els.form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  voice.unlock(); // gesto del usuario: habilita la voz en iOS
  const text = els.input.value;
  if (!text.trim()) return;
  els.input.value = "";
  autosize();
  sendMessage(text);
});
els.input.addEventListener("input", autosize);
els.input.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    els.form.requestSubmit ? els.form.requestSubmit() : els.form.dispatchEvent(new Event("submit", { cancelable: true }));
  }
});
els.input.addEventListener("focus", () => setTimeout(() => scrollToBottom(false), 300));

// ---------- Micrófono ----------
if (voice.canListen) {
  els.mic.hidden = false;
  els.mic.addEventListener("click", () => {
    voice.unlock();
    voice.listen({
      onState: (on) => { els.mic.classList.toggle("listening", on); els.mic.setAttribute("aria-label", on ? "Detener" : "Hablar"); },
      onInterim: (t) => { els.input.value = t; autosize(); },
      onFinal: (t) => { els.input.value = ""; autosize(); sendMessage(t); },
      onError: (err) => {
        if (err === "not-allowed" || err === "service-not-allowed") {
          renderBubble("assistant", "No tengo permiso para usar el micrófono. Habilitalo en los ajustes del navegador.", { error: true });
        }
      },
    });
  });
}

// ---------- Configuración ----------
function setKeyVisible(visible) {
  els.apiKey.type = visible ? "text" : "password";
  els.toggleKey.textContent = visible ? "Ocultar" : "Mostrar";
}
function renderFactsList() {
  const items = memory.getFactItems();
  els.factsList.innerHTML = "";
  for (const it of items) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = it.fact;
    const del = document.createElement("button");
    del.className = "del";
    del.setAttribute("aria-label", "Borrar dato");
    del.textContent = "×";
    del.onclick = () => { memory.deleteFact(it.id); renderFactsList(); };
    li.append(span, del);
    els.factsList.appendChild(li);
  }
  els.factsCount.textContent = items.length ? `${items.length} dato${items.length === 1 ? "" : "s"} guardado${items.length === 1 ? "" : "s"}` : "Todavía no recuerdo nada sobre vos.";
}
const updateFactsCount = renderFactsList;

function openSettings() {
  config = memory.getConfig();
  els.apiKey.value = config.geminiApiKey || "";
  setKeyVisible(true);
  els.assistantName.value = assistantName();
  els.userName.value = config.userName || "";
  els.personality.value = config.personality || "";
  els.speakReplies.checked = !!config.speakReplies;
  els.webSearch.checked = !!config.webSearch;
  els.autoLearn.checked = !!config.autoLearn;
  els.settingsStatus.textContent = "";
  els.settingsStatus.classList.remove("err");
  updateFactsCount();
  els.chatView.hidden = true;
  els.settingsView.hidden = false;
}
function closeSettings() {
  els.settingsView.hidden = true;
  els.chatView.hidden = false;
  scrollToBottom(false);
}
function setStatus(text, isError = false) {
  els.settingsStatus.textContent = text;
  els.settingsStatus.classList.toggle("err", isError);
}

els.openSettings.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", closeSettings);
els.toggleKey.addEventListener("click", () => setKeyVisible(els.apiKey.type === "password"));
els.clearKey.addEventListener("click", () => { els.apiKey.value = ""; els.apiKey.focus(); });
els.pasteKey.addEventListener("click", async () => {
  try {
    const t = (await navigator.clipboard.readText()) || "";
    const clean = t.replace(/\s+/g, "");
    if (clean) { els.apiKey.value = clean; setStatus(""); }
    else setStatus("El portapapeles está vacío", true);
  } catch {
    els.apiKey.focus();
    setStatus("Tu navegador no deja pegar con el botón: mantené presionado el campo y elegí Pegar.", true);
  }
});
els.apiKey.addEventListener("blur", () => { els.apiKey.value = els.apiKey.value.replace(/\s+/g, ""); });

els.save.addEventListener("click", () => {
  const key = els.apiKey.value.replace(/\s+/g, "");
  els.apiKey.value = key;
  config.geminiApiKey = key;
  config.assistantName = els.assistantName.value.trim() || DEFAULT_ASSISTANT_NAME;
  config.userName = els.userName.value.trim();
  config.personality = els.personality.value.trim();
  config.speakReplies = els.speakReplies.checked;
  config.webSearch = els.webSearch.checked;
  config.autoLearn = els.autoLearn.checked;
  if (!memory.saveConfig(config)) { setStatus("No se pudo guardar (¿almacenamiento lleno o modo privado?)", true); return; }
  client = makeClient();
  applyProfileToUI();
  document.activeElement && document.activeElement.blur();
  setStatus("Guardado");
  setTimeout(closeSettings, 900);
});

els.testConn.addEventListener("click", async () => {
  const key = els.apiKey.value.replace(/\s+/g, "");
  els.apiKey.value = key;
  els.testConn.disabled = true;
  setStatus("Probando conexión…");
  try {
    const c = makeClient(key);
    const { report, ok } = await c.testConnection();
    setStatus(ok ? "Conexión OK" : "La prueba falló", !ok);
    showModal(report);
  } catch (e) {
    setStatus("La prueba falló", true);
    showModal(`Error interno al probar: ${e && e.message ? e.message : e}`);
  } finally {
    els.testConn.disabled = false;
  }
});

// El interruptor de memoria se aplica al instante (está debajo de "Guardar")
els.autoLearn.addEventListener("change", () => {
  config.autoLearn = els.autoLearn.checked;
  memory.saveConfig(config);
  setStatus(config.autoLearn ? "Aprendizaje automático activado" : "Aprendizaje automático desactivado");
});

els.clearHistory.addEventListener("click", () => {
  if (!confirm("¿Borrar toda la conversación de este dispositivo?")) return;
  memory.clearHistory();
  els.messages.innerHTML = "";
  welcome();
  setStatus("Conversación borrada");
});
els.clearFacts.addEventListener("click", () => {
  if (!confirm("¿Borrar todo lo que Antares recuerda de vos?")) return;
  memory.clearFacts();
  updateFactsCount();
  setStatus("Memoria borrada");
});

// ---------- Modal de diagnóstico ----------
function showModal(text) {
  els.modalBody.textContent = text;
  els.modal.hidden = false;
}
els.modalClose.addEventListener("click", () => { els.modal.hidden = true; });
els.modal.addEventListener("click", (ev) => { if (ev.target === els.modal) els.modal.hidden = true; });
els.modalCopy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(els.modalBody.textContent); els.modalCopy.textContent = "Copiado"; }
  catch { els.modalCopy.textContent = "No se pudo copiar"; }
  setTimeout(() => { els.modalCopy.textContent = "Copiar"; }, 1500);
});

// ---------- Inicio ----------
function welcome() {
  renderBubble("assistant", `¡Hola! Soy ${assistantName()}. ¿En qué te ayudo hoy?`);
}

function init() {
  client = makeClient();
  applyProfileToUI();
  els.version.textContent = `Antares Web ${APP_VERSION} · tus datos y tu key se guardan solo en este navegador`;
  const history = memory.getHistory(40);
  for (const m of history) renderBubble(m.role, m.content);
  if (!history.length) welcome();
  syncViewport();
  scrollToBottom(false);
  requestPersistence();

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Antares: service worker no registrado", e));
  }
}

init();

// para pruebas automáticas
window.__antares = { sendMessage, get client() { return client; }, memory };
