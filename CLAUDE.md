# Lector bilingüe de PDF

Aplicación de escritorio (Electron) que muestra un PDF en inglés y, al lado, la
misma página con el texto traducido **dibujado en la posición original**: mismo
tamaño de letra, misma sangría, misma justificación, respetando figuras y fórmulas.

Toda la lógica de lectura vive en un solo archivo, `lector-bilingue.html`
(~1260 líneas): HTML, CSS y JS. Es el **renderer** de Electron. Alrededor solo
hay una cáscara delgada:

| Archivo | Papel |
|---|---|
| `lector-bilingue.html` | El renderer. Todo el trabajo real (extracción, layout, pintado). |
| `main.js` | Proceso principal. Crea la ventana y hace por Node lo que el navegador no puede: la llamada a la API y la persistencia. |
| `preload.js` | Puente seguro (`contextIsolation`). Expone `window.storage` y `window.desktop` al renderer. |
| `package.json` | Scripts y dependencias (`electron`, `pdfjs-dist`). |
| `vendor/` | `pdf.min.js` y `pdf.worker.min.js` bundleados: la app funciona offline. |

La única dependencia de ejecución es pdf.js, ahora local (antes por CDN).

## Idioma del proyecto

Interfaz, mensajes de estado y comentarios del código **en castellano**.
Nombres de variables y funciones en inglés. Mantener esa mezcla.

## Portabilidad (este proyecto vive en un USB)

La carpeta está en `PIERO USB` y se mueve entre equipos como una unidad. Regla:
**todo el contexto durable va dentro de la carpeta del proyecto**, nunca en
`~/.claude`, que se queda en cada máquina.

- **`CLAUDE.md` es el ancla de contexto.** Se carga solo en cada sesión y viaja
  con la carpeta. Las decisiones y aprendizajes del proyecto se escriben aquí,
  no en la memoria de la herramienta (que apunta a C:). Esto es a propósito.
- **`.claude/`** (settings, y si se añaden: agents, commands, skills, hooks) viaja
  con la carpeta.
- Es **independiente de la letra de unidad**: al abrir la carpeta en otro PC
  (sea E:, F:…) el contexto se carga igual, porque se lee por ruta relativa.
- Lo que **no** viaja por sí solo: el historial de conversaciones y la memoria
  global. Por eso lo que importa se destila aquí.
- `node_modules/` no se versiona ni se lleva en el USB: en cada equipo se
  reconstruye con `npm install` (el binario de Electron es propio de cada SO).

## Cómo ejecutarlo

```bash
npm install     # solo la primera vez (baja electron y pdfjs-dist)
npm start       # abre la ventana
```

Punto de entrada: `main.js` (campo `"main"` de `package.json`), que Electron
carga al correr `electron .`. Para no depender de la terminal, hay un lanzador de
doble clic: **`Lector.bat`** — usa su propia ruta (portable por el USB), instala
dependencias si faltan y abre la app. Requiere Node.js en el equipo. El `.exe`
autónomo (sin necesidad de Node) llegará con `electron-builder`, aún pendiente.

### Por qué Electron resolvió el problema de origen

En el navegador, abrir el archivo con doble clic (`file://`) o desde Descargas en
Android (`content://`) daba origen opaco: bloqueaba toda llamada de red y la
traducción fallaba con "Failed to fetch". En la app de escritorio **la llamada a
la API la hace el proceso principal (Node), no la página**: sin CORS, sin el
header de acceso directo del navegador, y la clave no queda en el renderer.

El renderer detecta que corre en Electron por la presencia de `window.desktop`
(lo pone `preload.js`). Cuando existe, `callClaude` y `gtx` enrutan por
`ipcRenderer.invoke` en vez de hacer `fetch` directo. `chooseEngine` también lo
mira: sin `window.desktop` y con origen no-http cae a Google; con él, Claude sí
es alcanzable. **El código sigue funcionando como página web suelta** (esas
ramas quedaron intactas), pero el destino natural ahora es la app.

La clave de API se recuerda entre sesiones (`window.storage`, en la clave
`apikey`) y solo viaja, ya en el proceso principal, a la propia API de Anthropic.

### Empaquetar un .exe distribuible

Pendiente: falta añadir `electron-builder` para generar el instalador. Hoy la app
se corre desde la carpeta con `npm start`.

## Arquitectura

Dos vistas conmutadas por clase `.hidden`: `#library` (cuadrícula de portadas)
y `#reader`. Estado global en el objeto `S`.

