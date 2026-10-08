// Antares Web - Recordatorios y alarmas (cifrados con el resto de los datos).
import { memory } from "./memory.js";

export const K_REMINDERS = "antares.reminders.v1";
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function loadReminders() {
  return (memory.getData(K_REMINDERS) || []).map(normalize);
}
function normalize(r) {
  return {
    id: r.id || newId(),
    title: String(r.title || "").trim(),
    at: Number(r.at) || 0,           // epoch ms
    done: !!r.done,
    snoozedFrom: r.snoozedFrom || null,
    created: r.created || Date.now(),
    kind: r.kind || "once",          // once | yearly
    month: r.month, day: r.day,      // para yearly
    note: r.note || "",
  };
}
function save(list) {
  return memory.saveData(K_REMINDERS, list.map(({ id, title, at, done, snoozedFrom, created, kind, month, day, note }) =>
    ({ id, title, at, done, snoozedFrom, created, kind, month, day, note })));
}

export function upcoming(now = Date.now()) {
  return loadReminders().filter((r) => !r.done && r.at >= now - 60 * 1000).sort((a, b) => a.at - b.at);
}
export function due(now = Date.now()) {
  return loadReminders().filter((r) => !r.done && r.at > 0 && r.at <= now).sort((a, b) => a.at - b.at);
}

export function addReminder({ title, at, kind = "once", month, day, note = "" }) {
  const list = loadReminders();
  const norm = (t) => String(t || "").trim().toLowerCase();
  const dup = list.find((r) => !r.done && norm(r.title) === norm(title) &&
    (kind === "yearly" ? r.kind === "yearly" && r.month === month && r.day === day : Math.abs(r.at - at) < 60 * 1000));
  if (dup) return { ok: true, pruned: 0, reminder: dup, duplicate: true };
  const r = normalize({ id: newId(), title, at, kind, month, day, note, created: Date.now() });
  list.push(r);
  const res = save(list);
  return { ...res, reminder: r };
}
export function updateReminder(id, patch) {
  const list = loadReminders();
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return { ok: false };
  list[i] = normalize({ ...list[i], ...patch, id });
  return { ...save(list), reminder: list[i] };
}
export function deleteReminder(id) {
  return save(loadReminders().filter((r) => r.id !== id));
}
export function snoozeReminder(id, minutes = 10) {
  const list = loadReminders();
  const r = list.find((x) => x.id === id);
  if (!r) return { ok: false };
  r.snoozedFrom = r.snoozedFrom || r.at;
  r.at = Date.now() + minutes * 60 * 1000;
  return { ...save(list), reminder: r };
}
export function completeReminder(id) {
  const list = loadReminders();
  const r = list.find((x) => x.id === id);
  if (!r) return { ok: false };
  if (r.kind === "yearly" && r.month && r.day) {
    const next = nextYearly(r.month, r.day, Date.now() + 24 * 3600 * 1000);
    r.at = next; r.done = false; r.snoozedFrom = null;
  } else {
    r.done = true;
  }
  return { ...save(list), reminder: r };
}

export function nextYearly(month, day, after = Date.now()) {
  const d = new Date(after);
  let y = d.getFullYear();
  let cand = new Date(y, month - 1, day, 9, 0, 0, 0);
  if (cand.getTime() <= after) cand = new Date(y + 1, month - 1, day, 9, 0, 0, 0);
  return cand.getTime();
}

// Cumpleaños de Evangeline: 10 de octubre (nació en 2025; próximo = 10-oct-2026 o el siguiente).
export const EVANGELINE_BDAY = { month: 10, day: 10, title: "Cumpleaños de Evangeline" };
export function hasBirthdayReminder() {
  return loadReminders().some((r) =>
    r.kind === "yearly" && r.month === 10 && r.day === 10 && /evangeline/i.test(r.title));
}
export function offerEvangelineBirthday() {
  if (hasBirthdayReminder()) return null;
  const at = nextYearly(10, 10);
  return addReminder({ title: EVANGELINE_BDAY.title, at, kind: "yearly", month: 10, day: 10, note: "Nació en 2025" });
}

// ---------- Parsing sencillo en español (usted) ----------
const MONTHS = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8, septiembre:9, setiembre:9, octubre:10, noviembre:11, diciembre:12 };
const WD = { domingo:0, lunes:1, martes:2, miércoles:3, miercoles:3, jueves:4, viernes:5, sábado:6, sabado:6 };

const TRIGGER = /^(?:por favor[,\s]+)?(?:rec[uú][eé]rd[ea]me|recordarme|av[ií]s[ea]me|avisarme|p[oó]ngame\s+(?:una\s+alarma|un\s+recordatorio)|ponga\s+(?:una\s+alarma|un\s+recordatorio)|cree\s+un\s+recordatorio)\b[,\s]*/i;
export function looksLikeReminder(text) { return TRIGGER.test(String(text || "").trim()); }

