// Paneles de Herramientas (v1.11.0): Fotos (editor + IA), Código (revisión y ejecución) y Excel (análisis y cambios).
// Las fotos, el código y las hojas viven solo en memoria: se borran al bloquear la app.
import * as P from "./photo.js";
import * as C from "./code.js";
import * as X from "./sheet.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let deps = { hasKey: () => false, getKey: () => "", askJson: null, sendCode: () => {}, onChange: () => {} };
let rerender = () => {};
export function initTools(d, rerenderFn) { deps = { ...deps, ...d }; rerender = rerenderFn; }

// ---------- Estado en memoria ----------
const freshPhoto = () => ({ ed: null, name: "foto.jpg", mode: "ajustes", brush: "pintar", color: "#ffffff", size: 48, eyedrop: false,
  aspect: 0, cropRect: null, straight: 0, instr: "", busy: false, ctrl: null, status: "", error: null, result: null, resultUrl: "", beforeUrl: "", cmp: 50, msg: "" });
const freshCode = () => ({ code: "", lang: "auto", name: "", task: "errores", detail: "", out: null, running: false, msg: "" });
const freshSheet = () => ({ file: null, wb: null, sheet: "", base: null, t: null, undo: [], busy: false, ctrl: null, loading: false, q: "", answer: "", results: [], formulas: [], log: [], errors: [], msg: "", error: "", changed: false });
let ph = freshPhoto(), cd = freshCode(), sh = freshSheet();
let displayCanvas = null;
export function resetTools() {
  if (ph.ctrl) ph.ctrl.abort(); if (sh.ctrl) sh.ctrl.abort();
  [ph.resultUrl, ph.beforeUrl].forEach((u) => u && URL.revokeObjectURL(u));
  ph = freshPhoto(); cd = freshCode(); sh = freshSheet(); displayCanvas = null;
  P.resetPhotoSession();
}
export function clearStatus() { ph.msg = ""; cd.msg = ""; sh.msg = ""; }
export const toolsState = () => ({ photo: !!ph.ed, code: !!cd.code, sheet: !!sh.t });

// ---------- Entradas desde el chat ----------
export async function openPhotoWith(blob, { name = "foto.jpg", instruction = "", mode = "ia" } = {}) {
  await setPhoto(blob, name);
  ph.instr = instruction || ""; ph.mode = mode;
}
export async function openSheetWith(file, question = "") {
  await openSheetFile(file);
  sh.q = question || "";
  return !sh.error;
}
export function openCodeWith(code, { name = "", lang = "auto" } = {}) {
  cd.code = String(code || ""); cd.name = name; cd.lang = lang; cd.out = null;
}
async function setPhoto(blob, name) {
  const c = await P.loadImage(blob);
  ph.ed = P.createEditor(c); ph.name = String(name || "foto.jpg").replace(/\.\w+$/, "") + "-editada.jpg";
  ph.result = null; ph.error = null; ph.status = ""; ph.cropRect = null; ph.straight = 0;
}

