// Antares Web - Base local (IndexedDB) y cifrado (Web Crypto).
// Stores: "thumbs" (miniaturas) y "vault" (datos cifrados + metadatos del código).
const DB_NAME = "antares";
const DB_VERSION = 3;
const te = new TextEncoder();
const td = new TextDecoder();

let dbPromise = null;
// iOS a veces deja colgado indexedDB.open al reanudar la PWA: permite descartar el intento y abrir de nuevo
export function resetDb() { dbPromise = null; }
export function db() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("sin IndexedDB"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("thumbs")) d.createObjectStore("thumbs");
        if (!d.objectStoreNames.contains("vault")) d.createObjectStore("vault");
        if (!d.objectStoreNames.contains("notify")) d.createObjectStore("notify"); // agenda de avisos (sin datos personales si hay código)
      };
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => { d.close(); dbPromise = null; };
        resolve(d);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("IndexedDB bloqueada por otra pestaña"));
    }).catch((e) => { dbPromise = null; throw e; });
  }
  return dbPromise;
}

// Transacción sobre uno o varios stores. fn recibe los stores en el mismo orden y puede devolver un IDBRequest.
export async function tx(stores, mode, fn) {
  const names = Array.isArray(stores) ? stores : [stores];
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(names, mode);
    const out = fn(...names.map((n) => t.objectStore(n)));
    t.oncomplete = () => resolve(out && typeof out === "object" && "result" in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("transacción abortada"));
  });
}
export const idbGet = (store, key) => tx(store, "readonly", (s) => s.get(key));
export const idbPut = (store, key, value) => tx(store, "readwrite", (s) => { s.put(value, key); });
export async function idbEntries(store) {
  const keys = await tx(store, "readonly", (s) => s.getAllKeys());
  const vals = await tx(store, "readonly", (s) => s.getAll());
  return keys.map((k, i) => [k, vals[i]]);
}

// Borra toda la base (cierra la conexión propia primero). {ok} | {ok:false, blocked:true} si otra pestaña la tiene abierta.
export async function deleteDatabase({ waitMs = 4000 } = {}) {
  try { if (dbPromise) (await dbPromise).close(); } catch { /* */ }
  dbPromise = null;
  let markDone;
  const finished = new Promise((res) => { markDone = res; }); // se cumple cuando el borrado de verdad termina
  const r = await new Promise((resolve) => {
    let blocked = false, t = 0;
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => { clearTimeout(t); markDone(true); resolve({ ok: true }); };
    req.onerror = () => { clearTimeout(t); markDone(false); resolve({ ok: false, error: String(req.error && req.error.message || "error") }); };
    // bloqueada por otra pestaña: se espera un poco a que la suelte; si no, se informa (no se da por borrada).
    // La petición sigue en cola y termina sola cuando se cierren las otras pestañas (finished).
    req.onblocked = () => { if (blocked) return; blocked = true; t = setTimeout(() => resolve({ ok: false, blocked: true, finished }), waitMs); };
  });
  if (!r.ok) return r;
  // verificar: si el navegador lo permite, la base ya no debe aparecer
  try {
    if (indexedDB.databases) { const list = await indexedDB.databases(); if (list.some((d) => d.name === DB_NAME)) return { ok: false, blocked: true }; }
  } catch { /* */ }
  return { ok: true };
}

// ---------- Cifrado ----------
export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export const PBKDF2_ITERATIONS = 600000;

// PIN o frase -> clave de envoltura (KEK) no extraíble
export async function deriveKek(pin, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base,
    { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}
// Los mismos 256 bits que deriveKek (PBKDF2 -> AES-256 es idéntico a deriveBits(256)), para combinarlos con la passkey
export async function deriveSecretBits(pin, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 256));
}
export const kekFromBits = (bits) => crypto.subtle.importKey("raw", bits, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
// Código + passkey: KEK = HKDF(PBKDF2(código) || PRF). Una copia de IndexedDB ya no basta: hace falta también el teléfono.
export async function comboKek(secretBits, prfSecret, salt) {
  const ikm = new Uint8Array(secretBits.length + prfSecret.length);
  ikm.set(secretBits, 0); ikm.set(prfSecret, secretBits.length);
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  ikm.fill(0);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: te.encode("antares-pin+prf-kek-v1") }, base,
    { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}
// Secreto PRF de la passkey -> KEK no extraíble
export async function prfKek(secret, salt) {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: te.encode("antares-prf-kek-v1") }, base,
    { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}
export const newDek = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

export async function wrapDek(dek, kek) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv });
  return { iv, ct };
}
// Lanza OperationError si la KEK no es la correcta (código equivocado)
export function unwrapDek(w, kek, extractable = false) {
  return crypto.subtle.unwrapKey("raw", w.ct, kek, { name: "AES-GCM", iv: w.iv }, { name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
}

// Cifra un texto con la clave de datos; cada registro con IV propio y el nombre como dato autenticado
export async function seal(dek, name, text) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(name) }, dek, te.encode(text));
  return { iv, ct };
}
export async function unseal(dek, name, rec) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv, additionalData: te.encode(name) }, dek, rec.ct);
  return td.decode(pt);
}
export const isSealed = (v) => !!v && typeof v === "object" && v.iv && v.ct;
