// Antares Web - Calculadora de rutas: geocodificación (Open-Meteo / Nominatim) y distancias por carretera (OSRM).
// Sin API key. Nominatim: máximo 1 consulta por segundo y resultados en caché (política de uso de OSM).
// OSRM demo (router.project-osrm.org): servidor público de prueba, uso moderado; perfil de auto (no de camión).
import { memory } from "./memory.js";

export const K_GEOCACHE = "antares.geocache.v1";
export const K_ROUTE_DRAFT = "antares.routeDraft.v1";
const OM_GEO = "https://geocoding-api.open-meteo.com/v1/search";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org";
const CR_BOX = { s: 8.0, n: 11.3, w: -86.0, e: -82.5 }; // Costa Rica aproximada

let lastNominatim = 0;
const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Abortado", "AbortError")); }, { once: true });
});

async function getJson(url, signal, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) { if (signal.aborted) throw new DOMException("Abortado", "AbortError"); signal.addEventListener("abort", onAbort, { once: true }); }
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    return await r.json();
  } catch (e) {
    if (signal && signal.aborted) throw new DOMException("Abortado", "AbortError");
    throw e;
  } finally { clearTimeout(t); if (signal) signal.removeEventListener("abort", onAbort); }
}

const inCR = (lat, lon) => lat >= CR_BOX.s && lat <= CR_BOX.n && lon >= CR_BOX.w && lon <= CR_BOX.e;
const norm = (q) => String(q || "").trim().replace(/\s+/g, " ").toLowerCase();

function cacheGet(q) { const c = memory.getData(K_GEOCACHE) || {}; return c[norm(q)] || null; }
function cachePut(q, v) {
  const c = memory.getData(K_GEOCACHE) || {};
  c[norm(q)] = { ...v, t: Date.now() };
  const keys = Object.keys(c);
  if (keys.length > 300) keys.sort((a, b) => c[a].t - c[b].t).slice(0, keys.length - 300).forEach((k) => delete c[k]);
  memory.saveData(K_GEOCACHE, c);
}

