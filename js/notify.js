// Antares Web - Notificaciones locales de recordatorios.
// La agenda que lee el service worker (store "notify") NO lleva el texto del recordatorio si hay código:
// solo la hora y un aviso genérico, para no dejar datos personales en claro.
import { tx, idbEntries } from "./vault.js";

export const supported = () => "Notification" in window;
export const permission = () => (supported() ? Notification.permission : "unsupported");
export const triggersSupported = () => typeof window.TimestampTrigger === "function" && "showTrigger" in Notification.prototype;

export async function requestPermission() {
  if (!supported()) return "unsupported";
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

async function registration() {
  try {
    if (!("serviceWorker" in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch { return null; }
}

export async function show(title, body, tag, url = "./?panel=recordatorios") {
  if (permission() !== "granted") return false;
  const opts = { body, tag, icon: "icons/icon-192.png", badge: "icons/favicon-32.png", data: { url }, renotify: true };
  const reg = await registration();
  try {
    if (reg && reg.showNotification) { await reg.showNotification(title, opts); return true; }
    new Notification(title, opts);
    return true;
  } catch { return false; }
}

// Guarda la agenda para el service worker y programa disparadores si el navegador los soporta
export async function syncSchedule(reminders, { generic = false } = {}) {
  let prev = {};
  try { for (const [k, v] of await idbEntries("notify")) prev[k] = v; } catch { /* */ }
  const now = Date.now();
  const items = reminders.filter((r) => !r.done && r.at > now - 24 * 3600 * 1000).map((r) => ({
    id: r.id,
    at: r.at,
    title: generic ? "Antares" : r.title,
    body: generic ? "Tiene un recordatorio. Abra Antares para verlo." : `Recordatorio · ${new Date(r.at).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}`,
    fired: prev[r.id] && prev[r.id].at === r.at ? !!prev[r.id].fired : false,
  }));
  try {
    await tx("notify", "readwrite", (s) => { s.clear(); for (const it of items) s.put(it, it.id); });
  } catch { /* sin IndexedDB: solo avisos con la app abierta */ }
  if (triggersSupported() && permission() === "granted") {
    const reg = await registration();
    if (reg) {
      for (const it of items) {
        if (it.fired || it.at <= now) continue;
        try {
          // eslint-disable-next-line no-undef
          await reg.showNotification(it.title, { body: it.body, tag: it.id, data: { url: "./?panel=recordatorios" }, showTrigger: new TimestampTrigger(it.at) });
        } catch { /* */ }
      }
    }
  }
  try {
    const reg = await registration();
    if (reg && reg.periodicSync) await reg.periodicSync.register("antares-reminders", { minInterval: 15 * 60 * 1000 });
  } catch { /* opcional */ }
  return items.length;
}

// Revisa la agenda: muestra los avisos vencidos que no se hayan mostrado y los marca
export async function checkDue(onFire = null) {
  const now = Date.now();
  let entries = [];
  try { entries = await idbEntries("notify"); } catch { return []; }
  const fired = [];
  for (const [, it] of entries) {
    if (!it || it.fired || it.at > now) continue;
    it.fired = true;
    try { await tx("notify", "readwrite", (s) => { s.put(it, it.id); }); } catch { /* */ }
    fired.push(it);
    await show(it.title, it.body, it.id);
    if (onFire) onFire(it);
  }
  return fired;
}
