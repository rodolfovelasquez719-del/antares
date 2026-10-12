// Antares Web - Voz con la Web Speech API. Las fallas se explican en español y nunca rompen el chat.
const LANG_CHAIN = ["es-CR", "es-MX", "es-US"];
const MALE_HINTS = /(jorge|diego|juan|carlos|pablo|andr[eé]s|enrique|[aá]lvaro|ra[uú]l|miguel|jos[eé]|antonio|manuel|francisco|javier|rodrigo|gonzalo|sergio|mart[ií]n|eduardo|reed|grandpa|male|hombre|masculin)/i;
const FEMALE_HINTS = /(paulina|m[oó]nica|luciana|marisol|sabina|helena|laura|paloma|elvira|dalia|camila|female|mujer|femenin|isabela|carmen|ines|lupe|penelope|ximena|valeria|sofia)/i;

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function speechErrorMessage(code) {
  switch (code) {
    case "not-allowed":
      return isIOS()
        ? "No tengo permiso para usar el micrófono. En Ajustes › Safari › Micrófono (o en Ajustes › Antares) permita el acceso e intente de nuevo."
        : "No tengo permiso para usar el micrófono. Toque el candado junto a la dirección y permita el micrófono.";
    case "service-not-allowed":
      return isIOS()
        ? "El dictado no está disponible. En el iPhone active Siri y Dictado: Ajustes › Siri (Hablar con Siri) y Ajustes › General › Teclado › Activar dictado."
        : "El servicio de dictado de este navegador no está disponible. Pruebe con Chrome o use el micrófono del teclado.";
    case "no-speech": return "No escuché nada. Toque el micrófono y hable cerca del teléfono.";
    case "audio-capture": return "No encontré un micrófono que funcione. Revise que ninguna otra app lo esté usando.";
    case "network": return "El dictado necesita internet y no pudo conectarse. Revise su conexión.";
    case "language-not-supported": return "Este dispositivo no tiene dictado en español disponible. Puede usar el micrófono del teclado.";
    case "bad-grammar": return "El dictado tuvo un problema. Intente de nuevo.";
    default: return "";
  }
}

export class Voice {
  constructor() {
    this.synth = "speechSynthesis" in window ? window.speechSynthesis : null;
    this.voice = null;
    this.unlocked = false;
    this.SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    this.recognition = null;
    this.listening = false;
    this.workingLang = "";
    if (this.synth) {
      this._pickVoice();
      try { this.synth.addEventListener("voiceschanged", () => this._pickVoice()); } catch { /* */ }
    }
  }

  get canSpeak() { return !!this.synth; }
  get canListen() { return !!this.SR; }

