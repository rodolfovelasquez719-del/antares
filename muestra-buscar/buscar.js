// Muestra: búsqueda visual de COSAS con Gemini (clave del usuario). Nunca identifica personas.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// v2 (rápido): modelos "lite" sin razonamiento + carrera: si el primero no responde pronto, se lanza otro en paralelo y gana el primero que hable.
const CARRERA = [["gemini-3.1-flash-lite", 0], ["gemini-3.5-flash", 1800], ["gemini-3.5-flash-lite", 4000]];
const LADO = 768, CALIDAD = 0.7, TIEMPO_MAX = 25000;
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
  const s = Math.min(1, LADO / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s); c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  imgData = c.toDataURL("image/jpeg", CALIDAD); pararCam(); mostrarFoto(imgData); estado("IMAGEN CONGELADA"); return true;
}
// ---------- galería ----------
$("#file").onchange = async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return; pararCam();
  try { imgData = await reducir(f); mostrarFoto(imgData); estado("FOTO LISTA · TOQUE BUSCAR"); } catch { estado("NO SE PUDO LEER ESA FOTO", true); }
  e.target.value = "";
};
function reducir(file) {
  return new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const s = Math.min(1, LADO / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL("image/jpeg", CALIDAD)); };
    im.onerror = () => { URL.revokeObjectURL(u); no(); }; im.src = u; });
}

// ---------- Gemini ----------
// Etapa 1 (rápida): qué es. Etapa 2 (en segundo plano): marca, parte, precio, cuidado.
const REGLA = 'NUNCA reconozca caras ni diga quién es una persona (sin nombres ni suposiciones de identidad); si hay una, descríbala solo genéricamente ("una persona con camisa azul"). Si solo hay una persona: categoria "persona", nombre "Persona (no se identifica)".';
const P1 = `Buscador visual de Antares (Costa Rica). Identifique la COSA principal (objeto, producto, repuesto, herramienta, planta, animal, comida, lugar o texto). ${REGLA} Español, trate de "usted". "descripcion": 1-2 frases. "busqueda": texto ideal para buscarlo en tiendas o mapas. "relacionados": 3-6 cosas. "caja": [ymin,xmin,ymax,xmax] 0-1000 del objeto.`;
const S1 = { type: "OBJECT", properties: { nombre: { type: "STRING" }, descripcion: { type: "STRING" }, categoria: { type: "STRING", enum: ["objeto", "producto", "repuesto", "herramienta", "planta", "animal", "comida", "lugar", "texto", "persona", "otro"] }, busqueda: { type: "STRING" }, relacionados: { type: "ARRAY", items: { type: "STRING" } }, caja: { type: "ARRAY", items: { type: "NUMBER" } } },
  required: ["nombre", "descripcion", "categoria", "busqueda", "relacionados"], propertyOrdering: ["nombre", "descripcion", "categoria", "busqueda", "relacionados", "caja"] };
const P2 = (n) => `La cosa de la foto es: "${n}". ${REGLA} Dé SOLO datos visibles o seguros, breves, en español ("usted"): marca, modelo, numero_parte, texto_visible (transcriba), precio ESTIMADO en colones en Costa Rica (min/max, vacío si no se compra), uso_cuidado (2-3 frases), lugar (si es un sitio reconocible: nombre, ciudad, país), confianza. Deje vacío lo que no aplique.`;
const S2 = { type: "OBJECT", properties: { marca: { type: "STRING" }, modelo: { type: "STRING" }, numero_parte: { type: "STRING" }, texto_visible: { type: "STRING" }, precio: { type: "OBJECT", properties: { min: { type: "NUMBER" }, max: { type: "NUMBER" }, nota: { type: "STRING" } } }, uso_cuidado: { type: "STRING" }, lugar: { type: "STRING" }, confianza: { type: "STRING", enum: ["alta", "media", "baja"] } } };

