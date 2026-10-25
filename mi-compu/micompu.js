// Antares v1.25 · Mi compu: pestañas SALUD / BUSCADOR / NOTICIAS CR.
import { $, creds, guardarLocal, URL_PC } from "./comun.js";
import { iniciarSalud, recargarSalud } from "./salud.js";
import { iniciarBuscador, recargarNoticias } from "./buscador.js";
const APP = new URLSearchParams(location.search).has("app") && window.parent !== window;
document.body.classList.toggle("app", APP);
$("#conf-app").hidden = !APP;
// v1.25.4: «Cerrar» SIEMPRE vuelve a la app. 1) dentro de la app: llamada directa + mensaje a la ventana de arriba;
// 2) si en 450 ms sigue abierto (o es una página suelta, p. ej. tras recargar), navega a la raíz de la app.
const RAIZ = new URL("../", location.href).href; // …/antares/
function irALaApp() {
  let arriba = window;
  try { if (window.top !== window && window.top.location.origin === location.origin) arriba = window.top; } catch { arriba = window; }
  try {
    const ref = document.referrer && new URL(document.referrer);
    if (arriba === window && history.length > 1 && ref && ref.origin === location.origin && !ref.pathname.includes("/mi-compu/")) { history.back(); setTimeout(() => location.replace(RAIZ), 700); return; }
  } catch { /* */ }
  arriba.location.replace(RAIZ);
}
let cerrando = false;
const cerrar = () => {
  if (cerrando) return; cerrando = true; setTimeout(() => { cerrando = false; }, 1200);
  if (window.parent !== window) {
    let directo = false;
    try { const f = window.parent.__antaresCerrarMiCompu; if (typeof f === "function") { f(); directo = true; } } catch { /* */ }
    try { window.parent.postMessage("micompu:cerrar", location.origin); } catch { /* */ }
    setTimeout(() => {
      // si la capa sigue a la vista (mensaje perdido, iOS), salir navegando
      let visible = true;
      try { const fe = window.frameElement; visible = !!(fe && fe.isConnected && fe.getClientRects().length); } catch { visible = !directo; }
      if (visible) irALaApp();
    }, 450);
  } else irALaApp();
};
$("#cerrar").addEventListener("click", cerrar);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
function ver(v) {
  if (!["salud", "buscar", "noticias"].includes(v)) v = "salud";
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === v)));
  document.querySelectorAll(".vista").forEach((s) => s.classList.toggle("on", s.id === "v-" + v));
  try { sessionStorage.setItem("micompu.tab", v); } catch { /* */ }
}
document.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) ver(b.dataset.v); });
window.addEventListener("message", (e) => { if (e.origin === location.origin && typeof e.data === "string" && e.data.startsWith("micompu:tab:")) ver(e.data.slice(12)); });
ver(location.hash.slice(1) || sessionStorage.getItem("micompu.tab") || "salud");
const c = creds();
$("#url").value = c.url || URL_PC; $("#tok").value = APP ? "" : c.tok || "";
const CORTA = "Esa no parece la clave de la compu; use el QR de la compu (acceso «Emparejar teléfono con Antares» en el escritorio de la PC).";
const avisoTok = () => { const t = $("#tok").value.replace(/\s+/g, ""), a = $("#tok-aviso"); a.hidden = !(t && t.length < 30); a.textContent = CORTA; return a.hidden; };
$("#tok").addEventListener("input", avisoTok);
$("#guardar").addEventListener("click", () => {
  const url = $("#url").value.trim().replace(/\/+$/, ""), tok = $("#tok").value.replace(/\s+/g, "");
  if (tok && !avisoTok()) return;
  let app = null; try { app = APP && window.parent.__antaresGuardarPC; } catch { /* */ }
  if (app) { if (tok) app(url, tok); } else guardarLocal(url, tok);
  $("#conf").open = false; recargarSalud(); recargarNoticias();
});
if (!c.tok) $("#conf").open = true;
// v1.25.2: escanear el QR de la compu sin escribir la clave
const escaner = import("../js/escaner.js"); let mod = null; escaner.then((m) => { mod = m; });
const lanzar = async (img) => {
  let app = null, emp = null; try { app = APP && window.parent.__antaresEscanearPC; emp = APP && window.parent.__antaresEmparejarTexto; } catch { /* */ }
  if (img && emp) {
    const { elegirImagenQR } = mod || await escaner; const r = await elegirImagenQR(); if (!r) return;
    if (r.error) { const a = $("#tok-aviso"); a.hidden = false; a.textContent = r.error; return; }
    if (await emp(r.texto, true)) $("#conf").open = false;
  } else if (!img && app) { if (await app()) $("#conf").open = false; }
  else {
    const { escanearQR, leerQRCompu, elegirImagenQR } = mod || await escaner;
    let t;
    if (img) { const r = await elegirImagenQR(); if (!r) return; if (r.error) { const a = $("#tok-aviso"); a.hidden = false; a.textContent = r.error; return; } t = r.texto; }
    else { t = await escanearQR(); if (t == null) return; }
    const q = leerQRCompu(t);
    if (!q || q.tok.length < 30) { const a = $("#tok-aviso"); a.hidden = false; a.textContent = "Ese QR no trae la clave de la compu. Use el de «Emparejar teléfono con Antares»."; return; }
    guardarLocal(q.url || $("#url").value.trim().replace(/\/+$/, "") || URL_PC, q.tok); $("#conf").open = false;
    if (img) { const a = $("#tok-aviso"); a.hidden = false; a.textContent = "Listo. Por seguridad, borre esa foto del QR de su galería."; }
  }
  recargarSalud(); recargarNoticias();
};
$("#escanear").addEventListener("click", () => lanzar(false));
$("#imagen").addEventListener("click", () => lanzar(true));
iniciarSalud(); iniciarBuscador();
