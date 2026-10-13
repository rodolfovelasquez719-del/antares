// v1.19: "Ojo de Antares" — SOLO la cámara de este dispositivo, con permiso del usuario (getUserMedia).
// No graba ni guarda nada. Un cuadro se envía a Gemini solo al tocar "Describir" o con "Continuo" activado.
// Nunca accede a cámaras remotas ni identifica personas.
import { GEMINI_BASE_URL } from "./gemini.js";
let ui, stream = null, facing = "environment", timer = null, busy = false, opts = {};
const CSS = `
.vis{position:fixed;inset:0;z-index:900;background:#000;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);color:#e4fff0;font-family:var(--font-ui,system-ui)}
.vis[hidden]{display:none}
.vis-h{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(0,255,156,.2)}
.vis-h b{font-family:var(--font-hud,monospace);letter-spacing:3px;font-size:15px;text-shadow:0 0 8px #00ff9c}
.vis-w{position:relative;flex:1;min-height:0;overflow:hidden}
.vis video{width:100%;height:100%;object-fit:cover;display:block}
.vis canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.vis-o{position:absolute;left:10px;right:10px;bottom:10px;background:rgba(2,14,8,.85);border:1px solid rgba(0,255,156,.3);border-radius:12px;padding:9px 11px;font-size:16px;max-height:40%;overflow:auto}
.vis-p{font-size:13px;color:#9fd4b6;padding:8px 14px;line-height:1.35;margin:0}.vis-p b{color:#ff2d4a}
.vis-b{display:flex;gap:6px;padding:6px 12px calc(10px + env(safe-area-inset-bottom))}
.vis-b button,.vis-h button{flex:1;min-height:44px;font-family:var(--font-hud,monospace);font-size:10px;letter-spacing:1px;color:#9fd4b6;background:#04140c;border:1px solid rgba(0,255,156,.3);border-radius:10px}
.vis-h button{flex:0 0 auto;padding:0 12px;color:#ff2d4a;border-color:rgba(255,45,74,.5)}
.vis-b button.on{background:#00ff9c;color:#02130a}`;
const $ = (s) => ui.querySelector(s);
function build() {
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  ui = document.createElement("section"); ui.className = "vis"; ui.hidden = true; ui.setAttribute("aria-label", "Visión");
  ui.innerHTML = `<div class="vis-h"><b>OJO DE ANTARES</b><button type="button" data-a="close">CERRAR ✕</button></div>
  <div class="vis-w"><video playsinline muted autoplay></video><canvas></canvas><div class="vis-o" role="status">Toque «Permitir cámara» para empezar.</div></div>
  <p class="vis-p">🔒 Solo usa <b>la cámara de este teléfono</b>, con su permiso. Nada se graba ni se guarda; un cuadro se envía a Gemini solo cuando usted toca «Describir» o activa «Continuo». Nunca accede a cámaras ajenas ni identifica personas.</p>
  <div class="vis-b"><button type="button" data-a="perm">PERMITIR CÁMARA</button><button type="button" data-a="flip">⟲ CÁMARA</button><button type="button" data-a="desc">DESCRIBIR</button><button type="button" data-a="cont">CONTINUO</button></div>`;
  document.body.appendChild(ui);
  ui.addEventListener("click", (e) => { const a = e.target.closest("button")?.dataset.a; if (a === "close") closeVision(); if (a === "perm") start(); if (a === "flip") { facing = facing === "environment" ? "user" : "environment"; if (stream) start(); } if (a === "desc") describe(true); if (a === "cont") toggleCont(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && stream) stopCam(); });
}
const out = (t) => { $(".vis-o").textContent = t; };
export function openVision(o = {}) { opts = o; if (!ui) build(); ui.hidden = false; out(o.getKey && o.getKey() ? "Toque «Permitir cámara» para empezar." : "Para describir lo que ve necesito su key de Gemini (Ajustes) y conexión. La cámara sí funciona."); }
export function closeVision() { stopCam(); if (ui) ui.hidden = true; clear(); }
function stopCam() { clearInterval(timer); timer = null; ui && $('[data-a=cont]').classList.remove("on"); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; ui && $('[data-a=perm]').classList.remove("on"); }
async function start() {
  if (!navigator.mediaDevices?.getUserMedia) { out("Este navegador no permite usar la cámara."); return; }
  try {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false });
    const v = $("video"); v.srcObject = stream; await v.play(); $('[data-a=perm]').classList.add("on"); out("Cámara activa. Toque «Describir».");
  } catch (e) { out(`No obtuve permiso de cámara (${e.name}). Revise los permisos del navegador para este sitio.`); }
}
function clear() { const c = ui && $("canvas"); if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height); }
function draw(boxes) {
  const c = $("canvas"), dpr = Math.min(2, devicePixelRatio || 1), r = c.getBoundingClientRect(); c.width = r.width * dpr; c.height = r.height * dpr;
  const x = c.getContext("2d"); x.lineWidth = 2 * dpr; x.font = `${12 * dpr}px Orbitron,monospace`;
  boxes.forEach((b, i) => { const [y0, x0, y1, x1] = b.box_2d.map((v) => v / 1000), X = x0 * c.width, Y = y0 * c.height, col = i % 4 === 3 ? "#ff2d4a" : "#00ff9c";
    x.strokeStyle = col; x.strokeRect(X, Y, (x1 - x0) * c.width, (y1 - y0) * c.height);
    const lw = x.measureText(b.label).width + 8 * dpr; x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(X, Math.max(0, Y - 16 * dpr), lw, 16 * dpr); x.fillStyle = col; x.fillText(String(b.label).slice(0, 30), X + 4 * dpr, Math.max(12 * dpr, Y - 4 * dpr)); });
}
function toggleCont() { const b = $('[data-a=cont]'); if (timer) { clearInterval(timer); timer = null; b.classList.remove("on"); return; } if (!stream) { out("Primero permita la cámara."); return; } b.classList.add("on"); describe(false); timer = setInterval(() => describe(false), 4000); }
async function describe(speak) {
  if (busy) return; if (!stream) { out("Primero permita la cámara."); return; }
  const key = opts.getKey && opts.getKey(); if (!key) { out("Configure su key de Gemini en Ajustes para que pueda describir lo que ve."); return; }
  if (!navigator.onLine) { out("Sin internet: la visión necesita conexión."); return; }
  busy = true; if (!timer) out("Analizando…");
  try {
    const v = $("video"), vr = $("canvas").getBoundingClientRect(), ar = vr.width / vr.height, va = v.videoWidth / v.videoHeight;
    let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight; if (va > ar) { sw = sh * ar; sx = (v.videoWidth - sw) / 2; } else { sh = sw / ar; sy = (v.videoHeight - sh) / 2; }
    const tc = document.createElement("canvas"); tc.width = 640; tc.height = Math.round(640 / ar); tc.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, tc.width, tc.height);
    const b64 = tc.toDataURL("image/jpeg", .7).split(",")[1];
    const prompt = 'Describa en español, tratando de "usted", en 1-2 frases, lo que se ve. No identifique personas ni rasgos sensibles: diga solo "persona". Responda SOLO JSON: {"descripcion":"...","objetos":[{"label":"nombre corto","box_2d":[ymin,xmin,ymax,xmax]}]} con coordenadas 0-1000, máximo 8 objetos.';
    const r = await fetch(`${GEMINI_BASE_URL}/${opts.model || "gemini-3.5-flash-lite"}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }], generationConfig: { responseMimeType: "application/json", temperature: .2 } }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.status);
    const o = JSON.parse(j.candidates[0].content.parts[0].text), boxes = (o.objetos || []).filter((b) => Array.isArray(b.box_2d) && b.box_2d.length === 4);
    if (!ui.hidden) { draw(boxes); out("👁 " + o.descripcion + (boxes.length ? "  ·  " + boxes.map((b) => b.label).join(", ") : "")); if (speak && opts.speak) opts.speak(o.descripcion); }
  } catch (e) { out("No pude analizar la imagen: " + e.message); }
  busy = false;
}
