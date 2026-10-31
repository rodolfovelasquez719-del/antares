// comun/memoria.js — memoria local reutilizable para los asistentes (Viernes y los que vengan).
// Cada asistente usa su propia "carpeta": claves de localStorage con el prefijo de su nombre, p. ej. "viernes.memoria.v1".
// Guarda dos cosas en el teléfono, sin red: 1) respuestas a preguntas repetidas o parecidas (con vencimiento),
// 2) datos aprendidos (negocio, gustos) que se le pasan al modelo como contexto.
// Uso:  const mem = crearMemoria("viernes");  mem.buscar(p) · mem.guardar(p, r) · mem.aprender(t) · mem.paraPrompt() · mem.exportar()
const VOLATIL = /\b(hoy|ahora|ayer|mañana|manana|actual|actualmente|precio|precios|cuesta|cuanto|cuánto|vale|tipo de cambio|dolar|dólar|noticia|noticias|clima|lluvia|temperatura|horario|abre|cierra|tendencia|tendencias|oferta|ofertas|esta semana|este mes)\b/i;
const VACIAS = new Set("el la los las un una unos unas de del al a y o que en por para con mi me te se le lo es son como cual cuál qué que por favor porfa hola viernes dime decime podes puedes me".split(" "));
const AHORA = () => Date.now();
const H = 3600e3, D = 24 * H;

export function normalizar(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]+/g, " ")
    .split(/\s+/).filter((w) => w && !VACIAS.has(w)).map((w) => w.replace(/(es|s)$/, "")).sort().join(" ");
}
const parecido = (a, b) => { const A = new Set(a.split(" ")), B = new Set(b.split(" ")); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1); };
// Seguimientos que dependen de la conversación: no se responden desde lo guardado
const SEGUIMIENTO = /^(y |pero |entonces |otra|otro|mas |más |eso|esa|ese|si|sí|no|ok|gracias|dale|listo|por que|porque|¿y)/i;

