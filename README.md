# Antares Web (PWA)

Versión web instalable de Antares: asistente personal por voz con Google Gemini, en español
formal (trato de usted), que funciona en Android (Chrome) y iPhone (Safari → Compartir →
"Agregar a inicio").

Archivos estáticos puros, sin build: se puede subir tal cual a GitHub Pages.

Versión actual: **1.4.0** (interfaz estilo panel de control con reactor, HUD y correcciones de la
revisión de código).

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
Al publicar una versión nueva, cambie `VERSION` en `sw.js` (por ejemplo `antares-v1.4.0`) y
`APP_VERSION` en `js/app.js`. La app abierta mostrará "Nueva versión disponible" con el botón
Actualizar.

## Privacidad y almacenamiento

- La API key de Gemini, el historial y los datos guardados quedan **solo en el navegador**
  (localStorage; las miniaturas de fotos y videos, en IndexedDB). La key se envía únicamente a
  `generativelanguage.googleapis.com`, siempre en el encabezado `x-goog-api-key` (nunca en la URL).
- El clima del HUD se consulta a Open-Meteo (Alajuela) sin enviar datos personales.
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
js/media.js            Fotos y videos (compresión, miniaturas, subida)
js/memory.js           Historial, datos y configuración (localStorage + IndexedDB)
js/facts.js            Detección de datos importantes
js/voice.js            Voz (síntesis y reconocimiento)
js/weather.js          Clima de Alajuela (Open-Meteo)
icons/                 Íconos 192/512, maskable, apple-touch-icon, favicon
```
