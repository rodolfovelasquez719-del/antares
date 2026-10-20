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
  const last = line.length - 1;
  if (res[res.length - 1].i !== last) { if (res.length > 1 && acc - res[res.length - 1].km < paso / 2) res[res.length - 1] = { pt: line[last], km: acc, i: last }; else res.push({ pt: line[last], km: acc, i: last }); }
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
// v1.24.2: USGS con reintentos; si no responde (p. ej. CORS intermitente en algunos teléfonos), RSN (UCR) como respaldo.
// Devuelve null si no hubo M>=4; lanza error solo si ninguna fuente respondió.
const MESES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
function rsnFuertes(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml"); const out = [];
  for (const it of doc.querySelectorAll("item")) {
    const title = it.querySelector("title")?.textContent || "", txt = (it.querySelector("description")?.textContent || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const mag = parseFloat((title.match(/Mag:\s*([\d,\.]+)/) || txt.match(/Magnitud:\s*([\d,\.]+)/) || [])[1]?.replace(",", "."));
    if (!isFinite(mag)) continue;
    const f = txt.match(/Fecha:\s*(\d+)\s+de\s+(\w+)\s+del?\s+(\d{4})/i), h = txt.match(/Hora Local:\s*(\d+):(\d+)\s*([ap])/i);
    let t = Date.parse(it.querySelector("pubDate")?.textContent || "") || 0;
    if (f && h && MESES[f[2].toLowerCase()] != null) t = Date.UTC(+f[3], MESES[f[2].toLowerCase()], +f[1], (+h[1] % 12) + (h[3].toLowerCase() === "p" ? 12 : 0) + 6, +h[2]);
    const lugar = (txt.match(/Localizaci[oó]n:\s*(.+?)\s+Coordenadas/) || [])[1] || "Costa Rica";
    out.push({ id: "rsn-" + t + "-" + mag, mag, lugar, t, src: "RSN" });
  }
  return out;
}
async function conReintentos(fn, n = 3) { let e; for (let i = 0; i < n; i++) { try { return await fn(); } catch (x) { e = x; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); } } throw e; }
export async function sismoFuerte() { // M>=4 en Costa Rica y alrededores, últimas 24 h
  const start = new Date(Date.now() - 864e5).toISOString().slice(0, 19);
  try {
    const j = await conReintentos(() => getJ(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}&minlatitude=7.5&maxlatitude=11.6&minlongitude=-86.6&maxlongitude=-82.4&minmagnitude=4&orderby=magnitude&limit=5`, 15000));
    const f = j.features[0]; if (!f) return null;
    return { id: f.id, mag: f.properties.mag, lugar: f.properties.place || "Costa Rica", t: f.properties.time, src: "USGS" };
  } catch {
    const r = await fetch("https://rsn.ucr.ac.cr/actividad-sismica/ultimos-sismos?format=feed&type=rss", { signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
    if (!r.ok) throw Error("RSN " + r.status);
    const ev = rsnFuertes(await r.text()).filter((e) => e.mag >= 4 && Date.now() - e.t < 864e5).sort((a, b) => b.mag - a.mag);
    return ev[0] || null;
  }
}
const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `hace ${Math.max(1, m)} min` : `hace ${Math.round(m / 60)} h`; };
// pinta la tarjeta y el aviso en `root`; abrir(hash) abre Ojo CR
export function iniciarResumenCR(root, abrir) {
  if (!root) return;
  root.innerHTML = `<button type="button" class="cr-sismo" hidden></button><button type="button" class="cr-card" aria-label="Alertas en rutas: abrir Ojo Costa Rica"><span class="h">ALERTAS EN RUTAS <i>pronóstico<span class="l"> · próximas 6 h</span></i></span><p class="d">Revisando el pronóstico de los corredores…</p></button><p class="cr-nosis" hidden>Sismos: sin datos ahora (USGS y RSN no respondieron)</p>`;
  const card = root.querySelector(".cr-card"), ban = root.querySelector(".cr-sismo"), nos = root.querySelector(".cr-nosis");
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
    sismoFuerte().then((s) => { nos.hidden = true;
      let visto = null; try { visto = localStorage.getItem("antares.crSismoVisto"); } catch { /* */ }
      if (!s || visto === s.id) { ban.hidden = true; return; }
      ultimo = s.id;
      ban.innerHTML = `<span>⚠</span><span><b>SISMO M${s.mag.toFixed(1).replace(".", ",")}</b> · ${esc(s.lugar)} · ${hace(s.t)}<br><small>${s.src || "USGS"} · toque para ver en Ojo CR</small></span><span class="x" role="button" aria-label="Ocultar aviso">✕</span>`;
      ban.hidden = false;
      nos.hidden = true;
    }).catch(() => { ban.hidden = true; nos.hidden = false; }); // ninguna fuente respondió: aviso discreto
  }
  tick(); setInterval(tick, 15 * 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - (tick.t || 0) > 15 * 60000) { tick.t = Date.now(); tick(); } });
}
