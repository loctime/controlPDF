import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib"

export type TextPosition =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight"
  | "center"

export type PageNumberFormat = "n" | "n-of-total" | "page-n" | "page-n-of-total"

export interface PageNumberOptions {
  position: Exclude<TextPosition, "center">
  format: PageNumberFormat
  fontSize: number
  margin: number
  startAtPage?: number
  skipFirstPage?: boolean
}

function formatPageLabel(
  format: PageNumberFormat,
  current: number,
  total: number,
): string {
  switch (format) {
    case "n":
      return String(current)
    case "n-of-total":
      return `${current} / ${total}`
    case "page-n":
      return `Página ${current}`
    case "page-n-of-total":
      return `Página ${current} de ${total}`
  }
}

function computeAnchor(
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  textHeight: number,
  position: TextPosition,
  margin: number,
): { x: number; y: number } {
  const left = margin
  const right = pageWidth - textWidth - margin
  const centerX = (pageWidth - textWidth) / 2
  const top = pageHeight - textHeight - margin
  const bottom = margin
  const centerY = (pageHeight - textHeight) / 2
  switch (position) {
    case "topLeft":
      return { x: left, y: top }
    case "topCenter":
      return { x: centerX, y: top }
    case "topRight":
      return { x: right, y: top }
    case "bottomLeft":
      return { x: left, y: bottom }
    case "bottomCenter":
      return { x: centerX, y: bottom }
    case "bottomRight":
      return { x: right, y: bottom }
    case "center":
      return { x: centerX, y: centerY }
  }
}

export async function addPageNumbers(
  file: File,
  options: PageNumberOptions,
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const total = doc.getPageCount()
  const startPage = options.skipFirstPage ? 1 : 0
  const startAt = options.startAtPage ?? 1
  const totalLabel = options.skipFirstPage ? total - 1 : total

  for (let i = startPage; i < total; i++) {
    const page = doc.getPage(i)
    const { width, height } = page.getSize()
    const current = i - startPage + startAt
    const label = formatPageLabel(options.format, current, totalLabel)
    const textWidth = font.widthOfTextAtSize(label, options.fontSize)
    const textHeight = options.fontSize
    const { x, y } = computeAnchor(
      width,
      height,
      textWidth,
      textHeight,
      options.position,
      options.margin,
    )
    page.drawText(label, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }
  return doc.save()
}

export interface WatermarkOptions {
  text: string
  fontSize: number
  opacity: number
  rotation: number
  position: TextPosition
  color?: { r: number; g: number; b: number }
}

export async function addTextWatermark(
  file: File,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const color = options.color ?? { r: 0.6, g: 0.6, b: 0.6 }

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize)
    const textHeight = options.fontSize
    const { x, y } = computeAnchor(
      width,
      height,
      textWidth,
      textHeight,
      options.position,
      24,
    )
    page.drawText(options.text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity: Math.max(0.05, Math.min(1, options.opacity)),
      rotate: degrees(options.rotation),
    })
  }
  return doc.save()
}

export interface MetadataOptions {
  title?: string
  author?: string
  subject?: string
  keywords?: string[]
  creator?: string
  producer?: string
}

export async function setMetadata(
  file: File,
  options: MetadataOptions,
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer)
  if (options.title !== undefined) doc.setTitle(options.title)
  if (options.author !== undefined) doc.setAuthor(options.author)
  if (options.subject !== undefined) doc.setSubject(options.subject)
  if (options.keywords !== undefined) doc.setKeywords(options.keywords)
  if (options.creator !== undefined) doc.setCreator(options.creator)
  if (options.producer !== undefined) doc.setProducer(options.producer)
  doc.setModificationDate(new Date())
  return doc.save()
}

export async function readMetadata(file: File): Promise<MetadataOptions> {
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer, { updateMetadata: false })
  return {
    title: doc.getTitle() ?? "",
    author: doc.getAuthor() ?? "",
    subject: doc.getSubject() ?? "",
    keywords: doc.getKeywords()?.split(/[,;]\s*/).filter(Boolean) ?? [],
    creator: doc.getCreator() ?? "",
    producer: doc.getProducer() ?? "",
  }
}
