// Muestra: búsqueda visual de COSAS con Gemini (clave del usuario). Nunca identifica personas.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELOS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"];
const K_OWN = "antares.buscar.key.v1", K_HIST = "antares.buscar.hist.v1";
let stream = null, imgData = null, ultimo = null;

// ---------- clave: la de Antares (mismo sitio) o una propia de la muestra ----------
function clave() {
  try { const c = JSON.parse(localStorage.getItem("antares.config.v1") || "null"); if (c && c.geminiApiKey) return c.geminiApiKey; } catch { /* */ }
  return localStorage.getItem(K_OWN) || "";
}
function pedirClave() {
  return new Promise((ok) => { const d = $("#dlg"); $("#key-in").value = ""; d.showModal();
    d.onclose = () => { if (d.returnValue === "ok" && $("#key-in").value.trim()) { localStorage.setItem(K_OWN, $("#key-in").value.trim()); ok(true); } else ok(false); }; });
}
$("#btn-key").onclick = () => pedirClave();

// ---------- estado / visor ----------
const estado = (t, err) => { const e = $("#estado"); e.textContent = t; e.classList.toggle("err", !!err); };
function mostrarFoto(url) {
  $("#foto").src = url; $("#foto").classList.remove("hidden"); $("#vid").classList.add("hidden"); $("#ph").classList.add("hidden");
  $("#caja").style.display = "none"; $("#btn-buscar").disabled = false; $("#btn-buscar").textContent = "⌕ BUSCAR";
}
function pararCam() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } $("#vid").srcObject = null; $("#btn-cam").textContent = "◉ CÁMARA"; }
document.addEventListener("visibilitychange", () => { if (document.hidden) pararCam(); });

// ---------- cámara (solo la de este teléfono, con permiso) ----------
$("#btn-cam").onclick = async () => {
  if (stream) { congelar(); return; }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { estado("ESTE NAVEGADOR NO PERMITE LA CÁMARA AQUÍ · USE LA GALERÍA", true); return; }
  const tries = [{ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }, { video: true, audio: false }];
  let last;
  for (const c of tries) { try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { last = e; if (e.name === "NotAllowedError" || e.name === "SecurityError") break; } }
  if (!stream) { estado(last && last.name === "NotAllowedError" ? "PERMISO DE CÁMARA NEGADO · iPhone: Ajustes › Safari › Cámara › Permitir" : "NO SE PUDO ABRIR LA CÁMARA", true); return; }
  const v = $("#vid"); v.srcObject = stream; v.classList.remove("hidden"); $("#foto").classList.add("hidden"); $("#ph").classList.add("hidden"); $("#caja").style.display = "none";
  try { await v.play(); } catch { /* */ }
  $("#btn-cam").textContent = "◼ CONGELAR"; $("#btn-buscar").disabled = false; $("#btn-buscar").textContent = "⌕ CONGELAR Y BUSCAR"; estado("CÁMARA ACTIVA · APUNTE AL OBJETO");
};
function congelar() {
  const v = $("#vid"); if (!v.videoWidth) return false;
  const s = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s); c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  imgData = c.toDataURL("image/jpeg", 0.82); pararCam(); mostrarFoto(imgData); estado("IMAGEN CONGELADA"); return true;
}
// ---------- galería ----------
$("#file").onchange = async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return; pararCam();
  try { imgData = await reducir(f); mostrarFoto(imgData); estado("FOTO LISTA · TOQUE BUSCAR"); } catch { estado("NO SE PUDO LEER ESA FOTO", true); }
  e.target.value = "";
};
function reducir(file) {
  return new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const s = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL("image/jpeg", 0.82)); };
    im.onerror = () => { URL.revokeObjectURL(u); no(); }; im.src = u; });
}

