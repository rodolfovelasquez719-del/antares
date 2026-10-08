// Antares Web - Resumen del día: clima (Open-Meteo), dólar (Hacienda) y noticias (RSS vía rss2json).
// Sin API key. Se guarda en sessionStorage ~1 hora para no repetir las consultas.
import { fetchWeather, describeWeather } from "./weather.js";

const FX_URL = "https://api.hacienda.go.cr/indicadores/tc/dolar";
const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";
// Fuentes costarricenses gratuitas. rss2json las descarga del lado del servidor (CORS de los RSS no permite leerlas directo).
export const NEWS_FEEDS = [
  { name: "La Nación", url: "https://www.nacion.com/arc/outboundfeeds/rss/?outputType=xml" },
  { name: "El Financiero", url: "https://www.elfinancierocr.com/arc/outboundfeeds/rss/?outputType=xml" },
  { name: "Delfino", url: "https://delfino.cr/feed" },
];
const CACHE_KEY = "antares.digest.session";
const CACHE_MS = 60 * 60 * 1000;

async function getJson(url, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
  finally { clearTimeout(t); }
}

export async function fetchFx() {
  const d = await getJson(FX_URL);
  if (!d || !d.venta || typeof d.venta.valor !== "number") return null;
  return {
    venta: d.venta.valor,
    compra: d.compra && d.compra.valor,
    fecha: d.venta.fecha || "",
    source: "BCCR vía Ministerio de Hacienda (api.hacienda.go.cr)",
  };
}

export async function fetchNews(limit = 5) {
  const lists = await Promise.all(NEWS_FEEDS.map(async (f) => {
    const d = await getJson(RSS2JSON + encodeURIComponent(f.url));
    if (!d || d.status !== "ok" || !Array.isArray(d.items)) return [];
    return d.items.map((it) => ({
      title: String(it.title || "").replace(/\s+/g, " ").trim(),
      link: String(it.link || ""),
      source: f.name,
      date: it.pubDate || "",
    })).filter((n) => n.title && /^https:\/\//.test(n.link));
  }));
  // intercalar fuentes: 1 de cada una por ronda
  const out = [], seen = new Set();
  for (let i = 0; out.length < limit && lists.some((l) => l[i]); i++) {
    for (const l of lists) {
      const n = l[i];
      if (n && !seen.has(n.title.toLowerCase()) && out.length < limit) { seen.add(n.title.toLowerCase()); out.push(n); }
    }
  }
  return out;
}

export function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || Date.now() - d.at > CACHE_MS) return null;
    return d;
  } catch { return null; }
}
function writeCache(d) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch { /* */ }
}

// {weather, fx, news, at} — usa caché de 1 h salvo force
export async function getDigest({ force = false } = {}) {
  if (!force) { const c = readCache(); if (c) return c; }
  const [weather, fx, news] = await Promise.all([fetchWeather(), fetchFx(), fetchNews(5)]);
  const d = { weather, fx, news, at: Date.now() };
  if (weather || fx || (news && news.length)) writeCache(d);
  return d;
}

export function digestText(d, { links = true } = {}) {
  const lines = [];
  if (d.weather) lines.push(weatherLine(d.weather));
  else lines.push("No pude consultar el clima en este momento.");
  if (d.fx) {
    const c = d.fx.compra != null ? ` y la compra en ₡${fmt(d.fx.compra)}` : "";
    lines.push(`El dólar: venta en ₡${fmt(d.fx.venta)}${c}${d.fx.fecha ? " (" + d.fx.fecha + ")" : ""}.`);
  } else lines.push("No pude consultar el tipo de cambio.");
  if (d.news && d.news.length) {
    lines.push("Noticias de Costa Rica:");
    d.news.forEach((n, i) => lines.push(`${i + 1}. ${n.title} (${n.source})${links ? ": " + n.link : ""}`));
  } else lines.push("No pude traer titulares en este momento.");
  return lines.join("\n");
}
export function weatherLine(w) {
  let t = `Clima en Alajuela: ${w.temp}°C, ${(w.desc || "clima actual").toLowerCase()}`;
  if (w.max != null && w.min != null) t += `; hoy entre ${w.min}° y ${w.max}°`;
  if (w.rain != null) t += `, ${w.rain} % de probabilidad de lluvia`;
  return t + ".";
}
const fmt = (n) => Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function looksLikeDigest(text) {
  return /c[oó]mo\s+est[aá]\s+el\s+d[ií]a|noticias|tipo\s+de\s+cambio|c[oó]mo\s+est[aá]\s+el\s+d[oó]lar|resumen\s+del\s+d[ií]a/i.test(text);
}
export { describeWeather };
