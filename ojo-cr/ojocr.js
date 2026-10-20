"use strict";
// Antares · Ojo CR (v1.24: integrado en la app dentro de Ojo; la muestra sigue en /muestra-ojo-cr/). Solo datos públicos y gratuitos, sin claves. No rastrea personas.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const TZ = "America/Costa_Rica";
const hora = (d) => new Date(d).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit", timeZone: TZ });
const horaH = (d) => new Date(d).toLocaleTimeString("es-CR", { hour: "numeric", timeZone: TZ }).replace(/\s?([ap])\.?\s?m\.?/i, " $1. m.");
const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `hace ${Math.max(1, m)} min` : m < 24 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
const km = (a, b) => { const R = 6371, dl = (b[1] - a[1]) * Math.PI / 180, dL = (b[0] - a[0]) * Math.PI / 180; const x = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dL / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const fc = (f) => ({ type: "FeatureCollection", features: f });
function toast(t, ms = 2600) { const e = $("#toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("on"), ms); }
async function getJ(u, ms = 15000, txt = false) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(u, { signal: c.signal, referrerPolicy: "strict-origin-when-cross-origin" }); if (!r.ok) throw Error("HTTP " + r.status); return txt ? r.text() : r.json(); }
  finally { clearTimeout(t); }
}
setInterval(() => { $("#clk").innerHTML = new Date().toLocaleTimeString("es-CR", { hour12: false, timeZone: TZ }) + "<br>COSTA RICA · UTC-6"; }, 1000);

// ---------- riesgo de lluvia (pronóstico Open-Meteo) ----------
// 0 verde · 1 amarillo · 2 rojo
function nivel(p, mm, code) {
  if (code >= 95 || mm >= 5 || (p >= 80 && mm >= 3)) return 2;
  if (p >= 50 || mm >= 0.5 || (code >= 61 && code <= 82)) return 1;
  return 0;
}
const COL = ["#22ff9a", "#ffd23f", "#ff3b5c"], CL = ["v", "a", "r"];
const mmf = (x) => x.toFixed(1).replace(".", ",");
const texto = (lv, code, mm = 0) => (code >= 95 ? "Tormenta eléctrica" : lv === 2 ? "Lluvia fuerte" : mm >= 1 ? "Lluvia moderada" : "Lluvia posible");
async function pronostico(pts) { // pts: [[lng,lat]...] → por punto: [{t,p,mm,code}] próximas 7 h
  const out = [];
  for (let i = 0; i < pts.length; i += 90) {
    const part = pts.slice(i, i + 90);
    const u = "https://api.open-meteo.com/v1/forecast?latitude=" + part.map((p) => p[1].toFixed(3)).join(",") + "&longitude=" + part.map((p) => p[0].toFixed(3)).join(",") +
      "&hourly=precipitation_probability,precipitation,weather_code&forecast_hours=10&timezone=" + encodeURIComponent(TZ) + "&timeformat=unixtime";
    let j = null;
    for (let intento = 0; intento < 3 && !j; intento++) { // Open-Meteo a veces tarda: 3 intentos con espera creciente
      try { j = await getJ(u, 25000); } catch (e) { if (intento === 2) throw e; await new Promise((r) => setTimeout(r, 2000 * (intento + 1))); }
    }
    if (!Array.isArray(j)) j = [j];
    for (const r of j) out.push(r.hourly.time.map((t, k) => ({ t: t * 1000, p: r.hourly.precipitation_probability[k] ?? 0, mm: r.hourly.precipitation[k] ?? 0, code: r.hourly.weather_code[k] ?? 0 })));
  }
  return out;
}
// puntos cada `paso` km sobre una línea [[lng,lat]...]; devuelve {pt, km, i}
function muestrear(line, paso) {
  const res = [{ pt: line[0], km: 0, i: 0 }]; let acc = 0, next = paso;
  for (let i = 1; i < line.length; i++) { acc += km(line[i - 1], line[i]); if (acc >= next) { res.push({ pt: line[i], km: acc, i }); next += paso; } }
  const last = line.length - 1;
  if (res[res.length - 1].i !== last) {
    // v1.24.1: si el final queda pegado a la última muestra (< medio paso), se reemplaza en vez de repetir el lugar
    if (res.length > 1 && acc - res[res.length - 1].km < paso / 2) res[res.length - 1] = { pt: line[last], km: acc, i: last };
    else res.push({ pt: line[last], km: acc, i: last });
  }
  return res;
}
const LUGARES_EXTRA = [["San José", 9.933, -84.08], ["Alajuela", 10.016, -84.214], ["Heredia", 9.998, -84.117], ["Cartago", 9.864, -83.919], ["Puntarenas", 9.976, -84.833], ["Limón", 9.99, -83.03], ["Liberia", 10.635, -85.437], ["San Carlos (Ciudad Quesada)", 10.323, -84.427], ["Grecia", 10.073, -84.311], ["Atenas", 9.977, -84.379], ["Turrialba", 9.905, -83.683], ["Pérez Zeledón", 9.375, -83.705], ["Golfito", 8.64, -83.18], ["Nicoya", 10.148, -85.452], ["Santa Ana", 9.932, -84.182], ["Desamparados", 9.897, -84.064]];
function cercaDe(pt, lugares) { let best = null, d = 1e9; for (const [n, lat, lng] of lugares) { const x = km(pt, [lng, lat]); if (x < d) { d = x; best = n; } } return d < 4 ? best : d < 25 ? "cerca de " + best : best ? "entre lugares, a " + Math.round(d) + " km de " + best : ""; }

// ---------- mapa ----------
const OSM_STYLE = "https://tiles.openfreemap.org/styles/dark";
const CR = { center: [-84.15, 9.75], zoom: innerWidth < 900 ? 6.6 : 7.3 };
const map = new maplibregl.Map({ container: "map", style: OSM_STYLE, center: CR.center, zoom: CR.zoom, minZoom: 5.5, maxZoom: 17, maxBounds: [[-88.5, 6.5], [-80.5, 12.8]], attributionControl: false, fadeDuration: 0, pixelRatio: Math.min(devicePixelRatio, 2) });
map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
// v1.24.2: un solo crédito (mapa base + radar + satélite) y en pantallas angostas plegado en «ⓘ» para no montarse con la escala
map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
function plegarCreditos() { if (innerWidth >= 900) return; const a = document.querySelector(".maplibregl-ctrl-attrib"); if (a) { a.classList.remove("maplibregl-compact-show"); a.removeAttribute("open"); } }
map.on("load", () => setTimeout(plegarCreditos, 50)); map.on("sourcedata", (e) => { if (e.sourceDataType === "metadata") setTimeout(plegarCreditos, 50); });
// el estilo de OpenFreeMap pide íconos que no trae (p. ej. «circle-11»): se dibuja un punto discreto
map.on("styleimagemissing", (e) => {
  if (map.hasImage(e.id)) return;
  const n = 11, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.hypot(x - 5, y - 5), i = (y * n + x) * 4; if (r <= 3.6) { d[i] = 159; d[i + 1] = 232; d[i + 2] = 197; d[i + 3] = r > 2.8 ? 120 : 200; } }
  try { map.addImage(e.id, { width: n, height: n, data: d }); } catch { /* */ }
});
map.on("error", (e) => console.log("mapa:", e.error && e.error.message));
const on = { corr: true, radar: false, imerg: false, sis: true, vol: true, sat: false };
// v1.24.2: las capas elegidas se recuerdan en esta sesión (p. ej. al ir a MUNDO y volver)
try { Object.assign(on, JSON.parse(sessionStorage.getItem("ojocr.capas") || "{}")); } catch { /* */ }
const guardarCapas = () => { try { sessionStorage.setItem("ojocr.capas", JSON.stringify(on)); } catch { /* */ } };
let RUTAS = null, alertasPorRuta = [], radarUrl = null, radarTime = null;

