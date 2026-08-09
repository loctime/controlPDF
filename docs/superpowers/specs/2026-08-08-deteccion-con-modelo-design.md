# Detección de documentos con modelo neuronal

**Fecha:** 08/08/2026
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Reemplaza la detección de esquinas. No toca el enderezado, los modos de mejora, la UI ni la salida a PDF.

---

## 1. Problema

La detección actual separa el papel del fondo por brillo (Otsu) y toma la mancha más grande. Funciona bien cuando el papel es más claro que el fondo, y se rompe cuando esa premisa no se cumple.

Medido sobre diez escenarios adversarios y las cuatro fotos reales del repositorio:

| Escenario | Acierto (IoU) |
|---|---|
| Papel claro sobre mesa oscura | 97% |
| Fondo con textura | 97% |
| Punta doblada | 89% |
| Pila de hojas atrás | 86% |
| Reflejo fuerte al lado | 65% |
| Sombra dura cruzando el papel | 48% |
| Fondo blanco | 44% |
| Papel oscuro sobre mesa clara | 44% |
| Documento rotado más de 35° | falla |
| Sin documento | detecta de más |

El problema de fondo no es el umbral: es que hay **una sola hipótesis**. Cada caso nuevo que falla empuja a sumar otra heurística con otro número ajustado a mano, que es exactamente cómo el scanner anterior llegó a mil líneas.

---

## 2. Decisión

