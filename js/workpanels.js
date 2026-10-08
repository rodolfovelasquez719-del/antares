// Paneles de trabajo: Rutas, Cúbica, Correo y Bitácora.
import { memory } from "./memory.js";
import * as RT from "./routes.js";
import * as C from "./cubic.js";
import * as M from "./mail.js";
import * as L from "./logbook.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f = (n, d = 2) => Number(n).toLocaleString("es-CR", { maximumFractionDigits: d });

let deps = { ask: null, hasKey: () => false, download: () => {}, onChange: () => {} };
let rerender = () => {};
export function initWork(d, rerenderFn) { deps = { ...deps, ...d }; rerender = rerenderFn; }

// Estado en memoria (se borra al bloquear)
let rt = { busy: false, ctrl: null, progress: "", error: "" };
let ml = { busy: false, ctrl: null, text: "", tpl: "cambio", draft: null, partial: "", error: "" };
let lgEdit = null, status = "";
export function resetWork() {
  if (rt.ctrl) rt.ctrl.abort();
  if (ml.ctrl) ml.ctrl.abort();
  rt = { busy: false, ctrl: null, progress: "", error: "" };
  ml = { busy: false, ctrl: null, text: "", tpl: "cambio", draft: null, partial: "", error: "" };
  lgEdit = null; status = "";
}
const say = (t) => { status = t; };

function routeDraft() {
  const d = memory.getData(RT.K_ROUTE_DRAFT) || {};
  return { text: d.text || "", roundTrip: d.roundTrip !== false, optimize: d.optimize !== false, serviceMin: Number(d.serviceMin) || 0, result: d.result || null };
}
const saveRouteDraft = (patch) => memory.saveData(RT.K_ROUTE_DRAFT, { ...routeDraft(), ...patch });

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch { /* */ }
    ta.remove(); return ok;
  }
}

export function html(tab) {
  const st = status ? `<p class="wp-status" role="status">${esc(status)}</p>` : `<p class="wp-status" role="status"></p>`;
  if (tab === "rutas") return routesHtml() + st;
  if (tab === "cubica") return cubicHtml() + st;
  if (tab === "correo") return mailHtml() + st;
  if (tab === "bitacora") return logHtml() + st;
  return "";
}

// ---------- Rutas ----------
function routesHtml() {
  const d = routeDraft();
  const r = d.result;
  let res = "";
  if (rt.busy) res = `<p class="empty-note">${esc(rt.progress || "Calculando…")}</p>`;
  else if (rt.error) res = `<div class="perm-box warn-box"><p>${esc(rt.error)}</p></div>`;
  else if (r && r.ok) {
    const items = r.stops.map((s, i) => `<li><strong>${i === 0 ? "Inicio · " : ""}${esc(s.query)}</strong>${s.name && s.name.toLowerCase() !== s.query.toLowerCase() ? `<small>${esc(s.name)}</small>` : ""}</li>`).join("") +
      (r.roundTrip ? `<li><strong>Regreso · ${esc(r.stops[0].query)}</strong></li>` : "");
    const legs = r.legs.map((l) => `<li>${esc(l.from)} → ${esc(l.to)}: ${esc(RT.fmtKm(l.km))}, ${esc(RT.fmtMin(l.min))}</li>`).join("");
    res = `<article class="digest-card route-card">
      <div class="kpis">
        <div><span class="hud-label">DISTANCIA</span><b id="rt-km">${esc(RT.fmtKm(r.totalKm))}</b></div>
        <div><span class="hud-label">MANEJO</span><b id="rt-min">${esc(RT.fmtMin(r.totalMin))}</b></div>
        ${r.serviceMin ? `<div><span class="hud-label">JORNADA</span><b>${esc(RT.fmtMin(r.shiftMin))}</b></div>` : ""}
      </div>
      <h3>${r.optimized ? "ORDEN SUGERIDO" : "ORDEN INDICADO"}</h3>
      <ol class="route-list" id="rt-list">${items}</ol>
      <details><summary>Ver tramos</summary><ul class="legs">${legs}</ul></details>
      <p class="hint">Distancias por carretera de ${esc(r.source)}. El tiempo es de auto; un camión cargado suele tardar más.</p>
      <div class="btn-row wrap">
        <button type="button" class="btn" id="rt-copy">Copiar lista</button>
        <a class="btn" id="rt-maps" href="${esc(r.mapsUrl)}" target="_blank" rel="noopener">Abrir en Google Maps</a>
        <button type="button" class="btn" id="rt-log">Guardar en bitácora</button>
      </div>
    </article>`;
  }
  return `
    <form class="add-form" id="rt-form">
      <label class="field-label" for="rt-stops">Lugares, uno por línea. El primero es el punto de partida (por ejemplo, el CEDI).</label>
      <textarea class="field" id="rt-stops" rows="6" placeholder="CEDI Sysco, El Coyol, Alajuela&#10;KFC Escazú&#10;Subway Lindora&#10;Taco Bell Heredia">${esc(d.text)}</textarea>
      <label class="switch-row"><span class="txt">Regresar al punto de partida</span><input type="checkbox" class="switch" id="rt-round"${d.roundTrip ? " checked" : ""}></label>
      <label class="switch-row"><span class="txt">Ordenar para recorrer menos<small>Si lo apaga, respeta el orden escrito</small></span><input type="checkbox" class="switch" id="rt-opt"${d.optimize ? " checked" : ""}></label>
      <label class="field-label" for="rt-service">Minutos de descarga por entrega (opcional)</label>
      <input class="field" id="rt-service" type="number" inputmode="numeric" min="0" max="240" step="5" value="${d.serviceMin || ""}" placeholder="0">
      ${rt.busy ? `<button class="btn danger" type="button" id="rt-stop">Detener</button>` : `<button class="btn primary" type="submit">Calcular ruta</button>`}
    </form>
    ${res}
    <p class="hint">Ubicación: Open-Meteo y OpenStreetMap (Nominatim). Rutas: servidor público OSRM. Son servicios gratuitos con límite de uso: máximo 25 lugares por cálculo.</p>`;
}

