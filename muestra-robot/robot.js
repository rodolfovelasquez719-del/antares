// Antares · Muestra: "Aprende a programar: Robot en el laberinto".
// Tutorial interactivo. Freddy escribe el código; la vista previa corre en un iframe aislado (sandbox="allow-scripts").
// No usa claves ni la API de Gemini.
(() => {
"use strict";
const CLAVE = "antaresRobotTutorial.v1";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MAPA1 = `[
  [1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,1,0,0,0,1],
  [1,0,1,1,0,1,0,1,0,1],
  [1,0,0,1,0,0,0,1,0,1],
  [1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,1,0,1],
  [1,0,1,1,1,1,0,1,0,1],
  [1,0,1,0,0,0,0,1,0,1],
  [1,0,1,0,1,1,1,0,0,1],
  [1,1,1,1,1,1,1,1,1,1]
]`;
const MAPA2 = `[
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,0,1,1,0,1],
    [1,0,0,0,0,0,1,0,0,1],
    [1,0,1,1,1,1,1,0,1,1],
    [1,0,0,0,1,0,0,0,0,1],
    [1,1,1,0,1,0,1,1,1,1],
    [1,0,0,0,1,0,1,0,0,1],
    [1,0,1,1,1,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1]
  ]`;

// ---------- Las lecciones ----------
// test(): se ejecuta DENTRO del iframe, después del código de Freddy. Devuelve {ok, msg}.
// Ayudas disponibles en el iframe: __existe(nombre), __pix(x,y), __parar(), __espera(ms).
const L = [
{ t: "Variables: la memoria del robot", c: "VARIABLES",
  e: `<p>¡Bienvenido! En estas lecciones usted va a programar, desde cero, un juego donde un robot recorre un laberinto. Todo lo escribe usted; yo solo le explico y reviso.</p>
<p>Lo primero que necesita un programa es <b>memoria</b>. En JavaScript la memoria se guarda en <b>variables</b>. Una variable es como una cajita con nombre:</p>
<pre>let edad = 40;      // let: una cajita que puede cambiar
const PI = 3.1416;  // const: una cajita que NO cambia</pre>
<p>Nuestro laberinto será una cuadrícula de 10 × 10 casillas. El robot necesita saber en qué <b>columna</b> (X) y en qué <b>fila</b> (Y) está. También vamos a decidir que cada casilla mide 30 píxeles.</p>`,
  tarea: `Cree <code>robotX</code> y <code>robotY</code> con <code>let</code>, las dos valiendo <code>1</code>, y una constante <code>TAM</code> que valga <code>30</code>.`,
  pista: `Son tres líneas. Cada una empieza con let o const, luego el nombre, el signo = y el número. Termine cada línea con punto y coma (;).`,
  sol: `let robotX = 1;
let robotY = 1;
const TAM = 30;`,
  test: function () {
    if (!__existe("robotX")) return { ok: false, msg: "No encuentro la variable <code>robotX</code>. Revise que la X sea mayúscula." };
    if (!__existe("robotY")) return { ok: false, msg: "No encuentro <code>robotY</code>." };
    if (!__existe("TAM")) return { ok: false, msg: "No encuentro <code>TAM</code> (en mayúsculas)." };
    if (robotX !== 1 || robotY !== 1) return { ok: false, msg: "El robot debe empezar en la casilla 1,1: <code>robotX</code> y <code>robotY</code> deben valer 1 (sin comillas, es un número)." };
    if (TAM !== 30) return { ok: false, msg: "<code>TAM</code> debe valer 30 (sin comillas)." };
    return { ok: true, msg: "¡Perfecto! Ya tiene sus primeras tres variables. El robot ya “sabe” dónde está, aunque todavía no se ve." };
  } },

{ t: "El lienzo: un papel para dibujar", c: "CANVAS",
  e: `<p>Para dibujar usamos un <b>canvas</b> (lienzo). En la vista previa ya hay uno con el id <code>pantalla</code>, de 300 × 300 píxeles (10 casillas × 30).</p>
<p>Para usarlo hay que “agarrarlo” y pedirle su <b>pincel 2D</b>, que por costumbre se llama <code>ctx</code>:</p>
<pre>const lienzo = document.getElementById("pantalla");
const ctx = lienzo.getContext("2d");</pre>
<p>Con el pincel se elige un color y se pinta un rectángulo: <code>ctx.fillStyle = "color"</code> y <code>ctx.fillRect(x, y, ancho, alto)</code>. Ojo: en el canvas, la Y crece <b>hacia abajo</b>; (0,0) es la esquina de arriba a la izquierda.</p>`,
  tarea: `Agarre el lienzo y el pincel como arriba, y pinte todo el fondo (0, 0, 300, 300) de un verde muy oscuro, por ejemplo <code>"#001a0e"</code>.`,
  pista: `Después de las dos líneas del ejemplo, escriba ctx.fillStyle = "#001a0e"; y luego ctx.fillRect(0, 0, 300, 300);`,
  sol: `const lienzo = document.getElementById("pantalla");
const ctx = lienzo.getContext("2d");
ctx.fillStyle = "#001a0e";
ctx.fillRect(0, 0, 300, 300);`,
  test: function () {
    if (!__existe("lienzo")) return { ok: false, msg: "No encuentro la variable <code>lienzo</code>." };
    if (!lienzo || !lienzo.getContext) return { ok: false, msg: "<code>lienzo</code> no es el canvas. Revise que el id sea exactamente \"pantalla\", entre comillas." };
    if (!__existe("ctx") || !ctx || typeof ctx.fillRect !== "function") return { ok: false, msg: "No encuentro el pincel <code>ctx</code>. Use <code>lienzo.getContext(\"2d\")</code>." };
    const p = __pix(150, 150);
    if (p[3] < 255) return { ok: false, msg: "El lienzo sigue vacío. ¿Escribió <code>ctx.fillRect(0, 0, 300, 300)</code> después de elegir el color?" };
    return { ok: true, msg: "¡Muy bien! Su primer dibujo: un fondo oscuro, como la pantalla de una nave." };
  } },

{ t: "El mapa: una lista de listas", c: "ARRAYS",
  e: `<p>Un <b>array</b> es una lista entre corchetes: <code>[5, 8, 2]</code>. Se lee por posición, empezando en 0: si <code>let lista = [5, 8, 2]</code>, entonces <code>lista[0]</code> es 5.</p>
<p>Un laberinto es una cuadrícula, así que usamos una <b>lista de filas</b>; cada fila es otra lista. <code>1</code> = pared, <code>0</code> = camino. Para leer una casilla: <code>mapa[fila][columna]</code>, o sea <code>mapa[y][x]</code>.</p>
<p>Usamos <code>let</code> porque más adelante cambiaremos de mapa (niveles).</p>`,
  tarea: `Cree <code>let mapa = [...]</code> con 10 filas de 10 números. Los bordes deben ser paredes (1), y las casillas 1,1 (inicio) y 8,8 (meta) deben ser 0. Puede inventar el suyo o copiar el de la pista.`,
  pista: `Este es un laberinto que funciona bien (cópielo a mano, fila por fila; note la coma después de cada fila menos la última):<pre>let mapa = ${MAPA1};</pre>`,
  sol: `let mapa = ${MAPA1};`,
  test: function () {
    if (!__existe("mapa")) return { ok: false, msg: "No encuentro <code>mapa</code>." };
    if (!Array.isArray(mapa)) return { ok: false, msg: "<code>mapa</code> debe ser una lista entre corchetes [ ]." };
    if (mapa.length !== 10) return { ok: false, msg: "El mapa tiene " + mapa.length + " filas; necesita 10." };
    for (let y = 0; y < 10; y++) {
      if (!Array.isArray(mapa[y]) || mapa[y].length !== 10) return { ok: false, msg: "La fila " + y + " (contando desde 0) no tiene 10 números. Revise comas y corchetes." };
      for (let x = 0; x < 10; x++) {
        const v = mapa[y][x];
        if (v !== 0 && v !== 1) return { ok: false, msg: "En la fila " + y + ", columna " + x + " hay <code>" + v + "</code>. Solo se permiten 0 y 1, sin comillas." };
        if ((y === 0 || y === 9 || x === 0 || x === 9) && v !== 1) return { ok: false, msg: "El borde debe ser todo pared (1). Falla en fila " + y + ", columna " + x + "." };
      }
    }
    if (mapa[1][1] !== 0) return { ok: false, msg: "La casilla de inicio <code>mapa[1][1]</code> debe ser 0 (camino)." };
    if (mapa[8][8] !== 0) return { ok: false, msg: "La meta <code>mapa[8][8]</code> debe ser 0 (camino)." };
    return { ok: true, msg: "¡Excelente! Ya tiene el laberinto en la memoria. En la próxima lección lo dibujamos." };
  } },

{ t: "Bucles: dibujar el laberinto", c: "FUNCIONES + BUCLES FOR",
  e: `<p>Una <b>función</b> es un grupo de instrucciones con nombre, que se puede usar las veces que quiera:</p>
<pre>function saludar() {
  // instrucciones aquí
}
saludar(); // así se "llama" (se ejecuta)</pre>
<p>Un <b>bucle for</b> repite algo varias veces. Este cuenta de 0 a 9:</p>
<pre>for (let x = 0; x &lt; 10; x++) {
  // aquí x vale 0, luego 1, 2… hasta 9
}</pre>
<p>Si pone un for <b>dentro</b> de otro, recorre todas las filas y, en cada fila, todas las columnas: ¡las 100 casillas! En cada casilla decida el color con un <code>if</code> ("si"):</p>
<pre>if (mapa[y][x] === 1) {
  ctx.fillStyle = "#00ff9c";   // pared verde
} else {
  ctx.fillStyle = "#001a0e";   // camino oscuro
}</pre>
<p>La casilla (x, y) empieza en el píxel <code>x * TAM</code>, <code>y * TAM</code>.</p>`,
  tarea: `Escriba la función <code>dibujarMapa()</code> que, con dos for, pinte cada casilla (verde si es pared, oscura si es camino) con <code>ctx.fillRect(x * TAM, y * TAM, TAM, TAM)</code>. Al final, llámela.`,
  pista: `Estructura: function dibujarMapa() { for (let y…) { for (let x…) { if… else…; ctx.fillRect(…); } } } y luego dibujarMapa(); Cuente las llaves: cada { necesita su }.`,
  sol: `function dibujarMapa() {
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      if (mapa[y][x] === 1) {
        ctx.fillStyle = "#00ff9c";
      } else {
        ctx.fillStyle = "#001a0e";
      }
      ctx.fillRect(x * TAM, y * TAM, TAM, TAM);
    }
  }
}
dibujarMapa();`,
  test: function () {
    if (!__existe("dibujarMapa") || typeof dibujarMapa !== "function") return { ok: false, msg: "No encuentro la función <code>dibujarMapa</code>." };
    const c = lienzo.getContext("2d"); c.fillStyle = "#123456"; c.fillRect(0, 0, 300, 300);
    dibujarMapa();
    const pared = __pix(15, 15), camino = __pix(45, 45), borde = __pix(285, 285);
    const igual = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    if (igual(pared, [0x12, 0x34, 0x56]) || igual(borde, [0x12, 0x34, 0x56])) return { ok: false, msg: "La función no pintó todo el lienzo. ¿Los dos for van de 0 a menos de 10? ¿Usa <code>x * TAM</code> y <code>y * TAM</code>?" };
    if (igual(pared, camino)) return { ok: false, msg: "Paredes y caminos salen del mismo color. Revise el <code>if (mapa[y][x] === 1)</code> y que <code>fillStyle</code> se cambie ANTES de <code>fillRect</code>." };
    if (!igual(pared, borde)) return { ok: false, msg: "Las esquinas deberían ser pared, pero salen de colores distintos. ¿Usó <code>mapa[y][x]</code> (primero y)?" };
    return { ok: true, msg: "¡Ahí está su laberinto! 100 casillas dibujadas con solo unas líneas: ese es el poder de los bucles." };
  } },

{ t: "Funciones: dibujar el robot", c: "FUNCIONES",
  e: `<p>Ahora el robot. Lo dibujaremos como un cuadro rojo un poco más pequeño que la casilla (5 píxeles de margen):</p>
<pre>ctx.fillRect(robotX * TAM + 5, robotY * TAM + 5, TAM - 10, TAM - 10);</pre>
<p>Conviene tener una función <code>dibujar()</code> que redibuje <b>todo</b>: primero el mapa (eso borra al robot viejo) y luego el robot. Así, cada vez que algo cambie, solo llamamos <code>dibujar()</code>.</p>`,
  tarea: `Cree <code>dibujarRobot()</code> (rojo <code>"#ff2d4a"</code>) y <code>dibujar()</code> que llame a <code>dibujarMapa()</code> y luego a <code>dibujarRobot()</code>. Al final llame a <code>dibujar()</code>.`,
  pista: `Dentro de dibujarRobot: primero ctx.fillStyle = "#ff2d4a"; y luego el fillRect de arriba. Dentro de dibujar(): dos líneas, dibujarMapa(); y dibujarRobot();`,
  sol: `function dibujarRobot() {
  ctx.fillStyle = "#ff2d4a";
  ctx.fillRect(robotX * TAM + 5, robotY * TAM + 5, TAM - 10, TAM - 10);
}

function dibujar() {
  dibujarMapa();
  dibujarRobot();
}

dibujar();`,
  test: function () {
    if (!__existe("dibujarRobot") || typeof dibujarRobot !== "function") return { ok: false, msg: "No encuentro la función <code>dibujarRobot</code>." };
    if (!__existe("dibujar") || typeof dibujar !== "function") return { ok: false, msg: "No encuentro la función <code>dibujar</code>." };
    const igual = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const ox = robotX, oy = robotY;
    robotX = 1; robotY = 1;
    dibujarMapa(); const vacio = __pix(45, 45);
    dibujar(); const conRobot = __pix(45, 45);
    if (igual(vacio, conRobot)) { robotX = ox; robotY = oy; return { ok: false, msg: "No veo el robot en la casilla 1,1. ¿<code>dibujar()</code> llama a <code>dibujarRobot()</code> DESPUÉS de <code>dibujarMapa()</code>? ¿Usa <code>robotX * TAM + 5</code>?" }; }
    robotX = 2; dibujar();
    const viejo = __pix(45, 45), nuevo = __pix(75, 45);
    robotX = ox; robotY = oy; dibujar();
    if (!igual(viejo, vacio)) return { ok: false, msg: "Al mover el robot queda una “sombra” en la casilla anterior. <code>dibujar()</code> debe llamar primero a <code>dibujarMapa()</code>." };
    if (igual(nuevo, vacio)) return { ok: false, msg: "El robot no se dibuja según <code>robotX</code>. Use <code>robotX * TAM</code> en <code>fillRect</code>." };
    return { ok: true, msg: "¡Su robot apareció! Es el cuadro rojo arriba a la izquierda." };
  } },

{ t: "Mover el robot", c: "FUNCIONES CON PARÁMETROS",
  e: `<p>Las funciones pueden recibir <b>parámetros</b>: datos que se les pasan entre paréntesis. Por ejemplo <code>mover(1, 0)</code> significa “una casilla a la derecha” y <code>mover(0, -1)</code> “una hacia arriba”.</p>
<pre>function mover(dx, dy) {
  // dx = cuánto cambia X, dy = cuánto cambia Y
}</pre>
<p>Dentro, sume <code>dx</code> a <code>robotX</code>, <code>dy</code> a <code>robotY</code>, y redibuje. (Por ahora el robot atraviesa paredes; eso lo arreglamos pronto.)</p>`,
  tarea: `Escriba <code>mover(dx, dy)</code> que cambie <code>robotX</code> y <code>robotY</code> y luego llame a <code>dibujar()</code>.`,
  pista: `robotX = robotX + dx; significa “el nuevo robotX es el viejo más dx”. Haga lo mismo con Y y luego dibujar();`,
  sol: `function mover(dx, dy) {
  robotX = robotX + dx;
  robotY = robotY + dy;
  dibujar();
}`,
  test: function () {
    if (!__existe("mover") || typeof mover !== "function") return { ok: false, msg: "No encuentro la función <code>mover</code>." };
    robotX = 1; robotY = 1;
    mover(1, 0);
    if (robotX !== 2 || robotY !== 1) return { ok: false, msg: "Después de <code>mover(1, 0)</code> el robot debería estar en 2,1, pero está en " + robotX + "," + robotY + "." };
    mover(0, 1);
    if (robotY !== 2) return { ok: false, msg: "<code>mover(0, 1)</code> no cambió <code>robotY</code>. ¿Sumó <code>dy</code> a <code>robotY</code>?" };
    robotX = 1; robotY = 1; dibujar();
    return { ok: true, msg: "¡Funciona! Probé <code>mover(1, 0)</code> y <code>mover(0, 1)</code> y el robot se movió bien." };
  } },

{ t: "Eventos: el teclado", c: "EVENTOS",
  e: `<p>Un <b>evento</b> es algo que pasa: una tecla, un toque, un clic. Con <code>addEventListener</code> le decimos al navegador: “cuando pase esto, ejecute esta función”.</p>
<pre>document.addEventListener("keydown", function (evento) {
  if (evento.key === "ArrowRight") {
    mover(1, 0);
  }
});</pre>
<p>Las flechas se llaman <code>"ArrowUp"</code>, <code>"ArrowDown"</code>, <code>"ArrowLeft"</code> y <code>"ArrowRight"</code>. (Esto sirve en computadora; en el celular haremos botones en la próxima lección.)</p>`,
  tarea: `Haga que las 4 flechas del teclado muevan el robot en su dirección.`,
  pista: `Un solo addEventListener con cuatro if dentro. Arriba es mover(0, -1) porque la Y crece hacia abajo.`,
  sol: `document.addEventListener("keydown", function (evento) {
  if (evento.key === "ArrowUp") mover(0, -1);
  if (evento.key === "ArrowDown") mover(0, 1);
  if (evento.key === "ArrowLeft") mover(-1, 0);
  if (evento.key === "ArrowRight") mover(1, 0);
});`,
  test: function () {
    const tecla = (k) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    const casos = [["ArrowRight", 2, 1], ["ArrowDown", 2, 2], ["ArrowLeft", 1, 2], ["ArrowUp", 1, 1]];
    robotX = 1; robotY = 1;
    for (const [k, x, y] of casos) {
      tecla(k);
      if (robotX !== x || robotY !== y) { robotX = 1; robotY = 1; dibujar(); return { ok: false, msg: "Presioné <code>" + k + "</code> y el robot quedó en " + robotX + "," + robotY + " en vez de " + x + "," + y + ". Revise el nombre de la tecla (mayúsculas) y los números de <code>mover</code>." }; }
    }
    return { ok: true, msg: "¡Las 4 flechas funcionan! Si usa computadora, toque la vista previa y pruebe las flechas." };
  } },

{ t: "Botones táctiles para el celular", c: "EVENTOS DE TOQUE",
  e: `<p>En su iPhone o Xiaomi no hay flechas, así que la vista previa trae 4 botones con estos ids: <code>btnArriba</code>, <code>btnAbajo</code>, <code>btnIzquierda</code>, <code>btnDerecha</code>.</p>
<p>A cada botón le conectamos el evento <code>"click"</code> (en el celular, tocar = click):</p>
<pre>document.getElementById("btnDerecha").addEventListener("click", function () {
  mover(1, 0);
});</pre>`,
  tarea: `Conecte los 4 botones para que muevan el robot.`,
  pista: `Copie el ejemplo cuatro veces y cambie el id y los números de mover en cada una.`,
  sol: `document.getElementById("btnArriba").addEventListener("click", function () { mover(0, -1); });
document.getElementById("btnAbajo").addEventListener("click", function () { mover(0, 1); });
document.getElementById("btnIzquierda").addEventListener("click", function () { mover(-1, 0); });
document.getElementById("btnDerecha").addEventListener("click", function () { mover(1, 0); });`,
  test: function () {
    const casos = [["btnDerecha", 2, 1], ["btnAbajo", 2, 2], ["btnIzquierda", 1, 2], ["btnArriba", 1, 1]];
    robotX = 1; robotY = 1;
    for (const [b, x, y] of casos) {
      document.getElementById(b).click();
      if (robotX !== x || robotY !== y) { robotX = 1; robotY = 1; dibujar(); return { ok: false, msg: "Toqué <code>" + b + "</code> y el robot no fue a " + x + "," + y + " (quedó en " + robotX + "," + robotY + "). Revise ese botón." }; }
    }
    return { ok: true, msg: "¡Ya puede jugar con el dedo! Toque los botones de la vista previa." };
  } },

{ t: "Condicionales: ¡las paredes no se atraviesan!", c: "CONDICIONALES",
  e: `<p>Hasta ahora el robot atraviesa paredes. Hay que <b>preguntar antes de moverse</b>: “¿la casilla nueva es pared?”. Para eso sirve <code>if</code>.</p>
<p>Primero una función que <b>responde</b> verdadero o falso con <code>return</code>:</p>
<pre>function esPared(x, y) {
  return mapa[y][x] === 1;
}</pre>
<p>Luego <b>reescriba</b> <code>mover</code> (en JavaScript, si escribe otra función con el mismo nombre, la nueva reemplaza a la vieja). Calcule la casilla nueva en variables, y si es pared, use <code>return;</code> para salir sin moverse.</p>`,
  tarea: `Cree <code>esPared(x, y)</code> y una nueva versión de <code>mover(dx, dy)</code> que no deje entrar en paredes.`,
  pista: `En mover: const nuevoX = robotX + dx; const nuevoY = robotY + dy; if (esPared(nuevoX, nuevoY)) { return; } y después actualice robotX, robotY y llame dibujar().`,
  sol: `function esPared(x, y) {
  return mapa[y][x] === 1;
}

function mover(dx, dy) {
  const nuevoX = robotX + dx;
  const nuevoY = robotY + dy;
  if (esPared(nuevoX, nuevoY)) {
    return;
  }
  robotX = nuevoX;
  robotY = nuevoY;
  dibujar();
}`,
  test: function () {
    if (!__existe("esPared") || typeof esPared !== "function") return { ok: false, msg: "No encuentro la función <code>esPared</code>." };
    if (esPared(0, 0) !== true) return { ok: false, msg: "<code>esPared(0, 0)</code> debería dar <code>true</code> (la esquina es pared). ¿Usó <code>return</code>?" };
    if (esPared(1, 1) !== false) return { ok: false, msg: "<code>esPared(1, 1)</code> debería dar <code>false</code> (es camino)." };
    robotX = 1; robotY = 1;
    mover(0, -1);
    if (robotX !== 1 || robotY !== 1) { robotX = 1; robotY = 1; dibujar(); return { ok: false, msg: "El robot atravesó la pared de arriba. En <code>mover</code>, revise el <code>if (esPared(nuevoX, nuevoY)) { return; }</code> ANTES de cambiar robotX/robotY." }; }
    mover(-1, 0);
    if (robotX !== 1) { robotX = 1; dibujar(); return { ok: false, msg: "El robot atravesó la pared de la izquierda." }; }
    if (mapa[1][2] === 0) { mover(1, 0); if (robotX !== 2) return { ok: false, msg: "Ahora el robot no se mueve ni por el camino. ¿Actualizó <code>robotX = nuevoX</code>?" }; }
    robotX = 1; robotY = 1; dibujar();
    return { ok: true, msg: "¡Ya no hay trampa! Las paredes son sólidas. Pruebe en la vista previa." };
  } },

{ t: "La meta y la victoria", c: "CONDICIÓN DE VICTORIA",
  e: `<p>Todo juego necesita una forma de ganar. Ponga la meta en la casilla 8,8 y una variable <code>gano</code> que empieza en <code>false</code>.</p>
<p>Después de cada movimiento, revise si el robot está en la meta. El operador <code>&amp;&amp;</code> significa “y”: las dos cosas deben cumplirse.</p>
<pre>if (robotX === metaX &amp;&amp; robotY === metaY) { … }</pre>
<p>Para mostrar un mensaje use el elemento con id <code>mensaje</code>: <code>document.getElementById("mensaje").textContent = "¡Ganó!";</code></p>
<p>Necesitará reescribir <code>dibujar()</code> (para pintar la meta) y <code>mover()</code> (para llamar a <code>revisarMeta()</code> al final).</p>`,
  tarea: `Cree <code>metaX</code>, <code>metaY</code> (8 y 8), <code>let gano = false</code>, <code>dibujarMeta()</code> (amarilla), <code>revisarMeta()</code>, y actualice <code>dibujar()</code> y <code>mover()</code>.`,
  pista: `dibujar() ahora llama tres funciones: dibujarMapa(); dibujarMeta(); dibujarRobot(); — y mover() es igual al anterior pero con revisarMeta(); al final.`,
  sol: `const metaX = 8;
const metaY = 8;
let gano = false;

function dibujarMeta() {
  ctx.fillStyle = "#ffd400";
  ctx.fillRect(metaX * TAM + 8, metaY * TAM + 8, TAM - 16, TAM - 16);
}

function dibujar() {
  dibujarMapa();
  dibujarMeta();
  dibujarRobot();
}

function revisarMeta() {
  if (robotX === metaX && robotY === metaY) {
    gano = true;
    document.getElementById("mensaje").textContent = "¡Llegó a la meta! 🎉";
  }
}

function mover(dx, dy) {
  const nuevoX = robotX + dx;
  const nuevoY = robotY + dy;
  if (esPared(nuevoX, nuevoY)) {
    return;
  }
  robotX = nuevoX;
  robotY = nuevoY;
  dibujar();
  revisarMeta();
}

dibujar();`,
  test: function () {
    for (const n of ["metaX", "metaY", "gano", "dibujarMeta", "revisarMeta"]) if (!__existe(n)) return { ok: false, msg: "No encuentro <code>" + n + "</code>." };
    if (metaX !== 8 || metaY !== 8) return { ok: false, msg: "La meta debe estar en 8,8." };
    const igual = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    dibujarMapa(); const sinMeta = __pix(255, 255); dibujar();
    if (igual(sinMeta, __pix(255, 255))) return { ok: false, msg: "No veo la meta en 8,8. ¿<code>dibujar()</code> llama a <code>dibujarMeta()</code>?" };
    if (mapa[8][7] !== 0) return { ok: true, msg: "La meta se ve. (No pude probar la llegada porque su mapa tiene pared en 7,8, pero parece bien.)" };
    gano = false; robotX = 7; robotY = 8;
    mover(1, 0);
    const txt = document.getElementById("mensaje").textContent;
    const g = gano;
    gano = false; robotX = 1; robotY = 1; document.getElementById("mensaje").textContent = ""; dibujar();
    if (!g) return { ok: false, msg: "Puse el robot al lado de la meta y lo moví encima, pero <code>gano</code> no cambió a <code>true</code>. ¿<code>mover</code> llama a <code>revisarMeta()</code> al final? ¿Usó <code>===</code> y <code>&amp;&amp;</code>?" };
    if (!txt) return { ok: false, msg: "<code>gano</code> cambió, pero no apareció mensaje. Revise el <code>getElementById(\"mensaje\")</code>." };
    return { ok: true, msg: "¡Ya se puede ganar! Llegue a la casilla amarilla con los botones." };
  } },

{ t: "Niveles", c: "ARRAYS DE MAPAS",
  e: `<p>Un solo laberinto se acaba rápido. Guarde varios mapas en una lista <code>niveles</code>: <code>niveles[0]</code> es el primero, <code>niveles[1]</code> el segundo… <code>niveles.length</code> dice cuántos hay.</p>
<p>Una función <code>cargarNivel(numero)</code> cambia <code>mapa</code>, regresa el robot al inicio y redibuja. Y <code>revisarMeta()</code> ahora decide: si hay otro nivel, lo carga; si no, ¡ganó el juego!</p>
<p>Truco: el primer nivel puede ser su <code>mapa</code> actual: <code>const niveles = [mapa, [ …otro mapa… ]];</code> (la meta sigue en 8,8 en todos).</p>`,
  tarea: `Cree <code>niveles</code> con al menos 2 mapas, <code>let nivelActual = 0</code>, <code>cargarNivel(numero)</code>, y reescriba <code>revisarMeta()</code> para pasar de nivel.`,
  pista: `Segundo mapa sugerido:<pre>${MAPA2}</pre>En revisarMeta: if (nivelActual + 1 &lt; niveles.length) { cargarNivel(nivelActual + 1); } else { gano = true; … }`,
  sol: `const niveles = [
  mapa,
  ${MAPA2}
];
let nivelActual = 0;

function cargarNivel(numero) {
  nivelActual = numero;
  mapa = niveles[numero];
  robotX = 1;
  robotY = 1;
  dibujar();
}

function revisarMeta() {
  if (robotX === metaX && robotY === metaY) {
    if (nivelActual + 1 < niveles.length) {
      document.getElementById("mensaje").textContent = "¡Nivel superado! Siguiente…";
      cargarNivel(nivelActual + 1);
    } else {
      gano = true;
      document.getElementById("mensaje").textContent = "¡Ganó el juego! 🏆";
    }
  }
}`,
  test: function () {
    for (const n of ["niveles", "nivelActual", "cargarNivel"]) if (!__existe(n)) return { ok: false, msg: "No encuentro <code>" + n + "</code>." };
    if (!Array.isArray(niveles) || niveles.length < 2) return { ok: false, msg: "<code>niveles</code> debe ser una lista con al menos 2 mapas." };
    for (let i = 0; i < niveles.length; i++) {
      const m = niveles[i];
      if (!Array.isArray(m) || m.length !== 10 || m.some((f) => !Array.isArray(f) || f.length !== 10)) return { ok: false, msg: "El nivel " + i + " no es un mapa de 10 × 10. Revise corchetes y comas." };
      if (m[1][1] !== 0 || m[8][8] !== 0) return { ok: false, msg: "En el nivel " + i + " el inicio (1,1) y la meta (8,8) deben ser 0." };
    }
    cargarNivel(1);
    if (mapa !== niveles[1] || robotX !== 1 || robotY !== 1) { return { ok: false, msg: "<code>cargarNivel(1)</code> debe poner <code>mapa = niveles[1]</code> y el robot en 1,1." }; }
    cargarNivel(0); gano = false;
    if (mapa[8][7] === 0) {
      robotX = 7; robotY = 8; mover(1, 0);
      const n = nivelActual;
      cargarNivel(0); gano = false; document.getElementById("mensaje").textContent = "";
      if (n !== 1) return { ok: false, msg: "Llegué a la meta del nivel 0 pero no pasé al nivel 1. Revise <code>revisarMeta()</code>: debe llamar <code>cargarNivel(nivelActual + 1)</code>." };
    }
    return { ok: true, msg: "¡Ahora su juego tiene niveles! Al llegar a la meta pasa al siguiente." };
  } },

{ t: "Hacia dónde mira el robot", c: "DIRECCIÓN + ARRAYS",
  e: `<p>Para que el robot se maneje solo con órdenes como <b>avanzar</b> y <b>girar</b>, debe saber hacia dónde mira. Usamos un número: <code>0</code> = derecha, <code>1</code> = abajo, <code>2</code> = izquierda, <code>3</code> = arriba.</p>
<p>Dos listas traducen la dirección a movimiento: <code>DX = [1, 0, -1, 0]</code> y <code>DY = [0, 1, 0, -1]</code>. Si mira a la derecha (0), avanzar es <code>mover(DX[0], DY[0])</code> = <code>mover(1, 0)</code>.</p>
<p>Girar a la derecha suma 1; el operador <code>%</code> (resto de dividir) hace que después de 3 vuelva a 0: <code>(3 + 1) % 4 = 0</code>. Girar a la izquierda es sumar 3.</p>
<p>Extra: reescriba <code>dibujarRobot()</code> con un “ojo” blanco que muestre hacia dónde mira.</p>`,
  tarea: `Cree <code>let direccion = 0</code>, <code>DX</code>, <code>DY</code>, <code>girarDerecha()</code> y <code>girarIzquierda()</code> (que redibujen). Opcional: el ojo.`,
  pista: `function girarDerecha() { direccion = (direccion + 1) % 4; dibujar(); }`,
  sol: `let direccion = 0;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

function girarDerecha() {
  direccion = (direccion + 1) % 4;
  dibujar();
}

function girarIzquierda() {
  direccion = (direccion + 3) % 4;
  dibujar();
}

function dibujarRobot() {
  ctx.fillStyle = "#ff2d4a";
  ctx.fillRect(robotX * TAM + 5, robotY * TAM + 5, TAM - 10, TAM - 10);
  ctx.fillStyle = "#ffffff";
  const ojoX = robotX * TAM + 13 + DX[direccion] * 7;
  const ojoY = robotY * TAM + 13 + DY[direccion] * 7;
  ctx.fillRect(ojoX, ojoY, 4, 4);
}

dibujar();`,
  test: function () {
    for (const n of ["direccion", "DX", "DY", "girarDerecha", "girarIzquierda"]) if (!__existe(n)) return { ok: false, msg: "No encuentro <code>" + n + "</code>." };
    if (String(DX) !== "1,0,-1,0" || String(DY) !== "0,1,0,-1") return { ok: false, msg: "Revise los valores: <code>DX = [1, 0, -1, 0]</code> y <code>DY = [0, 1, 0, -1]</code>." };
    direccion = 0; girarDerecha();
    if (direccion !== 1) return { ok: false, msg: "Desde 0, <code>girarDerecha()</code> debería dejar la dirección en 1 (abajo)." };
    girarDerecha(); girarDerecha(); girarDerecha();
    if (direccion !== 0) return { ok: false, msg: "Después de 4 giros a la derecha debería volver a 0, pero da " + direccion + ". ¿Usó <code>% 4</code>?" };
    girarIzquierda();
    if (direccion !== 3) return { ok: false, msg: "Desde 0, <code>girarIzquierda()</code> debería dar 3 (arriba), pero da " + direccion + ". Pruebe <code>(direccion + 3) % 4</code>." };
    direccion = 0; dibujar();
    return { ok: true, msg: "¡El robot ya tiene orientación! Si hizo el ojo, verá hacia dónde mira." };
  } },

{ t: "Programar al robot: avanzar() y girar", c: "COMANDOS + TEMPORIZADOR",
  e: `<p>Ahora usted le da <b>órdenes</b> al robot, como en los juegos de programación de robots. Primero <code>puedeAvanzar()</code> (¿hay camino al frente?) y <code>avanzar()</code>:</p>
<pre>function puedeAvanzar() {
  return !esPared(robotX + DX[direccion], robotY + DY[direccion]);
}</pre>
<p>El <code>!</code> significa “no”. Luego, una función <code>ejecutar(comandos)</code> recibe una lista como <code>["avanzar", "derecha", "avanzar"]</code> y hace un paso cada 300 milisegundos con <code>setInterval</code> (un reloj que repite). Cuando se acaban los comandos, se detiene con <code>clearInterval</code>.</p>`,
  tarea: `Cree <code>puedeAvanzar()</code>, <code>avanzar()</code> y <code>ejecutar(comandos)</code> que entienda "avanzar", "derecha" e "izquierda". Pruebe con un programa propio al final.`,
  pista: `En ejecutar: let paso = 0; const reloj = setInterval(function () { if (paso >= comandos.length) { clearInterval(reloj); return; } const orden = comandos[paso]; …tres if… paso = paso + 1; }, 300);`,
  sol: `function puedeAvanzar() {
  return !esPared(robotX + DX[direccion], robotY + DY[direccion]);
}

function avanzar() {
  if (puedeAvanzar()) {
    mover(DX[direccion], DY[direccion]);
  }
}

function ejecutar(comandos) {
  let paso = 0;
  const reloj = setInterval(function () {
    if (paso >= comandos.length) {
      clearInterval(reloj);
      return;
    }
    const orden = comandos[paso];
    if (orden === "avanzar") avanzar();
    if (orden === "derecha") girarDerecha();
    if (orden === "izquierda") girarIzquierda();
    paso = paso + 1;
  }, 300);
}

ejecutar(["avanzar", "avanzar", "avanzar", "derecha", "avanzar", "avanzar"]);`,
  test: async function () {
    for (const n of ["puedeAvanzar", "avanzar", "ejecutar"]) if (!__existe(n)) return { ok: false, msg: "No encuentro <code>" + n + "</code>." };
    __parar();
    cargarNivel(0); direccion = 3;
    if (puedeAvanzar() !== false) return { ok: false, msg: "Mirando hacia arriba desde 1,1 hay pared, pero <code>puedeAvanzar()</code> no dio <code>false</code>." };
    direccion = 0;
    if (mapa[1][2] !== 0 || mapa[1][3] !== 0) return { ok: true, msg: "Las funciones existen. (Su mapa no permite mi prueba automática, pero puede probarlo usted.)" };
    if (puedeAvanzar() !== true) return { ok: false, msg: "Mirando a la derecha desde 1,1 hay camino, pero <code>puedeAvanzar()</code> no dio <code>true</code>. ¿Puso el <code>!</code>?" };
    ejecutar(["avanzar", "avanzar", "derecha"]);
    await __espera(1600);
    const x = robotX, d = direccion;
    __parar(); cargarNivel(0); direccion = 0; dibujar();
    if (x !== 3) return { ok: false, msg: "Con <code>ejecutar([\"avanzar\", \"avanzar\", \"derecha\"])</code> el robot debía llegar a X = 3, pero quedó en X = " + x + ". Revise que <code>paso</code> aumente y que el reloj sea de 300 ms." };
    if (d !== 1) return { ok: false, msg: "El robot avanzó pero no giró a la derecha. Revise el <code>if (orden === \"derecha\")</code>." };
    return { ok: true, msg: "¡Su robot obedece programas! Cambie la lista de comandos y pulse Probar para verlo moverse." };
  } },

{ t: "Piloto automático: resolver el laberinto", c: "ALGORITMO + WHILE",
  e: `<p>Un <b>algoritmo</b> es una receta para resolver un problema. Para salir de un laberinto existe uno famoso: <b>la regla de la mano derecha</b>. Imagine que camina con la mano derecha pegada a la pared; tarde o temprano llega a la salida.</p>
<p>En cada paso:</p>
<ol><li>Gire a la derecha (intente seguir la pared).</li><li><b>Mientras</b> no pueda avanzar, gire a la izquierda.</li><li>Avance.</li></ol>
<p>“Mientras” es el bucle <code>while</code>: repite <b>mientras</b> la condición sea verdadera.</p>
<pre>while (!puedeAvanzar() &amp;&amp; vueltas &lt; 4) { … }</pre>
<p>⚠️ Ponga siempre el contador <code>vueltas</code>: un <code>while</code> que nunca termina congela la página.</p>
<p>Luego conecte el botón 🤖 (id <code>btnAuto</code>) para que con <code>setInterval</code> llame a <code>pasoAutomatico()</code> cada 200 ms hasta que <code>gano</code> sea true; si lo toca otra vez, se detiene.</p>`,
  tarea: `Escriba <code>pasoAutomatico()</code> con la regla de la mano derecha y conecte el botón <code>btnAuto</code>.`,
  pista: `function pasoAutomatico() { girarDerecha(); let vueltas = 0; while (!puedeAvanzar() && vueltas < 4) { girarIzquierda(); vueltas = vueltas + 1; } avanzar(); } — Para el botón, guarde el reloj en let piloto = null;`,
  sol: `function pasoAutomatico() {
  girarDerecha();
  let vueltas = 0;
  while (!puedeAvanzar() && vueltas < 4) {
    girarIzquierda();
    vueltas = vueltas + 1;
  }
  avanzar();
}

let piloto = null;

document.getElementById("btnAuto").addEventListener("click", function () {
  if (piloto) {
    clearInterval(piloto);
    piloto = null;
    return;
  }
  piloto = setInterval(function () {
    if (gano) {
      clearInterval(piloto);
      piloto = null;
      return;
    }
    pasoAutomatico();
  }, 200);
});`,
  test: async function () {
    if (!__existe("pasoAutomatico")) return { ok: false, msg: "No encuentro <code>pasoAutomatico</code>." };
    __parar();
    for (let nivel = 0; nivel < niveles.length; nivel++) {
      cargarNivel(nivel); direccion = 0; gano = false;
      let pasos = 0, llego = false;
      for (; pasos < 600; pasos++) {
        pasoAutomatico();
        if (nivelActual !== nivel || gano) { llego = true; break; }
      }
      if (!llego) { cargarNivel(0); direccion = 0; gano = false; return { ok: false, msg: "En el nivel " + nivel + " el robot dio 600 pasos sin llegar a la meta (quedó en " + robotX + "," + robotY + "). Revise el orden: girar a la derecha, mientras no pueda avanzar girar a la izquierda, y avanzar." }; }
    }
    cargarNivel(0); direccion = 0; gano = false; document.getElementById("mensaje").textContent = "";
    document.getElementById("btnAuto").click();
    await __espera(900);
    const movio = robotX !== 1 || robotY !== 1 || direccion !== 0;
    __parar(); if (__existe("piloto")) piloto = null;
    cargarNivel(0); direccion = 0; gano = false; document.getElementById("mensaje").textContent = "";
    if (!movio) return { ok: false, msg: "El algoritmo funciona 👍, pero al tocar el botón 🤖 el robot no se movió. Revise el <code>addEventListener</code> de <code>btnAuto</code> y el <code>setInterval</code>." };
    return { ok: true, msg: "¡Increíble! Su robot resolvió TODOS los niveles solo. Toque 🤖 en la vista previa para verlo." };
  } },

{ t: "¡Su juego completo!", c: "PROYECTO FINAL",
  e: `<p>🏆 ¡Felicidades, Freddy! Usted programó desde cero un juego completo: variables, canvas, arrays, funciones, eventos, condicionales, bucles, niveles, comandos y un algoritmo que resuelve laberintos.</p>
<p>Ideas para seguir (escríbalas en el editor de esta lección, es opcional):</p>
<ul><li>Cambie los colores en <code>dibujarMapa()</code> o el robot.</li>
<li>Agregue un tercer nivel: <code>niveles.push([ …mapa… ]);</code></li>
<li>Cuente los pasos: una variable <code>let pasos = 0;</code> que suba en <code>mover</code>.</li></ul>
<p>Pulse <b>Probar</b> para jugar su juego, y <b>Descargar juego</b> para guardarlo como un archivo HTML que abre en cualquier navegador.</p>`,
  tarea: `Pulse Probar para jugar (puede dejar el editor vacío o agregar mejoras).`,
  pista: `Pruebe por ejemplo: niveles.push(niveles[0]); para repetir el primer nivel como nivel 3.`,
  sol: `// Ejemplo de mejora: contar pasos
// (agregue en mover:  pasos = pasos + 1;)
let pasos = 0;`,
  test: function () {
    for (const n of ["dibujar", "mover", "cargarNivel", "pasoAutomatico"]) if (!__existe(n)) return { ok: false, msg: "Falta <code>" + n + "</code> de una lección anterior. Revise las lecciones sin ✓." };
    return { ok: true, msg: "🎮 ¡Su juego está listo para jugar! Use los botones o toque 🤖." };
  } },
];

// ---------- Estado ----------
let est = { codigos: {}, hechas: {}, actual: 0 };
try { Object.assign(est, JSON.parse(localStorage.getItem(CLAVE) || "{}")); } catch {}
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(est)); $("guardado").textContent = "guardado ✓"; } catch {} };
if (!(est.actual >= 0 && est.actual < L.length)) est.actual = 0;

