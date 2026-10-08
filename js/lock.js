// Antares Web - Código de seguridad (PIN) y desbloqueo con passkey.
// El PIN nunca se guarda: se deriva con PBKDF2-SHA-256 (sal aleatoria, 600 000 iteraciones) a una clave
// que envuelve la clave de datos (AES-GCM-256). Un código equivocado simplemente no logra desenvolverla.
import {
  tx, idbGet, deriveKek, prfKek, newDek, wrapDek, unwrapDek, seal, unseal, isSealed,
  randomBytes, PBKDF2_ITERATIONS, deleteDatabase,
} from "./vault.js";
import { DATA_KEYS, thumbs, openVault, closeVault, setVaultMode, currentDek, flushWrites } from "./memory.js";

export const PIN_LENGTH = 6;
const MAX_FREE_FAILS = 5;
const DELAYS = [30, 60, 300, 900, 3600]; // s: 5 fallos -> 30 s; luego 1 min, 5 min, 15 min, 1 h
const DEFAULT_PREFS = { lockOnHide: true, idleMin: 5 };

let meta = null;      // {v, salt, iterations, wrapped, fails, lockedUntil, prefs, passkey}
let heldDek = null;   // solo "modo comodidad" (passkey sin PRF): la clave queda en memoria mientras la app siga abierta

const putMeta = (m) => tx("vault", "readwrite", (s) => { s.put(m, "meta"); });

export async function loadMeta() {
  try { meta = (await idbGet("vault", "meta")) || null; } catch { meta = null; }
  setVaultMode(!!meta);
  return meta;
}
export const hasPin = () => !!meta;
export const prefs = () => ({ ...DEFAULT_PREFS, ...((meta && meta.prefs) || {}) });
export async function savePrefs(p) {
  if (!meta) return false;
  meta.prefs = { ...prefs(), ...p };
  try { await putMeta(meta); return true; } catch { return false; }
}
export const passkeyInfo = () => (meta && meta.passkey) ? { prf: !!meta.passkey.prf } : null;
export const canQuickUnlock = () => !!(meta && meta.passkey && (meta.passkey.prf || heldDek));

// Códigos demasiado fáciles
export function weakPin(pin) {
  if (/^(\d)\1+$/.test(pin)) return "No use el mismo dígito repetido.";
  const asc = "01234567890123", desc = "98765432109876";
  if (asc.includes(pin) || desc.includes(pin)) return "No use números seguidos (como 123456).";
  return "";
}

// Espera pendiente por intentos fallidos (ms)
export function waitLeft() {
  if (!meta || !meta.lockedUntil) return 0;
  return Math.max(0, meta.lockedUntil - Date.now());
}
export const failsLeft = () => Math.max(0, MAX_FREE_FAILS - ((meta && meta.fails) || 0));

async function registerFail() {
  meta.fails = (meta.fails || 0) + 1;
  if (meta.fails >= MAX_FREE_FAILS) {
    const d = DELAYS[Math.min(meta.fails - MAX_FREE_FAILS, DELAYS.length - 1)];
    meta.lockedUntil = Date.now() + d * 1000;
  }
  await putMeta(meta).catch(() => {});
}
async function registerSuccess() {
  if (meta.fails || meta.lockedUntil) { meta.fails = 0; meta.lockedUntil = 0; await putMeta(meta).catch(() => {}); }
}

// Verifica el PIN desenvolviendo la clave de datos. Devuelve {ok, dek} | {ok:false, wait} | {ok:false, wrong, left, wait}
async function checkPin(pin, extractable) {
  if (!meta) return { ok: false, error: "sin código" };
  const w = waitLeft();
  if (w) return { ok: false, wait: w };
  const kek = await deriveKek(pin, meta.salt, meta.iterations);
  try {
    const dek = await unwrapDek(meta.wrapped, kek, extractable);
    await registerSuccess();
    return { ok: true, dek };
  } catch {
    await registerFail();
    return { ok: false, wrong: true, left: failsLeft(), wait: waitLeft() };
  }
}

export async function unlockWithPin(pin) {
  const r = await checkPin(pin, false);
  if (!r.ok) return r;
  await openVault(r.dek);
  heldDek = null;
  return { ok: true };
}

