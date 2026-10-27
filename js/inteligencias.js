// v1.26: «Panel de inteligencias» (Antares jefe + Ruta, Guardián, Hogar, Tutor, Taller) en una capa encima de la app, como Mi compu.
let el = null;
export function openIntel(tab = "") {
  if (el) { if (tab) el.querySelector("iframe").contentWindow.postMessage("intel:tab:" + tab, location.origin); return; }
  el = document.createElement("div");
  el.className = "ojo-view intel-view";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Panel de inteligencias");
  el.innerHTML = `<iframe title="Panel de inteligencias"></iframe>`;
  document.body.appendChild(el);
  document.body.classList.add("ojo-on");
  document.addEventListener("keydown", esc);
  window.addEventListener("message", msg);
  el.querySelector("iframe").src = "inteligencias/?app=1" + (tab ? "#" + tab : "");
  // v1.25.4: una entrada de historial para que «atrás» (gesto de borde en iOS, botón en Android) cierre Mi compu
  try { if (!(history.state && history.state.intel)) history.pushState({ ...(history.state || {}), intel: 1 }, ""); } catch { /* */ }
  window.addEventListener("popstate", atras);
}
function atras() { if (el) closeIntel({ historial: true }); }
// cualquier mensaje «micompu:cerrar» del mismo origen cierra (iOS puede cambiar la identidad del iframe tras recargarlo)
function msg(e) { if (e.origin === location.origin && e.data === "intel:cerrar") closeIntel(); }
window.__antaresCerrarIntel = () => closeIntel();
function esc(e) { if (e.key === "Escape") closeIntel(); }
export function closeIntel({ historial = false } = {}) {
  document.querySelectorAll(".intel-view").forEach((n) => { if (n !== el) n.remove(); }); // restos de capas viejas
  if (!el) { document.body.classList.remove("ojo-on"); return; }
  const node = el; el = null;
  window.removeEventListener("popstate", atras);
  try { if (!historial && history.state && history.state.intel) history.back(); } catch { /* */ }
  node.style.display = "none";
  document.body.classList.remove("ojo-on");
  document.removeEventListener("keydown", esc);
  window.removeEventListener("message", msg);
  setTimeout(() => { try { node.querySelector("iframe").src = "about:blank"; } catch { /* */ } node.remove(); }, 300);
}
export const isIntelOpen = () => !!el;
