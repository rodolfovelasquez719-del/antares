// Modo «Hey Antares»: escucha continua con Web Speech mientras la app está abierta y visible.
// Detecta la palabra de activación («Antares», «Hey Antares», «Oye Antares»), toma el comando y lo entrega.
// Para no gastar batería: se pausa cuando la app se oculta, se bloquea o habla; reinicia con espera creciente
// tras errores y se detiene sola después de N minutos sin oír la palabra de activación.
const norm = (s) => String(s || "").normalize("NFC").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const FILLER = "(?:hey|hei|ei|ey|oye|oiga|hola|ok|okay)";
export function wakeRegex(name = "Antares") {
  const base = norm(name).replace(/[^a-z0-9ñ ]/g, "").trim() || "antares";
  // «antares» tolera lo que suelen escribir los dictados: «antárez», «an tares», «ant ares», «antare»
  const word = base === "antares" ? "an\\s?t\\s?ar[e]?[sz]?" : base.replace(/\s+/g, "\\s?").replace(/s\b/, "[sz]?");
  // al inicio de lo dicho («Antares, …»), o en cualquier parte si va precedida de «hey/oye» («… oye Antares, …»)
  return new RegExp(`(?:^[\\s,.;:!?¡¿]*(?:${FILLER}[\\s,]+)?|(?:^|[\\s,.;:!?¡¿])${FILLER}[\\s,]+)${word}\\b[\\s,.;:!?]*`, "i");
}

// Devuelve {found, command} buscando la palabra de activación en el texto
export function findWake(text, re = wakeRegex()) {
  const n = norm(text);
  const m = n.match(re);
  if (!m) return { found: false, command: "" };
  // el comando es lo que sigue a la palabra, tomado del texto original (con tildes)
  const end = m.index + m[0].length;
  const command = String(text).normalize("NFC").slice(end).replace(/^[\s,.;:!?¡¿]+/, "").trim();
  return { found: true, command };
}

export class WakeWord {
  constructor({ SR, lang = "es-CR", name = "Antares", idleMs = 10 * 60 * 1000, commandMs = 8000,
    onState = () => {}, onWake = () => {}, onCommand = () => {}, onInterim = () => {}, onError = () => {}, now = () => Date.now() } = {}) {
    Object.assign(this, { SR, lang, idleMs, commandMs, onState, onWake, onCommand, onInterim, onError, now });
    this.re = wakeRegex(name);
    this.enabled = false; this.paused = false; this.rec = null; this.state = "off";
    this.fails = 0; this.startedAt = 0; this.lastWakeAt = 0; this.restarts = 0;
    this.restartTimer = null; this.commandTimer = null; this.idleTimer = null;
  }
  setState(s, info) { if (this.state !== s) { this.state = s; this.onState(s, info); } }

  start() {
    if (!this.SR) { this.onError("unsupported"); return false; }
    this.enabled = true; this.paused = false; this.fails = 0;
    this.lastWakeAt = this.now();
    clearInterval(this.idleTimer);
    this.idleTimer = setInterval(() => this.checkIdle(), 15000);
    this.spawn();
    return true;
  }
  stop(reason = "off") {
    this.enabled = false;
    clearTimeout(this.restartTimer); clearTimeout(this.commandTimer); clearInterval(this.idleTimer);
    this.kill();
    this.setState(reason === "idle" ? "idle" : "off", reason);
  }
  pause(why = "") {
    if (!this.enabled) return;
    this.paused = true;
    clearTimeout(this.restartTimer); clearTimeout(this.commandTimer);
    this.kill();
    this.setState("paused", why);
  }
  resume() {
    if (!this.enabled || !this.paused) return;
    this.paused = false; this.fails = 0;
    this.lastWakeAt = Math.max(this.lastWakeAt, this.now() - this.idleMs / 2); // volver a la app cuenta como actividad
    this.schedule(200);
  }
  touch() { this.lastWakeAt = this.now(); }
  checkIdle() {
    if (this.enabled && !this.paused && this.now() - this.lastWakeAt >= this.idleMs) this.stop("idle");
  }
  kill() {
    const r = this.rec; this.rec = null;
    if (r) { r.onend = r.onresult = r.onerror = r.onstart = null; try { r.abort(); } catch { /* */ } }
  }
  schedule(ms) {
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this.spawn(), ms);
  }
  spawn() {
    if (!this.enabled || this.paused || this.rec) return;
    this.checkIdle();
    if (!this.enabled) return;
    let rec;
    try {
      rec = new this.SR();
      rec.lang = this.lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    } catch { this.onError("start"); this.stop("error"); return; }
    this.rec = rec;
    rec.onstart = () => { this.startedAt = this.now(); this.setState(this.state === "command" ? "command" : "listening"); };
    rec.onresult = (ev) => {
      for (let k = ev.resultIndex; k < ev.results.length; k++) {
        const res = ev.results[k];
        const text = res[0] && res[0].transcript ? res[0].transcript : "";
        if (res.isFinal) this.handleFinal(text);
        else this.handleInterim(text);
      }
    };
    rec.onerror = (ev) => {
      const code = ev && ev.error;
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        this.onError(code); this.stop("error"); return;
      }
      if (code === "network" || code === "language-not-supported") this.fails++;
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      if (!this.enabled || this.paused) return;
      // si terminó muy rápido, algo falla: esperar cada vez más (0,5 s, 1 s, 2 s… hasta 30 s)
      const quick = this.now() - this.startedAt < 1500;
      this.fails = quick ? this.fails + 1 : 0;
      this.restarts++;
      this.schedule(this.fails ? Math.min(30000, 500 * 2 ** (this.fails - 1)) : 250);
    };
    try { rec.start(); } catch { this.rec = null; this.fails++; this.schedule(Math.min(30000, 500 * 2 ** this.fails)); }
  }
  handleInterim(text) {
    if (this.state === "command") { this.onInterim(text); return; }
    const w = findWake(text, this.re);
    if (w.found) this.onInterim(w.command);
  }
  handleFinal(text) {
    if (this.state === "command") {
      const w = findWake(text, this.re);
      const cmd = (w.found ? w.command : text).trim();
      if (cmd.length >= 2) this.fire(cmd);
      return;
    }
    const w = findWake(text, this.re);
    if (!w.found) return;
    this.lastWakeAt = this.now();
    if (w.command.length >= 2) { this.fire(w.command); return; }
    // oyó solo «Antares»: esperar el comando unos segundos
    this.setState("command");
    this.onWake();
    clearTimeout(this.commandTimer);
    this.commandTimer = setTimeout(() => { if (this.state === "command") { this.setState("listening", "timeout"); } }, this.commandMs);
  }
  fire(cmd) {
    clearTimeout(this.commandTimer);
    this.lastWakeAt = this.now();
    this.setState("listening");
    this.onCommand(cmd);
  }
}
