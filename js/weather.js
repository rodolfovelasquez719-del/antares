// Antares Web - Clima actual de Alajuela con Open-Meteo (gratis, sin key). Si falla, no se muestra nada.
const URL_ALAJUELA = "https://api.open-meteo.com/v1/forecast?latitude=10.016&longitude=-84.214" +
  "&current=temperature_2m,weather_code,is_day&timezone=America%2FCosta_Rica";

const CODES = [
  [[0], "Despejado"], [[1], "Casi despejado"], [[2], "Algo nublado"], [[3], "Nublado"],
  [[45, 48], "Neblina"], [[51, 53, 55], "Llovizna"], [[56, 57], "Llovizna helada"],
  [[61], "Lluvia débil"], [[63], "Lluvia"], [[65], "Lluvia fuerte"], [[66, 67], "Lluvia helada"],
  [[71, 73, 75, 77], "Nieve"], [[80], "Chubascos"], [[81], "Chubascos fuertes"], [[82], "Aguaceros"],
  [[85, 86], "Chubascos de nieve"], [[95], "Tormenta"], [[96, 99], "Tormenta con granizo"],
];
export function describeWeather(code) {
  for (const [list, text] of CODES) if (list.includes(code)) return text;
  return "";
}

// Devuelve {temp, desc, time} o null
export async function fetchWeather({ timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(URL_ALAJUELA, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    const c = data && data.current;
    if (!c || typeof c.temperature_2m !== "number") return null;
    return { temp: Math.round(c.temperature_2m), desc: describeWeather(c.weather_code), time: c.time };
  } catch {
    return null;
  } finally { clearTimeout(t); }
}
