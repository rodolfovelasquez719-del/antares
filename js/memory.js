// Antares Web - Memoria local (solo en este navegador): historial, datos guardados y configuración.
// Sin código de seguridad: texto y configuración en localStorage (~5 MB), miniaturas en IndexedDB.
// Con código: todo cifrado con AES-GCM en IndexedDB; lo descifrado vive solo en memoria mientras está desbloqueado.
import { tx, idbGet, idbEntries, seal, unseal, isSealed } from "./vault.js";

export const K_HISTORY = "antares.history.v1";
export const K_FACTS = "antares.facts.v1";
export const K_CONFIG = "antares.config.v1";
const MAX_HISTORY = 300;
const MAX_THUMBS = 60;               // miniaturas que se conservan (las más recientes)
export const DATA_KEYS = [K_CONFIG, K_HISTORY, K_FACTS];
export const LS_LIMIT = 5 * 1024 * 1024;
const CONFIG_REV = 4;

export const DEFAULT_CONFIG = {
  geminiApiKey: "",
  assistantName: "Antares",
  userName: "",
  personality: "",
  speakReplies: false,   // leer en voz alta: apagado por defecto
  speechLang: "es-CR",   // idioma del dictado (con respaldo es-MX -> es-US)
  webSearch: true,
  autoLearn: true,       // aprender datos del usuario automáticamente
  geminiModel: "",       // último modelo que respondió bien
  noGrounding: {},       // modelos donde la búsqueda de Google no está disponible
  configRev: CONFIG_REV,
};

const isQuota = (e) => e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014 || /quota/i.test(e.message || ""));

// ---------- Modo cifrado ----------
let vaultMode = false;   // hay un código configurado (los datos viven cifrados en IndexedDB)
let vault = null;        // {dek, data} mientras está desbloqueado
let writeChain = Promise.resolve();
let writeFailed = false;

export function setVaultMode(on) { vaultMode = !!on; if (!on) vault = null; }
export const isVaultMode = () => vaultMode;
export const isUnlocked = () => !vaultMode || !!vault;
export const currentDek = () => (vault ? vault.dek : null);

// Descifra los registros con la clave de datos y los deja en memoria
export async function openVault(dek) {
  const data = {};
  for (const k of DATA_KEYS) {
    const rec = await idbGet("vault", k);
    data[k] = rec ? JSON.parse(await unseal(dek, k, rec)) : null;
  }
  vaultMode = true;
  vault = { dek, data };
}
// Bloquear: se descarta lo descifrado y la clave
export function closeVault() { vault = null; }

function queueSeal(key, json) {
  const dek = vault.dek;
  writeChain = writeChain
    .then(async () => { const rec = await seal(dek, key, json); await tx("vault", "readwrite", (s) => { s.put(rec, key); }); })
    .catch((e) => {
      writeFailed = true;
      console.warn("Antares: no se pudo guardar cifrado", key, e && e.name);
      window.dispatchEvent(new CustomEvent("antares:save-error", { detail: { quota: isQuota(e) } }));
    });
}

