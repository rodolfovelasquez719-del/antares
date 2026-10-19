// v1.24: resumen ligero de Ojo CR para Inicio. Solo datos públicos (Open-Meteo, USGS); nada de ubicación ni personas.
// Usa el mismo muestreo y la misma copia (sessionStorage) que Ojo CR, así que no se repite la consulta.
const TZ = "America/Costa_Rica";
const km = (a, b) => { const R = 6371, dl = (b[1] - a[1]) * Math.PI / 180, dL = (b[0] - a[0]) * Math.PI / 180; const x = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dL / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const nivel = (p, mm, code) => (code >= 95 || mm >= 5 || (p >= 80 && mm >= 3) ? 2 : p >= 50 || mm >= 0.5 || (code >= 61 && code <= 82) ? 1 : 0);
const texto = (lv, code, mm) => (code >= 95 ? "Tormenta eléctrica" : lv === 2 ? "Lluvia fuerte" : mm >= 1 ? "Lluvia moderada" : "Lluvia posible");
const horaH = (d) => new Date(d).toLocaleTimeString("es-CR", { hour: "numeric", timeZone: TZ }).replace(/\s?([ap])\.?\s?m\.?/i, " $1. m.");
function franja(t0, t1) { const a = horaH(t0), b = horaH(t1); if (a === b) return a; const sa = a.match(/[ap]\. m\./)?.[0], sb = b.match(/[ap]\. m\./)?.[0]; return sa && sa === sb ? `${a.replace(/\s*[ap]\. m\./, "")}–${b}` : `${a}–${b}`; }
function muestrear(line, paso) {
  const res = [{ pt: line[0], km: 0, i: 0 }]; let acc = 0, next = paso;
  for (let i = 1; i < line.length; i++) { acc += km(line[i - 1], line[i]); if (acc >= next) { res.push({ pt: line[i], km: acc, i }); next += paso; } }
  const last = line.length - 1; if (res[res.length - 1].i !== last) res.push({ pt: line[last], km: acc, i: last });
  return res;
}
async function getJ(u, ms = 20000) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw Error("HTTP " + r.status); return r.json(); } finally { clearTimeout(t); } }
function cerca(pt, lugares) { let best = "", d = 1e9; for (const [n, lat, lng] of lugares) { const x = km(pt, [lng, lat]); if (x < d) { d = x; best = n; } } return best; }

