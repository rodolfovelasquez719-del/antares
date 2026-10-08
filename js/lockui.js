// Antares Web - Pantalla de bloqueo y teclado de código (desbloquear, crear, cambiar, confirmar).
import * as L from "./lock.js";

const $ = (id) => document.getElementById(id);
const view = $("lock-view"), app = $("app");
const titleEl = $("lock-title"), sub = $("lock-sub"), msg = $("lock-msg"), dotsBox = $("pin-dots");
const dots = [...dotsBox.querySelectorAll("i")];
const keys = [...view.querySelectorAll(".key")];
const bioKey = $("bio-key"), bioBtn = $("bio-btn"), bioNote = $("bio-note");
const forgot = $("pin-forgot"), cancel = $("pin-cancel"), del = $("pin-del");

let mode = null;        // "unlock" | "create" | "change" | "verify"
let step = 0;
let pin = "", firstPin = "", oldPin = "";
let working = false;
let waitTimer = null;
let done = null;        // resolve del flujo actual (crear/cambiar/confirmar)
let onUnlocked = () => {};
let opener = null;

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
function disableKeys(on) { for (const k of keys) if (!k.classList.contains("off")) k.disabled = on; bioBtn.disabled = on; }

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
  if (opener && opener.isConnected && !opener.disabled) opener.focus();
  opener = null;
}
export const isShowing = () => !view.hidden;
export const isUnlockScreen = () => !view.hidden && mode === "unlock";

