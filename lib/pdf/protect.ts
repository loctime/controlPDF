import { PDFDocument } from "@cantoo/pdf-lib"

export interface ProtectOptions {
  userPassword?: string
  ownerPassword?: string
  permissions?: {
    printing?: boolean
    modifying?: boolean
    copying?: boolean
    annotating?: boolean
    fillingForms?: boolean
    contentAccessibility?: boolean
    documentAssembly?: boolean
  }
}

export async function protectPDF(
  file: File,
  options: ProtectOptions,
): Promise<Uint8Array> {
  if (!options.userPassword && !options.ownerPassword) {
    throw new Error("Definí al menos una contraseña")
  }
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer)
  doc.encrypt({
    userPassword: options.userPassword || options.ownerPassword,
    ownerPassword: options.ownerPassword || options.userPassword,
    permissions: {
      printing: options.permissions?.printing ? "highResolution" : false,
      modifying: options.permissions?.modifying ?? false,
      copying: options.permissions?.copying ?? false,
      annotating: options.permissions?.annotating ?? false,
      fillingForms: options.permissions?.fillingForms ?? false,
      contentAccessibility: options.permissions?.contentAccessibility ?? true,
      documentAssembly: options.permissions?.documentAssembly ?? false,
    },
  })
  return doc.save()
}

export async function unlockPDF(
  file: File,
  password: string,
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer, {
    password,
    ignoreEncryption: false,
  })
  return doc.save()
}

export async function isEncrypted(file: File): Promise<boolean> {
  const buffer = await file.arrayBuffer()
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
    return doc.isEncrypted
  } catch {
    return false
  }
}
