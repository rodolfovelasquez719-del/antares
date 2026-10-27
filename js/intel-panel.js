// Antares v1.26 · Panel de inteligencias (dentro de la app, como Mi compu; reemplaza la sección Rutas). Antares (jefe) reparte cada pregunta a una inteligencia especialista.
// Cerebro: reglas de ../js/ruteo.mjs (manejo, seguridad, salud, datos y actualidad SIEMPRE a Gemini; charla/redacción a la PC si está emparejada).
// Claves: se leen de este dispositivo (lo que guardó la app o las muestras). Nunca se muestran ni salen a otro lado que no sea Gemini / la PC.
import { GeminiClient } from "./gemini.js";
import { elegirCerebro, respuestaDelicada, necesitaBusqueda, ustedear } from "./ruteo.mjs";
import { PERSONAS, JEFE, PROMPT_BASE, porId, elegirPersona } from "./personas.mjs";
const APP = new URLSearchParams(location.search).has("app") && window.parent !== window;
const padre = (f) => { try { return APP && typeof window.parent[f] === "function" ? window.parent[f]() : null; } catch { return null; } };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const K = "antares.cerebroDoble.v1", URL_PC = "https://antares.tail1d77f2.ts.net", MODELO_PC = "qwen2.5:3b";
const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch { return {}; } };
const appCfg = () => { const c = leer("antares.config.v1"); return c && typeof c === "object" && !c.iv ? c : {}; }; // si está cifrada con PIN, no se lee
// la app entrega la key (también la cifrada con código, ya descifrada en memoria) y el emparejamiento de la compu
const keyGemini = () => padre("__antaresGemKey") || leer(K).gk || appCfg().geminiApiKey || "";
const credPC = () => { const p = padre("__antaresPC"); if (p && p.tok) return { url: (p.url || URL_PC).replace(/\/+$/, ""), tok: p.tok }; const a = appCfg(), l = leer(K); return { url: (a.pcUrl || l.url || URL_PC).replace(/\/+$/, ""), tok: (a.pcToken || l.tok || "").trim() }; };
const cab = () => ({ "Content-Type": "application/json", "X-Antares-Token": credPC().tok });
let activa = null, pc = "nada", salud = null, fija = null, hablar = localStorage.getItem("antares.intel.voz") === "1";
const historial = {}; // por persona

// ---------- tablero ----------
function tarjeta(p) {
  return `<article class="intel" id="i-${p.id}" style="--c:${p.color}" data-id="${p.id}">
    <div class="intel-top"><span class="ico" aria-hidden="true">${p.icono}</span><div><h2>${esc(p.nombre.toUpperCase())}</h2><p>${esc(p.rol)}</p></div><i class="luz" title="estado"></i></div>
    <p class="est" id="e-${p.id}">lista</p>
    <button type="button" class="btn hablar" data-id="${p.id}">Hablar</button></article>`;
}
$("#tablero").insertAdjacentHTML("beforeend", PERSONAS.map(tarjeta).join(""));
function lineas() {
  const svg = $("#lineas"), t = $("#tablero").getBoundingClientRect(), j = $("#jefe").getBoundingClientRect();
  const cx = j.left + j.width / 2 - t.left, cy = j.top + j.height / 2 - t.top;
  svg.setAttribute("viewBox", `0 0 ${t.width} ${t.height}`);
  svg.innerHTML = PERSONAS.map((p) => { const r = $("#i-" + p.id).getBoundingClientRect(); return `<line id="l-${p.id}"${p.id === activa ? ' class="activa"' : ""} x1="${cx}" y1="${cy}" x2="${r.left + r.width / 2 - t.left}" y2="${r.top + r.height / 2 - t.top}" style="--c:${p.color}"/>`; }).join("") + `<circle id="pulso" r="7" cx="${cx}" cy="${cy}" opacity="0"/>`;
}
addEventListener("resize", lineas); new ResizeObserver(lineas).observe($("#tablero"));
function pulso(id) {
  document.querySelectorAll(".intel.activa, #lineas line.activa").forEach((x) => x.classList.remove("activa"));
  activa = id === "antares" ? null : id;
  $("#jefe").classList.add("piensa");
  if (id === "antares") return Promise.resolve();
  const l = $("#l-" + id), c = $("#pulso"); if (!l) return Promise.resolve();
  l.classList.add("activa"); c.style.fill = porId(id).color; c.setAttribute("opacity", "1");
  const x1 = +l.getAttribute("x1"), y1 = +l.getAttribute("y1"), x2 = +l.getAttribute("x2"), y2 = +l.getAttribute("y2"), t0 = performance.now(), D = 700;
  return new Promise((ok) => { const paso = (t) => { const k = Math.min(1, (t - t0) / D); c.setAttribute("cx", x1 + (x2 - x1) * k); c.setAttribute("cy", y1 + (y2 - y1) * k);
    if (k < 1) requestAnimationFrame(paso); else { c.setAttribute("opacity", "0"); $("#i-" + id).classList.add("activa"); ok(); } }; requestAnimationFrame(paso); });
}

