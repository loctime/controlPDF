import { PDFDocument } from "@cantoo/pdf-lib"

export async function convertImageToPdf(file: File): Promise<File> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  
  const doc = await PDFDocument.create()
  
  let image
  if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) {
    image = await doc.embedPng(bytes)
  } else if (
    file.type === "image/jpeg" ||
    file.name.toLowerCase().endsWith(".jpg") ||
    file.name.toLowerCase().endsWith(".jpeg")
  ) {
    image = await doc.embedJpg(bytes)
  } else {
    // Fallback to png if unknown, though it might fail if it's actually something else
    try {
      image = await doc.embedJpg(bytes)
    } catch {
      image = await doc.embedPng(bytes)
    }
  }

  const { width, height } = image.scale(1)
  const page = doc.addPage([width, height])
  
  page.drawImage(image, {
    x: 0,
    y: 0,
    width,
    height,
  })

  const pdfBytes = await doc.save()
  
  // Replace the original extension with .pdf
  const nameParts = file.name.split(".")
  if (nameParts.length > 1) {
    nameParts.pop()
  }
  const newName = `${nameParts.join(".")}.pdf`

  return new File([pdfBytes], newName, { type: "application/pdf" })
}