function tinte() {
  for (const l of map.getStyle().layers) {
    const id = l.id;
    try {
      if (l.type === "background") map.setPaintProperty(id, "background-color", "#010a06");
      else if (id === "water") map.setPaintProperty(id, "fill-color", "#03261b");
      else if (l.type === "fill" && /landuse|landcover|park/.test(id)) map.setPaintProperty(id, "fill-color", "#03140d");
      else if (id === "building") map.setPaintProperty(id, "fill-color", "#062a1b");
      else if (l.type === "line" && /motorway|trunk/.test(id)) map.setPaintProperty(id, "line-color", "rgba(255,59,92,.35)");
      else if (l.type === "line" && /highway|road|street/.test(id)) map.setPaintProperty(id, "line-color", "rgba(34,255,154,.22)");
      else if (l.type === "line" && /boundary/.test(id)) map.setPaintProperty(id, "line-color", "rgba(34,255,154,.6)");
      else if (l.type === "symbol") { map.setPaintProperty(id, "text-color", "#9fe8c5"); map.setPaintProperty(id, "text-halo-color", "#00120a"); }
    } catch { /* capa sin esa propiedad */ }
  }
}
function circ(lng, lat, m) { const c = []; for (let a = 0; a <= 64; a++) { const t = a / 64 * 2 * Math.PI; c.push([lng + m / 111320 / Math.cos(lat * Math.PI / 180) * Math.cos(t), lat + m / 110540 * Math.sin(t)]); } return c; }
const GAM = [[-84.33, 9.95], [-84.30, 10.06], [-84.17, 10.09], [-84.03, 10.06], [-83.93, 10.0], [-83.86, 9.9], [-83.88, 9.83], [-84.0, 9.84], [-84.12, 9.86], [-84.24, 9.88], [-84.33, 9.95]];
const VOLC = [
  { n: "Poás", lat: 10.2, lng: -84.233, alt: "2708 m", d: "Volcán activo de Alajuela, a ~35 km del centro. Su actividad puede cambiar el acceso al parque y, con ceniza, afectar el Valle Central." },
  { n: "Turrialba", lat: 10.025, lng: -83.767, alt: "3340 m", d: "Volcán activo de Cartago. Episodios de ceniza han afectado en el pasado al Valle Central y al aeropuerto Juan Santamaría." },
  { n: "Rincón de la Vieja", lat: 10.83, lng: -85.324, alt: "1916 m", d: "Volcán activo de Guanacaste (cerca de Liberia y la Ruta 1). Tiene erupciones freáticas frecuentes; los lahares pueden afectar ríos de la zona." },
];