export async function alertasRutas() {
  const R = await getJ("ojo-cr/rutas.json");
  const ks = Object.keys(R), ms = [];
  for (const k of ks) for (const m of muestrear(R[k].pts, 14)) ms.push({ k, ...m });
  let fx = null; const KEY = "ojocr.fx.v1";
  try { const c = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (c && Date.now() - c.t < 15 * 60000 && c.n === ms.length) fx = c.fx; } catch { /* */ }
  if (!fx) {
    fx = [];
    for (let i = 0; i < ms.length; i += 90) {
      const part = ms.slice(i, i + 90);
      let j = await getJ("https://api.open-meteo.com/v1/forecast?latitude=" + part.map((m) => m.pt[1].toFixed(3)).join(",") + "&longitude=" + part.map((m) => m.pt[0].toFixed(3)).join(",") +
        "&hourly=precipitation_probability,precipitation,weather_code&forecast_hours=10&timezone=" + encodeURIComponent(TZ) + "&timeformat=unixtime", 25000);
      if (!Array.isArray(j)) j = [j];
      for (const r of j) fx.push(r.hourly.time.map((t, k) => ({ t: t * 1000, p: r.hourly.precipitation_probability[k] ?? 0, mm: r.hourly.precipitation[k] ?? 0, code: r.hourly.weather_code[k] ?? 0 })));
    }
    try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), n: ms.length, fx })); } catch { /* */ }
  }
  const ahora = Date.now() - 30 * 60000, fin = Date.now() + 6 * 3600000, al = [];
  for (const k of ks) {
    const rs = ms.map((m, j) => ({ ...m, f: fx[j] })).filter((m) => m.k === k);
    for (const m of rs) { m.hs = m.f.filter((h) => h.t >= ahora && h.t <= fin).map((h) => ({ ...h, lv: nivel(h.p, h.mm, h.code) })); m.lv = Math.max(0, ...m.hs.map((h) => h.lv)); }
    let g = null; const grupos = [];
    for (const m of rs) { if (m.lv > 0) { if (!g) grupos.push((g = [])); g.push(m); } else g = null; }
    for (const gr of grupos) {
      const lv = Math.max(...gr.map((m) => m.lv));
      const hs = gr.flatMap((m) => m.hs.filter((h) => h.lv === lv));
      const mm = Math.max(...hs.map((h) => h.mm)), w = gr.find((m) => m.hs.some((h) => h.mm === mm && h.lv === lv)) || gr[0];
      al.push({ k, lv, mm, code: Math.max(...hs.map((h) => h.code)), t0: Math.min(...hs.map((h) => h.t)), t1: Math.max(...hs.map((h) => h.t)) + 3600000, lugar: cerca(w.pt, R[k].lugares) });
    }
  }
  al.sort((a, b) => b.lv - a.lv || b.mm - a.mm);
  return { rojas: al.filter((a) => a.lv === 2).length, amarillas: al.filter((a) => a.lv === 1).length, peor: al[0] || null };
}
export async function sismoFuerte() { // M>=4 en Costa Rica y alrededores, últimas 24 h (USGS)
  const start = new Date(Date.now() - 864e5).toISOString().slice(0, 19);
  const j = await getJ(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}&minlatitude=7.5&maxlatitude=11.6&minlongitude=-86.6&maxlongitude=-82.4&minmagnitude=4&orderby=magnitude&limit=5`);
  const f = j.features[0]; if (!f) return null;
  return { id: f.id, mag: f.properties.mag, lugar: f.properties.place || "Costa Rica", t: f.properties.time };
}
const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `hace ${Math.max(1, m)} min` : `hace ${Math.round(m / 60)} h`; };
// pinta la tarjeta y el aviso en `root`; abrir(hash) abre Ojo CR
export function iniciarResumenCR(root, abrir) {
  if (!root) return;
  root.innerHTML = `<button type="button" class="cr-sismo" hidden></button><button type="button" class="cr-card" aria-label="Alertas en rutas: abrir Ojo Costa Rica"><span class="h">ALERTAS EN RUTAS <i>pronóstico<span class="l"> · próximas 6 h</span></i></span><p class="d">Revisando el pronóstico de los corredores…</p></button>`;
  const card = root.querySelector(".cr-card"), ban = root.querySelector(".cr-sismo");
  card.addEventListener("click", () => abrir("alertas"));
  let ultimo = null;
  ban.addEventListener("click", (e) => { if (e.target.closest(".x")) { try { localStorage.setItem("antares.crSismoVisto", ultimo); } catch { /* */ } ban.hidden = true; return; } abrir("sismos"); });
  async function tick() {
    if (document.hidden || !navigator.onLine) return;
    alertasRutas().then((r) => {
      const p = r.peor;
      card.classList.toggle("ok", !r.rojas);
      card.innerHTML = `<span class="h">ALERTAS EN RUTAS <i>pronóstico<span class="l"> · próximas 6 h</span></i></span>` +
        (r.rojas ? `<p><b class="n">${r.rojas} roja${r.rojas > 1 ? "s" : ""}</b>${r.amarillas ? ` · ${r.amarillas} amarilla${r.amarillas > 1 ? "s" : ""}` : ""}</p>` : `<p><b class="n">Sin alertas rojas</b>${r.amarillas ? ` · ${r.amarillas} amarilla${r.amarillas > 1 ? "s" : ""}` : ""}</p>`) +
        (p ? `<p class="d">Peor: ${esc(texto(p.lv, p.code, p.mm))} en Ruta ${esc(p.k)}${p.lugar ? " · " + esc(p.lugar) : ""} · ${franja(p.t0, p.t1)}</p>` : `<p class="d">Corredores 1, 2, 27, 32 y 34 sin lluvia importante.</p>`);
    }).catch(() => { card.querySelector(".d").textContent = "El pronóstico no respondió; toque para abrir Ojo CR."; });
    sismoFuerte().then((s) => {
      let visto = null; try { visto = localStorage.getItem("antares.crSismoVisto"); } catch { /* */ }
      if (!s || visto === s.id) { ban.hidden = true; return; }
      ultimo = s.id;
      ban.innerHTML = `<span>⚠</span><span><b>SISMO M${s.mag.toFixed(1).replace(".", ",")}</b> · ${esc(s.lugar)} · ${hace(s.t)}<br><small>USGS · toque para ver en Ojo CR</small></span><span class="x" role="button" aria-label="Ocultar aviso">✕</span>`;
      ban.hidden = false;
    }).catch(() => { /* sin red: no se muestra */ });
  }
  tick(); setInterval(tick, 15 * 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - (tick.t || 0) > 15 * 60000) { tick.t = Date.now(); tick(); } });
}
