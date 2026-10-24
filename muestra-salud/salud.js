// Antares · Salud de la compu (muestra). Lee /salud y /salud/historial del portero de la PC (con la clave guardada).
const $ = (s) => document.querySelector(s);
const K = "antares.cerebroDoble.v1", URL_PC = "https://antares.tail1d77f2.ts.net";
const cfg = (() => { try { return JSON.parse(localStorage.getItem(K) || "{}"); } catch { return {}; } })();
const base = () => (cfg.url || URL_PC).trim().replace(/\/+$/, "");
const cab = () => ({ "X-Antares-Token": cfg.tok || "" });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString("es-CR");
const hora = (d) => new Date(d).toLocaleString("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dur = (s) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${n1(s / 3600)} h`);
function estado(c, t) { $("#estado").className = "estado " + c; $("#estado-t").textContent = t; }

function gauge(valor, max, txt, sub, warn, bad) {
  const p = Math.max(0, Math.min(1, (valor ?? 0) / max)), a = Math.PI * (1 - p);
  const col = valor == null ? "#555" : valor >= bad ? "#ff3b5c" : valor >= warn ? "#ffd23f" : "#22ff9a";
  const x = 55 + 45 * Math.cos(a), y = 60 - 45 * Math.sin(a);
  return `<div class="gauge"><svg viewBox="0 0 110 70"><path d="M10 60 A45 45 0 0 1 100 60" stroke="rgba(34,255,154,.15)" stroke-width="9" fill="none" stroke-linecap="round"/>` +
    (valor == null ? "" : `<path d="M10 60 A45 45 0 ${p > 0.5 ? 0 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}" stroke="${col}" stroke-width="9" fill="none" stroke-linecap="round"/>`) +
    `</svg><b style="color:${col}">${txt}</b><span>${sub}</span></div>`;
}
const fila = (k, v, cls = "") => `<div class="fila"><span>${k}</span><span class="${cls}">${v}</span></div>`;
const est = (b) => (b == null ? ["sin dato", "avis"] : b ? ["en línea", "ok"] : ["CAÍDO", "malo"]);

let avisadas = new Set(JSON.parse(sessionStorage.getItem("salud.avisadas") || "[]"));
function notificar(alertas) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  for (const a of alertas) {
    const k = a.clave + "|" + a.inicio; if (avisadas.has(k)) continue;
    avisadas.add(k);
    try { new Notification("Antares · " + (a.nivel === "alerta" ? "ALERTA" : "Aviso"), { body: a.texto, icon: "../icons/favicon-32.png", tag: a.clave }); } catch { /* móviles sin Notification directa */ navigator.serviceWorker?.ready.then((r) => r.showNotification("Antares · " + a.nivel, { body: a.texto, tag: a.clave })).catch(() => {}); }
  }
  sessionStorage.setItem("salud.avisadas", JSON.stringify([...avisadas].slice(-50)));
}

function pintar(j) {
  const a = j.ahora, u = j.umbrales;
  const al = j.alertas || [];
  const graves = al.filter((x) => x.nivel === "alerta");
  $("#banner").className = "banner " + (al.length ? "mal" : "ok");
  $("#banner").textContent = al.length ? `⚠ ${al.length} alerta${al.length > 1 ? "s" : ""}: ${al.map((x) => x.texto).join(" · ")}` : `✓ Todo bien · medido ${hora(a.t)} · encendida hace ${n1(a.uptimeH)} h`;
  const tdisp = a.tempCPU != null;
  $("#gauges").innerHTML = gauge(a.cpu, 100, `${Math.round(a.cpu)}%`, "CPU", 80, 95) +
    gauge(tdisp ? a.tempCPU : null, 100, tdisp ? `${Math.round(a.tempCPU)}°` : "n/d", "TEMP. CPU", u.tempAviso, u.tempAlerta) +
    gauge(a.ramMB / a.ramTotalMB * 100, 100, `${n1(a.ramMB / 1024)}`, `RAM GB de ${Math.round(a.ramTotalMB / 1024)}`, 85, 95);
  $("#tnota").innerHTML = tdisp ? `Aviso desde ${u.tempAviso} °C, alerta desde ${u.tempAlerta} °C.${a.tempSSD != null ? ` SSD ${Math.round(a.tempSSD)} °C.` : ""}${a.vidaSSD != null ? ` Vida del SSD ${Math.round(a.vidaSSD)} %.` : ""}` :
    "Temperatura no disponible todavía: LibreHardwareMonitor necesita permiso de administrador una vez (D:\\Antares\\salud\\instalar_temperatura_admin.ps1). Mientras tanto se usa la carga de la CPU como guía.";
  $("#discos").innerHTML = (a.discos || []).map((d) => {
    const usado = (d.totalGB - d.libreGB) / d.totalGB * 100, linea = (1 - u.discoMinGB / d.totalGB) * 100, mal = d.libreGB < u.discoMinGB;
    return `<div class="fila"><span>Disco ${d.letra}:</span><span class="${mal ? "malo" : "ok"}">${Math.round(d.libreGB)} GB libres de ${Math.round(d.totalGB)}</span></div>` +
      `<div class="barra ${mal ? "mal" : ""}"><i style="width:${usado.toFixed(1)}%"></i><em style="left:${linea.toFixed(1)}%" title="50 GB libres"></em><s>${Math.round(usado)} % usado</s></div>`;
  }).join("");
  const w = a.wifi || {};
  const pingTxt = (v) => (v >= 0 ? `${Math.round(v)} ms` : "no responde");
  $("#red").innerHTML = fila("Wi-Fi", w.conectado ? `conectado${w.ssid ? " a " + esc(w.ssid) : ""}` : "DESCONECTADO", w.conectado ? "ok" : "malo") +
    fila("Velocidad del enlace", w.conectado ? `${Math.round(w.velocidadMbps)} Mbps` : "—") +
    fila("Señal", w.senalPct >= 0 ? `${w.senalPct} %` : "n/d", w.senalPct >= 0 ? (w.senalPct < 40 ? "avis" : "ok") : "") +
    fila("Ping 1.1.1.1", pingTxt(a.ping1111), a.ping1111 < 0 ? "malo" : a.ping1111 > 150 ? "avis" : "ok") +
    fila("Ping google.com", pingTxt(a.pingGoogle), a.pingGoogle < 0 ? "malo" : a.pingGoogle > 200 ? "avis" : "ok") +
    fila("Tailscale", ...est(a.tailscale)) + fila("Dirección pública (Funnel)", ...est(a.funnel)) +
    (w.senalPct < 0 && w.notaSenal ? `<p class="nota" style="margin-top:6px">${esc(w.notaSenal)}.</p>` : "");
  $("#serv").innerHTML = fila("Portero (clave)", "en línea", "ok") + fila("Cerebro (Ollama)", ...est(a.ollama)) +
    fila("Recolector de noticias", a.noticias, a.noticias === "ok" ? "ok" : "avis") +
    fila("Portero usa", `${n1(a.porteroMB)} MB · ${n1(a.porteroCPU)} % CPU`) + fila("Encendida hace", `${n1(a.uptimeH)} h`);
  $("#alertas").innerHTML = al.map((x) => `<li class="${x.nivel}">${esc(x.texto)}<small>${x.nivel.toUpperCase()} · desde ${hora(x.inicio)}</small></li>`).join("") || `<li class="vacio">Ninguna. Se avisa si un disco baja de ${u.discoMinGB} GB, si la CPU llega a ${u.tempAviso}–${u.tempAlerta} °C o si el Wi-Fi o internet se caen más de ${u.redGraciaSeg / 60} min.</li>`;
  const ev = (j.bitacora || []).filter((x) => x.fin || x.nivel === "evento").slice(0, 12);
  $("#eventos").innerHTML = ev.map((x) => `<li class="${x.nivel === "evento" ? "" : x.nivel}">${esc(x.texto)}<small>${hora(x.inicio)} → ${x.fin ? hora(x.fin) : "sigue"}${x.duracionSeg ? " · duró " + dur(x.duracionSeg) : ""}</small></li>`).join("") || `<li class="vacio">Sin caídas registradas.</li>`;
  notificar(graves.length ? graves : al);
}