async function runRoute() {
  const d = routeDraft();
  const stops = d.text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  rt.busy = true; rt.error = ""; rt.progress = "Buscando los lugares…"; rt.ctrl = new AbortController();
  saveRouteDraft({ result: null });
  rerender();
  try {
    const r = await RT.calcRoute(stops, { roundTrip: d.roundTrip, optimize: d.optimize, serviceMin: d.serviceMin, signal: rt.ctrl.signal, onProgress: (p) => { rt.progress = p; rerender(); } });
    if (r.ok) saveRouteDraft({ result: r }); else rt.error = r.error;
  } catch (e) {
    rt.error = e.name === "AbortError" ? "Cálculo detenido." : "No pude calcular la ruta. Intente de nuevo.";
  }
  rt.busy = false; rt.ctrl = null;
  rerender();
}

// ---------- Cúbica ----------
function cubicHtml() {
  const trucks = C.loadTrucks();
  const load = C.loadLoad();
  const truck = trucks.find((t) => t.id === load.truckId) || trucks[0] || null;
  const truckSel = trucks.length ? `
    <label class="field-label" for="cb-truck">Camión</label>
    <div class="form-row">
      <select class="field" id="cb-truck">${trucks.map((t) => `<option value="${esc(t.id)}"${truck && t.id === truck.id ? " selected" : ""}>${esc(t.name)} · ${f(t.m3)} m³${t.kg ? ` · ${f(t.kg, 0)} kg` : ""}</option>`).join("")}</select>
      <button type="button" class="mini-btn danger" id="cb-truck-del" aria-label="Eliminar este camión">Borrar</button>
    </div>` : `<p class="empty-note">Primero agregue un camión con su capacidad.</p>`;
  const truckForm = `
    <details class="sub-form"${trucks.length ? "" : " open"}><summary>Agregar camión</summary>
      <form class="add-form" id="cb-truck-form">
        <input class="field" id="cb-tname" maxlength="40" placeholder="Nombre (ej. Isuzu 12 m³)" aria-label="Nombre del camión">
        <div class="form-row">
          <input class="field" id="cb-tm3" inputmode="decimal" placeholder="Capacidad m³" aria-label="Capacidad en metros cúbicos" required>
          <input class="field" id="cb-tkg" inputmode="decimal" placeholder="Carga máx. kg" aria-label="Carga máxima en kilos">
        </div>
        <button class="btn" type="submit">Guardar camión</button>
      </form>
    </details>`;
  let result = "";
  if (truck && load.items.length) {
    const res = C.computeFit(load.items, truck);
    const bar = (pct, label, id) => `<div class="meter"><div class="row"><span>${label}</span><b id="${id}">${f(pct, 1)} %</b></div><div class="bar"><i style="width:${Math.min(100, pct)}%"${pct > 100 ? ' class="over"' : ""}></i></div></div>`;
    result = `<article class="digest-card">
      <h3>${res.allFit ? "TODO CABE" : "NO CABE TODO"}</h3>
      ${bar(res.fillM3, `Volumen: ${f(res.usedM3)} de ${f(res.capM3)} m³`, "cb-fill-m3")}
      ${res.fillKg != null ? bar(res.fillKg, `Peso: ${f(res.usedKg, 0)} de ${f(res.capKg, 0)} kg`, "cb-fill-kg") : ""}
      <p class="hint">${res.allFit ? `Queda libre ${f(res.freeM3)} m³${res.freeKg != null ? ` y ${f(res.freeKg, 0)} kg` : ""}.` : `Falta espacio para ${[res.overM3 > 0 ? f(res.overM3) + " m³" : "", res.overKg > 0 ? f(res.overKg, 0) + " kg" : ""].filter(Boolean).join(" y ")}. Se carga en el orden de la lista.`}</p>
      <ul class="item-list">${res.rows.map((r) => `<li class="item-row cb-${r.status}" data-id="${esc(r.id)}">
        <span class="chip ${r.status}">${r.status === "cabe" ? "Cabe" : r.status === "parcial" ? `${r.fit}/${r.qty}` : "No cabe"}</span>
        <span class="item-main"><strong>${esc(r.name)}</strong><small>${r.qty} × ${f(r.m3, 3)} m³${r.kg ? ` · ${f(r.kg)} kg` : ""} = ${f(r.totM3)} m³${r.kg ? ` · ${f(r.totKg, 0)} kg` : ""}</small></span>
        <button type="button" class="mini-btn danger" data-act="cb-del" aria-label="Quitar ${esc(r.name)}">Quitar</button>
      </li>`).join("")}</ul>
      <div class="btn-row wrap"><button type="button" class="btn" id="cb-copy">Copiar resultado</button><button type="button" class="btn danger" id="cb-clear">Vaciar carga</button></div>
    </article>`;
  }
  return `${truckSel}${truckForm}
    <form class="add-form" id="cb-item-form">
      <label class="field-label" for="cb-iname">Producto o pedido</label>
      <input class="field" id="cb-iname" maxlength="60" placeholder="Ej. pollo congelado KFC" required>
      <div class="form-row three">
        <input class="field" id="cb-iqty" inputmode="numeric" placeholder="Cajas" aria-label="Cantidad de cajas" value="1">
        <input class="field" id="cb-im3" inputmode="decimal" placeholder="m³ c/u" aria-label="Metros cúbicos por caja" required>
        <input class="field" id="cb-ikg" inputmode="decimal" placeholder="kg c/u" aria-label="Kilos por caja (opcional)">
      </div>
      <button class="btn primary" type="submit"${truck ? "" : " disabled"}>Agregar a la carga</button>
    </form>
    ${result || (truck ? `<p class="empty-note">Agregue productos para ver qué cabe.</p>` : "")}
    <p class="hint">Cálculo por volumen y peso; no considera la forma de las cajas ni el acomodo. Por chat: «¿Caben 300 cajas de 0,03 m³ en el camión de 12 m³?»</p>`;
}

