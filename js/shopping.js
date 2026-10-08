// Antares Web - Lista de compras (cifrada). Nunca inventa artículos.
import { memory } from "./memory.js";

export const K_SHOPPING = "antares.shopping.v1";
export const STORES = ["Walmart", "PriceSmart", "Maxi Palí", "Automercado", "Pequeño Mundo", "Otro"];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function loadItems() {
  return (memory.getData(K_SHOPPING) || []).map((it) => ({
    id: it.id || newId(),
    name: String(it.name || "").trim(),
    qty: it.qty || "1",
    store: STORES.includes(it.store) ? it.store : "Otro",
    bought: !!it.bought,
    created: it.created || Date.now(),
  })).filter((it) => it.name);
}
function save(list) {
  return memory.saveData(K_SHOPPING, list.map(({ id, name, qty, store, bought, created }) => ({ id, name, qty, store, bought, created })));
}

export function grouped(items = loadItems()) {
  const open = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);
  const byStore = {};
  for (const s of STORES) byStore[s] = [];
  for (const it of open) (byStore[it.store] || byStore.Otro).push(it);
  return { byStore, bought, open };
}

export function addItem({ name, qty = "1", store = "Otro" }) {
  const list = loadItems();
  const n = name.trim();
  if (!n) return { ok: false };
  const existing = list.find((i) => i.name.toLowerCase() === n.toLowerCase() && !i.bought);
  if (existing) {
    if (qty && qty !== "1") existing.qty = qty;
    if (store && store !== "Otro") existing.store = STORES.includes(store) ? store : "Otro";
    return { ...save(list), item: existing, updated: true };
  }
  const item = { id: newId(), name: n, qty: String(qty || "1"), store: STORES.includes(store) ? store : "Otro", bought: false, created: Date.now() };
  list.push(item);
  return { ...save(list), item };
}
export function updateItem(id, patch) {
  const list = loadItems();
  const it = list.find((x) => x.id === id);
  if (!it) return { ok: false };
  Object.assign(it, patch);
  if (patch.store && !STORES.includes(patch.store)) it.store = "Otro";
  return { ...save(list), item: it };
}
export function toggleBought(id, bought) {
  return updateItem(id, { bought: bought !== undefined ? !!bought : !loadItems().find((i) => i.id === id)?.bought });
}
export function markByName(name, bought = true) {
  const list = loadItems();
  const n = name.trim().toLowerCase();
  const hits = list.filter((i) => i.name.toLowerCase() === n || i.name.toLowerCase().includes(n));
  if (!hits.length) return { ok: false, missing: true };
  for (const h of hits) h.bought = bought;
  return { ...save(list), items: hits };
}
export function deleteItem(id) { return save(loadItems().filter((i) => i.id !== id)); }
export function clearBought() { return save(loadItems().filter((i) => !i.bought)); }

const STORE_ALIASES = [
  [/walmart|wal\s*mart/i, "Walmart"],
  [/pricesmart|price\s*smart/i, "PriceSmart"],
  [/maxi\s*pal[ií]|pal[ií]/i, "Maxi Palí"],
  [/automercado/i, "Automercado"],
  [/peque[ñn]o\s*mundo/i, "Pequeño Mundo"],
];
export function detectStore(text) {
  for (const [re, name] of STORE_ALIASES) if (re.test(text)) return name;
  return null;
}

export function looksLikeShopping(text) {
  return /(?:agregue|a[ñn]ada|ponga|anote|s[uú]me)\w*\s+.+\s+(?:a|en)\s+la\s+lista/i.test(text)
    || /lista\s+de\s+compras/i.test(text)
    || /(?:marque|tache|quite)\w*\s+.+\s+como\s+comprad/i.test(text)
    || /qu[eé]\s+falta/i.test(text);
}

// {action:"add"|"list"|"bought"|"clear", name?, qty?, store?} | null
export function parseShopping(text) {
  const raw = String(text || "").trim();
  if (/qu[eé]\s+(?:falta|hay en la lista)|mu[eé]stre(?:me)?\s+la\s+lista|lista\s+de\s+compras/i.test(raw)) return { action: "list" };
  if (/borre\s+lo\s+comprado|limpie\s+la\s+lista\s+de\s+comprados/i.test(raw)) return { action: "clear" };
  const bought = raw.match(/(?:marque|tache|quite)\w*\s+(.+?)\s+como\s+comprad/i);
  if (bought) return { action: "bought", name: bought[1].replace(/^el\s+|^la\s+|^los\s+|^las\s+/i, "").trim() };
  const add = raw.match(/(?:agregue|a[ñn]ada|ponga|anote|s[uú]me)\w*\s+(.+?)\s+(?:a|en)\s+la\s+lista(?:\s+de\s+compras)?(?:\s+(?:de|en|para)\s+(.+))?$/i);
  if (add) {
    let name = add[1].trim();
    let qty = "1";
    const qm = name.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|lb|l|ml|unidades?|paquetes?|cajas?)?\s+(.+)$/i);
    if (qm) { qty = qm[2] ? `${qm[1]} ${qm[2]}` : qm[1]; name = qm[3]; }
    const store = detectStore(add[2] || raw);
    return { action: "add", name, qty, store: store || "Otro" };
  }
  return null;
}
