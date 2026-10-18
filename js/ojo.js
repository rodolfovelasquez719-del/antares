// v1.22: vista OJO dentro de la app (prueba). Reversión: OJO_ENABLED = false.
export const OJO_ENABLED = true;
let el = null;
export function openOjo() {
  if (!OJO_ENABLED || el) return;
  el = document.createElement("div");
  el.className = "ojo-view";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Ojo: mapa de datos públicos");
  el.innerHTML = `<iframe src="muestra-ojo/?app=1" title="Ojo" allow="geolocation" referrerpolicy="strict-origin-when-cross-origin"></iframe>
    <button type="button" class="ojo-cerrar" aria-label="Cerrar Ojo">✕ Cerrar</button>`;
  el.querySelector(".ojo-cerrar").addEventListener("click", closeOjo);
  document.body.appendChild(el);
  document.body.classList.add("ojo-on");
  document.addEventListener("keydown", esc);
}
function esc(e) { if (e.key === "Escape") closeOjo(); }
// al cerrar se quita el iframe completo: se detiene todo el dibujo, la ubicación y las descargas
// v1.23.2: se oculta al instante y el globo se desmonta después (sin congelar el clic)
export function closeOjo() {
  if (!el) return;
  const node = el; el = null;
  node.style.display = "none";
  document.body.classList.remove("ojo-on");
  document.removeEventListener("keydown", esc);
  const f = node.querySelector("iframe");
  try { f && f.contentWindow && f.contentWindow.postMessage("ojo:pausa", location.origin); } catch { /* */ }
  setTimeout(() => { try { if (f) f.src = "about:blank"; } catch { /* */ } setTimeout(() => node.remove(), 0); }, 350);
}
export const isOjoOpen = () => !!el;
