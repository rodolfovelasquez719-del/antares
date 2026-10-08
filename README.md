# Antares Web (PWA)

Versión web instalable de Antares: asistente personal por voz con Google Gemini, en español
formal (trato de usted), que funciona en Android (Chrome) y iPhone (Safari → Compartir →
"Agregar a inicio").

Archivos estáticos puros, sin build: se puede subir tal cual a GitHub Pages.

Versión actual: **1.6.0**: recordatorios y alarmas, lista de compras por tienda, resumen del día
(clima, dólar y noticias de Costa Rica), resumen de documentos PDF y exportar la conversación.
La 1.5.0 trajo el código de seguridad opcional con datos cifrados; la 1.4.0, la interfaz con reactor y HUD.

## Probar en su computadora

```
cd antares_web
python3 -m http.server 8000
```
Abra http://localhost:8000 (el service worker solo funciona en `https://` o `localhost`).

## Publicar en GitHub Pages

1. Suba el contenido de esta carpeta a un repositorio (en la raíz o en `/docs`).
2. En el repositorio: Settings → Pages → "Deploy from a branch" → elija la rama y la carpeta.
3. Abra la URL `https://<usuario>.github.io/<repo>/` en el teléfono e instale la app:
   - Android/Chrome: menú ⋮ → "Instalar app" / "Agregar a pantalla principal".
   - iPhone/Safari: botón Compartir → "Agregar a inicio".

Todas las rutas son relativas, así que funciona dentro de un subdirectorio.
Al publicar una versión nueva, cambie `VERSION` en `sw.js` (por ejemplo `antares-v1.5.0`) y
`APP_VERSION` en `js/app.js`. La app abierta mostrará "Nueva versión disponible" con el botón
Actualizar.

## Código de seguridad (opcional)

- Se ofrece una vez al empezar y se puede crear, cambiar o quitar en Configuración › Seguridad.
- Código de 6 dígitos. **El código no se guarda**: se deriva con PBKDF2-SHA-256 (sal aleatoria de
  16 bytes, 600 000 iteraciones) a una clave que envuelve la clave de datos AES-GCM de 256 bits.
  Con ella se cifran la API key, la configuración, la conversación, la memoria y las miniaturas
  (IndexedDB, IV aleatorio por registro). Un código equivocado simplemente no logra descifrar.
- Al crearlo, los datos que estaban en claro se cifran y se borran las copias de `localStorage`.
- La app arranca bloqueada, se bloquea al salir de ella (si está activado) y tras la inactividad
  elegida (1, 5, 15 o 60 minutos). Al bloquear se borran de la pantalla y de la memoria la
  conversación y la key, y se cancela la respuesta en curso.
- 5 intentos fallidos → espera de 30 s; luego 1 min, 5 min, 15 min y 1 h. La espera sobrevive a
  recargar la página (es disuasiva: lo que protege de verdad es el cifrado).
- Face ID / huella (passkey WebAuthn con verificación de usuario obligatoria): si el navegador
  ofrece la extensión PRF, la passkey también descifra los datos. Si no, queda en **modo
  comodidad**: solo desbloquea mientras la app sigue abierta y, al reabrirla, se pide el código.
- "¿Olvidó su código?" borra, con doble confirmación, todos los datos de Antares en el
  dispositivo (no hay forma de recuperarlos sin servidor). Después se vuelve a pegar la key.
- Límites: un código de 6 dígitos se puede adivinar fuera de la app si alguien copia los datos
  cifrados (PBKDF2 solo lo hace lento); no protege contra malware ni mientras la app está
  desbloqueada. Limite su API key en Google AI Studio.

## Privacidad y almacenamiento

- La API key de Gemini, el historial y los datos guardados quedan **solo en el navegador**
  (localStorage; las miniaturas de fotos y videos, en IndexedDB). La key se envía únicamente a
  `generativelanguage.googleapis.com`, siempre en el encabezado `x-goog-api-key` (nunca en la URL).
- El clima del HUD se consulta a Open-Meteo (Alajuela) sin enviar datos personales.
- La calculadora de rutas envía solo los nombres de los lugares (a Open-Meteo y Nominatim) y
  sus coordenadas (a OSRM).
- Nada pasa por ningún servidor propio.
- En iPhone, la app instalada en la pantalla de inicio tiene un almacenamiento distinto al de
  Safari, y Safari puede borrar los datos si no se usa la app durante 7 días.