function load(key, fallback) {
  if (vaultMode) {
    const v = vault ? vault.data[key] : null;
    return v == null ? fallback : JSON.parse(JSON.stringify(v));
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
// Devuelve {ok, quota}
function rawSave(key, value) {
  if (vaultMode) {
    if (!vault) return { ok: false };
    const json = JSON.stringify(value);
    vault.data[key] = JSON.parse(json);
    queueSeal(key, json);
    return { ok: true };
  }
  try { localStorage.setItem(key, JSON.stringify(value)); return { ok: true }; }
  catch (e) { console.warn("Antares: no se pudo guardar", key, e && e.name); return { ok: false, quota: isQuota(e) }; }
}
// Espera a que terminen las escrituras cifradas; {ok:false} si alguna falló desde la última vez
export async function flushWrites() {
  await writeChain;
  const ok = !writeFailed;
  writeFailed = false;
  return { ok };
}

// ---------- Miniaturas en IndexedDB (cifradas si hay código) ----------
export const thumbs = {
  async put(id, dataUrl) {
    try {
      let v = dataUrl;
      if (vaultMode) { if (!vault) return false; v = await seal(vault.dek, "thumb:" + id, dataUrl); }
      await tx("thumbs", "readwrite", (s) => { s.put(v, id); });
      return true;
    } catch { return false; }
  },
  async get(id) {
    try {
      const v = await idbGet("thumbs", id);
      if (!isSealed(v)) return v || "";
      return vault ? await unseal(vault.dek, "thumb:" + id, v) : "";
    } catch { return ""; }
  },
  async remove(ids) { if (!ids.length) return; try { await tx("thumbs", "readwrite", (s) => { for (const id of ids) s.delete(id); }); } catch { /* */ } },
  async clear() { try { await tx("thumbs", "readwrite", (s) => { s.clear(); }); } catch { /* */ } },
  async count() { try { return await tx("thumbs", "readonly", (s) => s.count()); } catch { return 0; } },
  entries() { return idbEntries("thumbs"); },
};

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const thumbIdsOf = (msgs) => msgs.flatMap((m) => (m.media || []).map((x) => x.thumbId).filter(Boolean));

// Guarda el historial; si no cabe, borra los mensajes más viejos hasta que quepa.
function saveHistory(h) {
  let pruned = 0;
  for (let i = 0; i < 8; i++) {
    const r = rawSave(K_HISTORY, h);
    if (r.ok) return { ok: true, pruned, history: h };
    if (!r.quota || h.length <= 2) return { ok: false, pruned, history: h };
    const cut = Math.max(2, Math.ceil(h.length / 4));
    thumbs.remove(thumbIdsOf(h.slice(0, cut)));
    h = h.slice(cut);
    pruned += cut;
  }
  return { ok: false, pruned, history: h };
}

// Guarda otra clave; si el espacio está lleno, libera historial viejo y reintenta una vez.
function saveWithRoom(key, value) {
  let r = rawSave(key, value);
  if (r.ok || !r.quota) return { ok: r.ok, pruned: 0 };
  const h = load(K_HISTORY, []);
  if (h.length > 10) {
    const cut = Math.ceil(h.length / 3);
    thumbs.remove(thumbIdsOf(h.slice(0, cut)));
    rawSave(K_HISTORY, h.slice(cut));
    r = rawSave(key, value);
    return { ok: r.ok, pruned: r.ok ? cut : 0 };
  }
  return { ok: false, pruned: 0 };
}

export const memory = {
  // Migraciones (v1.3 guardaba las miniaturas dentro del historial en localStorage)
  async init() {
    if (vaultMode) return; // con código: las migraciones se hicieron al crearlo
    const cfg = load(K_CONFIG, null);
    if (cfg && (cfg.configRev || 0) < CONFIG_REV) {
      cfg.speakReplies = false;      // leer en voz alta pasa a estar apagado por defecto
      delete cfg.authMethod;         // la key ahora solo se envía por encabezado
      delete cfg.modelOrderRev;
      cfg.configRev = CONFIG_REV;
      rawSave(K_CONFIG, cfg);
    }
    const h = load(K_HISTORY, []);
    let changed = false;
    for (const m of h) {
      if (!m.id) { m.id = newId(); changed = true; }
      for (const x of m.media || []) {
        if (x.thumb) {
          const id = newId();
          if (await thumbs.put(id, x.thumb)) x.thumbId = id;
          delete x.thumb;
          changed = true;
        }
      }
    }
    if (changed) saveHistory(h);
    await this.pruneThumbs(h);
  },

  async pruneThumbs(h = load(K_HISTORY, [])) {
    const ids = thumbIdsOf(h);
    if (ids.length <= MAX_THUMBS) return 0;
    const drop = new Set(ids.slice(0, ids.length - MAX_THUMBS));
    for (const m of h) for (const x of m.media || []) if (drop.has(x.thumbId)) delete x.thumbId;
    saveHistory(h);
    await thumbs.remove([...drop]);
    return drop.size;
  },

  getConfig() { return { ...DEFAULT_CONFIG, ...load(K_CONFIG, {}) }; },
  saveConfig(cfg) { return saveWithRoom(K_CONFIG, cfg); },

  getHistory(limit = 0) {
    const h = load(K_HISTORY, []);
    return limit ? h.slice(-limit) : h;
  },
  // extra.media: [{kind, thumb(dataURL)}] -> la miniatura va a IndexedDB. Devuelve {ok, pruned, id}
  addMessage(role, content, extra = null) {
    const msg = { id: newId(), role, content, ts: new Date().toISOString() };
    if (extra && extra.media) {
      msg.media = extra.media.map((x) => {
        const out = { kind: x.kind };
        if (x.thumb) { out.thumbId = newId(); thumbs.put(out.thumbId, x.thumb); }
        return out;
      });
    }
    let h = load(K_HISTORY, []);
    h.push(msg);
    if (h.length > MAX_HISTORY) {
      thumbs.remove(thumbIdsOf(h.slice(0, h.length - MAX_HISTORY)));
      h = h.slice(-MAX_HISTORY);
    }
    const r = saveHistory(h);
    if (msg.media) this.pruneThumbs();
    return { ok: r.ok, pruned: r.pruned, id: msg.id };
  },
  clearHistory() { thumbs.clear(); return rawSave(K_HISTORY, []).ok; },

  getFactItems() {
    return load(K_FACTS, []).map((f, i) => ({ id: f.id || f.ts || String(i), fact: f.fact, ts: f.ts, auto: !!f.auto }));
  },
  getFacts() { return this.getFactItems().map((f) => f.fact); },
  // Devuelve {id} si se guardó, o {id: null, error} si no hubo espacio
  saveFact(fact, { auto = false } = {}) {
    const f = load(K_FACTS, []);
    const id = newId();
    f.push({ id, fact, ts: new Date().toISOString(), auto });
    const r = saveWithRoom(K_FACTS, f);
    return r.ok ? { id, pruned: r.pruned } : { id: null, error: "quota" };
  },
  deleteFact(id) {
    const items = this.getFactItems().filter((f) => f.id !== id);
    return rawSave(K_FACTS, items.map(({ id: i, fact, ts, auto }) => ({ id: i, fact, ts, auto }))).ok;
  },
  clearFacts() { return rawSave(K_FACTS, []).ok; },

  // Uso de almacenamiento: localStorage de Antares (límite ~5 MB) + total del sitio si el navegador lo informa
  async usage() {
    let ls = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        ls += (k.length + (localStorage.getItem(k) || "").length) * 2; // UTF-16
      }
    } catch { /* */ }
    let total = null, quota = null;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        total = e.usage; quota = e.quota;
      }
    } catch { /* */ }
    let vaultBytes = 0;
    if (vaultMode) {
      try { for (const [, v] of await idbEntries("vault")) if (isSealed(v)) vaultBytes += v.ct.byteLength; } catch { /* */ }
    }
    return { ls, lsLimit: LS_LIMIT, total, quota, thumbs: await thumbs.count(), vault: vaultMode, vaultBytes };
  },
};

// Pide al navegador que no borre estos datos automáticamente (si lo permite)
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* opcional */ }
  return false;
}