function grafica(pts) {
  const c = $("#graf"), g = c.getContext("2d"), W = (c.width = c.clientWidth * devicePixelRatio), H = (c.height = 90 * devicePixelRatio);
  g.clearRect(0, 0, W, H); if (!pts.length) return;
  const t0 = Date.now() - 24 * 3600e3, X = (t) => ((new Date(t) - t0) / (24 * 3600e3)) * W;
  g.fillStyle = "rgba(255,59,92,.55)";
  for (const p of pts) if (!p.internet || !p.wifi) g.fillRect(X(p.t) - 2, 0, 4 * devicePixelRatio, H);
  const linea = (f, max, col) => { g.beginPath(); g.strokeStyle = col; g.lineWidth = 1.6 * devicePixelRatio; let ini = false;
    for (const p of pts) { const v = f(p); if (v == null || v < 0) { ini = false; continue; } const y = H - Math.min(1, v / max) * (H - 4) - 2; ini ? g.lineTo(X(p.t), y) : g.moveTo(X(p.t), y); ini = true; } g.stroke(); };
  linea((p) => p.cpu, 100, "#22ff9a"); linea((p) => p.ping, 200, "#5ab4ff"); linea((p) => p.temp, 100, "#ffd23f");
}

async function cargar() {
  try {
    const r = await fetch(base() + "/salud", { headers: cab(), signal: AbortSignal.timeout(10000) });
    if (r.status === 401) { estado("tok", "CLAVE INCORRECTA"); $("#conf").open = true; return; }
    if (!r.ok) throw Error(r.status);
    const j = await r.json();
    if (!j.ahora || j.ahora.t.startsWith("0001")) { estado("on", "COMPU EN LÍNEA · MIDIENDO…"); return; }
    estado(j.alertas?.length ? "off" : "on", j.alertas?.length ? "COMPU CON ALERTAS" : "COMPU EN LÍNEA"); pintar(j);
    const h = await fetch(base() + "/salud/historial?horas=24", { headers: cab() }).then((x) => x.json()); grafica(h.puntos || []);
  } catch { estado("off", "COMPU APAGADA O SIN RED"); $("#banner").className = "banner mal"; $("#banner").textContent = "⚠ No pude hablar con la compu (puede estar apagada o sin internet)."; }
}

$("#notif").addEventListener("click", async () => {
  if (!("Notification" in window)) { alert("Este navegador no permite avisos."); return; }
  const p = await Notification.requestPermission(); $("#notif").textContent = p === "granted" ? "🔔 Avisos activos" : "🔕 Avisos bloqueados";
  if (p === "granted") { avisadas = new Set(); cargar(); }
});
if ("Notification" in window && Notification.permission === "granted") $("#notif").textContent = "🔔 Avisos activos";
$("#url").value = base(); $("#tok").value = cfg.tok || "";
$("#guardar").addEventListener("click", () => { const u = $("#url").value.trim(); cfg.url = u === URL_PC ? "" : u; cfg.tok = $("#tok").value.trim(); localStorage.setItem(K, JSON.stringify(cfg)); $("#conf").open = false; cargar(); });
if (!cfg.tok) $("#conf").open = true;
cargar(); setInterval(cargar, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) cargar(); });
