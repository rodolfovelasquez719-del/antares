# Antares Web (PWA)

Versión web instalable de Antares: chat con Google Gemini, en español tico, que funciona
en Android (Chrome) y iPhone (Safari → Compartir → "Agregar a inicio").

Archivos estáticos puros, sin build: se puede subir tal cual a GitHub Pages.

## Probar en tu compu

```
cd antares_web
python3 -m http.server 8000
```
Abrí http://localhost:8000 (el service worker solo funciona en `https://` o `localhost`).

## Publicar en GitHub Pages

1. Subí el contenido de esta carpeta a un repositorio (en la raíz o en `/docs`).
2. En el repo: Settings → Pages → "Deploy from a branch" → elegí la rama y la carpeta.
3. Abrí la URL `https://<usuario>.github.io/<repo>/` en el celular e instalala:
   - Android/Chrome: menú ⋮ → "Instalar app" / "Agregar a pantalla principal".
   - iPhone/Safari: botón Compartir → "Agregar a inicio".

Todas las rutas son relativas, así que funciona dentro de un subdirectorio.
Al publicar una versión nueva, cambiá `VERSION` en `sw.js` para que se actualice la caché.

## Privacidad

- La API key de Gemini, el historial y los datos guardados quedan **solo en el navegador**
  (localStorage). La key se envía únicamente a `generativelanguage.googleapis.com`.
- Nada pasa por ningún servidor propio.

## Funciones

- Chat estilo asistente moderno (burbujas, indicador de "escribiendo", auto-scroll).
- Configuración: API key (Mostrar/Ocultar, Pegar, Borrar), "Probar conexión" con diagnóstico
  por intento, nombre del asistente, tu nombre, personalidad, voz on/off, búsqueda on/off.
- Gemini REST desde el navegador, con reintentos y cambio automático de modelo
  (recuerda el último que funcionó). Acepta keys `AQ.` (auth keys nuevas) y `AIza`.
- Búsqueda web con la herramienta `google_search` de Gemini (grounding) cuando la pregunta
  parece necesitar info actual. Si tu plan/modelo no la permite, sigue sin búsqueda.
- Memoria: historial + datos importantes (siempre pregunta antes de guardar).
- Voz: lectura en voz alta (Web Speech, es-CR → es) y dictado donde el navegador lo soporte
  (el botón del micrófono se oculta si no hay soporte).

## Estructura

```
index.html             Interfaz
styles.css             Estilos (tema oscuro)
manifest.webmanifest   Datos de la app instalable
sw.js                  Service worker (caché de la app, sin tocar las llamadas a Gemini)
js/app.js              Lógica de la interfaz
js/gemini.js           Cliente de Gemini (modelos, reintentos, auth, diagnóstico)
js/memory.js           Historial, datos y configuración en localStorage
js/facts.js            Detección de datos importantes
js/voice.js            Voz (síntesis y reconocimiento)
icons/                 Íconos 192/512, maskable, apple-touch-icon, favicon
```