### Canal principal (por página)

```
render()
  └─ page.render() → canvas izquierdo (cL)  [original, nunca se modifica]
  └─ drawImage(cL → cR)                     [base del lado derecho]
  └─ extractBlocks(page)   → S.cache[nº página] = {blocks, ocr}
  └─ repaint(e)
       ├─ marca b._keepOne  (¿tiene algo a su derecha? → entrada de índice)
       ├─ layout(tb, s)     → asigna b._fit y b._dy a cada bloque
       ├─ fase 1: borrar TODAS las cajas originales
       └─ fase 2: dibujar TODAS las traducciones
  └─ hotspots(e)           → divs invisibles para el resaltado y el toque
```

`cL` es la fuente de verdad para muestrear colores (`bgColor`, `fgColor`).
Nunca muestrear de `cR`, que ya está modificado.

### extractBlocks (líneas ~476-650) — el corazón del asunto

1. Items de `getTextContent()` con su transformación aplicada. Se guarda
   `it.fontName` como `font` (identificador interno de pdf.js, tipo `g_d0_f3`).
2. **Filas** por línea base, tolerancia relativa al tamaño.
3. **Capitulares**: se descarta el carácter suelto que mide más de 1,7 veces el
   dominante de su fila. Queda intacto en el lienzo y fuera de la traducción.
4. **Líneas**: se parte una fila donde hay un hueco horizontal grande
   (esto separa columnas y no solo palabras).
5. **Interlineado dominante de la página** (`pageLead`, mediana de los saltos).
   Sin esto, un texto a doble espacio deja cada línea como bloque suelto.
6. **Bloques**: se unen líneas consecutivas salvo que haya
   `newPara` (sangría tras línea que llegaba al margen), `BULLET`, `tocBreak`
   (puntos suspensivos + número), `headingBreak` (línea centrada suelta),
   `fontBreak` (cambia la fuente tras una línea corta) o cambio de estilo.
7. **Matemáticas**: los fragmentos detectados se sustituyen por marcadores
   `⟦0⟧ ⟦1⟧` y se guardan en `b.math`; `restore(b)` los reinserta al dibujar.

### Estructura de un bloque

```js
{
  i, text, math[], tr, tried,        // texto con marcadores, traducción, intentado
  skip,                              // true → no se traduce ni se dibuja
  serif, bold, italic, font,         // tipografía dominante
  centered, justified,               // alineación detectada
  capLines, capIndent,               // nº de líneas sangradas al inicio, y cuánto
  x, w, top, bottom, baseline,       // geometría a escala 1
  size, leading, lines,              // cuerpo, interlineado, nº de líneas original
  _fit, _dy, _keepOne                // efímeros, los pone repaint/layout
}
```

Toda la geometría se guarda **a escala 1** y se multiplica por `S.scale` al
pintar. `S.scale` incluye el `devicePixelRatio`; `S.css` es la escala en píxeles
CSS y es la que usan los hotspots.

### Detección de fórmulas (dos capas, no tocar sin leer esto)

En PDF de LaTeX el nombre real de la fuente casi nunca se resuelve
(`page.commonObjs.get` devuelve un identificador interno). Por eso **no** se
puede depender de regex sobre nombres tipo CMMI. Las dos capas que sí funcionan:

1. **Cambio de fuente** (`protectOther`): dentro de un bloque, un fragmento de
   6 caracteres o menos en una fuente distinta a la dominante es una variable o
   un símbolo. Protege `$t_{ij}$` dentro de una frase.
2. **Proporción de palabras** (`wordRatio < 0.5`): un bloque cuyos caracteres
   casi no forman palabras de 3+ letras es una ecuación desplegada → `skip`.

Sin esto, el traductor convierte `sw` en "cállate" y los subíndices `i` en "yo".

### layout() — colocación

Cada bloque intenta primero caber **en su propio sitio** encogiendo como mucho al
72%. Solo si no cabe empuja hacia abajo lo que esté en su misma columna
(solapamiento horizontal > 55% del ancho menor). Nunca puede pasar de un
obstáculo: `inkGrid` construye una rejilla de tinta de la página y borra las
bandas de los bloques que sí se mueven; lo que queda (figuras, líneas, fórmulas,
números de página) es infranqueable.

## Invariantes: regresiones ya sufridas, no repetirlas

