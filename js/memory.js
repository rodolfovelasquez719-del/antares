// Antares Web - Memoria local (solo en este navegador): historial, datos guardados y configuración.
const K_HISTORY = "antares.history.v1";
const K_FACTS = "antares.facts.v1";
const K_CONFIG = "antares.config.v1";
const MAX_HISTORY = 300;

export const DEFAULT_CONFIG = {
  geminiApiKey: "",
  assistantName: "Antares",
  userName: "",
  personality: "",
  speakReplies: true,
  webSearch: true,
  autoLearn: true,   // aprender datos del usuario automáticamente
  geminiModel: "",   // último modelo que respondió bien
  authMethod: "",    // forma de enviar la key que funcionó
  noGrounding: {},   // modelos donde la búsqueda de Google no está disponible
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn("Antares: no se pudo guardar", key, e); return false; }
}

export const memory = {
  getConfig() { return { ...DEFAULT_CONFIG, ...load(K_CONFIG, {}) }; },
  saveConfig(cfg) { return save(K_CONFIG, cfg); },

  getHistory(limit = 0) {
    const h = load(K_HISTORY, []);
    return limit ? h.slice(-limit) : h;
  },
  addMessage(role, content, extra) {
    const h = load(K_HISTORY, []);
    h.push({ role, content, ts: new Date().toISOString(), ...(extra || {}) });
    save(K_HISTORY, h.slice(-MAX_HISTORY));
  },
  clearHistory() { save(K_HISTORY, []); },

  getFactItems() {
    return load(K_FACTS, []).map((f, i) => ({ id: f.id || f.ts || String(i), fact: f.fact, ts: f.ts, auto: !!f.auto }));
  },
  getFacts() { return this.getFactItems().map((f) => f.fact); },
  saveFact(fact, { auto = false } = {}) {
    const f = load(K_FACTS, []);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    f.push({ id, fact, ts: new Date().toISOString(), auto });
    save(K_FACTS, f);
    return id;
  },
  deleteFact(id) {
    const items = this.getFactItems().filter((f) => f.id !== id);
    save(K_FACTS, items.map(({ id: i, fact, ts, auto }) => ({ id: i, fact, ts, auto })));
  },
  clearFacts() { save(K_FACTS, []); },
};

// Pide al navegador que no borre estos datos automáticamente (si lo permite)
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch { /* opcional */ }
}
