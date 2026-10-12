// v1.17: Antares actúa sobre la app con herramientas de Gemini (function calling), por voz o por chat.
import * as Reminders from "./reminders.js";
import * as Shopping from "./shopping.js";
import * as Logbook from "./logbook.js";
import * as Digest from "./digest.js";
import { fetchWeather } from "./weather.js";
import { memory } from "./memory.js";

const S = (_d, properties = {}, required = []) => ({ type: "OBJECT", properties, ...(required.length ? { required } : {}) });
const str = (description, extra = {}) => ({ type: "STRING", description, ...extra });
export const SECTIONS = ["personal", "trabajo", "ocio", "herramientas", "recordatorios", "compras", "noticias", "rutas", "cubica", "correo", "bitacora", "damas", "trivia", "robotica", "fotos", "codigo", "excel", "inicio", "ajustes"];

export const FUNCTIONS = [
  { name: "crear_recordatorio", description: "Crea un recordatorio con aviso en una fecha y hora.", parameters: S("", { texto: str("Qué hay que recordar, corto (ej. «Llamar a Wendy»)"), fecha_hora: str("Fecha y hora local ISO 8601 sin zona, ej. 2026-10-13T07:00. Calcúlela con la fecha actual dada.") }, ["texto", "fecha_hora"]) },
  { name: "listar_recordatorios", description: "Dice los próximos recordatorios pendientes.", parameters: S("", {}) },
  { name: "borrar_recordatorio", description: "Borra UN recordatorio que coincida con el texto.", parameters: S("", { texto: str("Parte del texto del recordatorio") }, ["texto"]) },
  { name: "borrar_todos_recordatorios", description: "Borra TODOS los recordatorios (pide confirmación).", parameters: S("", {}) },
  { name: "agregar_compra", description: "Agrega un producto a la lista de compras.", parameters: S("", { producto: str("Nombre del producto"), cantidad: str("Cantidad, ej. «2» o «1 kg»"), tienda: str("Tienda", { enum: Shopping.STORES }) }, ["producto"]) },
  { name: "quitar_compra", description: "Quita un producto de la lista de compras.", parameters: S("", { producto: str("Nombre del producto") }, ["producto"]) },
  { name: "listar_compras", description: "Dice qué hay en la lista de compras.", parameters: S("", {}) },
  { name: "vaciar_compras", description: "Vacía TODA la lista de compras (pide confirmación).", parameters: S("", {}) },
  { name: "agregar_bitacora", description: "Anota una ruta o entrada en la bitácora de trabajo de hoy.", parameters: S("", { nombre: str("Nombre de la ruta o entrada"), notas: str("Notas"), paradas: { type: "ARRAY", items: { type: "STRING" }, description: "Paradas" } }, ["nombre"]) },
  { name: "guardar_memoria", description: "Guarda un dato duradero sobre el usuario para recordarlo después.", parameters: S("", { dato: str("Frase corta en tercera persona, ej. «Su esposa se llama Wendy»") }, ["dato"]) },
  { name: "recordar_memoria", description: "Busca lo que Antares recuerda del usuario sobre un tema.", parameters: S("", { tema: str("Tema o palabra clave") }) },
  { name: "abrir_seccion", description: "Abre una pantalla de la app.", parameters: S("", { seccion: str("Sección", { enum: SECTIONS }) }, ["seccion"]) },
  { name: "clima", description: "Clima actual y de hoy en Alajuela.", parameters: S("", {}) },
  { name: "tipo_cambio", description: "Tipo de cambio del dólar en Costa Rica (BCCR).", parameters: S("", {}) },
  { name: "iniciar_damas", description: "Empieza una partida nueva de damas internacionales contra Antares.", parameters: S("", { nivel: str("Nivel", { enum: ["normal", "medio", "pro"] }) }) },
  { name: "cambiar_modo_respuesta", description: "Cambia cómo responde Antares.", parameters: S("", { modo: str("texto = solo texto, voz = texto y voz siempre, mic = voz solo cuando habla por micrófono", { enum: ["texto", "voz", "mic"] }) }, ["modo"]) },
  { name: "cambiar_voz", description: "Ajusta la voz de Antares.", parameters: S("", { preset: str("jarvis = voz masculina grave por defecto", { enum: ["jarvis"] }), velocidad: { type: "NUMBER", description: "0.6 a 1.4" } }) },
  { name: "terminar_conversacion", description: "Termina el modo conversación (manos libres).", parameters: S("", {}) },
  { name: "borrar_historial", description: "Borra toda la conversación guardada (pide confirmación).", parameters: S("", {}) },
  { name: "responder_normal", description: "Úsela cuando el usuario NO pide una acción de la app sino una pregunta general, noticias, búsqueda en internet o una explicación larga.", parameters: S("", {}) },
];
export const DANGER = new Set(["borrar_todos_recordatorios", "vaciar_compras", "borrar_historial"]);
const DANGER_ASK = {
  borrar_todos_recordatorios: "¿Seguro que quiere borrar todos los recordatorios? Diga sí o no.",
  vaciar_compras: "¿Seguro que quiere vaciar toda la lista de compras? Diga sí o no.",
  borrar_historial: "¿Seguro que quiere borrar toda la conversación? Diga sí o no.",
};

