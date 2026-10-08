// Paneles: Personal (Recordatorios, Compras, Noticias), Trabajo (Rutas, Cúbica, Correo, Bitácora) y Ocio (Damas chinas, Trivia, Robótica).
import * as R from "./reminders.js";
import * as S from "./shopping.js";
import * as D from "./digest.js";
import * as Notify from "./notify.js";
import * as W from "./workpanels.js";
import * as O from "./ocio.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let root, onChange = () => {}, tab = "recordatorios";
let digest = null, digestBusy = false, digestError = "";
let editingId = null;
const pad = (n) => String(n).padStart(2, "0");
const dateVal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeVal = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const GROUPS = {
  personal: [["recordatorios", "Recordatorios"], ["compras", "Compras"], ["noticias", "Noticias"]],
  trabajo: [["rutas", "Rutas"], ["cubica", "Cúbica"], ["correo", "Correo"], ["bitacora", "Bitácora"]],
  ocio: [["damas", "Damas chinas"], ["trivia", "Trivia"], ["robotica", "Robótica"]],
};
const GROUP_LABEL = { personal: "Personal", trabajo: "Trabajo", ocio: "Ocio" };
const ALL_TABS = Object.values(GROUPS).flat().map(([id]) => id);
const groupOf = (t) => Object.keys(GROUPS).find((g) => GROUPS[g].some(([id]) => id === t)) || "personal";
const lastInGroup = { personal: "recordatorios", trabajo: "rutas", ocio: "damas" };

export function initPanels(el, changeCb, workDeps = {}, ocioDeps = {}) {
  root = el; onChange = changeCb || (() => {});
  W.initWork({ ...workDeps, onChange: (w) => onChange(w) }, () => render());
  O.initOcio({ ...ocioDeps, onChange: (w) => onChange(w) }, () => { if (root && root.isConnected && root.dataset.tab && groupOf(root.dataset.tab) === "ocio" && root.childElementCount) render(); });
}
export function resetPanels() { W.resetWork(); O.resetOcio(); editingId = null; }

export function currentTab() { return tab; }

export function openPanel(name) {
  if (ALL_TABS.includes(name)) tab = name;
  editingId = null;
  W.clearStatus(); O.clearStatus();
  render();
}

export function render() {
  if (!root) return;
  const group = groupOf(tab);
  lastInGroup[group] = tab;
  // conservar la posición de desplazamiento al redibujar el mismo panel
  const scroller = root.closest(".settings-scroll") || root;
  const keep = root.dataset.tab === tab ? scroller.scrollTop : 0;
  const focusId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : "";
  root.innerHTML = `
    <div class="panel-groups" role="group" aria-label="Tipo de panel">
      ${Object.keys(GROUPS).map((g) => `<button type="button" class="seg${group === g ? " on" : ""}" data-group="${g}" aria-pressed="${group === g}">${GROUP_LABEL[g]}</button>`).join("")}
    </div>
    <div class="panel-tabs${group === "trabajo" ? " four" : ""}${group === "ocio" ? " ocio" : ""}" role="tablist" aria-label="Paneles">
      ${GROUPS[group].map(([id, label]) => tabBtn(id, label)).join("")}
    </div>
    <div class="panel-body" id="panel-body" role="tabpanel" aria-label="${(GROUPS[group].find(([id]) => id === tab) || [, ""])[1]}">${body()}</div>`;
  root.dataset.tab = tab;
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; editingId = null; W.clearStatus(); O.clearStatus(); render(); }));
  root.querySelectorAll("[data-group]").forEach((b) => b.addEventListener("click", () => { tab = lastInGroup[b.dataset.group]; editingId = null; W.clearStatus(); O.clearStatus(); render(); }));
  if (group === "trabajo") W.bind(tab, root.querySelector("#panel-body"));
  else if (group === "ocio") O.bind(tab, root.querySelector("#panel-body"));
  else bind();
  scroller.scrollTop = keep;
  if (focusId) { const el = document.getElementById(focusId); if (el && root.contains(el)) el.focus({ preventScroll: true }); }
}

function tabBtn(id, label) {
  return `<button type="button" class="panel-tab${tab === id ? " on" : ""}" role="tab" aria-selected="${tab === id}" data-tab="${id}">${label}</button>`;
}
function body() {
  if (groupOf(tab) === "trabajo") return W.html(tab);
  if (groupOf(tab) === "ocio") return O.html(tab);
  if (tab === "compras") return shoppingHtml();
  if (tab === "noticias") return newsHtml();
  return remindersHtml();
}

