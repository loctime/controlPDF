"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Layers,
  Scissors,
  Minimize2,
  RefreshCw,
  RotateCw,
  Lock,
  PenTool,
  ScanText,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  LogOut,
} from "lucide-react"
import { ToolCard } from "@/components/tool-card"
import { DropZone } from "@/components/drop-zone"
import { FileList, type FileItem } from "@/components/file-list"
import { OptionsPanel } from "@/components/options-panel"
import { AuthGuard } from "@/components/auth-guard"
import { Button } from "@/components/ui/button"
import { controlPDFService, type MergeRequest } from "@/lib/controlpdf-api"
import { firebaseAuthService, type User } from "@/lib/firebase-auth"
import { firestoreUserService } from "@/lib/firestore-user"

const tools = [
  { id: "merge", label: "Unir PDF", icon: Layers },
  { id: "split", label: "Dividir PDF", icon: Scissors },
  { id: "compress", label: "Comprimir PDF", icon: Minimize2 },
  { id: "convert", label: "Convertir PDF", icon: RefreshCw },
  { id: "rotate", label: "Rotar PDF", icon: RotateCw },
  { id: "protect", label: "Proteger PDF", icon: Lock },
  { id: "sign", label: "Firmar PDF", icon: PenTool },
  { id: "ocr", label: "OCR PDF", icon: ScanText },
]

export default function PDFToolsPage() {
  const [selectedTool, setSelectedTool] = useState("merge")
  const [files, setFiles] = useState<FileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [mergeOptions, setMergeOptions] = useState({ keepBookmarks: true })
  const [result, setResult] = useState<{ fileId: string; fileName: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    const fileItems: FileItem[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      pages: Math.floor(Math.random() * 20) + 1, // Simulado - en producción usarías pdf.js
    }))
    setFiles((prev) => [...prev, ...fileItems])
    setError(null)
    setResult(null)
  }, [])

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const handleReorderFiles = useCallback((newFiles: FileItem[]) => {
    setFiles(newFiles)
  }, [])

  const handleProcessPDF = useCallback(async () => {
    if (selectedTool !== "merge") return
    
    // Validar que haya al menos 2 archivos
    if (files.length < 2) {
      setError("Se requieren al menos 2 archivos para fusionar")
      return
    }

    // Validar que todos los archivos tengan fileId
    const filesWithoutFileId = files.filter(f => !f.fileId)
    if (filesWithoutFileId.length > 0) {
      setError("Todos los archivos deben tener un fileId de ControlFile")
      return
    }

    // Validar que haya usuario autenticado
    if (!user) {
      setError("Debes estar autenticado para procesar PDFs")
      return
    }

    setIsProcessing(true)
    setError(null)
    setResult(null)

    try {
      const idToken = await firebaseAuthService.getIdToken()
      if (!idToken) {
        throw new Error("No se pudo obtener el token de autenticación")
      }

      const mergeRequest: MergeRequest = {
        inputs: files.map(f => ({ fileId: f.fileId! })),
        options: mergeOptions,
        context: {
          app: "controlpdf",
          userId: user.uid,
          ownerId: user.uid, // Asumimos que el ownerId es el mismo userId
          source: "ui",
        },
      }

      const mergeResult = await controlPDFService.mergePDFs(mergeRequest, idToken)
      setResult({
        fileId: mergeResult.resultFileId,
        fileName: mergeResult.resultFileName,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar los PDFs")
    } finally {
      setIsProcessing(false)
    }
  }, [selectedTool, files, user, mergeOptions])

  // Efecto para manejar la autenticación y guardar metadata
  useEffect(() => {
    const unsubscribe = firebaseAuthService.onAuthStateChanged(async (user) => {
      setUser(user)
      
      // Guardar metadata en Firestore cuando el usuario inicia sesión
      if (user) {
        try {
          await firestoreUserService.updateUserLogin(user, 'unknown')
        } catch (error) {
          console.error('Error saving user metadata:', error)
        }
      }
    })

    return unsubscribe
  }, [])

  const handleSignOut = async () => {
    const result = await firebaseAuthService.signOut()
    if (result.error) {
      console.error('Error signing out:', result.error.message)
    }
  }

  const getToolName = () => {
    const tool = tools.find((t) => t.id === selectedTool)
    return tool?.label || "Procesar PDF"
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
          {/* Header */}
          <header className="text-center mb-8 md:mb-12">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
                <FileText className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
                Herramientas PDF
              </h1>
            </div>
            <p className="text-muted-foreground mb-4">
              Todas las herramientas que necesitas para trabajar con archivos PDF
            </p>
            
            {/* User info and sign out */}
            {user && (
              <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                <span>Signed in as {user.email}</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleSignOut}
                  className="h-auto p-1"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </header>

        {/* Tool Grid */}
        <section className="mb-8 md:mb-10">
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-3">
            {tools.map((tool) => (
              <ToolCard
                key={tool.id}
                icon={tool.icon}
                label={tool.label}
                isActive={selectedTool === tool.id}
                onClick={() => setSelectedTool(tool.id)}
              />
            ))}
          </div>
        </section>

        {/* Drop Zone */}
        <section className="mb-6">
          <DropZone
            onFilesAdded={handleFilesAdded}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
          />
        </section>

        {/* File List */}
        {files.length > 0 && (
          <section className="mb-6">
            <FileList
              files={files}
              onRemove={handleRemoveFile}
              onReorder={handleReorderFiles}
            />
          </section>
        )}

        {/* Options Panel */}
        {files.length > 0 && (
          <section className="mb-6">
            <OptionsPanel 
              selectedTool={selectedTool} 
              onOptionsChange={setMergeOptions}
            />
          </section>
        )}

        {/* Action Buttons */}
        {files.length > 0 && (
          <section className="flex flex-col gap-4">
            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {result && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <div className="flex-1">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    PDF fusionado exitosamente: {result.fileName}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    FileId: {result.fileId}
                  </p>
                </div>
              </div>
            )}

            {/* User Authentication Status */}
            {!user && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Debes estar autenticado para procesar PDFs
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                size="lg" 
                className="flex-1"
                onClick={handleProcessPDF}
                disabled={isProcessing || selectedTool !== "merge" || !user || files.length < 2}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  getToolName()
                )}
              </Button>
              <Button size="lg" variant="outline" className="flex-1 sm:flex-none bg-transparent">
                Guardar en ControlFile
              </Button>
            </div>
          </section>
        )}
        </div>
      </div>
    </AuthGuard>
  )
} 