export function agentSystem(now = new Date()) {
  const d = now.toLocaleDateString("es-CR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const t = now.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${t}`;
  return `Usted puede ACTUAR en la app con las funciones disponibles. Hoy es ${d}, son las ${t} (hora local, ahora=${iso}). ` +
    "Si el usuario pide algo que una función hace (recordatorios, compras, bitácora, memoria, abrir pantallas, clima, dólar, damas, modo de respuesta, voz, terminar la conversación), llame a la función, sin pedir permiso. " +
    "Para fechas relativas («mañana a las 7», «en 20 minutos») calcule fecha_hora con la fecha actual; «a las 7» sin am/pm: la próxima 7 que tenga sentido (mañana 7:00 si ya pasó). " +
    "Si es una pregunta general, noticias o algo que necesita internet, llame a responder_normal. Si solo charla o saluda, responda corto en texto sin función. " +
    "Nunca invente que hizo algo sin llamar la función.";
}

const pad = (n) => String(n).padStart(2, "0");
const nice = (s) => String(s || "").trim().replace(/\s+/g, " ").slice(0, 120);
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Ejecuta UNA llamada. deps: { openSection(s), endConversation(), setReplyMode(m), setVoice({preset,velocidad}), startDamas(n), clearHistory() }
// Devuelve { say, normal?: true, ask?: {name,args} }
export async function execute(call, deps, { confirmed = false } = {}) {
  const a = call.args || {};
  if (DANGER.has(call.name) && !confirmed) return { say: DANGER_ASK[call.name], ask: call };
  switch (call.name) {
    case "crear_recordatorio": {
      const title = nice(a.texto);
      let at = Date.parse(String(a.fecha_hora || "").replace(/Z$/, ""));
      if (!title) return { say: "¿Qué quiere que le recuerde?" };
      if (!Number.isFinite(at)) { const p = Reminders.parseReminder("Recuérdeme " + (a.fecha_hora || "") + " " + title); if (p) at = p.at; }
      if (!Number.isFinite(at)) return { say: "¿Para cuándo se lo recuerdo?" };
      if (at < Date.now() - 60000) at += 24 * 3600 * 1000; // una hora ya pasada de hoy = mañana
      const r = Reminders.addReminder({ title, at });
      if (r.ok === false) return { say: "No pude guardar el recordatorio: el almacenamiento está lleno." };
      return { say: `${r.duplicate ? "Ya lo tenía" : "Listo"}: le recuerdo «${title}» ${Reminders.formatWhen(r.reminder.at)}.` };
    }
    case "listar_recordatorios": {
      const up = Reminders.upcoming().slice(0, 5);
      if (!up.length) return { say: "No tiene recordatorios pendientes." };
      return { say: `Tiene ${up.length === 1 ? "un recordatorio" : up.length + " recordatorios"}: ` + up.map((r) => `${r.title}, ${Reminders.formatWhen(r.at)}`).join("; ") + "." };
    }
    case "borrar_recordatorio": {
      const q = norm(a.texto);
      const r = Reminders.loadReminders().find((x) => !x.done && norm(x.title).includes(q));
      if (!q || !r) return { say: "No encontré ese recordatorio." };
      Reminders.deleteReminder(r.id);
      return { say: `Borré el recordatorio «${r.title}».` };
    }
    case "borrar_todos_recordatorios": {
      const all = Reminders.loadReminders(); all.forEach((r) => Reminders.deleteReminder(r.id));
      return { say: all.length ? `Listo, borré ${all.length === 1 ? "el recordatorio" : "los " + all.length + " recordatorios"}.` : "No había recordatorios." };
    }
    case "agregar_compra": {
      const name = nice(a.producto);
      if (!name) return { say: "¿Qué producto agrego?" };
      const store = a.tienda && Shopping.STORES.includes(a.tienda) ? a.tienda : Shopping.detectStore(name) || "Otro";
      const r = Shopping.addItem({ name, qty: a.cantidad ? String(a.cantidad) : "1", store });
      if (r.ok === false) return { say: "No pude agregarlo a la lista." };
      return { say: r.updated ? `«${name}» ya estaba en la lista; la actualicé.` : `Agregué ${a.cantidad && a.cantidad !== "1" ? a.cantidad + " de " : ""}«${name}» a la lista de compras.` };
    }
    case "quitar_compra": {
      const q = norm(a.producto);
      const it = Shopping.loadItems().find((i) => norm(i.name).includes(q) || (q && q.includes(norm(i.name))));
      if (!q || !it) return { say: "Ese producto no está en la lista." };
      Shopping.deleteItem(it.id);
      return { say: `Quité «${it.name}» de la lista.` };
    }
    case "listar_compras": {
      const items = Shopping.loadItems().filter((i) => !i.bought);
      if (!items.length) return { say: "La lista de compras está vacía." };
      return { say: `En la lista hay ${items.length === 1 ? "un producto" : items.length + " productos"}: ` + items.slice(0, 12).map((i) => (i.qty && i.qty !== "1" ? i.qty + " " : "") + i.name).join(", ") + (items.length > 12 ? ", y más." : ".") };
    }
    case "vaciar_compras": {
      const items = Shopping.loadItems(); items.forEach((i) => Shopping.deleteItem(i.id));
      return { say: "Listo, vacié la lista de compras." };
    }
    case "agregar_bitacora": {
      const name = nice(a.nombre);
      if (!name) return { say: "¿Qué anoto en la bitácora?" };
      const r = Logbook.addEntry({ date: Logbook.todayISO(), name, stops: Array.isArray(a.paradas) ? a.paradas.map(nice).filter(Boolean) : [], notes: nice(a.notas) });
      if (r && r.ok === false) return { say: "No pude guardar en la bitácora." };
      return { say: `Anoté «${name}» en la bitácora de hoy.` };
    }
    case "guardar_memoria": {
      const fact = nice(a.dato);
      if (!fact) return { say: "¿Qué quiere que recuerde?" };
      const r = memory.saveFact(fact);
      return { say: r.id ? `Lo recordaré: ${fact}.` : "No pude guardarlo: la memoria está llena." };
    }
    case "recordar_memoria": {
      const facts = memory.getFacts(), q = norm(a.tema);
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      const hits = words.length ? facts.filter((f) => words.some((w) => norm(f).includes(w))) : facts;
      if (!hits.length) return { say: q ? "No tengo nada guardado sobre eso." : "Todavía no tengo datos guardados de usted." };
      return { say: hits.slice(0, 5).join(". ") + "." };
    }
    case "abrir_seccion": {
      const s = SECTIONS.includes(a.seccion) ? a.seccion : "inicio";
      deps.openSection(s);
      const label = { personal: "Personal", trabajo: "Trabajo", ocio: "Ocio", herramientas: "Herramientas", cubica: "Cúbica", bitacora: "Bitácora", codigo: "Código", robotica: "Robótica", ajustes: "Ajustes" }[s] || s[0].toUpperCase() + s.slice(1);
      return { say: `Abrí ${label}.` };
    }
    case "clima": {
      const w = await fetchWeather();
      if (!w) return { say: "No pude obtener el clima ahora." };
      return { say: `En Alajuela hay ${w.temp} grados, ${w.desc}.${w.max != null ? ` Hoy máxima de ${w.max} y mínima de ${w.min}.` : ""}${w.rain != null ? ` Probabilidad de lluvia: ${w.rain} por ciento.` : ""}` };
    }
    case "tipo_cambio": {
      const fx = await Digest.fetchFx().catch(() => null);
      if (!fx) return { say: "No pude consultar el tipo de cambio ahora." };
      const c = (n) => (typeof n === "number" ? n.toFixed(2).replace(".", ",") : "");
      return { say: `El dólar está a ${c(fx.venta)} colones para la venta${fx.compra ? ` y ${c(fx.compra)} para la compra` : ""}, según el Banco Central.` };
    }
    case "iniciar_damas": {
      const lvl = deps.startDamas(a.nivel || "medio");
      return { say: `Listo, nueva partida de damas en nivel ${lvl}. Usted empieza con las doradas.` };
    }
    case "cambiar_modo_respuesta": {
      const m = ["texto", "voz", "mic"].includes(a.modo) ? a.modo : "mic";
      deps.setReplyMode(m);
      return { say: { texto: "Listo, responderé solo con texto.", voz: "Listo, le responderé también en voz alta.", mic: "Listo, hablaré solo cuando usted me hable por micrófono." }[m] };
    }
    case "cambiar_voz": {
      deps.setVoice({ preset: a.preset, velocidad: a.velocidad });
      return { say: "Listo, ajusté mi voz. ¿Así está mejor?" };
    }
    case "terminar_conversacion": { deps.endConversation(); return { say: "", ended: true }; }
    case "borrar_historial": { deps.clearHistory(); return { say: "Listo, borré la conversación." }; }
    case "responder_normal": return { normal: true };
    default: return { normal: true };
  }
}

// ¿Vale la pena pasar por las herramientas? (en chat normal solo si suena a acción; en conversación, siempre)
const ACTION = /\b(recu[eé]rd|record(?:ar|atorio)|av[ií]s(?:e|ame)|agreg|a[ñn]ad|apunt|anot|pon(?:e|ga)|quit|borr|elimin|lista|compra|bit[aá]cora|guard|memori|acu[eé]rd|abr[aei]|muestr|mu[eé]str|damas|trivia|ruta|c[uú]bica|clima|llov|lluvia|temperatura|d[oó]lar|tipo de cambio|colones|modo|voz|velocidad|habl(?:e|a) m[aá]s|termin|partida|jug|vac[ií]|personal|trabajo|ocio|herramientas)/i;
export const looksActionable = (t) => ACTION.test(String(t || ""));
