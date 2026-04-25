"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, EyeOff, Lock, Unlock } from "lucide-react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import { downloadBytes, isEncrypted, protectPDF, unlockPDF } from "@/lib/pdf"

type Mode = "protect" | "unlock"

export function ProtectPanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [mode, setMode] = useState<Mode>("protect")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [allowPrint, setAllowPrint] = useState(true)
  const [allowCopy, setAllowCopy] = useState(false)
  const [allowModify, setAllowModify] = useState(false)
  const [allowAnnotate, setAllowAnnotate] = useState(false)
  const [encrypted, setEncrypted] = useState<boolean | null>(null)

  const file = files[0]

  useEffect(() => {
    if (!file) {
      setEncrypted(null)
      return
    }
    isEncrypted(file.file)
      .then((v) => {
        setEncrypted(v)
        if (v) setMode("unlock")
        else setMode("protect")
      })
      .catch(() => setEncrypted(null))
  }, [file])

  const passwordsMatch = mode === "unlock" || password === confirm
  const passwordValid = password.length >= 4
  const canProcess =
    !!file && !file.error && passwordValid && passwordsMatch && !isProcessing

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file) return
    setIsProcessing(true)
    try {
      const baseName = file.fileName.replace(/\.pdf$/i, "")
      if (mode === "protect") {
        const bytes = await protectPDF(file.file, {
          userPassword: password,
          permissions: {
            printing: allowPrint,
            copying: allowCopy,
            modifying: allowModify,
            annotating: allowAnnotate,
            documentAssembly: false,
          },
        })
        downloadBytes(bytes, `${baseName}-protegido.pdf`)
        toast.success("PDF protegido y descargado")
      } else {
        const bytes = await unlockPDF(file.file, password)
        downloadBytes(bytes, `${baseName}-desbloqueado.pdf`)
        toast.success("PDF desbloqueado y descargado")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error procesando el PDF"
      toast.error(
        mode === "unlock" && /password/i.test(msg)
          ? "Contraseña incorrecta"
          : msg,
      )
    } finally {
      setIsProcessing(false)
    }
  }, [
    canProcess,
    file,
    mode,
    password,
    allowPrint,
    allowCopy,
    allowModify,
    allowAnnotate,
    setIsProcessing,
  ])

  if (files.length === 0) return null

  return (
    <div className="space-y-6">
      <FileList
        files={files}
        reorderable={false}
        onRemove={onRemoveFile}
        onReorder={setFiles}
      />

      <OptionsCard>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-md border p-1">
            <button
              type="button"
              onClick={() => setMode("protect")}
              className={`flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors ${
                mode === "protect"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/60"
              }`}
            >
              <Lock className="h-4 w-4" /> Proteger
            </button>
            <button
              type="button"
              onClick={() => setMode("unlock")}
              className={`flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors ${
                mode === "unlock"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/60"
              }`}
            >
              <Unlock className="h-4 w-4" /> Desbloquear
            </button>
          </div>

          {encrypted === true && mode === "protect" && (
            <p className="text-xs text-muted-foreground">
              Este PDF ya tiene contraseña. Cambiá a "Desbloquear" para quitarla.
            </p>
          )}
          {encrypted === false && mode === "unlock" && (
            <p className="text-xs text-muted-foreground">
              Este PDF no parece estar protegido.
            </p>
          )}

          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="opt-password">
              {mode === "protect" ? "Contraseña" : "Contraseña actual"}
            </label>
            <div className="relative">
              <input
                id="opt-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 pr-10 text-sm rounded-md border border-input bg-background text-foreground"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar" : "Mostrar"}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {mode === "protect" && password.length > 0 && password.length < 4 && (
              <p className="text-xs text-destructive">
                Mínimo 4 caracteres.
              </p>
            )}
          </div>

          {mode === "protect" && (
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="opt-password-confirm">
                Confirmar contraseña
              </label>
              <input
                id="opt-password-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              />
              {confirm.length > 0 && password !== confirm && (
                <p className="text-xs text-destructive">No coincide.</p>
              )}
            </div>
          )}

          {mode === "protect" && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-foreground">Permisos</p>
              <PermissionRow
                label="Imprimir"
                checked={allowPrint}
                onChange={setAllowPrint}
              />
              <PermissionRow
                label="Copiar texto / imágenes"
                checked={allowCopy}
                onChange={setAllowCopy}
              />
              <PermissionRow
                label="Modificar el documento"
                checked={allowModify}
                onChange={setAllowModify}
              />
              <PermissionRow
                label="Agregar anotaciones"
                checked={allowAnnotate}
                onChange={setAllowAnnotate}
              />
            </div>
          )}
        </div>
      </OptionsCard>

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label={mode === "protect" ? "Proteger y descargar" : "Desbloquear y descargar"}
        onProcess={handleProcess}
        onClear={onClearFiles}
      />
    </div>
  )
}

function PermissionRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between text-sm text-foreground">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-primary"
      />
    </label>
  )
}