// "10.016, -84.214" -> coordenadas directas
function parseCoords(q) {
  const m = String(q).match(/^\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  return inCR(lat, lon) ? { name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon, via: "coordenadas" } : null;
}

// Nombre corto de lugar (ciudad, distrito) -> Open-Meteo primero; direcciones y negocios -> Nominatim
const looksLikeAddress = (q) => /\d|,|\b(calle|avenida|av\.?|ruta|km|frente|costado|metros|centro comercial|mall|plaza|walmart|pricesmart|subway|taco bell|kfc|quiznos|hotel|restaurante|bodega|cedi|sysco|mayca|super|automercado|maxi|pal[ií]|mas x menos|hospital|universidad|aeropuerto)\b/i.test(q);

async function geoOpenMeteo(q, signal) {
  const d = await getJson(`${OM_GEO}?name=${encodeURIComponent(q)}&count=5&language=es&countryCode=CR&format=json`, signal);
  const r = (d && d.results || []).find((x) => x.country_code === "CR" && inCR(x.latitude, x.longitude));
  if (!r) return null;
  const parts = [r.name, r.admin2 && r.admin2 !== r.name ? r.admin2.replace(/^Cantón de /, "") : "", r.admin1 ? r.admin1.replace(/^Provincia de /, "") : ""].filter(Boolean);
  return { name: [...new Set(parts)].join(", "), lat: r.latitude, lon: r.longitude, via: "Open-Meteo" };
}
async function geoNominatim(q, signal) {
  const wait = lastNominatim + 1100 - Date.now(); // política: máximo 1 consulta por segundo
  if (wait > 0) await sleep(wait, signal);
  lastNominatim = Date.now();
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&countrycodes=cr&format=jsonv2&limit=5&accept-language=es&addressdetails=0`;
  const d = await getJson(url, signal);
  const list = (Array.isArray(d) ? d : []).filter((x) => inCR(+x.lat, +x.lon));
  // preferir lugares puntuales sobre provincias enteras
  const r = list.find((x) => !/^(state|country|region)$/.test(x.addresstype || "")) || null;
  if (!r) return null;
  return { name: String(r.display_name || q).replace(/, Costa Rica$/, ""), lat: +r.lat, lon: +r.lon, via: "Nominatim (OpenStreetMap)" };
}

export async function geocode(q, { signal } = {}) {
  const query = String(q || "").trim();
  if (!query) return null;
  const direct = parseCoords(query);
  if (direct) return direct;
  const cached = cacheGet(query);
  if (cached) return { name: cached.name, lat: cached.lat, lon: cached.lon, via: cached.via, cached: true };
  let r = null;
  const order = looksLikeAddress(query) ? [geoNominatim, geoOpenMeteo] : [geoOpenMeteo, geoNominatim];
  let lastErr = null;
  for (const fn of order) {
    try { r = await fn(query, signal); } catch (e) { if (e.name === "AbortError") throw e; lastErr = e; }
    if (r) break;
  }
  if (!r && lastErr) throw lastErr;
  if (r) cachePut(query, r);
  return r;
}

// ---------- Orden de paradas ----------
// Vecino más cercano desde la primera parada (punto de partida) + mejora 2-opt, sobre la matriz de tiempos.
export function orderStops(matrix, { roundTrip = true } = {}) {
  const n = matrix.length;
  if (n <= 2) return [...Array(n).keys()];
  const seen = new Set([0]);
  const order = [0];
  while (order.length < n) {
    const last = order[order.length - 1];
    let best = -1, bestV = Infinity;
    for (let j = 0; j < n; j++) if (!seen.has(j) && matrix[last][j] < bestV) { bestV = matrix[last][j]; best = j; }
    order.push(best); seen.add(best);
  }
  const cost = (o) => { let c = 0; for (let i = 0; i < o.length - 1; i++) c += matrix[o[i]][o[i + 1]]; if (roundTrip) c += matrix[o[o.length - 1]][o[0]]; return c; };
  let improved = true, cur = cost(order), guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const cand = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
        const c = cost(cand);
        if (c < cur - 1e-6) { order.splice(0, n, ...cand); cur = c; improved = true; }
      }
    }
  }
  return order;
}

const coordStr = (p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;

// stops: textos. Devuelve {ok, stops, legs, totalKm, totalMin, roundTrip, serviceMin, shiftMin, mapsUrl, source} o {ok:false, error, missing}
export async function calcRoute(queries, { roundTrip = true, optimize = true, serviceMin = 0, signal, onProgress } = {}) {
  const list = queries.map((q) => String(q).trim()).filter(Boolean);
  if (list.length < 2) return { ok: false, error: "Necesito al menos dos lugares: el punto de partida y una parada." };
  if (list.length > 25) return { ok: false, error: "El máximo es 25 paradas por cálculo." };
  const pts = [], missing = [];
  for (let i = 0; i < list.length; i++) {
    onProgress && onProgress(`Ubicando ${i + 1} de ${list.length}: ${list[i]}`);
    let g = null;
    try { g = await geocode(list[i], { signal }); }
    catch (e) { if (e.name === "AbortError") throw e; return { ok: false, error: "No pude conectar con el servicio de mapas. Revise su conexión e intente de nuevo." }; }
    if (!g) missing.push(list[i]); else pts.push({ query: list[i], ...g });
  }
  if (missing.length) return { ok: false, missing, error: `No encontré en Costa Rica: ${missing.join("; ")}. Escriba el lugar con más detalle (por ejemplo «Subway, Lindora, Santa Ana») o pegue las coordenadas.` };
  onProgress && onProgress("Calculando distancias por carretera…");
  let order = [...pts.keys()];
  try {
    if (optimize && pts.length > 2) {
      const t = await getJson(`${OSRM}/table/v1/driving/${pts.map(coordStr).join(";")}?annotations=duration,distance`, signal, 15000);
      if (!t || t.code !== "Ok" || !t.durations) throw new Error(t && t.code || "sin tabla");
      const m = t.durations.map((row) => row.map((v) => (v == null ? 1e9 : v)));
      order = orderStops(m, { roundTrip });
    }
    const seq = order.map((i) => pts[i]);
    const path = roundTrip ? [...seq, seq[0]] : seq;
    const r = await getJson(`${OSRM}/route/v1/driving/${path.map(coordStr).join(";")}?overview=false&steps=false`, signal, 15000);
    if (!r || r.code !== "Ok" || !r.routes || !r.routes[0]) throw new Error(r && r.code || "sin ruta");
    const route = r.routes[0];
    const legs = route.legs.map((lg, i) => ({ from: path[i].query, to: path[i + 1].query, km: lg.distance / 1000, min: lg.duration / 60 }));
    const totalKm = route.distance / 1000, totalMin = route.duration / 60;
    const stopsCount = seq.length - 1; // sin contar el punto de partida
    const shiftMin = totalMin + stopsCount * (Number(serviceMin) || 0);
    return {
      ok: true, stops: seq, legs, totalKm, totalMin, roundTrip, serviceMin: Number(serviceMin) || 0, shiftMin,
      optimized: optimize && pts.length > 2,
      mapsUrl: "https://www.google.com/maps/dir/" + path.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join("/"),
      source: "OSRM (router.project-osrm.org, perfil de auto)",
      at: Date.now(),
    };
  } catch (e) {
    if (e.name === "AbortError") throw e;
    return { ok: false, error: e.status === 429
      ? "El servidor público de rutas (OSRM) está limitando las consultas. Espere un minuto e intente de nuevo."
      : "No pude obtener las distancias por carretera en este momento (servidor OSRM). No le doy distancias inventadas: intente de nuevo en un momento.",
      stops: pts };
  }
}

export const fmtKm = (km) => `${km.toLocaleString("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
export function fmtMin(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// Texto para copiar o mostrar en el chat
export function routeText(res) {
  const lines = [];
  lines.push(`Ruta ${res.optimized ? "ordenada" : "en el orden indicado"} (${res.stops.length} puntos${res.roundTrip ? ", regresando al inicio" : ""}):`);
  res.stops.forEach((s, i) => lines.push(`${i + 1}. ${s.query}${s.name && norm(s.name) !== norm(s.query) ? ` (${s.name})` : ""}`));
  if (res.roundTrip) lines.push(`${res.stops.length + 1}. Regreso a ${res.stops[0].query}`);
  lines.push(`Distancia total: ${fmtKm(res.totalKm)} por carretera.`);
  lines.push(`Tiempo de manejo estimado: ${fmtMin(res.totalMin)} (auto; un camión suele tardar más).`);
  if (res.serviceMin) lines.push(`Con ${res.serviceMin} min por entrega: jornada aproximada de ${fmtMin(res.shiftMin)}.`);
  lines.push("Tramos:");
  res.legs.forEach((l) => lines.push(`- ${l.from} → ${l.to}: ${fmtKm(l.km)}, ${fmtMin(l.min)}`));
  return lines.join("\n");
}

// ---------- Chat ----------
const ROUTE_TRIGGER = /^(?:por favor[,\s]+)?(?:calc[uú]le(?:me)?|c[aá]lculeme|ordene|optimice|arme|planifique|planee)\s+(?:la|una|esta)?\s*ruta\b/i;
export function looksLikeRoute(text) { return ROUTE_TRIGGER.test(String(text || "").trim()); }

// "Calcule la ruta: CEDI Sysco, KFC Escazú, Subway Lindora" / "Calcule la ruta de Alajuela a Heredia y San José"
export function parseRouteRequest(text) {
  let t = String(text || "").trim().replace(ROUTE_TRIGGER, "").trim();
  const roundTrip = !/\bsin\s+regres|\bsolo\s+ida\b|\bsin\s+volver\b/i.test(t);
  t = t.replace(/\(?\s*(?:sin\s+regresar(?:\s+al\s+inicio)?|solo\s+ida|sin\s+volver)\s*\)?/gi, " ");
  t = t.replace(/^(?:con\s+(?:estas|las)\s+paradas|para|entre)\s*/i, "").replace(/^[:\-–]\s*/, "");
  t = t.replace(/^(?:desde|de)\s+/i, "");
  const parts = t.split(/\s*(?:\n|;|,|\s+y\s+|\s+hasta\s+|\s+(?<!\bfrente|\bcostado)a\s+(?=[A-ZÁÉÍÓÚÑ0-9]))\s*/).map((s) => s.replace(/^[-•\d.)\s]+/, "").replace(/[.]+$/, "").trim()).filter((s) => s.length >= 2);
  return { stops: parts, roundTrip };
}