// padding del mapa = espacio que tapa el panel (izquierda en computadora, abajo en teléfono)
function pad() {
  const r = $("#panel").getBoundingClientRect();
  map.setPadding(innerWidth >= 900 ? { left: Math.round(r.right), top: 0, right: 0, bottom: 0 } : { left: 0, top: 0, right: 0, bottom: Math.round(innerHeight - r.top) });
}
addEventListener("resize", pad);
$("#panel").addEventListener("transitionend", pad);
map.on("load", async () => {
  pad(); map.jumpTo({ center: CR.center, zoom: CR.zoom });
  tinte();
  map.addSource("esri", { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" });
  const below = map.getLayer("waterway") ? "waterway" : undefined;
  map.addLayer({ id: "esri", type: "raster", source: "esri", layout: { visibility: "none" }, paint: { "raster-saturation": -0.3, "raster-brightness-max": 0.8 } }, below);
  // áreas clave
  map.addSource("areas", { type: "geojson", data: fc([
    { type: "Feature", properties: { n: "GAM · San José (aprox.)" }, geometry: { type: "Polygon", coordinates: [GAM] } },
    { type: "Feature", properties: { n: "Alajuela" }, geometry: { type: "Polygon", coordinates: [circ(-84.214, 10.016, 4500)] } },
  ]) });
  map.addLayer({ id: "areas", type: "fill", source: "areas", paint: { "fill-color": "rgba(58,214,255,.07)" } });
  map.addLayer({ id: "areas-l", type: "line", source: "areas", paint: { "line-color": "#3ad6ff", "line-width": 1.4, "line-dasharray": [3, 2] } });
  map.addSource("areas-pt", { type: "geojson", data: fc([
    { type: "Feature", properties: { n: "GAM · SAN JOSÉ" }, geometry: { type: "Point", coordinates: [-84.06, 9.9] } },
    { type: "Feature", properties: { n: "ALAJUELA" }, geometry: { type: "Point", coordinates: [-84.214, 10.016] } },
  ]) });
  map.addLayer({ id: "areas-t", type: "symbol", source: "areas-pt", layout: { "text-field": ["get", "n"], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-letter-spacing": 0.15, "text-offset": [0, -1.4] }, paint: { "text-color": "#3ad6ff", "text-halo-color": "#00120a", "text-halo-width": 1.5 } });
  // corredores
  for (const s of ["corr", "corr-risk", "corr-lbl", "sis", "vol", "miruta", "miruta-risk", "mipts"]) map.addSource(s, { type: "geojson", data: fc([]) });
  map.addLayer({ id: "corr-glow", type: "line", source: "corr", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 12, "line-blur": 8, "line-opacity": 0.35 } });
  map.addLayer({ id: "corr-case", type: "line", source: "corr", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#00140a", "line-width": 6.5 } });
  map.addLayer({ id: "corr", type: "line", source: "corr", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 3.2 } });
  map.addLayer({ id: "corr-risk", type: "line", source: "corr-risk", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 3.6 } });
  map.addLayer({ id: "corr-lbl", type: "symbol", source: "corr-lbl", layout: { "text-field": ["get", "n"], "text-size": 12, "text-font": ["Noto Sans Bold"], "icon-allow-overlap": true, "text-allow-overlap": false }, paint: { "text-color": "#00140a", "text-halo-color": ["get", "c"], "text-halo-width": 4 } });
  // mi ruta
  map.addLayer({ id: "miruta-glow", type: "line", source: "miruta", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3ad6ff", "line-width": 14, "line-blur": 8, "line-opacity": 0.45 } });
  map.addLayer({ id: "miruta-risk", type: "line", source: "miruta-risk", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 5 } });
  map.addLayer({ id: "mipts", type: "circle", source: "mipts", paint: { "circle-radius": 7, "circle-color": ["get", "c"], "circle-stroke-color": "#00140a", "circle-stroke-width": 2 } });
  // sismos y volcanes
  map.addLayer({ id: "sis-halo", type: "circle", source: "sis", paint: { "circle-color": "#ff3b5c", "circle-opacity": ["case", ["get", "nuevo"], 0.25, 0], "circle-radius": ["interpolate", ["linear"], ["get", "m"], 2.5, 12, 7, 46] } });
  map.addLayer({ id: "sis", type: "circle", source: "sis", paint: { "circle-color": "#ff3b5c", "circle-opacity": 0.55, "circle-stroke-color": "#ff8095", "circle-stroke-width": 1.4, "circle-radius": ["interpolate", ["linear"], ["get", "m"], 2.5, 4, 7, 24] } });
  map.addLayer({ id: "vol", type: "symbol", source: "vol", layout: { "text-field": ["concat", "▲ ", ["get", "n"]], "text-size": 13, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true, "text-anchor": "left", "text-offset": [-0.4, 0] }, paint: { "text-color": "#ff3b5c", "text-halo-color": "#00120a", "text-halo-width": 2 } });
  map.getSource("vol").setData(fc(VOLC.map((v, i) => ({ type: "Feature", properties: { n: v.n, i }, geometry: { type: "Point", coordinates: [v.lng, v.lat] } }))));
  for (const id of ["corr", "corr-risk", "sis", "vol", "miruta-risk", "areas"]) { map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer")); map.on("mouseleave", id, () => (map.getCanvas().style.cursor = "")); }
  map.on("click", "vol", (e) => popVol(+e.features[0].properties.i));
  map.on("click", "sis", (e) => popSis(+e.features[0].properties.i));
  map.on("click", "corr-risk", (e) => popSeg(e.features[0].properties, e.lngLat));
  map.on("click", "corr", (e) => popSeg(e.features[0].properties, e.lngLat));
  map.on("click", "miruta-risk", (e) => popSeg(e.features[0].properties, e.lngLat));
  map.on("click", "areas", (e) => { if (map.queryRenderedFeatures(e.point, { layers: ["corr", "corr-risk", "sis", "vol"] }).length) return; new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<b>${esc(e.features[0].properties.n)}</b><br><small>Contorno aproximado, solo de referencia.</small>`).addTo(map); });
  renderVolcanes();
  cargarCorredores();
  cargarSismos();
  cargarRadar().then(() => { if (on.radar) revisarRadar(false); notaLluvia(); });
  if (on.imerg) cargarImerg();
  setInterval(cargarCorredores, 20 * 60000);
  setInterval(cargarSismos, 10 * 60000);
  setInterval(cargarRadar, 10 * 60000);
});

// ---------- corredores + alertas ----------
// v1.24.1: rutas y pronóstico se piden apenas abre la página, en paralelo con el mapa base
let preCorr = getJ("rutas.json").then(async (R) => { RUTAS = RUTAS || R; const ms = []; for (const k of Object.keys(R)) for (const m of muestrear(R[k].pts, 14)) ms.push({ k, ...m });
  const KEY = "ojocr.fx.v1"; try { const c = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (c && Date.now() - c.t < 15 * 60000 && c.n === ms.length) return c.fx; } catch { /* */ }
  const fx = await pronostico(ms.map((m) => m.pt)); try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), n: ms.length, fx })); } catch { /* */ } return fx; });
preCorr.catch(() => {});
async function cargarCorredores() {
  try {
    if (!RUTAS) RUTAS = await getJ("rutas.json");
    if (preCorr) { const p = preCorr; preCorr = null; try { await p; } catch { /* se reintenta abajo */ } }
    const ks = Object.keys(RUTAS);
    map.getSource("corr").setData(fc(ks.map((k) => ({ type: "Feature", properties: { k, c: RUTAS[k].c, n: RUTAS[k].n }, geometry: { type: "LineString", coordinates: RUTAS[k].pts } }))));
    map.getSource("corr-lbl").setData(fc(ks.map((k) => { const p = RUTAS[k].pts; return { type: "Feature", properties: { n: k, c: RUTAS[k].c }, geometry: { type: "Point", coordinates: p[Math.floor(p.length * 0.45)] } }; })));
    // muestreo para el pronóstico
    const muestras = []; for (const k of ks) for (const m of muestrear(RUTAS[k].pts, 14)) muestras.push({ k, ...m });
    // se guarda 15 min en este equipo para no repetir la consulta al recargar
    let fx = null; const KEY = "ojocr.fx.v1";
    try { const c = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (c && Date.now() - c.t < 15 * 60000 && c.n === muestras.length) fx = c.fx; } catch { /* */ }
    if (!fx) { fx = await pronostico(muestras.map((m) => m.pt)); try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), n: muestras.length, fx })); } catch { /* */ } }
    const ahora = Date.now() - 30 * 60000, fin = Date.now() + 6 * 3600000;
    const feats = []; alertasPorRuta = [];
    for (const k of ks) {
      const ms = muestras.map((m, j) => ({ ...m, f: fx[j] })).filter((m) => m.k === k);
      const lugares = [...RUTAS[k].lugares, ...LUGARES_EXTRA];
      for (const m of ms) {
        m.hs = m.f.filter((h) => h.t >= ahora && h.t <= fin).map((h) => ({ ...h, lv: nivel(h.p, h.mm, h.code) }));
        m.lv = Math.max(0, ...m.hs.map((h) => h.lv));
        m.lugar = cercaDe(m.pt, lugares);
      }
      // segmentos coloreados entre muestras
      for (let j = 0; j < ms.length - 1; j++) {
        const a = ms[j], b = ms[j + 1], lv = Math.max(a.lv, b.lv);
        feats.push({ type: "Feature", properties: { c: COL[lv], lv, txt: segTxt(k, a, b) }, geometry: { type: "LineString", coordinates: RUTAS[k].pts.slice(a.i, b.i + 1) } });
      }
      // alertas: tramos seguidos con riesgo
      let g = null; const grupos = [];
      for (const m of ms) { if (m.lv > 0) { if (!g) grupos.push((g = [])); g.push(m); } else g = null; }
      for (const gr of grupos) {
        const worst = gr.reduce((a, b) => (b.lv > a.lv || (b.lv === a.lv && Math.max(...b.hs.map((h) => h.mm)) > Math.max(...a.hs.map((h) => h.mm))) ? b : a));
        const hs = gr.flatMap((m) => m.hs.filter((h) => h.lv === worst.lv)); // franja horaria del peor nivel
        const t0 = Math.min(...hs.map((h) => h.t)), t1 = Math.max(...hs.map((h) => h.t)) + 3600000;
        const pk = hs.reduce((a, b) => (b.mm > a.mm ? b : a));
        const code = Math.max(...hs.map((h) => h.code));
        alertasPorRuta.push({ k, lv: worst.lv, lugar: worst.lugar.replace(/^cerca de /, ""), t0, t1, mm: pk.mm, p: Math.max(...hs.map((h) => h.p)), code, pt: worst.pt, tramo: gr.length > 1 ? `${Math.round(gr[0].km)}–${Math.round(gr[gr.length - 1].km)} km` : `km ${Math.round(worst.km)}` });
      }
    }
    map.getSource("corr-risk").setData(fc(feats));
    renderAlertas();
  } catch (e) {
    console.warn(e);
    $("#alertas").innerHTML = `<p class="note">El pronóstico no respondió a tiempo. Se reintenta en 1 minuto.</p>`;
    setTimeout(cargarCorredores, 60000);
  }
}
function franja(t0, t1) { const a = horaH(t0), b = horaH(t1); if (a === b) return a; const sa = a.match(/[ap]\. m\./)?.[0], sb = b.match(/[ap]\. m\./)?.[0]; return sa && sa === sb ? `${a.replace(/\s*[ap]\. m\./, "")}–${b}` : `${a}–${b}`; }
function segTxt(k, a, b) {
  const lv = Math.max(a.lv, b.lv); const hs = [...a.hs, ...b.hs].filter((h) => h.lv === lv && lv > 0);
  const base = `<b>${esc(RUTAS[k].n)}</b><br>${esc(a.lugar)} → ${esc(b.lugar)}<br>`;
  if (!lv) return base + "Sin lluvia importante en las próximas 6 h.<br><small>Pronóstico Open-Meteo</small>";
  const t0 = Math.min(...hs.map((h) => h.t)), t1 = Math.max(...hs.map((h) => h.t)) + 3600000, mm = Math.max(...hs.map((h) => h.mm)), p = Math.max(...hs.map((h) => h.p));
  return base + `${texto(lv, Math.max(...hs.map((h) => h.code)), mm)} · ${franja(t0, t1)}<br><small>Hasta ${mmf(mm)} mm/h · prob. ${p} % · pronóstico Open-Meteo</small>`;
}
function popSeg(p, ll) { if (!p.txt) return; new maplibregl.Popup({ maxWidth: "280px" }).setLngLat(ll).setHTML(p.txt).addTo(map); }
function renderAlertas() {
  const a = alertasPorRuta.slice().sort((x, y) => y.lv - x.lv || x.t0 - y.t0);
  $("#n-alertas").textContent = a.filter((x) => x.lv === 2).length || "";
  if (!a.length) { $("#alertas").innerHTML = `<div class="item"><span class="dot v"></span><div><b>Sin alertas de lluvia en los corredores</b><small>Próximas 6 horas · actualizado ${hora(Date.now())}</small></div></div>`; return; }
  $("#alertas").innerHTML = `<ul class="list">${a.map((x, i) => `<li class="item" data-i="${i}"><span class="dot ${CL[x.lv]}"></span><div><b>${esc(texto(x.lv, x.code, x.mm))} en Ruta ${esc(x.k)} · ${esc(x.lugar)} · ${esc(franja(x.t0, x.t1))}</b><small>${esc(RUTAS[x.k].n)} · tramo ${esc(x.tramo)} · hasta ${mmf(x.mm)} mm/h · prob. ${x.p} %</small></div></li>`).join("")}</ul><p class="note">Actualizado: ${hora(Date.now())}</p>`;
  $("#alertas").querySelectorAll(".item[data-i]").forEach((li) => li.addEventListener("click", () => { const x = a[+li.dataset.i]; volar(x.pt, 10.5); }));
}

// ---------- sismos (USGS + RSN) ----------
let SIS = [];
const MESES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
function rsnParse(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml"); const out = [];
  for (const it of doc.querySelectorAll("item")) {
    const title = it.querySelector("title")?.textContent || "", html = it.querySelector("description")?.textContent || "", link = it.querySelector("link")?.textContent || "";
    const txt = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const mag = parseFloat((title.match(/Mag:\s*([\d,\.]+)/) || txt.match(/Magnitud:\s*([\d,\.]+)/) || [])[1]?.replace(",", "."));
    const co = txt.match(/Coordenadas:\s*(-?[\d,]+)\s*y\s*(-?[\d,]+)/);
    if (!co || !isFinite(mag)) continue;
    const lat = parseFloat(co[1].replace(",", ".")), lng = parseFloat(co[2].replace(",", "."));
    const f = txt.match(/Fecha:\s*(\d+)\s+de\s+(\w+)\s+del?\s+(\d{4})/i), h = txt.match(/Hora Local:\s*(\d+):(\d+)\s*([ap])/i);
    let t = Date.parse(it.querySelector("pubDate")?.textContent || "") || Date.now();
    if (f && h && MESES[f[2].toLowerCase()] != null) { let hh = +h[1] % 12 + (h[3].toLowerCase() === "p" ? 12 : 0); t = Date.UTC(+f[3], MESES[f[2].toLowerCase()], +f[1], hh + 6, +h[2]); }
    const lugar = (txt.match(/Localizaci[oó]n:\s*(.+?)\s+Coordenadas/) || [])[1] || "";
    const prof = parseFloat((txt.match(/Profundidad:\s*([\d,\.]+)/) || [])[1]?.replace(",", "."));
    const sentido = /SENTIDO/i.test(title) ? ((txt.match(/Sentido en:\s*(.+?)\s+Origen/) || [])[1] || "sí") : "";
    out.push({ src: "RSN", mag, lat, lng, t, lugar, prof, sentido, link });
  }
  return out;
}
async function cargarSismos() {
  const start = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19);
  const [u, r] = await Promise.allSettled([
    getJ(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}&minlatitude=7.5&maxlatitude=11.6&minlongitude=-86.6&maxlongitude=-82.4&minmagnitude=2.5&orderby=time&limit=200`),
    getJ("https://rsn.ucr.ac.cr/actividad-sismica/ultimos-sismos?format=feed&type=rss", 15000, true),
  ]);
  const usgs = u.status === "fulfilled" ? u.value.features.map((f) => ({ src: "USGS", mag: f.properties.mag, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], prof: f.geometry.coordinates[2], t: f.properties.time, lugar: f.properties.place || "", link: f.properties.url })) : [];
  const rsn = r.status === "fulfilled" ? rsnParse(r.value) : [];
  // une el mismo sismo de las dos fuentes (±3 min y ±60 km): se queda con la RSN (local) y anota ambas
  const all = [...rsn];
  for (const e of usgs) { const d = all.find((x) => x.src.startsWith("RSN") && Math.abs(x.t - e.t) < 180000 && km([x.lng, x.lat], [e.lng, e.lat]) < 60); if (d) { d.src = "RSN + USGS"; d.usgs = e.link; } else all.push(e); }
  SIS = all.filter((e) => Date.now() - e.t < 7 * 864e5 + 3600000).sort((a, b) => b.t - a.t);
  const fuentes = `${u.status === "fulfilled" ? "USGS ✓" : "USGS sin respuesta"} · ${r.status === "fulfilled" ? "RSN ✓" : "RSN sin respuesta"}`;
  if (map.getSource("sis")) map.getSource("sis").setData(fc(SIS.map((e, i) => ({ type: "Feature", properties: { i, m: e.mag, nuevo: Date.now() - e.t < 864e5 }, geometry: { type: "Point", coordinates: [e.lng, e.lat] } }))));
  const d24 = SIS.filter((e) => Date.now() - e.t < 864e5);
  $("#n-sismos").textContent = d24.length || "";
  $("#sismos").innerHTML = (SIS.length ? `<ul class="list">${SIS.slice(0, 40).map((e, i) => `<li class="item" data-i="${i}"><span class="mag ${e.mag >= 4 ? "hi" : ""}">M${mmf(e.mag)}</span><div><b>${esc(e.lugar || "Costa Rica")}</b><small>${esc(new Date(e.t).toLocaleString("es-CR", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))} · ${hace(e.t)}${isFinite(e.prof) ? " · " + Math.round(e.prof) + " km de prof." : ""} · ${esc(e.src)}${e.sentido ? " · sentido" : ""}</small></div></li>`).join("")}</ul>` : `<p class="note">Sin sismos M ≥ 2,5 en la región en los últimos 7 días.</p>`) + `<p class="note">${fuentes} · actualizado ${hora(Date.now())}</p>`;
  $("#sismos").querySelectorAll(".item[data-i]").forEach((li) => li.addEventListener("click", () => { const e = SIS[+li.dataset.i]; volar([e.lng, e.lat], 8.5); popSis(+li.dataset.i); }));
  const fuerte = d24.filter((e) => e.mag >= 4).sort((a, b) => b.mag - a.mag)[0];
  const b = $("#banner");
  if (fuerte && cargarSismos.visto !== fuerte.t) {
    b.innerHTML = `<b>SISMO M${mmf(fuerte.mag)}</b><span>${esc(fuerte.lugar || "Costa Rica")} · ${hace(fuerte.t)} · ${esc(fuerte.src)}</span><span aria-hidden="true">›</span>`;
    b.hidden = false; b.onclick = () => { cargarSismos.visto = fuerte.t; b.hidden = true; volar([fuerte.lng, fuerte.lat], 8); popSis(SIS.indexOf(fuerte)); tab("sismos"); };
  } else b.hidden = true;
}
function popSis(i) {
  const e = SIS[i]; if (!e) return;
  new maplibregl.Popup({ maxWidth: "300px" }).setLngLat([e.lng, e.lat]).setHTML(`<b>SISMO M${mmf(e.mag)}</b><br>${esc(e.lugar)}<br>${esc(new Date(e.t).toLocaleString("es-CR", { timeZone: TZ }))} (${hace(e.t)})${isFinite(e.prof) ? "<br>Profundidad " + Math.round(e.prof) + " km" : ""}${e.sentido ? "<br>Sentido en: " + esc(e.sentido) : ""}<br><small>Fuente: ${esc(e.src)}${e.link ? ` · <a href="${esc(e.link)}" target="_blank" rel="noopener">informe</a>` : ""}</small><br>${earthA(e.lat, e.lng, 60000, 0, "🌍 Ver la zona en Google Earth 3D ↗")}`).addTo(map);
}

// ---------- volcanes (información fija) ----------
function renderVolcanes() {
  $("#volcanes").innerHTML = VOLC.map((v, i) => `<div class="vol" data-i="${i}"><b>▲ ${esc(v.n.toUpperCase())}</b> <small class="note">${esc(v.alt)}</small><p>${esc(v.d)}</p><p><span class="est">INFO FIJA</span> Estado actual: <a href="https://www.ovsicori.una.ac.cr/" target="_blank" rel="noopener">consultar OVSICORI</a></p></div>`).join("");
  $("#volcanes").querySelectorAll(".vol").forEach((d) => d.addEventListener("click", (ev) => { if (ev.target.closest("a")) return; const v = VOLC[+d.dataset.i]; volar([v.lng, v.lat], 10.5); popVol(+d.dataset.i); }));
}
function popVol(i) { const v = VOLC[i]; new maplibregl.Popup({ maxWidth: "290px" }).setLngLat([v.lng, v.lat]).setHTML(`<b>▲ VOLCÁN ${esc(v.n.toUpperCase())}</b> · ${esc(v.alt)}<br>${esc(v.d)}<br><small>Información fija, no es el estado en vivo. <a href="https://www.ovsicori.una.ac.cr/" target="_blank" rel="noopener">Estado oficial en OVSICORI</a></small><br>${earthA(v.lat, v.lng, 9000, parseInt(v.alt) || 0)}`).addTo(map); }

// ---------- radar (RainViewer) ----------
async function cargarRadar() {
  try {
    const j = await getJ("https://api.rainviewer.com/public/weather-maps.json");
    const f = j.radar && j.radar.past && j.radar.past[j.radar.past.length - 1]; if (!f) return;
    const url = j.host + f.path + "/256/{z}/{x}/{y}/2/1_1.png";
    radarTime = f.time * 1000;
    if (url === radarUrl) return; radarUrl = url;
    if (map.getLayer("radar")) map.removeLayer("radar"); if (map.getSource("radar")) map.removeSource("radar");
    map.addSource("radar", { type: "raster", tiles: [url], tileSize: 256, maxzoom: 7, attribution: "Radar © RainViewer" });
    map.addLayer({ id: "radar", type: "raster", source: "radar", layout: { visibility: on.radar ? "visible" : "none" }, paint: { "raster-opacity": 0.72 } }, "areas");
    const chip = document.querySelector('[data-capa="radar"]'); chip.title = "Radar de " + hora(radarTime);
  } catch (e) { console.warn("radar", e); }
}

// ---------- capas ----------
function aplicarCapas() {
  const vis = (id, v) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v ? "visible" : "none"); };
  ["corr-glow", "corr-case", "corr", "corr-risk", "corr-lbl"].forEach((id) => vis(id, on.corr));
  vis("radar", on.radar); vis("imerg", on.imerg); vis("sis", on.sis); vis("sis-halo", on.sis); vis("vol", on.vol); vis("esri", on.sat);
}
document.querySelectorAll(".chip[data-capa]").forEach((b) => {
  b.setAttribute("aria-pressed", String(!!on[b.dataset.capa]));
  b.addEventListener("click", () => {
    const k = b.dataset.capa; on[k] = !on[k]; b.setAttribute("aria-pressed", String(on[k])); aplicarCapas(); guardarCapas();
    if (k === "radar" && on.radar) revisarRadar(true);
    if (k === "imerg" && on.imerg && !map.getSource("imerg")) cargarImerg();
    notaLluvia();
  });
});
function marcarCapa(k, v) { on[k] = v; const b = document.querySelector(`.chip[data-capa="${k}"]`); if (b) b.setAttribute("aria-pressed", String(v)); aplicarCapas(); guardarCapas(); notaLluvia(); }

// ---------- v1.24.2: radar vacío + respaldo por satélite (NASA GIBS · GPM IMERG, 30 min) ----------
let imergTime = null, radarVacio = null;
async function cargarImerg() {
  try {
    const dia = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    const xml = await getJ(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/IMERG_Precipitation_Rate_30min/default/GoogleMapsCompatible_Level6/all/${dia}T00:00:00Z.xml`, 15000, true);
    const fin = (xml.match(/<Domain>[^<]*\/([^/<]+Z)\/PT30M<\/Domain>/) || [])[1]; if (!fin) throw Error("sin hora");
    imergTime = Date.parse(fin);
    if (map.getLayer("imerg")) map.removeLayer("imerg"); if (map.getSource("imerg")) map.removeSource("imerg");
    map.addSource("imerg", { type: "raster", tiles: [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/${fin}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`], tileSize: 256, maxzoom: 6, attribution: "Lluvia por satélite: NASA GIBS · GPM IMERG" });
    map.addLayer({ id: "imerg", type: "raster", source: "imerg", layout: { visibility: on.imerg ? "visible" : "none" }, paint: { "raster-opacity": 0.75, "raster-resampling": "linear" } }, map.getLayer("radar") ? "radar" : "areas");
    document.querySelector('[data-capa="imerg"]').title = "Lluvia estimada por satélite, " + hora(imergTime);
  } catch (e) { console.warn("imerg", e); imergTime = null; }
  notaLluvia();
}
// ¿las teselas de radar de la zona visible vienen todas transparentes?
async function radarTodoVacio() {
  if (!radarUrl) return null;
  const z = Math.max(5, Math.min(7, Math.floor(map.getZoom()))), b = map.getBounds(), n = 2 ** z;
  const tx = (lng) => Math.floor((lng + 180) / 360 * n), ty = (lat) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
  const W = Math.max(b.getWest(), -86.6), E = Math.min(b.getEast(), -82.4), N = Math.min(b.getNorth(), 11.6), S = Math.max(b.getSouth(), 7.5);
  const ts = []; for (let x = tx(W); x <= tx(E); x++) for (let y = ty(N); y <= ty(S); y++) ts.push([x, y]);
  const cv = new OffscreenCanvas(256, 256), cx = cv.getContext("2d", { willReadFrequently: true });
  let leidas = 0;
  for (const [x, y] of ts.slice(0, 12)) {
    try {
      const r = await fetch(radarUrl.replace("{z}", z).replace("{x}", x).replace("{y}", y)); if (!r.ok) continue;
      const im = await createImageBitmap(await r.blob()); cx.clearRect(0, 0, 256, 256); cx.drawImage(im, 0, 0); leidas++;
      const d = cx.getImageData(0, 0, 256, 256).data; for (let i = 3; i < d.length; i += 16) if (d[i] > 8) return false;
    } catch { /* */ }
  }
  return leidas ? true : null;
}
async function revisarRadar(aviso) {
  if (!on.radar) return;
  radarVacio = await radarTodoVacio();
  if (radarVacio && !on.imerg) { if (!map.getSource("imerg")) await cargarImerg(); if (imergTime) { marcarCapa("imerg", true); if (aviso) toast("El radar no ve lluvia aquí: se agregó la lluvia estimada por satélite (NASA IMERG).", 4200); } }
  notaLluvia();
}
map.on("moveend", () => { clearTimeout(revisarRadar.t); if (on.radar) revisarRadar.t = setTimeout(() => revisarRadar(false), 900); });
function notaLluvia() {
  const el = $("#nota-lluvia"); const l = [];
  if (on.radar) l.push(!radarTime ? "Radar no disponible ahora." : radarVacio ? `Radar RainViewer de ${hora(radarTime)}: <b>El radar no detecta lluvia aquí ahora o no hay cobertura</b>.` : `Radar RainViewer de ${hora(radarTime)} (cobertura en CR limitada).`);
  if (on.imerg) l.push(imergTime ? `Lluvia estimada por satélite NASA IMERG de ${hora(imergTime)} (${Math.max(1, Math.round((Date.now() - imergTime) / 3600000))} h de retraso; no es radar).` : "Lluvia por satélite no disponible ahora.");
  el.innerHTML = l.join("<br>"); el.hidden = !l.length;
}
function cerrarPopups() { document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove()); }
// el mapa ya tiene padding fijo por el panel (pad()), así que volar/encuadrar centran en la parte visible
function volar(pt, z) { cerrarPopups(); map.flyTo({ center: pt, zoom: z, speed: 1.4, essential: true, }); if (innerWidth < 900) $("#panel").classList.add("min"); }

