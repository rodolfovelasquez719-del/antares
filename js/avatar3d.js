// v1.21: Avatar 3D (TalkingHead, MIT; avatar de ejemplo Ready Player Me, CC BY-NC 4.0) en el lugar del cerebro.
// Se carga SOLO si el usuario lo elige en Ajustes (import dinámico de three.js + GLB). Si WebGL falla o va muy lento,
// avisa con onFail para volver al cerebro. Pausa el render cuando está oculto o la pestaña en segundo plano.
let head = null, box = null, state = "idle", failed = false, chunkTimer = null, gotWord = false, lookT = null, visible = true;
export const isReady = () => !!head;
function webglOk() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }
export async function mount3D(wrap, { onFail } = {}) {
  if (head || failed || !wrap) return;
  if (!webglOk()) { failed = true; onFail && onFail("webgl"); return; }
  box = document.createElement("div"); box.className = "av3d"; box.setAttribute("aria-hidden", "true"); wrap.appendChild(box);
  try {
    let mod; for (let i = 0; i < 3 && !mod; i++) { try { mod = await import("../vendor/talkinghead/talkinghead.mjs"); } catch (e) { if (i === 2) throw e; await new Promise((r) => setTimeout(r, 1200)); } }
    const { TalkingHead } = mod;
    const dpr = Math.min(2, devicePixelRatio || 1);
    head = new TalkingHead(box, { ttsEndpoint: "", lipsyncModules: ["pt_br"], lipsyncLang: "pt_br", cameraView: "head", cameraRotateEnable: false, cameraPanEnable: false, cameraZoomEnable: false,
      modelFPS: 30, modelPixelRatio: dpr, avatarMood: "neutral", avatarIdleEyeContact: .6, avatarSpeakingEyeContact: .7, avatarIdleHeadMove: .5, avatarSpeakingHeadMove: .5,
      lightAmbientColor: 0x9fe8ff, lightAmbientIntensity: 1.6, lightDirectColor: 0x9fd8ff, lightDirectIntensity: 22, lightSpotColor: 0x00ff9c, lightSpotIntensity: 10, lightSpotPhi: -0.6, lightSpotTheta: 2.4, lightSpotDispersion: 1 });
    await head.showAvatar({ url: new URL("../assets/avatar-3d.glb", import.meta.url).href, body: "F", avatarMood: "neutral", lipsyncLang: "pt_br" });
    head.armature.traverse((o) => { if (!o.isMesh || !o.material) return; const n = (o.name + " " + (o.material.name || "")).toLowerCase(); const m = o.material;
      if (/glasses/.test(n)) o.visible = false;
      else if (/hair/.test(n)) { m.color && m.color.set(0xd6eaff); if (m.map) { m.map = null; m.needsUpdate = true; } if (m.emissive) { m.emissive.set(0x3d8bff); m.emissiveIntensity = .14; } m.roughness = .55; }
      else if (/outfit_top/.test(n)) { m.color && m.color.set(0x050807); if (m.map) { m.map = null; m.needsUpdate = true; } if (m.emissive) m.emissive.set(0); m.roughness = .35; m.metalness = .6; } });
    // rendimiento: si en los primeros 3 s el navegador va a menos de ~12 fps, se vuelve al cerebro
    const slow = await new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(n / 3 < 12); }; requestAnimationFrame(f); });
    if (slow && !/[?&]forzar3d/.test(location.search)) throw new Error("lento");
    document.addEventListener("visibilitychange", syncRun); syncRun();
  } catch (e) { console.warn("Antares: avatar 3D", e); destroy(); failed = true; onFail && onFail(String(e && e.message || e)); }
}
function destroy() { try { head && head.stop(); } catch { /* */ } head = null; if (box) box.remove(); box = null; }
function syncRun() { if (!head) return; const on = visible && !document.hidden; try { on ? head.start() : head.stop(); } catch { /* */ } }
export function setVisible(on) { visible = !!on; syncRun(); }
export function unmount3D() { destroy(); }
const wordMs = (w, rate = 1) => Math.max(140, w.replace(/[^\p{L}\p{N}]/gu, "").length * 72) / Math.max(.5, rate);
function silent(ms) { const c = head.audioCtx, n = Math.max(1, Math.round(c.sampleRate * ms / 1000)); return c.createBuffer(1, n, c.sampleRate); }
let curRate = 1;
export function onChunk(text, rate = 1) {
  if (!head) return; curRate = rate || 1; gotWord = false; try { head.audioCtx.resume(); } catch { /* */ }
  clearTimeout(chunkTimer);
  // respaldo: si la voz no avisa palabras (algunas voces de Android), se anima toda la frase con tiempos estimados
  chunkTimer = setTimeout(() => {
    if (gotWord || !head) return;
    const words = text.split(/\s+/).filter(Boolean); let t = 0; const wt = [], wd = [];
    for (const w of words) { const d = wordMs(w, curRate); wt.push(t); wd.push(d); t += d + (/[.,;:?!]$/.test(w) ? 260 : 60); }
    try { head.speakAudio({ audio: silent(t + 200), words, wtimes: wt, wdurations: wd }, { lipsyncLang: "pt_br", isRaw: true }); } catch { /* */ }
  }, 450);
}
export function onWord(w) {
  if (!head || !w) return; if (!gotWord) { gotWord = true; clearTimeout(chunkTimer); }
  const d = wordMs(w, curRate);
  try { head.speakAudio({ audio: silent(d + 40), words: [w], wtimes: [0], wdurations: [d] }, { lipsyncLang: "pt_br", isRaw: true }); } catch { /* */ }
}
export function stopTalk() { clearTimeout(chunkTimer); try { head && head.stopSpeaking(); } catch { /* */ } }
export function set3DState(s) {
  if (!head || s === state) return; const prev = state; state = s; clearInterval(lookT);
  try {
    if (s === "listen") { head.setMood("happy"); head.lookAtCamera(3000); lookT = setInterval(() => head && head.lookAtCamera(2500), 2400); setTimeout(() => { if (state === "listen" && head) head.setMood("neutral"); }, 1500); }
    else if (s === "think") { head.setMood("neutral"); head.lookAhead && head.lookAhead(1500); }
    else if (s === "idle") { head.setMood("neutral"); if (prev === "speak") setTimeout(() => { if (state === "idle") stopTalk(); }, 500); }
  } catch { /* */ }
}
