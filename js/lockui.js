// Antares Web - Pantalla de bloqueo y teclado de código (desbloquear, crear, cambiar, confirmar).
import * as L from "./lock.js";

const $ = (id) => document.getElementById(id);
const view = $("lock-view"), app = $("app");
const titleEl = $("lock-title"), sub = $("lock-sub"), msg = $("lock-msg"), dotsBox = $("pin-dots");
const dots = [...dotsBox.querySelectorAll("i")];
const keys = [...view.querySelectorAll(".key")];
const bioKey = $("bio-key"), bioBtn = $("bio-btn"), bioNote = $("bio-note");
const forgot = $("pin-forgot"), cancel = $("pin-cancel"), del = $("pin-del");
const keypad = $("keypad"), bioLabel = $("bio-label");
const phraseForm = $("phrase-form"), phraseInput = $("phrase-input"), phraseShow = $("phrase-show"), phraseOk = $("phrase-ok"), phraseLabel = $("phrase-label");

let mode = null;        // "unlock" | "create" | "change" | "verify"
let step = 0;
let pin = "", firstPin = "", oldPin = "";
let working = false;
let waitTimer = null;
let done = null;        // resolve del flujo actual (crear/cambiar/confirmar)
let onUnlocked = () => {};
let opener = null;
let createType = "pin";  // tipo elegido al crear
let newType = null;      // tipo nuevo al cambiar (código <-> frase)
let verified = null;     // resultado de verifyPin al cambiar (se borra al terminar)
let tapResolve = null;   // paso «Confirmar con Face ID / huella» (modo código + passkey)
let entry = "pin";
const TXT = {
  pin: { thing: "código", create: "Cree un código de 6 dígitos", repeat: "Repita el código para confirmarlo", enter: "Ingrese su código de seguridad",
    current: "Ingrese su código actual", fresh: "Ingrese el código nuevo", freshRepeat: "Repita el código nuevo", mismatch: "Los códigos no coinciden. Empiece de nuevo.", wrong: "Código incorrecto" },
  frase: { thing: "frase", create: "Escriba una frase segura (10 caracteres o más)", repeat: "Escriba la frase otra vez para confirmarla", enter: "Escriba su frase segura",
    current: "Escriba su frase actual", fresh: "Escriba la frase nueva (10 caracteres o más)", freshRepeat: "Escriba la frase nueva otra vez", mismatch: "Las frases no coinciden. Empiece de nuevo.", wrong: "Frase incorrecta" },
};
// tipo de entrada del paso actual
function entryFor() {
  if (mode === "create") return createType;
  if (mode === "change" && step > 0) return newType || L.secretType();
  return L.secretType();
}
const T = () => TXT[entryFor()];
function applyEntry() {
  entry = entryFor();
  view.dataset.entry = entry;
  const phrase = entry === "frase";
  phraseForm.hidden = !phrase;
  keypad.hidden = phrase;
  dotsBox.hidden = phrase;
  phraseInput.value = "";
  phraseInput.type = "password"; phraseShow.setAttribute("aria-pressed", "false"); phraseShow.setAttribute("aria-label", "Mostrar la frase");
  phraseLabel.textContent = sub.textContent || "Frase segura";
  phraseInput.setAttribute("autocomplete", mode === "create" || (mode === "change" && step > 0) ? "new-password" : "current-password");
  phraseOk.textContent = mode === "unlock" ? "Desbloquear" : "Continuar";
  if (phrase && !view.hidden) setTimeout(() => { if (!phraseInput.disabled) phraseInput.focus(); }, 60);
}

const fmtWait = (ms) => {
  const s = Math.ceil(ms / 1000);
  return s >= 120 ? `${Math.ceil(s / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? (s % 60) + " s" : ""}`.trim() : `${s} s`;
};
function setState(s) { view.dataset.lock = s; }
function say(t) { msg.textContent = t || "\u00a0"; }
function paint() {
  dots.forEach((d, i) => d.classList.toggle("on", i < pin.length));
  dotsBox.setAttribute("aria-label", `${pin.length} de ${L.PIN_LENGTH} dígitos ingresados`);
}
function disableKeys(on) { for (const k of keys) if (!k.classList.contains("off")) k.disabled = on; bioBtn.disabled = on; phraseInput.disabled = on; phraseOk.disabled = on; }