- Si el almacenamiento se llena, la app lo avisa (nunca dice "Guardé" si no pudo guardar) y
  libera primero los mensajes y miniaturas más antiguos.

## Funciones

- Pantalla principal con reactor animado en tres estados (en espera, escuchando con ondas y
  dictado en vivo, respondiendo con texto en streaming y botón Detener), HUD con hora, fecha,
  clima real de Alajuela (se oculta si no se puede obtener) y estado de la conexión, y saludo
  según la hora del día con el nombre configurado. El historial del chat sigue a un toque.
- Accesibilidad: botones de 44 px, campos de 16 px, contraste ≥ 4,5:1, `100dvh` con áreas
  seguras, respeto de "reducir movimiento", anuncios al terminar cada respuesta y diálogos que
  toman el foco y se cierran con Escape.
- Configuración: API key (campo oculto con botón de ojo, Pegar), "Probar conexión" (si funciona,
  la key queda guardada), nombre del asistente, cómo llamarlo a usted, personalidad, lectura en
  voz alta (apagada por defecto), idioma de dictado, búsqueda web, memoria, medidor de
  almacenamiento y barra de "Cambios sin guardar" con aviso al salir.
- La primera vez muestra la tarjeta "Configure su API key".
- Gemini REST desde el navegador (orden: 3.5-flash-lite, 3.1-flash-lite, 3.8-flash, flash-latest,
  3.6-flash, 3.5-flash, 3.7-flash). Ante un límite (429) no reintenta el mismo modelo: respeta
  el `retryDelay` indicado y prueba como máximo 3 modelos (2 si hay adjuntos). Los errores se
  muestran con un mensaje corto en español, botón Reintentar y "Ver detalles" para la parte
  técnica; distingue key inválida, vencida, restringida por sitio y API deshabilitada.
- Búsqueda web con la herramienta `google_search` de Gemini (grounding) cuando la pregunta
  parece necesitar información actual. Solo se muestran fuentes `https`.
- Fotos y videos: botón de clip con "Tomar foto", "Grabar video" y "Subir de la galería"
  (hasta 4). Las fotos se comprimen en el navegador; los archivos de más de 4 MB se suben a la
  Files API de Gemini y se reutiliza el `fileUri` en los reintentos. Los videos `.MOV` del
  iPhone se envían como `video/mov`.
- Respuestas en streaming con el tiempo de respuesta y el modelo usado debajo de cada burbuja;
  no se puede enviar otro mensaje mientras responde.
- Memoria automática: cuando un mensaje parece contener un dato duradero sobre usted (nombre,
  familia, gustos, fechas, "recuerde que…"), un modelo rápido lo extrae y lo guarda mostrando
  "Guardé: …" con botón Deshacer. Si el aprendizaje está apagado, pregunta antes de guardar.
- Voz: dictado con respaldo de idioma (es-CR → es-MX → es-US) y mensajes de error claros (en
  iPhone, si el dictado no está permitido, indica activar Siri y Dictado en Ajustes); lectura en
  voz alta opcional con voz masculina en español cuando el sistema la tiene.
- Funciona sin conexión para abrir la app (service worker "primero red" con espera de 3 s y
  respaldo en caché).

## Novedades de la 1.8.0 (manos libres, juegos y robótica)

### Modo «Hey Antares» (opcional, apagado por defecto)
- Se activa con el botón **Hey Antares** bajo el HUD o en Configuración › Manos libres y comodidad.
- Con la app abierta y en pantalla escucha de forma continua (Web Speech API) la palabra de activación:
  «Antares», «Hey Antares» u «Oye Antares». Puede decir todo junto («Oye Antares, ¿cómo está el día?») o
  primero «Antares», esperar el tono y luego el comando (8 s). La respuesta se lee en voz alta.
- Indicador claro: punto verde pulsante «Escuchando «Antares»», «Le escucho…» al activarse, ámbar «en pausa».
- Para no gastar batería ni oírse a sí mismo: se pausa al bloquear, al cambiar de app o apagar la pantalla,
  mientras Antares habla, con el dictado manual y con Configuración abierta; si el reconocimiento falla reintenta
  con espera creciente (0,5 s → 30 s) y se detiene solo tras 5, 10, 30 o 60 minutos sin oír «Antares»
  (un toque lo reanuda). «Antares, deje de escuchar» lo apaga. Para cortar la lectura en voz alta, toque el micrófono («Toque para callar»).