// ---------- Gemini ----------
const PROMPT = `Usted es el buscador visual de Antares (Costa Rica). Identifique la COSA principal de la foto: objeto, producto, repuesto de carro, herramienta, planta, animal, comida, lugar o monumento, o texto/etiqueta.
REGLA ESTRICTA DE PRIVACIDAD: NUNCA reconozca caras ni diga quién es una persona (ni nombres, ni famosos, ni suposiciones de identidad, edad exacta, origen o rasgos sensibles). Si aparece una persona, descríbala solo de forma genérica ("una persona con camisa azul") y enfóquese en los objetos. Si lo único en la foto es una persona, ponga categoria "persona", nombre "Persona (no se identifica)" y explique que solo busca cosas.
Responda en español de Costa Rica, tratando de "usted". Sea concreto. Si se ve marca, modelo, número de parte o texto, transcríbalo. El precio es un ESTIMADO en colones (₡) en Costa Rica, solo si aplica a algo que se compra; si no, deje precio vacío. "caja" es el recuadro del objeto principal en [ymin, xmin, ymax, xmax] escala 0-1000. "busqueda" es el texto ideal para buscarlo en tiendas. Para lugares, ponga "lugar" con nombre y ciudad/país si es reconocible.`;
const SCHEMA = { type: "OBJECT", properties: {
  nombre: { type: "STRING" }, categoria: { type: "STRING", enum: ["objeto", "producto", "repuesto", "herramienta", "planta", "animal", "comida", "lugar", "texto", "persona", "otro"] },
  descripcion: { type: "STRING" }, marca: { type: "STRING" }, modelo: { type: "STRING" }, numero_parte: { type: "STRING" }, texto_visible: { type: "STRING" },
  precio: { type: "OBJECT", properties: { min: { type: "NUMBER" }, max: { type: "NUMBER" }, nota: { type: "STRING" } } },
  uso_cuidado: { type: "STRING" }, relacionados: { type: "ARRAY", items: { type: "STRING" } }, busqueda: { type: "STRING" },
  lugar: { type: "STRING" }, confianza: { type: "STRING", enum: ["alta", "media", "baja"] }, caja: { type: "ARRAY", items: { type: "NUMBER" } } },
  required: ["nombre", "categoria", "descripcion", "relacionados", "busqueda"] };