// ================= FOTOS =================
const ICON = {
  undo: '<path d="M9 7H4V2M4.5 7A8 8 0 1 1 4 12"/>', rotl: '<path d="M4 4v5h5M4.6 9A8 8 0 1 1 6 17"/>', rotr: '<path d="M20 4v5h-5M19.4 9A8 8 0 1 0 18 17"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', share: '<path d="M12 15V3M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
};
const ico = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</g></svg>`;
const slider = (id, label, val, min = -100, max = 100) => `<label class="tl-slider"><span>${label} <b id="${id}-v">${val > 0 && min < 0 ? "+" : ""}${val}</b></span><input type="range" id="${id}" min="${min}" max="${max}" step="1" value="${val}" aria-label="${label}"></label>`;

function photoHtml() {
  const pickers = `<input type="file" id="ph-file" accept="image/*" hidden><input type="file" id="ph-cam" accept="image/*" capture="environment" hidden>`;
  if (!ph.ed) return `${pickers}
    <p class="landing-intro">Recorte, gire, ajuste la luz y el color, pinte o suavice zonas, o pida un cambio con IA (por ejemplo: “quite la cortina roja y ponga una pared blanca”).</p>
    <div class="btn-row"><button type="button" class="btn primary" id="ph-pick">Elegir foto</button><button type="button" class="btn" id="ph-take">Tomar foto</button></div>
    ${ph.msg ? `<p class="hint" role="status">${esc(ph.msg)}</p>` : ""}
    <p class="hint panel-note">La foto se edita en su teléfono. Solo se envía a Gemini si usa “Editar con IA”.</p>`;
  const modes = [["ajustes", "Ajustes"], ["recortar", "Recortar"], ["pincel", "Pincel"], ["ia", "Con IA"]];
  let tools = "";
  if (ph.mode === "ajustes") {
    const a = ph.ed.adj;
    tools = `${slider("ph-brightness", "Brillo", a.brightness)}${slider("ph-contrast", "Contraste", a.contrast)}${slider("ph-saturation", "Saturación", a.saturation)}${slider("ph-warmth", "Calidez", a.warmth)}
      <div class="btn-row"><button type="button" class="btn" id="ph-rotl">${ico("rotl")}Girar izq.</button><button type="button" class="btn" id="ph-rotr">${ico("rotr")}Girar der.</button></div>
      ${slider("ph-straight", "Enderezar (grados)", ph.straight, -15, 15)}
      <button type="button" class="btn" id="ph-straight-apply"${ph.straight ? "" : " disabled"}>Aplicar enderezado</button>`;
  } else if (ph.mode === "recortar") {
    tools = `<div class="picks" role="group" aria-label="Proporción">${[[0, "Libre"], [1, "1:1"], [4 / 3, "4:3"], [3 / 4, "3:4"], [16 / 9, "16:9"]].map(([v, l]) => `<button type="button" class="pick${ph.aspect === v ? " on" : ""}" data-aspect="${v}" aria-pressed="${ph.aspect === v}">${l}</button>`).join("")}</div>
      <p class="hint">Arrastre el dedo sobre la foto para marcar el área que quiere conservar.</p>
      <div class="btn-row"><button type="button" class="btn primary" id="ph-crop-apply"${ph.cropRect ? "" : " disabled"}>Aplicar recorte</button><button type="button" class="btn" id="ph-crop-clear"${ph.cropRect ? "" : " disabled"}>Quitar marca</button></div>`;
  } else if (ph.mode === "pincel") {
    tools = `<div class="picks" role="group" aria-label="Pincel">
        <button type="button" class="pick${ph.brush === "pintar" ? " on" : ""}" data-brush="pintar" aria-pressed="${ph.brush === "pintar"}">Pintar color</button>
        <button type="button" class="pick${ph.brush === "suavizar" ? " on" : ""}" data-brush="suavizar" aria-pressed="${ph.brush === "suavizar"}">Suavizar (arrugas)</button></div>
      ${ph.brush === "pintar" ? `<div class="form-row tl-color"><label class="tl-swatch"><span class="sr-only">Color</span><input type="color" id="ph-color" value="${esc(ph.color)}" aria-label="Color del pincel"></label>
        ${["#ffffff", "#f3efe6", "#e8e2d5", "#d9d4cc", "#000000"].map((c) => `<button type="button" class="tl-chip" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join("")}
        <button type="button" class="btn${ph.eyedrop ? " primary" : ""}" id="ph-eye" aria-pressed="${ph.eyedrop}">Tomar color</button></div>` : ""}
      ${slider("ph-size", "Tamaño del pincel", ph.size, 6, 200)}
      <p class="hint">${ph.eyedrop ? "Toque la foto donde está el color que quiere usar." : ph.brush === "pintar" ? "Pinte con el dedo sobre la zona (por ejemplo, la cortina) para cubrirla con el color elegido." : "Pase el dedo sobre las arrugas o manchas para suavizarlas."} Use Deshacer si se equivoca.</p>`;
  } else {
    const noKey = !deps.hasKey();
    tools = `<label class="field-label" for="ph-instr">¿Qué cambio quiere?</label>
      <textarea class="field" id="ph-instr" rows="3" maxlength="600" placeholder="Ej.: quite la cortina roja, ponga una pared blanca y alise las arrugas de la colcha">${esc(ph.instr)}</textarea>
      ${ph.busy ? `<div class="status-box pending" role="status"><span>${esc(ph.status || "Editando con IA…")}</span></div><button type="button" class="btn" id="ph-ai-stop">Cancelar</button>`
        : `<button type="button" class="btn primary" id="ph-ai"${noKey ? " disabled" : ""}>Editar con IA</button>`}
      ${noKey ? `<p class="hint">Configure su API key de Gemini para editar con IA.</p>` : ""}
      ${ph.error ? `<div class="warn-box tl-ai-err" role="alert"><p><strong>${esc(ph.error.title)}</strong></p><p>${esc(ph.error.text)}</p>
        ${["no_tier", "rate", "permission", "safety", "no_image", "server"].includes(ph.error.kind) ? `<div class="btn-row wrap"><button type="button" class="btn" data-mode-go="pincel">Usar el pincel</button><button type="button" class="btn" data-mode-go="ajustes">Ajustes de luz</button></div>` : ""}</div>` : ""}
      <p class="hint">La IA conserva las caras y cambia solo lo que usted pide. Revise el resultado antes de usarlo.</p>`;
  }
  const result = ph.result ? `<section class="tl-result" aria-label="Resultado con IA">
      <h3 class="tl-h">Resultado con IA <small>${esc(ph.result.model || "")}</small></h3>
      <div class="ba" style="--cut:${ph.cmp}%"><img src="${ph.beforeUrl}" alt="Antes"><img class="ba-after" src="${ph.resultUrl}" alt="Después"><span class="ba-l">Antes</span><span class="ba-r">Después</span><span class="ba-line" aria-hidden="true"></span></div>
      <label class="tl-slider"><span>Comparar antes / después</span><input type="range" id="ph-cmp" min="0" max="100" value="${ph.cmp}" aria-label="Comparar antes y después"></label>
      <div class="btn-row wrap"><button type="button" class="btn primary" id="ph-use">Usar este resultado</button><button type="button" class="btn" id="ph-res-down">${ico("down")}Descargar</button><button type="button" class="btn" id="ph-res-discard">Descartar</button></div>
    </section>` : "";
  return `${pickers}
    <div class="tl-stage${ph.mode === "pincel" || ph.mode === "recortar" ? " draw" : ""}" id="ph-stage"></div>
    <div class="picks tl-modes" role="tablist" aria-label="Herramienta">${modes.map(([id, l]) => `<button type="button" class="pick${ph.mode === id ? " on" : ""}" role="tab" aria-selected="${ph.mode === id}" data-mode="${id}">${l}</button>`).join("")}</div>
    <div class="tl-tools">${tools}</div>
    ${result}
    ${ph.msg ? `<p class="hint" role="status" id="ph-msg">${esc(ph.msg)}</p>` : ""}
    <div class="btn-row wrap tl-actions">
      <button type="button" class="btn" id="ph-undo"${ph.ed.undo.length ? "" : " disabled"}>${ico("undo")}Deshacer</button>
      <button type="button" class="btn" id="ph-reset">Original</button>
      <button type="button" class="btn" id="ph-down">${ico("down")}Descargar</button>
      <button type="button" class="btn primary" id="ph-share">${ico("share")}${P.canShareFiles() ? "Compartir / Guardar en Fotos" : "Guardar"}</button>
      <button type="button" class="btn" id="ph-change">Otra foto</button>
    </div>`;
}