// ---------- estado: Gemini, PC y Guardián ----------
function pintarEstados() {
  const g = !!keyGemini();
  for (const p of PERSONAS) if (p.id !== "guardian") { const e = $("#e-" + p.id); e.textContent = g ? (pc === "on" ? "lista · Gemini + PC" : "lista · Gemini") : "sin key de Gemini"; $("#i-" + p.id).dataset.st = g ? "on" : "off"; }
  const eg = $("#e-guardian"), ig = $("#i-guardian");
  if (!credPC().tok) { eg.textContent = "sin conectar (empareje la compu en Mi compu)"; ig.dataset.st = "off"; }
  else if (pc === "tok") { eg.textContent = "clave incorrecta: vuelva a emparejar"; ig.dataset.st = "off"; }
  else if (!salud) { eg.textContent = pc === "off" ? "compu apagada o sin red" : "revisando…"; ig.dataset.st = pc === "off" ? "off" : "wait"; }
  else { const a = salud.ahora || {}, n = (salud.alertas || []).length; eg.textContent = `en vivo · CPU ${Math.round(a.cpu ?? 0)} %` + (a.tempCPU ? ` · ${Math.round(a.tempCPU)} °C` : "") + (n ? ` · ${n} alerta${n > 1 ? "s" : ""}` : " · todo bien"); ig.dataset.st = n ? "alerta" : "on"; }
  $("#jefe-est").textContent = g ? "listo para repartir" : "falta la key de Gemini (Conexión)";
}
async function revisarPC() {
  const { url, tok } = credPC();
  if (!tok) { pc = "nada"; salud = null; pintarEstados(); return; }
  try {
    const r = await fetch(url + "/salud", { headers: cab(), signal: AbortSignal.timeout(8000) });
    if (r.status === 401) { pc = "tok"; salud = null; } else if (r.ok) { pc = "on"; salud = await r.json(); } else { pc = "off"; salud = null; }
  } catch { pc = "off"; salud = null; }
  pintarEstados();
}
function resumenSalud() {
  if (!salud) return "";
  const a = salud.ahora || {}, d = (a.discos || []).map((x) => `${x.letra}: ${Math.round(x.libreGB)} GB libres de ${Math.round(x.totalGB)}`).join("; ");
  return "DATOS EN VIVO DE LA COMPU ANTARES (recién medidos): " + [`CPU ${a.cpu} %`, a.tempCPU ? `temperatura CPU ${a.tempCPU} °C` : "temperatura no disponible",
    a.ramMB && a.ramTotalMB ? `RAM ${(a.ramMB / 1024).toFixed(1)} de ${(a.ramTotalMB / 1024).toFixed(1)} GB` : "", d && "discos " + d, `internet ${a.internet ? "sí" : "no"}`, a.ping1111 != null ? `ping ${a.ping1111} ms` : "",
    `Ollama ${a.ollama ? "en línea" : "caído"}`, `alertas: ${(salud.alertas || []).map((x) => x.texto || x.msg || x.tipo).join(", ") || "ninguna"}`].filter(Boolean).join("; ") + ".";
}

