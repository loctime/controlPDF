# Modos Simple y Múltiple en el scanner

**Fecha:** 16/08/2026
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Reestructura `components/editor/scanner/` en dos flujos con punto de entrada común. No toca `lib/scanner/` (detección, enderezado, orientación, estilizado) ni el worker — todo eso se reusa tal cual.

---

## 1. Problema

El scanner de hoy tiene un solo flujo, pensado para armar un PDF de varias páginas dentro del editor: sacás una foto, la revisás, "Guardar y tomar otra" hasta terminar, "Crear PDF" arma un documento y lo manda al editor principal de ControlPDF.

Eso no cubre dos casos de uso reales y distintos:

- **Escanear una sola cosa ya**, sin pasar por el editor: un recibo, una firma, un cartel. Hoy igual hay que pasar por la lógica de "página del documento", y el resultado siempre termina como fuente del PDF que se está armando — no como una imagen que guardás o mandás por WhatsApp en el momento.
- **Escanear varias hojas seguidas sin fricción**, revisando y decidiendo el formato de salida recién al final, no hoja por hoja. El "Guardar y tomar otra" de hoy ya ayuda, pero sigue mostrando una pantalla de confirmación por cada foto — interrumpe la ráfaga.

---

## 2. Decisión

Dos modos explícitos, elegidos al abrir el scanner:

| | **Simple** | **Múltiple** |
|---|---|---|
| Uso | Una sola captura | Varias hojas seguidas |
| Confirmación por foto | Sí, inmediata | No — se revisa todo al final |
| Salida | Imagen (por defecto) o PDF de una página | PDF único, ZIP de PDFs, o ZIP de imágenes |
| Destino | Se guarda/comparte desde el dispositivo | Idem — nunca al editor principal |

**El scanner deja de alimentar exclusivamente al editor de PDF.** Pasa a ser una herramienta que produce archivos por su cuenta (imagen o PDF), que el usuario guarda o comparte directamente desde el celular. Confirmado explícitamente: si en el futuro hace falta mandar lo escaneado al editor para combinarlo con otro documento, se agrega como una opción de exportación más — no es el camino por defecto.

**Sin backend, sin bucket.** Se evaluó y se descartó explícitamente sumar almacenamiento en la nube (tipo R2) para este cambio. Motivos: no resuelve ningún problema real de este diseño (la incertidumbre de reabrir la cámara es una regla del navegador, no de dónde se guarda el archivo después), contradice la decisión de arquitectura ya tomada para todo ControlPDF (sin backend, todo corre en el dispositivo), y estos documentos son a menudo sensibles — DNI, recibos de sueldo, contratos — así que sacarlos del celular es más superficie de filtración, no menos.

---

## 3. Arquitectura

```
ScanModal (nuevo, liviano)
  └─ pantalla de elección: "Escaneo simple" | "Escaneo múltiple"
       ├─ SimpleScan     (nuevo componente)
       └─ MultiScan      (nuevo componente)

Ambos reusan sin modificar:
  lib/scanner/*           (detect, warp, orientation, stylize — el pipeline entero)
  lib/scanner/client.ts   (ScannerClient)
  lib/scanner/worker.ts
  components/editor/scanner/corner-editor.tsx
  components/editor/scanner/mode-toggle.tsx
```

`scan-modal.tsx` de hoy se convierte en el selector de modo y deja de tener máquina de estados propia — cada modo la tiene por separado. Esto es más simple que una única máquina de estados con una rama para cada modo: los flujos divergen bastante (confirmación por foto vs. al final) y una sola función de transición para los dos sería más difícil de leer que dos componentes chicos.

`ScanPageStrip` se reusa en la revisión de Múltiple, pero necesita dos agregados: mostrar un estado "procesando" (spinner sobre la miniatura) y ser tocable para abrir la edición de esa página — hoy solo tiene el botón de borrar.

---

## 4. Modo Simple

Mismo camino que existe hoy hasta la vista previa: capturar → detectar → enderezar automático (con el mismo salto de confirmación si la detección acertó) → ajustar esquinas solo si hace falta → previsualizar con el selector Documento/Blanco y negro/Original y el botón de girar.

Ahí cambian las acciones:

- **Guardar** — descarga la imagen procesada al dispositivo (`<a download>`, sin selector de carpeta) y deja visible el botón Compartir si no lo estaba ya.
- **Compartir** — independiente de Guardar, disponible siempre. Usa `navigator.share` con el archivo adjunto. Si el navegador no soporta compartir archivos (se verifica con `navigator.canShare`), el botón no aparece — no hay error, no hay botón roto.
- **Descargar como PDF** — acción secundaria, arma un PDF de una página reusando `imagesToPdf` (ya existe) y lo descarga.
- **Escanear otra** — vuelve a abrir la cámara para una captura nueva, mismo modo.
- **Descartar** — como hoy.

Sin tira de páginas, sin "Crear PDF", sin "Guardar y tomar otra": el modo Simple es una foto de punta a punta.

### Formato de archivo

Todas las descargas/comparticiones de imagen van en JPEG, mismo formato y calidad que usa hoy el pipeline (`JPEG_QUALITY = 0.9`). No se introduce PNG ni otro formato.

---

## 5. Modo Múltiple

### 5.1 La ráfaga

Al entrar, se abre la cámara nativa de inmediato. Cada vez que vuelve con una foto:

1. La foto se agrega a una cola de procesamiento en memoria y arranca su pipeline (detectar → enderezar → orientar → estilizar en modo Documento por defecto) en segundo plano. Esto **es** el guardado de esa captura — no hay un paso de "confirmar esta foto" antes de seguir.
2. Se intenta reabrir la cámara en el mismo instante, sin esperar nada de por medio.
3. Si el navegador lo permite, se abre sola y la ráfaga se siente continua. Si lo bloquea, no pasa nada automático — pero la pantalla ya muestra el botón **"Sacar otra"**, así que seguir cuesta un toque, nunca un callejón sin salida.

La pantalla de captura muestra en todo momento: la tira de miniaturas de lo ya capturado (con spinner mientras se procesa), "Sacar otra", y una **"X"** para cerrar la ráfaga y pasar a revisión. Ningún botón espera a que termine de procesarse la foto anterior — se puede seguir capturando con fotos todavía en cola.

**Esto no se da por implementado hasta verificarlo en un navegador real** (mismo principio que en el spec de captura fluida): si el intento automático de reabrir la cámara falla silenciosamente de un modo distinto al esperado, hay que verlo en un dispositivo real, no asumirlo por el build en verde.

### 5.2 El procesamiento es serializado, no paralelo

El worker de hoy guarda el enderezado de la página actual en una sola variable (`cachedWarp`, en `worker.ts`) para poder recalcular el modo o rotar sin repetir la detección. Si dos capturas de la ráfaga se procesaran en paralelo, se pisarían esa variable entre sí.

Por eso la cola de Múltiple se procesa **una foto a la vez, de punta a punta**, aunque el usuario ya esté varias fotos adelante tocando "Sacar otra". Dado que cada foto tarda del orden de un segundo (medido en la sesión anterior), la cola no se nota — la tira de miniaturas se va completando sola mientras el usuario sigue sacando.

Esto no requiere tocar el worker: es una cola simple del lado de `MultiScan`, que espera a que una llamada a `ScannerClient` resuelva antes de lanzar la siguiente.

### 5.3 Revisión

Al cerrar la ráfaga con la X: grilla con todas las capturas ya procesadas (o con el spinner si alguna sigue en cola). Tocar una abre la edición de **esa página nada más**:

- El mismo editor de esquinas y selector de modo que ya existen, precargados con las esquinas detectadas para esa captura.
- **Volver a sacar** — dispara la cámara para reemplazar esa foto puntual, sin afectar al resto.
- **Eliminar** — la saca de la lista.
- Confirmar vuelve a la grilla con el resultado actualizado.

### 5.4 Exportar

Se pidieron cuatro combinaciones; quedan **tres reales**, porque el navegador no permite disparar varias descargas sueltas en un solo click (las bloquea o las tira todas juntas de forma errática) — "PDF individuales" sin empaquetar no es una acción posible del lado del navegador:

- **PDF único** — todas las páginas juntas, reusando `imagesToPdf`.
- **ZIP con un PDF por página** — cada página como su propio PDF de una hoja, empaquetados. Usa `jszip`, ya es dependencia del proyecto.
- **ZIP de imágenes** — cada página como su JPEG procesado, empaquetados. Misma dependencia.

Las tres opciones aparecen como acciones separadas en la pantalla de revisión (no hace falta un menú desplegable con una sola opción visible — son solo tres botones).

---