function paint() {
  if (!displayCanvas || !ph.ed) return;
  const prev = P.render(ph.ed, { preview: true });
  displayCanvas.width = prev.width; displayCanvas.height = prev.height;
  const x = displayCanvas.getContext("2d");
  x.drawImage(prev, 0, 0);
  if (ph.mode === "recortar" && ph.cropRect) {
    const r = ph.cropRect, W = displayCanvas.width, H = displayCanvas.height;
    x.save(); x.fillStyle = "rgba(0,0,0,.55)";
    x.beginPath(); x.rect(0, 0, W, H); x.rect(r.x * W, r.y * H, r.w * W, r.h * H); x.fill("evenodd");
    x.strokeStyle = "#00e5ff"; x.lineWidth = Math.max(2, W / 300); x.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
    x.restore();
  }
  displayCanvas.setAttribute("aria-label", `Foto en edición, ${ph.ed.base.width} por ${ph.ed.base.height} píxeles`);
}
let paintQueued = false;
const paintSoon = () => { if (paintQueued) return; paintQueued = true; requestAnimationFrame(() => { paintQueued = false; paint(); }); };

function photoBind(body) {
  const file = body.querySelector("#ph-file"), cam = body.querySelector("#ph-cam");
  const onFile = async (inp) => {
    const f = inp.files && inp.files[0]; inp.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type) && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name)) { ph.msg = "Ese archivo no es una imagen."; rerender(); return; }
    try { await setPhoto(f, f.name); ph.mode = "ajustes"; ph.msg = ""; } catch { ph.msg = "No pude abrir esa imagen. Pruebe con otra (JPG o PNG)."; }
    rerender();
  };
  file && file.addEventListener("change", () => onFile(file));
  cam && cam.addEventListener("change", () => onFile(cam));
  body.querySelector("#ph-pick")?.addEventListener("click", () => file.click());
  body.querySelector("#ph-take")?.addEventListener("click", () => cam.click());
  body.querySelector("#ph-change")?.addEventListener("click", () => file.click());
  if (!ph.ed) return;
  const stage = body.querySelector("#ph-stage");
  if (!displayCanvas) { displayCanvas = document.createElement("canvas"); displayCanvas.id = "ph-canvas"; displayCanvas.setAttribute("role", "img"); }
  stage.appendChild(displayCanvas);
  paint();
  bindCanvas();
  body.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.mode; if (m === ph.mode) return;
    if (m === "pincel" || m === "ia") P.bakeAdjustments(ph.ed);
    ph.mode = m; ph.eyedrop = false; ph.cropRect = null; ph.msg = ""; rerender();
  }));
  body.querySelectorAll("[data-mode-go]").forEach((b) => b.addEventListener("click", () => { ph.mode = b.dataset.modeGo; if (ph.mode === "pincel") P.bakeAdjustments(ph.ed); ph.error = null; rerender(); }));
  ["brightness", "contrast", "saturation", "warmth"].forEach((k) => {
    const s = body.querySelector(`#ph-${k}`); if (!s) return;
    s.addEventListener("input", () => { ph.ed.adj[k] = Number(s.value); body.querySelector(`#ph-${k}-v`).textContent = (s.value > 0 ? "+" : "") + s.value; paintSoon(); });
  });
  const st = body.querySelector("#ph-straight");
  if (st) st.addEventListener("input", () => {
    ph.straight = Number(st.value); body.querySelector("#ph-straight-v").textContent = (st.value > 0 ? "+" : "") + st.value;
    body.querySelector("#ph-straight-apply").disabled = !ph.straight;
    displayCanvas.style.transform = ph.straight ? `rotate(${ph.straight}deg) scale(${1 + Math.abs(ph.straight) / 40})` : "";
  });
  body.querySelector("#ph-straight-apply")?.addEventListener("click", () => { P.straighten(ph.ed, ph.straight); ph.straight = 0; displayCanvas.style.transform = ""; rerender(); });
  body.querySelector("#ph-rotl")?.addEventListener("click", () => { P.rotate90(ph.ed, -1); rerender(); });
  body.querySelector("#ph-rotr")?.addEventListener("click", () => { P.rotate90(ph.ed, 1); rerender(); });
  body.querySelectorAll("[data-aspect]").forEach((b) => b.addEventListener("click", () => { ph.aspect = Number(b.dataset.aspect); ph.cropRect = null; rerender(); }));
  body.querySelector("#ph-crop-apply")?.addEventListener("click", () => { if (ph.cropRect && P.crop(ph.ed, ph.cropRect)) { ph.cropRect = null; ph.msg = "Recorte aplicado."; } rerender(); });
  body.querySelector("#ph-crop-clear")?.addEventListener("click", () => { ph.cropRect = null; rerender(); });
  body.querySelectorAll("[data-brush]").forEach((b) => b.addEventListener("click", () => { ph.brush = b.dataset.brush; ph.eyedrop = false; rerender(); }));
  body.querySelector("#ph-color")?.addEventListener("input", (e) => { ph.color = e.target.value; });
  body.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => { ph.color = b.dataset.color; ph.eyedrop = false; rerender(); }));
  body.querySelector("#ph-eye")?.addEventListener("click", () => { ph.eyedrop = !ph.eyedrop; rerender(); });
  const sz = body.querySelector("#ph-size");
  if (sz) sz.addEventListener("input", () => { ph.size = Number(sz.value); body.querySelector("#ph-size-v").textContent = sz.value; });
  const instr = body.querySelector("#ph-instr");
  if (instr) instr.addEventListener("input", () => { ph.instr = instr.value; });
  body.querySelector("#ph-ai")?.addEventListener("click", () => runAiEdit());
  body.querySelector("#ph-ai-stop")?.addEventListener("click", () => { if (ph.ctrl) ph.ctrl.abort(); });
  const cmp = body.querySelector("#ph-cmp");
  if (cmp) cmp.addEventListener("input", () => { ph.cmp = Number(cmp.value); body.querySelector(".ba").style.setProperty("--cut", ph.cmp + "%"); });
  body.querySelector("#ph-use")?.addEventListener("click", async () => {
    const c = await P.loadImage(ph.result.blob);
    P.pushUndo(ph.ed); ph.ed.base = c; dropResult(); ph.msg = "Resultado aplicado. Puede seguir ajustándolo o guardarlo."; rerender();
  });
  body.querySelector("#ph-res-down")?.addEventListener("click", () => P.shareOrDownload(ph.result.blob, ph.name.replace(/\.jpg$/, ph.result.blob.type === "image/png" ? ".png" : ".jpg"), { share: false }));
  body.querySelector("#ph-res-discard")?.addEventListener("click", () => { dropResult(); rerender(); });
  body.querySelector("#ph-undo")?.addEventListener("click", () => { if (P.undo(ph.ed)) { ph.msg = ""; rerender(); } });
  body.querySelector("#ph-reset")?.addEventListener("click", () => { if (confirm("¿Volver a la foto original? Se pierden los cambios (puede deshacer).")) { P.reset(ph.ed); rerender(); } });
  body.querySelector("#ph-down")?.addEventListener("click", () => exportPhoto(false));
  body.querySelector("#ph-share")?.addEventListener("click", () => exportPhoto(true));
}
function dropResult() { [ph.resultUrl, ph.beforeUrl].forEach((u) => u && URL.revokeObjectURL(u)); ph.result = null; ph.resultUrl = ph.beforeUrl = ""; }
async function exportPhoto(share) {
  const blob = await P.toBlob(P.render(ph.ed));
  const r = await P.shareOrDownload(blob, ph.name, { share });
  ph.msg = r === "shared" ? "Listo. Para guardarla en Fotos elija “Guardar imagen” en el menú de compartir." : r === "downloaded" ? `Descargada como ${ph.name}.` : "";
  rerender();
}
function bindCanvas() {
  const cv = displayCanvas;
  let drawing = null;
  const toBase = (ev) => { const r = cv.getBoundingClientRect(); const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height; return { fx: Math.max(0, Math.min(1, fx)), fy: Math.max(0, Math.min(1, fy)), x: fx * ph.ed.base.width, y: fy * ph.ed.base.height, scale: ph.ed.base.width / r.width }; };
  cv.onpointerdown = (ev) => {
    if (!ph.ed || (ph.mode !== "pincel" && ph.mode !== "recortar")) return;
    ev.preventDefault(); cv.setPointerCapture(ev.pointerId);
    const p = toBase(ev);
    if (ph.mode === "recortar") { drawing = { crop: true, x0: p.fx, y0: p.fy }; return; }
    if (ph.eyedrop) { ph.color = P.pickColor(ph.ed, p.x, p.y); ph.eyedrop = false; rerender(); return; }
    P.pushUndo(ph.ed);
    const size = ph.size * p.scale;
    drawing = { last: p, size, blur: ph.brush === "suavizar" ? P.blurCanvas(ph.ed.base, Math.max(4, Math.round(size / 5))) : null };
    P.brushStroke(ph.ed, [p], { mode: ph.brush === "suavizar" ? "smooth" : "paint", color: ph.color, size, blurCopy: drawing.blur });
    paintSoon();
  };
  cv.onpointermove = (ev) => {
    if (!drawing) return;
    const p = toBase(ev);
    if (drawing.crop) {
      let w = p.fx - drawing.x0, h = p.fy - drawing.y0;
      if (ph.aspect) { const ar = ph.aspect * (ph.ed.base.height / ph.ed.base.width); h = Math.sign(h || 1) * Math.abs(w) / ar; }
      const x = Math.min(drawing.x0, drawing.x0 + w), y = Math.min(drawing.y0, drawing.y0 + h);
      ph.cropRect = { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(Math.abs(w), 1 - Math.max(0, x)), h: Math.min(Math.abs(h), 1 - Math.max(0, y)) };
      paintSoon(); return;
    }
    P.brushStroke(ph.ed, [drawing.last, p], { mode: ph.brush === "suavizar" ? "smooth" : "paint", color: ph.color, size: drawing.size, blurCopy: drawing.blur });
    drawing.last = p; paintSoon();
  };
  cv.onpointerup = cv.onpointercancel = () => {
    if (!drawing) return;
    const wasCrop = drawing.crop; drawing = null;
    if (wasCrop) { if (ph.cropRect && (ph.cropRect.w < 0.03 || ph.cropRect.h < 0.03)) ph.cropRect = null; rerender(); }
    else rerender();
  };
}
async function runAiEdit() {
  const instr = (ph.instr || "").trim();
  if (!instr) { ph.error = { kind: "input", title: "Falta la instrucción", text: "Escriba qué quiere cambiar en la foto." }; rerender(); return; }
  ph.busy = true; ph.error = null; ph.status = "Preparando la foto…"; ph.ctrl = new AbortController(); rerender();
  try {
    const before = P.render(ph.ed);
    const send = before.width > 1536 || before.height > 1536 ? scaleTo(before, 1536) : before;
    const blob = await P.toBlob(send, "image/jpeg", 0.9);
    const r = await P.aiEdit(deps.getKey(), blob, instr, { signal: ph.ctrl.signal, onStatus: (s) => { ph.status = s; const el = document.querySelector("#ph-stage ~ .tl-tools .status-box span"); if (el) el.textContent = s; } });
    if (!ph.busy) return;
    if (r.ok) {
      dropResult();
      ph.result = r; ph.resultUrl = URL.createObjectURL(r.blob); ph.beforeUrl = URL.createObjectURL(blob); ph.cmp = 50;
    } else if (!r.stopped) ph.error = r;
  } catch (e) {
    if (!(e && e.name === "AbortError")) ph.error = P.classifyImageError(0);
  } finally { ph.busy = false; ph.ctrl = null; rerender(); }
}
function scaleTo(c, edge) { const k = edge / Math.max(c.width, c.height); const o = P.canvas(Math.round(c.width * k), Math.round(c.height * k)); o.getContext("2d").drawImage(c, 0, 0, o.width, o.height); return o; }