// ---------- pestañas ----------
function tab(t) {
  document.querySelectorAll(".tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === t)));
  document.querySelectorAll(".sec").forEach((s) => (s.hidden = s.id !== "s-" + t));
  $("#panel").classList.remove("min");
}
document.querySelectorAll(".tabs [role=tab]").forEach((b) => b.addEventListener("click", () => tab(b.dataset.t)));
$("#handle").addEventListener("click", () => $("#panel").classList.toggle("min"));

// ---------- Mi ruta de hoy ----------
const sel = { o: null, d: null }; let salidaH = 0, ultimaBusq = 0;
async function buscar(k) {
  const q = $("#" + k).value.trim(); if (q.length < 3) { toast("Escriba al menos 3 letras."); return; }
  const espera = Math.max(0, 1100 - (Date.now() - ultimaBusq)); if (espera) await new Promise((r) => setTimeout(r, espera)); // política de Nominatim: máx. 1 por segundo
  ultimaBusq = Date.now();
  const box = $("#" + k + "-res"); box.innerHTML = `<div class="skel" style="height:34px"></div>`;
  try {
    const r = await getJ(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=cr&limit=5&accept-language=es&q=${encodeURIComponent(q)}`);
    const vistos = new Set(); for (let i = r.length - 1; i >= 0; i--) { if (vistos.has(r[i].display_name)) r.splice(i, 1); else vistos.add(r[i].display_name); }
    r.reverse(); const v2 = new Set(); for (let i = r.length - 1; i >= 0; i--) { if (v2.has(r[i].display_name)) r.splice(i, 1); else v2.add(r[i].display_name); } r.reverse();
    if (!r.length) { box.innerHTML = `<p class="note">Sin resultados. Pruebe con otro nombre.</p>`; return; }
    box.innerHTML = r.map((x, i) => `<button type="button" data-i="${i}">${esc(x.display_name)}</button>`).join("");
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { const x = r[+b.dataset.i]; elegir(k, { n: x.display_name.split(",").slice(0, 2).join(","), pt: [+x.lon, +x.lat] }); box.innerHTML = ""; }));
  } catch (e) { box.innerHTML = `<p class="note">La búsqueda no respondió (${esc(e.message)}).</p>`; }
}
function elegir(k, v) { sel[k] = v; $("#" + k + "-ok").textContent = (k === "o" ? "Origen: " : "Destino: ") + v.n; $("#" + k).value = v.n; $("#calc").disabled = !(sel.o && sel.d); }
for (const k of ["o", "d"]) { $("#" + k + "-b").addEventListener("click", () => buscar(k)); $("#" + k).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); buscar(k); } }); }
$("#o-yo").addEventListener("click", () => {
  if (!navigator.geolocation) { toast("Este navegador no da la ubicación."); return; }
  toast("Buscando su ubicación (solo en este equipo)…");
  navigator.geolocation.getCurrentPosition((p) => elegir("o", { n: "Mi ubicación", pt: [p.coords.longitude, p.coords.latitude] }), () => toast("No se pudo obtener la ubicación."), { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
});
$("#salida").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { salidaH = +b.dataset.h; $("#salida").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
$("#calc").addEventListener("click", calcular);
async function calcular() {
  if (!sel.o || !sel.d) return;
  const out = $("#ruta-out"); out.innerHTML = `<div class="skel"></div><div class="skel"></div>`; $("#calc").disabled = true;
  try {
    const r = await getJ(`https://router.project-osrm.org/route/v1/driving/${sel.o.pt.join(",")};${sel.d.pt.join(",")}?overview=full&geometries=geojson`, 20000);
    if (r.code !== "Ok" || !r.routes.length) throw Error("sin ruta");
    const rt = r.routes[0], line = rt.geometry.coordinates, dist = rt.distance / 1000, dur = rt.duration;
    map.getSource("miruta").setData(fc([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }]));
    const paso = Math.max(5, dist / 24), ms = muestrear(line, paso);
    const salida = Date.now() + salidaH * 3600000;
    const fx = await pronostico(ms.map((m) => m.pt));
    const lugares = LUGARES_EXTRA.concat(...Object.values(RUTAS || {}).map((x) => x.lugares));
    ms.forEach((m, j) => {
      m.eta = salida + dur * 1000 * (m.km / Math.max(dist, 0.01));
      const h = fx[j].reduce((a, b) => (Math.abs(b.t + 1800000 - m.eta) < Math.abs(a.t + 1800000 - m.eta) ? b : a));
      m.h = h; m.lv = nivel(h.p, h.mm, h.code); m.lugar = cercaDe(m.pt, lugares);
    });
    const feats = []; for (let j = 0; j < ms.length - 1; j++) { const a = ms[j], b = ms[j + 1], lv = Math.max(a.lv, b.lv); const w = lv === b.lv ? b : a;
      feats.push({ type: "Feature", properties: { c: COL[lv], txt: `<b>Mi ruta · km ${Math.round(a.km)}–${Math.round(b.km)}</b><br>${esc(a.lugar)}<br>Paso estimado ≈ ${hora(a.eta)}<br>${lv ? texto(lv, w.h.code, w.h.mm) : "Sin lluvia importante"} · ${mmf(w.h.mm)} mm/h · prob. ${w.h.p} %<br><small>Pronóstico Open-Meteo · hora estimada sin tráfico</small>` }, geometry: { type: "LineString", coordinates: line.slice(a.i, b.i + 1) } }); }
    map.getSource("miruta-risk").setData(fc(feats));
    map.getSource("mipts").setData(fc([{ type: "Feature", properties: { c: "#22ff9a" }, geometry: { type: "Point", coordinates: line[0] } }, { type: "Feature", properties: { c: "#ff3b5c" }, geometry: { type: "Point", coordinates: line[line.length - 1] } }]));
    const b = new maplibregl.LngLatBounds(line[0], line[0]); line.forEach((p) => b.extend(p));
    cerrarPopups();
    try { map.fitBounds(b, { padding: innerWidth >= 900 ? { left: 30, right: 60, top: 100, bottom: 50 } : { top: 120, left: 24, right: 24, bottom: 16 }, duration: 900, maxZoom: 12 }); } catch { /* */ }
    const max = Math.max(...ms.map((m) => m.lv)), riesgos = ms.filter((m) => m.lv > 0);
    const hm = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
    const mid = medioRuta(line), zw = Math.max(8, Math.min(15, 14.5 - Math.log2(Math.max(1, mid.tot) / 3)));
    const dst = line[line.length - 1];
    out.innerHTML = `<div class="wz"><a class="btn waze" href="https://waze.com/ul?ll=${dst[1].toFixed(5)},${dst[0].toFixed(5)}&navigate=yes" target="_blank" rel="noopener">Abrir en Waze ↗</a><button type="button" class="btn" id="ver-traf">Ver tráfico de esta ruta</button><a class="btn waze" href="${earthUrl(mid.pt[1], mid.pt[0], Math.min(400000, mid.tot * 900), 0)}" target="_blank" rel="noopener">🌍 Ruta en Google Earth 3D ↗</a></div><div class="sum"><div><small>DISTANCIA</small><b>${dist.toFixed(dist < 20 ? 1 : 0)} km</b></div><div><small>TIEMPO <span class="est">EST.</span></small><b>${hm(dur)}</b></div><div><small>RIESGO LLUVIA</small><b style="color:${COL[max]}">${["BAJO", "MEDIO", "ALTO"][max]}</b></div></div>
      <p class="note">Salida ${hora(salida)} · llegada estimada ${hora(salida + dur * 1000)} (sin tráfico, sin paradas).</p>
      ${riesgos.length ? `<ul class="list">${riesgos.map((m) => `<li class="item" data-lng="${m.pt[0]}" data-lat="${m.pt[1]}"><span class="dot ${CL[m.lv]}"></span><div><b>≈ ${hora(m.eta)} · ${esc(m.lugar)}</b><small>km ${Math.round(m.km)} · ${texto(m.lv, m.h.code, m.h.mm)} · ${mmf(m.h.mm)} mm/h · prob. ${m.h.p} %</small></div></li>`).join("")}</ul>` : `<div class="item"><span class="dot v"></span><div><b>Sin lluvia importante en el camino</b><small>Según el pronóstico para la hora estimada de paso.</small></div></div>`}`;
    try { sessionStorage.setItem("ojocr.ruta.v1", JSON.stringify({ o: sel.o, d: sel.d, h: salidaH })); } catch { /* */ }
    out.querySelector("#ver-traf").addEventListener("click", () => trafico(mid.pt[1], mid.pt[0], zw, `Mi ruta: ${sel.o.n} → ${sel.d.n}`));
    if (innerWidth < 900) { const sc = out.closest(".body"); sc.scrollTo({ top: out.offsetTop - sc.offsetTop - 8, behavior: "smooth" }); }
    out.querySelectorAll(".item[data-lng]").forEach((li) => li.addEventListener("click", () => volar([+li.dataset.lng, +li.dataset.lat], 11)));
  } catch (e) { out.innerHTML = `<p class="note">No pude calcular la ruta (${esc(e.message)}). El servidor público de OSRM a veces se satura; intente de nuevo.</p>`; }
  finally { $("#calc").disabled = !(sel.o && sel.d); }
}
// muestra de prueba: ?ruta=1 precarga Alajuela → Limón
if (/[?&]ruta=1/.test(location.search)) { elegir("o", { n: "Alajuela centro", pt: [-84.2142, 10.0163] }); elegir("d", { n: "Puerto Limón", pt: [-83.0332, 9.9907] }); }

// ---------- Tráfico en vivo de Waze (iframe oficial, panel aparte) ----------
const WZ = {
  gam: ["GAM (San José)", 9.933, -84.08, 12], alajuela: ["Alajuela", 10.016, -84.214, 13], r27: ["Ruta 27", 9.92, -84.35, 11],
  r32: ["Ruta 32 · Zurquí", 10.06, -84.01, 12], r1: ["Ruta 1 · Naranjo", 10.1, -84.39, 12], cartago: ["Cartago", 9.864, -83.919, 13],
  limon: ["Limón", 9.99, -83.03, 13], liberia: ["Liberia", 10.635, -85.437, 13], pz: ["Pérez Zeledón", 9.375, -83.705, 13],
};
const wzUrl = (lat, lon, z, pin = true) => `https://embed.waze.com/es/iframe?zoom=${Math.max(3, Math.min(17, Math.round(z)))}&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}${pin ? "&pin=1" : ""}`;
function trafico(lat = WZ.alajuela[1], lon = WZ.alajuela[2], z = WZ.alajuela[3], nombre = WZ.alajuela[0], key = lat === WZ.alajuela[1] && lon === WZ.alajuela[2] ? "alajuela" : "") {
  const sec = $("#trafico"); sec.hidden = false;
  $("#tr-load").hidden = false;
  $("#tr-if").src = wzUrl(lat, lon, z);
  $("#tr-sub").textContent = nombre;
  $("#tr-go").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === key)));
  $("#tr-x").focus({ preventScroll: true });
}
$("#tr-if").addEventListener("load", () => { if ($("#tr-if").src.startsWith("https:")) setTimeout(() => ($("#tr-load").hidden = true), 1200); });
$("#gs-if").addEventListener("load", () => { if ($("#gs-if").src.startsWith("https:")) $("#gs-load").hidden = true; });
function cerrarTrafico() { $("#trafico").hidden = true; $("#tr-if").src = "about:blank"; }
$("#traf-chip").addEventListener("click", () => trafico());
$("#traf-tab").addEventListener("click", () => trafico());
$("#tr-x").addEventListener("click", cerrarTrafico);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#trafico").hidden) cerrarTrafico(); });
$("#tr-go").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
  const k = b.dataset.p;
  if (k === "yo") {
    if (!navigator.geolocation) { toast("Este navegador no da la ubicación."); return; }
    toast("Buscando su ubicación (solo en este equipo)…");
    navigator.geolocation.getCurrentPosition((p) => trafico(p.coords.latitude, p.coords.longitude, 14, "Mi ubicación", "yo"), () => toast("No se pudo obtener la ubicación."), { timeout: 12000, maximumAge: 120000 });
    return;
  }
  const [n, lat, lon, z] = WZ[k]; trafico(lat, lon, z, n, k);
}));
// punto medio (por distancia) y zoom adecuado para ver una ruta en Waze
function medioRuta(line) {
  let tot = 0; const seg = []; for (let i = 1; i < line.length; i++) { const d = km(line[i - 1], line[i]); seg.push(d); tot += d; }
  let acc = 0; for (let i = 0; i < seg.length; i++) { if (acc + seg[i] >= tot / 2) return { pt: line[i + 1], tot }; acc += seg[i]; }
  return { pt: line[line.length - 1], tot };
}