- La palabra solo cuenta al inicio de lo que dice o tras «hey/oye» (no se activa con «la estrella Antares…»).
- **Límites honestos:** no hay escucha con la app cerrada o en segundo plano (ningún navegador lo permite a
  una web). Funciona mejor en **Chrome para Android**; en Android, Chrome puede sonar un tono cada vez que
  reinicia el micrófono. En iPhone/Safari la escucha continua es inestable y puede cortarse; Firefox no tiene
  Web Speech. Si el navegador no lo admite, el botón lo explica en vez de activarse.

### Juegos (panel Ocio)
- **Damas chinas** contra Antares en el tablero de estrella de 121 casillas, 2 jugadores en puntas opuestas
  (usted en cian, abajo; Antares en ámbar, arriba). Pasos a casillas vecinas y saltos encadenados sobre cualquier
  ficha; una ficha que entró a su meta no sale; gana quien llene primero la punta contraria (con la regla
  antibloqueo: meta llena con al menos una ficha suya). Resalta las jugadas legales y la última jugada de Antares,
  **Deshacer**, **Nueva partida**, marcador, y la partida se guarda sola (cifrada si hay código).
  Dificultad **Fácil** (avance codicioso con algo de azar) y **Normal** (busca la mejor respuesta del rival, 2 jugadas).
  En 40 partidas de prueba, Normal le ganó todas a Fácil; cada jugada tarda menos de 25 ms.
- **Trivia de historia y misterios** (Historia de Costa Rica, Esferas del Diquís, Misterios del mundo o Mezcla):
  Gemini genera 5 preguntas de opción múltiple en JSON con la orden de usar solo hechos bien establecidos, y una
  **segunda consulta independiente las verifica**; solo se muestran las que pasan (se avisa cuántas se descartaron),
  y también se descartan las que traen opciones casi iguales. Cada respuesta muestra la explicación y el tipo de
  fuente. Puntaje, racha y mejor racha guardados (cifrados si hay código); evita repetir preguntas recientes.
  **Límite:** son preguntas generadas por IA; la verificación reduce errores pero no los elimina. Cada tanda tarda
  unos 30 s (dos consultas).
- Las damas comunes quedaron fuera de esta versión para priorizar la calidad de las damas chinas.

### Modo Robótica
- Panel **Robótica**: ruta de aprendizaje en 5 niveles (fundamentos y Arduino; sensores y motores; primer robot
  móvil; ESP32, IoT y visión; ROS 2 y robots autónomos) con 27 pasos que se marcan (avance cifrado), ideas de
  proyectos por nivel y notas de seguridad. Sin compras ni enlaces a tiendas.
- **Tutor de robótica**: «Preguntar al tutor» desde el panel, «Activar modo tutor en el chat», o por chat
  «Active el modo tutor de robótica» / «Salir del modo tutor». Mientras está activo, un aviso verde lo indica y
  Gemini responde como tutor (paso a paso, código corto, conexiones pin a pin, advertencias de 3,3 V y baterías,
  sin recomendar compras).

### Comodidad
- **Modo conducción** (botón bajo el HUD o en Configuración): botones grandes, micrófono de 116 px, letra grande,
  sin accesos ni adjuntos, y todas las respuestas (también las locales) en voz alta. Combínelo con «Hey Antares».
- **Tamaño de letra**: Normal, Grande o Muy grande (conversación, campos, botones y paneles).

## Novedades de la 1.7.0 (herramientas de trabajo)

El botón de cuadrícula abre **Paneles** con dos grupos: **Personal** (Recordatorios, Compras, Noticias)
y **Trabajo** (Rutas, Cúbica, Correo, Bitácora). En la pantalla principal hay una segunda fila de
accesos en ámbar para el trabajo.

### Calculadora de rutas
- Panel **Rutas**: un lugar por línea; el primero es el punto de partida (por ejemplo, el CEDI).
  Opciones: regresar al punto de partida, ordenar para recorrer menos (si se apaga, respeta el
  orden escrito) y minutos de descarga por entrega (para estimar la jornada).
