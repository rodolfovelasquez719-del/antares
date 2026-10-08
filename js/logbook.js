// Antares Web - Bitácora de rutas del día (cifrada si hay código).
import { memory } from "./memory.js";

export const K_LOG = "antares.routeLog.v1";
export const STATUSES = ["planificada", "en curso", "cerrada"];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function loadLog() {
  return (memory.getData(K_LOG) || []).map((e) => ({
    id: e.id || newId(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayISO(),
    name: String(e.name || "").trim() || "Ruta",
    stops: Array.isArray(e.stops) ? e.stops.map((s) => String(s).trim()).filter(Boolean) : [],
    notes: String(e.notes || ""),
    status: STATUSES.includes(e.status) ? e.status : "planificada",
    km: typeof e.km === "number" ? e.km : null,
    created: e.created || Date.now(),
  })).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
}
const save = (l) => memory.saveData(K_LOG, l);

export function addEntry({ date, name, stops = [], notes = "", status = "planificada", km = null }) {
  const l = loadLog();
  const e = { id: newId(), date: date || todayISO(), name: String(name || "").trim() || "Ruta", stops: stops.map(String).map((s) => s.trim()).filter(Boolean), notes: String(notes || ""), status: STATUSES.includes(status) ? status : "planificada", km: typeof km === "number" ? km : null, created: Date.now() };
  l.unshift(e);
  return { ...save(l), entry: e };
}
export function updateEntry(id, patch) {
  const l = loadLog(); const i = l.findIndex((e) => e.id === id);
  if (i < 0) return { ok: false };
  const e = { ...l[i], ...patch, id };
  if (patch.status && !STATUSES.includes(patch.status)) e.status = l[i].status;
  l[i] = e;
  return { ...save(l), entry: e };
}
export function deleteEntry(id) { return save(loadLog().filter((e) => e.id !== id)); }

const csvCell = (v) => { const s = String(v ?? ""); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCSV(entries = loadLog()) {
  const head = ["Fecha", "Ruta", "Estado", "Paradas", "Km", "Notas"];
  const rows = entries.map((e) => [e.date, e.name, e.status, e.stops.join(" | "), e.km == null ? "" : String(e.km).replace(".", ","), e.notes]);
  // Punto y coma: Excel en español (coma decimal) lo abre en columnas; BOM para que reconozca UTF-8 (tildes, ñ)
  return "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
export function toTXT(entries = loadLog()) {
  if (!entries.length) return "Bitácora de rutas: sin anotaciones.\n";
  return entries.map((e) => [`${e.date} · ${e.name} · ${e.status}`, e.stops.length ? "Paradas: " + e.stops.join(", ") : "", e.km != null ? `Distancia: ${e.km} km` : "", e.notes ? "Notas: " + e.notes : ""].filter(Boolean).join("\n")).join("\n\n") + "\n";
}

// ---------- Chat ----------
const LOG_TRIGGER = /^(?:por favor[,\s]+)?(?:anote|apunte|registre|anote\s+en\s+la\s+bit[aá]cora)\s+(?:la\s+)?ruta\b/i;
export function looksLikeLog(text) { return LOG_TRIGGER.test(String(text || "").trim()); }

// "Anote la ruta de hoy: Ruta 3, paradas CEDI, KFC Escazú y Subway Lindora. Nota: cliente nuevo."
export function parseLogRequest(text, now = new Date()) {
  let t = String(text || "").trim().replace(LOG_TRIGGER, "").trim();
  let date = todayISO(now);
  if (/\bmañana\b/i.test(t)) { const d = new Date(now); d.setDate(d.getDate() + 1); date = todayISO(d); }
  else if (/\bayer\b/i.test(t)) { const d = new Date(now); d.setDate(d.getDate() - 1); date = todayISO(d); }
  else { const m = t.match(/\b(?:el|del)\s+(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/); if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear(); date = todayISO(new Date(y, +m[2] - 1, +m[1])); } }
  t = t.replace(/^(?:de\s+|del\s+)?(?:hoy|mañana|ayer|(?:el\s+)?\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)\s*[:,]?\s*/i, "");
  let notes = "";
  const nm = t.match(/(?:^|[\s,;])(?:nota|notas|observaci[oó]n)\s*:\s*(.+)$/i);
  if (nm) { notes = nm[1].trim(); t = t.slice(0, nm.index).trim().replace(/[,;]\s*$/, ""); }
  let stops = [];
  const sm = t.match(/\bparadas?\s*[:,]?\s*(.+)$/i);
  let name = t;
  if (sm) { stops = splitStops(sm[1]); name = t.slice(0, sm.index).trim().replace(/^[:,\-\s]+|[:,\-\s]+$/g, ""); }
  else if (t.includes(":")) { const [a, b] = t.split(/:\s*/, 2); name = a; stops = splitStops(b); }
  name = name.replace(/^(?:se\s+llama|llamada|nombre)\s*/i, "").replace(/^[:,\-\s]+|[:,\-\s]+$/g, "");
  if (!name) name = `Ruta del ${date}`;
  return { date, name: name.slice(0, 80), stops, notes, status: "planificada" };
}
function splitStops(s) { return String(s).split(/\s*(?:,|;|\n|\s+y\s+)\s*/).map((x) => x.replace(/^[-•\d.)\s]+/, "").replace(/[.\s]+$/, "").trim()).filter((x) => x.length >= 2); }

export function entryText(e) {
  return `Anoté la ruta «${e.name}» del ${e.date} (${e.status}).` +
    (e.stops.length ? `\nParadas: ${e.stops.join(", ")}.` : "") +
    (e.notes ? `\nNota: ${e.notes}` : "");
}