function remindersHtml() {
  const items = R.upcoming();
  const perm = Notify.permission();
  const permBox = perm === "granted" ? "" : `
    <div class="perm-box">
      <p>${perm === "denied"
        ? "Las notificaciones están bloqueadas en este navegador. Actívelas en los ajustes del sitio para que Antares le avise."
        : "Para avisarle aunque no esté mirando la pantalla, Antares necesita permiso para mostrar notificaciones."}</p>
      ${perm === "denied" ? "" : `<button type="button" class="btn primary" id="perm-btn">Permitir notificaciones</button>`}
    </div>`;
  const note = `<p class="hint panel-note">Las alarmas suenan cuando Antares está abierto o en segundo plano reciente. Si el teléfono suspende la app, el aviso aparece al abrirla.</p>`;
  const bday = R.hasBirthdayReminder() ? "" : `
    <div class="suggest-box">
      <p>¿Quiere que le recuerde el cumpleaños de Evangeline cada 10 de octubre?</p>
      <button type="button" class="btn primary" id="bday-add">Agregar cumpleaños</button>
    </div>`;
  const list = items.length ? items.map(rowReminder).join("") : `<p class="empty-note">No tiene recordatorios pendientes.</p>`;
  const ed = editingId ? R.loadReminders().find((x) => x.id === editingId) : null;
  if (!ed) editingId = null;
  const when = ed ? new Date(ed.at) : new Date(Date.now() + 60 * 60 * 1000);
  return `${permBox}${note}${bday}
    <form class="add-form${ed ? " editing" : ""}" id="rem-form" aria-label="${ed ? "Editar recordatorio" : "Nuevo recordatorio"}">
      <input class="field" id="rem-title" maxlength="140" placeholder="Recordatorio (ej. llamar al pediatra)" aria-label="Recordatorio" required value="${ed ? esc(ed.title) : ""}">
      <div class="form-row">
        <input class="field" id="rem-date" type="date" aria-label="Fecha" required value="${dateVal(when)}">
        <input class="field" id="rem-time" type="time" aria-label="Hora" required value="${ed ? timeVal(when) : pad(when.getHours()) + ":00"}">
      </div>
      ${ed ? `<div class="btn-row"><button class="btn" type="button" id="rem-cancel">Cancelar</button><button class="btn primary" type="submit">Guardar cambios</button></div>`
           : `<button class="btn primary" type="submit">Agregar recordatorio</button>`}
    </form>
    <ul class="item-list">${list}</ul>`;
}
function rowReminder(r) {
  return `<li class="item-row" data-id="${esc(r.id)}">
    <span class="item-main"><strong>${esc(r.title)}</strong><small>${esc(R.formatWhen(r.at))}${r.kind === "yearly" ? " · cada año" : ""}</small></span>
    <span class="item-actions">
      <button type="button" class="mini-btn" data-act="edit" aria-label="Editar ${esc(r.title)}">Editar</button>
      <button type="button" class="mini-btn" data-act="snooze" aria-label="Posponer 10 minutos ${esc(r.title)}">+10 min</button>
      <button type="button" class="mini-btn danger" data-act="del" aria-label="Eliminar ${esc(r.title)}">Borrar</button>
    </span>
  </li>`;
}

function shoppingHtml() {
  const g = S.grouped();
  const stores = S.STORES.map((st) => `<option value="${esc(st)}">${esc(st)}</option>`).join("");
  const groups = S.STORES.map((st) => {
    const items = g.byStore[st] || [];
    if (!items.length) return "";
    return `<h3 class="store-h">${esc(st)}</h3><ul class="item-list">${items.map(rowItem).join("")}</ul>`;
  }).join("");
  const bought = g.bought.length ? `
    <h3 class="store-h">Comprado</h3>
    <ul class="item-list bought-list">${g.bought.map(rowItem).join("")}</ul>
    <button type="button" class="btn" id="clear-bought">Quitar lo comprado</button>` : "";
  return `
    <form class="add-form" id="shop-form">
      <input class="field" id="shop-name" maxlength="120" placeholder="Producto (ej. pañales)" required>
      <div class="form-row">
        <input class="field" id="shop-qty" maxlength="20" placeholder="Cantidad (ej. 2)">
        <select class="field" id="shop-store">${stores}</select>
      </div>
      <button class="btn primary" type="submit">Agregar a la lista</button>
    </form>
    ${groups || `<p class="empty-note">La lista está vacía.</p>`}
    ${bought}`;
}
function rowItem(it) {
  return `<li class="item-row${it.bought ? " done" : ""}" data-id="${esc(it.id)}">
    <button type="button" class="check-btn" data-act="toggle" aria-pressed="${it.bought}" aria-label="${it.bought ? "Desmarcar" : "Marcar comprado"} ${esc(it.name)}"></button>
    <span class="item-main"><strong>${esc(it.name)}</strong>${it.qty ? `<small>Cantidad: ${esc(it.qty)}</small>` : ""}</span>
    <span class="item-actions">
      <button type="button" class="mini-btn" data-act="minus" aria-label="Menos cantidad">−</button>
      <button type="button" class="mini-btn" data-act="plus" aria-label="Más cantidad">+</button>
      <button type="button" class="mini-btn danger" data-act="del" aria-label="Eliminar ${esc(it.name)}">Eliminar</button>
    </span>
  </li>`;
}

