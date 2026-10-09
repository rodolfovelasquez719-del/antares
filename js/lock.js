// Antares Web - Código de seguridad (PIN) y desbloqueo con passkey.
// El PIN nunca se guarda: se deriva con PBKDF2-SHA-256 (sal aleatoria, 600 000 iteraciones) a una clave
// que envuelve la clave de datos (AES-GCM-256). Un código equivocado simplemente no logra desenvolverla.
import {
  tx, idbGet, deriveKek, prfKek, newDek, wrapDek, unwrapDek, seal, unseal, isSealed,
  randomBytes, PBKDF2_ITERATIONS, deleteDatabase, deriveSecretBits, kekFromBits, comboKek,
} from "./vault.js";
import { DATA_KEYS, thumbs, openVault, closeVault, setVaultMode, currentDek, flushWrites, isUnlocked } from "./memory.js";

export const PIN_LENGTH = 6;
export const PHRASE_MIN = 10;
const MAX_FREE_FAILS = 5;
const DELAYS = [30, 60, 300, 900, 3600]; // s: 5 fallos -> 30 s; luego 1 min, 5 min, 15 min, 1 h
const DEFAULT_PREFS = { lockOnHide: true, idleMin: 5 };
const COMFORT_MS = 20 * 60 * 1000;     // modo comodidad: la clave retenida se suelta a los 20 min
const RESUME_COOLDOWN_MS = 30 * 1000;  // al reabrir con una espera vencida "según el reloj": pausa corta monótona

// meta: {v, kdf, secret:"pin"|"frase", factor:"pin"|"pin+passkey", salt, iterations, wrapped, comboSalt?,
//        fails, lock:{ms, wall}, lastWall, prefsSealed, passkey:{credId, prf, prfSalt, wrapped?, combo?}}
let meta = null;
let heldDek = null;   // solo "modo comodidad" (passkey sin PRF)
let heldUntil = 0, heldTimer = 0;
let cachedPrefs = null; // preferencias descifradas (se sellan con la clave de datos)
let monoLock = null;  // espera en curso medida con performance.now(): {end}

const putMeta = (m) => { m.lastWall = Math.max(m.lastWall || 0, Date.now()); return tx("vault", "readwrite", (s) => { s.put(m, "meta"); }); };

export async function loadMeta({ strict = false } = {}) {
  // strict: un fallo de IndexedDB se propaga (no se confunde con "no hay código")
  try { meta = (await idbGet("vault", "meta")) || null; } catch (e) { if (strict) throw e; meta = null; }
  setVaultMode(!!meta);
  if (meta) resumeLock();
  return meta;
}
export const hasPin = () => !!meta;
// solo cuando hay datos en claro en localStorage (prueba de que no hay código): seguir sin la base local
export function assumeNoPin() { meta = null; setVaultMode(false); }
export const secretType = () => (meta && meta.secret === "frase" ? "frase" : "pin");
export const factor = () => (meta && meta.factor === "pin+passkey" && meta.passkey ? "pin+passkey" : "pin");

// ---------- Preferencias: solo con la app desbloqueada y selladas con la clave de datos ----------
export const prefs = () => ({ ...DEFAULT_PREFS, ...(cachedPrefs || {}) });
async function loadPrefs(dek) {
  cachedPrefs = null;
  if (meta.prefsSealed) {
    try { cachedPrefs = JSON.parse(await unseal(dek, "prefs", meta.prefsSealed)); } catch { cachedPrefs = null; } // alteradas: valores seguros
  } else if (meta.prefs) { // migración (≤ 1.9.0 las guardaba en claro)
    cachedPrefs = { ...DEFAULT_PREFS, ...meta.prefs };
    try { meta.prefsSealed = await seal(dek, "prefs", JSON.stringify(cachedPrefs)); delete meta.prefs; await putMeta(meta); } catch { /* */ }
  }
}
export async function savePrefs(p) {
  if (!meta || !isUnlocked()) return false;
  const dek = currentDek();
  if (!dek) return false;
  const next = { ...prefs(), ...p };
  try {
    meta.prefsSealed = await seal(dek, "prefs", JSON.stringify(next));
    delete meta.prefs;
    await putMeta(meta);
    cachedPrefs = next;
    return true;
  } catch { return false; }
}
export const passkeyInfo = () => (meta && meta.passkey) ? { prf: !!meta.passkey.prf, combo: factor() === "pin+passkey" } : null;

