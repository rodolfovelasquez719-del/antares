import { elegirPersona } from "./personas.mjs";
const C = [["¿Cómo ordeno las entregas de mañana para 3 camiones?", "ruta"], ["Redácteme un correo al jefe de despacho", "ruta"], ["¿Cómo está la temperatura de la compu?", "guardian"], ["Mi PC está lenta, ¿será un virus?", "guardian"],
  ["Haga la lista del súper para el fin de semana", "hogar"], ["Ideas para jugar con Evangeline", "hogar"], ["¿Cómo se dice 'programador de rutas' en inglés?", "tutor"], ["Explíqueme qué es una base de datos relacional", "tutor"],
  ["¿Qué sensor uso con un ESP32 para que el robot no choque?", "taller"], ["Quiero armar un brazo robótico con servos", "taller"], ["Hola Antares, ¿cómo amaneció?", "antares"], ["Cuénteme un chiste", "antares"]];
let ok = 0; for (const [q, e] of C) { const r = elegirPersona(q).persona.id; if (r === e) ok++; else console.log("FALLA:", q, "→", r, "esperaba", e); }
console.log(`${ok}/${C.length} correctas`); if (ok !== C.length) process.exit(1);
