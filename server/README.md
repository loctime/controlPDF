# ControlPDF Backend

Backend service dedicado al procesamiento de PDFs. Se integra con ControlFile para autenticación y almacenamiento.

## Características

- ✅ Autenticación con Firebase ID Tokens
- ✅ Integración con ControlFile API (sin acceso directo a storage)
- ✅ Procesamiento de PDFs con streaming
- ✅ Endpoint de merge de PDFs

## Requisitos

- Node.js 18+
- pnpm o npm

## Instalación

```bash
cd server
pnpm install
```

## Configuración

1. Copia `.env.example` a `.env`
2. Configura las variables de entorno:
   - `FIREBASE_SERVICE_ACCOUNT_KEY`: JSON stringificado de las credenciales de Firebase Admin SDK
   - `CONTROLFILE_API_URL`: URL base de la API de ControlFile
   - `PORT`: Puerto del servidor (default: 3002)

## Desarrollo

```bash
pnpm dev
```

## Producción

```bash
pnpm build
pnpm start
```

## Endpoints

### POST /api/pdf/merge

Fusiona múltiples PDFs en uno solo.

**Headers:**
```
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "inputs": [
    { "fileId": "file-id-1" },
    { "fileId": "file-id-2" }
  ],
  "options": {
    "keepBookmarks": true
  },
  "context": {
    "app": "controlpdf",
    "userId": "user-id",
    "ownerId": "owner-id",
    "source": "ui",
    "correlationId": "correlation-id"
  }
}
```

**Response:**
```json
{
  "jobId": "uuid",
  "status": "completed",
  "resultFileId": "result-file-id",
  "resultFileName": "merged.pdf",
  "pages": 10,
  "size": 1024000
}
```

## Arquitectura

- `src/index.ts`: Punto de entrada del servidor
- `src/middleware/auth.ts`: Middleware de autenticación Firebase
- `src/services/controlfile.ts`: Cliente para ControlFile API
- `src/services/pdf.ts`: Lógica de procesamiento de PDFs
- `src/routes/pdf.ts`: Rutas de endpoints de PDF
- `src/types/index.ts`: Tipos TypeScript
- `src/utils/errors.ts`: Utilidades de manejo de errores
