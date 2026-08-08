# Rediseño del scanner de ControlPDF

**Fecha:** 08/08/2026
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Reemplazo completo del módulo de escaneo. No toca el resto del editor.

---

## 1. Problema

El scanner actual no funciona de forma confiable, sobre todo en celulares — que es justamente donde se usa.

La causa raíz no es un bug puntual sino la arquitectura:

- **Detección de bordes en vivo, en el hilo principal.** `lib/pdf/scanner.ts` son ~1050 líneas de visión por computadora escritas a mano (grayscale, Gaussian blur, Sobel, doble umbral, histéresis, transformada de Hough, convex hull, homografía por eliminación gaussiana, Otsu, adaptive threshold) que se ejecutan sobre cada frame de `getUserMedia`. Un celular no da abasto: la UI se traba y la detección llega tarde o directamente no llega.
- **Calidad de entrada pobre.** Capturar un frame de `getUserMedia` devuelve píxeles crudos del sensor, sin el procesamiento de imagen del teléfono (enfoque, HDR, reducción de ruido, estabilización). La foto de partida ya es mala.
- **Parámetros fijos.** El `adaptiveThreshold` usa un tamaño de bloque constante, así que funciona a una distancia de la hoja y falla a otra.
- **Deuda acumulada.** Existen dos `scan-camera.tsx` distintos (`components/` y `components/editor/scanner/`), un "safe mode" que degrada la detección, y logs de debug en producción. El historial de commits muestra cinco intentos consecutivos de parchar el mismo problema.
- **Dependencia frágil de build.** `scripts/download-opencv.js` descarga `opencv.js` desde `docs.opencv.org` durante el `prebuild`, sin versión fijada ni verificación de integridad. Si ese sitio cambia o se cae, el proyecto no compila.

Se reescribe en lugar de parchar porque cada uno de estos puntos exige un cambio estructural.

---

## 2. Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Captura | Cámara nativa del celular vía `<input capture>` | Foto a resolución completa ya procesada por el ISP del teléfono. ~15 líneas en vez de ~1000. |
| Procesamiento | 100% cliente, en Web Worker | Subir una foto de 4MB por datos móviles tarda más que procesarla local. Además preserva la promesa de privacidad del proyecto. |
| Backend | Ninguno | Coherente con el resto del editor (pdf-lib, pdfjs, tesseract ya corren en el navegador). Sin infra ni costos. |
| App nativa | No | El scanner es un botón dentro de un editor con doce funciones. No justifica un segundo producto (cuenta Apple, builds, releases, instalación). Capacitor queda como salida futura si el scanner llega a ser el producto. |
| Librería de CV | OpenCV compilado a WASM, cargado lazy | Battle-tested. No escribimos transformadas de Hough a mano. |
| Detección en vivo | No | Se pierde el recuadro que sigue al documento y el autocapture. Es la parte cosmética, y es exactamente lo que hoy no anda. |
| Galería de fotos | Fuera de alcance | Solo captura en el momento. |
| OCR | Fuera de alcance | Sigue como está en el editor, sin integración con el scanner. |

---

## 3. Flujo

```
[Escanear]
   │
   ▼
1. CAPTURA — <input type="file" accept="image/*" capture="environment">
   Se abre la cámara del teléfono. Devuelve un JPEG a resolución completa.
   │
   ▼
2. DETECCIÓN (worker) — createImageBitmap → transferir al worker
   Reducir a ~1000px lado largo → grayscale → blur → Canny →
   findContours → approxPolyDP → mayor cuadrilátero por área
   → escalar las 4 esquinas a resolución original
   │
   ▼
3. CONFIRMACIÓN (UI) — foto con 4 esquinas arrastrables + lupa
   El usuario ajusta si hace falta. Elige modo (default: Documento).
   │
   ▼
4. ENDEREZADO + MEJORA (worker) — warpPerspective a resolución completa
   → normalización de iluminación → modo elegido
   │
   ▼
5. ACUMULACIÓN — la página cae en la tira de miniaturas
   [+ otra página] vuelve al paso 1  │  [Crear PDF] cierra
   │
   ▼
6. SALIDA — combineImagesToSinglePdf() → addSources() al editor
```

El paso 3 es el que define la calidad percibida. Es también la red de seguridad: si la detección falla, las esquinas arrancan en los bordes de la foto y el usuario las mueve a mano. Nunca hay callejón sin salida.

---

## 4. Arquitectura

### Módulos y responsabilidades

**`lib/scanner/worker.ts`** — Web Worker. Único lugar donde vive OpenCV.
Expone tres operaciones por mensaje:
- `detect(bitmap)` → `Corners | null`
- `warp(bitmap, corners, mode)` → `ImageBitmap` — endereza y aplica el modo. Guarda el resultado del enderezado en un cache interno con un id.
- `restyle(id, mode)` → `ImageBitmap` — re-aplica un modo distinto sobre un warp ya cacheado, sin volver a enderezar.