function show() {
  opener = document.activeElement;
  view.hidden = false;
  app.inert = true;
  app.setAttribute("aria-hidden", "true");
  document.body.classList.add("locked");
  requestAnimationFrame(() => titleEl.focus());
}
function hide() {
  view.hidden = true;
  app.inert = false;
  app.removeAttribute("aria-hidden");
  document.body.classList.remove("locked");
  clearInterval(waitTimer);
  mode = null; pin = firstPin = oldPin = ""; paint();
  phraseInput.value = ""; L.forgetVerified(verified); verified = null;
  if (tapResolve) { const r = tapResolve; tapResolve = null; r(false); }
  if (opener && opener.isConnected && !opener.disabled) opener.focus();
  opener = null;
}
export const isShowing = () => !view.hidden;
export const isUnlockScreen = () => !view.hidden && mode === "unlock";

function setBio() {
  const pk = L.passkeyInfo();
  const quick = mode === "unlock" && L.canQuickUnlock();
  bioLabel.textContent = "Usar Face ID / huella";
  bioBtn.hidden = !quick;
  bioKey.classList.toggle("off", !quick);
  bioKey.disabled = !quick;
  bioKey.tabIndex = quick ? 0 : -1;
  if (pk && pk.combo && (mode === "unlock" || mode === "verify" || (mode === "change" && step === 0))) {
    bioNote.hidden = false;
    bioNote.textContent = `Protección doble: primero su ${T().thing} y después Face ID / huella.`;
  } else if (mode === "unlock" && pk && !quick) {
    bioNote.hidden = false;
    bioNote.textContent = `Face ID / huella en modo comodidad: solo desbloquea mientras la app sigue abierta (hasta 20 min). Ahora use su ${T().thing}.`;
  } else if (quick && pk && !pk.prf) {
    bioNote.hidden = false;
    bioNote.textContent = "Modo comodidad: Face ID / huella solo funciona mientras la app sigue abierta.";
  } else bioNote.hidden = true;
}

function setup(m, { title, subText }) {
  mode = m; step = 0; pin = firstPin = oldPin = ""; working = false;
  titleEl.textContent = title;
  sub.textContent = subText;
  forgot.hidden = m !== "unlock";
  cancel.hidden = m === "unlock";
  setState("normal"); say(""); paint();
  disableKeys(false);
  applyEntry();
  setBio();
  checkWait();
}
// paso intermedio: el usuario toca para confirmar con Face ID / huella (WebAuthn necesita un toque)
function askTap() {
  return new Promise((resolve) => {
    tapResolve = resolve;
    setState("factor");
    say("Ahora confirme con Face ID / huella");
    bioLabel.textContent = "Confirmar con Face ID / huella";
    bioBtn.hidden = false; bioBtn.disabled = false;
    cancel.hidden = false;
    requestAnimationFrame(() => bioBtn.focus());
  });
}
function endTap() { setBio(); cancel.hidden = mode === "unlock"; }

// Espera por intentos fallidos (persiste aunque se recargue la app)
function checkWait() {
  clearInterval(waitTimer);
  if (mode !== "unlock" && !(mode === "change" && step === 0) && mode !== "verify") return false;
  const left = L.waitLeft();
  if (!left) return false;
  setState("espera"); disableKeys(true); pin = ""; paint(); phraseInput.value = "";
  const prevSub = sub.textContent;
  sub.textContent = "Por seguridad, el teclado está en pausa";
  const upd = () => {
    const l = L.waitLeft();
    if (l > 0) { msg.replaceChildren("Demasiados intentos. Espere ", Object.assign(document.createElement("span"), { className: "countdown", textContent: fmtWait(l) })); return; }
    clearInterval(waitTimer);
    disableKeys(false); setState("normal");
    sub.textContent = prevSub.startsWith("Por seguridad") ? T().enter : prevSub;
    say("Ya puede intentarlo de nuevo");
    if (entry === "frase") phraseInput.focus();
  };
  upd();
  waitTimer = setInterval(upd, 1000);
  return true;
}

function wrong(r, base = T().wrong) {
  setState("normal"); void view.offsetWidth; setState("error");
  if (r.wait) { setTimeout(() => checkWait(), 450); say(base); }
  else say(r.left ? `${base} · ${r.left} ${r.left === 1 ? "intento restante" : "intentos restantes"}` : base);
  setTimeout(() => { pin = ""; paint(); phraseInput.value = ""; if (entry === "frase" && !phraseInput.disabled) phraseInput.focus(); }, 450);
}
// resultado sin código equivocado: se canceló Face ID / huella o falló el dispositivo
function softFail(r) {
  endTap(); setState("normal"); pin = ""; paint(); phraseInput.value = "";
  say(r.cancelled ? "Se canceló Face ID / huella. Inténtelo de nuevo." : (r.error || "No se pudo verificar."));
}