// ---------- Modo comodidad (passkey sin PRF): la clave se suelta a los 20 min ----------
function dropHeld() { heldDek = null; heldUntil = 0; clearTimeout(heldTimer); }
function holdDek(dek) { dropHeld(); heldDek = dek; heldUntil = performance.now() + COMFORT_MS; heldTimer = setTimeout(dropHeld, COMFORT_MS); }
function heldValid() { if (heldDek && performance.now() >= heldUntil) dropHeld(); return !!heldDek; }
export const canQuickUnlock = () => !!(meta && meta.passkey && factor() === "pin" && (meta.passkey.prf || heldValid()));

// Códigos demasiado fáciles
export function weakPin(pin) {
  if (/^(\d)\1+$/.test(pin)) return "No use el mismo dígito repetido.";
  const asc = "01234567890123", desc = "98765432109876";
  if (asc.includes(pin) || desc.includes(pin)) return "No use números seguidos (como 123456).";
  return "";
}
const COMMON = ["contraseña", "contrasena", "password", "antares", "qwertyuiop", "asdfghjkl", "1234567890", "abcdefghij"];
export function weakPhrase(ph) {
  const t = String(ph || "");
  if (t.trim().length < PHRASE_MIN) return `Use al menos ${PHRASE_MIN} caracteres (por ejemplo, tres palabras).`;
  if (!/\p{L}/u.test(t)) return "Incluya letras, no solo números o símbolos.";
  if (/^(.)\1+$/u.test(t.trim())) return "No repita el mismo carácter.";
  const low = t.toLowerCase().replace(/\s+/g, "");
  if (COMMON.some((c) => low.includes(c) && low.length < c.length + 4)) return "Esa frase es demasiado común. Elija otra.";
  return "";
}
export const weakSecret = (s, type = secretType()) => (type === "frase" ? weakPhrase(s) : weakPin(s));

// ---------- Espera por intentos fallidos (resistente a cambios de reloj) ----------
// Dentro de la sesión se mide con performance.now() (no cambia si se adelanta o atrasa el reloj).
// Al reabrir se usa el reloj, pero si se atrasó la espera vuelve a empezar, y si "ya venció" se exige igual
// una pausa corta monótona: adelantar el reloj y recargar no salta la espera. Los fallos siguen escalando.
function resumeLock() {
  monoLock = null;
  const now = Date.now();
  if (!meta.lock && meta.lockedUntil) { // formato viejo (≤ 1.9.0)
    const left = meta.lockedUntil - now;
    meta.lock = left > 0 ? { ms: left, wall: now } : null;
    delete meta.lockedUntil;
  }
  const L = meta.lock;
  if (!L || !L.ms) return;
  let elapsed = now - L.wall;
  if (elapsed < 0 || (meta.lastWall && now < meta.lastWall - 2000)) { // el reloj se atrasó: empieza de nuevo
    elapsed = 0; L.wall = now; meta.lastWall = now;
    tx("vault", "readwrite", (s) => { s.put(meta, "meta"); }).catch(() => {});
  }
  const left = L.ms - elapsed;
  monoLock = { end: performance.now() + (left > 0 ? left : Math.min(RESUME_COOLDOWN_MS, L.ms)) };
}
export function waitLeft() {
  if (!meta || !monoLock) return 0;
  const left = Math.max(0, monoLock.end - performance.now());
  if (!left) { // la espera se cumplió con la app abierta (reloj monótono): ya no hace falta al reabrir
    monoLock = null;
    if (meta.lock) { meta.lock = null; putMeta(meta).catch(() => {}); }
  }
  return left;
}
export const failsLeft = () => Math.max(0, MAX_FREE_FAILS - ((meta && meta.fails) || 0));

