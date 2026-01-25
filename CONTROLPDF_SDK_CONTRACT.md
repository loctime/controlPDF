📦 ControlPDF SDK — Public Contract (v1)

Estado: Draft estable
Propósito: Definir el contrato público del SDK de ControlPDF para procesamiento de PDFs reutilizable por todas las apps de la plataforma ControlFile (ControlAudit, ControlDoc, etc.).

1. Principios del SDK

El SDK de ControlPDF NO procesa PDFs directamente

El SDK NO guarda archivos

El SDK NO conoce Firestore, Backblaze ni el storage

El SDK define QUÉ se puede hacer, no CÓMO

El SDK es agnóstico de la app cliente

👉 Es un contrato de capacidades, no una implementación.

2. Tipos base
2.1 Contexto de ejecución (obligatorio)
ControlPDFContext {
  app: string                // controlpdf | controlaudit | controldoc | etc.
  userId: string
  ownerId: string
  source?: "ui" | "automation" | "api"
  correlationId?: string
}


Este contexto se usa para:

auditoría

ownership

trazabilidad

versionado

métricas

2.2 Entrada de archivo
PDFInput {
  fileId?: string            // Archivo existente en ControlFile
  file?: File | Blob         // Archivo nuevo (upload)
  name?: string
}


Regla:
Debe existir fileId o file, nunca ambos.

2.3 Resultado estándar

Todas las operaciones devuelven este tipo (o un array del mismo).

PDFResult {
  jobId: string
  status: "queued" | "processing" | "completed" | "failed"
  resultFileId?: string
  resultFileName?: string
  pages?: number
  size?: number
  warnings?: string[]
}

3. Operaciones públicas
3.1 Unir PDFs
merge(
  inputs: PDFInput[],
  options?: {
    keepBookmarks?: boolean
  },
  context: ControlPDFContext
): Promise<PDFResult>


Requiere mínimo 2 PDFs

Respeta el orden de inputs

3.2 Dividir PDF
split(
  input: PDFInput,
  options: {
    mode: "pages" | "range" | "size"
    pages?: number[]
    ranges?: { from: number; to: number }[]
    maxSizeMB?: number
  },
  context: ControlPDFContext
): Promise<PDFResult[]>


Devuelve múltiples archivos.

3.3 Comprimir PDF
compress(
  input: PDFInput,
  options: {
    level: "low" | "medium" | "high"
  },
  context: ControlPDFContext
): Promise<PDFResult>

3.4 Convertir PDF
convert(
  input: PDFInput,
  options: {
    target: "pdf" | "jpg" | "png" | "docx" | "xlsx" | "pptx"
  },
  context: ControlPDFContext
): Promise<PDFResult>

3.5 Rotar páginas
rotate(
  input: PDFInput,
  options: {
    angle: 90 | 180 | 270
    pages?: number[]
  },
  context: ControlPDFContext
): Promise<PDFResult>


Si no se especifican páginas, rota todas.

3.6 Proteger PDF (contraseña)
protect(
  input: PDFInput,
  options: {
    password: string
    allowPrint?: boolean
    allowCopy?: boolean
  },
  context: ControlPDFContext
): Promise<PDFResult>

3.7 Quitar protección
unlock(
  input: PDFInput,
  options: {
    password: string
  },
  context: ControlPDFContext
): Promise<PDFResult>

3.8 Firmar PDF
sign(
  input: PDFInput,
  options: {
    type: "draw" | "image" | "text"
    value: string | Blob
    page?: number
    x?: number
    y?: number
  },
  context: ControlPDFContext
): Promise<PDFResult>

3.9 OCR (reconocimiento de texto)
ocr(
  input: PDFInput,
  options: {
    language: "es" | "en" | "fr" | "de"
    searchable?: boolean
  },
  context: ControlPDFContext
): Promise<PDFResult>

4. Gestión de trabajos (Jobs)
4.1 Consultar estado
getJobStatus(jobId: string): Promise<PDFResult>

4.2 Cancelar trabajo
cancelJob(jobId: string): Promise<void>

5. Errores estándar
ControlPDFError {
  code:
    | "INVALID_INPUT"
    | "UNSUPPORTED_FORMAT"
    | "PROCESSING_FAILED"
    | "UNAUTHORIZED"
    | "TIMEOUT"
  message: string
}

6. Exclusiones explícitas del SDK

El SDK de ControlPDF NO define:

Dónde se almacenan los archivos

Cómo se versionan

Qué backend los procesa

Qué librerías PDF se utilizan

Reglas de permisos o billing

Todo eso pertenece a:

ControlPDF Backend

ControlFile Core

7. Relación con la UI

Mapeo directo con la UI actual:

selectedTool → método del SDK

files[] → PDFInput[]

OptionsPanel → options

Botón Procesar PDF → llamada al SDK

Botón Guardar en ControlFile → flujo posterior (no SDK)

8. Estado del contrato

✔ Estable

✔ Reutilizable

✔ Agnóstico de backend

✔ Compatible con ControlFile

✔ Apto para validación con Codex

9. Versionado

Versión inicial: v1

Cambios futuros deben ser retrocompatibles

Nuevas operaciones se agregan sin romper firmas existentes