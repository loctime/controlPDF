import React from "react"
import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://controlpdf.app"
const TITLE = "controlPDF — Herramientas PDF privadas en tu navegador"
const DESCRIPTION =
  "Suite completa de herramientas PDF que corren 100% en tu navegador: unir, dividir, rotar, comprimir, convertir a imagen, proteger, firmar, OCR, marca de agua, numerar y editar metadatos. Tus archivos no salen nunca de tu computadora."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "controlPDF",
  keywords: [
    "PDF",
    "unir PDF",
    "dividir PDF",
    "comprimir PDF",
    "firmar PDF",
    "OCR",
    "PDF a imagen",
    "marca de agua",
    "metadatos PDF",
    "navegador",
    "privado",
  ],
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: SITE_URL,
    siteName: "controlPDF",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
