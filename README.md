# ControlPDF

Herramientas PDF que corren 100% en el navegador. Sin login, sin subir archivos a ningún servidor.

## Funcionalidades

- 🔗 **Unir PDF** — combiná varios PDFs en uno (orden por drag & drop)
- ✂️ **Dividir PDF** — extraé páginas o rangos como archivos separados
- 🔃 **Rotar PDF** — girá el documento 90°, 180° o 270°

Próximamente: comprimir, convertir, proteger, firmar, OCR.

## Stack

- **Next.js 16** + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **Radix UI** + **Sonner**
- **pdf-lib** para procesamiento client-side

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