// Bloquear: se borra lo descifrado y la clave (salvo modo comodidad, que conserva solo la clave)
export function lockNow() {
  const dek = currentDek();
  heldDek = (meta && meta.passkey && !meta.passkey.prf && dek) ? dek : null;
  closeVault();
}

// ---------- Crear el código (y migrar los datos en claro) ----------
export async function createPin(pin, onProgress = () => {}) {
  if (meta) throw new Error("Ya hay un código");
  onProgress("Protegiendo su código…");
  const salt = randomBytes(16);
  const kek = await deriveKek(pin, salt);
  const dekX = await newDek();
  const wrapped = await wrapDek(dekX, kek);
  const dek = await unwrapDek(wrapped, kek, false); // la copia que se usa no es extraíble
  onProgress("Cifrando sus datos…");
  // Datos actuales en claro (localStorage) y miniaturas
  const recs = [];
  const keysToSeal = [...new Set([...DATA_KEYS, ...Object.keys(localStorage).filter((k) => k.startsWith("antares.") && k !== "antares.pinOffer.v1" && k !== "antares.bdayOffer.v1")])];
  for (const k of keysToSeal) {
    const raw = localStorage.getItem(k);
    if (raw != null) recs.push([k, await seal(dek, k, raw)]);
  }
  const thumbRecs = [];
  for (const [id, v] of await thumbs.entries()) {
    if (typeof v === "string" && v) thumbRecs.push([id, await seal(dek, "thumb:" + id, v)]);
  }
  const m = { v: 1, kdf: "PBKDF2-SHA-256", salt, iterations: PBKDF2_ITERATIONS, wrapped, fails: 0, lockedUntil: 0, prefs: { ...DEFAULT_PREFS }, passkey: null, createdAt: Date.now() };
  // Todo en una sola transacción: o queda cifrado completo, o no cambia nada
  await tx(["vault", "thumbs"], "readwrite", (vs, ts) => {
    for (const [k, r] of recs) vs.put(r, k);
    for (const [id, r] of thumbRecs) ts.put(r, id);
    vs.put(m, "meta");
  });
  for (const [k] of recs) localStorage.removeItem(k); // borrar las copias en claro
  meta = m;
  await openVault(dek);
  return { ok: true, migrated: recs.length, thumbs: thumbRecs.length };
}

// ---------- Cambiar el código: solo se vuelve a envolver la clave de datos ----------
export async function changePin(oldPin, newPin) {
  const r = await checkPin(oldPin, true);
  if (!r.ok) return r;
  const salt = randomBytes(16);
  const kek = await deriveKek(newPin, salt);
  meta.salt = salt;
  meta.iterations = PBKDF2_ITERATIONS;
  meta.wrapped = await wrapDek(r.dek, kek);
  await putMeta(meta);
  return { ok: true };
}
export async function verifyPin(pin) {
  const r = await checkPin(pin, true);
  return r.ok ? { ok: true, dekX: r.dek } : r;
}

// ---------- Quitar el código: los datos vuelven a localStorage en claro ----------
export async function removePin(dekX) {
  await flushWrites();
  const data = {};
  const entries = await (await import("./vault.js")).idbEntries("vault");
  for (const [k, rec] of entries) {
    if (k === "meta" || !(rec && rec.iv)) continue;
    if (k.startsWith("antares.")) { try { data[k] = await unseal(dekX, k, rec); } catch { /* */ } }
  }
  try {
    for (const [k, raw] of Object.entries(data)) localStorage.setItem(k, raw);
  } catch {
    for (const k of Object.keys(data)) localStorage.removeItem(k);
    return { ok: false, error: "quota" };
  }
  const plainThumbs = [];
  for (const [id, v] of await thumbs.entries()) {
    if (isSealed(v)) { try { plainThumbs.push([id, await unseal(dekX, "thumb:" + id, v)]); } catch { /* */ } }
  }
  await tx(["vault", "thumbs"], "readwrite", (vs, ts) => {
    vs.clear();
    for (const [id, v] of plainThumbs) ts.put(v, id);
  });
  meta = null; heldDek = null;
  setVaultMode(false);
  return { ok: true };
}

