// v1.23: diseño de computadora (>= 1024 px). Reversión: DESKTOP_ENABLED = false (el teléfono no cambia nunca).
export const DESKTOP_ENABLED = true;
const mq = window.matchMedia("(min-width: 1024px) and (pointer: fine), (min-width: 1200px)");
let on = false, deps = {}, added = [];
export const isDesk = () => on;
const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</g></svg>`;
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

function build() {
  const tabbar = document.getElementById("tabbar");
  const brand = document.createElement("div");
  brand.className = "desk-brand desk-only";
  brand.innerHTML = `<span class="logo-mark" aria-hidden="true"></span><div><b>ANTARES</b><small>Asistente personal</small></div>`;
  tabbar.prepend(brand);
  const kb = ["1", "2", "3", "4", "5"];
  tabbar.querySelectorAll(".tab").forEach((t, i) => { const k = document.createElement("kbd"); k.className = "desk-kbd desk-only"; k.textContent = "Alt " + kb[i]; t.appendChild(k); added.push(k); });
  const extra = document.createElement("div");
  extra.className = "desk-extra desk-only";
  extra.innerHTML = `<p class="desk-sec">VISTAS</p>
    ${deps.ojo ? `<button type="button" class="tab desk-tab" data-desk="ojo">${svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>')}<span>Ojo</span></button>` : ""}
    <button type="button" class="tab desk-tab" data-desk="vision">${svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')}<span>Visión</span></button>
    <div class="desk-foot"><button type="button" class="tab desk-tab" data-desk="ajustes">${svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>')}<span>Ajustes</span></button>
    <button type="button" class="desk-ver" data-desk="ver">v${esc(deps.version)} · buscar actualización</button></div>`;
  tabbar.appendChild(extra);
  extra.addEventListener("click", (ev) => { const b = ev.target.closest("[data-desk]"); if (!b) return; const k = b.dataset.desk;
    if (k === "ojo") deps.ojo && deps.ojo(); else if (k === "vision") deps.vision(); else if (k === "ajustes") deps.settings(); else if (k === "ver") deps.checkUpdate(); });
  // tarjetas de resumen con datos reales (debajo del micrófono)
  const cards = document.createElement("div");
  cards.className = "desk-cards desk-only"; cards.id = "desk-cards";
  cards.addEventListener("click", (ev) => { const b = ev.target.closest("[data-panel]"); if (b) deps.panel(b.dataset.panel); });
  document.querySelector("#chat-view .dock").appendChild(cards);
  const hint = document.createElement("p");
  hint.className = "desk-kbh desk-only"; hint.id = "desk-kbh";
  hint.innerHTML = `<kbd>Enter</kbd> envía · <kbd>Shift</kbd>+<kbd>Enter</kbd> nueva línea · <kbd>↑</kbd> edita el último · <kbd>Ctrl</kbd>+<kbd>K</kbd> escribir · <kbd>Esc</kbd> limpiar`;
  document.querySelector("#chat-view .dock").appendChild(hint);
  added.push(brand, extra, cards, hint);
  paintCards();
}
function teardown() { added.forEach((e) => e.remove()); added = []; }

export function paintCards() {
  const el = document.getElementById("desk-cards"); if (!el || !deps.summary) return;
  let s; try { s = deps.summary(); } catch { s = null; }
  if (!s) { el.innerHTML = `<div class="desk-card off"><span class="hud-l">DATOS</span><b>—</b><small>Desbloquee Antares para ver su resumen.</small></div>`; return; }
  el.innerHTML = s.map((c) => `<button type="button" class="desk-card" data-panel="${c.panel}"><span class="hud-l">${esc(c.label)}</span><b>${esc(c.n)}</b><small>${esc(c.sub)}</small></button>`).join("");
}

function apply() {
  const want = DESKTOP_ENABLED && mq.matches;
  if (want === on) return;
  on = want;
  document.body.classList.toggle("desk", on);
  if (on) build(); else teardown();
  deps.onChange && deps.onChange(on);
}

export function initDesktop(d) {
  deps = d;
  if (!DESKTOP_ENABLED) return;
  apply();
  mq.addEventListener ? mq.addEventListener("change", apply) : mq.addListener(apply);
  document.addEventListener("keydown", (ev) => {
    if (!on) return;
    // bloqueada, o con Ojo / Visión / un diálogo encima: los atajos no tocan la app de fondo
    if (document.body.classList.contains("locked") || document.querySelector(".ojo-view, .vis:not([hidden]), #modal:not([hidden])")) return;
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === "k") { ev.preventDefault(); deps.focusInput(); return; }
    if (ev.altKey && !ev.ctrlKey && /^[1-5]$/.test(ev.key)) { ev.preventDefault(); deps.tab(["inicio", "personal", "trabajo", "ocio", "herramientas"][+ev.key - 1]); }
  });
}