// el intento se cuenta ANTES de derivar la clave; si acierta se descuenta (registerSuccess)
async function preFail() { meta.fails = (meta.fails || 0) + 1; await putMeta(meta).catch(() => {}); }
async function undoPreFail() { meta.fails = Math.max(0, (meta.fails || 0) - 1); await putMeta(meta).catch(() => {}); }
async function applyFail() {
  if (meta.fails >= MAX_FREE_FAILS) {
    const d = DELAYS[Math.min(meta.fails - MAX_FREE_FAILS, DELAYS.length - 1)] * 1000;
    meta.lock = { ms: d, wall: Date.now() };
    monoLock = { end: performance.now() + d };
  }
  await putMeta(meta).catch(() => {});
}
async function registerSuccess() {
  monoLock = null;
  if (meta.fails || meta.lock || meta.lockedUntil) { meta.fails = 0; meta.lock = null; delete meta.lockedUntil; await putMeta(meta).catch(() => {}); }
}

// ---------- Verificar el código / la frase ----------
// opts.tap: () => Promise<boolean>, el usuario toca «Confirmar con Face ID / huella» (modo código + passkey).
// {ok, dek, bits?, prf?} | {ok:false, wait} | {ok:false, wrong, left, wait} | {ok:false, cancelled} | {ok:false, error}
async function checkSecret(secret, { extractable = false, tap = null } = {}) {
  if (!meta) return { ok: false, error: "sin código" };
  const w = waitLeft();
  if (w) return { ok: false, wait: w };
  if (meta.lock) meta.lock = null; // la espera terminó (medida con el reloj monótono)
  monoLock = null;
  await preFail();
  let bits = null, prf = null, kek;
  try {
    bits = await deriveSecretBits(secret, meta.salt, meta.iterations);
    if (factor() === "pin+passkey") {
      if (!tap || !(await tap())) { await undoPreFail(); return { ok: false, cancelled: true }; }
      let cred;
      try { cred = await getAssertion(meta.passkey.credId, meta.passkey.prfSalt); }
      catch (e) { await undoPreFail(); return { ok: false, cancelled: e && e.name === "NotAllowedError", error: "No se pudo usar Face ID / huella." }; }
      prf = prfFirst(cred);
      if (!prf) { await undoPreFail(); return { ok: false, error: "La passkey no entregó su clave." }; }
      kek = await comboKek(bits, prf, meta.comboSalt);
    } else kek = await kekFromBits(bits);
  } catch (e) { await undoPreFail(); return { ok: false, error: String(e && e.message || e) }; }
  try {
    const dek = await unwrapDek(meta.wrapped, kek, extractable);
    await registerSuccess();
    const out = { ok: true, dek };
    if (extractable) { out.bits = bits; out.prf = prf; bits = prf = null; }
    return out;
  } catch {
    await applyFail();
    return { ok: false, wrong: true, left: failsLeft(), wait: waitLeft() };
  } finally {
    if (bits) bits.fill(0);
    if (prf) prf.fill(0);
  }
}

export async function unlockWithPin(secret, opts = {}) {
  const r = await checkSecret(secret, { tap: opts.tap });
  if (!r.ok) return r;
  await openVault(r.dek);
  await loadPrefs(r.dek);
  dropHeld();
  return { ok: true };
}

// Bloquear: se borra lo descifrado y la clave (salvo modo comodidad, que conserva solo la clave por 20 min)
export function lockNow() {
  const dek = currentDek();
  if (meta && meta.passkey && !meta.passkey.prf && factor() === "pin" && dek) holdDek(dek); else dropHeld();
  closeVault();
}