// ================= CÓDIGO =================
const TASKS = [["errores", "Encontrar y corregir errores"], ["explicar", "Explicar el código"], ["mejorar", "Mejorar / optimizar"], ["nuevo", "Escribir código nuevo"]];
const TASK_TEXT = { errores: "Revise este código, encuentre los errores, explíquelos en palabras sencillas y deme el código corregido.", explicar: "Explíqueme paso a paso qué hace este código.",
  mejorar: "Mejore este código (más claro, seguro y eficiente) sin cambiar lo que hace, y explique los cambios.", nuevo: "Escriba el código que le describo." };
export function codeMessage(code, { lang = "auto", name = "", task = "errores", detail = "" } = {}) {
  const L = lang === "auto" || !lang ? (C.langFromName(name) || C.guessLang(code)) : C.normLang(lang);
  const head = (TASK_TEXT[task] || TASK_TEXT.errores) + (detail.trim() ? `\n${detail.trim()}` : "");
  return code.trim() ? `${head}${name ? `\nArchivo: ${name}` : ""}\n\n\`\`\`${L}\n${code.replace(/\s+$/, "")}\n\`\`\`` : head;
}
function codeHtml() {
  const L = cd.lang === "auto" ? (C.langFromName(cd.name) || (cd.code ? C.guessLang(cd.code) : "")) : C.normLang(cd.lang);
  const langs = ["auto", "javascript", "python", "html", "css", "java", "csharp", "sql", "json", "typescript", "php", "cpp", "c", "go", "bash", "vb"];
  const lines = cd.code ? cd.code.split("\n").length : 0;
  const out = cd.out ? `<section class="tl-out ${cd.out.ok ? "ok" : "ko"}" aria-label="Resultado de la ejecución" role="status">
      <h3 class="tl-h">${cd.out.ok ? "Ejecución terminada" : cd.out.timeout ? "Tiempo agotado" : "Error al ejecutar"}</h3>
      <pre class="tl-console">${cd.out.logs.map((l) => `<span class="lg-${l.level}">${esc(l.text)}</span>`).join("\n")}${cd.out.value !== undefined && cd.out.value !== null ? `${cd.out.logs.length ? "\n" : ""}<span class="lg-ret">← ${esc(cd.out.value)}</span>` : ""}${cd.out.error ? `${cd.out.logs.length ? "\n" : ""}<span class="lg-error">${esc(cd.out.error)}</span>` : ""}${!cd.out.logs.length && !cd.out.error && (cd.out.value === undefined || cd.out.value === null) ? '<span class="lg-dim">(sin salida: use console.log para ver valores)</span>' : ""}</pre>
    </section>` : "";
  return `<input type="file" id="cd-file" accept="${C.CODE_ACCEPT},text/*" hidden>
    <p class="landing-intro">Pegue su código o abra un archivo. Antares busca errores, se los explica sencillo y le devuelve el código corregido en el chat.</p>
    <div class="form-row"><select class="field" id="cd-lang" aria-label="Lenguaje">${langs.map((l) => `<option value="${l}"${cd.lang === l ? " selected" : ""}>${l === "auto" ? `Detectar${L && cd.lang === "auto" ? ` (${C.LANG_LABEL[L] || L})` : ""}` : C.LANG_LABEL[l]}</option>`).join("")}</select>
      <button type="button" class="btn" id="cd-open">Abrir archivo</button></div>
    ${cd.name ? `<p class="hint">Archivo: <strong>${esc(cd.name)}</strong> · ${lines} líneas</p>` : ""}
    <label class="field-label" for="cd-code">Código</label>
    <textarea class="field code-field" id="cd-code" rows="10" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Pegue aquí su código…">${esc(cd.code)}</textarea>
    <div class="picks" role="group" aria-label="¿Qué necesita?">${TASKS.map(([id, l]) => `<button type="button" class="pick${cd.task === id ? " on" : ""}" data-task="${id}" aria-pressed="${cd.task === id}">${l}</button>`).join("")}</div>
    <label class="field-label" for="cd-detail">Detalles (opcional)</label>
    <input class="field" id="cd-detail" maxlength="400" value="${esc(cd.detail)}" placeholder="Ej.: da error en la línea 12 / quiero que lea un CSV">
    <div class="btn-row wrap">
      <button type="button" class="btn primary" id="cd-send"${deps.hasKey() ? "" : " disabled"}>Enviar a Antares</button>
      ${L === "javascript" ? `<button type="button" class="btn" id="cd-run"${cd.running ? " disabled" : ""}>${cd.running ? "Ejecutando…" : "Ejecutar JavaScript"}</button>` : ""}
      ${cd.code ? `<button type="button" class="btn" id="cd-clear">Borrar</button>` : ""}
    </div>
    ${deps.hasKey() ? "" : `<p class="hint">Configure su API key de Gemini para que Antares revise el código.</p>`}
    ${cd.msg ? `<p class="hint" role="status">${esc(cd.msg)}</p>` : ""}
    ${out}
    <p class="hint panel-note">JavaScript se ejecuta aislado en un hilo aparte, sin acceso a internet ni a sus datos, y se detiene a los 3 segundos. Otros lenguajes se revisan pero no se ejecutan aquí.</p>`;
}
export async function readCodeFile(f) {
  if (f.size > C.MAX_CODE_BYTES) return { ok: false, error: `El archivo es muy grande (máximo ${Math.round(C.MAX_CODE_BYTES / 1024)} KB).` };
  const text = await f.text();
  if (/\u0000/.test(text.slice(0, 2000))) return { ok: false, error: "Ese archivo no parece ser texto o código." };
  return { ok: true, text, name: f.name, lang: C.langFromName(f.name) || C.guessLang(text) };
}
function codeBind(body) {
  const fi = body.querySelector("#cd-file");
  body.querySelector("#cd-open")?.addEventListener("click", () => fi.click());
  fi?.addEventListener("change", async () => {
    const f = fi.files && fi.files[0]; fi.value = "";
    if (!f) return;
    const r = await readCodeFile(f);
    if (!r.ok) cd.msg = r.error; else { cd.code = r.text; cd.name = r.name; cd.lang = "auto"; cd.out = null; cd.msg = ""; }
    rerender();
  });
  const ta = body.querySelector("#cd-code");
  ta?.addEventListener("input", () => { cd.code = ta.value; });
  ta?.addEventListener("change", () => rerender());
  body.querySelector("#cd-lang")?.addEventListener("change", (e) => { cd.lang = e.target.value; rerender(); });
  body.querySelector("#cd-detail")?.addEventListener("input", (e) => { cd.detail = e.target.value; });
  body.querySelectorAll("[data-task]").forEach((b) => b.addEventListener("click", () => { cd.task = b.dataset.task; rerender(); }));
  body.querySelector("#cd-clear")?.addEventListener("click", () => { cd = freshCode(); rerender(); });
  body.querySelector("#cd-run")?.addEventListener("click", async () => {
    cd.running = true; cd.out = null; rerender();
    cd.out = await C.runJs(cd.code, { timeoutMs: 3000 });
    cd.running = false; rerender();
  });
  body.querySelector("#cd-send")?.addEventListener("click", () => {
    if (!cd.code.trim() && cd.task !== "nuevo") { cd.msg = "Pegue el código o abra un archivo primero."; rerender(); return; }
    if (cd.task === "nuevo" && !cd.detail.trim() && !cd.code.trim()) { cd.msg = "Describa en Detalles qué código necesita."; rerender(); return; }
    deps.sendCode(codeMessage(cd.code, cd));
  });
}

