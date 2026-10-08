// Antares Web - Detección de mensajes que probablemente traen un dato personal duradero.
// Se usa para decidir cuándo vale la pena pedirle a Gemini que extraiga datos para la memoria
// (así no se gasta una consulta en cada mensaje).

// Límites de palabra que entienden acentos y ñ (\b de JavaScript no los reconoce).
export function wordRegex(source, flags = "iu") {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, flags);
}

const PATTERNS = [
  // nombre e identidad
  "me llamo", "mi nombre es", "ll[aá]meme", "me dicen", "soy de", "nac[ií]( en| el)?",
  // fechas
  "mi cumplea[nñ]os", "cumplo a[nñ]os", "mi aniversario", "nos casamos",
  // dónde vive / trabajo / estudios
  "vivo en", "me mud[eé]", "mi casa", "mi direcci[oó]n", "trabajo (en|como|de|para)", "mi trabajo", "mi empresa",
  "mi jefe", "estudio", "soy (ingeniero|ingeniera|doctor|doctora|m[eé]dico|m[eé]dica|abogado|abogada|profesor|profesora|maestro|maestra|programador|programadora|estudiante|enfermero|enfermera|contador|contadora|dise[nñ]ador|dise[nñ]adora|pensionado|pensionada)",
  // familia y mascotas
  "mi (mam[aá]|pap[aá]|madre|padre|hermano|hermana|esposa|esposo|pareja|novio|novia|hijo|hija|hijos|hijas|nieto|nieta|abuelo|abuela|suegro|suegra|t[ií]o|t[ií]a|primo|prima|perro|perra|gato|gata|mascota|familia)",
  "tengo (un|una|dos|tres|cuatro) (hijo|hija|hijos|hijas|perro|perra|perros|gato|gata|gatos|nieto|nieta|nietos)",
  "se llama",
  // gustos y preferencias
  "me gusta(n)?", "me encanta(n)?", "no me gusta(n)?", "prefiero", "odio", "mi (comida|color|equipo|m[uú]sica|pel[ií]cula|libro|deporte) favorit[oa]",
  "soy (al[eé]rgic[oa]|vegetarian[oa]|vegan[oa]|diab[eé]tic[oa]|cel[ií]ac[oa])", "no como", "no tomo",
  // contacto
  "mi (tel[eé]fono|n[uú]mero|correo|email|whatsapp)",
  // pedidos explícitos de recordar (usted, tú y vos)
  "recuerde", "recu[eé]rdeme", "recu[eé]rdelo", "no olvide", "guarde", "gu[aá]rdelo", "gu[aá]rdeme", "anote", "an[oó]telo", "apunte",
  "recuerda", "recu[eé]rdame", "guarda", "gu[aá]rdalo", "recordá", "acordate", "guardá", "anotá", "toma nota", "tome nota",
].map((p) => wordRegex(p));

export function looksLikeImportantFact(text) {
  const t = String(text || "");
  return t.length >= 6 && PATTERNS.some((p) => p.test(t));
}

export function buildConfirmationQuestion(text) {
  return `Esto parece un dato importante: "${text}". ¿Desea que lo guarde para recordarlo más adelante?`;
}
