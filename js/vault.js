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

// Borra toda la base (cierra la conexión propia primero)
export async function deleteDatabase() {
  try { if (dbPromise) (await dbPromise).close(); } catch { /* */ }
  dbPromise = null;
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = () => resolve();
    req.onblocked = () => setTimeout(resolve, 500);
  });
}

// ---------- Cifrado ----------
export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export const PBKDF2_ITERATIONS = 600000;

// PIN -> clave de envoltura (KEK) no extraíble
export async function deriveKek(pin, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base,
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
