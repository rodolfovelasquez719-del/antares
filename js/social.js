// Antares Web - Reacciones con emoji y stickers propios (v1.10.0).
// El modelo puede terminar su respuesta con etiquetas ocultas [[react:❤️]] o [[sticker:id]]; la app las quita
// antes de mostrar, leer en voz alta o guardar, y decide con un límite de frecuencia si las aplica.
// Los stickers son SVG dibujados aquí (sin descargas ni licencias de terceros): funcionan sin conexión.

export const REACTIONS = [
  { e: "👍", label: "Me gusta" },
  { e: "❤️", label: "Me encanta" },
  { e: "🎉", label: "Celebración" },
  { e: "😂", label: "Me da risa" },
  { e: "✅", label: "Hecho" },
  { e: "😮", label: "Sorpresa" },
];
const norm = (e) => String(e || "").replace(/\uFE0F/g, "").trim();
export function reaction(e) { const n = norm(e); return REACTIONS.find((r) => norm(r.e) === n) || null; }

// ---------- Stickers (viewBox 0 0 120 120, estilo Jarvis: placa oscura, borde cian brillante) ----------
const C = "#00e5ff", C2 = "#5ff1ff", INK = "#06141c", W = "#eafcff", AMB = "#ffc457", PINK = "#ff5c8a", OK = "#4dffb8";
const plate = (extra = "") => `<circle cx="60" cy="60" r="54" fill="#071a24" stroke="${C}" stroke-width="4"/><circle cx="60" cy="60" r="47" fill="none" stroke="${C}" stroke-opacity=".28" stroke-width="2" stroke-dasharray="4 6"/>${extra}`;
const label = (t, y = 101, size = 13) => `<rect x="14" y="${y - 13}" width="92" height="19" rx="9.5" fill="${INK}" stroke="${C2}" stroke-width="2"/><text x="60" y="${y + 1}" text-anchor="middle" font-size="${size}" font-weight="700" letter-spacing="1" fill="${W}" class="stk-txt">${t}</text>`;
const face = (cx = 60, cy = 56, r = 30) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}" stroke="${C2}" stroke-width="3.5"/>`;
const STICKER_ART = {
  pulgar: plate(`<path d="M44 58h-9v30h9zM48 58l12-22c4-6 11-3 10 4l-3 12h16c5 0 8 4 7 8l-5 22c-1 4-4 6-8 6H48z" fill="${C2}" stroke="${W}" stroke-width="3" stroke-linejoin="round"/><path d="M70 66h14M68 76h13" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity=".55"/>`),
  corazon: plate(`<path d="M60 92 30 63c-9-9-8-23 2-29 8-5 18-3 24 4l4 5 4-5c6-7 16-9 24-4 10 6 11 20 2 29z" fill="${PINK}" stroke="${W}" stroke-width="3.5" stroke-linejoin="round"/><path d="M38 50c2-5 7-8 12-7" stroke="${W}" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".8"/>`),
  fiesta: plate(`<path d="M32 92 50 44l26 26z" fill="${AMB}" stroke="${W}" stroke-width="3" stroke-linejoin="round"/><path d="M42 72l12 12M46 60l18 18" stroke="${INK}" stroke-width="3" opacity=".5"/><circle cx="74" cy="34" r="4" fill="${PINK}"/><circle cx="88" cy="50" r="3.5" fill="${C2}"/><circle cx="64" cy="26" r="3" fill="${OK}"/><circle cx="92" cy="70" r="3.5" fill="${AMB}"/><path d="M60 40c4-8 12-8 14-16M80 58c8-2 12 4 18 0M70 48l12-12" stroke="${C2}" stroke-width="3" stroke-linecap="round" fill="none"/>`),
  reactor: plate(`<circle cx="60" cy="54" r="26" fill="${INK}" stroke="${C2}" stroke-width="3"/><circle cx="60" cy="54" r="17" fill="none" stroke="${C}" stroke-width="5" stroke-dasharray="7 4"/><circle cx="60" cy="54" r="8" fill="${W}"/><circle cx="51" cy="50" r="2.6" fill="${INK}"/><circle cx="69" cy="50" r="2.6" fill="${INK}"/><path d="M53 57c3 4 11 4 14 0" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" fill="none"/>${label("¡ACTIVO!", 97)}`),
  listo: plate(`<circle cx="60" cy="50" r="24" fill="${INK}" stroke="${OK}" stroke-width="4"/><path d="M48 51l8 8 16-17" stroke="${OK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>${label("LISTO", 98, 15)}`),
  "buenas-noches": plate(`<path d="M70 26a26 26 0 1 0 14 44A22 22 0 0 1 70 26z" fill="${AMB}" stroke="${W}" stroke-width="3" stroke-linejoin="round"/><path d="M36 34l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM88 30l1.5 3.5 3.5 1.5-3.5 1.5L88 40l-1.5-3.5L83 35l3.5-1.5z" fill="${C2}"/>${label("BUENAS NOCHES", 98, 10.5)}`),
  "buenos-dias": plate(`<circle cx="60" cy="52" r="15" fill="${AMB}" stroke="${W}" stroke-width="3"/><g stroke="${AMB}" stroke-width="4" stroke-linecap="round"><path d="M60 24v-6M60 86v-6M32 52h-6M94 52h-6M40 32l-4-4M84 76l-4-4M80 32l4-4M36 76l4-4"/></g><path d="M54 52c2 3 10 3 12 0" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" fill="none"/>${label("BUENOS DÍAS", 98, 11)}`),
  "robot-saludo": plate(`<rect x="36" y="40" width="40" height="34" rx="9" fill="${INK}" stroke="${C2}" stroke-width="3.5"/><path d="M56 40V30" stroke="${C2}" stroke-width="3"/><circle cx="56" cy="27" r="4" fill="${C}"/><circle cx="48" cy="55" r="4.5" fill="${C}"/><circle cx="64" cy="55" r="4.5" fill="${C}"/><path d="M48 65h16" stroke="${C2}" stroke-width="3" stroke-linecap="round"/><path d="M76 58l10-14" stroke="${C2}" stroke-width="5" stroke-linecap="round"/><path d="M83 38c2-5 9-4 9 1l-2 9" fill="none" stroke="${W}" stroke-width="3.5" stroke-linecap="round"/><path d="M92 30c4 2 6 6 6 10M96 24c6 3 9 9 9 15" stroke="${C}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/><rect x="40" y="76" width="32" height="14" rx="4" fill="${INK}" stroke="${C2}" stroke-width="3"/>`),
  risa: plate(`${face()}<path d="M44 48l7 4-7 4M76 48l-7 4 7 4" stroke="${C2}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M44 62h32c0 12-7 19-16 19s-16-7-16-19z" fill="${W}" stroke="${C2}" stroke-width="2.5" stroke-linejoin="round"/><path d="M28 50c-4 6-4 11 0 14M92 50c4 6 4 11 0 14" stroke="${C}" stroke-width="4" stroke-linecap="round" fill="none"/>`),
  pensando: plate(`${face(56, 60, 28)}<circle cx="47" cy="54" r="3.5" fill="${C2}"/><circle cx="64" cy="52" r="3.5" fill="${C2}"/><path d="M48 70h14" stroke="${C2}" stroke-width="3" stroke-linecap="round"/><path d="M58 86c4-6 12-8 14-4 2 3-3 6-7 6" fill="${INK}" stroke="${W}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="86" cy="36" r="10" fill="${INK}" stroke="${C2}" stroke-width="2.5"/><text x="86" y="41" text-anchor="middle" font-size="14" font-weight="700" fill="${AMB}" class="stk-txt">?</text><circle cx="78" cy="50" r="2.5" fill="${C2}"/>`),
  camion: plate(`<rect x="22" y="42" width="48" height="32" rx="3" fill="${INK}" stroke="${C2}" stroke-width="3.5"/><path d="M70 50h14l12 13v11H70z" fill="${C2}" stroke="${W}" stroke-width="3" stroke-linejoin="round"/><path d="M76 54h7l7 8H76z" fill="${INK}"/><circle cx="38" cy="78" r="7" fill="${INK}" stroke="${W}" stroke-width="3"/><circle cx="82" cy="78" r="7" fill="${INK}" stroke="${W}" stroke-width="3"/><path d="M30 53h30M30 62h20" stroke="${C}" stroke-width="3" stroke-linecap="round" opacity=".7"/>${label("EN RUTA", 101, 12)}`),
  cafe: plate(`<path d="M34 50h40v18c0 12-9 20-20 20s-20-8-20-20z" fill="${INK}" stroke="${C2}" stroke-width="3.5" stroke-linejoin="round"/><path d="M74 55h6c5 0 8 4 8 8s-3 8-8 8h-7" fill="none" stroke="${C2}" stroke-width="3.5"/><path d="M38 56h32" stroke="${AMB}" stroke-width="5" opacity=".9"/><path d="M46 42c-4-5 4-8 0-14M56 42c-4-5 4-8 0-14M66 42c-4-5 4-8 0-14" stroke="${W}" stroke-width="3" stroke-linecap="round" fill="none" opacity=".85"/><path d="M30 92h52" stroke="${C}" stroke-width="3" stroke-linecap="round"/>`),
};
export const STICKERS = [
  { id: "pulgar", label: "Pulgar arriba" },
  { id: "corazon", label: "Corazón" },
  { id: "fiesta", label: "Fiesta" },
  { id: "reactor", label: "Reactor feliz" },
  { id: "listo", label: "Listo" },
  { id: "buenos-dias", label: "Buenos días" },
  { id: "buenas-noches", label: "Buenas noches" },
  { id: "robot-saludo", label: "Robot saludando" },
  { id: "risa", label: "Risa" },
  { id: "pensando", label: "Pensando" },
  { id: "camion", label: "Camión en ruta" },
  { id: "cafe", label: "Café" },
];
export const sticker = (id) => STICKERS.find((s) => s.id === String(id || "").trim().toLowerCase()) || null;
export function stickerSvg(id) {
  const art = STICKER_ART[id];
  return art ? `<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">${art}</svg>` : "";
}
export function stickerEl(id) {
  const s = sticker(id);
  if (!s) return null;
  const el = document.createElement("div");
  el.className = "sticker";
  el.dataset.sticker = s.id;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `Sticker: ${s.label}`);
  el.innerHTML = stickerSvg(s.id); // contenido fijo de este archivo (no viene del modelo)
  return el;
}

