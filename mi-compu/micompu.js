// Antares v1.25 · Mi compu: pestañas SALUD / BUSCADOR / NOTICIAS CR.
import { $, creds, guardarLocal, URL_PC } from "./comun.js";
import { iniciarSalud, recargarSalud } from "./salud.js";
import { iniciarBuscador, recargarNoticias } from "./buscador.js";
const APP = new URLSearchParams(location.search).has("app") && window.parent !== window;
document.body.classList.toggle("app", APP);
$("#conf-app").hidden = !APP;
const cerrar = () => window.parent.postMessage("micompu:cerrar", location.origin);
$("#cerrar").addEventListener("click", cerrar);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && APP) cerrar(); });
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
$("#guardar").addEventListener("click", () => { guardarLocal($("#url").value.trim().replace(/\/+$/, ""), $("#tok").value.trim()); $("#conf").open = false; recargarSalud(); recargarNoticias(); });
if (!c.tok) $("#conf").open = true;
iniciarSalud(); iniciarBuscador();