// ---------- chat ----------
function burbuja(cls, html) { const d = document.createElement("div"); d.className = "msg " + cls; d.innerHTML = html; $("#chat").append(d); d.scrollIntoView({ block: "end", behavior: "smooth" }); return d; }
function modoFijo(id) {
  fija = id ? porId(id) : null;
  $("#modo").innerHTML = fija ? `Hablando con <b style="color:${fija.color}">${fija.icono} ${esc(fija.nombre)}</b> <button type="button" class="chip" id="auto">✕ que decida Antares</button>` : "Automático: <b>Antares decide</b> quién contesta";
  const a = $("#auto"); if (a) a.addEventListener("click", () => modoFijo(null));
  $("#q").placeholder = fija ? `Escríbale a ${fija.nombre}…` : "Pregúntele a Antares…";
}
async function pcResponder(p, texto, out) {
  const sistema = PROMPT_BASE + " " + p.sistema + " REGLAS FIJAS: trate SIEMPRE de usted. Nunca dé datos, cifras, fechas, precios ni consejos de manejo, seguridad, salud o electricidad: en esos casos diga solo «Eso prefiero consultarlo con Gemini, don Freddy».";
  const r = await fetch(credPC().url + "/api/chat", { method: "POST", headers: cab(), body: JSON.stringify({ model: MODELO_PC, stream: true, keep_alive: "30m", messages: [{ role: "system", content: sistema }, ...(historial[p.id] || []).slice(-6), { role: "user", content: texto }], options: { temperature: 0.6, num_predict: 400 } }) });
  if (!r.ok) throw Error("PC " + r.status);
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", txt = "";
  for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue; const j = JSON.parse(l); if (j.error) throw Error(j.error); if (j.message?.content) { txt += j.message.content; out.textContent = txt; } } }
  if (!txt.trim()) throw Error("respuesta vacía"); return txt.trim();
}
async function gemResponder(p, texto, out) {
  const k = keyGemini(); if (!k) throw Error("Este dispositivo no tiene key de Gemini. Ábrala en Conexión.");
  const g = new GeminiClient({ apiKey: k, assistantName: p.nombre, userName: "Freddy", personality: PROMPT_BASE + " " + p.sistema });
  const extra = p.id === "guardian" ? (resumenSalud() || "No hay datos en vivo de la compu (no está emparejada o no responde); dígalo con honestidad.") : "";
  const r = await g.ask(texto, (historial[p.id] || []).slice(-6), [], { search: necesitaBusqueda(texto), extraSystem: extra, onChunk: (t) => { out.textContent = t; } });
  if (!r.ok) throw Error([r.title, r.text].filter(Boolean).join(": ") || "Gemini no respondió");
  return r.text;
}
function decir(p, t) {
  if (!hablar || !("speechSynthesis" in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t.slice(0, 600)); u.lang = "es-CR"; const v = speechSynthesis.getVoices().find((x) => /^es/i.test(x.lang)); if (v) u.voice = v; u.pitch = p.tono; u.rate = 1; speechSynthesis.speak(u); } catch { /* */ }
}
async function enviar(e) {
  e && e.preventDefault();
  const texto = $("#q").value.trim(); if (!texto) return;
  $("#q").value = ""; $("#send").disabled = true;
  burbuja("yo", esc(texto));
  const elec = fija ? { persona: fija, seguro: true } : elegirPersona(texto), p = elec.persona;
  const nota = burbuja("jefe", (p.id === "antares" ? "" : `<span class="mini" style="--c:${p.color}" aria-hidden="true"><b>◉</b><i></i><b>${p.icono}</b></span>`) + `◉ Antares: ${p.id === "antares" ? "esta la contesto yo." : `esta la toma <b style="color:${p.color}">${p.icono} ${esc(p.nombre)}</b>.`}`);
  nota.dataset.persona = p.id;
  await pulso(p.id);
  const div = burbuja("ant", `<div class="quien" style="color:${p.color}">${p.icono} ${esc(p.nombre.toUpperCase())}</div><div class="txt cursor"></div><div class="badge"></div>`);
  div.dataset.persona = p.id; div.style.setProperty("--c", p.color);
  const out = div.querySelector(".txt");
  let dec = p.id === "guardian" ? { cerebro: "gem", motivo: "datos de la compu" } : elegirCerebro(texto, { pcEnLinea: pc === "on", modo: "auto" });
  let cual = dec.cerebro, extra = cual === "gem" && dec.motivo ? " · " + dec.motivo : "", t0 = performance.now(), txt = "";
  try {
    txt = cual === "pc" ? await pcResponder(p, texto, out) : await gemResponder(p, texto, out);
    if (cual === "pc" && (respuestaDelicada(txt) || /consultarlo con gemini/i.test(txt))) { cual = "gem"; extra = " · revisado: tema delicado"; out.textContent = ""; txt = await gemResponder(p, texto, out); }
    if (cual === "pc") { txt = ustedear(txt, texto); out.textContent = txt; }
  } catch (err) {
    if (cual === "pc") { cual = "gem"; extra = " · la PC no respondió"; try { txt = await gemResponder(p, texto, out); } catch (e2) { out.textContent = "No pude responder: " + e2.message; } }
    else out.textContent = "No pude responder: " + err.message;
  }
  out.classList.remove("cursor"); $("#jefe").classList.remove("piensa");
  if (txt) {
    out.textContent = txt;
    div.querySelector(".badge").textContent = (cual === "pc" ? "🖥 PC" : "✦ Gemini") + " · " + ((performance.now() - t0) / 1000).toFixed(1).replace(".", ",") + " s" + extra;
    (historial[p.id] = historial[p.id] || []).push({ role: "user", content: texto }, { role: "assistant", content: txt });
    decir(p, txt);
  }
  $("#send").disabled = false;
}