El cache guarda un solo warp a la vez (el de la página en confirmación) y se libera al aceptar o descartar la página. No conoce React ni el DOM. Se puede probar en aislamiento pasándole un bitmap y comparando la salida.

**`lib/scanner/opencv-loader.ts`** — Carga perezosa de OpenCV dentro del worker.
Se instancia recién en la primera llamada a `detect`. Expone un estado (`idle | loading | ready | failed`) para que la UI pueda mostrar progreso o degradar.

**`lib/scanner/detect.ts`** — Detección de esquinas. Función pura sobre un `ImageBitmap`.
Devuelve cuatro puntos ordenados (arriba-izq, arriba-der, abajo-der, abajo-izq) en coordenadas de la imagen original, o `null` si no encuentra un cuadrilátero plausible.

**`lib/scanner/enhance.ts`** — Enderezado y mejora. Función pura.
`warpPerspective` + normalización de iluminación + el modo pedido.

**`lib/scanner/types.ts`** — `Point`, `Corners`, `ScanMode`, tipos de mensaje del worker.

**`components/editor/scanner/scan-modal.tsx`** — Máquina de estados de la UI y contenedor.
Estados: `idle → capturing → detecting → confirming → processing → idle` (con la tira de páginas acumulada en paralelo).

**`components/editor/scanner/corner-editor.tsx`** — Foto + cuatro handles arrastrables + lupa.
Recibe imagen y esquinas iniciales, emite esquinas confirmadas. Sin lógica de imagen.

**`components/editor/scanner/mode-toggle.tsx`** — Selector de tres modos.

**`components/editor/scanner/page-strip.tsx`** — Tira de miniaturas con borrar. Se reusa el actual (`scan-page-strip.tsx`), que ya funciona.

### Por qué esta división

La lógica de imagen (worker + tres módulos puros) no sabe nada de React y se puede probar sin navegador simulado. La UI no sabe nada de OpenCV. El límite entre las dos es un contrato de mensajes de cuatro tipos.

Esto es lo contrario de lo que hay hoy, donde `scanner.ts` mezcla utilidades de canvas, algoritmos de CV, generación de PDF y captura de video en un solo archivo de 34KB.

---

## 5. Modos de mejora

Se pasa de cuatro modos (`document | color | bw | photo`) a tres. La distinción actual entre "documento" y "color" no es comprensible sin probar las dos.

**Documento** (por defecto)
Normalización de iluminación + estirado de contraste, conservando color. Los sellos, las firmas en birome azul y los logos sobreviven. Es el modo que hace que un scan parezca un scan.

**Blanco y negro**
`adaptiveThreshold` gaussiano, con **tamaño de bloque proporcional a la resolución de la imagen** — no fijo, que es el error del código actual. Archivo chico, contraste máximo, aspecto de fotocopia.

**Original**
Solo el enderezado. Para DNIs, fotos y gráficos, donde umbralizar destruye información en vez de limpiarla.

### Normalización de iluminación

Es el paso que más aporta a la calidad percibida. Se estima el fondo de la foto con un desenfoque fuerte (morfología de cierre o blur de kernel grande) y se divide la imagen original por ese fondo. Las sombras de la propia mano y la luz despareja desaparecen; el papel queda blanco parejo de punta a punta.

La función `shadowRemoval` actual intenta esto a mano sobre `ImageData`. Con OpenCV son pocas líneas y corre en milisegundos.

### Cambio de modo

El resultado del `warpPerspective` se cachea. Cambiar de modo re-aplica solo la mejora sobre el warp cacheado — es re-renderizar, no re-procesar. El usuario ve el cambio al instante.

El default es Documento y no requiere ninguna interacción. Los otros dos van detrás de un toggle discreto en la pantalla de confirmación.

---

## 6. Manejo de errores

Principio: **nunca dejar al usuario en un callejón sin salida.** Toda falla degrada a "las esquinas están en los bordes de la foto, arrastralas".

