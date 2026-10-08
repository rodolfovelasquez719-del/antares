// Antares Web - Cúbica: ¿qué cabe en el camión? Perfiles de camión y carga actual (cifrados si hay código).
import { memory } from "./memory.js";

export const K_TRUCKS = "antares.trucks.v1";
export const K_LOAD = "antares.cubicLoad.v1";
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };
export { num as parseNum };

// ---------- Camiones ----------
export function loadTrucks() {
  return (memory.getData(K_TRUCKS) || []).map((t) => ({ id: t.id || newId(), name: String(t.name || "").trim() || "Camión", m3: num(t.m3), kg: num(t.kg) }));
}
const saveTrucks = (l) => memory.saveData(K_TRUCKS, l);
export function addTruck({ name, m3, kg }) {
  if (!(num(m3) > 0)) return { ok: false, error: "Indique la capacidad en m³." };
  const t = { id: newId(), name: String(name || "").trim() || `Camión ${num(m3)} m³`, m3: num(m3), kg: num(kg) };
  const l = loadTrucks(); l.push(t);
  return { ...saveTrucks(l), truck: t };
}
export function updateTruck(id, patch) {
  const l = loadTrucks(); const i = l.findIndex((t) => t.id === id);
  if (i < 0) return { ok: false };
  l[i] = { ...l[i], ...patch, m3: num(patch.m3 ?? l[i].m3), kg: num(patch.kg ?? l[i].kg) };
  return saveTrucks(l);
}
export function deleteTruck(id) { return saveTrucks(loadTrucks().filter((t) => t.id !== id)); }
export function findTruck(nameOrId) {
  const q = String(nameOrId || "").trim().toLowerCase();
  return loadTrucks().find((t) => t.id === nameOrId || t.name.toLowerCase() === q) ||
    loadTrucks().find((t) => q && t.name.toLowerCase().includes(q)) || null;
}

// ---------- Carga actual ----------
export function loadLoad() {
  const d = memory.getData(K_LOAD) || {};
  return { truckId: d.truckId || "", items: (d.items || []).map(normItem) };
}
function normItem(it) {
  return { id: it.id || newId(), name: String(it.name || "").trim() || "Producto", qty: Math.max(1, Math.round(num(it.qty) || 1)), m3: num(it.m3), kg: num(it.kg) };
}
export function saveLoad(load) { return memory.saveData(K_LOAD, { truckId: load.truckId || "", items: (load.items || []).map(normItem) }); }
export function addItem(it) { const l = loadLoad(); const n = normItem(it); l.items.push(n); return { ...saveLoad(l), item: n }; }
export function updateItem(id, patch) { const l = loadLoad(); const i = l.items.findIndex((x) => x.id === id); if (i < 0) return { ok: false }; l.items[i] = normItem({ ...l.items[i], ...patch }); return saveLoad(l); }
export function deleteItem(id) { const l = loadLoad(); l.items = l.items.filter((x) => x.id !== id); return saveLoad(l); }
export function clearItems() { const l = loadLoad(); l.items = []; return saveLoad(l); }
export function setTruck(truckId) { const l = loadLoad(); l.truckId = truckId; return saveLoad(l); }

// ---------- Cálculo ----------
// items: [{name, qty (unidades/cajas), m3 (por unidad), kg (por unidad, opcional)}]; truck: {m3, kg}
// Se carga en el orden de la lista (prioridad). Una caja no se parte: puede caber solo una parte de las cajas.
export function computeFit(items, truck) {
  const capM3 = num(truck && truck.m3), capKg = num(truck && truck.kg);
  let usedM3 = 0, usedKg = 0, needM3 = 0, needKg = 0;
  const rows = items.map((raw) => {
    const it = normItem(raw);
    const totM3 = it.m3 * it.qty, totKg = it.kg * it.qty;
    needM3 += totM3; needKg += totKg;
    let fit = it.qty;
    if (it.m3 > 0) fit = Math.min(fit, Math.floor((capM3 - usedM3) / it.m3 + 1e-9));
    if (capKg > 0 && it.kg > 0) fit = Math.min(fit, Math.floor((capKg - usedKg) / it.kg + 1e-9));
    fit = Math.max(0, fit);
    usedM3 += fit * it.m3; usedKg += fit * it.kg;
    return { ...it, totM3, totKg, fit, left: it.qty - fit, status: fit === it.qty ? "cabe" : fit > 0 ? "parcial" : "no" };
  });
  const r2 = (x) => Math.round(x * 1000) / 1000;
  return {
    rows, capM3, capKg,
    usedM3: r2(usedM3), usedKg: r2(usedKg), needM3: r2(needM3), needKg: r2(needKg),
    fillM3: capM3 ? Math.round((usedM3 / capM3) * 1000) / 10 : 0,
    fillKg: capKg ? Math.round((usedKg / capKg) * 1000) / 10 : null,
    freeM3: r2(Math.max(0, capM3 - usedM3)), freeKg: capKg ? r2(Math.max(0, capKg - usedKg)) : null,
    overM3: r2(Math.max(0, needM3 - capM3)), overKg: capKg ? r2(Math.max(0, needKg - capKg)) : null,
    allFit: rows.every((r) => r.status === "cabe"),
  };
}

