// Antares v1.25 · Mi compu › BUSCADOR y NOTICIAS (de muestra-buscador): /noticias, /responder (busca + qwen2.5:3b con citas).
import { RIESGO, norm } from "../js/ruteo.mjs";
import { GeminiClient } from "../js/gemini.js";
import { $, base, cab, esc, hora, abrirConf, keyGemini } from "./comun.js";
const estado = () => {}; // el encabezado lo pinta SALUD
const seg = (ms) => (ms / 1000).toFixed(1).replace(".", ",") + " s";
async function revisar() {
  try {
    const r = await fetch(base() + "/buscador/estado", { headers: cab(), signal: AbortSignal.timeout(9000) });
    if (r.status === 401) { estado("tok", "CLAVE INCORRECTA"); abrirConf(); return false; }
    if (!r.ok) throw Error(r.status);
    const j = await r.json(); estado("on", `COMPU EN LÍNEA · ${j.total} NOTICIAS`); return true;
  } catch { estado("off", "COMPU APAGADA"); return false; }
}

let todas = [];
async function cargarNoticias() {
  const q = $("#filtro").value.trim();
  try {
    const r = await fetch(`${base()}/noticias?horas=${q ? 168 : 30}&n=40&q=${encodeURIComponent(q)}`, { headers: cab() });
    if (!r.ok) throw Error(r.status);
    const j = await r.json(); todas = j.noticias || [];
    $("#nmeta").textContent = `${todas.length} ${q ? "coincidencias (7 días)" : "más recientes"} · recolectadas ${j.actualizado ? hora(j.actualizado) : "—"} · se actualizan cada 30 min en la compu`;
    $("#nts").innerHTML = todas.map((n) => `<li><span class="fu">${esc(n.fuente).toUpperCase()}</span><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.titulo)}</a><span class="meta">${hora(n.fecha)}</span></li>`).join("") || `<li class="vacio">Sin noticias${q ? " con ese filtro" : ""}.</li>`;
  } catch (e) { $("#nmeta").textContent = "No pude traer las noticias de la compu (" + e.message + ")."; }
}

function pintarFuentes(fs) {
  $("#fts").innerHTML = fs.map((f) => `<li id="f${f.n}"><a href="${esc(f.link)}" target="_blank" rel="noopener">${esc(f.titulo)}</a><span class="meta">${esc(f.fuente)}${f.fecha ? " · " + esc(f.fecha) : ""}</span></li>`).join("") || `<li class="vacio" style="list-style:none;margin-left:-22px">No encontré fuentes.</li>`;
}
function pintarTexto(t, fs) {
  const links = Object.fromEntries(fs.map((f) => [f.n, f.link]));
  $("#resp").innerHTML = esc(t).replace(/\[(\d{1,2})\]/g, (m, n) => (links[n] ? `<a class="cita" href="${esc(links[n])}" target="_blank" rel="noopener" title="Fuente ${n}">[${n}]</a>` : ""));
}
function badge(txt, cls = "pc") { $("#bdg").innerHTML = `<span class="badge ${cls}">${txt}</span>`; }

async function preguntarGemini(q, fs) {
  const k = keyGemini(); if (!k) { $("#resp").insertAdjacentHTML("beforeend", "<p class='nota'>Este dispositivo no tiene key de Gemini.</p>"); return; }
  const t0 = performance.now(); $("#resp").className = "cursor"; $("#resp").textContent = "";
  try {
    const g = new GeminiClient({ apiKey: k, userName: "don Freddy" });
    const r = await g.ask(q, [], [], { search: false, onChunk: (t) => { $("#resp").textContent = t; } });
    $("#resp").textContent = r.text; badge(`✦ GEMINI <i>${seg(performance.now() - t0)} · tema delicado</i>`, "gem");
  } catch (e) { $("#resp").textContent = "Gemini no respondió: " + e.message; }
  $("#resp").className = ""; void fs;
}

let ocupado = false;
async function buscar(q) {
  q = q.trim(); if (!q || ocupado) return; ocupado = true; $("#ir").disabled = true;
  $("#resp").className = "cursor"; $("#resp").textContent = ""; $("#bdg").innerHTML = ""; $("#fts").innerHTML = "<li class='vacio'>Buscando…</li>";
  const t0 = performance.now(); let fs = [], out = "", tf = 0, tp = 0;
  const delicado = RIESGO.test(norm(q));
  try {
    const r = await fetch(`${base()}/responder?q=${encodeURIComponent(q)}`, { headers: cab() });
    if (r.status === 401) throw Error("clave incorrecta");
    if (!r.ok) throw Error("HTTP " + r.status);
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue;
        const j = JSON.parse(l);
        if (j.tipo === "fuentes") { fs = j.fuentes || []; tf = performance.now() - t0; pintarFuentes(fs); }
        else if (j.tipo === "texto") { if (!tp) tp = performance.now() - t0; out += j.t; pintarTexto(out, fs); }
        else if (j.tipo === "error") throw Error(j.error);
        else if (j.tipo === "fin" && (j.sinResumen || delicado)) {
          $("#resp").className = "";
          if (!fs.length) { $("#resp").textContent = "No encontré fuentes para esa pregunta."; }
          else {
            $("#resp").innerHTML = `<div class="aviso">Es un tema de manejo, seguridad o salud: el cerebro de la PC no lo resume. Revise las fuentes de abajo${keyGemini() ? " o pregúntele a Gemini" : ""}.</div>` +
              (keyGemini() ? `<p><button class="btn" id="gem" type="button">✦ Preguntar a Gemini</button></p>` : "");
            $("#gem")?.addEventListener("click", () => preguntarGemini(q, fs));
          }
          badge(`🔎 SOLO FUENTES <i>${seg(performance.now() - t0)}</i>`);
        }
      }
    }
    if (out && !delicado) badge(`🖥 BUSCADOR + CEREBRO PC · QWEN 2.5 3B <i>fuentes ${seg(tf)} · 1.ª palabra ${seg(tp)} · total ${seg(performance.now() - t0)}</i>`);
  } catch (e) { $("#resp").textContent = "No pude buscar: " + e.message + ". ¿Está encendida la compu?"; revisar(); }
  $("#resp").classList.remove("cursor"); ocupado = false; $("#ir").disabled = false;
}

$("#f").addEventListener("submit", (e) => { e.preventDefault(); buscar($("#q").value); });
$("#ej").addEventListener("click", (e) => { if (e.target.matches(".chip")) { $("#q").value = e.target.textContent; buscar(e.target.textContent); } });
let tf; $("#filtro").addEventListener("input", () => { clearTimeout(tf); tf = setTimeout(cargarNoticias, 350); });
$("#recargar").addEventListener("click", cargarNoticias);
export function iniciarBuscador() { cargarNoticias(); setInterval(() => { if (!document.hidden) cargarNoticias(); }, 10 * 60 * 1000); }
export const recargarNoticias = () => cargarNoticias();
export const buscarAhora = (q) => { $("#q").value = q; buscar(q); };