// ---------- Correo ----------
function mailHtml() {
  const opts = Object.values(M.TEMPLATES).map((t) => `<option value="${t.id}"${ml.tpl === t.id ? " selected" : ""}>${esc(t.label)}</option>`).join("");
  const ph = {
    cambio: "Ej.: Al vendedor Carlos, del Subway de Lindora: la entrega del martes 13 pasa al miércoles 14 por ajuste de rutas.",
    atraso: "Ej.: Al gerente del KFC Escazú: el camión de hoy llega con 45 minutos de atraso por un cierre en la ruta 27.",
    horario: "Ej.: Confirmar a Taco Bell Heredia que la entrega del jueves es entre 6:00 y 8:00 a. m.",
  }[ml.tpl];
  let out = "";
  if (ml.busy) out = `<article class="digest-card"><h3>REDACTANDO…</h3><p class="mail-partial">${esc(ml.partial || "…")}</p></article>`;
  else if (ml.error) out = `<div class="perm-box warn-box"><p>${esc(ml.error)}</p></div>`;
  else if (ml.draft) out = `<article class="digest-card">
      <label class="field-label" for="ml-subject">Asunto</label>
      <input class="field" id="ml-subject" value="${esc(ml.draft.subject)}">
      <label class="field-label" for="ml-body">Cuerpo</label>
      <textarea class="field" id="ml-body" rows="12">${esc(ml.draft.body)}</textarea>
      <div class="btn-row wrap">
        <button type="button" class="btn" id="ml-copy-subject">Copiar asunto</button>
        <button type="button" class="btn" id="ml-copy-body">Copiar cuerpo</button>
        <button type="button" class="btn primary" id="ml-copy-all">Copiar todo</button>
      </div>
      <p class="hint">Revise los datos entre corchetes. Antares no envía correos: péguelo en su correo.</p>
    </article>`;
  return `
    <form class="add-form" id="ml-form">
      <label class="field-label" for="ml-tpl">Tipo de correo</label>
      <select class="field" id="ml-tpl">${opts}</select>
      <label class="field-label" for="ml-text">Detalles (destinatario, cliente, fechas, horas, motivo)</label>
      <textarea class="field" id="ml-text" rows="4" placeholder="${esc(ph)}">${esc(ml.text)}</textarea>
      ${ml.busy ? `<button class="btn danger" type="button" id="ml-stop">Detener</button>`
        : `<button class="btn primary" type="submit"${deps.hasKey() ? "" : " disabled"}>Redactar correo</button>`}
      ${deps.hasKey() ? "" : `<p class="hint">Para redactar necesita su API key de Gemini (Configuración).</p>`}
    </form>${out}`;
}

