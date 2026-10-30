// Antares · muestra-robot v2: resúmenes "Lo que aprendió", conexiones con el Módulo 0, repasos del Módulo 1, glosario y ruta.
(function () {
const M0 = window.ROBOT_M0, EX = window.ROBOT_EXTRAS;
const RES0 = {
  b0: ["Programar = escribir instrucciones.", "La computadora las ejecuta en orden, de arriba hacia abajo.", "mostrar(\"…\") escribe en el panel."],
  b1: ["JavaScript es el lenguaje de la web.", "El navegador ejecuta el código.", "Mayúsculas y minúsculas importan."],
  b2: ["Texto va entre comillas; números, sin comillas.", "\"5 + 3\" es texto; 5 + 3 es 8."],
  b3: ["+ − * / calculan con números.", "Con textos, + los une.", "Los espacios van dentro de las comillas."],
  b4: ["Una variable guarda un dato con nombre.", "let la crea; después se cambia sin let.", "= significa guardar, no “es igual”."],
  b5: ["const = valor que no cambia.", "Nombres sin espacios, estilo nombreCompleto.", "pais y PAIS son distintos."],
  b6: ["// y /* */ son notas que la computadora ignora.", "Sirven para explicar y para “apagar” líneas."],
  b7: ["Lea el mensaje de error: dice qué y dónde.", "Errores típicos: comillas, paréntesis, mayúsculas, texto sin comillas."],
  b8: ["true y false son booleanos.", "> < >= <= === !== comparan.", "if / else elige qué ejecutar."],
  b9: ["Repasó todo el Módulo 0: está listo para un proyecto real."],
};
M0.forEach((l) => { if (!l.resumen && RES0[l.id]) l.resumen = RES0[l.id]; });
M0.find((l) => l.id === "b9").fin = "Terminó el Módulo 0. Ya tiene las bases para programar el robot.";

// Resúmenes y conexiones para las lecciones del robot
const RES1 = [
  ["Las variables guardan el estado del juego: dónde está el robot.", "El código de cada lección se suma al anterior."],
  ["document.getElementById busca un elemento de la página.", "El canvas se dibuja con un “pincel” ctx.", "fillStyle elige color; fillRect pinta un rectángulo (x, y, ancho, alto)."],
  ["Un mapa es una lista de listas: mapa[y][x].", "1 = pared, 0 = camino. Se cuenta desde 0."],
  ["Un for dentro de otro recorre toda una cuadrícula.", "Casilla → píxel: x * TAM.", "Una función agrupa el dibujo para repetirlo."],
  ["Dividir el programa en funciones pequeñas (dibujarMapa, dibujarRobot, dibujar).", "El orden de dibujo importa: lo último queda encima."],
  ["Los parámetros (dx, dy) hacen una función reutilizable.", "Cambiar el estado + redibujar = animación."],
  ["Un evento es algo que pasa (tecla, toque).", "addEventListener conecta un evento con una función.", "evento.key dice qué tecla fue."],
  ["Los botones táctiles usan el evento click.", "El mismo mover() sirve para teclado y botones: reutilizar código."],
  ["return devuelve una respuesta (true/false).", "Validar ANTES de cambiar el estado.", "Reescribir una función la reemplaza."],
  ["&& exige que se cumplan las dos condiciones.", "Una variable booleana (gano) recuerda el estado del juego.", "textContent cambia el texto visible."],
  ["Una lista de mapas = niveles.", ".length dice cuántos hay.", "Una función (cargarNivel) reinicia el estado."],
  ["La dirección es un número 0–3.", "Listas DX/DY traducen dirección a movimiento.", "% hace que los números “den la vuelta”."],
  ["Un programa puede ser una lista de órdenes.", "setInterval repite cada cierto tiempo; clearInterval lo detiene.", "! invierte un booleano."],
  ["Un algoritmo es una receta para resolver un problema.", "while repite mientras se cumpla una condición; siempre ponga un límite.", "La regla de la mano derecha resuelve laberintos sin ciclos."],
  ["Juntó todo en un juego completo y funcional.", "Ya puede modificarlo y ampliarlo usted solo."],
];
const PREVIO = {
  1: "🔗 <b>Conexión:</b> <code>document</code> es un <b>objeto</b> (lección 0.14) y <code>getElementById</code> es una <b>función</b> suya (0.11) que <b>devuelve</b> (0.12) el elemento buscado.",
  2: "🔗 <b>Conexión:</b> esto es una <b>lista</b> (lección 0.13), pero cada elemento es otra lista.",
  3: "🔗 <b>Conexión:</b> aquí se juntan <b>for</b> (0.10), <b>if</b> (0.9) y <b>funciones</b> (0.11). Si algo no le queda claro, repase esas lecciones primero. <b>Paso a paso:</b> escriba primero solo el for de las filas con un for vacío dentro, pruebe que no hay error, y luego complete.",
  5: "🔗 <b>Conexión:</b> parámetros, como en <code>saludar(nombre)</code> (0.11).",
  8: "🔗 <b>Conexión:</b> <code>esPared</code> es como <code>doble(n)</code> (0.12): calcula y devuelve. 💡 Para reescribir <code>mover</code>, abra “Ver todo su programa hasta ahora” abajo y cópielo como base.",
  9: "💡 Va a reescribir <code>dibujar</code> y <code>mover</code>: ábralos en “Ver todo su programa hasta ahora” (abajo) y agrégueles solo lo nuevo.",
  10: "🔗 <b>Conexión:</b> lista de mapas = lista de listas de listas. <code>niveles[1][8][8]</code> = nivel 1, fila 8, columna 8.",
  12: "🔗 <b>Conexión:</b> una lista de textos (0.13) usada como programa, y un for “por tiempo” con setInterval. 🐞 <b>Depure:</b> si algo falla, ponga <code>console.log(paso, orden)</code> dentro del reloj.",
  13: "🐞 <b>Depure:</b> si el robot da vueltas sin fin, agregue <code>console.log(robotX, robotY, direccion)</code> en pasoAutomatico y mire el patrón.",
};
EX.forEach((x, k) => { x.resumen = RES1[k]; if (PREVIO[k]) x.nota = PREVIO[k] + (x.nota ? "<br>" + x.nota : ""); });

// Repasos del Módulo 1 (se insertan después de la lección 8 y al final)
window.ROBOT_REPASOS = {
  q1a: { despues: 7, l: { t: "Repaso: dibujo y movimiento", c: "MÓDULO 1 · REPASO", fin: "¡Repaso superado! Ahora vienen paredes, meta y niveles.",
    e: "<p>Antes de seguir, compruebe que entiende lo que ya construyó. Repasar ayuda a que lo aprendido se quede en la memoria a largo plazo.</p>",
    tarea: "Responda y pulse <b>Revisar respuestas</b>.", pista: "Puede volver a cualquier lección de la lista; su código no se pierde.",
    resumen: ["Repasó variables, canvas, mapas, funciones y eventos."],
    quiz: [
      { p: "Con <code>TAM = 30</code>, ¿en qué píxel X empieza la casilla 4?", o: ["34", "120", "4"], r: 1, x: "4 * 30 = 120." },
      { p: "¿Qué devuelve <code>mapa[2][5]</code>?", o: ["La fila 5, columna 2", "La fila 2, columna 5", "El número 25"], r: 1, x: "mapa[y][x]: primero la fila (2) y luego la columna (5)." },
      { p: "¿Por qué <code>dibujar()</code> llama primero a <code>dibujarMapa()</code>?", o: ["Para borrar el robot viejo antes de pintar el nuevo", "Porque es obligatorio en JavaScript"], r: 0, x: "El mapa tapa todo, y luego se pinta el robot en su nueva posición." },
      { p: "En <code>mover(dx, dy)</code>, ¿qué son dx y dy?", o: ["Parámetros", "Constantes globales", "Eventos"], r: 0, x: "Son parámetros: se llenan con los valores de cada llamada." },
      { p: "¿Qué hace <code>addEventListener(\"click\", f)</code>?", o: ["Ejecuta f ahora mismo", "Ejecuta f cada vez que hagan click"], r: 1, x: "Registra la función para que se ejecute cuando ocurra el evento." },
    ] } },
  q1b: { despues: 14, l: { t: "Repaso final del robot", c: "MÓDULO 1 · REPASO", fin: "¡Módulo 1 completo! Mire la ruta para seguir creciendo.",
    e: "<p>Último repaso del módulo. Si acierta todo, de verdad entiende cómo funciona su juego.</p>",
    tarea: "Responda y pulse <b>Revisar respuestas</b>.", pista: "Si duda, mire “Ver todo su programa” en la lección 15.",
    resumen: ["Repasó condicionales, niveles, dirección, temporizadores y algoritmos."],
    quiz: [
      { p: "¿Qué hace <code>return;</code> sin valor en <code>mover</code>?", o: ["Sale de la función sin mover", "Reinicia el juego"], r: 0, x: "return termina la función: lo de abajo no se ejecuta." },
      { p: "Con <code>direccion = 3</code>, ¿qué da <code>(direccion + 1) % 4</code>?", o: ["4", "0", "1"], r: 1, x: "4 % 4 = 0: vuelve a mirar a la derecha." },
      { p: "¿Para qué sirve <code>clearInterval(reloj)</code>?", o: ["Detener un setInterval", "Borrar el canvas"], r: 0, x: "Detiene el reloj creado con setInterval." },
      { p: "¿Por qué el while del piloto tiene <code>vueltas &lt; 4</code>?", o: ["Para que nunca se quede repitiendo para siempre", "Para ir más rápido"], r: 0, x: "Si el robot estuviera encerrado, sin límite el while congelaría la página." },
      { p: "Si quiere 3 niveles, ¿qué cambia?", o: ["Agregar un mapa a la lista niveles", "Reescribir todo el juego"], r: 0, x: "cargarNivel y revisarMeta usan niveles.length: funcionan con cualquier cantidad." },
    ] } },
};

window.ROBOT_RUTA = { t: "Ruta hacia la maestría", c: "SU CAMINO · PRÓXIMOS MÓDULOS",
  e: `<p>Con los Módulos 0 y 1 usted ya sabe lo básico de verdad. Para llegar a ser <b>muy bueno</b>, esta es la ruta recomendada (los próximos módulos se irán agregando):</p>
<ol class="ruta">
<li><b>Módulo 2 · Lógica y datos</b>: else if, operadores || y !, bucles while y for…of, arrays a fondo (map, filter, buscar, ordenar), objetos y listas de objetos, funciones flecha, alcance de variables. Proyecto: inventario de piezas del robot.</li>
<li><b>Módulo 3 · Algoritmos</b>: búsqueda, recursión, búsqueda en anchura (BFS) para que el robot encuentre el camino <i>más corto</i>, matrices. Proyecto: robot que planea su ruta.</li>
<li><b>Módulo 4 · HTML y CSS</b>: estructura de páginas, estilos, diseño para celular, formularios. Proyecto: panel de control del robot.</li>
<li><b>Módulo 5 · Apps web</b>: DOM a fondo, eventos, guardar datos, fetch (pedir datos a internet), async/await, Git y GitHub. Proyecto: su propia app instalable como Antares.</li>
<li><b>Módulo 6 · Electrónica y Arduino/ESP32</b>: el lenguaje C++ de Arduino (muy parecido a lo que ya sabe), pines, LEDs, botones, sensores, motores con driver, servos. Proyecto: carrito que avanza y gira (¡avanzar() y girar() en la vida real!).</li>
<li><b>Módulo 7 · Robótica</b>: sensores de distancia (ultrasonido), seguidor de línea, robot que sale de un laberinto real con la regla de la mano derecha, control del ESP32 desde el celular por WiFi.</li>
<li><b>Módulo 8 · Siguiente nivel</b>: Python, visión por computadora, Raspberry Pi y ROS.</li>
</ol>
<p><b>Hábitos que hacen a un gran programador:</b></p>
<ul><li>Programar un poco <b>todos los días</b> (20–30 minutos valen más que 4 horas un solo día).</li>
<li>Hacer los <b>retos</b> sin mirar la solución; equivocarse es parte del aprendizaje.</li>
<li><b>Repasar</b> lecciones viejas cada semana (el “Repaso rápido” de arriba de cada lección le ayuda).</li>
<li>Leer los mensajes de error y <b>rastrear</b> valores con console.log antes de cambiar código.</li>
<li>Inventar sus propios proyectos pequeños: es la forma más rápida de mejorar.</li></ul>`,
  tarea: "Lea la ruta y pulse <b>Marcar como leído</b>.", info: true, fin: "¡Adelante! Siga practicando con los retos mientras llegan los próximos módulos.",
  resumen: ["Módulo 2: lógica y datos → 3: algoritmos → 4: HTML/CSS → 5: apps web → 6: Arduino/ESP32 → 7: robótica → 8: Python/ROS.", "Practique a diario, haga retos, repase y depure."] };

window.ROBOT_GLOSARIO = [
  ["Código", "Texto con instrucciones para la computadora."], ["Instrucción", "Una orden; normalmente termina con ;."],
  ["Variable", "Espacio con nombre para guardar un dato (let)."], ["Constante", "Variable que no cambia (const)."],
  ["String (texto)", "Datos entre comillas: \"Hola\"."], ["Número", "Sin comillas: 7, 3.5."], ["Booleano", "true (verdadero) o false (falso)."],
  ["Operador", "Símbolo que opera: + - * / % === && ! …"], ["%", "Resto de una división: 7 % 3 = 1."],
  ["Comparación", "=== igual, !== distinto, > mayor, < menor, >= <=."], ["&& / || / !", "Y / O / NO."],
  ["if / else", "Si se cumple la condición haga esto; si no, aquello."], ["Bucle", "Repetición de instrucciones (for, while)."],
  ["for", "Bucle con inicio; condición; paso."], ["while", "Repite mientras la condición sea true."], ["Iteración", "Una vuelta de un bucle."],
  ["Función", "Grupo de instrucciones con nombre que se puede llamar."], ["Parámetro", "Dato que recibe una función entre paréntesis."],
  ["Llamar", "Ejecutar una función: nombre()."], ["return", "Devolver un valor desde una función y terminarla."],
  ["Array (lista)", "Datos en orden: [1, 2, 3]. Se cuenta desde 0."], ["Índice", "Posición en una lista: lista[0]."], [".length", "Cantidad de elementos."],
  [".push()", "Agrega al final de una lista."], ["Objeto", "Datos con nombre: { x: 1, y: 2 }."], ["Propiedad", "Un dato dentro de un objeto: robot.x."],
  ["document", "Objeto que representa la página web."], ["getElementById", "Busca un elemento de la página por su id."], ["DOM", "La página vista como objetos que JavaScript puede cambiar."],
  ["Canvas", "Lienzo para dibujar con código."], ["ctx", "El “pincel” 2D del canvas."], ["Píxel", "Punto de la pantalla."],
  ["Evento", "Algo que ocurre: click, tecla, toque."], ["addEventListener", "Conecta un evento con una función."],
  ["setInterval", "Ejecuta algo cada cierto tiempo (ms)."], ["clearInterval", "Detiene un setInterval."], ["Milisegundo (ms)", "Milésima de segundo. 1000 ms = 1 s."],
  ["Algoritmo", "Receta paso a paso para resolver un problema."], ["Bug", "Error de lógica: corre pero hace algo incorrecto."],
  ["Depurar", "Buscar y corregir bugs (rastreando valores con console.log)."], ["console.log", "Muestra valores para revisar el programa."],
  ["SyntaxError", "Error de escritura: el código no se puede leer."], ["ReferenceError / is not defined", "Usó un nombre que no existe."],
  ["undefined", "“No definido”: algo que no tiene valor."], ["null", "“Nada”, a propósito."],
];
})();
