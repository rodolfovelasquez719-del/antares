// Descarga aviones públicos (ADS-B abierto) sobre Centroamérica y escribe aviones.json. Sin claves.
import { writeFileSync } from "node:fs";
const BB = { lamin: 5, lomin: -93, lamax: 18.5, lomax: -76 };
const inBB = (a) => a.lat >= BB.lamin && a.lat <= BB.lamax && a.lng >= BB.lomin && a.lng <= BB.lomax;
async function j(u) { const r = await fetch(u, { headers: { "user-agent": "antares-muestra (github actions)" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw Error(u + " " + r.status); return r.json(); }
const fromReadsb = (d, src) => (d.ac || d.aircraft || []).filter((a) => a.lat != null && a.alt_baro !== "ground").map((a) => ({
  id: a.hex, cs: (a.flight || a.r || "").trim(), reg: a.r || "", tipo: a.t || "", lat: +a.lat.toFixed(4), lng: +a.lon.toFixed(4),
  altm: typeof a.alt_baro === "number" ? Math.round(a.alt_baro * 0.3048) : null, v: a.gs != null ? Math.round(a.gs * 1.852) : null, hdg: a.track != null ? Math.round(a.track) : null, src }));
const PTS = [[14, -88], [10, -84], [8.5, -80]]; // 3 círculos de 250 NM cubren Centroamérica
async function readsb(base, src) {
  const all = new Map();
  for (const [la, lo] of PTS) { const d = await j(`${base}/${la}/lon/${lo}/dist/250`); for (const a of fromReadsb(d, src)) all.set(a.id, a); await new Promise((r) => setTimeout(r, 1200)); }
  return [...all.values()];
}
const fuentes = [
  ["adsb.lol", () => readsb("https://api.adsb.lol/v2/lat", "adsb.lol")],
  ["adsb.fi", () => readsb("https://opendata.adsb.fi/api/v2/lat", "adsb.fi")],
  ["OpenSky", async () => { const d = await j(`https://opensky-network.org/api/states/all?lamin=${BB.lamin}&lomin=${BB.lomin}&lamax=${BB.lamax}&lomax=${BB.lomax}`);
    return (d.states || []).filter((s) => s[5] != null && !s[8]).map((s) => ({ id: s[0], cs: (s[1] || "").trim(), pais: s[2], lat: s[6], lng: s[5], altm: s[7] != null ? Math.round(s[7]) : null, v: s[9] != null ? Math.round(s[9] * 3.6) : null, hdg: s[10] != null ? Math.round(s[10]) : null, src: "OpenSky" })); }],
];
const M = new Map(), usadas = [];
for (const [n, f] of fuentes) { try { const ac = (await f()).filter(inBB); if (ac.length) usadas.push(n); for (const x of ac) if (!M.has(x.id)) M.set(x.id, x); } catch (e) { console.log("falló", n, e.message); } }
if (!M.size) { console.log("sin datos"); process.exit(1); }
const out = { t: Date.now(), fuente: usadas.join(" + "), n: M.size, ac: [...M.values()] };
writeFileSync("aviones.json", JSON.stringify(out));
console.log(out.fuente, out.n);