- Resultado: orden sugerido, km totales por carretera, minutos de manejo, tramos, «Copiar lista»,
  «Abrir en Google Maps» y «Anotar en la bitácora».
- Por chat: «Calcule la ruta: CEDI Coyol, KFC Escazú, Subway Lindora, Taco Bell Heredia».
- Orden: vecino más cercano desde la salida y mejora 2-opt sobre la matriz de tiempos de OSRM.
- APIs gratuitas, sin key (las dos permiten CORS):
  - Lugares: [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) para ciudades y
    distritos; [Nominatim / OpenStreetMap](https://nominatim.org/) para negocios y direcciones
    («KFC Escazú», «CEDI Coyol», «Parque Central de Alajuela»), limitado a Costa Rica, **máximo
    1 consulta por segundo** y con caché local de los lugares encontrados. El navegador no permite
    cambiar el User-Agent; el sitio se identifica con su propio User-Agent y Referer.
  - Distancias y tiempos: servidor público de prueba de [OSRM](https://project-osrm.org/)
    (`router.project-osrm.org`, servicios `table` y `route`, perfil de auto).
- **Límites honestos:** nunca inventa distancias; si un lugar no se encuentra o OSRM no responde,
  lo dice y no calcula. Los tiempos son de auto (un camión tarda más) y no incluyen presas.
  OpenStreetMap no conoce todos los negocios y a veces elige un homónimo: el panel muestra la
  dirección encontrada para que usted la revise (agregue cantón o distrito si hace falta).
  Máximo 25 paradas. El servidor de OSRM es de demostración, sin garantía de disponibilidad.

### Cúbica / capacidad
- Panel **Cúbica**: perfiles de camión (m³ y kg, se guardan) y carga por producto (cantidad,
  m³ por unidad y kg opcional). Muestra ocupación de volumen y peso, qué cabe, qué cabe a medias
  y qué queda fuera, siguiendo el orden de la lista.
- Por chat: «¿Caben 300 cajas de 0,03 m3 en el camión Isuzu?» o «¿Caben 400 cajas de 0,03 m3 y
  2 m3 de pollo en un camión de 10 m3?». Acepta coma o punto decimal.

### Redactor de correos
- Panel **Correo** o por chat («Redacte un correo de atraso para el gerente del KFC Escazú…»).
  Plantillas: cambio de día de entrega, atraso y confirmación de horario.
- Gemini redacta asunto y cuerpo formales, de usted; lo que falte queda entre [corchetes].
- **Antares nunca envía correos**: solo hay botones para copiar el asunto, el cuerpo o todo.

### Bitácora de rutas
- Panel **Bitácora**: fecha, nombre de la ruta, paradas, km, notas y estado (planificada, en curso,
  cerrada); editar y eliminar con confirmación. Por chat: «Anote la ruta de hoy: Ruta 3 Escazú,
  KFC Escazú, Subway Lindora; nota: cliente nuevo».
- Exportar en **CSV** (UTF-8 con BOM y punto y coma, se abre bien en Excel en español) y en **TXT**.

Todo lo nuevo (camiones, carga, bitácora, última ruta y caché de lugares) se cifra igual que el
resto cuando hay código de seguridad. Accesos directos del ícono (Android): Rutas, Bitácora,
Recordatorios y Noticias.

## Novedades de la 1.6.0

### Recordatorios y alarmas
- Por chat: «Recuérdeme llamar al pediatra a las 5», «Avíseme mañana a las 8»,
  «Recuérdeme el cumpleaños de Evangeline el 10 de octubre» (cumpleaños y aniversarios se repiten cada año).
  Si falta la hora, Antares la pregunta.
- Panel **Recordatorios** (botón de cuadrícula arriba, o «Recordatorios» bajo el HUD): agregar,
  posponer 10 minutos y eliminar; botón para pedir permiso de notificaciones explicado en español.
- Avisos: notificación local del sistema y nota en la conversación. Se usa `TimestampTrigger`
  si el navegador lo trae, `periodicSync` donde exista, y una revisión cada 20 s con la app abierta.
  **Límite honesto:** sin un servidor de notificaciones push, el aviso exacto solo llega con la app
  abierta o en segundo plano reciente; si el teléfono la suspendió, el aviso aparece al abrirla.
- Con código de seguridad, la agenda que lee el service worker solo guarda la hora y un aviso genérico
  («Tiene un recordatorio»); el texto queda cifrado.

### Lista de compras
- Por chat: «Agregue pañales a la lista», «Agregue 2 Nutrilon a la lista de PriceSmart», «¿Qué falta?»,
  «Marque Nutrilon como comprado».
- Panel **Compras**: agrupada por tienda (Walmart, PriceSmart, Maxi Palí, Automercado, Pequeño Mundo,
  Otro), marcar comprado, cantidad −/+, eliminar y «Quitar lo comprado». Empieza vacía.

### Resumen del día (clima, dólar y noticias)
- Por chat: «¿Cómo está el día?», «Noticias», «Tipo de cambio». También el botón «Resumen del día».
- APIs gratuitas, sin key:
  - Clima: [Open-Meteo](https://open-meteo.com/) (Alajuela).
  - Tipo de cambio compra/venta del BCCR: `https://api.hacienda.go.cr/indicadores/tc/dolar`
    (Ministerio de Hacienda, permite CORS).
  - Noticias: RSS de La Nación, El Financiero y Delfino leídos mediante
    [rss2json](https://rss2json.com/) (`api.rss2json.com/v1/api.json?rss_url=…`), porque los RSS
    no permiten lectura directa desde el navegador (CORS). Solo enlaces `https`.
- Se guarda en `sessionStorage` por una hora (no son datos personales).

### Documentos PDF
- Adjuntar → **Documento PDF** (hasta 20 MB). Si no escribe nada, Antares lo resume: puntos clave,
  fechas, montos y lo que usted deba hacer. También puede hacerle preguntas sobre el documento.
- Los PDF de más de 4 MB se suben con la Files API de Gemini; la respuesta llega en streaming.

### Otros
- Configuración › Memoria: exportar la conversación en TXT o JSON, y «Borrar conversación» con confirmación.
- Recordatorios y lista se cifran igual que el resto cuando hay código de seguridad (y se migran al crearlo o quitarlo).

## Estructura

```
index.html             Interfaz
styles.css             Estilos (tema oscuro con rejilla y brillo cian)
fonts/                 Orbitron y Rajdhani (licencia OFL)
manifest.webmanifest   Datos de la app instalable (con capturas)
screenshots/           Capturas para el manifiesto
sw.js                  Service worker (caché de la app, sin tocar las llamadas a Gemini)
js/app.js              Lógica de la interfaz
js/gemini.js           Cliente de Gemini (modelos, límites, errores, Files API)
js/media.js            Fotos, videos y PDF (compresión, miniaturas, subida)
js/memory.js           Historial, datos y configuración (localStorage + IndexedDB)
js/facts.js            Detección de datos importantes
js/voice.js            Voz (síntesis y reconocimiento)
js/weather.js          Clima de Alajuela (Open-Meteo)
js/vault.js            IndexedDB y cifrado (PBKDF2, AES-GCM, HKDF para la passkey)
js/lock.js             Código, intentos, passkey, migración y borrado
js/lockui.js           Pantalla de bloqueo y teclado
js/reminders.js        Recordatorios (datos y lectura de frases en español)
js/shopping.js         Lista de compras por tienda
js/digest.js           Resumen del día: dólar (Hacienda) y noticias (RSS vía rss2json)
js/notify.js           Notificaciones locales y agenda para el service worker
js/panels.js           Paneles (grupos Personal, Trabajo y Ocio)
js/workpanels.js       Paneles de Rutas, Cúbica, Correo y Bitácora
js/routes.js           Lugares (Open-Meteo, Nominatim) y rutas (OSRM, vecino más cercano + 2-opt)
js/cubic.js            Camiones y cálculo de cúbica
js/mail.js             Plantillas y formato del redactor de correos
js/logbook.js          Bitácora de rutas y exportación CSV/TXT
js/ocio.js             Paneles de Damas chinas, Trivia y Robótica
js/chinese-checkers.js Motor de damas chinas (tablero, jugadas legales, victoria, IA)
js/trivia.js           Trivia: preguntas de Gemini, verificación y puntaje
js/robotics.js         Ruta de robótica, proyectos y modo tutor
js/wake.js             Modo «Hey Antares» (escucha continua y palabra de activación)
icons/                 Íconos 192/512, maskable, apple-touch-icon, favicon
```