function newsHtml() {
  if (!digest && !digestBusy) loadDigest(false);
  if (digestBusy && !digest) return `<p class="empty-note">Reuniendo el resumen del día…</p>`;
  if (digestError && !digest) return `<p class="empty-note">${esc(digestError)}</p><button type="button" class="btn" id="digest-refresh">Reintentar</button>`;
  if (!digest) return "";
  const w = digest.weather;
  const fx = digest.fx;
  const news = (digest.news || []).map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a><small>${esc(n.source)}</small></li>`).join("");
  return `
    <button type="button" class="btn" id="digest-refresh"${digestBusy ? " disabled" : ""}>Actualizar</button>
    <article class="digest-card">
      <h3>Clima</h3>
      <p>${w ? esc(D.weatherLine(w).replace(/^Clima en Alajuela: /, "Alajuela: ")) : "Sin datos de clima en este momento."}</p>
      <h3>Dólar</h3>
      <p>${fx ? `Compra ₡${fx.compra != null ? Number(fx.compra).toFixed(2) : "—"} · venta ₡${Number(fx.venta).toFixed(2)}${fx.fecha ? " (" + esc(fx.fecha) + ")" : ""}.` : "Sin datos del tipo de cambio."}</p>
      <p class="hint">${esc(fx?.source || "")}</p>
      <h3>Titulares</h3>
      ${news ? `<ul class="news-list">${news}</ul>` : `<p>No hay titulares en este momento.</p>`}
      <p class="hint">Titulares por rss2json desde La Nación, El Financiero y Delfino.</p>
    </article>`;
}

function bind() {
  const body = root.querySelector("#panel-body");
  if (!body) return;
  body.querySelector("#perm-btn")?.addEventListener("click", async () => {
    await Notify.requestPermission();
    onChange("notify");
    render();
  });
  body.querySelector("#rem-cancel")?.addEventListener("click", () => { editingId = null; render(); });
  body.querySelector("#bday-add")?.addEventListener("click", () => { R.offerEvangelineBirthday(); onChange("reminders"); render(); });
  body.querySelector("#rem-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = body.querySelector("#rem-title").value.trim();
    const date = body.querySelector("#rem-date").value;
    const time = body.querySelector("#rem-time").value || "09:00";
    if (!title || !date) return;
    const at = new Date(`${date}T${time}`).getTime();
    if (!Number.isFinite(at)) return;
    if (editingId) {
      const cur = R.loadReminders().find((x) => x.id === editingId);
      const d = new Date(at);
      const patch = { title, at, done: false, snoozedFrom: null };
      if (cur && cur.kind === "yearly") { patch.month = d.getMonth() + 1; patch.day = d.getDate(); }
      R.updateReminder(editingId, patch);
      editingId = null;
    } else R.addReminder({ title, at });
    onChange("reminders");
    render();
  });
  body.querySelectorAll("[data-id]").forEach((row) => {
    const id = row.dataset.id;
    row.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.act;
      if (tab === "recordatorios") {
        if (act === "edit") { editingId = id; render(); root.querySelector("#rem-title")?.focus(); return; }
        if (act === "del") { R.deleteReminder(id); if (editingId === id) editingId = null; }
        if (act === "snooze") R.snoozeReminder(id, 10);
        onChange("reminders");
      } else {
        const it = S.loadItems().find((x) => x.id === id);
        if (act === "del") S.deleteItem(id);
        if (act === "toggle") S.toggleBought(id);
        if ((act === "plus" || act === "minus") && it) {
          const n = Math.max(1, (parseInt(it.qty, 10) || 1) + (act === "plus" ? 1 : -1));
          S.updateItem(id, { qty: String(n) });
        }
        onChange("shopping");
      }
      render();
    }));
  });
  body.querySelector("#shop-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = body.querySelector("#shop-name").value.trim();
    if (!name) return;
    S.addItem({ name, qty: body.querySelector("#shop-qty").value.trim(), store: body.querySelector("#shop-store").value });
    onChange("shopping");
    render();
  });
  body.querySelector("#clear-bought")?.addEventListener("click", () => { S.clearBought(); onChange("shopping"); render(); });
  body.querySelector("#digest-refresh")?.addEventListener("click", () => loadDigest(true));
}

async function loadDigest(force) {
  digestBusy = true; digestError = "";
  if (root && tab === "noticias") render();
  try { digest = await D.getDigest({ force }); }
  catch (e) { digestError = "No pude reunir el resumen del día. Inténtelo de nuevo."; }
  digestBusy = false;
  if (root && tab === "noticias") render();
}
