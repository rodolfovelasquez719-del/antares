// v1.22: vista OJO dentro de la app. Reversión: OJO_ENABLED = false.
// v1.24: modo COSTA RICA (Ojo CR: corredores, lluvia, Mi ruta, sismos, volcanes, Waze aparte, Google Earth).
// Reversión solo de Ojo CR: OJO_CR_ENABLED = false (vuelve al globo de v1.23).
export const OJO_ENABLED = true;
export const OJO_CR_ENABLED = true;
let el = null, modo = "cr", tCambio = 0;
const SRC = { mundo: "muestra-ojo/?app=1", cr: "ojo-cr/?app=1" };
export function openOjo(m, hash = "") {
  if (!OJO_ENABLED) return;
  m = OJO_CR_ENABLED ? (m === "mundo" ? "mundo" : "cr") : "mundo";
  if (el) { if (m !== modo || hash) cambiar(m, hash); return; }
  el = document.createElement("div");
  el.className = "ojo-view";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Ojo: mapa de datos públicos");
  el.innerHTML = `<iframe title="Ojo" allow="geolocation" referrerpolicy="strict-origin-when-cross-origin"></iframe>
    <div class="ojo-bar"><button type="button" class="ojo-cerrar" aria-label="Cerrar Ojo">✕ Cerrar</button></div>
    ${OJO_CR_ENABLED ? `<button type="button" class="ojo-cr-btn" aria-label="Cambiar a Ojo Costa Rica">🇨🇷 COSTA RICA</button>` : ""}`;
  // v1.24.1: «Cerrar» no reacciona justo después de cambiar de modo (evita que un doble clic cierre Ojo)
  el.querySelector(".ojo-cerrar").addEventListener("click", () => { if (performance.now() - tCambio > 1200) closeOjo(); });
  // «COSTA RICA» va en otro lugar que «CERRAR» y responde al primer toque aunque el globo esté animando
  const cb = el.querySelector(".ojo-cr-btn"); if (cb) cb.addEventListener("pointerdown", (e) => { if (e.button === 0) { e.preventDefault(); cambiar("cr"); } }), cb.addEventListener("click", () => { if (modo !== "cr") cambiar("cr"); });
  document.body.appendChild(el);
  document.body.classList.add("ojo-on");
  document.addEventListener("keydown", esc);
  window.addEventListener("message", msg);
  cambiar(m, hash);
}
function cambiar(m, hash = "") {
  if (!el) return;
  const f = el.querySelector("iframe");
  try { f.contentWindow && f.contentWindow.postMessage("ojo:pausa", location.origin); } catch { /* */ }
  modo = m; tCambio = performance.now();
  el.dataset.modo = m; // en modo CR los botones (MUNDO / CERRAR) los dibuja la propia página
  f.src = SRC[m] + (hash ? "#" + hash : "");
}
function msg(e) {
  if (e.origin !== location.origin || !el || e.source !== el.querySelector("iframe").contentWindow) return;
  if (e.data === "ojo:cerrar") closeOjo(); else if (e.data === "ojo:mundo") cambiar("mundo");
}
function esc(e) { if (e.key === "Escape") closeOjo(); }
// al cerrar se quita el iframe completo: se detiene todo el dibujo, la ubicación, los paneles de Waze/Google y las descargas
// v1.23.2: se oculta al instante y el mapa se desmonta después (sin congelar el clic)
export function closeOjo() {
  if (!el) return;
  const node = el; el = null;
  node.style.display = "none";
  document.body.classList.remove("ojo-on");
  document.removeEventListener("keydown", esc);
  window.removeEventListener("message", msg);
  const f = node.querySelector("iframe");
  try { f && f.contentWindow && f.contentWindow.postMessage("ojo:pausa", location.origin); } catch { /* */ }
  setTimeout(() => { try { if (f) f.src = "about:blank"; } catch { /* */ } setTimeout(() => node.remove(), 0); }, 350);
}
export const isOjoOpen = () => !!el;