const f = (n, d = 2) => Number(n).toLocaleString("es-CR", { maximumFractionDigits: d });
export function fitText(res, truckName = "") {
  const lines = [];
  const cap = `${f(res.capM3)} m³${res.capKg ? ` y ${f(res.capKg, 0)} kg` : ""}`;
  lines.push(res.allFit
    ? `Sí, todo cabe en ${truckName ? "el camión «" + truckName + "»" : "el camión"} (${cap}).`
    : `No cabe todo en ${truckName ? "el camión «" + truckName + "»" : "el camión"} (${cap}).`);
  lines.push(`Ocupación: ${f(res.usedM3)} m³ de ${f(res.capM3)} (${f(res.fillM3, 1)} %)${res.fillKg != null ? `; peso ${f(res.usedKg, 0)} kg de ${f(res.capKg, 0)} (${f(res.fillKg, 1)} %)` : ""}.`);
  for (const r of res.rows) {
    const what = `${r.qty > 1 ? r.qty + " × " : ""}${r.name} (${f(r.totM3)} m³${r.kg ? `, ${f(r.totKg, 0)} kg` : ""})`;
    if (r.status === "cabe") lines.push(`✔ ${what}: cabe.`);
    else if (r.status === "parcial") lines.push(`◐ ${what}: caben ${r.fit} de ${r.qty}; quedan ${r.left} fuera.`);
    else lines.push(`✘ ${what}: no cabe.`);
  }
  if (!res.allFit) {
    const over = [res.overM3 > 0 ? `${f(res.overM3)} m³` : "", res.overKg > 0 ? `${f(res.overKg, 0)} kg` : ""].filter(Boolean).join(" y ");
    if (over) lines.push(`Sobran ${over} respecto a la capacidad.`);
  } else lines.push(`Queda libre: ${f(res.freeM3)} m³${res.freeKg != null ? ` y ${f(res.freeKg, 0)} kg` : ""}.`);
  return lines.join("\n");
}

// ---------- Chat ----------
export function looksLikeCubic(text) {
  return /\b(cabe|caben|cabr[aá]n?|entra|entran)\b[^?]*\bcami[oó]n\b|\bc[uú]bica\b.*\bcami[oó]n\b|\bcami[oó]n\b.*\b(cabe|caben)\b/i.test(String(text || ""));
}
const N = "(\\d+(?:[.,]\\d+)?)";
const M3 = "(?:m3|m³|metros?\\s+c[uú]bicos?)";
// Devuelve {items, truck:{m3,kg}|null, truckName} o null si no hay números útiles
export function parseCubic(text) {
  let t = String(text || "").replace(/[¿?¡!]/g, " ").replace(/\s+/g, " ");
  let truck = null, truckName = "";
  const tm = t.match(new RegExp(`(?:en\\s+)?(?:un|el)?\\s*cami[oó]n\\s+(?:de\\s+)?${N}\\s*${M3}(?:\\s*(?:y|,)?\\s*${N}\\s*(?:kg|kilos?))?`, "i"));
  if (tm) { truck = { m3: num(tm[1]), kg: tm[2] ? num(tm[2]) : 0 }; t = t.replace(tm[0], " "); }
  else {
    const nm = t.match(/cami[oó]n\s+(?:«|")?([A-Za-zÁÉÍÓÚÑáéíóúñ0-9\- ]{2,30}?)(?:»|")?(?=\s*(?:[:,.]|$|\s+(?:con|si|para)\b))/i);
    for (const tr of loadTrucks()) {
      const re = new RegExp(`(?:\\ben\\s+)?(?:\\b(?:el|un)\\s+)?(?:cami[oó]n\\s+)?(?:«|")?${tr.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:»|")?`, "i");
      const mm = t.match(re);
      if (mm) { truck = tr; truckName = tr.name; t = t.replace(mm[0], " "); break; }
    }
    if (!truck && nm) { const tr = findTruck(nm[1]); if (tr) { truck = tr; truckName = tr.name; t = t.replace(nm[0], " "); } }
  }
  t = t.replace(/\s+en\s+(?:el|un)\s+cami[oó]n\s*(?=[\s?.,]|$)/i, " ");
  t = t.replace(/^.*?\b(?:cabe|caben|entra|entran)\b(?:\s+esto)?(?:\s+en\s+el\s+cami[oó]n)?\s*[:,]?/i, " ");
  const items = [];
  const parts = t.split(/\s*(?:;|\n|,(?!\d)|\s+y\s+(?!\d+(?:[.,]\d+)?\s*(?:kg|kilos?))|\s+m[aá]s\s+)\s*/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    let m;
    if ((m = p.match(new RegExp(`^${N}\\s*(?:cajas?|bultos?|unidades?|paquetes?|tarimas?|pallets?)(?:\\s+de\\s+([^\\d]+?))?\\s+(?:de|a|con)\\s+${N}\\s*${M3}(?:\\s+(?:cada\\s+una|c\\/u|cada\\s+uno))?(?:\\s+(?:y|con)?\\s*${N}\\s*(?:kg|kilos?))?(?:\\s+(?:de\\s+)?(.+))?$`, "i")))) {
      items.push({ name: (m[2] || m[5] || "cajas").trim(), qty: num(m[1]), m3: num(m[3]), kg: m[4] ? num(m[4]) : 0 });
    } else if ((m = p.match(new RegExp(`^${N}\\s*${M3}(?:\\s+de\\s+(.+?))?(?:\\s+(?:y|con)?\\s*${N}\\s*(?:kg|kilos?))?$`, "i")))) {
      items.push({ name: (m[2] || "carga").trim(), qty: 1, m3: num(m[1]), kg: m[3] ? num(m[3]) : 0 });
    }
  }
  if (!items.length) return null;
  return { items, truck, truckName };
}
