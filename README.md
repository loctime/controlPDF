# ControlPDF

Suite de herramientas PDF que corren **100% en el navegador**. Sin login, sin subir archivos a ningún servidor.

## Funcionalidades

### Organizar
- 🔗 **Unir PDF** — combiná varios PDFs en uno (orden por drag & drop, eliminá páginas individuales antes de unir).
- ✂️ **Dividir PDF** — extraé por rangos, cada N páginas o por selección visual.
- 🔃 **Rotar PDF** — todo el documento o página por página.

### Convertir y comprimir
- 🖼️ **PDF a imagen** — exportá cada página como JPG o PNG (descarga directa o ZIP).
- 📦 **Comprimir** — re-encodá las páginas a JPG; muestra reducción real en %.

### Editar
- 🔢 **Numerar** — números de página con formato y posición a elección, soporta saltear primera página.
- 💧 **Marca de agua** — texto, color, opacidad y rotación configurables.
- ℹ️ **Metadatos** — editá título, autor, asunto y palabras clave.

### Seguridad y firma
- 🔒 **Proteger / Desbloquear** — encriptación con contraseña y permisos granulares (imprimir, copiar, modificar, anotar).
- ✍️ **Firmar** — dibujá, subí una imagen o tipeá una firma; arrastrala sobre la página.
- 📝 **OCR** — reconocimiento de texto en PDFs escaneados con tesseract.js, generando un PDF con capa de texto buscable. Soporta español, inglés, portugués, francés, alemán e italiano.

## Stack

- **Next.js 16** + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **Radix UI** + **Sonner** + **next-themes**
- **@cantoo/pdf-lib** (manipulación de PDF + encriptación)
- **pdfjs-dist** (render de páginas, lazy)
- **tesseract.js** (OCR, lazy)
- **jszip** (zips multi-archivo, lazy)

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

## Atajos

- `Cmd/Ctrl + Enter` — ejecutar la herramienta activa.

## Privacidad

Toda la lógica de procesamiento corre del lado del cliente: pdf-lib, pdfjs y tesseract.js trabajan en el navegador. No hay backend; los archivos no salen de tu computadora.
