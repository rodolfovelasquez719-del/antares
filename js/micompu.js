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
}
function msg(e) { if (e.origin === location.origin && el && e.source === el.querySelector("iframe").contentWindow && e.data === "micompu:cerrar") closeMiCompu(); }
function esc(e) { if (e.key === "Escape") closeMiCompu(); }
export function closeMiCompu() {
  if (!el) return;
  const node = el; el = null;
  node.style.display = "none";
  document.body.classList.remove("ojo-on");
  document.removeEventListener("keydown", esc);
  window.removeEventListener("message", msg);
  setTimeout(() => { try { node.querySelector("iframe").src = "about:blank"; } catch { /* */ } node.remove(); }, 300);
}
export const isMiCompuOpen = () => !!el;