async function gemini(parts) {
  let k = clave(); if (!k) { if (!(await pedirClave())) throw Error("sin clave"); k = clave(); }
  let lastErr;
  for (const m of MODELOS) {
    try {
      const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(`${BASE}/${m}:generateContent`, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": k },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: PROMPT }] }, contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: SCHEMA } }) });
      clearTimeout(t);
      if (r.status === 400 || r.status === 403) { const j = await r.json().catch(() => ({})); throw Object.assign(Error((j.error && j.error.message) || "clave"), { fatal: true }); }
      if (!r.ok) { lastErr = Error("HTTP " + r.status); continue; }
      const j = await r.json(); const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      return JSON.parse(txt);
    } catch (e) { if (e.fatal) throw e; lastErr = e; }
  }
  throw lastErr || Error("sin respuesta");
}

$("#btn-buscar").onclick = async () => {
  if (stream && !congelar()) return;
  if (!imgData) return;
  const b64 = imgData.split(",")[1];
  await correr([{ inlineData: { mimeType: "image/jpeg", data: b64 } }, { text: "¿Qué es esta cosa? Responda con el JSON." }], imgData);
};
async function correr(parts, foto, textoBusqueda) {
  $("#visor").classList.add("busy"); estado("PROCESANDO FLUJO DE DATOS…"); $("#btn-buscar").disabled = true;
  try {
    const d = await gemini(parts);
    pintar(d, foto, textoBusqueda); guardarHist(d, foto); estado("IDENTIFICADO · " + String(d.nombre || "").toUpperCase());
  } catch (e) {
    const m = /sin clave/.test(e.message) ? "Necesita su clave de Gemini (botón ⚿ CLAVE)." : /API key|clave|PERMISSION|invalid/i.test(e.message) ? "La clave de Gemini no funcionó. Revísela con ⚿ CLAVE." : "No se pudo consultar a Gemini (red o límite gratuito). Intente de nuevo en un momento.";
    $("#res").innerHTML = `<div class="card aviso"><h3>FUENTE NO DISPONIBLE</h3><p>${esc(m)}</p></div>`; estado("ERROR", true);
  } finally { $("#visor").classList.remove("busy"); $("#btn-buscar").disabled = !imgData; }
}

// ---------- resultados ----------
const colones = (n) => "₡" + Math.round(n).toLocaleString("es-CR");
function enlaces(d) {
  const q = encodeURIComponent(d.busqueda || d.nombre), lugar = d.categoria === "lugar" || d.lugar;
  const a = [];
  a.push(`<a href="https://lens.google.com/" target="_blank" rel="noopener" data-lens>◎ GOOGLE LENS</a>`);
  a.push(`<a href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">⌕ GOOGLE</a>`);
  if (!lugar && d.categoria !== "persona") {
    a.push(`<a href="https://listado.mercadolibre.co.cr/${encodeURIComponent((d.busqueda || d.nombre).replace(/\s+/g, "-"))}" target="_blank" rel="noopener">▣ MERCADO LIBRE CR</a>`);
    a.push(`<a href="https://www.amazon.com/s?k=${q}" target="_blank" rel="noopener">▣ AMAZON</a>`);
  }
  if (lugar) {
    const lq = encodeURIComponent(d.lugar || d.nombre);
    a.push(`<a href="../muestra-ojo/?q=${lq}" class="rojo">◎ VER EN OJO</a>`);
    a.push(`<a href="https://www.google.com/maps/search/?api=1&query=${lq}" target="_blank" rel="noopener" class="rojo">⌖ GOOGLE MAPS</a>`);
  }
  if (d.categoria === "planta" || d.categoria === "animal") a.push(`<a href="https://es.wikipedia.org/w/index.php?search=${encodeURIComponent(d.nombre)}" target="_blank" rel="noopener">W WIKIPEDIA</a>`);
  return a.join("");
}
function pintar(d, foto, textoBusqueda) {
  ultimo = d;
  // recuadro del objeto principal sobre la imagen congelada (solo si vino de una foto)
  const cj = $("#caja");
  if (foto && Array.isArray(d.caja) && d.caja.length === 4 && d.categoria !== "persona") {
    const [y0, x0, y1, x1] = d.caja.map((n) => Math.max(0, Math.min(1000, n)) / 10);
    const im = $("#foto"), W = im.clientWidth, H = im.clientHeight, nw = im.naturalWidth || W, nh = im.naturalHeight || H;
    const s = Math.max(W / nw, H / nh), dw = nw * s, dh = nh * s, ox = (W - dw) / 2, oy = (H - dh) / 2; // object-fit: cover
    Object.assign(cj.style, { display: "block", left: ox + dw * x0 / 100 + "px", top: oy + dh * y0 / 100 + "px", width: dw * (x1 - x0) / 100 + "px", height: dh * (y1 - y0) / 100 + "px" });
    $("#caja-t").textContent = d.nombre;
  } else cj.style.display = "none";
  const det = [["Marca", d.marca], ["Modelo", d.modelo], ["N.º de parte", d.numero_parte], ["Texto visible", d.texto_visible], ["Lugar", d.lugar], ["Confianza", d.confianza]].filter(([, v]) => v && String(v).trim());
  const p = d.precio && (d.precio.min || d.precio.max) ? d.precio : null;
  const rel = (d.relacionados || []).slice(0, 6);
  $("#res").innerHTML = `
    ${d.categoria === "persona" ? `<div class="card aviso"><h3>PRIVACIDAD</h3><p>Antares no identifica personas. Apunte a un objeto, producto, planta, animal o lugar.</p></div>` : ""}
    <article class="card">
      <div class="cat">${esc(String(d.categoria || "").toUpperCase())}${textoBusqueda ? " · BÚSQUEDA POR TEXTO" : ""}</div>
      <h2>${esc(d.nombre)}</h2><p>${esc(d.descripcion)}</p>
      ${det.length ? `<dl class="kv">${det.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
    </article>
    ${p ? `<article class="card"><h3>PRECIO EN COSTA RICA <span class="est">ESTIMADO</span></h3><div class="precio">${p.min ? colones(p.min) : ""}${p.min && p.max ? " – " : ""}${p.max ? colones(p.max) : ""}</div>${p.nota ? `<p style="font-size:12px;color:var(--m);margin-top:4px">${esc(p.nota)}</p>` : ""}<p style="font-size:11px;color:var(--m);margin-top:6px">Aproximado generado por IA; verifique en tiendas.</p></article>` : ""}
    ${d.uso_cuidado ? `<article class="card"><h3>USO Y CUIDADO</h3><p>${esc(d.uso_cuidado)}</p></article>` : ""}
    <article class="card"><h3>BUSCAR</h3><div class="acc">${enlaces(d)}<button type="button" id="btn-leer">🔊 LEER EN VOZ ALTA</button></div></article>
    ${rel.length ? `<article class="card"><h3>RELACIONADOS</h3><div class="chips">${rel.map((r) => `<button type="button" data-rel="${esc(r)}">${esc(r)}</button>`).join("")}</div></article>` : ""}`;
  $("#btn-leer").onclick = () => leer(d);
  const lens = $("#res [data-lens]"); if (lens && foto) lens.title = "Abra Lens y elija la misma foto";
  $("#res").querySelectorAll("[data-rel]").forEach((b) => b.onclick = () => buscarTexto(b.dataset.rel));
  $("#res").scrollIntoView({ behavior: "smooth", block: "start" });
}
function buscarTexto(t) {
  $("#caja").style.display = "none";
  correr([{ text: `Busque información de esta COSA (sin foto): "${t}". Responda con el JSON (sin "caja").` }], null, t);
}
// ---------- voz ----------
function leer(d) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const p = d.precio && (d.precio.min || d.precio.max) ? ` Precio estimado en Costa Rica: de ${Math.round(d.precio.min || 0)} a ${Math.round(d.precio.max || 0)} colones.` : "";
  const u = new SpeechSynthesisUtterance(`${d.nombre}. ${d.descripcion}${p} ${d.uso_cuidado || ""}`);
  u.lang = "es-CR"; const v = speechSynthesis.getVoices().find((x) => /^es/.test(x.lang)); if (v) u.voice = v; u.rate = 1;
  speechSynthesis.speak(u);
}
// ---------- historial local ----------
function hist() { try { return JSON.parse(localStorage.getItem(K_HIST) || "[]"); } catch { return []; } }
async function miniatura(foto) {
  if (!foto) return "";
  return new Promise((ok) => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = 160; c.height = 120; const g = c.getContext("2d"), s = Math.max(160 / im.width, 120 / im.height); g.drawImage(im, (160 - im.width * s) / 2, (120 - im.height * s) / 2, im.width * s, im.height * s); ok(c.toDataURL("image/jpeg", .6)); }; im.onerror = () => ok(""); im.src = foto; });
}
async function guardarHist(d, foto) {
  const h = hist().filter((x) => x.d.nombre !== d.nombre);
  h.unshift({ t: Date.now(), d, th: d.categoria === "persona" ? "" : await miniatura(foto) }); // sin foto de personas
  try { localStorage.setItem(K_HIST, JSON.stringify(h.slice(0, 12))); } catch { localStorage.setItem(K_HIST, JSON.stringify(h.slice(0, 4))); }
  pintarHist();
}
function pintarHist() {
  const h = hist(); $("#sec-hist").classList.toggle("hidden", !h.length);
  $("#hist").innerHTML = h.map((x, i) => `<button type="button" data-h="${i}">${x.th ? `<img src="${x.th}" alt="">` : `<div style="height:64px;display:flex;align-items:center;justify-content:center;color:var(--g)">⌕</div>`}<span>${esc(x.d.nombre)}</span></button>`).join("");
  $("#hist").querySelectorAll("[data-h]").forEach((b) => b.onclick = () => { const x = h[+b.dataset.h]; $("#caja").style.display = "none"; pintar(x.d, null); });
}
$("#btn-borrar").onclick = () => { localStorage.removeItem(K_HIST); pintarHist(); };
pintarHist();
window.__buscar = { pintar, mostrarFoto };