// ---------- Google Earth / Satélite Google (solo enlaces oficiales y el embed sin clave) ----------
// vista 3D inclinada: @LAT,LON,ALTa,DISTd,35y,0h,45t,0r
function earthUrl(lat, lon, dist = 6000, alt = 0) { return `https://earth.google.com/web/@${(+lat).toFixed(5)},${(+lon).toFixed(5)},${Math.round(alt)}a,${Math.round(Math.max(300, dist))}d,35y,0h,45t,0r`; }
const earthA = (lat, lon, dist, alt, txt = "🌍 Abrir en Google Earth 3D ↗") => `<a class="earth-a" href="${earthUrl(lat, lon, dist, alt)}" target="_blank" rel="noopener">${txt}</a>`;
const zoomADist = (z) => Math.round(40000000 / 2 ** z * 1.2); // distancia de cámara aproximada para un zoom de MapLibre
$("#earth-chip").addEventListener("click", () => { const c = map.getCenter(); window.open(earthUrl(c.lat, c.lng, zoomADist(map.getZoom())), "_blank", "noopener"); });
const GS = { ...WZ, poas: ["Volcán Poás", 10.2, -84.233, 14], turrialba: ["Volcán Turrialba", 10.025, -83.767, 14], rincon: ["Volcán Rincón de la Vieja", 10.83, -85.324, 13] };
const GS_ALT = { poas: 2600, turrialba: 3200, rincon: 1800 };
let gs = { lat: 9.98, lon: -84.15, z: 11, t: "k", n: "Alajuela / GAM", key: "" };
const gsEmbed = () => `https://maps.google.com/maps?q=${gs.lat.toFixed(5)},${gs.lon.toFixed(5)}&t=${gs.t}&z=${Math.max(3, Math.min(20, Math.round(gs.z)))}&output=embed`;
function satGoogle(lat = gs.lat, lon = gs.lon, z = gs.z, n = gs.n, key = "") {
  gs = { ...gs, lat, lon, z, n, key };
  $("#gsat").hidden = false;
  $("#gs-load").hidden = false;
  $("#gs-if").src = gsEmbed();
  $("#gs-sub").textContent = n;
  $("#gs-earth").href = earthUrl(lat, lon, Math.max(3000, zoomADist(z)), GS_ALT[key] || 0);
  $("#gs-maps").href = `https://www.google.com/maps/@${lat.toFixed(5)},${lon.toFixed(5)},${Math.round(zoomADist(z) / 2.5)}m/data=!3m1!1e3`;
  $("#gs-go").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === key)));
  $("#gs-k").setAttribute("aria-pressed", String(gs.t === "k")); $("#gs-h").setAttribute("aria-pressed", String(gs.t === "h"));
}
function cerrarSat() { $("#gsat").hidden = true; $("#gs-if").src = "about:blank"; }
$("#gsat-chip").addEventListener("click", () => { const c = map.getCenter(); satGoogle(c.lat, c.lng, Math.max(10, Math.round(map.getZoom() + 1)), "Centro del mapa"); });
$("#gs-x").addEventListener("click", cerrarSat);
$("#gs-k").addEventListener("click", () => { gs.t = "k"; satGoogle(); });
$("#gs-h").addEventListener("click", () => { gs.t = "h"; satGoogle(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#gsat").hidden) cerrarSat(); });
$("#gs-go").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
  const k = b.dataset.p;
  if (k === "yo") {
    if (!navigator.geolocation) { toast("Este navegador no da la ubicación."); return; }
    toast("Buscando su ubicación (solo en este equipo)…");
    navigator.geolocation.getCurrentPosition((p) => satGoogle(p.coords.latitude, p.coords.longitude, 17, "Mi ubicación", "yo"), () => toast("No se pudo obtener la ubicación."), { timeout: 12000, maximumAge: 120000 });
    return;
  }
  const [n, lat, lon, z] = GS[k]; satGoogle(lat, lon, Math.min(20, z + 1), n, k);
}));
// clic derecho (computadora) o toque largo (teléfono) sobre el mapa: abrir ese punto en Google
function menuPunto(ll, toque = false) {
  cerrarPopups();
  const d = zoomADist(map.getZoom()) / 3;
  new maplibregl.Popup({ maxWidth: "290px", className: "ctx", closeOnClick: !toque }).setLngLat(ll).setHTML(`<b>📍 ${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}</b><br>${earthA(ll.lat, ll.lng, d, 0)}<br><a class="earth-a" href="#" data-gs="${ll.lat},${ll.lng}">🛰 Ver en Satélite Google</a>`).addTo(map);
  const a = document.querySelector('.ctx [data-gs]'); if (a) a.addEventListener("click", (e) => { e.preventDefault(); satGoogle(ll.lat, ll.lng, Math.max(13, Math.round(map.getZoom() + 2)), `${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}`); });
}
map.on("contextmenu", (e) => { e.preventDefault(); menuPunto(e.lngLat); });
{ // toque largo
  let t = null, p0 = null;
  map.on("touchstart", (e) => { clearTimeout(t); const to = e.originalEvent.touches; if (to && to.length !== 1) return; p0 = e.point; const ll = e.lngLat; t = setTimeout(() => { if (navigator.vibrate) navigator.vibrate(20); menuPunto(ll, true); }, 600); });
  map.on("touchmove", (e) => { if (p0 && Math.hypot(e.point.x - p0.x, e.point.y - p0.y) > 10) clearTimeout(t); });
  for (const ev of ["touchend", "touchcancel", "movestart", "zoomstart"]) map.on(ev, () => clearTimeout(t));
}