// ================= EXCEL =================
function sheetTableHtml(t, limit = 100) {
  const rows = t.rows.slice(0, limit);
  return `<div class="tl-table-wrap" tabindex="0" role="region" aria-label="Vista previa de la hoja">
    <table class="tl-table"><caption class="sr-only">${esc(t.name)}: primeras ${rows.length} de ${t.rows.length} filas</caption>
      <thead><tr><th scope="col" class="rn">#</th>${t.headers.map((h, i) => `<th scope="col"><span class="cl">${X.colLetter(i)}</span>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr><th scope="row" class="rn">${X.excelRow(t, i)}</th>${r.map((v, c) => `<td class="${t.types[c] === "número" ? "n" : ""}">${esc(X.fmtVal(v))}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>${t.rows.length > limit ? `<p class="hint">Mostrando ${limit} de ${t.rows.length} filas. Los cálculos usan todas.</p>` : ""}`;
}
function resultHtml(r) {
  if (r.kind === "value") return `<div class="tl-res"><h4>${esc(r.title)}</h4><p class="tl-big">${esc(X.fmtVal(r.value))}</p></div>`;
  const rows = r.rows || [];
  return `<div class="tl-res"><h4>${esc(r.title)}${r.kind === "table" && r.value != null && rows.length !== r.value ? ` <small>(${r.value})</small>` : ""}</h4>
    ${rows.length ? `<div class="tl-table-wrap" tabindex="0" role="region" aria-label="${esc(r.title)}"><table class="tl-table"><thead><tr>${r.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${rows.slice(0, 200).map((row) => `<tr>${row.map((v) => `<td class="${typeof v === "number" ? "n" : ""}">${esc(X.fmtVal(v))}</td>`).join("")}</tr>`).join("")}
      ${r.total != null ? `<tr class="tot"><th scope="row">Total</th><td class="n">${esc(X.fmtVal(r.total))}</td>${r.columns.length > 2 ? "<td></td>".repeat(r.columns.length - 2) : ""}</tr>` : ""}</tbody></table></div>`
      : `<p class="hint">${esc(r.empty || "Sin resultados.")}</p>`}</div>`;
}
function sheetHtml() {
  const pick = `<input type="file" id="sh-file" accept="${X.SHEET_ACCEPT}" hidden>`;
  if (sh.loading) return `${pick}<p class="empty-note" role="status">Abriendo la hoja…</p>`;
  if (!sh.t) return `${pick}
    <p class="landing-intro">Abra un archivo de Excel (.xlsx, .xls) o CSV. Antares le muestra la hoja, suma por ruta, busca duplicados y errores, le explica fórmulas y puede modificarla y exportarla.</p>
    <div class="btn-row"><button type="button" class="btn primary" id="sh-open">Abrir archivo</button><button type="button" class="btn" id="sh-sample">Hoja de ejemplo</button></div>
    ${sh.error ? `<div class="warn-box" role="alert"><p>${esc(sh.error)}</p></div>` : ""}
    <p class="hint panel-note">Las cuentas se hacen en su teléfono sobre todas las filas. A Gemini solo se envían los encabezados y una muestra de las primeras filas.</p>`;
  const t = sh.t, numCols = t.headers.map((h, i) => [h, i]).filter(([, i]) => t.types[i] === "número"), txtCols = t.headers.map((h, i) => [h, i]).filter(([, i]) => t.types[i] !== "número");
  const opt = (list, sel) => list.map(([h, i]) => `<option value="${i}"${sel === i ? " selected" : ""}>${esc(h)}</option>`).join("");
  return `${pick}
    <div class="tl-file"><strong>${esc(sh.file ? sh.file.name : "Hoja")}</strong>${sh.changed ? ' <span class="tag">modificada</span>' : ""}</div>
    ${sh.wb && sh.wb.SheetNames.length > 1 ? `<label class="field-label" for="sh-sheet">Hoja</label><select class="field" id="sh-sheet">${sh.wb.SheetNames.map((n) => `<option${n === sh.sheet ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>` : ""}
    <div class="kpis"><div><span>FILAS</span><b>${t.rows.length}</b></div><div><span>COLUMNAS</span><b>${t.headers.length}</b></div><div><span>NUMÉRICAS</span><b>${numCols.length}</b></div></div>
    ${sheetTableHtml(t)}
    <section class="tl-ask" aria-label="Preguntar sobre la hoja">
      <label class="field-label" for="sh-q">Pregúntele a Antares</label>
      <textarea class="field" id="sh-q" rows="2" maxlength="500" placeholder="Ej.: ¿cuánto suma cada ruta? / agregue una columna con el IVA / ¿qué hace la fórmula de la columna E?">${esc(sh.q)}</textarea>
      ${sh.busy ? `<div class="status-box pending" role="status"><span>Analizando la hoja…</span></div><button type="button" class="btn" id="sh-stop">Cancelar</button>`
        : `<button type="button" class="btn primary" id="sh-ask"${deps.hasKey() ? "" : " disabled"}>Preguntar</button>`}
    </section>
    ${sh.error ? `<div class="warn-box" role="alert"><p>${esc(sh.error)}</p></div>` : ""}
    ${sh.answer || sh.results.length || sh.log.length || sh.formulas.length ? `<section class="tl-answer" aria-label="Respuesta" aria-live="polite">
      ${sh.answer ? `<p class="tl-answer-text">${esc(sh.answer)}</p>` : ""}
      ${sh.results.map(resultHtml).join("")}
      ${sh.formulas.map((f, k) => `<div class="tl-formula"><code>${esc(f.formula)}</code><button type="button" class="mini-btn" data-copyf="${k}">Copiar</button>${f.explicacion ? `<p class="hint">${esc(f.explicacion)}</p>` : ""}</div>`).join("")}
      ${sh.log.length ? `<ul class="tl-log">${sh.log.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      ${sh.errors.length ? `<p class="hint">No pude hacer: ${esc(sh.errors.join(" · "))}</p>` : ""}
    </section>` : ""}
    <details class="tl-quick"><summary>Herramientas rápidas (sin IA)</summary>
      <div class="btn-row wrap"><button type="button" class="btn" data-q="totals">Totales</button><button type="button" class="btn" data-q="dups">Duplicados</button><button type="button" class="btn" data-q="check">Revisar errores</button></div>
      ${numCols.length && txtCols.length ? `<p class="field-label">Sumar por grupo</p><div class="form-row"><select class="field" id="sh-g" aria-label="Agrupar por">${opt(txtCols, txtCols.find(([h]) => /ruta/i.test(h))?.[1])}</select><select class="field" id="sh-v" aria-label="Columna a sumar">${opt(numCols)}</select></div><button type="button" class="btn" data-q="sumby">Sumar por grupo</button>` : ""}
      <p class="field-label">Ordenar</p><div class="form-row"><select class="field" id="sh-sc" aria-label="Columna para ordenar">${opt(t.headers.map((h, i) => [h, i]))}</select><select class="field" id="sh-sd" aria-label="Dirección"><option value="asc">Ascendente</option><option value="desc">Descendente</option></select></div><button type="button" class="btn" data-q="sort">Ordenar</button>
      <p class="field-label">Agregar columna</p><div class="form-row"><input class="field" id="sh-cn" placeholder="Nombre (ej.: IVA)" maxlength="60"><input class="field" id="sh-ce" placeholder="Cálculo (ej.: [Monto]*0.12)" maxlength="200"></div><button type="button" class="btn" data-q="addcol">Agregar columna</button>
      <p class="hint">En el cálculo use los nombres de columna entre corchetes y punto decimal. Funciones: SI, REDONDEAR, ABS, MAX, MIN, SUMA.</p>
    </details>
    <div class="btn-row wrap tl-actions">
      <button type="button" class="btn" id="sh-undo"${sh.undo.length ? "" : " disabled"}>Deshacer cambio</button>
      <button type="button" class="btn primary" id="sh-export">Exportar .xlsx</button>
      <button type="button" class="btn" id="sh-open">Otro archivo</button>
    </div>
    ${sh.msg ? `<p class="hint" role="status">${esc(sh.msg)}</p>` : ""}`;
}
async function openSheetFile(f) {
  sh = { ...freshSheet(), loading: true };
  if (f.size > X.MAX_SHEET_BYTES) { sh = { ...freshSheet(), error: "El archivo es muy grande (máximo 15 MB)." }; return; }
  try {
    const r = await X.readWorkbook(f);
    sh.file = f; sh.wb = r.wb; sh.sheet = r.sheets[0];
    sh.base = sh.t = X.tableFromSheet(r.wb, sh.sheet);
    if (!sh.t.headers.length) throw new Error("vacía");
  } catch (e) {
    sh = { ...freshSheet(), error: /cargar/.test(String(e && e.message)) ? e.message : "No pude leer ese archivo. ¿Es un Excel o CSV válido?" };
  } finally { sh.loading = false; }
}
export const SAMPLE_CSV = "Fecha,Ruta,Cliente,Factura,Cajas,Monto\n01/10/2026,Ruta 1,Tienda La Esperanza,F-1001,12,1250.50\n01/10/2026,Ruta 2,Abarrotería Don Pepe,F-1002,8,840\n02/10/2026,Ruta 1,Super Económico,F-1003,20,2100\n02/10/2026,Ruta 3,Farmacia San José,F-1004,5,515.75\n03/10/2026,Ruta 2,Tienda El Sol,F-1005,15,1580\n03/10/2026,Ruta 1,Tienda La Esperanza,F-1006,10,1040\n04/10/2026,Ruta 3,Despensa Familiar,F-1007,25,2675.25\n04/10/2026,Ruta 2,Abarrotería Don Pepe,F-1002,8,840\n05/10/2026,Ruta 1,Minisúper Lupita,F-1008,,960\n05/10/2026,Ruta 3,Tienda Rosita,F-1009,7,abc\n";
function applyOps(ops, { keepAnswer = false } = {}) {
  const r = X.runOps(sh.t, ops);
  if (r.changed) { sh.undo.push(sh.t); if (sh.undo.length > 10) sh.undo.shift(); sh.t = r.table; sh.changed = true; }
  if (!keepAnswer) sh.answer = "";
  sh.results = r.results; sh.log = r.log; sh.errors = r.errors; if (!keepAnswer) sh.formulas = [];
  return r;
}
async function askSheet() {
  const q = sh.q.trim();
  if (!q) { sh.error = "Escriba su pregunta sobre la hoja."; rerender(); return; }
  sh.busy = true; sh.error = ""; sh.ctrl = new AbortController(); rerender();
  try {
    const r = await deps.askJson(X.SHEET_SYSTEM, X.sheetPrompt(sh.t, q), { signal: sh.ctrl.signal });
    if (!sh.busy) return;
    if (!r || !r.ok) { if (!(r && r.stopped)) sh.error = (r && r.error) || "No pude consultar a Gemini. Intente de nuevo."; return; }
    let j;
    try { j = JSON.parse(String(r.text).replace(/^```(json)?/i, "").replace(/```\s*$/, "").trim()); } catch { sh.error = "La respuesta no vino en el formato esperado. Intente de nuevo."; return; }
    const res = applyOps(Array.isArray(j.operaciones) ? j.operaciones : [], { keepAnswer: true });
    sh.answer = X.fillPlaceholders(j.respuesta || "", res.results);
    sh.formulas = (Array.isArray(j.formulas) ? j.formulas : []).filter((f) => f && typeof f.formula === "string").slice(0, 4);
  } catch (e) { if (!(e && e.name === "AbortError")) sh.error = "No pude analizar la hoja. Intente de nuevo."; }
  finally { sh.busy = false; sh.ctrl = null; rerender(); }
}
function sheetBind(body) {
  const fi = body.querySelector("#sh-file");
  body.querySelectorAll("#sh-open").forEach((b) => b.addEventListener("click", () => fi.click()));
  fi?.addEventListener("change", async () => {
    const f = fi.files && fi.files[0]; fi.value = "";
    if (!f) return;
    sh.loading = true; rerender();
    await openSheetFile(f); rerender();
  });
  body.querySelector("#sh-sample")?.addEventListener("click", async () => {
    sh.loading = true; rerender();
    await openSheetFile(new File([SAMPLE_CSV], "ventas-ejemplo.csv", { type: "text/csv" })); rerender();
  });
  if (!sh.t) return;
  body.querySelector("#sh-sheet")?.addEventListener("change", (e) => { sh.sheet = e.target.value; sh.base = sh.t = X.tableFromSheet(sh.wb, sh.sheet); sh.undo = []; sh.results = []; sh.answer = ""; sh.log = []; sh.changed = false; rerender(); });
  const qa = body.querySelector("#sh-q");
  qa?.addEventListener("input", () => { sh.q = qa.value; });
  body.querySelector("#sh-ask")?.addEventListener("click", askSheet);
  body.querySelector("#sh-stop")?.addEventListener("click", () => { if (sh.ctrl) sh.ctrl.abort(); sh.busy = false; rerender(); });
  const val = (id) => body.querySelector(id)?.value;
  body.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.q;
    const ops = k === "totals" ? [{ op: "totals" }] : k === "dups" ? [{ op: "duplicates", cols: [] }] : k === "check" ? [{ op: "check" }]
      : k === "sumby" ? [{ op: "sumBy", group: Number(val("#sh-g")), value: Number(val("#sh-v")) }]
      : k === "sort" ? [{ op: "sort", col: Number(val("#sh-sc")), dir: val("#sh-sd") }]
      : [{ op: "addColumn", name: (val("#sh-cn") || "").trim() || "Nueva columna", expr: val("#sh-ce") || "" }];
    if (k === "dups") { const f = sh.t.headers.findIndex((h) => /factura|c[oó]digo|id\b|n[uú]mero/i.test(h)); if (f >= 0) ops[0].cols = [f]; }
    const r = applyOps(ops);
    sh.msg = r.errors.length ? "" : r.changed ? "Listo. Puede exportar la hoja modificada." : "";
    rerender();
  }));
  body.querySelectorAll("[data-copyf]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(sh.formulas[Number(b.dataset.copyf)].formula); b.textContent = "Copiada"; } catch { b.textContent = "No se pudo"; }
  }));
  body.querySelector("#sh-undo")?.addEventListener("click", () => { if (sh.undo.length) { sh.t = sh.undo.pop(); sh.changed = sh.undo.length > 0; sh.results = []; sh.log = ["Deshice el último cambio."]; rerender(); } });
  body.querySelector("#sh-export")?.addEventListener("click", async () => {
    try {
      await X.loadXLSX();
      const blob = X.exportXlsx(sh.wb, sh.sheet, sh.t), name = X.editedName(sh.file ? sh.file.name : "hoja.xlsx");
      const r = await P.shareOrDownload(blob, name, { share: false });
      sh.msg = r === "downloaded" ? `Exportada como ${name}.` : "";
    } catch { sh.msg = "No pude exportar la hoja."; }
    rerender();
  });
}

// ================= API del panel =================
export function html(tab) {
  if (tab === "codigo") return codeHtml();
  if (tab === "excel") return sheetHtml();
  return photoHtml();
}
export function bind(tab, body) {
  if (!body) return;
  if (tab === "codigo") codeBind(body);
  else if (tab === "excel") sheetBind(body);
  else photoBind(body);
}
