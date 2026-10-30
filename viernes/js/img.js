// Viernes - carga segura de fotos: reduce tamaño (memoria) y avisa si el formato no sirve.
export async function loadCanvas(file, max = 1600) {
  if (!file) return null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    return c;
  } catch (e) {
    const t = document.getElementById("toast"); if (t) { t.textContent = "No pude abrir esa foto. Prueba con otra (JPG o PNG)."; t.classList.remove("hidden"); setTimeout(() => t.classList.add("hidden"), 3500); }
    return null;
  }
}
// Evita doble toque: desactiva el botón mientras trabaja
export function busy(btn, fn) {
  return async (...a) => { if (btn.dataset.busy) return; btn.dataset.busy = "1"; btn.disabled = true; btn.setAttribute("aria-busy", "true");
    try { return await fn(...a); } finally { delete btn.dataset.busy; btn.disabled = false; btn.removeAttribute("aria-busy"); } };
}
