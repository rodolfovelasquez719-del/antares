// Antares Web - Voz con la Web Speech API. Las fallas se registran en consola y nunca rompen el chat.
const PREFERRED_LANGS = ["es-CR", "es-419", "es-MX", "es-US", "es-ES", "es"];

export class Voice {
  constructor() {
    this.synth = "speechSynthesis" in window ? window.speechSynthesis : null;
    this.voice = null;
    this.unlocked = false;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.SR = SR || null;
    this.recognition = null;
    this.listening = false;
    if (this.synth) {
      this._pickVoice();
      try { this.synth.addEventListener("voiceschanged", () => this._pickVoice()); } catch { /* */ }
    }
  }

  get canSpeak() { return !!this.synth; }
  get canListen() { return !!this.SR; }

  _pickVoice() {
    try {
      const voices = this.synth.getVoices() || [];
      for (const lang of PREFERRED_LANGS) {
        const v = voices.find((x) => (x.lang || "").toLowerCase().replace("_", "-") === lang.toLowerCase())
          || (lang === "es" ? voices.find((x) => (x.lang || "").toLowerCase().startsWith("es")) : null);
        if (v) { this.voice = v; return; }
      }
    } catch (e) { console.warn("Antares voz:", e); }
  }

  // iOS/Safari solo permiten hablar después de un gesto del usuario: "desbloqueamos" en el primer toque.
  unlock() {
    if (!this.synth || this.unlocked) return;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      this.synth.speak(u);
      this.unlocked = true;
    } catch (e) { console.warn("Antares voz (unlock):", e); }
  }

  speak(text) {
    if (!this.synth || !text) return;
    try {
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 4000));
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else { u.lang = "es-CR"; }
      u.rate = 1.0;
      u.onerror = (e) => console.warn("Antares voz:", e.error || e);
      this.synth.speak(u);
    } catch (e) { console.warn("Antares voz:", e); }
  }

  stop() { try { this.synth && this.synth.cancel(); } catch { /* */ } }

  // onInterim(texto) mientras habla, onFinal(texto) al terminar, onState(escuchando)
  listen({ onInterim, onFinal, onState, onError } = {}) {
    if (!this.SR) return;
    if (this.listening) { try { this.recognition.stop(); } catch { /* */ } return; }
    this.stop();
    try {
      const rec = new this.SR();
      rec.lang = "es-CR";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let finalText = "";
      rec.onstart = () => { this.listening = true; onState && onState(true); };
      rec.onresult = (ev) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalText += t; else interim += t;
        }
        onInterim && onInterim((finalText + interim).trim());
      };
      rec.onerror = (ev) => { console.warn("Antares voz (reconocimiento):", ev.error); onError && onError(ev.error); };
      rec.onend = () => {
        this.listening = false;
        onState && onState(false);
        if (finalText.trim()) onFinal && onFinal(finalText.trim());
      };
      this.recognition = rec;
      rec.start();
    } catch (e) {
      console.warn("Antares voz (reconocimiento):", e);
      this.listening = false;
      onState && onState(false);
    }
  }
}