// ---------- Passkey (Face ID / huella) ----------
const b = (buf) => new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
function uvOk(authData) {
  const flags = b(authData)[32];
  return (flags & 0x01) && (flags & 0x04); // presencia + verificación del usuario
}
export async function passkeySupported() {
  try {
    return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}
function prfFirst(cred) {
  try {
    const ext = cred.getClientExtensionResults();
    const f = ext && ext.prf && ext.prf.results && ext.prf.results.first;
    return f ? b(f) : null;
  } catch { return null; }
}
async function getAssertion(credId, prfSalt) {
  const opts = { challenge: randomBytes(32), allowCredentials: [{ type: "public-key", id: credId }], userVerification: "required", timeout: 60000 };
  if (prfSalt) opts.extensions = { prf: { eval: { first: prfSalt } } };
  const cred = await navigator.credentials.get({ publicKey: opts });
  if (!cred || !uvOk(cred.response.authenticatorData)) throw new Error("El dispositivo no confirmó su identidad.");
  return cred;
}

// dekX: clave de datos extraíble (se obtiene confirmando el código)
export async function enrollPasskey(dekX) {
  const prfSalt = randomBytes(32);
  const cred = await navigator.credentials.create({ publicKey: {
    rp: { name: "Antares" },
    user: { id: randomBytes(16), name: "antares", displayName: "Antares" },
    challenge: randomBytes(32),
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
    timeout: 60000,
    extensions: { prf: { eval: { first: prfSalt } } },
  } });
  if (!cred) throw new Error("No se creó la passkey.");
  const credId = b(cred.rawId);
  let secret = prfFirst(cred);
  let prfEnabled = false;
  try { const ext = cred.getClientExtensionResults(); prfEnabled = !!(ext.prf && (ext.prf.enabled || ext.prf.results)); } catch { /* */ }
  if (!secret && prfEnabled) {
    try { secret = prfFirst(await getAssertion(credId, prfSalt)); } catch { secret = null; }
  }
  const pk = { credId, prf: false, created: Date.now() };
  if (secret) {
    const kek2 = await prfKek(secret, prfSalt);
    pk.prf = true; pk.prfSalt = prfSalt; pk.wrapped = await wrapDek(dekX, kek2);
  }
  meta.passkey = pk;
  await putMeta(meta);
  return { ok: true, prf: pk.prf };
}

export async function disablePasskey() {
  if (!meta || !meta.passkey) return;
  const id = meta.passkey.credId;
  meta.passkey = null; heldDek = null;
  await putMeta(meta);
  try { // avisar al gestor de passkeys (navegadores recientes)
    if (PublicKeyCredential.signalUnknownCredential) {
      const b64u = btoa(String.fromCharCode(...id)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId: b64u }).catch(() => {}); // sin esperar
    }
  } catch { /* opcional */ }
}

// {ok} | {ok:false, needPin:true} | lanza si se cancela
export async function unlockWithPasskey() {
  const pk = meta && meta.passkey;
  if (!pk) return { ok: false, needPin: true };
  if (!pk.prf && !heldDek) return { ok: false, needPin: true };
  const cred = await getAssertion(pk.credId, pk.prf ? pk.prfSalt : null);
  let dek = heldDek;
  if (pk.prf) {
    const secret = prfFirst(cred);
    if (!secret) return { ok: false, needPin: true };
    dek = await unwrapDek(pk.wrapped, await prfKek(secret, pk.prfSalt), false);
  }
  await openVault(dek);
  heldDek = null;
  await registerSuccess();
  return { ok: true };
}

// ---------- Olvidó su código: borrar todo lo de Antares en este dispositivo ----------
export async function wipeEverything() {
  const id = meta && meta.passkey ? meta.passkey.credId : null;
  if (id && window.PublicKeyCredential && PublicKeyCredential.signalUnknownCredential) {
    try {
      const b64u = btoa(String.fromCharCode(...id)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      await Promise.race([PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId: b64u }), new Promise((r) => setTimeout(r, 800))]);
    } catch { /* */ }
  }
  meta = null; heldDek = null;
  closeVault();
  setVaultMode(false);
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("antares.")) localStorage.removeItem(k); } catch { /* */ }
  await deleteDatabase();
}