| Falla | Comportamiento |
|---|---|
| OpenCV no carga (red, WASM no soportado) | Se salta la detección. Se va directo a confirmación con esquinas por defecto (bordes de la foto). El enderezado también necesita OpenCV → si no cargó, se ofrece guardar la foto sin enderezar. Aviso claro, no error mudo. |
| Detección no encuentra cuadrilátero | Esquinas por defecto. Sin mensaje de error: es un caso esperado, no una falla. |
| Detección devuelve un cuadrilátero degenerado (área < 15% de la foto, o muy no convexo) | Se descarta y se usan las esquinas por defecto. |
| El usuario cancela la cámara nativa | Vuelve al estado anterior sin perder las páginas ya escaneadas. |
| Foto demasiado grande para la memoria del dispositivo | Se topea el lado largo (p. ej. 3000px) antes del warp. Se documenta el tope. |
| El worker muere | Se reinstancia una vez. Si vuelve a morir, se degrada a "guardar la foto sin procesar". |
| Formato inesperado del archivo (HEIC en iOS) | `createImageBitmap` falla → mensaje explícito. A verificar en pruebas reales: Safari suele convertir a JPEG al subir. |

Las páginas ya acumuladas en la tira **nunca se pierden** por un error de procesamiento de una página nueva.

---

## 7. Estrategia de pruebas

El proyecto hoy no tiene tests. No se monta una infraestructura de testing completa como parte de este trabajo, pero la división en funciones puras se elige justamente para que sea posible.

**Lo que sí se hace:**

- **Fixtures de imagen.** Un set de ~8 fotos reales de prueba en `lib/scanner/__fixtures__/`: hoja blanca sobre escritorio oscuro, hoja sobre fondo claro (bajo contraste), documento con sombra de mano, foto en ángulo pronunciado, documento con sellos de color, ticket angosto, documento arrugado, foto sin documento (caso negativo).
- **Test de detección.** Para cada fixture, esquinas esperadas anotadas a mano con una tolerancia (p. ej. dentro del 3% de la dimensión de la imagen). El caso negativo debe devolver `null`.
- **Verificación manual en dispositivo real.** Android e iOS, en el celular, no en el emulador del navegador. Es innegociable: el modo responsive de Chrome no reproduce el comportamiento de `capture`, ni la memoria, ni la cámara.

**Lo que se verifica a mano en cada dispositivo antes de dar por cerrado:**
captura, detección, ajuste de esquinas con lupa, los tres modos, multipágina (mínimo 5 páginas), y generación del PDF final.

---

## 8. Qué se elimina

| Archivo | Motivo |
|---|---|
| `lib/pdf/scanner.ts` (~1050 líneas) | Reemplazado por `lib/scanner/*`. Se rescatan solo `combineImagesToSinglePdf` y `canvasToBlob` — se mueven a donde correspondan. |
| `lib/pdf/opencv.ts` | Reemplazado por `lib/scanner/opencv-loader.ts`, que corre dentro del worker. |
| `scripts/download-opencv.js` + hooks `prebuild`/`predev` | Reemplazado por dependencia de npm versionada. |
| `public/opencv.js` | Deja de ser un artefacto descargado. |
| `components/scan-camera.tsx` | Duplicado muerto. |
| `components/editor/scanner/scan-camera.tsx` | Ya no hay captura por `getUserMedia`. |
| `components/editor/scanner/scan-corners.tsx` | Reemplazado por `corner-editor.tsx`. |

**Se conserva:** `scan-page-strip.tsx` (funciona), la salida a PDF, y la integración con `useEditorStore.addSources`.

---

## 9. Dependencia de OpenCV

Candidato: `@techstark/opencv-js` (v5.0.0-release.1 al momento de escribir esto). El paquete pesa ~14.7MB descomprimido, pero incluye varias variantes de build y los tipos; el payload real que llega al navegador hay que **medirlo durante la implementación**.

Como se carga lazy — recién cuando el usuario toca "Escanear" — el costo no afecta la carga inicial de ControlPDF. Aun así, si el bundle del navegador supera los ~10MB conviene evaluar un build custom con solo el módulo `imgproc`, que es lo único que usamos.

Esta medición es una tarea explícita del plan de implementación, no una suposición del diseño.

---

## 10. Fuera de alcance

Registrado acá para que quede claro que fue una decisión y no un olvido:

- Detección de bordes en vivo con recuadro y autocapture.
- Selección de fotos desde la galería.
- Integración de OCR con el scanner (el OCR del editor sigue funcionando igual).
- App nativa o wrapper con Capacitor.
- Detección automática de múltiples documentos en una sola foto.
- Recorte de bordes por lote sobre páginas ya escaneadas.

---

## 11. Criterio de éxito

El trabajo está terminado cuando, en un celular Android y en un iPhone reales:

1. Escanear cinco páginas seguidas y generar el PDF no traba la interfaz en ningún momento.
2. Sobre las ocho fotos de fixture, la detección acierta el cuadrilátero en al menos seis sin intervención manual.
3. El modo Documento produce un fondo visiblemente parejo en la foto con sombra de mano.
4. Cualquier falla de detección o de carga de OpenCV termina en una pantalla donde el usuario puede seguir a mano, no en un error.
