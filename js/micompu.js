// v1.25: vista «Mi compu» (Salud de la compu + Buscador propio + Noticias de CR), en una capa encima de la app como Ojo.
// La página mi-compu/ lee la dirección y la clave de la PC desde la app (window.__antaresPC) o desde lo guardado por las muestras.
let el = null;
export function openMiCompu(tab = "") {
  if (el) { if (tab) el.querySelector("iframe").contentWindow.postMessage("micompu:tab:" + tab, location.origin); return; }
  el = document.createElement("div");
  el.className = "ojo-view micompu-view";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Mi compu: salud, buscador y noticias");
  el.innerHTML = `<iframe title="Mi compu"></iframe>`;
  document.body.appendChild(el);
  document.body.classList.add("ojo-on");
  document.addEventListener("keydown", esc);
  window.addEventListener("message", msg);
  el.querySelector("iframe").src = "mi-compu/?app=1" + (tab ? "#" + tab : "");
  // v1.25.4: una entrada de historial para que «atrás» (gesto de borde en iOS, botón en Android) cierre Mi compu
  try { if (!(history.state && history.state.micompu)) history.pushState({ ...(history.state || {}), micompu: 1 }, ""); } catch { /* */ }
  window.addEventListener("popstate", atras);
}
function atras() { if (el) closeMiCompu({ historial: true }); }
// cualquier mensaje «micompu:cerrar» del mismo origen cierra (iOS puede cambiar la identidad del iframe tras recargarlo)
function msg(e) { if (e.origin === location.origin && e.data === "micompu:cerrar") closeMiCompu(); }
window.__antaresCerrarMiCompu = () => closeMiCompu();
function esc(e) { if (e.key === "Escape") closeMiCompu(); }
export function closeMiCompu({ historial = false } = {}) {
  document.querySelectorAll(".micompu-view").forEach((n) => { if (n !== el) n.remove(); }); // restos de capas viejas
  if (!el) { document.body.classList.remove("ojo-on"); return; }
  const node = el; el = null;
  window.removeEventListener("popstate", atras);
  try { if (!historial && history.state && history.state.micompu) history.back(); } catch { /* */ }
  node.style.display = "none";
  document.body.classList.remove("ojo-on");
  document.removeEventListener("keydown", esc);
  window.removeEventListener("message", msg);
  setTimeout(() => { try { node.querySelector("iframe").src = "about:blank"; } catch { /* */ } node.remove(); }, 300);
}
export const isMiCompuOpen = () => !!el;
