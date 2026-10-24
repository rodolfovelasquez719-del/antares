// v1.25.2: escáner de QR dentro de la app (sirve en el iPhone, donde el QR abierto en Safari no llega a la app instalada).
// Usa BarcodeDetector si existe; si no (Safari de iOS), jsQR local (vendor/jsqr, Apache-2.0). Nada sale del teléfono.
let jsqrCarga = null;
function cargarJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsqrCarga) jsqrCarga = new Promise((ok, mal) => {
    const s = document.createElement("script"); s.src = new URL("../vendor/jsqr/jsQR.js?v=1.25.3", import.meta.url).href;
    s.onload = () => (window.jsQR ? ok(window.jsQR) : mal(new Error("jsQR"))); s.onerror = () => { jsqrCarga = null; mal(new Error("jsQR")); };
    document.head.appendChild(s);
  });
  return jsqrCarga;
}

function estilos() {
  if (document.getElementById("qr-escaner-css")) return;
  const st = document.createElement("style"); st.id = "qr-escaner-css";
  st.textContent = `.qr-escaner{position:fixed;inset:0;z-index:10000;background:#020805f2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:calc(env(safe-area-inset-top,0px) + 16px) 16px calc(env(safe-area-inset-bottom,0px) + 16px);color:#c8ffe0;text-align:center}\n.qr-top{color:#2bff9a;letter-spacing:.08em;font-size:1.05em}\n.qr-marco{position:relative;width:min(86vw,62vh,460px);aspect-ratio:1;border-radius:18px;overflow:hidden;border:1px solid #2bff9a88;box-shadow:0 0 30px #2bff9a33;background:#000}\n.qr-marco video{width:100%;height:100%;object-fit:cover;display:block}\n.qr-mira{position:absolute;inset:14%;border:3px solid #2bff9a;border-radius:14px;box-shadow:0 0 0 999px #0006}\n.qr-msg{max-width:460px;margin:0;line-height:1.4}.qr-msg.mal{color:#ff5c7a}\n.qr-cancelar{min-width:160px}\n.qr-botones{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}\n.qr-imagen.destacar{box-shadow:0 0 0 2px #2bff9a,0 0 24px #2bff9a66}`;
  document.head.appendChild(st);
}

// Saca la clave (y la dirección, si viene) del texto del QR: enlace con #pc-token=… o la clave sola.
export function leerQRCompu(texto) {
  const t = String(texto || "").trim();
  if (!t) return null;
  const i = t.indexOf("#");
  if (i >= 0 || /^https?:/i.test(t)) {
    const p = new URLSearchParams(i >= 0 ? t.slice(i + 1) : "");
    const tok = (p.get("pc-token") || "").replace(/\s+/g, "");
    if (!tok) return null;
    const url = (p.get("pc-url") || "").trim().replace(/\/+$/, "");
    return { tok, url: /^https:\/\/[^\s/]+$/i.test(url) ? url : "" };
  }
  return /^[A-Za-z0-9_.\-]+$/.test(t) ? { tok: t, url: "" } : null;
}

// Decodifica una imagen (ImageData) con jsQR; útil también para pruebas.
export async function decodificarImagen(img) {
  const jsQR = await cargarJsQR();
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
  return r ? r.data : null;
}

let ultima = "camara";
export const ultimaFuente = () => ultima; // "camara" | "imagen": de dónde salió el último QR

// v1.25.3: leer el QR de una imagen guardada (galería). Prueba varias pasadas: ~1500 px, tamaño original,
// gris con contraste y una versión pequeña. BarcodeDetector si existe; si no, jsQR.
const NO_QR = "No encontré un QR en esa imagen. Pruebe con una captura de pantalla más cercana al QR.";
async function abrirImagen(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file); } catch { /* sigue con <img> */ } }
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export async function decodificarArchivo(file) {
  let img;
  try { img = await abrirImagen(file); } catch { return { error: NO_QR + " (Si es una foto HEIC, haga una captura de pantalla del QR y elija esa.)" }; }
  const W = img.width || img.naturalWidth, H = img.height || img.naturalHeight;
  if (!W || !H) return { error: NO_QR };
  let detector = null;
  try { if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code")) detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch { detector = null; }
  if (!detector) { try { await cargarJsQR(); } catch { return { error: "No pude cargar el lector de QR. Revise la conexión e intente de nuevo." }; } }
  const pasada = async (lado, gris) => {
    const k = Math.min(1, lado / Math.max(W, H)), cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(W * k)); cv.height = Math.max(1, Math.round(H * k));
    const x = cv.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, cv.width, cv.height);
    let d = x.getImageData(0, 0, cv.width, cv.height);
    if (gris) { const a = d.data; for (let i = 0; i < a.length; i += 4) { const g = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2], v = Math.max(0, Math.min(255, (g - 128) * 1.8 + 128)); a[i] = a[i + 1] = a[i + 2] = v; } x.putImageData(d, 0, 0); }
    if (detector) { const r = await detector.detect(cv); return r[0] ? r[0].rawValue : null; }
    const r = window.jsQR(d.data, cv.width, cv.height, { inversionAttempts: "attemptBoth" }); return r ? r.data : null;
  };
  const intentos = [[1500, false], [4000, false], [1500, true], [800, false], [800, true]];
  let otro = false;
  for (const [lado, gris] of intentos) {
    if (lado === 4000 && Math.max(W, H) <= 1500) continue;
    let t = null; try { t = await pasada(lado, gris); } catch { t = null; }
    if (t) { if (leerQRCompu(t)) return { texto: t }; otro = true; }
  }
  try { img.close && img.close(); } catch { /* */ }
  return { error: otro ? "Ese QR no es el de la compu. Use el de «Emparejar teléfono con Antares»." : NO_QR };
}
// Abre el selector de imágenes (sin «capture», para que el iPhone ofrezca la fototeca). Llamar dentro de un toque.
// Resuelve {texto} o {error}, o null si la persona no elige nada.
export function elegirImagenQR() {
  return new Promise((resolver) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.hidden = true; inp.className = "qr-archivo";
    document.body.appendChild(inp);
    const quitar = () => setTimeout(() => inp.remove(), 0);
    inp.addEventListener("cancel", () => { quitar(); resolver(null); });
    inp.addEventListener("change", async () => {
      const f = inp.files && inp.files[0]; quitar();
      if (!f) return resolver(null);
      const r = await decodificarArchivo(f); if (r.texto) ultima = "imagen"; resolver(r);
    });
    inp.click();
  });
}