let busqueda = null; // AbortController de la búsqueda en curso
async function asegurarClave() { if (clave()) return clave(); if (!(await pedirClave())) throw Error("sin clave"); return clave(); }
function cuerpo(prompt, schema, parts, model) {
  const gc = { temperature: 0.3, responseMimeType: "application/json", responseSchema: schema };
  if (/gemini-3|latest/.test(model)) gc.thinkingConfig = { thinkingLevel: "minimal" }; else gc.thinkingConfig = { thinkingBudget: 0 };
  return JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: "user", parts }], generationConfig: gc });
}
// Un intento en streaming (SSE). onTexto recibe el texto acumulado. Resuelve con el texto final.
async function intento(model, prompt, schema, parts, señal, alPrimerByte, onTexto) {
  const r = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, { method: "POST", signal: señal, headers: { "Content-Type": "application/json", "x-goog-api-key": clave() }, body: cuerpo(prompt, schema, parts, model) });
  if (r.status === 400 || r.status === 401 || r.status === 403) { const j = await r.json().catch(() => ({})); throw Object.assign(Error((j.error && j.error.message) || "clave"), { fatal: /key|API|permission|PERMISSION/i.test((j.error && j.error.message) || "") }); }
  if (!r.ok || !r.body) throw Error("HTTP " + r.status);
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", txt = "", primero = true;
  for (;;) {
    let tm; const { done, value } = await Promise.race([rd.read(), new Promise((_, no) => { tm = setTimeout(() => { rd.cancel().catch(() => {}); no(Error("estancado")); }, 4000); })]).finally(() => clearTimeout(tm));
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r/g, "");
    let i; while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i); buf = buf.slice(i + 2);
      const l = ev.split("\n").find((x) => x.startsWith("data:")); if (!l) continue;
      let j; try { j = JSON.parse(l.slice(5)); } catch { continue; }
      const p = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("");
      if (p) { if (primero) { primero = false; alPrimerByte(); } txt += p; onTexto(txt); }
    }
  }
  if (!txt) throw Error("vacío");
  return txt;
}
// Carrera escalonada: el primer modelo que empieza a responder gana; los demás se cancelan.
function carrera(prompt, schema, parts, onTexto, padre) {
  return new Promise((ok, no) => {
    let ganador = -1, lanzados = 0, fallos = 0, terminado = false; const ctrls = [], timers = [];
    const cerrar = () => { terminado = true; timers.forEach(clearTimeout); };
    const lanzar = (n) => {
      if (terminado || ganador >= 0 || ctrls[n] || padre.signal.aborted) return;
      clearTimeout(timers[n]); const c = new AbortController(); ctrls[n] = c; lanzados++;
      padre.signal.addEventListener("abort", () => c.abort(), { once: true });
      if (n > 0 && onTexto.length) estado("RED LENTA · PROBANDO OTRA RUTA…"); // solo en la etapa 1
      intento(CARRERA[n][0], prompt, schema, parts, c.signal,
        () => { if (ganador < 0) { ganador = n; timers.forEach(clearTimeout); ctrls.forEach((x, k) => k !== n && x && x.abort()); } },
        (t) => { if (ganador === n) onTexto(t); })
        .then((t) => { if (ganador === n && !terminado) { cerrar(); ok(t); } })
        .catch((e) => {
          if (terminado) return;
          if (e.fatal) { ctrls.forEach((x) => x && x.abort()); cerrar(); return no(e); }
          if (ganador >= 0 && ganador !== n) return;
          if (ganador === n) ganador = -1; // se trabó a medio camino: otro modelo toma el relevo
          fallos++; const sig = CARRERA.findIndex((_, k) => !ctrls[k]);
          if (sig >= 0) lanzar(sig); else if (fallos >= lanzados) { cerrar(); no(e); }
        });
    };
    CARRERA.forEach(([, w], n) => { timers[n] = setTimeout(() => lanzar(n), w); });
    padre.signal.addEventListener("abort", () => { if (!terminado) { cerrar(); no(Object.assign(Error("abort"), { name: "AbortError" })); } }, { once: true });
  });
}
// JSON parcial: saca "nombre" y "descripcion" aunque el JSON no haya terminado
const campo = (t, k) => { const m = t.match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`)); return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, " ") : ""; };

$("#btn-buscar").onclick = async () => {
  if (stream && !congelar()) return;
  if (!imgData) return;
  await correr([{ inlineData: { mimeType: "image/jpeg", data: imgData.split(",")[1] } }, { text: "¿Qué es? JSON." }], imgData);
};
async function correr(parts, foto, textoBusqueda) {
  try { await asegurarClave(); } catch { $("#res").innerHTML = `<div class="card aviso"><h3>FALTA LA CLAVE</h3><p>Necesita su clave de Gemini (botón ⚿ CLAVE).</p></div>`; return; }
  if (busqueda) busqueda.abort();
  const ctl = busqueda = new AbortController(), t0 = performance.now();
  const tope = setTimeout(() => ctl.abort(), TIEMPO_MAX);
  const lento = setTimeout(() => { if (busqueda === ctl) estado("SIGUE BUSCANDO… (RED LENTA)"); }, 6000);
  $("#visor").classList.add("busy"); estado(foto ? "ENVIANDO IMAGEN…" : "BUSCANDO…"); $("#btn-buscar").disabled = true;
  $("#res").innerHTML = `<article class="card"><div class="cat">ANALIZANDO</div><h2 class="cargando">Procesando flujo de datos…</h2></article>`;
  let pintadoRapido = false;
  try {
    const txt = await carrera(P1, S1, parts, (t) => {
      estado("IDENTIFICANDO…");
      const n = campo(t, "nombre"), d = campo(t, "descripcion");
      if (n && (d.length > 15 || /"descripcion"\s*:\s*"(?:[^"\\]|\\.)*"/.test(t))) { pintarRapido(n, d, textoBusqueda); if (!pintadoRapido) { pintadoRapido = true; window.__t1 = Math.round(performance.now() - t0); } }
    }, ctl);
    const d = JSON.parse(txt);
    window.__t2 = Math.round(performance.now() - t0);
    pintar(d, foto, textoBusqueda, { cargando: d.categoria !== "persona" });
    estado("IDENTIFICADO · " + String(d.nombre || "").toUpperCase() + ` · ${(window.__t2 / 1000).toFixed(1)} s`);
    guardarHist(d, foto);
    clearTimeout(tope); clearTimeout(lento);
    $("#visor").classList.remove("busy"); $("#btn-buscar").disabled = !imgData;
    if (d.categoria === "persona") return;
    // etapa 2 en segundo plano (no bloquea)
    const ctl2 = new AbortController(); setTimeout(() => ctl2.abort(), 20000);
    ctl.signal.addEventListener("abort", () => ctl2.abort(), { once: true });
    try {
      const t2 = await carrera(P2(d.nombre), S2, parts, () => {}, ctl2);
      if (busqueda !== ctl) return;
      const full = { ...d, ...JSON.parse(t2) }; pintar(full, foto, textoBusqueda, { quieto: true }); guardarHist(full, foto, true);
    } catch { if (busqueda === ctl) pintar(d, foto, textoBusqueda, { quieto: true, sinDetalles: true }); }
  } catch (e) {
    if (busqueda !== ctl && e.name === "AbortError") return;
    const m = e.name === "AbortError" ? "Tardó demasiado (más de 25 s). Revise la señal e intente de nuevo." : /API key|clave|PERMISSION|invalid/i.test(e.message) ? "La clave de Gemini no funcionó. Revísela con ⚿ CLAVE." : "No se pudo consultar a Gemini (red o límite gratuito). Intente de nuevo en un momento.";
    $("#res").innerHTML = `<div class="card aviso"><h3>FUENTE NO DISPONIBLE</h3><p>${esc(m)}</p></div>`; estado("ERROR", true);
  } finally { clearTimeout(tope); clearTimeout(lento); if (busqueda === ctl) { $("#visor").classList.remove("busy"); $("#btn-buscar").disabled = !imgData; } }
}
function pintarRapido(n, d, textoBusqueda) {
  let c = $("#res .rapida");
  if (!c) { $("#res").innerHTML = `<article class="card rapida"><div class="cat">${textoBusqueda ? "BÚSQUEDA POR TEXTO" : "IDENTIFICADO"}</div><h2></h2><p></p></article>`; c = $("#res .rapida"); }
  c.querySelector("h2").textContent = n; c.querySelector("p").textContent = d;
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
function pintar(d, foto, textoBusqueda, op = {}) {
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
    ${op.cargando ? `<article class="card"><h3>DETALLES</h3><p class="cargando" style="color:var(--m);font-size:13px">Buscando marca, número de parte, precio y cuidados…</p></article>` : ""}
    ${p ? `<article class="card"><h3>PRECIO EN COSTA RICA <span class="est">ESTIMADO</span></h3><div class="precio">${p.min ? colones(p.min) : ""}${p.min && p.max ? " – " : ""}${p.max ? colones(p.max) : ""}</div>${p.nota ? `<p style="font-size:12px;color:var(--m);margin-top:4px">${esc(p.nota)}</p>` : ""}<p style="font-size:11px;color:var(--m);margin-top:6px">Aproximado generado por IA; verifique en tiendas.</p></article>` : ""}
    ${d.uso_cuidado ? `<article class="card"><h3>USO Y CUIDADO</h3><p>${esc(d.uso_cuidado)}</p></article>` : ""}
    <article class="card"><h3>BUSCAR</h3><div class="acc">${enlaces(d)}<button type="button" id="btn-leer">🔊 LEER EN VOZ ALTA</button></div></article>
    ${rel.length ? `<article class="card"><h3>RELACIONADOS</h3><div class="chips">${rel.map((r) => `<button type="button" data-rel="${esc(r)}">${esc(r)}</button>`).join("")}</div></article>` : ""}`;
  $("#btn-leer").onclick = () => leer(d);
  const lens = $("#res [data-lens]"); if (lens && foto) lens.title = "Abra Lens y elija la misma foto";
  $("#res").querySelectorAll("[data-rel]").forEach((b) => b.onclick = () => buscarTexto(b.dataset.rel));
  if (!op.quieto) $("#res").scrollIntoView({ behavior: "smooth", block: "start" });
}
function buscarTexto(t) {
  $("#caja").style.display = "none";
  correr([{ text: `Sin foto. La COSA es: "${t}". Responda con el JSON (sin "caja").` }], null, t);
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