// ---------- Crear el código (y migrar los datos en claro) ----------
export async function createPin(pin, onProgress = () => {}, { type = "pin" } = {}) {
  if (meta) throw new Error("Ya hay un código");
  if (weakSecret(pin, type)) throw new Error(weakSecret(pin, type));
  onProgress(type === "frase" ? "Protegiendo su frase…" : "Protegiendo su código…");
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
  const m = { v: 2, kdf: "PBKDF2-SHA-256", secret: type === "frase" ? "frase" : "pin", factor: "pin", salt, iterations: PBKDF2_ITERATIONS, wrapped, fails: 0, lock: null,
    prefsSealed: await seal(dek, "prefs", JSON.stringify(DEFAULT_PREFS)), passkey: null, createdAt: Date.now(), lastWall: Date.now() };
  // Todo en una sola transacción: o queda cifrado completo, o no cambia nada
  await tx(["vault", "thumbs"], "readwrite", (vs, ts) => {
    for (const [k, r] of recs) vs.put(r, k);
    for (const [id, r] of thumbRecs) ts.put(r, id);
    vs.put(m, "meta");
  });
  for (const [k] of recs) localStorage.removeItem(k); // borrar las copias en claro
  meta = m;
  cachedPrefs = { ...DEFAULT_PREFS };
  await openVault(dek);
  return { ok: true, migrated: recs.length, thumbs: thumbRecs.length };
}

// ---------- Cambiar el código o pasar a frase segura: solo se vuelve a envolver la clave de datos ----------
// v: resultado de verifyPin (dekX, y en modo código + passkey también el secreto PRF)
export async function rewrap(v, newSecret, type = secretType()) {
  const weak = weakSecret(newSecret, type);
  if (weak) return { ok: false, error: weak };
  const salt = randomBytes(16);
  const bits = await deriveSecretBits(newSecret, salt);
  try {
    let kek, comboSalt = null;
    if (factor() === "pin+passkey") {
      if (!v.prf) return { ok: false, error: "Hace falta Face ID / huella para cambiar el código." };
      comboSalt = randomBytes(32);
      kek = await comboKek(bits, v.prf, comboSalt);
    } else kek = await kekFromBits(bits);
    const wrapped = await wrapDek(v.dekX, kek);
    await unwrapDek(wrapped, kek, false); // comprobar antes de reemplazar
    meta.salt = salt; meta.iterations = PBKDF2_ITERATIONS; meta.wrapped = wrapped; meta.secret = type === "frase" ? "frase" : "pin";
    if (comboSalt) meta.comboSalt = comboSalt;
    meta.v = 2;
    await putMeta(meta);
    return { ok: true };
  } finally { bits.fill(0); }
}
export async function changePin(oldPin, newPin, { type = secretType(), tap = null } = {}) {
  const r = await verifyPin(oldPin, { tap });
  if (!r.ok) return r;
  try { return await rewrap(r, newPin, type); } finally { forgetVerified(r); }
}
export async function verifyPin(pin, { tap = null } = {}) {
  const r = await checkSecret(pin, { extractable: true, tap });
  return r.ok ? { ok: true, dekX: r.dek, bits: r.bits, prf: r.prf } : r;
}
export function forgetVerified(v) { try { if (v && v.bits) v.bits.fill(0); if (v && v.prf) v.prf.fill(0); } catch { /* */ } }