  // v1.15: voz masculina tipo «Jarvis» por defecto (serena, grave). Orden: Jorge, Juan, Diego, Carlos…; versiones Enhanced/Premium primero.
  static isMale(v) { return MALE_HINTS.test(v.name || "") && !FEMALE_HINTS.test(v.name || ""); }
  static voiceScore(v) {
    const n = (v.name || "").toLowerCase(), l = (v.lang || "").toLowerCase().replace("_", "-");
    const pref = ["jorge", "juan", "diego", "carlos"].findIndex((x) => n.includes(x));
    let sc = pref >= 0 ? pref : Voice.isMale(v) ? 6 : FEMALE_HINTS.test(n) ? 40 : 20;
    if (/enhanced|premium|mejorad|neural|natural/.test(n)) sc -= 3;
    if (/compact|eloquence|grandpa|grandma|bad news|bells|bubbles|jester|organ|whisper|zarvox|trinoids|cellos|albert|fred|junior|ralph|superstar|rocko|shelley|flo|reed|sandy|eddy/.test(n) && !/jorge|juan|diego|carlos/.test(n)) sc += 15;
    sc += l === "es-mx" || l === "es-us" || l === "es-419" ? 0 : l === "es-es" ? .5 : 1;
    return sc;
  }
  listVoices() {
    try {
      return (this.synth ? this.synth.getVoices() || [] : []).filter((v) => (v.lang || "").toLowerCase().startsWith("es"))
        .sort((a, b) => Voice.voiceScore(a) - Voice.voiceScore(b))
        .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, male: Voice.isMale(v) }));
    } catch { return []; }
  }
  _pickVoice() {
    try {
      const voices = (this.synth.getVoices() || []).filter((v) => (v.lang || "").toLowerCase().startsWith("es"));
      if (!voices.length) return;
      const chosen = this.preferredURI && voices.find((v) => v.voiceURI === this.preferredURI);
      this.voice = chosen || [...voices].sort((a, b) => Voice.voiceScore(a) - Voice.voiceScore(b))[0];
      this.onVoices && this.onVoices();
    } catch (e) { console.warn("Antares voz:", e); }
  }
  setPrefs({ voiceURI = "", rate = 0.95, pitch = 0.8 } = {}) {
    this.preferredURI = voiceURI || ""; this.rate = Number(rate) || 0.95; this.pitch = Number(pitch) || 0.8;
    if (this.synth) this._pickVoice();
  }

  // iOS/Safari solo permiten hablar después de un gesto del usuario: se "desbloquea" dentro del toque.
  // En iOS se repite en cada gesto mientras no esté hablando (iOS a veces vuelve a bloquear la voz al pasar a segundo plano).
  unlock() {
    if (!this.synth) return;
    try {
      if (this.synth.paused) this.synth.resume();
      if (this.speaking || (this.unlocked && !isIOS())) return;
      if (!this.voice) this._pickVoice();
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0; u.rate = 1.5;
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; }
      this.synth.speak(u);
      this.unlocked = true;
    } catch (e) { console.warn("Antares voz (unlock):", e); }
  }

  // Texto limpio para leer: sin markdown, emojis, enlaces ni bloques de código
  static clean(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+|www\.\S+/g, "")
      .replace(/\p{Extended_Pictographic}|[\uFE0F\u200D]|[\u{1F1E6}-\u{1F1FF}]/gu, "")
      .replace(/^\s*[-*•]\s+/gm, "").replace(/^\s*\d+[.)]\s+/gm, "").replace(/^#+\s*/gm, "")
      .replace(/[*_#`>|~]+/g, " ").replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim().slice(0, 6000);
  }
  // Trozos de ~200 caracteres por oración (iOS corta las frases largas)
  static chunks(text, max = 200) {
    const out = []; let cur = "";
    for (const sent of text.match(/[^.!?¡¿;:]+[.!?;:]*|[¡¿]/g) || [text]) {
      let s = sent.trim(); if (!s) continue;
      while (s.length > max) { let cut = s.lastIndexOf(" ", max); if (cut < 40) cut = max; out.push(((cur ? cur + " " : "") + s.slice(0, cut)).trim()); cur = ""; s = s.slice(cut).trim(); }
      if ((cur + " " + s).length > max && cur) { out.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
    }
    if (cur) out.push(cur);
    return out.filter((x) => /[\p{L}\p{N}]/u.test(x));
  }

  // Devuelve una promesa que se cumple al terminar de hablar (o si falla). onSpeaking(true/false) avisa a la app
  // (el modo «Hey Antares» deja de escuchar mientras Antares habla). onAudio(true/false) sigue el sonido real (onstart/onend).
  speak(text) {
    if (!this.synth || !text) return Promise.resolve(false);
    const parts = Voice.chunks(Voice.clean(text));
    if (!parts.length) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false, guard = null, keep = null, idx = 0, audible = false;
      const token = (this.utterId = (this.utterId || 0) + 1);
      const audio = (on) => { if (audible === on) return; audible = on; try { this.onAudio && this.onAudio(on); } catch { /* */ } };
      const finish = (ok) => {
        if (done) return; done = true; clearTimeout(guard); clearInterval(keep); audio(false);
        if (this.utterId === token && this.speaking) {
          this.speaking = false;
          try { this.onSpeaking && this.onSpeaking(false); } catch { /* */ }
        }
        resolve(ok);
      };
      const next = () => {
        if (done || this.utterId !== token) return finish(false);
        if (idx >= parts.length) return finish(true);
        const chunk = parts[idx++];
        const u = new SpeechSynthesisUtterance(chunk);
        if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else { u.lang = "es-MX"; }
        u.rate = this.rate || 0.95; u.pitch = this.pitch || 0.8; u.volume = 1;
        let started = false;
        u.onstart = () => { started = true; audio(true); };
        u.onboundary = () => { audio(true); try { this.onWord && this.onWord(); } catch { /* */ } };
        u.onend = () => { if (this.utterId === token) next(); };
        u.onerror = (e) => {
          const code = e && e.error;
          if (code === "interrupted" || code === "canceled") return finish(false);
          console.warn("Antares voz:", code || e);
          if (idx < parts.length) next(); else finish(false);
        };
        clearTimeout(guard);
        // por si el navegador nunca avisa el final: tiempo máximo según el largo del trozo
        guard = setTimeout(() => { if (!started) { console.warn("Antares voz: no arrancó"); } next(); }, 6000 + chunk.length * 110);
        this.synth.speak(u);
        // iOS: si quedó en pausa, reanudar
        setTimeout(() => { try { if (this.synth.paused) this.synth.resume(); } catch { /* */ } }, 250);
      };
      try {
        this.synth.cancel();
        if (this.synth.paused) this.synth.resume();
        this.speaking = true;
        try { this.onSpeaking && this.onSpeaking(true); } catch { /* */ }
        // Chrome se detiene a los ~15 s; un pause/resume periódico lo mantiene vivo (en iOS solo se reanuda si se pausó)
        keep = setInterval(() => { try { if (!this.synth.speaking) return; if (isIOS()) { if (this.synth.paused) this.synth.resume(); } else { this.synth.pause(); this.synth.resume(); } } catch { /* */ } }, 9000);
        // cancel() y speak() seguidos fallan en algunos Safari: un respiro corto
        setTimeout(next, isIOS() ? 60 : 0);
      } catch (e) { console.warn("Antares voz:", e); finish(false); }
    });
  }

  stop() {
    this.utterId = (this.utterId || 0) + 1;
    try { this.synth && this.synth.cancel(); } catch { /* */ }
    if (this.speaking) { this.speaking = false; try { this.onSpeaking && this.onSpeaking(false); } catch { /* */ } }
  }

  stopListening() { if (this.listening && this.recognition) { try { this.recognition.stop(); } catch { /* */ } } }

  // onInterim(texto) mientras habla, onFinal(texto) al terminar, onState(escuchando), onError(código, mensaje)
  listen({ lang = "es-CR", onInterim, onFinal, onState, onError, onEnd, silenceMs = 0 } = {}) {
    if (!this.SR) { onError && onError("unsupported", "Este navegador no permite dictado por voz. Use el micrófono del teclado."); return; }
    if (this.listening) { this.stopListening(); return; }
    this.stop();
    const start = LANG_CHAIN.includes(lang) ? LANG_CHAIN.indexOf(lang) : 0;
    const chain = [...LANG_CHAIN.slice(start), ...LANG_CHAIN.slice(0, start)];
    if (this.workingLang && chain.indexOf(this.workingLang) > 0) chain.unshift(...chain.splice(chain.indexOf(this.workingLang), 1));
    const attempt = (i) => {
      let finalText = "", lastInterim = "", heard = false, retrying = false, silence = null, errCode = "";
      try {
        const rec = new this.SR();
        rec.lang = chain[i];
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;
        rec.onstart = () => { this.listening = true; onState && onState(true); };
        rec.onresult = (ev) => {
          heard = true;
          let interim = "";
          for (let k = ev.resultIndex; k < ev.results.length; k++) {
            const t = ev.results[k][0].transcript;
            if (ev.results[k].isFinal) finalText += t; else interim += t;
          }
          lastInterim = (finalText + interim).trim();
          onInterim && onInterim(lastInterim);
          // v1.16: fin de frase por silencio (modo conversación)
          if (silenceMs) { clearTimeout(silence); silence = setTimeout(() => { try { rec.stop(); } catch { /* */ } }, silenceMs); }
        };
        rec.onerror = (ev) => {
          console.warn("Antares voz (reconocimiento):", rec.lang, ev.error);
          if ((ev.error === "language-not-supported" || ev.error === "bad-grammar") && i + 1 < chain.length && !heard) {
            retrying = true; // probar el siguiente idioma de la cadena es-CR -> es-MX -> es-US
            return;
          }
          errCode = ev.error || "error";
          if (ev.error === "aborted") return;
          if (onEnd && (ev.error === "no-speech" || ev.error === "network" || ev.error === "audio-capture")) return; // el modo conversación reintenta solo
          onError && onError(ev.error, speechErrorMessage(ev.error));
        };
        rec.onend = () => {
          this.listening = false; clearTimeout(silence);
          if (retrying) { attempt(i + 1); return; }
          if (heard) this.workingLang = rec.lang;
          onState && onState(false);
          // iOS a veces termina sin resultado "final": se usa lo último que se oyó
          const text = finalText.trim() || (silenceMs ? lastInterim : "");
          if (text) onFinal && onFinal(text);
          onEnd && onEnd({ heard: !!text, error: errCode });
        };
        this.recognition = rec;
        rec.start();
      } catch (e) {
        console.warn("Antares voz (reconocimiento):", e);
        this.listening = false;
        onState && onState(false);
        if (onEnd) onEnd({ heard: false, error: "start" });
        else onError && onError("start", "No pude iniciar el dictado. Intente de nuevo.");
      }
    };
    attempt(0);
  }
}