## 6. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Detección falla en una captura (Simple o Múltiple) | Igual que hoy: pantalla de ajuste manual con aviso. En Múltiple, esto pasa dentro de la edición de esa página puntual — no bloquea la ráfaga ni al resto de las capturas. |
| OpenCV no disponible | Igual que hoy: se marca `degraded`, aparece la opción de guardar sin enderezar. |
| El navegador bloquea el reintento automático de cámara en Múltiple | Cae al botón manual "Sacar otra". Ninguna foto se pierde. |
| `navigator.share` no soportado o falla | El botón Compartir no aparece (se verifica con `canShare` antes de mostrarlo), o si falla en el momento, un toast de error — Guardar sigue disponible igual. |
| Falla el armado del ZIP o del PDF final | Toast de error, la revisión con todas las capturas sigue intacta — se puede reintentar la exportación sin perder nada. |

---

## 7. Componentes afectados

**Nuevos:**
- `components/editor/scanner/simple-scan.tsx`
- `components/editor/scanner/multi-scan.tsx`
- `components/editor/scanner/multi-scan-review.tsx` (grilla + edición por página + exportar; separado de `multi-scan.tsx` porque son dos pantallas con responsabilidades distintas — captura vs. revisión)
- `lib/scanner/export.ts` — las tres funciones de empaquetado (PDF único ya existe como `imagesToPdf`; se suman ZIP de PDFs y ZIP de imágenes)

**Modificados:**
- `components/editor/scanner/scan-modal.tsx` — pasa a ser el selector de modo, pierde su máquina de estados actual
- `components/editor/scanner/scan-page-strip.tsx` — estado "procesando" y miniaturas tocables

**Sin tocar:** todo `lib/scanner/` salvo la nueva `export.ts`, `corner-editor.tsx`, `mode-toggle.tsx`, el worker, el cliente.

---

## 8. Pruebas

Las 51 pruebas existentes del pipeline de imagen no deberían cambiar — si alguna lo hace, algo se tocó fuera de alcance.

Suma de pruebas nuevas, para las funciones puras de `lib/scanner/export.ts` (armado de ZIP y PDF a partir de blobs en memoria, sin depender del navegador — testeable igual que `imagesToPdf` hoy).

La verificación de flujo es en navegador real, sobre build de producción:

1. Modo Simple: Guardar dispara una descarga real; Compartir aparece y funciona cuando `canShare` lo permite; Descargar como PDF genera un PDF de una página válido.
2. Modo Múltiple: capturar 3 fotos seguidas — confirmar que la reapertura automática de cámara funciona o cae al botón manual sin trabarse; la tira de miniaturas se completa sola mientras se sigue capturando.
3. Desde la revisión: editar una página cambia solo esa página; "Volver a sacar" la reemplaza sin tocar las demás; eliminar la saca de la lista y de cualquier exportación posterior.
4. Las tres exportaciones (PDF único, ZIP de PDFs, ZIP de imágenes) producen archivos válidos y abribles con el número correcto de páginas/archivos.

El punto 2 es el que decide si el intento de reapertura automática se puede confiar en la mayoría de los celulares o si conviene, directamente, no intentarlo y arrancar siempre por el botón manual — se resuelve con la observación en dispositivo real, no de antemano.

---

## 9. Fuera de alcance

- Reordenar páginas en la revisión de Múltiple (se agregan en el orden en que se capturaron).
- Cámara propia embebida en la página (se evaluó y se descartó: degrada la calidad de la foto respecto a la app de Cámara nativa).
- Selector de carpeta personalizada para el guardado (se evaluó y se descartó: sin soporte parejo entre Android e iPhone, no aporta valor real frente a la descarga común).
- Bucket de almacenamiento en la nube (se evaluó y se descartó: no resuelve nada de este diseño y contradice la arquitectura sin backend del proyecto).
- Enviar lo escaneado al editor principal de PDF (queda anotado como posible opción de exportación futura, no en este alcance).
- Cualquier cambio a la detección, el enderezado, la orientación o el estilizado.

---

## 10. Criterio de éxito

Simple: sacar una foto, tocar Guardar, tener la imagen en el dispositivo y el panel de compartir a mano — sin pasar por ninguna pantalla de "página del documento".

Múltiple: sacar cinco hojas seguidas tocando como mucho "Sacar otra" entre cada una (nunca una pantalla de confirmación que interrumpa), cerrar con la X, corregir una que salió torcida sin afectar a las demás, y descargar las cinco como un solo PDF o como ZIP — a elección, desde la misma pantalla de revisión.
