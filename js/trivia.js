// Trivia de historia y misterios: Gemini genera preguntas de opción múltiple y una segunda consulta independiente
// las verifica; solo se muestran las que pasan la verificación. El puntaje se guarda (cifrado si hay código).
import { memory } from "./memory.js";

export const K_TRIVIA = "antares.trivia.v1";
export const TOPICS = {
  mezcla: { label: "Mezcla", desc: "una mezcla de historia de Costa Rica, las esferas del Diquís y enigmas históricos o arqueológicos del mundo" },
  cr: { label: "Historia de Costa Rica", desc: "la historia de Costa Rica (época precolombina, colonia, independencia, Campaña Nacional de 1856-1857, siglo XX, abolición del ejército, figuras y fechas clave)" },
  diquis: { label: "Esferas del Diquís", desc: "las esferas de piedra del Diquís y la arqueología del sur de Costa Rica (Palmar Sur, Finca 6, Batambal, El Silencio, Grijalba, cultura Diquís, declaratoria de la UNESCO de 2014)" },
  misterios: { label: "Misterios del mundo", desc: "enigmas históricos y arqueológicos del mundo con datos comprobados (Stonehenge, líneas de Nazca, Rapa Nui, Göbekli Tepe, manuscrito Voynich, mecanismo de Anticitera, Teotihuacán, Machu Picchu), preguntando por hechos documentados y no por teorías especulativas" },
};

const empty = () => ({ correct: 0, total: 0, streak: 0, best: 0, byTopic: {}, recent: [] });
export function loadScore() {
  const d = memory.getData(K_TRIVIA, null);
  return d && typeof d === "object" ? { ...empty(), ...d } : empty();
}
export function saveScore(s) { return memory.saveData(K_TRIVIA, s); }
export function resetScore() { const s = loadScore(); return saveScore({ ...empty(), recent: s.recent }); }

export function recordAnswer(q, ok) {
  const s = loadScore();
  s.total++; if (ok) { s.correct++; s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
  const t = s.byTopic[q.topic] || { c: 0, t: 0 };
  t.t++; if (ok) t.c++;
  s.byTopic[q.topic] = t;
  saveScore(s);
  return s;
}
export function rememberAsked(qs) {
  const s = loadScore();
  s.recent = [...(s.recent || []), ...qs.map((q) => q.question.slice(0, 140))].slice(-40);
  saveScore(s);
}

export const GEN_SYSTEM =
  "Usted prepara preguntas de trivia en español para un adulto costarricense curioso. Precisión antes que todo: " +
  "use solo hechos bien establecidos que aparecen en fuentes confiables (historiografía, museos nacionales, UNESCO, " +
  "estudios arqueológicos revisados). No invente nombres, fechas ni cifras. Si un dato es dudoso o discutido, NO lo use. " +
  "En los temas de misterios pregunte por hechos comprobados (dónde está, cuándo se descubrió, qué se sabe), nunca " +
  "presente teorías especulativas como verdad. Cada pregunta tiene 4 opciones, una sola correcta y las otras claramente " +
  "incorrectas pero verosímiles, y claramente distintas entre sí (nunca dos variantes del mismo nombre, como «Guayabo» y " +
  "«Monumento Nacional Guayabo»). Responda SOLO con JSON.";

export function genPrompt(topic, n = 3, avoid = []) {
  const t = TOPICS[topic] || TOPICS.mezcla;
  return `Escriba ${n} preguntas de trivia sobre ${t.desc}. Varíe la dificultad (fácil a media).\n` +
    `Formato exacto: {"questions":[{"question":"…","options":["…","…","…","…"],"answer":0,` +
    `"explanation":"1 o 2 frases con el dato correcto","source":"tipo de fuente (por ejemplo: registros históricos, Museo Nacional de Costa Rica, UNESCO, estudios arqueológicos)"}]}\n` +
    `«answer» es el índice (0 a 3) de la opción correcta. Ponga la respuesta correcta en posiciones distintas.` +
    (avoid.length ? `\nNo repita estas preguntas recientes:\n${avoid.slice(-15).map((q) => "- " + q).join("\n")}` : "");
}

export const VERIFY_SYSTEM =
  "Usted es un verificador de datos riguroso. Para cada pregunta de opción múltiple, decida de forma independiente cuál " +
  "opción es correcta según hechos bien establecidos, sin dejarse llevar por la respuesta propuesta. Si ninguna opción es " +
  "correcta, si hay más de una correcta o si el dato es dudoso, marque confident=false. Responda SOLO con JSON.";

export function verifyPrompt(qs) {
  return `Preguntas:\n${qs.map((q, i) => `${i}. ${q.question}\n${q.options.map((o, k) => `   ${k}) ${o}`).join("\n")}\n   Respuesta propuesta: ${q.answer}`).join("\n")}\n\n` +
    `Formato exacto: {"results":[{"i":0,"correct":2,"confident":true}]}`;
}

const stripFence = (t) => String(t || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
export function parseQuestions(text, topic = "mezcla") {
  let data;
  try { data = JSON.parse(stripFence(text)); } catch { return []; }
  const list = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const q of list) {
    if (!q || typeof q.question !== "string" || !Array.isArray(q.options) || q.options.length !== 4) continue;
    const options = q.options.map((o) => String(o ?? "").trim().slice(0, 160));
    if (options.some((o) => !o) || new Set(options.map((o) => o.toLowerCase())).size !== 4) continue;
    // opciones casi iguales (una contiene a la otra) confunden: se descarta la pregunta
    const n = options.map((o) => o.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim());
    if (n.some((a, i) => n.some((b, j) => i !== j && a.length >= 4 && b.includes(a)))) continue;
    const answer = Number(q.answer);
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    out.push({
      topic, question: q.question.trim().slice(0, 300), options, answer,
      explanation: String(q.explanation || "").trim().slice(0, 400),
      source: String(q.source || "").trim().slice(0, 120),
    });
  }
  return out;
}

// Deja solo las preguntas en que el verificador coincide con la respuesta y está seguro
export function applyVerification(qs, text) {
  let data;
  try { data = JSON.parse(stripFence(text)); } catch { return []; }
  const res = Array.isArray(data) ? data : data.results;
  if (!Array.isArray(res)) return [];
  return qs.filter((q, i) => {
    const r = res.find((x) => x && Number(x.i) === i);
    return r && r.confident === true && Number(r.correct) === q.answer;
  }).map((q) => ({ ...q, verified: true }));
}

// askJson(system, content, {signal}) → {ok, text, model}. Devuelve {ok, questions, dropped, error}
export async function fetchQuestions(askJson, topic, { n = 3, signal } = {}) {
  const avoid = loadScore().recent || [];
  const g = await askJson(GEN_SYSTEM, genPrompt(topic, n, avoid), { signal });
  if (!g || !g.ok) return { ok: false, stopped: !!(g && g.stopped), error: (g && (g.text || g.title)) || "No pude preparar preguntas." };
  const qs = parseQuestions(g.text, topic);
  if (!qs.length) return { ok: false, error: "La respuesta de Gemini no tenía preguntas válidas. Intente de nuevo." };
  const v = await askJson(VERIFY_SYSTEM, verifyPrompt(qs), { signal });
  if (!v || !v.ok) return { ok: false, stopped: !!(v && v.stopped), error: "No pude verificar las preguntas. Intente de nuevo." };
  const good = applyVerification(qs, v.text);
  return { ok: good.length > 0, questions: good, dropped: qs.length - good.length, model: g.model,
    error: good.length ? "" : "Ninguna pregunta pasó la verificación de datos. Pida otras." };
}
