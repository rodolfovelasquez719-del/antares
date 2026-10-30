// v1.28: el bloqueo muestra el pulpo holográfico (pulpo.js) con el candado encima. Mismo contrato que v1.27:
// montar(canvas), activar(on), chispa(rojo,n), tono("error"|"normal"), rafaga().
import * as P from "./pulpo.js";
let I = null;
export function montar(canvas) { if (!canvas || I) return; I = P.montar(canvas.parentElement, { canvas, manual: true, mirarToques: false }); }
export function activar(on) { P.activar(I, on); }
export function chispa(rojo = false, n = 3) { P.chispa(I, rojo, n); }
export function tono(c) { P.tono(I, c); }
export function rafaga() { P.rafaga(I); }