// ---------- dentro de la app (?app=1): cambio a MUNDO, cerrar, pausa al cerrar ----------
const APP = /[?&]app=1/.test(location.search);
const alPadre = (m) => { try { parent.postMessage(m, location.origin); } catch { /* */ } };
if (APP) {
  document.body.classList.add("app");
  $("#ap-mundo").hidden = false; $("#ap-x").hidden = false;
  // fuera de la barra de capas (que se desplaza y se difumina): siempre visibles
  { const g = document.createElement("div"); g.className = "appg"; g.append($("#ap-mundo"), $("#ap-x")); $("header").append(g); }
  $("#ap-mundo").addEventListener("click", () => alPadre("ojo:mundo"));
  const t0 = performance.now(); // un doble clic sobre «COSTA RICA» del globo no debe cerrar Ojo al aparecer esta página
  $("#ap-x").addEventListener("click", () => { if (performance.now() - t0 > 1200) alPadre("ojo:cerrar"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#trafico").hidden && $("#gsat").hidden && !document.querySelector(".maplibregl-popup")) alPadre("ojo:cerrar"); });
}
addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data !== "ojo:pausa") return;
  // al cerrar o bloquear: se cierran los paneles de Waze/Google y se detiene todo
  try { cerrarTrafico(); cerrarSat(); cerrarPopups(); } catch { /* */ }
  document.body.style.display = "none";
});
{ const h = location.hash.slice(1); if (["alertas", "ruta", "sismos", "volcanes", "fuentes"].includes(h)) tab(h); }

