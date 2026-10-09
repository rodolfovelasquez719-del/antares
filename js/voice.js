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

  // Prefiere una voz masculina y serena en español (Latinoamérica primero) si el sistema la tiene
  _pickVoice() {
    try {
      const voices = (this.synth.getVoices() || []).filter((v) => (v.lang || "").toLowerCase().startsWith("es"));
      if (!voices.length) return;
      const region = (v) => {
        const l = (v.lang || "").toLowerCase().replace("_", "-");
        return l === "es-cr" ? 0 : l === "es-mx" ? 1 : l === "es-us" ? 2 : l === "es-419" ? 2 : l.startsWith("es-") && l !== "es-es" ? 3 : 4;
      };
      const score = (v) => (MALE_HINTS.test(v.name) ? 0 : FEMALE_HINTS.test(v.name) ? 20 : 10) + region(v) + (v.localService ? 0 : 0.5);
      this.voice = [...voices].sort((a, b) => score(a) - score(b))[0];
    } catch (e) { console.warn("Antares voz:", e); }
  }

  // iOS/Safari solo permiten hablar después de un gesto del usuario: se "desbloquea" en el primer toque.
  unlock() {
    if (!this.synth || this.unlocked) return;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      this.synth.speak(u);
      this.unlocked = true;
    } catch (e) { console.warn("Antares voz (unlock):", e); }
  }

  // Devuelve una promesa que se cumple al terminar de hablar (o si falla). onSpeaking(true/false) avisa a la app
  // (el modo «Hey Antares» deja de escuchar mientras Antares habla, para no oírse a sí mismo).
  speak(text) {
    if (!this.synth || !text) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false, guard = null;
      const token = (this.utterId = (this.utterId || 0) + 1);
      const finish = (ok) => {
        if (done) return; done = true; clearTimeout(guard);
        if (this.utterId === token && this.speaking) {
          this.speaking = false;
          try { this.onSpeaking && this.onSpeaking(false); } catch { /* */ }
        }
        resolve(ok);
      };
      try {
        this.synth.cancel();
        const clean = String(text).replace(/https?:\/\/\S+/g, "").replace(/\p{Extended_Pictographic}|[\uFE0F\u200D]/gu, "").replace(/[*_#`>]+/g, " ").slice(0, 4000);
        const u = new SpeechSynthesisUtterance(clean);
        if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else { u.lang = "es-CR"; }
        u.rate = this.rate || 0.95;  // pausado
        u.pitch = 0.9;  // un poco más grave
        u.onend = () => finish(true);
        u.onerror = (e) => { console.warn("Antares voz:", e.error || e); finish(false); };
        this.speaking = true;
        try { this.onSpeaking && this.onSpeaking(true); } catch { /* */ }
        // por si el navegador nunca avisa el final: tiempo máximo según el largo del texto
        guard = setTimeout(() => finish(true), 4000 + clean.length * 90);
        this.synth.speak(u);
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
  listen({ lang = "es-CR", onInterim, onFinal, onState, onError } = {}) {
    if (!this.SR) { onError && onError("unsupported", "Este navegador no permite dictado por voz. Use el micrófono del teclado."); return; }
    if (this.listening) { this.stopListening(); return; }
    this.stop();
    const start = LANG_CHAIN.includes(lang) ? LANG_CHAIN.indexOf(lang) : 0;
    const chain = [...LANG_CHAIN.slice(start), ...LANG_CHAIN.slice(0, start)];
    if (this.workingLang && chain.indexOf(this.workingLang) > 0) chain.unshift(...chain.splice(chain.indexOf(this.workingLang), 1));
    const attempt = (i) => {
      let finalText = "", heard = false, retrying = false;
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
          onInterim && onInterim((finalText + interim).trim());
        };
        rec.onerror = (ev) => {
          console.warn("Antares voz (reconocimiento):", rec.lang, ev.error);
          if ((ev.error === "language-not-supported" || ev.error === "bad-grammar") && i + 1 < chain.length && !heard) {
            retrying = true; // probar el siguiente idioma de la cadena es-CR -> es-MX -> es-US
            return;
          }
          if (ev.error === "aborted") return;
          onError && onError(ev.error, speechErrorMessage(ev.error));
        };
        rec.onend = () => {
          this.listening = false;
          if (retrying) { attempt(i + 1); return; }
          if (heard) this.workingLang = rec.lang;
          onState && onState(false);
          if (finalText.trim()) onFinal && onFinal(finalText.trim());
        };
        this.recognition = rec;
        rec.start();
      } catch (e) {
        console.warn("Antares voz (reconocimiento):", e);
        this.listening = false;
        onState && onState(false);
        onError && onError("start", "No pude iniciar el dictado. Intente de nuevo.");
      }
    };
    attempt(0);
  }
}
