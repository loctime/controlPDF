import { PDFDocument } from "@cantoo/pdf-lib"

export interface SignaturePlacement {
  pageNumber: number
  xRatio: number
  yRatio: number
  widthRatio: number
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",")
  const base64 = dataUrl.slice(comma + 1)
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function applySignature(
  file: File,
  signatureDataUrl: string,
  placement: SignaturePlacement,
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer)
  const total = doc.getPageCount()
  if (placement.pageNumber < 1 || placement.pageNumber > total) {
    throw new Error("Página inválida")
  }
  const bytes = dataUrlToBytes(signatureDataUrl)
  const isPng = signatureDataUrl.startsWith("data:image/png")
  const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)

  const page = doc.getPage(placement.pageNumber - 1)
  const { width: pageWidth, height: pageHeight } = page.getSize()
  const targetWidth = pageWidth * placement.widthRatio
  const aspect = image.height / image.width
  const targetHeight = targetWidth * aspect
  const x = pageWidth * placement.xRatio
  const yFromTop = pageHeight * placement.yRatio
  const y = pageHeight - yFromTop - targetHeight

  page.drawImage(image, { x, y, width: targetWidth, height: targetHeight })
  return doc.save()
}

export function renderTextSignatureToDataUrl(
  text: string,
  options: {
    fontFamily?: string
    color?: string
    width?: number
    height?: number
  } = {},
): string {
  const width = options.width ?? 600
  const height = options.height ?? 200
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = options.color ?? "#1f2937"
  ctx.font = `bold 96px ${options.fontFamily ?? "'Brush Script MT', 'Lucida Handwriting', cursive"}`
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"
  ctx.fillText(text, width / 2, height / 2)
  return canvas.toDataURL("image/png")
}
