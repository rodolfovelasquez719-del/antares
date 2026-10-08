// Antares Web - Redactor de correos a vendedores. Gemini redacta; Antares nunca envía correos.
export const TEMPLATES = {
  cambio: { id: "cambio", label: "Cambio de día de entrega", hint: "El pedido pasa a otro día." },
  atraso: { id: "atraso", label: "Atraso en la entrega", hint: "El camión llega más tarde de lo previsto." },
  horario: { id: "horario", label: "Confirmación de horario", hint: "Se confirma la ventana de entrega." },
};

export function looksLikeMail(text) {
  return /^(?:por favor[,\s]+)?(?:redacte|escriba|prepare|haga)\s+(?:un\s+|el\s+)?correo\b/i.test(String(text || "").trim());
}

export function detectTemplate(text) {
  const t = String(text || "");
  if (/atras|demora|tarde|retraso/i.test(t)) return "atraso";
  if (/confirm|horario|ventana|hora\s+de\s+entrega/i.test(t)) return "horario";
  return "cambio";
}

// Instrucción para Gemini: devuelve asunto y cuerpo, trato de usted, sin inventar datos.
export function mailPrompt(text, templateId) {
  const tpl = TEMPLATES[templateId] || TEMPLATES.cambio;
  return [
    `Redacte un correo formal en español, con trato de usted, de tipo «${tpl.label}».`,
    "Lo escribe Freddy García, planificador de rutas de distribución de alimentos (MAYCA / Sysco Costa Rica), dirigido al vendedor o al cliente que se mencione.",
    "Use únicamente los datos que aparecen abajo. Si falta el nombre del destinatario, la fecha, la hora o el número de pedido, déjelo entre corchetes (por ejemplo [nombre del cliente]) en lugar de inventarlo.",
    "No prometa compensaciones, descuentos ni datos que no se indiquen.",
    "En el cuerpo, ponga el saludo en su propia línea, separe los párrafos con una línea en blanco y cierre con «Atentamente,» y la firma en líneas aparte. Sea breve (unas 80 a 140 palabras).",
    "Responda exactamente en este formato, sin comentarios adicionales:",
    "Asunto: …",
    "",
    "Cuerpo:",
    "…",
    "",
    `Pedido del usuario: ${text.trim()}`,
  ].join("\n");
}

// Separa "Asunto: …" y el cuerpo de la respuesta del modelo.
export function parseDraft(text) {
  const raw = String(text || "").trim();
  const m = raw.match(/asunto\s*:\s*(.+)/i);
  const subject = m ? m[1].trim().replace(/^["«]|["»]$/g, "") : "Entrega de su pedido";
  let body = raw.replace(/^[^\n]*asunto\s*:[^\n]*\n+/i, "");
  body = body.replace(/^\s*cuerpo\s*:\s*/i, "").trim();
  if (!body) body = raw;
  return { subject, body };
}

export function draftText({ subject, body }) {
  return `Asunto: ${subject}\n\n${body}\n\n(Borrador para copiar: Antares no envía correos.)`;
}