const ed = $("editor");
function codigoHasta(i) { return L.slice(0, i).map((_, k) => est.codigos[k] || ""); }

function pintarLista() {
  const ul = $("lista"); ul.innerHTML = "";
  L.forEach((l, i) => {
    const li = document.createElement("li"), b = document.createElement("button");
    b.className = (i === est.actual ? "act " : "") + (est.hechas[i] ? "hecha" : "");
    b.innerHTML = `<span class="n">${String(i + 1).padStart(2, "0")}</span><span>${esc(l.t)}</span><span class="ck">${est.hechas[i] ? "✓" : ""}</span>`;
    b.onclick = () => abrir(i);
    li.appendChild(b); ul.appendChild(li);
  });
  const n = Object.keys(est.hechas).filter((k) => est.hechas[k]).length;
  $("progreso").style.width = (100 * n / L.length) + "%";
  const act = ul.children[est.actual]; if (act && act.scrollIntoView && window.innerWidth <= 820) act.scrollIntoView({ block: "nearest", inline: "center" });
}

function feedback(clase, html) { const f = $("feedback"); f.className = clase; f.innerHTML = html; }

function abrir(i) {
  est.actual = i; guardar();
  const l = L[i];
  $("titulo").textContent = `LECCIÓN ${i + 1} DE ${L.length} · ${l.t}`;
  $("concepto").textContent = l.c;
  $("explicacion").innerHTML = l.e + `<div class="tarea"><b>SU TAREA</b><br>${l.tarea}</div>`;
  ed.value = est.codigos[i] || "";
  $("guardado").textContent = "";
  $("solucion").className = "sol"; $("solucion").innerHTML = "";
  $("descargar").hidden = i !== L.length - 1;
  $("ant").disabled = i === 0; $("sig").disabled = i === L.length - 1;
  feedback(est.hechas[i] ? "ok" : "", est.hechas[i] ? "✓ Ya completó esta lección. Puede volver a probarla." : "");
  $("todo").textContent = codigoHasta(i).filter((c) => c.trim()).join("\n\n") || "(todavía nada)";
  pintarLista();
  correr(false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- Errores amables ----------
function amable(msg) {
  let m;
  if ((m = msg.match(/(\w+) is not defined/)) || (m = msg.match(/Can't find variable: (\w+)/)))
    return `No encuentro <code>${esc(m[1])}</code>. Revise que esté escrito exactamente igual (las mayúsculas cuentan) y que se haya creado en esta lección o en una anterior.`;
  if ((m = msg.match(/Identifier '(\w+)' has already been declared/)) || (m = msg.match(/redeclaration of \w+ (\w+)/)) || (m = msg.match(/(?:variable twice|duplicate variable): '(\w+)'/)))
    return `<code>${esc(m[1])}</code> ya fue creado con <code>let</code> o <code>const</code> (aquí o en otra lección). No se puede crear dos veces: si quiere cambiarlo, escriba <code>${esc(m[1])} = …</code> sin <code>let</code>.`;
  if (/Assignment to constant|Attempted to assign to readonly/.test(msg)) return `Está cambiando una <code>const</code>. Las constantes no cambian; si necesita cambiarla, créela con <code>let</code>.`;
  if (/Unexpected end of (input|script)|Unexpected EOF|missing \}/.test(msg)) return `Parece que falta cerrar algo: una llave <code>}</code>, un paréntesis <code>)</code> o un corchete <code>]</code>. Cuente que cada uno que abre tenga su pareja.`;
  if (/is not a function/.test(msg)) return `Está usando algo como función que no lo es. Revise el nombre (por ejemplo <code>getElementById</code>, con la d minúscula al final) y los paréntesis.`;
  if (/Cannot read prop|undefined is not an object|null is not an object|of undefined|of null/.test(msg)) return `Intenta usar algo que no existe (está vacío). Causas comunes: un id mal escrito en <code>getElementById</code>, o leer <code>mapa[y][x]</code> fuera del mapa.`;
  if (/Unexpected token|Unexpected identifier|Unexpected string|Unexpected number|Invalid or unexpected|SyntaxError|Unexpected keyword/.test(msg)) return `Hay un error de escritura. Revise comillas sin cerrar, comas entre elementos de listas, y que use <code>(</code> <code>)</code> y <code>{</code> <code>}</code> correctamente.`;
  return "";
}

// ---------- Ejecutar en el iframe aislado ----------
let corrida = 0;
const HARNESS_CSS = `html,body{margin:0;background:#000;color:#e3fff1;font-family:system-ui,sans-serif;touch-action:manipulation;-webkit-user-select:none;user-select:none}
body{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0}
canvas{width:300px;height:300px;border:1px solid #1d5a3c;border-radius:6px;background:#000}
#mensaje{min-height:22px;font-weight:700;color:#00ff9c;text-align:center}
.pad{display:grid;grid-template-columns:repeat(3,54px);gap:6px}
.pad button{height:46px;font-size:20px;background:#03140c;color:#e3fff1;border:1px solid #1d5a3c;border-radius:10px}
.pad button:active{background:#0a3a24}`;
const HARNESS_HTML = `<canvas id="pantalla" width="300" height="300"></canvas><div id="mensaje"></div>
<div class="pad"><span></span><button id="btnArriba">⬆</button><span></span><button id="btnIzquierda">⬅</button><button id="btnAuto">🤖</button><button id="btnDerecha">➡</button><span></span><button id="btnAbajo">⬇</button><span></span></div>`;

function harnessScript(bloques, test, id) {
  const j = JSON.stringify({ bloques, test, id }).replace(/</g, "\\u003c");
  return `(function(){
const D=${j};
const enviar=(m)=>{m.__robot=D.id;parent.postMessage(m,"*");};
window.__b=-1;window.__err=false;
window.onerror=function(msg,src,line){window.__err=true;enviar({tipo:"error",msg:String(msg),linea:line,bloque:window.__b});return true;};
window.addEventListener("unhandledrejection",function(e){window.__err=true;enviar({tipo:"error",msg:String(e.reason&&e.reason.message||e.reason),bloque:window.__b});});
window.__existe=function(n){try{return (0,eval)("typeof "+n)!=="undefined";}catch(e){return false;}};
window.__pix=function(x,y){return Array.from(document.getElementById("pantalla").getContext("2d").getImageData(x,y,1,1).data);};
window.__parar=function(){const t=setInterval(function(){},1e5);for(let i=0;i<=t;i++){clearInterval(i);clearTimeout(i);}};
window.__espera=function(ms){return new Promise(function(r){setTimeout(r,ms);});};
for(let i=0;i<D.bloques.length;i++){if(!D.bloques[i].trim())continue;window.__b=i;const s=document.createElement("script");s.textContent=D.bloques[i]+"\\n//# sourceURL=leccion"+(i+1)+".js";document.body.appendChild(s);if(window.__err)break;}
window.__b=-2;
if(!D.test){enviar({tipo:"listo"});return;}
if(window.__err)return;
(async function(){try{const r=await (0,eval)("("+D.test+")")();if(!window.__err)enviar({tipo:"test",ok:!!(r&&r.ok),msg:r&&r.msg||""});}
catch(e){enviar({tipo:"error",msg:String(e&&e.message||e),bloque:-2});}})();
})();`;
}

function construirDoc(bloques, test, id) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${HARNESS_CSS}</style></head><body>${HARNESS_HTML}<script>${harnessScript(bloques, test, id)}<\/script></body></html>`;
}

function correr(conTest) {
  const i = est.actual;
  const bloques = codigoHasta(i).concat(ed.value);
  const id = ++corrida;
  // Revisión de sintaxis aquí afuera: el iframe aislado solo dice "SyntaxError" sin detalles.
  for (let k = 0; k < bloques.length; k++) {
    try { new Function(bloques[k]); } catch (e) {
      if (!(e instanceof SyntaxError)) continue;
      const donde = k < i ? ` <b>(en su código de la lección ${k + 1}; vaya a esa lección y corríjalo)</b>` : "";
      feedback("mal", `🤖 ¡Uy! El código no se pudo leer${donde}.<br>${amable(e.message) || amable("SyntaxError")}<br><small style="color:var(--dim)">Mensaje técnico: ${esc(e.message)}</small>`);
      $("marco").srcdoc = construirDoc(bloques.slice(0, k), "", id);
      return;
    }
  }
  $("marco").srcdoc = construirDoc(bloques, conTest ? L[i].test.toString() : "", id);
  if (conTest) {
    feedback("info", "Revisando su código…");
    clearTimeout(correr.t);
    correr.t = setTimeout(() => { if (corrida === id && $("feedback").className === "info") feedback("mal", "No recibí respuesta de la vista previa. Si usa un bucle <code>while</code>, revise que pueda terminar (¿tiene su contador?)."); }, 6000);
  }
}

window.addEventListener("message", (ev) => {
  const m = ev.data;
  if (!m || m.__robot !== corrida || ev.source !== $("marco").contentWindow) return;
  const i = est.actual;
  if (m.tipo === "error") {
    if ($("feedback").className !== "info" && m.bloque === -1) return;
    const donde = m.bloque >= 0 && m.bloque < i ? ` <b>(el error está en su código de la lección ${m.bloque + 1}; vaya a esa lección y corríjalo)</b>` :
      m.bloque === i && m.linea ? ` <b>(cerca de la línea ${m.linea})</b>` : "";
    const a = amable(m.msg);
    feedback("mal", `🤖 ¡Uy! Algo falló${donde}.<br>${a || ""}<br><small style="color:var(--dim)">Mensaje técnico: ${esc(m.msg)}</small>`);
  } else if (m.tipo === "test") {
    if (m.ok) {
      const nueva = !est.hechas[i];
      est.hechas[i] = true; guardar(); pintarLista();
      feedback("ok", `✅ ${m.msg}${i < L.length - 1 ? `<br><button class="btn prim" style="margin-top:8px" onclick="document.getElementById('sig').click()">Siguiente lección →</button>` : ""}`);
      if (nueva) $("marco").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else feedback("mal", `🤔 Casi. ${m.msg}`);
  }
});

// ---------- Botones ----------
ed.addEventListener("input", () => { est.codigos[est.actual] = ed.value; $("guardado").textContent = "…"; clearTimeout(ed.t); ed.t = setTimeout(guardar, 400); });
ed.addEventListener("keydown", (e) => {
  if (e.key === "Tab") { e.preventDefault(); const s = ed.selectionStart; ed.setRangeText("  ", s, ed.selectionEnd, "end"); ed.dispatchEvent(new Event("input")); }
});
$("probar").onclick = () => { est.codigos[est.actual] = ed.value; guardar(); correr(true); };
$("pista").onclick = () => feedback("info", "💡 " + L[est.actual].pista);
$("verSol").onclick = () => {
  const s = $("solucion");
  if (s.classList.contains("ver")) { s.className = "sol"; return; }
  s.className = "sol ver";
  s.innerHTML = `<p style="margin:0 0 6px;color:var(--dim)">Esta es una solución posible. Le recomiendo <b>escribirla usted</b> (no copiar y pegar): así se aprende.</p><pre>${esc(L[est.actual].sol)}</pre>`;
};
$("ant").onclick = () => est.actual > 0 && abrir(est.actual - 1);
$("sig").onclick = () => est.actual < L.length - 1 && abrir(est.actual + 1);
$("reiniciarTodo").onclick = () => { if (confirm("¿Borrar todo su código y progreso de este tutorial?")) { est = { codigos: {}, hechas: {}, actual: 0 }; guardar(); abrir(0); } };
$("descargar").onclick = () => {
  const codigo = codigoHasta(L.length).concat(ed.value).filter((c) => c.trim()).join("\n\n");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mi robot en el laberinto</title><style>${HARNESS_CSS}</style></head><body>${HARNESS_HTML}<script>\n${codigo.replace(/<\/script/gi, "<\\/script")}\n<\/script></body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  a.download = "robot-laberinto.html"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// Para las pruebas automáticas (no se usa en la app): window.__robotTutorial
window.__robotTutorial = { L, est: () => est };
abrir(est.actual);
})();
