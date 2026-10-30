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