async function complete(value) {
  const entered = value != null ? value : pin;
  working = true;
  const tap = async () => { working = false; const ok = await askTap(); working = true; endTap(); setState("trabajando"); say("Verificando…"); return ok; };
  try {
    if (mode === "unlock") {
      setState("trabajando"); say("Verificando…");
      const r = await L.unlockWithPin(entered, { tap });
      if (r.ok) return success();
      if (r.wait && !r.wrong) { checkWait(); return; }
      if (!r.wrong) { softFail(r); return; }
      wrong(r);
    } else if (mode === "create") {
      if (step === 0) {
        const weak = L.weakSecret(entered, createType);
        if (weak) { wrong({}, weak); return; }
        firstPin = entered; step = 1; pin = ""; paint();
        sub.textContent = T().repeat; say(""); applyEntry();
      } else if (entered !== firstPin) {
        step = 0; firstPin = "";
        sub.textContent = T().create; applyEntry();
        wrong({}, T().mismatch);
      } else {
        setState("trabajando"); disableKeys(true);
        try {
          const r = await L.createPin(entered, (t) => say(t), { type: createType });
          setState("ok"); say(createType === "frase" ? "Frase activada" : "Código activado");
          finish({ ok: true, ...r });
        } catch (e) {
          console.warn("Antares: crear código", e && e.name);
          disableKeys(false); step = 0; firstPin = "";
          sub.textContent = T().create; applyEntry();
          wrong({}, "No se pudo activar la protección. Sus datos no cambiaron.");
        }
      }
    } else if (mode === "change") {
      if (step === 0) {
        setState("trabajando"); say("Verificando…");
        const r = await L.verifyPin(entered, { tap });
        if (!r.ok) { if (r.wait && !r.wrong) checkWait(); else if (!r.wrong) softFail(r); else wrong(r); return; }
        verified = r; step = 1; pin = ""; paint(); setState("normal"); say("");
        sub.textContent = T().fresh; applyEntry(); setBio();
      } else if (step === 1) {
        const weak = L.weakSecret(entered, newType || L.secretType());
        if (weak) { wrong({}, weak); return; }
        firstPin = entered; step = 2; pin = ""; paint(); say("");
        sub.textContent = T().freshRepeat; applyEntry();
      } else if (entered !== firstPin) {
        step = 1; firstPin = "";
        sub.textContent = T().fresh; applyEntry();
        wrong({}, T().mismatch);
      } else {
        setState("trabajando"); say("Guardando…");
        const type = newType || L.secretType();
        const r = await L.rewrap(verified, entered, type);
        L.forgetVerified(verified); verified = null;
        if (r.ok) { setState("ok"); say(type === "frase" ? "Frase guardada" : "Código cambiado"); finish({ ok: true, type }); }
        else { step = 1; firstPin = ""; wrong(r, r.error || "No se pudo cambiar"); }
      }
    } else if (mode === "verify") {
      setState("trabajando"); say("Verificando…");
      const r = await L.verifyPin(entered, { tap });
      if (r.ok) { setState("ok"); say(""); finish({ ok: true, dekX: r.dekX, bits: r.bits, prf: r.prf }); }
      else if (r.wait && !r.wrong) checkWait();
      else if (!r.wrong) softFail(r);
      else wrong(r);
    }
  } finally {
    working = false;
  }
}

function success() {
  setState("ok");
  say("Desbloqueado");
  disableKeys(true);
  opener = null; // no devolver el foco a un campo (abriría el teclado)
  setTimeout(() => { hide(); onUnlocked(); }, 350);
}
function finish(result) {
  const d = done; done = null;
  setTimeout(() => { hide(); if (d) d(result); }, 450);
}

function press(d) {
  if (!mode || working || tapResolve || pin.length >= L.PIN_LENGTH || view.dataset.lock === "espera") return;
  if (view.dataset.lock === "error" || view.dataset.lock === "ok") { setState("normal"); }
  pin += d; paint();
  if (pin.length === L.PIN_LENGTH) setTimeout(() => complete(pin), 120);
}
phraseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!mode || working || tapResolve || view.dataset.lock === "espera" || entry !== "frase") return;
  const v = phraseInput.value;
  if (!v) { say(`Escriba su ${T().thing}`); return; }
  if (view.dataset.lock === "error" || view.dataset.lock === "ok") setState("normal");
  complete(v);
});
phraseShow.addEventListener("click", () => {
  const show = phraseInput.type === "password";
  phraseInput.type = show ? "text" : "password";
  phraseShow.setAttribute("aria-pressed", String(show));
  phraseShow.setAttribute("aria-label", show ? "Ocultar la frase" : "Mostrar la frase");
  phraseInput.focus();
});
function back() { if (working || view.dataset.lock === "espera") return; pin = pin.slice(0, -1); paint(); }

