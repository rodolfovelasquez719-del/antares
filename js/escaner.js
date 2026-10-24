// v1.25.2: escáner de QR dentro de la app (sirve en el iPhone, donde el QR abierto en Safari no llega a la app instalada).
// Usa BarcodeDetector si existe; si no (Safari de iOS), jsQR local (vendor/jsqr, Apache-2.0). Nada sale del teléfono.
let jsqrCarga = null;
function cargarJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsqrCarga) jsqrCarga = new Promise((ok, mal) => {
    const s = document.createElement("script"); s.src = new URL("../vendor/jsqr/jsQR.js?v=1.25.2", import.meta.url).href;
    s.onload = () => (window.jsQR ? ok(window.jsQR) : mal(new Error("jsQR"))); s.onerror = () => { jsqrCarga = null; mal(new Error("jsQR")); };
    document.head.appendChild(s);
  });
  return jsqrCarga;
}

function estilos() {
  if (document.getElementById("qr-escaner-css")) return;
  const st = document.createElement("style"); st.id = "qr-escaner-css";
  st.textContent = `.qr-escaner{position:fixed;inset:0;z-index:10000;background:#020805f2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:calc(env(safe-area-inset-top,0px) + 16px) 16px calc(env(safe-area-inset-bottom,0px) + 16px);color:#c8ffe0;text-align:center}\n.qr-top{color:#2bff9a;letter-spacing:.08em;font-size:1.05em}\n.qr-marco{position:relative;width:min(86vw,62vh,460px);aspect-ratio:1;border-radius:18px;overflow:hidden;border:1px solid #2bff9a88;box-shadow:0 0 30px #2bff9a33;background:#000}\n.qr-marco video{width:100%;height:100%;object-fit:cover;display:block}\n.qr-mira{position:absolute;inset:14%;border:3px solid #2bff9a;border-radius:14px;box-shadow:0 0 0 999px #0006}\n.qr-msg{max-width:460px;margin:0;line-height:1.4}.qr-msg.mal{color:#ff5c7a}\n.qr-cancelar{min-width:160px}`;
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

// Abre la cámara a pantalla completa; resuelve con el texto del QR, o null si la persona cancela.
export function escanearQR({ titulo = "Escanear QR de la compu" } = {}) {
  return new Promise((resolver) => {
    estilos();
    const caja = document.createElement("div");
    caja.className = "qr-escaner"; caja.setAttribute("role", "dialog"); caja.setAttribute("aria-modal", "true"); caja.setAttribute("aria-label", titulo);
    caja.innerHTML = `<div class="qr-top"><b>📷 ${titulo}</b></div>
      <div class="qr-marco"><video playsinline muted autoplay></video><i class="qr-mira"></i></div>
      <p class="qr-msg" role="status">Abriendo la cámara…</p>
      <button type="button" class="btn qr-cancelar">Cancelar</button>`;
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
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = "Este navegador no permite usar la cámara aquí. Abra Antares desde la pantalla de inicio o con https."; msg.classList.add("mal"); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        const n = e && e.name;
        msg.textContent = n === "NotAllowedError" || n === "SecurityError"
          ? "No tengo permiso para usar la cámara. Actívelo en Ajustes del teléfono › Safari (o el navegador) › Cámara, y vuelva a intentar."
          : n === "NotFoundError" || n === "OverconstrainedError" ? "No encontré una cámara en este equipo." : "No pude abrir la cámara. Intente de nuevo.";
        msg.classList.add("mal"); return;
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
            if (texto) { if (leerQRCompu(texto)) return cerrar(texto); msg.textContent = "Ese QR no es el de la compu. Use el de «Emparejar teléfono con Antares»."; }
          }
        } catch { /* sigue intentando */ }
        timer = setTimeout(ciclo, 180);
      };
      ciclo();
    })();
  });
}
