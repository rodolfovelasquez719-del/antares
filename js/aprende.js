// v1.29: «Aprende a programar» (tutorial Robot en el laberinto) en una capa encima de la app, como Inteligencias.
// El progreso se guarda en localStorage "antaresRobotTutorial.v1", la misma clave que la muestra (mismo origen).
let el = null;
export function openAprende(tab = "") {
  if (el) return;
  el = document.createElement("div");
  el.className = "ojo-view aprende-view";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Aprende a programar");
  el.innerHTML = `<iframe title="Aprende a programar"></iframe>`;
  document.body.appendChild(el);
  document.body.classList.add("ojo-on");
  document.addEventListener("keydown", esc);
  window.addEventListener("message", msg);
  el.querySelector("iframe").src = "aprende/?app=1";
  // v1.25.4: una entrada de historial para que «atrás» (gesto de borde en iOS, botón en Android) cierre Mi compu
  try { if (!(history.state && history.state.aprende)) history.pushState({ ...(history.state || {}), aprende: 1 }, ""); } catch { /* */ }
  window.addEventListener("popstate", atras);
}
function atras() { if (el) closeAprende({ historial: true }); }
// cualquier mensaje «micompu:cerrar» del mismo origen cierra (iOS puede cambiar la identidad del iframe tras recargarlo)
function msg(e) { if (e.origin === location.origin && e.data === "aprende:cerrar") closeAprende(); }
window.__antaresCerrarAprende = () => closeAprende();
function esc(e) { if (e.key === "Escape") closeAprende(); }
export function closeAprende({ historial = false } = {}) {
  document.querySelectorAll(".aprende-view").forEach((n) => { if (n !== el) n.remove(); }); // restos de capas viejas
  if (!el) { document.body.classList.remove("ojo-on"); return; }
  const node = el; el = null;
  window.removeEventListener("popstate", atras);
  try { if (!historial && history.state && history.state.aprende) history.back(); } catch { /* */ }
  node.style.display = "none";
  document.body.classList.remove("ojo-on");
  document.removeEventListener("keydown", esc);
  window.removeEventListener("message", msg);
  setTimeout(() => { try { node.querySelector("iframe").src = "about:blank"; } catch { /* */ } node.remove(); }, 300);
}
export const isAprendeOpen = () => !!el;