- **Pintar en dos fases.** Si se borra y se dibuja bloque por bloque, el relleno
  de uno tapa el texto que otro ya escribió más abajo. Páginas casi vacías.
- **Muestrear color del lienzo original**, no del que se está modificando.
- **`fgColor` debe entender `#ffffff` y `rgb(...)`.** Si no parsea el fondo,
  asume negro, elige el color más lejano y escribe blanco sobre blanco.
- **Solo empujar dentro de la misma columna.** Si no, en un paper con barra
  lateral y dos columnas el desplazamiento se acumula y saca el texto de la hoja.
- **La negrita se mide por proporción de caracteres (>85%)**, no por número de
  fragmentos: si no, una palabra en negrita parte el párrafo en tres.
- **`_keepOne` solo si hay algo a la derecha.** Forzar una línea en cualquier
  bloque de un renglón deja los párrafos cortos con letra diminuta.
- **Comprobar la página antes de repintar** tras un `await`: si el usuario avanzó,
  la traducción se dibuja sobre la página equivocada.
- **Nada de localStorage** (prohibido en artifacts). La persistencia usa
  `window.storage` si existe, siempre entre try/catch.

## Motores de traducción

`chooseEngine()`: `auto` usa Claude si el origen es http(s); si falla una vez,
cae a `google` para el resto de la sesión. El respaldo (`gtx`) usa el endpoint
público de Google Translate, no oficial: sin clave, funciona desde cualquier
origen, calidad menor y traduce apellidos ("St. Pierre & Proper" → "Propio").
Con Claude viajan las reglas de `RULES()`: no traducir autores, citas ni
variables, y conservar los marcadores `⟦n⟧`.

La caché es por página en memoria (`S.cache`) y no se vuelve a traducir al
navegar. `b.tried` marca lo ya intentado; el botón "Traducir" lo reinicia.

## Corpus de prueba

Cada uno rompía algo distinto. Conviene tenerlos a mano en `./pdfs/`.

| Documento | Qué ejercita |
|---|---|
| Resumen del BID, 1 página | Caso limpio de texto corrido. Debe salir perfecto. |
| *Make It Sprint* | Capitular ornamental, viñetas, índice con puntos suspensivos |
| Tesis mecanografiada (222 pp.) | Doble espacio, párrafos solo marcados por sangría, guiones de corte |
| *ipw* (Journal of Statistical Software) | Ecuaciones desplegadas y variables en línea, LaTeX sin nombres de fuente |
| Paper de Wiley, 2 columnas | Barra lateral + caja de resumen + dos columnas |
| *Design and Analysis of Experiments with R* | Listas a dos columnas, portada con banda negra (texto blanco sobre negro) |
| Paper del BID sobre vivienda | Página que no arroja bloques; falta diagnosticar |

## Pendientes

1. **Página sin bloques.** El paper del BID (`RealEstateDiscEcu`) muestra
   "sin texto seleccionable". Falta comprobar si `getTextContent()` devuelve
   vacío (PDF sin ToUnicode → habría que ir por OCR) o si es el filtro de
   fórmulas descartando todo. Añadir un modo de depuración que vuelque el
   recuento de items, líneas y bloques por página.
2. **Índices**: los números de página son bloques `skip`, no se mueven, y si la
   entrada crece a dos líneas se desalinean. Habría que tratar la fila entera
   (entrada + puntos + número) como una unidad.
3. **Traducir el documento entero en segundo plano** mientras se lee, con
   límite de concurrencia y barra de progreso.
4. **Exportar el PDF traducido completo**, no solo PNG por página.
5. **OCR de figuras**: hoy requiere el motor de Claude (visión). Las cajas que
   devuelve el modelo son aproximadas; conviene ajustarlas al recuadro de tinta
   más cercano usando `inkGrid`.
6. Notas al pie y encabezados de página se traducen como cualquier bloque;
   valorar si conviene detectarlos aparte.

## Cómo depurar

No hay tests. El flujo es: abrir la página problemática, comparar los dos lados
y mirar los hotspots (ámbar = conservado sin traducir, aguamarina = traducido).
Para inspeccionar la segmentación:

```js
// en la consola, con una página ya renderizada
S.cache.get(S.page).blocks.map(b => ({
  txt: b.text.slice(0,60), skip: b.skip, lines: b.lines,
  size: +b.size.toFixed(1), x: +b.x.toFixed(0), top: +b.top.toFixed(0)
}))
```
