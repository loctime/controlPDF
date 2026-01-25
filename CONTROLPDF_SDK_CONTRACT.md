📦 ControlPDF SDK — Public Contract v1 (Merge-Only)

Status: Production Ready
Purpose: Define the public contract of ControlPDF SDK v1 for PDF processing, reusable by all ControlFile platform apps (ControlAudit, ControlDoc, etc.).

## Contract Scope

**ControlPDF SDK v1 is MERGE-ONLY**

- ✅ **Available in v1**: `merge()` operation
- 🔄 **Planned / v2+**: split, compress, convert, rotate, protect, unlock, sign, ocr
- 🔄 **Planned / v2+**: Asynchronous job processing with status tracking

---

1. SDK Principles

The ControlPDF SDK does NOT process PDFs directly

The SDK does NOT store files

The SDK does NOT know about Firestore, Backblaze, or storage

The SDK defines WHAT can be done, not HOW

The SDK is client-app agnostic

👉 It's a capabilities contract, not an implementation.

2. Base Types
2.1 Execution Context (Required)
ControlPDFContext {
  app: string                // controlpdf | controlaudit | controldoc | etc.
  userId: string
  ownerId: string
  source?: "ui" | "automation" | "api"
  correlationId?: string
}

This context is used for:

auditing

ownership

traceability

versioning

metrics

2.2 File Input
PDFInput {
  fileId?: string            // Existing file in ControlFile
  file?: File | Blob         // New file (upload) - NOT SUPPORTED in v1
  name?: string
}

**v1 Input Constraints:**
- ✅ Supported: `fileId` for existing ControlFile files
- ❌ NOT Supported: `file` / Blob uploads (planned for v2+)

Rule:
Must have either fileId or file, never both.

2.3 Standard Result

All operations return this type (or array of it).

PDFResult {
  jobId: string
  status: "completed" | "failed"    // v1 is synchronous only
  resultFileId?: string
  resultFileName?: string
  pages?: number
  size?: number
  warnings?: string[]
}

**v1 Job Handling:**
- ✅ Synchronous processing: status is always "completed" or "failed"
- 🔄 `getJobStatus()` and `cancelJob()` planned for v2+ async processing

3. Available Operations (v1)
3.1 Merge PDFs
merge(
  inputs: PDFInput[],
  options?: {
    keepBookmarks?: boolean
  },
  context: ControlPDFContext
): Promise<PDFResult>

Requires minimum 2 PDFs

Respects input order

**v1 Input Support:**
- ✅ PDFInput with `fileId` only
- ❌ PDFInput with `file`/Blob not supported

4. Planned Operations (v2+)

The following operations are planned for future versions and are NOT available in v1:

4.1 Split PDF
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

Returns multiple files.

4.2 Compress PDF
compress(
  input: PDFInput,
  options: {
    level: "low" | "medium" | "high"
  },
  context: ControlPDFContext
): Promise<PDFResult>

4.3 Convert PDF
convert(
  input: PDFInput,
  options: {
    target: "pdf" | "jpg" | "png" | "docx" | "xlsx" | "pptx"
  },
  context: ControlPDFContext
): Promise<PDFResult>

4.4 Rotate Pages
rotate(
  input: PDFInput,
  options: {
    angle: 90 | 180 | 270
    pages?: number[]
  },
  context: ControlPDFContext
): Promise<PDFResult>

If no pages specified, rotates all.

4.5 Protect PDF (Password)
protect(
  input: PDFInput,
  options: {
    password: string
    allowPrint?: boolean
    allowCopy?: boolean
  },
  context: ControlPDFContext
): Promise<PDFResult>

4.6 Remove Protection
unlock(
  input: PDFInput,
  options: {
    password: string
  },
  context: ControlPDFContext
): Promise<PDFResult>

4.7 Sign PDF
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

4.8 OCR (Text Recognition)
ocr(
  input: PDFInput,
  options: {
    language: "es" | "en" | "fr" | "de"
    searchable?: boolean
  },
  context: ControlPDFContext
): Promise<PDFResult>

5. Job Management (Planned for v2+)
5.1 Check Status
getJobStatus(jobId: string): Promise<PDFResult>

5.2 Cancel Job
cancelJob(jobId: string): Promise<void>

6. Standard Errors
ControlPDFError {
  code:
    | "INVALID_INPUT"
    | "UNSUPPORTED_FORMAT"
    | "PROCESSING_FAILED"
    | "UNAUTHORIZED"
    | "TIMEOUT"
  message: string
}

7. Explicit SDK Exclusions

The ControlPDF SDK does NOT define:

Where files are stored

How they are versioned

Which backend processes them

Which PDF libraries are used

Permission or billing rules

All of that belongs to:

ControlPDF Backend

ControlFile Core

8. Relationship with UI

Direct mapping with current UI:

selectedTool → SDK method (merge only in v1)

files[] → PDFInput[]

OptionsPanel → options

Process PDF button → SDK call

Save to ControlFile button → Post-flow (not SDK)

9. Contract Status

✔ Production Ready (v1)

✔ Stable

✔ Reusable

✔ Backend Agnostic

✔ ControlFile Compatible

✔ Ready for Codex Validation

10. Version Roadmap

**v1 (Current) - Merge-Only**
- ✅ PDF merge operation with fileId input
- ✅ Synchronous processing
- ✅ Production-ready backend implementation

**v2 (Planned) - Full PDF Operations**
- 🔄 All planned operations (split, compress, convert, rotate, protect, unlock, sign, ocr)
- 🔄 File upload support (file/Blob inputs)
- 🔄 Asynchronous job processing with status tracking
- 🔄 Job management APIs (getJobStatus, cancelJob)

**Versioning Policy:**
- Current version: v1 (Merge-Only)
- Future changes must be backward compatible
- New operations will be added without breaking existing signatures