// ---------- eventos ----------
$("#f").addEventListener("submit", enviar);
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) enviar(e); });
$("#tablero").addEventListener("click", (e) => { const b = e.target.closest(".hablar"); if (!b) return; modoFijo(b.dataset.id); pulso(b.dataset.id).then(() => $("#jefe").classList.remove("piensa")); $("#q").focus(); if (innerWidth < 900) $("#panel-chat").scrollIntoView({ behavior: "smooth" }); });
$("#jefe").addEventListener("click", () => { modoFijo(null); $("#q").focus(); });
$("#voz").setAttribute("aria-pressed", String(hablar));
$("#voz").addEventListener("click", () => { hablar = !hablar; localStorage.setItem("antares.intel.voz", hablar ? "1" : "0"); $("#voz").setAttribute("aria-pressed", String(hablar)); if (!hablar) try { speechSynthesis.cancel(); } catch { /* */ } });
// «Cerrar» SIEMPRE vuelve a la app (igual que Mi compu v1.25.4): llamada directa + mensaje; si sigue abierto, navega a la raíz.
const RAIZ = new URL("../", location.href).href;
function irALaApp() {
  let arriba = window;
  try { if (window.top !== window && window.top.location.origin === location.origin) arriba = window.top; } catch { arriba = window; }
  try { const r = document.referrer && new URL(document.referrer); if (arriba === window && history.length > 1 && r && r.origin === location.origin && !r.pathname.includes("/inteligencias/")) { history.back(); setTimeout(() => location.replace(RAIZ), 700); return; } } catch { /* */ }
  arriba.location.replace(RAIZ);
}
let cerrando = false;
function cerrar(e) {
  e && e.preventDefault(); if (cerrando) return; cerrando = true; setTimeout(() => { cerrando = false; }, 1200);
  try { speechSynthesis.cancel(); } catch { /* */ }
  if (window.parent !== window) {
    let directo = false;
    try { const f = window.parent.__antaresCerrarIntel; if (typeof f === "function") { f(); directo = true; } } catch { /* */ }
    try { window.parent.postMessage("intel:cerrar", location.origin); } catch { /* */ }
    setTimeout(() => { let visible = true; try { const fe = window.frameElement; visible = !!(fe && fe.isConnected && fe.getClientRects().length); } catch { visible = !directo; } if (visible) irALaApp(); }, 450);
  } else irALaApp();
}
$("#volver").addEventListener("click", cerrar);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(e); });
$("#gk-guardar").addEventListener("click", () => { const v = $("#gk").value.trim(); if (!v) return; const l = leer(K); l.gk = v; localStorage.setItem(K, JSON.stringify(l)); $("#gk").value = ""; $("#conf").open = false; pintarEstados(); });
$("#gk-nota").textContent = APP ? "Antares no tiene key de Gemini (o está bloqueado). Desbloquee Antares o póngala en Ajustes." : "No encontré la key de Gemini en este dispositivo. Péguela una vez:";
if (APP) { $("#gk-fila").hidden = true; }
modoFijo(null); pintarEstados(); requestAnimationFrame(lineas); revisarPC(); setInterval(revisarPC, 60000);
$("#conf").hidden = !!keyGemini(); if (!keyGemini()) $("#conf").open = true;
