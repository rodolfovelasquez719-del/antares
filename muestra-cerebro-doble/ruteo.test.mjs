// node muestra-cerebro-doble/ruteo.test.mjs
import { elegirCerebro, respuestaDelicada } from "./ruteo.mjs";
const C = [
  ["Hola Antares, ¿cómo está?", "pc"], ["¿Cómo estás hoy?", "pc"], ["Buenas noches, gracias por todo", "pc"], ["Cuénteme un chiste", "pc"],
  ["Redácteme un mensaje de cumpleaños para mi mamá", "pc"], ["Escriba un poema corto sobre el mar", "pc"], ["Corrija este texto: mañana nos bemos", "pc"],
  ["Me siento cansado, deme ánimo", "pc"],
  ["Dígame un consejo corto para manejar con lluvia en la Ruta 32", "gem"], ["¿Debo llevar las luces encendidas con neblina?", "gem"],
  ["¿Cada cuánto cambio las llantas del camión?", "gem"], ["Me suenan los frenos, ¿qué hago?", "gem"], ["¿Qué tomo para el dolor de cabeza?", "gem"],
  ["Mi bebé tiene fiebre", "gem"], ["¿Es seguro tocar un cable pelado?", "gem"], ["¿Cuántos kilómetros hay de Alajuela a Limón?", "gem"],
  ["¿Qué es un volcán, en dos frases?", "gem"], ["¿Cuál es la capital de Francia?", "gem"], ["¿Dónde queda Pérez Zeledón?", "gem"],
  ["¿Cuánto cuesta el marchamo?", "gem"], ["¿Qué pasó hoy en Costa Rica?", "gem"], ["¿Cómo está el clima hoy en Alajuela?", "gem"],
  ["Noticias de la semana", "gem"], ["¿Quién fue Juan Santamaría?", "gem"], ["¿Qué dice la ley de tránsito sobre el celular?", "gem"],
  ["Explíqueme cómo funciona un turbo", "gem"], ["¿Qué hora es en Japón?", "gem"], ["Algo raro que no encaja en ninguna regla", "gem"],
  ["Redacte un mensaje a mi jefe: llego tarde por la lluvia", "gem"],
];
let ok = 0; const filas = [];
for (const [q, esp] of C) { const r = elegirCerebro(q); const b = r.cerebro === esp; ok += b; filas.push(`${b ? "✓" : "✗"} ${esp.padEnd(3)} ${r.cerebro.padEnd(3)} ${r.motivo.padEnd(26)} ${q}`); }
console.log("OK ESPERA SALE MOTIVO                     PREGUNTA"); console.log(filas.join("\n"));
const extra = [["En la Ruta 32 maneje con los faros apagados", true], ["¡Con gusto, don Freddy! Que tenga lindo día.", false], ["Son unos 400 km", true]];
for (const [a, e] of extra) { const b = respuestaDelicada(a) === e; ok += b; console.log(`${b ? "✓" : "✗"} red de seguridad=${e} :: ${a}`); }
const total = C.length + extra.length; console.log(`\n${ok}/${total} correctas`); process.exit(ok === total ? 0 : 1);