// Abre la cámara a pantalla completa; resuelve con el texto del QR, o null si la persona cancela.
export function escanearQR({ titulo = "Escanear QR de la compu" } = {}) {
  return new Promise((resolver) => {
    estilos();
    const caja = document.createElement("div");
    caja.className = "qr-escaner"; caja.setAttribute("role", "dialog"); caja.setAttribute("aria-modal", "true"); caja.setAttribute("aria-label", titulo);
    caja.innerHTML = `<div class="qr-top"><b>📷 ${titulo}</b></div>
      <div class="qr-marco"><video playsinline muted autoplay></video><i class="qr-mira"></i></div>
      <p class="qr-msg" role="status">Abriendo la cámara…</p>
      <div class="qr-botones"><button type="button" class="btn qr-imagen">🖼 Elegir de mis imágenes</button><button type="button" class="btn qr-cancelar">Cancelar</button></div>`;
    document.body.appendChild(caja);
    const video = caja.querySelector("video"), msg = caja.querySelector(".qr-msg");
    let stream = null, fin = false, timer = 0;
    const lienzo = document.createElement("canvas"), ctx = lienzo.getContext("2d", { willReadFrequently: true });
    const cerrar = (valor) => {
      if (fin) return; fin = true; clearTimeout(timer);
      try { stream && stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
      video.srcObject = null; document.removeEventListener("keydown", tecla, true); caja.remove(); resolver(valor);
    };
    const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(null); } };
    document.addEventListener("keydown", tecla, true);
    caja.querySelector(".qr-cancelar").addEventListener("click", () => cerrar(null));
    const bImg = caja.querySelector(".qr-imagen");
    bImg.addEventListener("click", () => {
      elegirImagenQR().then((r) => {
        if (fin || !r) return;
        if (r.texto) { ultima = "imagen"; return cerrar(r.texto); }
        msg.textContent = r.error; msg.classList.add("mal");
      });
    });
    const sinCamara = (t) => { msg.textContent = t + " Puede elegir una foto o captura del QR."; msg.classList.add("mal"); bImg.classList.add("destacar"); };
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { sinCamara("Este navegador no permite usar la cámara aquí."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        const n = e && e.name;
        msg.textContent = n === "NotAllowedError" || n === "SecurityError"
          ? "No tengo permiso para usar la cámara. Actívelo en Ajustes del teléfono › Safari (o el navegador) › Cámara, y vuelva a intentar."
          : n === "NotFoundError" || n === "OverconstrainedError" ? "No encontré una cámara en este equipo." : "No pude abrir la cámara.";
        sinCamara(msg.textContent); return;
      }
      if (fin) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream; try { await video.play(); } catch { /* iOS reproduce al tener srcObject */ }
      msg.textContent = "Apunte al código QR que muestra la compu.";
      let detector = null;
      try { if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code")) detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch { detector = null; }
      if (!detector) { try { await cargarJsQR(); } catch { msg.textContent = "No pude cargar el lector de QR. Revise la conexión e intente de nuevo."; msg.classList.add("mal"); return; } }
      const ciclo = async () => {
        if (fin) return;
        try {
          if (video.readyState >= 2 && video.videoWidth) {
            let texto = null;
            if (detector) { const r = await detector.detect(video); texto = r[0] && r[0].rawValue; }
            else {
              const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
              lienzo.width = Math.round(video.videoWidth * k); lienzo.height = Math.round(video.videoHeight * k);
              ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
              const r = window.jsQR(ctx.getImageData(0, 0, lienzo.width, lienzo.height).data, lienzo.width, lienzo.height, { inversionAttempts: "dontInvert" });
              texto = r && r.data;
            }
            if (texto) { if (leerQRCompu(texto)) { ultima = "camara"; return cerrar(texto); } msg.textContent = "Ese QR no es el de la compu. Use el de «Emparejar teléfono con Antares»."; }
          }
        } catch { /* sigue intentando */ }
        timer = setTimeout(ciclo, 180);
      };
      ciclo();
    })();
  });
}