// ---------- Etiquetas ocultas ----------
const TAG_RE = /\[\[\s*(react|reacci[oó]n|reaccion|sticker)\s*[:=]\s*([^\]\n]{1,40}?)\s*\]\]/gi;
const LOOSE_RE = /\[\s*(react|sticker)\s*:\s*[^\]\n]{1,40}\]/gi; // por si el modelo usa un solo corchete
export function parseReply(raw) {
  let react = null, stickerId = null;
  let text = String(raw || "").replace(TAG_RE, (m, kind, val) => {
    if (/^s/i.test(kind)) { const s = sticker(val); if (s && !stickerId) stickerId = s.id; }
    else { const r = reaction(val); if (r && !react) react = r.e; }
    return "";
  });
  text = text.replace(LOOSE_RE, (m) => { const inner = m.slice(1, -1); const [k, v] = inner.split(":"); if (/^s/i.test(k.trim())) { const s = sticker(v); if (s && !stickerId) stickerId = s.id; } else { const r = reaction(v); if (r && !react) react = r.e; } return ""; });
  text = text.replace(/\[\[[^\]\n]{0,60}\]\]/g, "").replace(/\[\[[^\]\n]{0,60}$/, ""); // etiquetas desconocidas o cortadas
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return { text, react, sticker: stickerId };
}
// Durante el streaming: quitar etiquetas completas y una etiqueta a medio llegar al final
export function stripPartial(t) {
  return String(t || "").replace(TAG_RE, "").replace(LOOSE_RE, "").replace(/\[\[[^\]\n]{0,60}\]\]/g, "").replace(/\[\[?\s*[a-zó]{0,9}\s*(?:[:=][^\]\n]{0,40})?\]?$/i, "").replace(/\s+$/, "");
}
export const hasTag = (t) => /\[\[|\[\s*(react|sticker)\s*:/i.test(String(t || ""));

// ---------- Cuándo se permiten (la app pone el límite, no solo el modelo) ----------
const ACK_RE = /^\s*(?:muchas\s+|mil\s+)?(?:gracias|grax|ok(?:ay|ey)?|okis|dale|listo|perfecto|excelente|genial|de acuerdo|entendido|vale|bueno|muy bien|bien|s[uú]per|claro|s[ií]|ya|hecho|buen[ií]simo|qu[eé] bien|👍|❤️|🙏)(?:[\s,.!¡]+(?:muchas\s+)?(?:gracias|muchas gracias|amigo|entonces|pues|antares|jarvis))*[\s.!¡😊🙏👍❤️]*$/iu;
export const isAck = (t) => String(t || "").length <= 40 && ACK_RE.test(String(t || ""));
// history: mensajes guardados ANTERIORES a esta respuesta (el último es el del usuario)
// Stickers: como mucho uno cada 8 h (Poco: 48 h) y solo a veces (60 % / 30 %), salvo que la respuesta sea solo el
// sticker o conteste a un sticker del usuario. rnd se puede fijar en pruebas.
const STICKER_GAP_H = { normal: 8, poco: 48 };
const STICKER_CHANCE = { normal: 0.6, poco: 0.3 };
export function gate({ react, sticker: st, userText, history = [], freq = "normal", textEmpty = false, replyToSticker = false, now = Date.now(), rnd = Math.random }) {
  const poco = freq === "poco";
  const users = history.filter((m) => m.role === "user");
  const bots = history.filter((m) => m.role === "assistant");
  const lastUsers = users.slice(-(poco ? 6 : 3), -1); // sin contar el mensaje actual
  const reactedRecently = lastUsers.some((m) => m.reactions && m.reactions.a);
  const stickerRecently = bots.slice(-(poco ? 12 : 6)).some((m) => m.sticker);
  const ack = isAck(userText);
  const okReact = !!react && (ack || textEmpty || !reactedRecently);
  const lastSt = [...bots].reverse().find((m) => m.sticker);
  const gapOk = !lastSt || !lastSt.ts || now - Date.parse(lastSt.ts) >= STICKER_GAP_H[poco ? "poco" : "normal"] * 3600e3;
  const okSticker = !!st && (textEmpty || (replyToSticker ? !stickerRecently : (!stickerRecently && gapOk && rnd() < STICKER_CHANCE[poco ? "poco" : "normal"])));
  return { react: okReact ? react : null, sticker: okSticker ? st : null };
}

// ---------- Indicaciones para el modelo ----------
export function socialRules(freq = "normal") {
  return "REACCIONES Y STICKERS (la app los muestra; el usuario nunca ve las etiquetas):\n" +
    "- Puede reaccionar al último mensaje del usuario con UN emoji escribiendo al FINAL de su respuesta la etiqueta " +
    "[[react:EMOJI]], donde EMOJI es uno de: 👍 ❤️ 🎉 😂 ✅ 😮. Hágalo como una persona: ante un agradecimiento, una buena " +
    "noticia, un logro, algo gracioso o una confirmación. NO reaccione a preguntas normales ni a la mayoría de los mensajes.\n" +
    "- Si el mensaje del usuario es solo un agradecimiento o una confirmación corta (\"gracias\", \"dale\", \"listo\", \"ok\", " +
    "\"perfecto\"), responda SOLO con la etiqueta de reacción, o con la reacción y una frase muy corta (máximo 6 palabras). " +
    "No ofrezca más ayuda en ese caso.\n" +
    "- De vez en cuando (un saludo de buenos días o buenas noches, una celebración, una buena noticia) puede enviar un " +
    "sticker con [[sticker:ID]] al final (solo en algunos saludos, no en todos). IDs: " + STICKERS.map((s) => s.id).join(", ") + ". Como máximo uno, y nunca " +
    "en respuestas a preguntas informativas o de trabajo.\n" +
    "- Las etiquetas van solo al final, sin explicarlas ni mencionarlas.\n" +
    "- Esto reemplaza la indicación de no usar emojis: puede usar algún emoji en el texto con moderación (como mucho uno, " +
    "y no en todas las respuestas), manteniendo siempre el usted, el tono profesional y sin jerga." +
    (freq === "poco" ? "\n- El usuario prefiere POCAS reacciones y stickers: úselos solo cuando sea claramente apropiado." : "");
}
export function stickerPrompt(s) {
  return `[El usuario le envió el sticker «${s.label}».] Respóndale con naturalidad y muy brevemente, como lo haría una ` +
    "persona: con una reacción, una frase corta o, si encaja, otro sticker.";
}
// Texto para el historial que recibe el modelo
export function modelContent(m) {
  if (m.role === "user" && m.sticker) { const s = sticker(m.sticker); return `[Sticker: ${s ? s.label : m.sticker}]`; }
  if (m.role === "assistant" && !m.content && m.reactOnly) return m.reactOnly;
  return m.content;
}

// ---------- Interfaz: píldoras de reacción y barra para reaccionar ----------
// reactions: {a: emoji de Antares, u: emoji del usuario}
export function renderReactions(wrap, reactions, { botName = "Antares", onMine = null } = {}) {
  let row = wrap.querySelector(":scope > .reactions");
  const has = reactions && (reactions.a || reactions.u);
  if (!has) { if (row) row.remove(); return; }
  if (!row) {
    row = document.createElement("div");
    row.className = "reactions";
    const bubble = wrap.querySelector(":scope > .bubble");
    if (bubble && bubble.nextSibling) wrap.insertBefore(row, bubble.nextSibling); else wrap.appendChild(row);
  }
  row.replaceChildren();
  if (reactions.a) {
    const r = reaction(reactions.a);
    const s = document.createElement("span");
    s.className = "react-pill from-bot";
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", `${botName} reaccionó: ${r ? r.label : ""}`.trim());
    const i = document.createElement("i"); i.textContent = r ? r.e : reactions.a; i.setAttribute("aria-hidden", "true");
    s.appendChild(i);
    row.appendChild(s);
  }
  if (reactions.u) {
    const r = reaction(reactions.u);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "react-pill mine";
    b.setAttribute("aria-label", `Su reacción: ${r ? r.label : ""}. Toque para cambiarla o quitarla`);
    const i = document.createElement("i"); i.textContent = r ? r.e : reactions.u; i.setAttribute("aria-hidden", "true");
    b.appendChild(i);
    if (onMine) b.addEventListener("click", (ev) => { ev.stopPropagation(); onMine(wrap); });
    row.appendChild(b);
  }
}
export function closeReactBar() {
  for (const bar of document.querySelectorAll(".react-bar")) {
    const back = bar.__back;
    bar.remove();
    if (back && back.isConnected) back.focus({ preventScroll: true });
  }
}
// Abre la barra de 6 emojis junto al mensaje. onPick(emoji|null)
export function openReactBar(wrap, current, onPick, { returnFocus = null } = {}) {
  closeReactBar();
  const bar = document.createElement("div");
  bar.className = "react-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Reaccionar al mensaje");
  bar.__back = returnFocus;
  for (const r of REACTIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = r.e;
    b.setAttribute("aria-label", `Reaccionar con ${r.label}`);
    b.setAttribute("aria-pressed", String(norm(current) === norm(r.e)));
    b.addEventListener("click", (ev) => { ev.stopPropagation(); bar.__back = returnFocus; closeReactBar(); onPick(norm(current) === norm(r.e) ? null : r.e); });
    bar.appendChild(b);
  }
  if (current) {
    const x = document.createElement("button");
    x.type = "button"; x.className = "rb-clear"; x.textContent = "Quitar";
    x.setAttribute("aria-label", "Quitar su reacción");
    x.addEventListener("click", (ev) => { ev.stopPropagation(); closeReactBar(); onPick(null); });
    bar.appendChild(x);
  }
  bar.addEventListener("keydown", (ev) => {
    const btns = [...bar.querySelectorAll("button")];
    const i = btns.indexOf(document.activeElement);
    if (ev.key === "Escape") { ev.preventDefault(); closeReactBar(); }
    else if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { ev.preventDefault(); btns[(i + (ev.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length].focus(); }
  });
  wrap.appendChild(bar);
  requestAnimationFrame(() => { const first = bar.querySelector('[aria-pressed="true"]') || bar.querySelector("button"); first && first.focus({ preventScroll: true }); bar.scrollIntoView({ block: "nearest" }); });
  return bar;
}