async function runMail() {
  const text = ml.text.trim();
  if (!text || !deps.ask) return;
  ml.busy = true; ml.error = ""; ml.draft = null; ml.partial = ""; ml.ctrl = new AbortController();
  rerender();
  try {
    const r = await deps.ask(M.mailPrompt(text, ml.tpl), { signal: ml.ctrl.signal, onChunk: (p) => { ml.partial = p; const el = document.querySelector(".mail-partial"); if (el) el.textContent = p; } });
    if (r && r.ok) ml.draft = M.parseDraft(r.text);
    else if (r && r.stopped) ml.error = "Redacción detenida.";
    else ml.error = (r && (r.text || r.title)) || "No pude redactar el correo. Intente de nuevo.";
  } catch (e) { ml.error = e.name === "AbortError" ? "Redacción detenida." : "No pude redactar el correo. Intente de nuevo."; }
  ml.busy = false; ml.ctrl = null;
  rerender();
}

// ---------- Bitácora ----------
function logHtml() {
  const list = L.loadLog();
  const ed = lgEdit ? list.find((e) => e.id === lgEdit) : null;
  if (!ed) lgEdit = null;
  const statusOpts = (cur) => L.STATUSES.map((s) => `<option value="${s}"${s === cur ? " selected" : ""}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join("");
  const rows = list.length ? list.map((e) => `<li class="item-row log-row" data-id="${esc(e.id)}">
      <span class="item-main"><strong>${esc(e.name)}</strong><small>${esc(e.date)}${e.stops.length ? ` · ${e.stops.length} paradas` : ""}${e.km != null ? ` · ${f(e.km, 1)} km` : ""}${e.notes ? ` · ${esc(e.notes.slice(0, 60))}` : ""}</small></span>
      <span class="item-actions">
        <button type="button" class="mini-btn status-${e.status.replace(" ", "-")}" data-act="lg-status" aria-label="Estado ${esc(e.status)}; tocar para cambiar">${esc(e.status)}</button>
        <button type="button" class="mini-btn" data-act="lg-edit" aria-label="Editar ${esc(e.name)}">Editar</button>
        <button type="button" class="mini-btn danger" data-act="lg-del" aria-label="Borrar ${esc(e.name)}">Borrar</button>
      </span></li>`).join("") : `<p class="empty-note">Aún no hay rutas anotadas.</p>`;
  return `
    <form class="add-form${ed ? " editing" : ""}" id="lg-form" aria-label="${ed ? "Editar ruta" : "Nueva ruta"}">
      <div class="form-row">
        <input class="field" id="lg-date" type="date" aria-label="Fecha" required value="${esc(ed ? ed.date : L.todayISO())}">
        <select class="field" id="lg-status" aria-label="Estado">${statusOpts(ed ? ed.status : "planificada")}</select>
      </div>
      <input class="field" id="lg-name" maxlength="80" placeholder="Nombre de la ruta (ej. Ruta 3 Escazú)" aria-label="Nombre de la ruta" required value="${esc(ed ? ed.name : "")}">
      <textarea class="field" id="lg-stops" rows="3" placeholder="Paradas, una por línea" aria-label="Paradas">${esc(ed ? ed.stops.join("\n") : "")}</textarea>
      <input class="field" id="lg-notes" maxlength="300" placeholder="Notas (opcional)" aria-label="Notas" value="${esc(ed ? ed.notes : "")}">
      ${ed ? `<div class="btn-row"><button class="btn" type="button" id="lg-cancel">Cancelar</button><button class="btn primary" type="submit">Guardar cambios</button></div>`
           : `<button class="btn primary" type="submit">Anotar ruta</button>`}
    </form>
    <ul class="item-list">${rows}</ul>
    <div class="btn-row wrap">
      <button type="button" class="btn" id="lg-csv"${list.length ? "" : " disabled"}>Exportar CSV (Excel)</button>
      <button type="button" class="btn" id="lg-txt"${list.length ? "" : " disabled"}>Exportar TXT</button>
    </div>
    <p class="hint">El CSV usa punto y coma y UTF-8 para que Excel en español lo abra en columnas con tildes.</p>`;
}

// ---------- Eventos ----------
export function bind(tab, body) {
  const $ = (s) => body.querySelector(s);
  const val = (s) => ($(s) ? $(s).value : "");
  if (tab === "rutas") {
    $("#rt-stops")?.addEventListener("input", () => saveRouteDraft({ text: val("#rt-stops") }));
    $("#rt-round")?.addEventListener("change", () => saveRouteDraft({ roundTrip: $("#rt-round").checked }));
    $("#rt-opt")?.addEventListener("change", () => saveRouteDraft({ optimize: $("#rt-opt").checked }));
    $("#rt-service")?.addEventListener("input", () => saveRouteDraft({ serviceMin: Math.max(0, Math.min(240, Number(val("#rt-service")) || 0)) }));
    $("#rt-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      saveRouteDraft({ text: val("#rt-stops"), roundTrip: $("#rt-round").checked, optimize: $("#rt-opt").checked, serviceMin: Math.max(0, Number(val("#rt-service")) || 0) });
      if (!rt.busy) runRoute();
    });
    $("#rt-stop")?.addEventListener("click", () => rt.ctrl && rt.ctrl.abort());
    $("#rt-copy")?.addEventListener("click", async () => { const r = routeDraft().result; if (r) { say(await copy(RT.routeText(r)) ? "Lista copiada." : "No pude copiar; mantenga presionado el texto para copiarlo."); rerender(); } });
    $("#rt-log")?.addEventListener("click", () => {
      const r = routeDraft().result; if (!r) return;
      const stops = r.stops.map((s) => s.query);
      L.addEntry({ name: `Ruta ${stops[0]} (${stops.length - 1} paradas)`, stops, km: Math.round(r.totalKm * 10) / 10, notes: `Manejo estimado ${RT.fmtMin(r.totalMin)}${r.roundTrip ? ", con regreso" : ""}` });
      say("Ruta guardada en la bitácora de hoy."); deps.onChange("log"); rerender();
    });
  }
  if (tab === "cubica") {
    $("#cb-truck")?.addEventListener("change", () => { C.setTruck(val("#cb-truck")); rerender(); });
    $("#cb-truck-del")?.addEventListener("click", () => {
      const id = val("#cb-truck"); const t = C.loadTrucks().find((x) => x.id === id);
      if (t && confirm(`¿Eliminar el camión «${t.name}»?`)) { C.deleteTruck(id); say("Camión eliminado."); rerender(); }
    });
    $("#cb-truck-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const r = C.addTruck({ name: val("#cb-tname"), m3: val("#cb-tm3"), kg: val("#cb-tkg") });
      if (!r.ok) { say(r.error || "No pude guardar el camión."); rerender(); return; }
      C.setTruck(r.truck.id); say(`Camión «${r.truck.name}» guardado.`); rerender();
    });
    $("#cb-item-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const m3 = C.parseNum(val("#cb-im3"));
      if (!(m3 > 0)) { say("Indique los m³ de cada caja (por ejemplo 0,05)."); rerender(); return; }
      const load = C.loadLoad();
      if (!load.truckId && C.loadTrucks()[0]) C.setTruck(C.loadTrucks()[0].id);
      C.addItem({ name: val("#cb-iname"), qty: val("#cb-iqty") || 1, m3, kg: val("#cb-ikg") });
      say(""); rerender();
    });
    body.querySelectorAll("[data-act=cb-del]").forEach((b) => b.addEventListener("click", () => { C.deleteItem(b.closest("[data-id]").dataset.id); rerender(); }));
    $("#cb-clear")?.addEventListener("click", () => { C.clearItems(); say("Carga vaciada."); rerender(); });
    $("#cb-copy")?.addEventListener("click", async () => {
      const load = C.loadLoad(); const t = C.loadTrucks().find((x) => x.id === load.truckId) || C.loadTrucks()[0];
      if (t) { say(await copy(C.fitText(C.computeFit(load.items, t), t.name)) ? "Resultado copiado." : "No pude copiar."); rerender(); }
    });
  }
  if (tab === "correo") {
    $("#ml-tpl")?.addEventListener("change", () => { ml.tpl = val("#ml-tpl"); rerender(); });
    $("#ml-text")?.addEventListener("input", () => { ml.text = val("#ml-text"); });
    $("#ml-form")?.addEventListener("submit", (e) => { e.preventDefault(); ml.text = val("#ml-text"); if (!ml.busy && ml.text.trim()) runMail(); });
    $("#ml-stop")?.addEventListener("click", () => ml.ctrl && ml.ctrl.abort());
    const cur = () => ({ subject: val("#ml-subject"), body: val("#ml-body") });
    $("#ml-subject")?.addEventListener("input", () => { if (ml.draft) ml.draft.subject = val("#ml-subject"); });
    $("#ml-body")?.addEventListener("input", () => { if (ml.draft) ml.draft.body = val("#ml-body"); });
    const done = (ok) => { const el = body.querySelector(".wp-status"); if (el) el.textContent = ok ? "Copiado." : "No pude copiar; mantenga presionado el texto."; };
    $("#ml-copy-subject")?.addEventListener("click", async () => done(await copy(cur().subject)));
    $("#ml-copy-body")?.addEventListener("click", async () => done(await copy(cur().body)));
    $("#ml-copy-all")?.addEventListener("click", async () => { const c = cur(); done(await copy(`Asunto: ${c.subject}\n\n${c.body}`)); });
  }
  if (tab === "bitacora") {
    $("#lg-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = { date: val("#lg-date"), name: val("#lg-name"), status: val("#lg-status"), notes: val("#lg-notes"), stops: val("#lg-stops").split(/\n+/).map((s) => s.trim()).filter(Boolean) };
      if (lgEdit) { L.updateEntry(lgEdit, data); lgEdit = null; say("Cambios guardados."); }
      else { L.addEntry(data); say("Ruta anotada."); }
      deps.onChange("log"); rerender();
    });
    $("#lg-cancel")?.addEventListener("click", () => { lgEdit = null; rerender(); });
    body.querySelectorAll(".log-row [data-act]").forEach((b) => b.addEventListener("click", () => {
      const id = b.closest("[data-id]").dataset.id;
      const e = L.loadLog().find((x) => x.id === id); if (!e) return;
      if (b.dataset.act === "lg-edit") { lgEdit = id; rerender(); body.ownerDocument.getElementById("lg-name")?.focus(); return; }
      if (b.dataset.act === "lg-del") { if (!confirm(`¿Borrar la ruta «${e.name}» del ${e.date}?`)) return; L.deleteEntry(id); if (lgEdit === id) lgEdit = null; say("Ruta borrada."); }
      if (b.dataset.act === "lg-status") { const next = L.STATUSES[(L.STATUSES.indexOf(e.status) + 1) % L.STATUSES.length]; L.updateEntry(id, { status: next }); say(`Estado: ${next}.`); }
      deps.onChange("log"); rerender();
    }));
    $("#lg-csv")?.addEventListener("click", () => { deps.download(`bitacora-rutas-${L.todayISO()}.csv`, L.toCSV(), "text/csv;charset=utf-8"); say("CSV exportado."); rerender(); });
    $("#lg-txt")?.addEventListener("click", () => { deps.download(`bitacora-rutas-${L.todayISO()}.txt`, L.toTXT(), "text/plain;charset=utf-8"); say("TXT exportado."); rerender(); });
  }
}
export function clearStatus() { status = ""; }