export function crearMemoria(nombre, { maxRespuestas = 200, maxDatos = 80, vence = 30 * D, venceVolatil = 6 * H, umbral = 0.86 } = {}) {
  const KR = `${nombre}.respuestas.v1`, KD = `${nombre}.memoria.v1`;
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  let R = leer(KR), M = leer(KD);
  // Sincronización opcional con el servidor de la PC (cola: si falla o no hay red, queda pendiente y se reintenta)
  const KS = `${nombre}.sync.v1`;
  let S = (() => { try { return JSON.parse(localStorage.getItem(KS)) || {}; } catch { return {}; } })();
  const guardarS = () => { try { localStorage.setItem(KS, JSON.stringify(S)); } catch { /* */ } };
  let timer = null, enCurso = false;
  const pendiente = () => { S.pendiente = true; guardarS(); clearTimeout(timer); timer = setTimeout(() => api.sincronizar(), 4000); };
  const fusionar = (rem) => {
    if (!rem) return;
    const borr = new Set([...(S.olvidados || []), ...(rem.olvidados || [])]);
    for (const d of rem.datos || []) { const n = d.n || normalizar(d.t); if (!borr.has(n) && !M.some((x) => x.n === n)) M.push({ id: d.id || n.slice(0, 12), t: d.t, n, origen: d.origen || "pc", fecha: d.fecha || 0 }); }
    M = M.filter((x) => !borr.has(x.n)).slice(-maxDatos); S.olvidados = [...borr].slice(-200);
    for (const x of rem.respuestas || []) { const n = x.n || normalizar(x.q); if (!n || x.vence < AHORA()) continue; const i = R.findIndex((y) => y.n === n); if (i < 0) R.push({ ...x, n }); else if ((x.t || 0) > (R[i].t || 0)) R[i] = { ...x, n }; }
    limpiar(); escribir(KR, R); escribir(KD, M);
  };
  const limpiar = () => { const n = AHORA(); R = R.filter((x) => x.vence > n).slice(-maxRespuestas); };

  const api = {
    nombre,
    // {url, token} del servidor de memoria (llega por el enlace de configuración). null = apagado.
    configurarSync(c) { S = c && c.url && c.token ? { ...S, url: String(c.url).replace(/\/+$/, ""), token: String(c.token), pendiente: true } : {}; guardarS(); if (S.url) setTimeout(() => api.sincronizar(), 500); },
    syncActivo: () => !!(S.url && S.token),
    estadoSync: () => ({ activo: !!(S.url && S.token), ultimo: S.ultimo || 0, pendiente: !!S.pendiente, error: S.error || "" }),
    async sincronizar() {
      if (!S.url || !S.token || enCurso || (typeof navigator !== "undefined" && navigator.onLine === false)) return false;
      enCurso = true;
      const u = `${S.url}/${encodeURIComponent(nombre)}`, h = { Authorization: "Bearer " + S.token };
      try {
        const g = await fetch(u, { headers: h, cache: "no-store" });
        if (!g.ok) throw new Error("HTTP " + g.status);
        fusionar((await g.json()).memoria);
        const body = JSON.stringify({ ...api.exportar(), olvidados: S.olvidados || [], respuestas: R });
        const p = await fetch(u, { method: "PUT", headers: { ...h, "Content-Type": "application/json" }, body });
        if (!p.ok) throw new Error("HTTP " + p.status);
        S.pendiente = false; S.ultimo = AHORA(); S.error = ""; guardarS(); return true;
      } catch (e) { S.error = String(e && e.message || e).slice(0, 80); guardarS(); clearTimeout(timer); timer = setTimeout(() => api.sincronizar(), 5 * 60e3); return false; }
      finally { enCurso = false; }
    },
    // Respuesta guardada para una pregunta igual o muy parecida (null si no hay o ya venció)
    buscar(pregunta) {
      const q = String(pregunta || "").trim();
      if (q.length < 8 || SEGUIMIENTO.test(q)) return null;
      const n = normalizar(q); if (!n) return null;
      limpiar();
      let mejor = null, s = 0;
      for (const x of R) { const p = x.n === n ? 1 : parecido(x.n, n); if (p > s) { s = p; mejor = x; } }
      if (!mejor || s < umbral) return null;
      mejor.usos = (mejor.usos || 0) + 1; escribir(KR, R);
      return { texto: mejor.r, fuentes: mejor.f || [], guardada: mejor.t };
    },
    guardar(pregunta, respuesta, { fuentes = [], volatil } = {}) {
      const q = String(pregunta || "").trim();
      if (q.length < 8 || SEGUIMIENTO.test(q) || !respuesta) return;
      const n = normalizar(q); if (!n) return;
      const vol = volatil ?? VOLATIL.test(q);
      R = R.filter((x) => x.n !== n);
      R.push({ q: q.slice(0, 300), n, r: String(respuesta).slice(0, 4000), f: fuentes.slice(0, 5), t: AHORA(), vence: AHORA() + (vol ? venceVolatil : vence), usos: 0 });
      limpiar(); escribir(KR, R); if (S.url) pendiente();
    },
    // Datos aprendidos (duraderos)
    aprender(texto, origen = "auto") {
      const t = String(texto || "").trim().replace(/\s+/g, " ").slice(0, 200);
      if (t.length < 4) return false;
      const n = normalizar(t);
      if (M.some((x) => x.n === n || parecido(x.n, n) > 0.8)) return false;
      M.push({ id: AHORA().toString(36) + Math.random().toString(36).slice(2, 5), t, n, origen, fecha: AHORA() });
      M = M.slice(-maxDatos); escribir(KD, M); if (S.url) pendiente(); return true;
    },
    olvidar(id) { const x = M.find((y) => y.id === id); if (x) (S.olvidados ||= []).push(x.n); M = M.filter((y) => y.id !== id); escribir(KD, M); if (S.url) pendiente(); },
    datos: () => M.map(({ id, t, origen, fecha }) => ({ id, t, origen, fecha })),
    // Bloque para el prompt del sistema
    paraPrompt() { return M.length ? "\nLo que ya sabes (aprendido antes): " + M.map((x) => "• " + x.t).join(" ") : ""; },
    // Instrucción para que el modelo marque datos nuevos dentro de su respuesta (sin llamada extra)
    instruccionAprender: "\nSi en este mensaje aprendes un dato DURADERO y útil (negocio, productos, precios propios, clientas, gustos, familia), agrega al final una línea aparte: [[APRENDI: dato corto en tercera persona]]. Máximo 2. No lo menciones.",
    // Saca las marcas [[APRENDI: …]] de la respuesta, guarda los datos y devuelve el texto limpio
    extraer(respuesta) {
      const nuevos = [];
      const limpio = String(respuesta || "").replace(/\[\[\s*APRENDI\s*:\s*([^\]]+)\]\]/gi, (_, d) => { if (api.aprender(d)) nuevos.push(d.trim()); return ""; }).trim();
      return { texto: limpio, nuevos };
    },
    estadisticas() { limpiar(); return { respuestas: R.length, reutilizadas: R.reduce((a, x) => a + (x.usos || 0), 0), datos: M.length }; },
    exportar() { limpiar(); return { asistente: nombre, formato: "memoria-asistente/1", exportado: new Date().toISOString(), datos: M.map(({ id, t, n, origen, fecha }) => ({ id, t, n, origen, fecha })), respuestas: R.map(({ q, n, r, f, t, vence, usos }) => ({ q, n, r, f, t, vence, usos })) }; },
    borrarRespuestas() { R = []; escribir(KR, R); if (S.url) pendiente(); },
    respuestas() { limpiar(); return R.map(({ q, r, t, usos }) => ({ q, r, t, usos })); },
  };
  if (typeof window !== "undefined") {
    addEventListener("online", () => { if (S.pendiente) api.sincronizar(); });
    if (S.url) setTimeout(() => api.sincronizar(), 3000);
  }
  return api;
}