// ---------- v1.24.1 ----------
// mapa base cargado: se quita el aviso de carga
{ const quitar = () => { const c = $("#cargando"); if (!c || c.classList.contains("fuera")) return; c.classList.add("fuera"); setTimeout(() => c.remove(), 450); };
  map.once("load", quitar); setTimeout(quitar, 15000); }
// Mi ruta se recuerda en esta sesión (p. ej. al ir a MUNDO y volver)
{ let g = null; try { g = JSON.parse(sessionStorage.getItem("ojocr.ruta.v1") || "null"); } catch { /* */ }
  if (g && g.o && g.d && !/[?&]ruta=1/.test(location.search)) {
    elegir("o", g.o); elegir("d", g.d);
    if (g.h) { salidaH = g.h; $("#salida").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(+x.dataset.h === g.h))); }
    const ir = () => calcular(); if (map.loaded()) ir(); else map.once("load", () => setTimeout(ir, 0));
  } }
// pestaña activa recordada
document.querySelectorAll(".tabs [role=tab]").forEach((b) => b.addEventListener("click", () => { try { sessionStorage.setItem("ojocr.tab", b.dataset.t); } catch { /* */ } }));
if (!location.hash) { let t = null; try { t = sessionStorage.getItem("ojocr.tab"); } catch { /* */ } if (t && document.querySelector(`.sec#s-${t}`)) tab(t); }
// indicador de «hay más botones» en la barra de capas
{ const c = $(".capas"); const marca = () => { c.classList.toggle("mas", c.scrollLeft + c.clientWidth < c.scrollWidth - 4); c.classList.toggle("menos", c.scrollLeft > 4); };
  c.addEventListener("scroll", marca, { passive: true }); addEventListener("resize", marca); marca(); setTimeout(marca, 500);
  c.addEventListener("wheel", (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && c.scrollWidth > c.clientWidth) { c.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false }); }