// ---------- Código + passkey (requiere PRF): la copia de IndexedDB ya no basta ----------
export async function bindPasskey(v, tap = null) {
  const pk = meta && meta.passkey;
  if (!pk || !pk.prf) return { ok: false, error: "Hace falta Face ID / huella con cifrado (PRF) en este dispositivo." };
  if (tap && !(await tap())) return { ok: false, cancelled: true };
  let prf;
  try { prf = prfFirst(await getAssertion(pk.credId, pk.prfSalt)); }
  catch (e) { return { ok: false, cancelled: !!(e && e.name === "NotAllowedError"), error: "No se pudo usar Face ID / huella." }; }
  if (!prf) return { ok: false, error: "La passkey no entregó su clave." };
  try {
    const comboSalt = randomBytes(32);
    const kek = await comboKek(v.bits, prf, comboSalt);
    const wrapped = await wrapDek(v.dekX, kek);
    await unwrapDek(wrapped, await comboKek(v.bits, prf, comboSalt), false); // comprobar antes de borrar las otras envolturas
    meta.wrapped = wrapped; meta.comboSalt = comboSalt; meta.factor = "pin+passkey";
    delete pk.wrapped; pk.combo = true; // sin desbloqueo solo con passkey ni solo con código
    await putMeta(meta);
    return { ok: true };
  } finally { prf.fill(0); }
}
// vuelve a "solo código" (y Face ID / huella como atajo) con un resultado de verifyPin en modo combinado
export async function unbindPasskey(v) {
  if (factor() !== "pin+passkey") return { ok: true };
  if (!v || !v.bits) return { ok: false, error: "Confirme su código y Face ID / huella." };
  meta.wrapped = await wrapDek(v.dekX, await kekFromBits(v.bits));
  if (v.prf && meta.passkey) meta.passkey.wrapped = await wrapDek(v.dekX, await prfKek(v.prf, meta.passkey.prfSalt));
  else if (meta.passkey) meta.passkey.prf = false;
  meta.factor = "pin"; delete meta.comboSalt; if (meta.passkey) delete meta.passkey.combo;
  await putMeta(meta);
  return { ok: true };
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
  meta = null; dropHeld(); cachedPrefs = null;
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

export async function disablePasskey(v = null) {
  if (!meta || !meta.passkey) return { ok: true };
  if (factor() === "pin+passkey") { const u = await unbindPasskey(v); if (!u.ok) return u; } // nunca dejar la clave sin envoltura usable
  const id = meta.passkey.credId;
  meta.passkey = null; dropHeld();
  await putMeta(meta);
  try { // avisar al gestor de passkeys (navegadores recientes)
    if (PublicKeyCredential.signalUnknownCredential) {
      const b64u = btoa(String.fromCharCode(...id)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId: b64u }).catch(() => {}); // sin esperar
    }
  } catch { /* opcional */ }
  return { ok: true };
}

// {ok} | {ok:false, needPin:true} | lanza si se cancela
export async function unlockWithPasskey() {
  const pk = meta && meta.passkey;
  if (!pk || factor() === "pin+passkey") return { ok: false, needPin: true };
  if (!pk.prf && !heldValid()) return { ok: false, needPin: true };
  if (waitLeft()) return { ok: false, wait: waitLeft() };
  const cred = await getAssertion(pk.credId, pk.prf ? pk.prfSalt : null);
  let dek = heldDek;
  if (pk.prf) {
    const secret = prfFirst(cred);
    if (!secret) return { ok: false, needPin: true };
    dek = await unwrapDek(pk.wrapped, await prfKek(secret, pk.prfSalt), false);
  }
  await openVault(dek);
  await loadPrefs(dek);
  dropHeld();
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
  const clearLocal = () => { try { for (const k of Object.keys(localStorage)) if (k.startsWith("antares.")) localStorage.removeItem(k); } catch { /* */ } };
  const r = await deleteDatabase();
  if (!r.ok) {
    // otra pestaña la tiene abierta: no se informa éxito. La petición sigue en cola; al terminar se limpia lo demás.
    if (r.finished) r.finished = r.finished.then((ok) => { if (ok) { meta = null; dropHeld(); cachedPrefs = null; clearLocal(); } return ok; });
    return r;
  }
  meta = null; dropHeld(); cachedPrefs = null;
  closeVault();
  setVaultMode(false);
  clearLocal();
  return { ok: true };
}
