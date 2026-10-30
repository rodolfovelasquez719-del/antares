// Antares · muestra-robot · Módulo 0: Desde cero.
// Pruebas: se ejecutan dentro del iframe con __salida (textos mostrados), __tipos (tipo de cada cosa mostrada) y __src (su código).
window.ROBOT_M0 = [
{ t: "¿Qué es programar?", c: "MÓDULO 0 · INSTRUCCIONES EN ORDEN",
  e: `<p><b>Programar</b> es escribir instrucciones para que la computadora las cumpla. Ese texto con instrucciones se llama <b>código</b>.</p>
<p>La computadora no adivina ni “entiende la idea”: hace <b>exactamente</b> lo que está escrito, <b>una línea tras otra, de arriba hacia abajo</b>.</p>
<p>En este módulo usaremos una instrucción ya preparada, <code>mostrar(...)</code>, que escribe un mensaje en el panel negro de abajo:</p>
<pre>mostrar("Primero");
mostrar("Segundo");</pre>
<p>Primero aparece “Primero” y después “Segundo”, porque ese es el orden en que están escritas.</p>`,
  partes: [["mostrar", "El nombre de la instrucción. Le dice a la computadora qué hacer: mostrar algo."],
    ["( )", "Los paréntesis encierran lo que se le entrega a la instrucción: QUÉ mostrar."],
    ['"Primero"', "Las comillas indican que es un texto. Se muestra tal cual, sin las comillas."],
    [";", "El punto y coma marca el final de la instrucción, como el punto al final de una frase."]],
  tarea: `Escriba las dos líneas del ejemplo, en ese orden, y pulse <b>Probar</b>.`,
  reto: `Agregue una tercera línea que muestre <code>"Tercero"</code>. Luego cambie el orden de las líneas y vea cómo cambia el resultado.`,
  pista: `Escriba mostrar, abra paréntesis, comillas, la palabra, cierre comillas, cierre paréntesis y punto y coma. Igual en la segunda línea.`,
  sol: `mostrar("Primero");
mostrar("Segundo");`,
  test: function () {
    if (__salida.length === 0) return { ok: false, msg: "El panel quedó vacío. ¿Escribió <code>mostrar</code> todo en minúsculas?" };
    const i1 = __salida.indexOf("Primero"), i2 = __salida.indexOf("Segundo");
    if (i1 < 0 || i2 < 0) return { ok: false, msg: "Necesito ver “Primero” y “Segundo” (con P y S mayúsculas). Vi: " + __salida.map((s) => "“" + s + "”").join(", ") };
    if (i1 > i2) return { ok: false, msg: "¡Salieron al revés! Eso demuestra que la computadora sigue el orden en que usted escribe. Ponga primero la línea de “Primero”." };
    return { ok: true, msg: "¡Su primer programa! La computadora hizo las dos instrucciones, en orden." };
  } },

{ t: "¿Dónde corre el código?", c: "MÓDULO 0 · EL NAVEGADOR Y JAVASCRIPT",
  e: `<p>Hay muchos <b>lenguajes</b> de programación. Aquí usamos <b>JavaScript</b>, el lenguaje de las páginas web.</p>
<p>Lo que usted escribe aquí lo ejecuta <b>el navegador</b> (Safari en su iPhone, Chrome en su Xiaomi). No necesita instalar nada: el navegador lee el código, de arriba hacia abajo, y lo cumple.</p>
<p>Cuando pulsa <b>Probar</b>, su código se ejecuta en un recuadro aislado (la vista previa), para que un error no dañe nada.</p>`,
  partes: [["mostrar(\"Me llamo Freddy\");", "Una instrucción completa: nombre + paréntesis + qué mostrar + punto y coma."],
    ["Mayúsculas", "JavaScript distingue mayúsculas: <code>mostrar</code> funciona, <code>Mostrar</code> NO."]],
  tarea: `Muestre un mensaje que diga <code>"Me llamo "</code> seguido de su nombre, por ejemplo <code>mostrar("Me llamo Freddy");</code>`,
  reto: `Escriba tres líneas que muestren su nombre, su país y su comida favorita.`,
  pista: `Es una sola línea: mostrar("Me llamo Freddy");`,
  sol: `mostrar("Me llamo Freddy");`,
  test: function () {
    const l = __salida.find((s) => /me llamo\s+\S/i.test(s));
    if (!l) return { ok: false, msg: "No veo un mensaje que empiece con “Me llamo” y su nombre. " + (__salida.length ? "Vi: “" + __salida[0] + "”." : "El panel quedó vacío.") };
    return { ok: true, msg: "¡Mucho gusto! El navegador ejecutó su instrucción y mostró: “" + l + "”." };
  } },

{ t: "Texto y números", c: "MÓDULO 0 · TIPOS DE DATOS",
  e: `<p>Las computadoras manejan distintos <b>tipos de datos</b>. Los dos más básicos:</p>
<ul><li><b>Texto</b> (en inglés <i>string</i>): siempre entre comillas. <code>"Hola"</code>, <code>"25"</code>.</li>
<li><b>Número</b>: sin comillas. <code>25</code>, <code>3.5</code> (los decimales llevan punto, no coma).</li></ul>
<p>Mire la diferencia:</p>
<pre>mostrar("5 + 3");   // muestra: 5 + 3   (es texto, no calcula)
mostrar(5 + 3);     // muestra: 8       (son números, sí calcula)</pre>`,
  partes: [['"5 + 3"', "Con comillas: es un texto. La computadora lo copia tal cual."],
    ["5 + 3", "Sin comillas: son números y el + suma."],
    ["//", "Lo que va después de // es una nota para personas; la computadora lo ignora (lo veremos más adelante)."]],
  tarea: `Muestre el texto <code>"Hola"</code> y, en otra línea, el número <code>7</code> (sin comillas).`,
  reto: `Muestre <code>"10" + "5"</code> y luego <code>10 + 5</code>. ¿Por qué el primero da 105? (Pista: con texto, el + pega.)`,
  pista: `Dos líneas: mostrar("Hola"); y mostrar(7);`,
  sol: `mostrar("Hola");
mostrar(7);`,
  test: function () {
    const h = __salida.indexOf("Hola");
    if (h < 0) return { ok: false, msg: "No veo el texto “Hola” (con H mayúscula y entre comillas)." };
    const n = __salida.findIndex((s, i) => s === "7" && __tipos[i] === "number");
    if (n < 0) {
      if (__salida.includes("7")) return { ok: false, msg: "Mostró el 7, pero como <b>texto</b> (con comillas). Quítele las comillas para que sea un número." };
      return { ok: false, msg: "No veo el número 7. Escriba <code>mostrar(7);</code>" };
    }
    return { ok: true, msg: "¡Exacto! “Hola” es texto y 7 es número. Esa diferencia es muy importante." };
  } },

{ t: "Operaciones", c: "MÓDULO 0 · CALCULAR Y UNIR TEXTO",
  e: `<p>Con números se puede calcular:</p>
<pre>mostrar(10 + 2);   // suma: 12
mostrar(10 - 2);   // resta: 8
mostrar(10 * 2);   // multiplicación (asterisco): 20
mostrar(10 / 2);   // división (barra): 5</pre>
<p>Con texto, el <code>+</code> <b>une</b> (pega) los textos:</p>
<pre>mostrar("Pura" + " vida");   // Pura vida</pre>
<p>Ojo: el espacio va <b>dentro</b> de las comillas; si no, quedaría “Puravida”.</p>`,
  partes: [["*", "En programación se multiplica con asterisco, no con x."], ["/", "Se divide con la barra."],
    ['"Pura" + " vida"', "Dos textos unidos con + forman uno solo."]],
  tarea: `Muestre el resultado de <code>12 * 3</code> y, en otra línea, el texto unido <code>"Antares" + " 2026"</code>.`,
  reto: `Calcule cuántos minutos tiene un día (24 horas por 60 minutos) y muéstrelo junto a un texto: <code>"Minutos en un día: " + (24 * 60)</code>.`,
  pista: `mostrar(12 * 3); y mostrar("Antares" + " 2026");`,
  sol: `mostrar(12 * 3);
mostrar("Antares" + " 2026");`,
  test: function () {
    if (!__salida.includes("36")) return { ok: false, msg: "No veo el 36. Use el asterisco: <code>mostrar(12 * 3);</code> y sin comillas." };
    if (!__salida.includes("Antares 2026")) {
      if (__salida.includes("Antares2026")) return { ok: false, msg: "Salió “Antares2026”, pegado. Ponga el espacio dentro de las comillas: <code>\" 2026\"</code>." };
      return { ok: false, msg: "No veo “Antares 2026”. Una los dos textos con <code>+</code>." };
    }
    return { ok: true, msg: "¡Muy bien! La computadora calculó 12 × 3 = 36 y unió los textos." };
  } },

{ t: "Variables con let", c: "MÓDULO 0 · GUARDAR DATOS",
  e: `<p>Una <b>variable</b> es un espacio en la memoria con un <b>nombre</b>, donde se guarda un dato para usarlo después.</p>
<pre>let edad = 40;
mostrar(edad);       // 40
edad = edad + 1;
mostrar(edad);       // 41</pre>
<p>La primera vez se crea con <code>let</code>. Después, para cambiarla, se escribe el nombre <b>sin</b> <code>let</code>.</p>
<p>Fíjese: <code>mostrar(edad)</code> va <b>sin comillas</b>, porque queremos el <b>valor guardado</b>. <code>mostrar("edad")</code> mostraría la palabra “edad”.</p>`,
  partes: [["let", "Palabra reservada que significa “crear una variable nueva”."],
    ["edad", "El nombre que usted elige. Sin espacios ni tildes; puede usar letras y números."],
    ["=", "En programación NO significa “es igual”: significa “guardar”. Lo de la derecha se guarda en lo de la izquierda."],
    ["edad = edad + 1;", "Se lee de derecha a izquierda: toma el valor actual (40), le suma 1, y guarda el resultado (41) en edad."]],
  tarea: `Cree <code>let edad</code> con su edad, muéstrela, súmele 1 y muéstrela otra vez.`,
  reto: `Cree <code>let ahorro = 1000;</code>, súmele 500, réstele 200 y muestre el resultado final (debe dar 1300).`,
  pista: `Cuatro líneas, igual que el ejemplo. Solo la primera lleva let.`,
  sol: `let edad = 40;
mostrar(edad);
edad = edad + 1;
mostrar(edad);`,
  test: function () {
    if (!__existe("edad")) return { ok: false, msg: "No encuentro la variable <code>edad</code>. ¿La creó con <code>let edad = …</code>?" };
    const nums = __salida.map((s) => (s.match(/-?\d+(\.\d+)?/g) || []).pop()).filter((x) => x !== undefined).map(Number);
    if (__salida.includes("edad")) return { ok: false, msg: "Salió la palabra “edad”. Quite las comillas: <code>mostrar(edad);</code>" };
    if (nums.length < 2) return { ok: false, msg: "Debe mostrar la edad dos veces (antes y después de sumarle 1)." };
    if (nums[nums.length - 1] - nums[0] !== 1) return { ok: false, msg: "El segundo número debería ser 1 más que el primero. Revise <code>edad = edad + 1;</code>" };
    return { ok: true, msg: "¡Perfecto! Guardó un dato, lo usó, lo cambió y lo volvió a usar. Así trabajan los programas." };
  } },

{ t: "const y buenos nombres", c: "MÓDULO 0 · CONSTANTES",
  e: `<p>Si un dato <b>nunca</b> va a cambiar, se crea con <code>const</code> (constante) en vez de <code>let</code>. Si luego intenta cambiarlo, JavaScript da error: eso lo protege de equivocaciones.</p>
<pre>const PAIS = "Costa Rica";
mostrar("Vivo en " + PAIS);   // Vivo en Costa Rica</pre>
<p><b>Reglas para nombres:</b> sin espacios, sin tildes ni ñ (mejor evitarlas), no empezar con número. Si son varias palabras, se juntan con mayúscula: <code>nombreCompleto</code>, <code>robotX</code>. Las constantes fijas se suelen escribir en MAYÚSCULAS.</p>
<p>Recuerde: <code>pais</code> y <code>PAIS</code> son <b>dos nombres distintos</b>.</p>`,
  partes: [["const", "Crea una variable que no se puede cambiar."], ["PAIS", "Nombre en mayúsculas por costumbre, para recordar que es fija."],
    ['"Vivo en " + PAIS', "Une un texto con el valor guardado en PAIS."]],
  tarea: `Cree <code>const PAIS = "Costa Rica";</code> y muestre <code>"Vivo en " + PAIS</code>.`,
  reto: `Debajo, escriba <code>PAIS = "Panamá";</code> y pulse Probar. Lea el error: así reacciona JavaScript cuando se cambia una constante. (Después bórrelo.)`,
  pista: `Dos líneas: la del const y la del mostrar.`,
  sol: `const PAIS = "Costa Rica";
mostrar("Vivo en " + PAIS);`,
  test: function () {
    if (!__existe("PAIS")) return { ok: false, msg: "No encuentro <code>PAIS</code> (en mayúsculas)." };
    if (!/\bconst\s+PAIS\b/.test(__src)) return { ok: false, msg: "Cree <code>PAIS</code> con <code>const</code>, no con let." };
    if (!__salida.includes("Vivo en Costa Rica")) return { ok: false, msg: "Debe salir exactamente “Vivo en Costa Rica”. ¿Dejó el espacio después de “en”? Vi: " + (__salida.map((s) => "“" + s + "”").join(", ") || "nada") };
    return { ok: true, msg: "¡Bien! Ahora sabe cuándo usar const (no cambia) y cuándo let (sí cambia)." };
  } },

{ t: "Comentarios", c: "MÓDULO 0 · NOTAS PARA PERSONAS",
  e: `<p>Un <b>comentario</b> es una nota dentro del código que la computadora <b>ignora</b>. Sirve para explicarse a uno mismo qué hace cada parte.</p>
<pre>// Esto es un comentario de una línea
mostrar("Hola");   // también puede ir al final

/* Esto es un comentario
   de varias líneas */</pre>
<p>Truco útil: para “apagar” una línea sin borrarla, póngale <code>//</code> al inicio.</p>`,
  partes: [["//", "Desde aquí hasta el final de la línea es comentario."], ["/* … */", "Todo lo que queda entre /* y */ es comentario, aunque ocupe varias líneas."]],
  tarea: `Escriba un comentario que explique lo que hará, y debajo una línea <code>mostrar("Aprendiendo");</code>. Agregue también una línea <code>// mostrar("Oculto");</code> que NO debe aparecer.`,
  reto: `Vuelva a la lección 5 (Variables) y agregue un comentario a cada línea explicando qué hace.`,
  pista: `// Muestro un mensaje
mostrar("Aprendiendo");
// mostrar("Oculto");`,
  sol: `// Muestro un mensaje de práctica
mostrar("Aprendiendo");
// mostrar("Oculto");`,
  test: function () {
    if (!/\/\/|\/\*/.test(__src)) return { ok: false, msg: "No veo ningún comentario. Empiece una línea con <code>//</code>." };
    if (!__salida.includes("Aprendiendo")) return { ok: false, msg: "No veo “Aprendiendo”. ¿Esa línea quedó comentada por error?" };
    if (__salida.includes("Oculto")) return { ok: false, msg: "“Oculto” apareció: esa línea debe empezar con <code>//</code> para que la computadora la ignore." };
    return { ok: true, msg: "¡Correcto! La computadora ignoró el comentario y la línea apagada." };
  } },

{ t: "Leer errores y arreglar typos", c: "MÓDULO 0 · ERRORES COMUNES",
  e: `<p>Todos los programadores se equivocan, todos los días. Lo importante es <b>leer el mensaje de error</b>: casi siempre dice qué falta o qué nombre no se encontró.</p>
<p>Los errores más comunes:</p>
<ul><li><b>Comillas sin cerrar</b>: <code>mostrar("Hola);</code></li>
<li><b>Paréntesis sin cerrar</b>: <code>mostrar("Hola";</code></li>
<li><b>Mayúsculas</b>: <code>Mostrar("Hola");</code> → “Mostrar is not defined” (no existe).</li>
<li><b>Texto sin comillas</b>: <code>mostrar(Hola);</code> → busca una variable llamada Hola que no existe.</li>
<li><b>Punto y coma</b>: casi siempre JavaScript lo perdona, pero es buena costumbre ponerlo.</li></ul>
<p>Cuando algo falle aquí, le mostraré una explicación sencilla y, abajo, el “mensaje técnico” original (en inglés). Con el tiempo aprenderá a leerlo directamente.</p>`,
  partes: [["is not defined / Can't find variable", "“No está definido”: usó un nombre que no existe. Revise mayúsculas y comillas."],
    ["Unexpected token / Unexpected end", "“Símbolo inesperado” o “final inesperado”: falta o sobra una comilla, paréntesis o llave."]],
  tarea: `Este código tiene 3 errores. Escríbalo <b>corregido</b>:<pre>Mostrar("Hola");
mostrar("Adiós";
mostrar(Pura vida);</pre>`,
  reto: `Escriba a propósito cada uno de los errores de la lista, pulse Probar y lea qué mensaje da. Así los reconocerá cuando le pasen.`,
  pista: `1) mostrar con m minúscula. 2) Falta cerrar el paréntesis antes del punto y coma. 3) “Pura vida” es texto: necesita comillas.`,
  sol: `mostrar("Hola");
mostrar("Adiós");
mostrar("Pura vida");`,
  test: function () {
    for (const t of ["Hola", "Adiós", "Pura vida"]) if (!__salida.includes(t)) return { ok: false, msg: "Todavía no veo “" + t + "”. Revise esa línea." };
    return { ok: true, msg: "¡Excelente detective! Arregló mayúsculas, paréntesis y comillas: los tres errores más comunes." };
  } },

{ t: "Verdadero, falso y la decisión if", c: "MÓDULO 0 · CONDICIONALES",
  e: `<p>Además de texto y números existe el tipo <b>booleano</b>: solo puede ser <code>true</code> (verdadero) o <code>false</code> (falso). Las <b>comparaciones</b> dan uno de los dos:</p>
<pre>mostrar(30 > 25);    // true  (mayor que)
mostrar(10 &lt; 5);     // false (menor que)
mostrar(7 === 7);    // true  (igual a: tres signos =)
mostrar(7 !== 8);    // true  (distinto de)</pre>
<p>Con <code>if</code> (“si”) el programa <b>decide</b>:</p>
<pre>let temperatura = 30;
if (temperatura > 25) {
  mostrar("Hace calor");
} else {
  mostrar("Está fresco");
}</pre>`,
  partes: [["if", "“Si”. Revisa la condición entre paréntesis."], ["(temperatura > 25)", "La condición: da true o false."],
    ["{ … }", "Las llaves agrupan las instrucciones que se hacen si la condición es true."],
    ["else", "“Si no”. Lo que se hace cuando la condición es false. Es opcional."],
    ["===", "Compara si dos cosas son iguales. Un solo = guarda; tres === comparan."]],
  tarea: `Escriba el ejemplo de la temperatura con <code>let temperatura = 30;</code> y su <code>if</code> / <code>else</code>.`,
  reto: `Cambie la temperatura a 18 y pruebe. Luego haga otro if: si <code>edad >= 18</code> muestre "Mayor de edad", si no "Menor de edad".`,
  pista: `Copie la estructura con cuidado: if, paréntesis con la condición, llave que abre, mostrar, llave que cierra, else, llave, mostrar, llave.`,
  sol: `let temperatura = 30;
if (temperatura > 25) {
  mostrar("Hace calor");
} else {
  mostrar("Está fresco");
}`,
  test: function () {
    if (!__existe("temperatura")) return { ok: false, msg: "No encuentro <code>temperatura</code>." };
    if (!/\bif\s*\(/.test(__src)) return { ok: false, msg: "No veo el <code>if (…)</code>." };
    const esperado = temperatura > 25 ? "Hace calor" : "Está fresco";
    if (!__salida.includes(esperado)) return { ok: false, msg: "Con temperatura = " + temperatura + " debería salir “" + esperado + "”. Revise los textos y las llaves." };
    if (__salida.includes("Hace calor") && __salida.includes("Está fresco")) return { ok: false, msg: "Salieron los dos mensajes. El segundo debe ir dentro de <code>else { … }</code>." };
    return { ok: true, msg: "¡Su programa ya toma decisiones! Pruebe cambiar la temperatura." };
  } },

{ t: "Repaso: quiz", c: "MÓDULO 0 · ¿QUÉ APRENDIÓ?",
  e: `<p>Responda estas preguntas. Si se equivoca, le explico por qué. Al acertar todas, pasa a programar el robot. 🤖</p>`,
  quiz: [
    { p: "¿En qué orden ejecuta la computadora las líneas?", o: ["En el orden que ella prefiera", "De arriba hacia abajo, una por una", "Todas al mismo tiempo"], r: 1, x: "La computadora sigue el código línea por línea, de arriba hacia abajo." },
    { p: "¿Qué muestra <code>mostrar(\"4\" + \"4\")</code>?", o: ["8", "44", "Error"], r: 1, x: "Con comillas son textos, y el + los une: “44”." },
    { p: "¿Qué palabra crea una variable que SÍ puede cambiar?", o: ["const", "let", "mostrar"], r: 1, x: "let crea variables que pueden cambiar; const, las que no." },
    { p: "¿Qué significa <code>=</code> en <code>let x = 5;</code>?", o: ["Compara si x es igual a 5", "Guarda 5 en x"], r: 1, x: "Un solo = guarda. Para comparar se usa ===." },
    { p: "Aparece “Mostrar is not defined”. ¿Qué pasó?", o: ["Falta internet", "Escribió Mostrar con M mayúscula", "El código es muy largo"], r: 1, x: "JavaScript distingue mayúsculas: la instrucción es mostrar, en minúscula." },
    { p: "¿Qué hace una línea que empieza con <code>//</code>?", o: ["Es un comentario: la computadora la ignora", "Divide entre dos"], r: 0, x: "// marca un comentario, una nota para personas." },
    { p: "Con <code>let t = 10;</code>, ¿qué muestra <code>if (t > 25) { mostrar(\"A\"); } else { mostrar(\"B\"); }</code>?", o: ["A", "B", "A y B"], r: 1, x: "10 > 25 es false, así que se ejecuta el else: “B”." },
  ],
  tarea: `Elija una respuesta en cada pregunta y pulse <b>Revisar respuestas</b>.`,
  reto: `Invente usted una pregunta para el quiz sobre lo aprendido y respóndala con código.`,
  pista: `Si duda, vuelva a la lección correspondiente en la lista; su progreso no se pierde.`,
  sol: ``
},
];

// ---- v2: lecciones nuevas del Módulo 0 (pasos más pequeños antes del robot) ----
// Cada lección tiene un id fijo para que el progreso guardado no se mueva al insertar lecciones.
window.ROBOT_M0.forEach((l, k) => { l.id = "b" + k; });
window.ROBOT_M0.splice(9, 0,
{ id: "b10", t: "Repetir con for", c: "MÓDULO 0 · BUCLES",
  e: `<p>Si quiere mostrar los números del 1 al 5, podría escribir 5 líneas. Pero ¿y del 1 al 1000? Para repetir se usa un <b>bucle</b>. El más común es <code>for</code>:</p>
<pre>for (let i = 1; i &lt;= 5; i++) {
  mostrar(i);
}</pre>
<p>Se lee: “empiece con i en 1; <b>mientras</b> i sea menor o igual a 5, haga lo de las llaves; después de cada vuelta, súmele 1 a i”.</p>
<p>Resultado: 1, 2, 3, 4, 5. Cada repetición se llama <b>vuelta</b> o <b>iteración</b>.</p>`,
  partes: [["for", "“Para”: palabra que inicia un bucle."], ["let i = 1;", "1) Inicio: crea el contador i. Se hace una sola vez."],
    ["i <= 5;", "2) Condición: se revisa ANTES de cada vuelta. Si es false, el bucle termina. <= es “menor o igual”."],
    ["i++", "3) Paso: después de cada vuelta, i aumenta 1 (igual que i = i + 1)."], ["{ mostrar(i); }", "El cuerpo: lo que se repite."]],
  tarea: `Muestre los números del 1 al 5 con un <code>for</code> (no escriba 5 mostrar).`,
  reto: `Muestre la tabla del 7: “7 x 1 = 7” hasta “7 x 10 = 70”. Pista: <code>mostrar("7 x " + i + " = " + (7 * i));</code>`,
  pista: `Copie la estructura: for (let i = 1; i <= 5; i++) { mostrar(i); }`,
  sol: `for (let i = 1; i <= 5; i++) {
  mostrar(i);
}`,
  resumen: ["Un bucle for repite instrucciones.", "Tiene 3 partes: inicio; condición; paso.", "i++ suma 1 al contador."],
  test: function () {
    if (!/\bfor\s*\(/.test(__src)) return { ok: false, msg: "Use un bucle <code>for (…) { … }</code> en vez de escribir cada número." };
    const n = __salida.join(",");
    if (n.indexOf("1,2,3,4,5") < 0) {
      if (n.indexOf("0,1,2,3,4") >= 0) return { ok: false, msg: "Salió de 0 a 4. Empiece con <code>let i = 1</code> y use <code>i &lt;= 5</code>." };
      if (n.indexOf("1,2,3,4") >= 0) return { ok: false, msg: "Le faltó el 5. Con <code>i &lt; 5</code> se detiene en 4; use <code>i &lt;= 5</code>." };
      return { ok: false, msg: "Esperaba ver 1, 2, 3, 4, 5. Vi: " + (n || "nada") };
    }
    return { ok: true, msg: "¡Su primer bucle! Una sola instrucción repetida 5 veces." };
  } },
{ id: "b11", t: "Crear sus propias funciones", c: "MÓDULO 0 · FUNCIONES",
  e: `<p><code>mostrar</code> es una <b>función</b>: un grupo de instrucciones con nombre. Usted también puede crear las suyas:</p>
<pre>function saludar(nombre) {
  mostrar("Hola " + nombre);
}

saludar("Freddy");    // Hola Freddy
saludar("Antares");   // Hola Antares</pre>
<p>Crear la función (<b>definirla</b>) no la ejecuta: solo guarda la receta. Se ejecuta cuando la <b>llama</b> por su nombre con paréntesis.</p>
<p><code>nombre</code> es un <b>parámetro</b>: una variable que se llena con el dato que se pasa al llamar.</p>`,
  partes: [["function", "Palabra para crear una función."], ["saludar", "El nombre de la función (usted lo elige)."],
    ["(nombre)", "Parámetro: recibe el dato. Al llamar saludar(\"Freddy\"), nombre vale \"Freddy\"."], ["{ … }", "El cuerpo: lo que hace la función."],
    ["saludar(\"Freddy\");", "La llamada: ahora sí se ejecuta."]],
  tarea: `Cree la función <code>saludar(nombre)</code> y llámela dos veces: con "Freddy" y con "Antares".`,
  reto: `Cree <code>presentar(nombre, pais)</code> con DOS parámetros que muestre “Soy Freddy de Costa Rica”.`,
  pista: `Primero el bloque function saludar(nombre) { … } y debajo, fuera de las llaves, las dos llamadas.`,
  sol: `function saludar(nombre) {
  mostrar("Hola " + nombre);
}

saludar("Freddy");
saludar("Antares");`,
  resumen: ["Una función agrupa instrucciones con un nombre.", "Definir ≠ ejecutar: se ejecuta al llamarla con ().", "Los parámetros reciben datos distintos en cada llamada."],
  test: function () {
    if (!__existe("saludar") || typeof saludar !== "function") return { ok: false, msg: "No encuentro la función <code>saludar</code>." };
    if (!__salida.includes("Hola Freddy")) return { ok: false, msg: "No veo “Hola Freddy”. ¿Llamó <code>saludar(\"Freddy\");</code> FUERA de las llaves de la función? ¿Dejó el espacio en \"Hola \"?" };
    if (!__salida.includes("Hola Antares")) return { ok: false, msg: "Falta la segunda llamada con \"Antares\"." };
    return { ok: true, msg: "¡Creó su propia instrucción! Escribió la receta una vez y la usó dos veces." };
  } },
{ id: "b12", t: "Funciones que responden: return", c: "MÓDULO 0 · RETURN",
  e: `<p>Algunas funciones <b>hacen</b> algo (como mostrar). Otras <b>calculan y devuelven</b> una respuesta con <code>return</code>, para usarla después:</p>
<pre>function doble(n) {
  return n * 2;
}

let resultado = doble(5);   // resultado vale 10
mostrar(resultado);
mostrar(doble(21));         // 42</pre>
<p>Cuando se ejecuta <code>return</code>, la función <b>termina</b> en ese momento y entrega el valor a quien la llamó.</p>`,
  partes: [["return n * 2;", "Calcula n * 2 y lo devuelve. La llamada doble(5) “se convierte” en 10."], ["let resultado = doble(5);", "Guarda la respuesta en una variable."],
    ["mostrar(doble(21));", "También se puede usar directamente: primero se calcula doble(21), luego se muestra."]],
  tarea: `Cree <code>doble(n)</code> que devuelva el doble, y muestre <code>doble(5)</code>.`,
  reto: `Cree <code>esPar(n)</code> que devuelva <code>true</code> si n es par. Pista: <code>n % 2 === 0</code> (el resto de dividir entre 2 es 0).`,
  pista: `function doble(n) { return n * 2; } y luego mostrar(doble(5));`,
  sol: `function doble(n) {
  return n * 2;
}

mostrar(doble(5));`,
  resumen: ["return devuelve un valor y termina la función.", "La llamada se “reemplaza” por el valor devuelto.", "Sin return, la función devuelve undefined (nada)."],
  test: function () {
    if (!__existe("doble") || typeof doble !== "function") return { ok: false, msg: "No encuentro la función <code>doble</code>." };
    const r = doble(7);
    if (r === undefined) return { ok: false, msg: "<code>doble(7)</code> no devolvió nada. ¿Usó <code>return</code>? (mostrar dentro de la función no es lo mismo que devolver.)" };
    if (r !== 14) return { ok: false, msg: "<code>doble(7)</code> devolvió " + r + " en vez de 14." };
    if (!__salida.includes("10")) return { ok: false, msg: "La función está bien. Falta mostrar el resultado: <code>mostrar(doble(5));</code>" };
    return { ok: true, msg: "¡Excelente! Probé doble(7) y devolvió 14. Su función responde." };
  } },
{ id: "b13", t: "Listas (arrays)", c: "MÓDULO 0 · ARRAYS",
  e: `<p>Una <b>lista</b> (array) guarda varios datos en orden, en una sola variable:</p>
<pre>let frutas = ["mango", "piña", "banano"];
mostrar(frutas[0]);       // mango  (¡se cuenta desde 0!)
mostrar(frutas.length);   // 3      (cuántos hay)
frutas.push("sandía");    // agrega al final
for (let i = 0; i &lt; frutas.length; i++) {
  mostrar(frutas[i]);     // recorre toda la lista
}</pre>
<p>Recuerde: la primera posición es la <b>0</b> y la última es <code>length - 1</code>.</p>`,
  partes: [["[ \"mango\", … ]", "Corchetes y comas: así se crea una lista."], ["frutas[0]", "El elemento en la posición 0 (el primero)."],
    [".length", "Cuántos elementos tiene la lista."], [".push(…)", "Agrega un elemento al final."],
    ["i < frutas.length", "Recorre de 0 hasta el último. Con <= se pasaría uno (undefined)."]],
  tarea: `Cree <code>frutas</code> con 3 frutas, muestre la primera y el total, agregue una con <code>push</code> y recorra la lista con un for mostrando cada una.`,
  reto: `Cree <code>let notas = [80, 95, 70];</code> y calcule el promedio con un for (sume todas y divida entre <code>notas.length</code>).`,
  pista: `Siga el ejemplo línea por línea. En el for, la condición es i < frutas.length.`,
  sol: `let frutas = ["mango", "piña", "banano"];
mostrar(frutas[0]);
mostrar(frutas.length);
frutas.push("sandía");
for (let i = 0; i < frutas.length; i++) {
  mostrar(frutas[i]);
}`,
  resumen: ["Un array guarda varios datos en orden.", "Se accede por posición: lista[0] es el primero.", ".length da el tamaño; .push agrega.", "Un for recorre todos los elementos."],
  test: function () {
    if (!__existe("frutas") || !Array.isArray(frutas)) return { ok: false, msg: "No encuentro la lista <code>frutas</code> (con corchetes [ ])." };
    if (frutas.length < 4) return { ok: false, msg: "La lista tiene " + frutas.length + " elementos. Debe tener 3 al inicio y agregar uno con <code>push</code>." };
    if (__salida.includes("undefined")) return { ok: false, msg: "Salió “undefined”: intentó leer una posición que no existe. En el for use <code>i &lt; frutas.length</code> (no <=)." };
    const faltan = frutas.filter((f) => !__salida.includes(String(f)));
    if (faltan.length) return { ok: false, msg: "No se mostraron todas: falta “" + faltan[0] + "”. ¿Recorrió la lista con el for DESPUÉS del push?" };
    if (!__salida.includes("3")) return { ok: false, msg: "Muestre también el total inicial con <code>mostrar(frutas.length);</code> antes del push." };
    return { ok: true, msg: "¡Muy bien! Creó, leyó, amplió y recorrió una lista. El laberinto del robot será una lista de listas." };
  } },
{ id: "b15", t: "Objetos: datos con nombre", c: "MÓDULO 0 · OBJETOS",
  e: `<p>Un <b>objeto</b> agrupa datos relacionados, cada uno con su <b>nombre</b> (propiedad). Es ideal para describir una cosa, como un robot:</p>
<pre>let robot = { nombre: "R2", x: 1, y: 1, bateria: 100 };
mostrar(robot.nombre);        // R2
robot.x = robot.x + 1;        // se mueve
mostrar(robot.x);             // 2</pre>
<p>Lista = datos <b>en orden</b> (posición 0, 1, 2…). Objeto = datos <b>con nombre</b> (nombre, x, y…).</p>
<p>Usted ya usó objetos sin saberlo: <code>document</code>, <code>frutas.length</code>… el punto <code>.</code> entra a una propiedad.</p>`,
  partes: [["{ }", "Las llaves crean el objeto."], ["nombre: \"R2\"", "Una propiedad: nombre, dos puntos, valor. Se separan con comas."],
    ["robot.nombre", "Leer una propiedad con el punto."], ["robot.x = robot.x + 1;", "Cambiar una propiedad."]],
  tarea: `Cree el objeto <code>robot</code> con <code>nombre</code>, <code>x</code> y <code>y</code> (x empezando en 1). Muestre el nombre, súmele 1 a <code>robot.x</code> y muéstrelo.`,
  reto: `Agregue <code>bateria: 100</code> y una función <code>moverRobot()</code> que sume 1 a x y reste 10 a la batería. Llámela 3 veces y muestre la batería (70).`,
  pista: `let robot = { nombre: "R2", x: 1, y: 1 }; — recuerde las comas entre propiedades.`,
  sol: `let robot = { nombre: "R2", x: 1, y: 1 };
mostrar(robot.nombre);
robot.x = robot.x + 1;
mostrar(robot.x);`,
  resumen: ["Un objeto agrupa datos con nombre: { nombre: valor }.", "Se lee y se cambia con el punto: robot.x.", "Listas = orden; objetos = nombres."],
  test: function () {
    if (!__existe("robot") || typeof robot !== "object" || !robot) return { ok: false, msg: "No encuentro el objeto <code>robot</code> (creado con llaves { })." };
    if (!robot.nombre) return { ok: false, msg: "Al robot le falta la propiedad <code>nombre</code>." };
    if (robot.x !== 2) return { ok: false, msg: "<code>robot.x</code> debería terminar en 2 (empieza en 1 y se le suma 1). Vale: " + robot.x };
    if (!__salida.includes(String(robot.nombre))) return { ok: false, msg: "Muestre el nombre: <code>mostrar(robot.nombre);</code>" };
    return { ok: true, msg: "¡Su primer objeto! Así se describen robots, personas o productos en programas reales." };
  } },
{ id: "b14", t: "Depurar: encontrar errores como un profesional", c: "MÓDULO 0 · DEPURACIÓN",
  e: `<p>A veces el código no da error, pero <b>el resultado está mal</b>. Eso se llama un <b>bug</b>. Para encontrarlo, los programadores <b>miran por dentro</b>: agregan <code>mostrar</code> (o <code>console.log</code>) en puntos clave para ver cuánto vale cada variable en cada momento.</p>
<p>Este código debería sumar 1 + 2 + 3 = 6, pero muestra 3:</p>
<pre>let total = 0;
for (let i = 1; i &lt; 3; i++) {
  total = total + i;
}
mostrar("Total: " + total);</pre>
<p><b>Hábito profesional:</b> 1) Lea el resultado. 2) Adivine dónde puede estar el error. 3) Agregue un mostrar para comprobar. 4) Corrija UNA cosa. 5) Pruebe otra vez.</p>`,
  partes: [["mostrar(\"i=\" + i + \" total=\" + total);", "Una línea de rastreo dentro del bucle: muestra los valores en cada vuelta."],
    ["bug", "Un error de lógica: el programa corre pero hace algo distinto a lo que se quería."]],
  tarea: `Escriba el código de arriba, agregue un <code>mostrar</code> de rastreo dentro del for, descubra el bug y corríjalo para que salga <code>Total: 6</code>.`,
  reto: `Escriba un bucle que sume del 1 al 100 (debe dar 5050). Use el rastreo solo en las primeras vueltas para comprobar.`,
  pista: `Con el rastreo verá que i solo llega a 2. ¿Qué condición hace que también entre el 3?`,
  sol: `let total = 0;
for (let i = 1; i <= 3; i++) {
  mostrar("i=" + i + " total=" + total);
  total = total + i;
}
mostrar("Total: " + total);`,
  resumen: ["Un bug es un error de lógica.", "Rastree: muestre los valores dentro del código para ver qué pasa.", "Corrija una cosa a la vez y vuelva a probar."],
  test: function () {
    if (!__salida.includes("Total: 6")) return { ok: false, msg: "Todavía no sale “Total: 6”. Agregue un mostrar dentro del for para ver hasta dónde llega i." + (__salida.includes("Total: 3") ? " (Sale 3: el bucle se detiene antes del 3.)" : "") };
    if (__salida.length < 3) return { ok: false, msg: "¡El total ya está bien! Pero agregue también la línea de rastreo dentro del for (es el hábito que estamos practicando)." };
    return { ok: true, msg: "¡Bug encontrado y arreglado! Este hábito de rastrear valores es lo que más usan los programadores reales." };
  } }
);
// El quiz del Módulo 0 ahora también repasa bucles, funciones, return, listas, objetos y depuración.
(function () {
  const quiz = window.ROBOT_M0.find((l) => l.id === "b9");
  quiz.quiz.push(
    { p: "¿Cuántas veces se repite <code>for (let i = 0; i &lt; 3; i++)</code>?", o: ["2", "3", "4"], r: 1, x: "i vale 0, 1 y 2: tres vueltas. Con 3 la condición i < 3 es false y termina." },
    { p: "¿Qué hace <code>return</code> dentro de una función?", o: ["Muestra un mensaje", "Devuelve un valor y termina la función", "Repite la función"], r: 1, x: "return entrega una respuesta a quien llamó la función y la termina." },
    { p: "Con <code>let l = [\"a\", \"b\", \"c\"];</code> ¿qué es <code>l[1]</code>?", o: ["\"a\"", "\"b\"", "\"c\""], r: 1, x: "Se cuenta desde 0: l[0] es \"a\", l[1] es \"b\"." },
    { p: "Con <code>let r = { x: 5 };</code> ¿cómo se lee x?", o: ["r[x]", "r.x", "x.r"], r: 1, x: "Las propiedades de un objeto se leen con punto: r.x." },
    { p: "El programa no da error pero el resultado está mal. ¿Qué hace primero?", o: ["Borrar todo y empezar de nuevo", "Agregar mostrar para ver los valores por dentro", "Cambiar varias cosas a la vez"], r: 1, x: "Rastrear valores muestra dónde está el bug. Luego se corrige una cosa a la vez." }
  );
})();