Reemplazar la detección por el detector neuronal de [scanic](https://github.com/marquaye/scanic) (MIT), que usa el modelo [DocCornerNet](https://github.com/mapo80/DocCornerNet-CoordClass) (MIT, arquitectura SimCC, ECCV 2022).

Medido en las mismas condiciones, con el mismo banco de casos:

| Escenario | Hoy | Con el modelo |
|---|---|---|
| Papel claro sobre mesa oscura | 97% | 98% |
| Fondo con textura | 97% | 98% |
| Punta doblada | 89% | 92% |
| Pila de hojas atrás | 86% | 88% |
| **Reflejo fuerte** | 65% | **98%** |
| **Sombra dura** | 48% | **97%** |
| **Fondo blanco** | 44% | **94%** |
| **Papel oscuro sobre mesa clara** | 44% | **98%** |
| **Rotado más de 35°** | falla | **45%** |
| **Sin documento** | detecta de más | **no detecta, score 0.00** |
| Las 4 fotos reales del repo | referencia | 77% a 99% |

**Rendimiento medido:** 14 a 26 ms por foto después de la primera. La primera tarda unos segundos porque inicializa el modelo.

**Verificado que corre dentro de un Web Worker**, que es requisito de la arquitectura: la detección no puede bloquear el hilo de la interfaz. Se probó llamando al detector desde un worker real y devolvió `success: true`, `score: 1` y las cuatro esquinas.

### Por qué esta librería y no otra

- **Licencias permisivas y verificadas**: `scanic` MIT, `scanic-ml` MIT, DocCornerNet MIT. Ninguna es "solo investigación".
- **No es un servicio**: no hay API, ni clave, ni cuota, ni nadie que pueda cortar el servicio o cobrar por escaneo. El modelo corre en el dispositivo del usuario.
- **Devuelve las esquinas ya etiquetadas** (`topLeft`, `topRight`, `bottomRight`, `bottomLeft`), lo que elimina de raíz el bug de ordenamiento.
- **Devuelve una probabilidad** de que haya documento, que reemplaza heurísticas de área inventadas a mano.

### Riesgos aceptados

- **Librería joven**: versión 1.5.1, un año de vida, un solo mantenedor. Mitigación: es MIT y son 277 KB, así que en el peor caso se puede forkear. Además queda la detección actual como respaldo.
- **El caso muy rotado sigue flojo** (45%). Mejor que hoy, lejos de bueno. La corrección manual de esquinas sigue siendo la red.

---

## 3. Arquitectura

Cambia un solo módulo. Todo lo que está aguas abajo queda igual: `warp.ts`, `stylize.ts`, el worker, `ScannerClient`, el editor de esquinas, la tira de páginas y la salida a PDF.

```
handleFile (scan-modal.tsx)          sin cambios
   ↓
ScannerClient.detect()               sin cambios
   ↓
worker.ts                            sin cambios
   ↓
detectCorners(img)   ← ACÁ ESTÁ TODO EL CAMBIO
   ├─ 1. modelo (scanic ML)          nuevo
   └─ 2. región + bordes (OpenCV)    lo actual, pasa a ser respaldo
   ↓
warpToRect → stylize                 sin cambios
```

### La cadena de respaldo

1. **Modelo.** Si devuelve `success` y `score` supera el umbral, se usan sus esquinas **con su propio etiquetado** (`topLeft`, `topRight`, `bottomRight`, `bottomLeft`), sin pasarlas por `orderCorners`. Reordenarlas sería reintroducir por la ventana el bug que el modelo evita.
2. **Detección actual con OpenCV.** Si el modelo no carga (sin conexión, archivo faltante, navegador sin WASM) o devuelve un score bajo, se cae a la detección por región y bordes que existe hoy, que da 97% en el caso típico.
3. **Esquinas por defecto.** Si ninguna encuentra nada, el usuario ajusta a mano, como hoy.

El usuario nunca queda sin scanner. Lo que ya construimos no se descarta: se convierte en la red.

### Auto-hospedaje del modelo

Por defecto scanic baja el modelo de un CDN de terceros en la primera detección. Se auto-hospeda en su lugar, con el mismo patrón que ya usamos para `opencv.js`: un script de `prebuild` copia los archivos desde `node_modules` a `public/`, y se configura scanic para leerlos de ahí.

Motivos: no depender de que un CDN ajeno siga vivo, no hacer peticiones a terceros desde una app que promete no tener backend, y que la versión del modelo quede fijada por `package.json` en vez de por lo que sirva un CDN.

### El umbral de score

`score` es la probabilidad de que haya un documento. En las pruebas dio 1.00 con documento y 0.00 sin documento — bien separado. El umbral inicial se fija en **0.5** y se documenta como el único número ajustable de la detección.

---

## 4. Corrección aparte: ordenamiento de esquinas

`orderCorners` ordena por sumas y diferencias de coordenadas. Medido contra el mismo documento rotado:

```
  0° a 30°  → orden correcto, salida vertical
  40°       → orden roto, dos esquinas repetidas, salida degenerada
  45° a 60° → orden roto, salida apaisada
```

Con el modelo esto deja de importar en el camino principal, porque devuelve las esquinas ya etiquetadas. Pero sigue vivo en el camino de respaldo, así que se corrige igual: se pasa a ordenamiento angular alrededor del centroide, que es estable a cualquier rotación, eligiendo como primera esquina la más cercana al origen y siguiendo el sentido del reloj.

---

## 5. Costo

Hoy la primera detección descarga 13 MB de OpenCV. Con el cambio descarga **15 MB**: los mismos 13 más 2 del modelo. OpenCV sigue haciendo falta para el enderezado y los tres modos de mejora.

Ambas cargas son perezosas — solo ocurren cuando el usuario toca "Escanear" — y quedan cacheadas.

Sacar OpenCV por completo exigiría reimplementar la normalización de iluminación y el contraste a mano, que es justo la clase de reescritura que causó los problemas del scanner anterior. Queda explícitamente fuera de alcance.

---

## 6. Pruebas

El banco existente (`lib/scanner/__tests__/`) ya tiene las cuatro fotos reales con esquinas anotadas. Se suma:

- **Los diez casos adversarios como fixtures permanentes**, generados de forma determinista por código, con sus esquinas conocidas: fondo blanco, fondo con textura, pila de hojas, punta doblada, rotación fuerte, reflejo, sombra dura, papel oscuro sobre fondo claro, y el caso negativo sin documento.
- **Métrica IoU** (área de intersección sobre área de unión entre el cuadrilátero detectado y el real), que mide qué tan bien se solapan. Es más informativa que la tolerancia por esquina que usamos hoy, porque un error de 50px importa distinto en una foto de 800px que en una de 4000px.

**Criterio de aceptación, explícito:**

1. Ningún caso puede quedar por debajo del valor que tiene hoy.
2. Los cuatro casos que hoy están entre 44% y 65% tienen que superar el 90%.
3. El caso sin documento tiene que devolver `null`.
4. La detección tiene que seguir corriendo dentro del worker, sin bloquear la interfaz.
5. Con el modelo deshabilitado a la fuerza, la cadena de respaldo tiene que dar los mismos números que hoy.

El punto 5 importa: es lo que prueba que la red de seguridad existe de verdad y no solo en el diseño.

---

## 7. Fuera de alcance

Registrado para que quede claro que fue decisión y no olvido:

- **Reentrenar el modelo** con fotos propias. Es posible — el código de entrenamiento y el dataset son públicos y MIT — pero primero hay que ver si el modelo tal cual alcanza.
- **La página de calibración** para juntar fotos de usuarios. Depende de lo anterior y tiene implicancias de privacidad que merecen su propia discusión.
- **Sacar OpenCV** del proyecto.
- Detección en vivo, galería, OCR: siguen fuera, como en los specs anteriores.

---

## 8. Criterio de éxito

Las mismas fotos que hoy fallan —fondo blanco, papel oscuro sobre mesa clara, sombra cruzando la hoja— se detectan bien sin tocar las esquinas a mano. Y en un celular real, el tiempo entre sacar la foto y ver el resultado no empeora respecto de hoy salvo la primera vez, que suma la carga del modelo.
