// Antares · Cerebro doble: decide qué cerebro contesta. Sin dependencias (se prueba con node: ruteo.test.mjs).
// Regla: la PC (qwen2.5:3b) SOLO para charla casual y para redactar textos sin datos delicados.
// Todo lo de manejo, seguridad, salud y datos (números, distancias, fechas, precios, definiciones…) va a Gemini.
// Ante la duda: Gemini.
export const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const W = (src) => new RegExp("(^|[^a-z0-9])(" + src + ")", "i"); // inicio de palabra (permite plurales y conjugaciones)

// manejo, vehículos y seguridad / salud
export const RIESGO = W([
  "manej", "conduc", "carretera", "autopista", "ruta \\d", "ruta[s]? nacional", "trafico", "presa", "lluvi", "llov", "aguacero", "neblina", "niebla",
  "luces", "luz alta", "luz baja", "faro", "direccional", "vehicul", "carro", "auto ", "camion", "trailer", "furgon", "moto", "bus ", "llanta", "neumatico",
  "freno", "frenar", "aceite", "motor", "bateria", "gasolina", "diesel", "velocidad", "curva", "derrumbe", "accidente", "choque", "chocar",
  "segur", "peligr", "riesgo", "salud", "medic", "pastilla", "dosis", "dolor", "sintoma", "enferm", "fiebre", "presion arterial", "azucar en la sangre", "diabet",
  "emergenc", "hospital", "ambulancia", "911", "herida", "sangr", "quemadura", "intoxic", "veneno", "alergi", "embaraz",
  "electric", "corriente", "voltaje", "enchufe", "cable", "breaker", "gas ", "fuga", "incendio", "fuego", "extintor",
  "nino", "nina", "bebe", "hijo", "hija", "sismo", "temblor", "terremoto", "volcan", "inundac", "tormenta", "rayo",
].join("|"));
// preguntas de datos
export const DATOS = W([
  "\\d", "km", "kilometr", "metros", "millas", "distancia", "lejos", "cerca de", "cuant", "donde (queda|esta|hay|se encuentra)", "fecha", "cuando",
  "que dia", "a que hora", "horario", "precio", "cuesta", "vale ", "colones", "dolar", "tipo de cambio", "impuesto", "historia", "histori",
  "definicion", "defin", "significa", "que es ", "que es\\?", "que son", "cual es", "cuales son", "quien es", "quien fue", "quienes", "ley", "legal", "multa",
  "licencia", "marchamo", "riteve", "dekra", "capital", "poblacion", "porcentaje", "calcul", "sum", "resta", "multiplic", "divid", "receta",
  "explique", "expliqueme", "como funciona", "por que", "porque",
].join("|"));
// actualidad (requiere búsqueda): «hoy» solo cuenta junto a noticias/clima/qué pasó/precios…
export const ACTUALIDAD = W([
  "noticia", "que paso", "que esta pasando", "clima", "pronostico", "temperatura", "va a llover", "resultado", "marcador", "partido",
  "eleccion", "presidente", "ultim[oa]s? (noticia|hora)", "esta semana", "este mes", "(que (paso|hubo)|noticias de) ayer", "manana (va|hay|llueve|abre|cierra|juega)", "que hora", "busque", "buscame", "googlee", "en vivo",
].join("|"));
const HOY_SERIO = /(que (paso|hay|dicen)|noticia|clima|tiempo|precio|dolar|partido|juega|abre|cierra|horario|feriado|transito|pronostico).{0,30}\bhoy\b|\bhoy\b.{0,30}(que (paso|hay)|noticia|clima|llueve|llover|precio|dolar|partido|juega|abre|cierra|horario|feriado)/;
// lo único que contesta la PC: charla y redacción
export const CASUAL = W([
  "hola", "buen(os|as)? (dias|tardes|noches)", "buenas", "que tal", "como (esta|estas|le va|amanecio|se siente|anda)", "gracias", "muchas gracias", "adios", "hasta luego",
  "chao", "pura vida", "cuenteme (un|algo)", "un chiste", "chiste", "me siento", "estoy (cansad|aburrid|content|feliz|triste)", "animo", "motiv", "frase",
  "saludo", "felicit", "cumpleanos", "piropo", "que opina", "converse", "platiquemos", "hablemos",
].join("|"));
export const REDACTAR = W([
  "redact", "escrib", "mensaje", "correo", "carta", "nota para", "poema", "poesia", "verso", "cancion", "dedicatoria", "tarjeta", "texto para",
  "corrija", "corrige", "mejore (este|el) texto", "reescrib", "resuma (este|el) texto", "whatsapp", "post", "titulo para",
].join("|"));

// devuelve {cerebro: "pc"|"gem", motivo}
export function elegirCerebro(texto, { pcEnLinea = true, adjunto = false, modo = "auto" } = {}) {
  const t = norm(texto);
  if (modo === "gem") return { cerebro: "gem", motivo: "eligió solo Gemini" };
  if (modo === "pc") return pcEnLinea ? { cerebro: "pc", motivo: "eligió solo PC" } : { cerebro: "gem", motivo: "la PC no está en línea" };
  if (adjunto) return { cerebro: "gem", motivo: "foto o video" };
  if (!pcEnLinea) return { cerebro: "gem", motivo: "la PC no está en línea" };
  if (t.length > 400) return { cerebro: "gem", motivo: "texto largo" };
  if (RIESGO.test(t)) return { cerebro: "gem", motivo: "manejo, seguridad o salud" };
  if (ACTUALIDAD.test(t) || HOY_SERIO.test(t)) return { cerebro: "gem", motivo: "actualidad" };
  // «Corrija este texto: … a las 8 …»: en un encargo de redacción las cifras del texto pegado no lo vuelven pregunta de datos
  const pedido = REDACTAR.test(t) && t.includes(":") ? t.slice(0, t.indexOf(":")) : t;
  if (DATOS.test(pedido)) return { cerebro: "gem", motivo: "pregunta de datos" };
  if (CASUAL.test(t) || REDACTAR.test(t)) return { cerebro: "pc", motivo: "charla o redacción" };
  return { cerebro: "gem", motivo: "ante la duda" };
}
// red de seguridad: si la PC igual habló de manejo/seguridad/salud o dio cifras, se pregunta a Gemini
export function respuestaDelicada(respuesta) { const t = norm(respuesta); return RIESGO.test(t) || /\d+\s?(km|kilometr|metros|millas|%|colones|dolares|mg|ml)/.test(t); }
// búsqueda de Google en Gemini solo para actualidad
export function necesitaBusqueda(texto) { const t = norm(texto); return ACTUALIDAD.test(t) || HOY_SERIO.test(t); }

// la PC (3b) a veces se le sale el «tú» con don Freddy («¿en qué puedo ayudarte?»). En charla (no en textos que redacta
// para otras personas) se corrigen las formas más comunes al terminar la respuesta.
const TU = [[/\b(ayudar|servir|acompañar|explicar|contar|decir|recomendar)te\b/gi, "$1le"], [/\bpuedes\b/gi, "puede"], [/\btienes\b/gi, "tiene"],
  [/\bquieres\b/gi, "quiere"], [/\bnecesitas\b/gi, "necesita"], [/\bestás\b/gi, "está"], [/\beres\b/gi, "es"], [/\bpara ti\b/gi, "para usted"], [/\bcontigo\b/gi, "con usted"]];
export function ustedear(texto, pedido = "") {
  if (REDACTAR.test(norm(pedido))) return texto;
  return TU.reduce((t, [re, r]) => t.replace(re, (m, g) => { const out = g ? g + "le" : r; return m[0] === m[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out; }), texto);
}
