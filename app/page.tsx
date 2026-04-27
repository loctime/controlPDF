"use client"

import { useEffect, useMemo, useState } from "react"
import { FileText } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { ErrorBoundary } from "@/components/error-boundary"
import { ShortcutsDialog } from "@/components/shortcuts-dialog"
import { PdfEditor } from "@/components/editor/pdf-editor"
import { useEditorStore } from "@/lib/editor/store"

export default function PDFToolsPage() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (e.key === "?" && !isEditable && !mod && !e.altKey) {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isMac])

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <header className="relative text-center mb-8 md:mb-10">
          <div className="fixed top-3 right-3 z-40 md:absolute md:top-0 md:right-0">
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
              Editor de PDF
            </h1>
          </div>

        </header>

        <ErrorBoundary
          resetKey="editor"
          onReset={() => useEditorStore.getState().clearAll()}
        >
          <PdfEditor />
        </ErrorBoundary>
      </div>
      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        isMac={isMac}
      />
    </div>
  )
}
