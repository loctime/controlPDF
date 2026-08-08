# ControlPDF

Editor de PDF visual que corre **100% en el navegador**. Sin login, sin subir archivos a ningún servidor.

## Funcionalidades

### Editor visual
- **Grilla de páginas** — vista en miniatura de todas las páginas con drag & drop para reordenar.
- **Grupos** — agrupá páginas seleccionadas en segmentos; cada grupo se exporta como PDF separado.
- **Selección múltiple** — Shift+click (rango), Ctrl/Cmd+click (individual), Ctrl+A (todo).
- **Vista previa** — abrí cualquier página ampliada con zoom (rueda), pan (arrastre) y botones +/−.
- **Agregar archivos** — botón "+", arrastrar sobre la pantalla, o Ctrl+O. Acepta PDF e imágenes.

### Menú contextual (click derecho)
- **Crear grupo** — agrupa las páginas seleccionadas (aparece cuando la página no está en ningún grupo).
- **Descargar grupo** — exporta todas las páginas del grupo como PDF (aparece cuando la página está en un grupo).
- **Ver página** — abre la vista previa ampliada.
- **Descargar seleccionadas** — descargá solo las páginas seleccionadas como PDF.
- **Descargar con OCR (Capa Oculta)** — extrae texto de la página vía OCR y lo embebe en el PDF.

### Operaciones globales
- 💧 **Marca de agua** — texto, posición, color, opacidad y rotación configurables, por rango de páginas.
- 🔢 **Numerar páginas** — formato, posición y margen configurables; opción de saltear la primera página.
- 📦 **Comprimir** — tres perfiles (Suave ~180 DPI / Medio ~144 DPI / Fuerte ~108 DPI).
- 🖼️ **Convertir a imagen** — exportá páginas como JPG (calidad configurable) o PNG, por rango.
- 📝 **OCR** — capa de texto con tesseract.js; modos superposición y reconstrucción. Idiomas: es, en, pt, fr, de, it.
- 🔒 **Proteger** — encriptación con contraseña y permisos granulares (imprimir, copiar, modificar, anotar).
- ℹ️ **Metadatos** — título, autor, asunto y palabras clave.

### Edición por página
- **Rotar** — 90° por clic desde la miniatura o la barra de selección.
- **Duplicar** — copia la página en el lugar.
- **Eliminar / restaurar** — las páginas eliminadas se muestran tachadas y se pueden restaurar.
- **Firmar** — dibujá, subí imagen o tipeá una firma; arrastrala sobre la página.

### Escanear
- Sacá una foto del documento con la cámara del celular y ControlPDF detecta los bordes, endereza la perspectiva y limpia la iluminación.
- Tres modos: **Documento** (papel blanco parejo conservando color), **Blanco y negro** (binarizado, archivo chico) y **Original** (solo endereza).
- Multipágina: sumá todas las páginas que quieras y salen como un solo PDF.
- El procesamiento corre en un Web Worker con OpenCV WASM, en tu dispositivo.

## Stack

- **Next.js** + **React** + **TypeScript**
- **Tailwind CSS v4** + **Radix UI** + **shadcn/ui** + **Sonner** + **next-themes**
- **@cantoo/pdf-lib** — manipulación de PDF y encriptación
- **pdfjs-dist** — render de páginas
- **tesseract.js** — OCR (lazy)
- **@techstark/opencv-js** — detección de bordes y enderezado del scanner (lazy)
- **@dnd-kit** — drag & drop de páginas
- **jszip** — exportación multi-archivo (lazy)

## Desarrollo

```bash
pnpm install
pnpm dev
```

La app queda en [http://localhost:3000](http://localhost:3000).

## Build

```bash
pnpm build
pnpm start
```

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl/Cmd + O` | Agregar archivos |
| `Ctrl/Cmd + A` | Seleccionar todo |
| `Shift + Click` | Selección por rango |
| `Ctrl/Cmd + Click` | Selección individual |
| `Escape` | Limpiar selección / cerrar editor |
| `?` | Ver todos los atajos |

## Privacidad

Todo el procesamiento corre en el navegador: pdf-lib, pdfjs y tesseract.js trabajan localmente. No hay backend; los archivos no salen de tu computadora.
