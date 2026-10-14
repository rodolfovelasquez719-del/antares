// v1.19.3: "Ojo de Antares" — SOLO la cámara de este dispositivo, con permiso del usuario (getUserMedia).
// No graba ni guarda imágenes. Un cuadro se envía a Gemini solo al tocar "Describir" o con "Continuo" activado.
// Nunca accede a cámaras remotas ni identifica personas.
import { GEMINI_BASE_URL } from "./gemini.js";
let ui, stream = null, facing = "environment", timer = null, busy = false, ctrl = null, opts = {}, frozen = false, torchOn = false, lastText = "", hasMulti = true;
const CSS = `
.vis{position:fixed;inset:0;z-index:900;background:#000;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);color:#eafff3;font-family:var(--font-ui,system-ui)}
.vis[hidden]{display:none}
.vis-h{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(0,255,156,.25)}
.vis-h b{font-family:var(--font-hud,monospace);letter-spacing:3px;font-size:15px;text-shadow:0 0 8px #00ff9c}
.vis-w{position:relative;flex:1;min-height:0;overflow:hidden;background:#010604}
.vis video,.vis .vis-snap{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.vis .vis-snap{display:none}.vis.frozen .vis-snap{display:block}
.vis canvas.vis-ov{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.vis-hint{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);width:82%;text-align:center;font-size:17px;line-height:1.4;color:#cfeedd}
.vis.live .vis-hint{display:none}
.vis-o{position:absolute;left:10px;right:10px;bottom:10px;background:rgba(2,14,8,.9);border:1px solid rgba(0,255,156,.35);border-radius:12px;padding:10px 12px;font-size:16px;line-height:1.35;max-height:42%;overflow:auto}
.vis-o.err{border-color:rgba(255,45,74,.7)}
.vis-o.busy::before{content:"";display:inline-block;width:12px;height:12px;margin-right:8px;border:2px solid #00ff9c;border-right-color:transparent;border-radius:50%;animation:vis-spin .8s linear infinite;vertical-align:-1px}
@keyframes vis-spin{to{transform:rotate(360deg)}}
.vis-p{font-size:13px;color:#b9dcc8;padding:7px 14px;line-height:1.35;margin:0}.vis-p b{color:#ff6b7d}
.vis-b{display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px calc(10px + env(safe-area-inset-bottom))}
.vis-b button,.vis-h button{flex:1 1 22%;min-height:46px;font-family:var(--font-hud,monospace);font-size:10.5px;letter-spacing:1px;color:#d8f5e6;background:#062016;border:1px solid rgba(0,255,156,.4);border-radius:10px}
.vis-b button[hidden]{display:none}
.vis-b button:disabled{opacity:.4}
.vis-b button.main{color:#02130a;background:#00ff9c;font-weight:700}
.vis-b button.on{color:#02130a;background:#00ff9c}
.vis-h button{flex:0 0 auto;padding:0 14px;color:#ff6b7d;border-color:rgba(255,45,74,.6);background:#1a0609}`;
const $ = (s) => ui.querySelector(s);
const btn = (a) => $(`[data-a=${a}]`);
function build() {
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  ui = document.createElement("section"); ui.className = "vis"; ui.hidden = true; ui.setAttribute("aria-label", "Visión"); ui.setAttribute("role", "dialog");
  ui.innerHTML = `<div class="vis-h"><b>OJO DE ANTARES</b><button type="button" data-a="close">CERRAR ✕</button></div>
  <div class="vis-w"><video playsinline muted autoplay></video><canvas class="vis-snap"></canvas><canvas class="vis-ov"></canvas>
   <p class="vis-hint">Apunte la cámara a lo que quiera que yo vea.<br>Toque <b>«Activar cámara»</b> y acepte el permiso.</p>
   <div class="vis-o" role="status" aria-live="polite"></div></div>
  <p class="vis-p">🔒 Solo uso <b>la cámara de este teléfono</b>, con su permiso. No grabo ni guardo imágenes; un cuadro se envía a Gemini solo cuando usted toca «Describir» o activa «Continuo». No identifico personas.</p>
  <div class="vis-b">
   <button type="button" data-a="perm" class="main">ACTIVAR CÁMARA</button>
   <button type="button" data-a="desc" class="main" hidden>DESCRIBIR</button>
   <button type="button" data-a="cancel" hidden>CANCELAR</button>
   <button type="button" data-a="live" hidden>OTRA FOTO</button>
   <button type="button" data-a="cont" hidden>CONTINUO</button>
   <button type="button" data-a="flip" hidden>⟲ GIRAR</button>
   <button type="button" data-a="torch" hidden>💡 LUZ</button>
   <button type="button" data-a="say" hidden>🔊 REPETIR</button>
  </div>`;
  document.body.appendChild(ui);
  ui.addEventListener("click", (e) => {
    const a = e.target.closest("button")?.dataset.a; if (!a) return;
    if (a === "close") closeVision(); else if (a === "perm") start(); else if (a === "flip") flip(); else if (a === "desc") describe(true);
    else if (a === "cont") toggleCont(); else if (a === "cancel") cancel(); else if (a === "live") goLive(); else if (a === "torch") torch(); else if (a === "say") speakLast();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && stream) { stopCam(); out("Cámara en pausa porque salió de la app. Toque «Activar cámara» para seguir."); } });
  window.addEventListener("pagehide", () => stopCam());
}
function out(t, kind = "") { const o = $(".vis-o"); o.textContent = t; o.className = "vis-o" + (kind ? " " + kind : ""); o.hidden = !t; }
function paint() {
  const live = !!stream; ui.classList.toggle("live", live || frozen); ui.classList.toggle("frozen", frozen);
  btn("perm").hidden = live; btn("desc").hidden = !live || busy || frozen; btn("cancel").hidden = !busy;
  btn("live").hidden = !frozen || busy; btn("cont").hidden = !live || frozen; btn("cont").classList.toggle("on", !!timer);
  btn("flip").hidden = !live || !hasMulti || !!timer || frozen; btn("say").hidden = !lastText || busy || !opts.speak;
  const tr = stream && stream.getVideoTracks()[0], caps = tr && tr.getCapabilities ? tr.getCapabilities() : {};
  btn("torch").hidden = !live || !caps.torch || facing !== "environment"; btn("torch").classList.toggle("on", torchOn);
}
export function openVision(o = {}) {
  opts = o; if (!ui) build(); ui.hidden = false; frozen = false;
  if (lastText) out("Última descripción: " + lastText);
  else out(o.getKey && o.getKey() ? "" : "La cámara funciona sin internet, pero para describir lo que ve necesito su key de Gemini (Ajustes) y conexión.", o.getKey && o.getKey() ? "" : "err");
  paint();
}
export function closeVision() { cancel(); stopCam(); frozen = false; try { speechSynthesis.cancel(); } catch { /* */ } if (ui) { ui.hidden = true; clear(); paint(); } }
function stopCam() {
  clearInterval(timer); timer = null; torchOn = false;
  if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null;
  if (ui) { const v = $("video"); v.pause(); v.srcObject = null; paint(); }
}
const ERR = {
  NotAllowedError: "No tengo permiso para usar la cámara. En iPhone: Ajustes › Apps › Safari › Cámara › «Preguntar» o «Permitir», y vuelva a abrir Antares. En Android: toque el candado junto a la dirección › Permisos › Cámara.",
  SecurityError: "El navegador bloqueó la cámara en esta página. Ábrala desde la dirección https de Antares.",
  NotFoundError: "No encontré ninguna cámara en este dispositivo.",
  NotReadableError: "La cámara está ocupada por otra app (por ejemplo, una videollamada). Ciérrela e intente de nuevo.",
  AbortError: "La cámara no respondió. Intente de nuevo.",
};
async function getCam() {
  const tries = [{ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }, { video: { facingMode: facing }, audio: false }, { video: true, audio: false }];
  let last; for (const c of tries) { try { return await navigator.mediaDevices.getUserMedia(c); } catch (e) { last = e; if (e.name === "NotAllowedError" || e.name === "SecurityError") break; } }
  throw last;
}
async function start() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { out("Este navegador no permite usar la cámara aquí. Use Safari (iPhone) o Chrome (Android) con la dirección https de Antares.", "err"); return; }
  btn("perm").disabled = true; out("Abriendo la cámara…", "busy");
  try {
    stopCam(); frozen = false; clear();
    stream = await getCam();
    const v = $("video"); v.srcObject = stream; v.setAttribute("playsinline", ""); v.muted = true;
    await v.play().catch(() => {});
    if (!v.videoWidth) await new Promise((r) => { v.onloadedmetadata = r; setTimeout(r, 2500); });
    try { const ds = await navigator.mediaDevices.enumerateDevices(); hasMulti = ds.filter((d) => d.kind === "videoinput").length > 1; } catch { hasMulti = true; }
    out(lastText ? "Cámara activa. Última descripción: " + lastText : "Cámara activa. Toque «Describir».");
  } catch (e) { stream = null; out(ERR[e && e.name] || `No pude abrir la cámara (${(e && e.name) || "error"}). Intente de nuevo.`, "err"); }
  btn("perm").disabled = false; paint();
}
function flip() { facing = facing === "environment" ? "user" : "environment"; start(); }
async function torch() {
  const tr = stream && stream.getVideoTracks()[0]; if (!tr) return;
  try { await tr.applyConstraints({ advanced: [{ torch: !torchOn }] }); torchOn = !torchOn; } catch { out("Este teléfono no permite encender la luz desde el navegador.", "err"); }
  paint();
}
function clear() { const c = ui && $(".vis-ov"); if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height); }
function draw(boxes) {
  const c = $(".vis-ov"), dpr = Math.min(2, devicePixelRatio || 1), r = c.getBoundingClientRect(); c.width = r.width * dpr; c.height = r.height * dpr;
  const x = c.getContext("2d"); x.lineWidth = 2.5 * dpr; x.font = `600 ${13 * dpr}px Rajdhani,system-ui`;
  boxes.forEach((b, i) => {
    const [y0, x0, y1, x1] = b.box_2d.map((v) => Math.min(1, Math.max(0, v / 1000))); if (x1 <= x0 || y1 <= y0) return;
    const X = x0 * c.width, Y = y0 * c.height, col = i % 4 === 3 ? "#ff2d4a" : "#00ff9c", lab = String(b.label || "").slice(0, 28);
    x.strokeStyle = col; x.strokeRect(X, Y, (x1 - x0) * c.width, (y1 - y0) * c.height);
    const lw = x.measureText(lab).width + 10 * dpr, ly = Y > 18 * dpr ? Y - 18 * dpr : Y; x.fillStyle = "rgba(0,0,0,.75)"; x.fillRect(X, ly, lw, 18 * dpr); x.fillStyle = col; x.fillText(lab, X + 5 * dpr, ly + 13.5 * dpr);
  });
}
function toggleCont() {
  if (timer) { clearInterval(timer); timer = null; paint(); return; }
  if (!stream) return; timer = setInterval(() => { if (!busy) describe(false); }, 4000); paint(); describe(false);
}
function cancel() { if (ctrl) ctrl.abort(); ctrl = null; }
function goLive() { frozen = false; clear(); paint(); }
function speakLast() { if (lastText && opts.speak) opts.speak(lastText); }
function grab() {
  const v = $("video"), w = $(".vis-w").getBoundingClientRect(); if (!v.videoWidth || !w.width) return null;
  const ar = w.width / w.height, va = v.videoWidth / v.videoHeight;
  let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight; if (va > ar) { sw = sh * ar; sx = (v.videoWidth - sw) / 2; } else { sh = sw / ar; sy = (v.videoHeight - sh) / 2; }
  const tc = $(".vis-snap"); tc.width = 768; tc.height = Math.round(768 / ar); tc.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, tc.width, tc.height);
  return tc.toDataURL("image/jpeg", .72).split(",")[1];
}
async function describe(single) {
  if (busy || !stream) return;
  const key = opts.getKey && opts.getKey();
  if (!key) { out("Para describir necesito su key de Gemini: Ajustes › API key. La cámara sigue activa.", "err"); return; }
  if (!navigator.onLine) { out("Sin internet: para describir necesito conexión. La cámara sigue activa.", "err"); return; }
  const b64 = grab(); if (!b64) { out("La cámara todavía se está preparando. Intente en un segundo."); return; }
  busy = true; if (single) { frozen = true; clear(); out("Analizando la imagen…", "busy"); } paint();
  ctrl = new AbortController(); let timedOut = false; const to = setTimeout(() => { timedOut = true; ctrl && ctrl.abort(); }, 25000);
  try {
    const prompt = 'Describa en español, tratando de "usted", en 1 o 2 frases breves, lo que se ve. Si hay texto legible, léalo. No identifique personas ni rasgos sensibles: diga solo "persona". Responda SOLO JSON: {"descripcion":"...","objetos":[{"label":"nombre corto","box_2d":[ymin,xmin,ymax,xmax]}]} con coordenadas 0-1000, máximo 8 objetos.';
    const r = await fetch(`${GEMINI_BASE_URL}/${opts.model || "gemini-3.5-flash-lite"}:generateContent`, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }], generationConfig: { responseMimeType: "application/json", temperature: .2 } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error?.message || "HTTP " + r.status), { status: r.status });
    const txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    let o; try { o = JSON.parse(txt); } catch { o = { descripcion: txt, objetos: [] }; }
    const boxes = (o.objetos || []).filter((b) => Array.isArray(b.box_2d) && b.box_2d.length === 4);
    if (!ui.hidden && stream) {
      lastText = String(o.descripcion || "No logré distinguir nada claro. Acérquese un poco o mejore la luz.");
      draw(boxes); out("👁 " + lastText + (boxes.length ? "\n· " + boxes.map((b) => b.label).join(", ") : ""));
      if (single && opts.speak) opts.speak(lastText);
    }
  } catch (e) {
    if (e.name === "AbortError") out(timedOut ? "Gemini tardó demasiado. Revise su conexión e intente otra vez." : "Cancelado.", timedOut ? "err" : "");
    else if (e.status === 400 || e.status === 403) out("Gemini rechazó la solicitud. Revise su key en Ajustes.", "err");
    else if (e.status === 429) out("Gemini está limitando las consultas. Espere un momento y vuelva a intentar.", "err");
    else out("No pude analizar la imagen. Revise su conexión e intente otra vez.", "err");
    if (single) frozen = false; if (timer) { clearInterval(timer); timer = null; }
  } finally { clearTimeout(to); busy = false; ctrl = null; paint(); }
}