for (const k of keys) if (k.dataset.d) k.addEventListener("click", () => press(k.dataset.d));
del.addEventListener("click", back);
view.addEventListener("keydown", (e) => {
  if (e.target === phraseInput) { if (e.key === "Escape" && mode !== "unlock") { e.preventDefault(); cancelFlow(); } return; }
  if (entry === "frase") return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
  else if (e.key === "Backspace") { e.preventDefault(); back(); }
  else if (e.key === "Escape" && mode !== "unlock") { e.preventDefault(); cancelFlow(); }
});
// También con el teclado físico aunque el foco esté en el título
document.addEventListener("keydown", (e) => {
  if (view.hidden || view.contains(e.target) || entry === "frase") return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
});

function cancelFlow() {
  if (tapResolve) { const r = tapResolve; tapResolve = null; r(false); return; }
  if (mode === "unlock" || working) return;
  const d = done; done = null;
  hide();
  if (d) d(null);
}
cancel.addEventListener("click", cancelFlow);

async function bio() {
  if (tapResolve) { const r = tapResolve; tapResolve = null; r(true); return; }
  if (working) return;
  working = true; say("Esperando Face ID / huella…");
  try {
    const r = await L.unlockWithPasskey();
    if (r.ok) { working = false; return success(); }
    if (r.wait) { checkWait(); return; }
    say(`Use su ${T().thing} para desbloquear.`); setBio();
  } catch (e) {
    say(e && e.name === "NotAllowedError" ? "Se canceló Face ID / huella. Puede usar su código." : "No se pudo usar Face ID / huella. Use su código.");
  } finally { working = false; }
}
bioBtn.addEventListener("click", bio);
bioKey.addEventListener("click", bio);

forgot.addEventListener("click", async () => {
  if (!confirm("Sin servidor no hay forma de recuperar su código.\n\nPuede borrar los datos de Antares en este dispositivo (API key, conversación y memoria) y empezar de nuevo. ¿Desea continuar?")) return;
  if (!confirm("¿Está seguro? Se borrarán definitivamente la key, la conversación, la memoria y el código de este dispositivo. Esta acción no se puede deshacer.")) return;
  setState("trabajando"); say("Borrando los datos…"); disableKeys(true);
  const r = await L.wipeEverything();
  if (r.ok) { location.reload(); return; }
  if (r.blocked) {
    // otra pestaña o ventana de Antares tiene la base abierta: el borrado espera a que se cierre
    setState("espera");
    say("Cierre las otras pestañas o ventanas de Antares para terminar el borrado.");
    const done = r.finished ? await r.finished : false;
    if (done) { location.reload(); return; }
  }
  disableKeys(false); setState("error");
  say("No se pudo borrar todo. Cierre las otras pestañas de Antares e inténtelo de nuevo.");
});

// ---------- API ----------
export function showLock(cb) {
  onUnlocked = cb || (() => {});
  if (done) { const d = done; done = null; d(null); } // un flujo abierto se cancela al bloquear
  setup("unlock", { title: "ANTARES BLOQUEADO", subText: TXT[L.secretType()].enter });
  if (view.hidden) show(); else titleEl.focus();
}
const FLOWS = {
  create: (o) => ({ title: o.type === "frase" ? "CREAR FRASE SEGURA" : "CREAR CÓDIGO", subText: TXT[o.type || "pin"].create }),
  change: (o) => ({ title: o.newType && o.newType !== L.secretType() ? (o.newType === "frase" ? "PASAR A FRASE SEGURA" : "PASAR A CÓDIGO") : (L.secretType() === "frase" ? "CAMBIAR FRASE" : "CAMBIAR CÓDIGO"), subText: TXT[L.secretType()].current }),
  verify: () => ({ title: L.secretType() === "frase" ? "CONFIRME SU FRASE" : "CONFIRME SU CÓDIGO", subText: TXT[L.secretType()].enter }),
};
// Devuelve una promesa con el resultado, o null si se cancela. opts: {type} al crear, {newType} al cambiar
export function runPinFlow(m, subText = "", opts = {}) {
  return new Promise((resolve) => {
    done = resolve;
    createType = opts.type === "frase" ? "frase" : "pin";
    newType = opts.newType || null;
    const f = FLOWS[m](opts);
    show();
    setup(m, { ...f, subText: subText || f.subText });
  });
}
// Paso suelto «Confirmar con Face ID / huella» (al unir código y passkey). true si el usuario tocó, false si canceló
export function runTapFlow(title, subText) {
  return new Promise((resolve) => {
    mode = "tap"; step = 0; working = false;
    titleEl.textContent = title; sub.textContent = subText;
    forgot.hidden = true; keypad.hidden = true; dotsBox.hidden = true; phraseForm.hidden = true; bioNote.hidden = true;
    show();
    askTap().then((ok) => { hide(); resolve(ok); });
  });
}