function setBio() {
  const pk = L.passkeyInfo();
  const quick = mode === "unlock" && L.canQuickUnlock();
  bioBtn.hidden = !quick;
  bioKey.classList.toggle("off", !quick);
  bioKey.disabled = !quick;
  bioKey.tabIndex = quick ? 0 : -1;
  if (mode === "unlock" && pk && !quick) {
    bioNote.hidden = false;
    bioNote.textContent = "Face ID / huella en modo comodidad: solo desbloquea mientras la app sigue abierta. Ahora use su código.";
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
  setBio();
  checkWait();
}

// Espera por intentos fallidos (persiste aunque se recargue la app)
function checkWait() {
  clearInterval(waitTimer);
  if (mode !== "unlock" && !(mode === "change" && step === 0) && mode !== "verify") return false;
  const left = L.waitLeft();
  if (!left) return false;
  setState("espera"); disableKeys(true); pin = ""; paint();
  const prevSub = sub.textContent;
  sub.textContent = "Por seguridad, el teclado está en pausa";
  const upd = () => {
    const l = L.waitLeft();
    if (l > 0) { msg.replaceChildren("Demasiados intentos. Espere ", Object.assign(document.createElement("span"), { className: "countdown", textContent: fmtWait(l) })); return; }
    clearInterval(waitTimer);
    disableKeys(false); setState("normal");
    sub.textContent = prevSub.startsWith("Por seguridad") ? "Ingrese su código de seguridad" : prevSub;
    say("Ya puede intentarlo de nuevo");
  };
  upd();
  waitTimer = setInterval(upd, 1000);
  return true;
}

function wrong(r, base = "Código incorrecto") {
  setState("normal"); void view.offsetWidth; setState("error");
  if (r.wait) { setTimeout(() => checkWait(), 450); say(base); }
  else say(r.left ? `${base} · ${r.left} ${r.left === 1 ? "intento restante" : "intentos restantes"}` : base);
  setTimeout(() => { pin = ""; paint(); }, 450);
}

async function complete() {
  const entered = pin;
  working = true;
  try {
    if (mode === "unlock") {
      setState("trabajando"); say("Verificando…");
      const r = await L.unlockWithPin(entered);
      if (r.ok) return success();
      if (r.wait && !r.wrong) { checkWait(); return; }
      wrong(r);
    } else if (mode === "create") {
      if (step === 0) {
        const weak = L.weakPin(entered);
        if (weak) { wrong({}, weak); return; }
        firstPin = entered; step = 1; pin = ""; paint();
        sub.textContent = "Repita el código para confirmarlo"; say("");
      } else if (entered !== firstPin) {
        step = 0; firstPin = "";
        sub.textContent = "Cree un código de 6 dígitos";
        wrong({}, "Los códigos no coinciden. Empiece de nuevo.");
      } else {
        setState("trabajando"); disableKeys(true);
        try {
          const r = await L.createPin(entered, (t) => say(t));
          setState("ok"); say("Código activado");
          finish({ ok: true, ...r });
        } catch (e) {
          console.warn("Antares: crear código", e);
          disableKeys(false); step = 0; firstPin = "";
          sub.textContent = "Cree un código de 6 dígitos";
          wrong({}, "No se pudo activar el código. Sus datos no cambiaron.");
        }
      }
    } else if (mode === "change") {
      if (step === 0) {
        setState("trabajando"); say("Verificando…");
        const r = await L.verifyPin(entered);
        if (!r.ok) { if (r.wait && !r.wrong) checkWait(); else wrong(r); return; }
        oldPin = entered; step = 1; pin = ""; paint(); setState("normal"); say("");
        sub.textContent = "Ingrese el código nuevo";
      } else if (step === 1) {
        const weak = L.weakPin(entered);
        if (weak) { wrong({}, weak); return; }
        firstPin = entered; step = 2; pin = ""; paint(); say("");
        sub.textContent = "Repita el código nuevo";
      } else if (entered !== firstPin) {
        step = 1; firstPin = "";
        sub.textContent = "Ingrese el código nuevo";
        wrong({}, "Los códigos no coinciden. Empiece de nuevo.");
      } else {
        setState("trabajando"); say("Guardando…");
        const r = await L.changePin(oldPin, entered);
        if (r.ok) { setState("ok"); say("Código cambiado"); finish({ ok: true }); }
        else wrong(r, "No se pudo cambiar el código");
      }
    } else if (mode === "verify") {
      setState("trabajando"); say("Verificando…");
      const r = await L.verifyPin(entered);
      if (r.ok) { setState("ok"); say(""); finish({ ok: true, dekX: r.dekX }); }
      else if (r.wait && !r.wrong) checkWait();
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
  if (!mode || working || pin.length >= L.PIN_LENGTH || view.dataset.lock === "espera") return;
  if (view.dataset.lock === "error" || view.dataset.lock === "ok") { setState("normal"); }
  pin += d; paint();
  if (pin.length === L.PIN_LENGTH) setTimeout(complete, 120);
}
function back() { if (working || view.dataset.lock === "espera") return; pin = pin.slice(0, -1); paint(); }

for (const k of keys) if (k.dataset.d) k.addEventListener("click", () => press(k.dataset.d));
del.addEventListener("click", back);
view.addEventListener("keydown", (e) => {
  if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
  else if (e.key === "Backspace") { e.preventDefault(); back(); }
  else if (e.key === "Escape" && mode !== "unlock") { e.preventDefault(); cancelFlow(); }
});
// También con el teclado físico aunque el foco esté en el título
document.addEventListener("keydown", (e) => {
  if (view.hidden || view.contains(e.target)) return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
});

function cancelFlow() {
  if (mode === "unlock" || working) return;
  const d = done; done = null;
  hide();
  if (d) d(null);
}
cancel.addEventListener("click", cancelFlow);

async function bio() {
  if (working) return;
  working = true; say("Esperando Face ID / huella…");
  try {
    const r = await L.unlockWithPasskey();
    if (r.ok) { working = false; return success(); }
    say("Use su código para desbloquear."); setBio();
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
  await L.wipeEverything();
  location.reload();
});

// ---------- API ----------
export function showLock(cb) {
  onUnlocked = cb || (() => {});
  if (done) { const d = done; done = null; d(null); } // un flujo abierto se cancela al bloquear
  setup("unlock", { title: "ANTARES BLOQUEADO", subText: "Ingrese su código de seguridad" });
  if (view.hidden) show(); else titleEl.focus();
}
const FLOWS = {
  create: { title: "CREAR CÓDIGO", subText: "Cree un código de 6 dígitos" },
  change: { title: "CAMBIAR CÓDIGO", subText: "Ingrese su código actual" },
  verify: { title: "CONFIRME SU CÓDIGO", subText: "Ingrese su código de seguridad" },
};
// Devuelve una promesa con el resultado, o null si se cancela
export function runPinFlow(m, subText = "") {
  return new Promise((resolve) => {
    done = resolve;
    setup(m, { ...FLOWS[m], subText: subText || FLOWS[m].subText });
    show();
  });
}
