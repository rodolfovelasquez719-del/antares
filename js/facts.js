// Antares Web - Detección de datos importantes (nunca se guarda sin confirmar).
const PATTERNS = [
  /\bme llamo\b/i, /\bmi nombre es\b/i,
  /\bmi cumplea[nñ]os\b/i, /\bnac[íi]\b/i,
  /\bmi direcci[oó]n\b/i, /\bvivo en\b/i,
  /\bmi tel[eé]fono\b/i, /\bmi n[uú]mero\b/i,
  /\bmi contrase[nñ]a\b/i,
  /\btrabajo en\b/i, /\bmi trabajo\b/i,
  /\brecord[aá]\b/i, /\bacord[aá]te\b/i, /\bguard[aá]\b/i,
  /\bmi (mam[aá]|pap[aá]|hermano|hermana|esposa|esposo|pareja|hijo|hija)\b/i,
];

export function looksLikeImportantFact(text) {
  return PATTERNS.some((p) => p.test(text || ""));
}

export function buildConfirmationQuestion(text) {
  return `Detecté algo que podría ser un dato importante: "${text}"\n¿Querés que lo guarde para recordarlo en el futuro?`;
}