const RE_TIME = /\ba\s+las?\s+(\d{1,2})(?::(\d{2}))?(?:\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)(?![a-z]))?(?:\s+(?:de|en)\s+la\s+(mañana|tarde|noche))?/i;
const RE_DATE = /\bel\s+(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+(?:de|del)\s+(\d{4}))?/i;
const RE_WD = /\b(?:el\s+)?(?:pr[oó]ximo\s+)?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[áa]bado)\b/i;
const RE_REL = /\b(?:en|dentro\s+de)\s+(\d+|un|una|media)\s*(minutos?|min|horas?|d[ií]as?)\b/i;

// Devuelve {title, at, kind, month, day} o null si no hay fecha/hora reconocible
export function parseReminder(text, now = new Date()) {
  const raw = String(text || "").replace(/\s+/g, " ").trim().replace(/[.!?¡¿]+$/g, "");
  if (!raw) return null;
  let rest = raw.replace(TRIGGER, "");
  const nowMs = now.getTime();
  let at = null, kind = "once", month, day;

  const rel = rest.match(RE_REL);
  const tm = rest.match(RE_TIME);
  const dm = rest.match(RE_DATE);
  const wd = rest.match(RE_WD);
  const tomorrow = /\bpasado\s+mañana\b/i.test(rest) ? 2 : /\bmañana\b(?!\s*$)|^mañana\b|\bmañana\b/i.test(rest.replace(/\b(?:de|en)\s+la\s+mañana\b/gi, "")) ? 1 : 0;

  if (rel) {
    const nRaw = rel[1].toLowerCase();
    const u = rel[2].toLowerCase();
    let n = nRaw === "media" ? 0.5 : /^un/.test(nRaw) ? 1 : +nRaw;
    const ms = /^min/.test(u) ? n * 60000 : /^hora/.test(u) ? n * 3600000 : n * 86400000;
    at = nowMs + ms;
  } else {
    let hour = null, minute = 0, explicitPeriod = false;
    if (tm) {
      hour = +tm[1]; minute = tm[2] ? +tm[2] : 0;
      const ap = (tm[3] || "").toLowerCase().replace(/[\s.]/g, "");
      const part = (tm[4] || "").toLowerCase();
      if (ap === "pm" || part === "tarde" || part === "noche") { explicitPeriod = true; if (hour < 12) hour += 12; }
      else if (ap === "am" || part === "mañana") { explicitPeriod = true; if (hour === 12) hour = 0; }
      else if (hour >= 1 && hour <= 6) hour += 12; // "a las 5" -> 5 p. m.
    }
    if (hour != null && (hour > 23 || minute > 59)) return null;
    let base;
    if (dm && MONTHS[dm[2].toLowerCase()]) {
      day = +dm[1]; month = MONTHS[dm[2].toLowerCase()];
      const year = dm[3] ? +dm[3] : now.getFullYear();
      base = new Date(year, month - 1, day, hour ?? 9, minute, 0, 0);
      if (!dm[3] && base.getTime() <= nowMs) base.setFullYear(base.getFullYear() + 1);
      if (/cumplea[ñn]os|aniversario|cada\s+a[ñn]o|todos\s+los\s+a[ñn]os/i.test(rest)) kind = "yearly";
    } else if (tomorrow) {
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + tomorrow, hour ?? 9, minute, 0, 0);
    } else if (wd) {
      const key = wd[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const target = WD[key];
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour ?? 9, minute, 0, 0);
      let add = (target - base.getDay() + 7) % 7;
      if (add === 0 && base.getTime() <= nowMs) add = 7;
      base.setDate(base.getDate() + add);
    } else if (hour != null || /\bhoy\b/i.test(rest)) {
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour ?? 18, minute, 0, 0);
      if (base.getTime() <= nowMs && hour != null && !explicitPeriod && hour < 12) base.setHours(hour + 12);
      if (base.getTime() <= nowMs) base.setDate(base.getDate() + 1);
    } else return null;
    at = base.getTime();
  }

  // Título: quitar las partes de fecha/hora
  let title = rest
    .replace(RE_REL, " ").replace(RE_TIME, " ").replace(RE_DATE, " ").replace(RE_WD, " ")
    .replace(/\b(?:pasado\s+)?mañana\b/gi, " ").replace(/\bhoy\b/gi, " ")
    .replace(/\b(?:cada|todos\s+los)\s+a[ñn]os?\b/gi, " ")
    .replace(/\s+/g, " ").trim()
    .replace(/^(?:que|de|sobre|para)\s+/i, "")
    .replace(/^(?:el|la|los|las)\s+/i, "")
    .replace(/\s+(?:a|el|de|para|por)$/i, "")
    .replace(/^[,\s]+|[,\s]+$/g, "");
  if (!title || title.length < 2) title = "Recordatorio";
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return { title, at, kind, month, day };
}

export function formatWhen(at, now = Date.now()) {
  const d = new Date(at);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const t = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date(now);
  const tom = new Date(now); tom.setDate(tom.getDate() + 1);
  if (sameDay(d, today)) return `hoy a las ${t}`;
  if (sameDay(d, tom)) return `mañana a las ${t}`;
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d.getDate()} ${months[d.getMonth()]} a las ${t}`;
}
