"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ProtectOptions } from "@/lib/pdf"
import { useEditorStore } from "@/lib/editor/store"
import type { ProtectOp } from "@/lib/editor/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const defaultOpts: ProtectOptions = {
  userPassword: "",
  ownerPassword: "",
  permissions: {
    printing: true,
    modifying: false,
    copying: false,
    annotating: false,
    fillingForms: true,
    contentAccessibility: true,
    documentAssembly: false,
  },
}

export function ProtectModal({ open, onOpenChange }: Props) {
  const existing = useEditorStore((s) => s.globalOps.protect)
  const setGlobalOp = useEditorStore((s) => s.setGlobalOp)
  const clearGlobalOp = useEditorStore((s) => s.clearGlobalOp)

  const [opts, setOpts] = useState<ProtectOptions>(
    existing?.opts ?? defaultOpts,
  )
  const [userConfirm, setUserConfirm] = useState("")
  const [ownerConfirm, setOwnerConfirm] = useState("")

  const reset = () => {
    setOpts(existing?.opts ?? defaultOpts)
    setUserConfirm("")
    setOwnerConfirm("")
  }

  const userMismatch = !!opts.userPassword?.trim() && opts.userPassword !== userConfirm
  const ownerMismatch = !!opts.ownerPassword?.trim() && opts.ownerPassword !== ownerConfirm
  const noneSet = !opts.userPassword?.trim() && !opts.ownerPassword?.trim()

  const save = () => {
    if (noneSet || userMismatch || ownerMismatch) return
    const op: ProtectOp = { enabled: true, opts }
    setGlobalOp("protect", op)
    onOpenChange(false)
  }

  const remove = () => {
    clearGlobalOp("protect")
    onOpenChange(false)
  }

  const togglePerm = (key: keyof NonNullable<ProtectOptions["permissions"]>) => {
    setOpts({
      ...opts,
      permissions: {
        ...opts.permissions,
        [key]: !opts.permissions?.[key],
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Proteger con contraseña</DialogTitle>
          <DialogDescription>
            Aplicado al PDF (o a cada PDF del ZIP) en el momento de descargar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Contraseña para abrir</Label>
            <Input
              type="password"
              value={opts.userPassword ?? ""}
              onChange={(e) => { setOpts({ ...opts, userPassword: e.target.value }); setUserConfirm("") }}
              placeholder="Para abrir el PDF"
            />
            {opts.userPassword?.trim() && (
              <Input
                type="password"
                value={userConfirm}
                onChange={(e) => setUserConfirm(e.target.value)}
                placeholder="Confirmar contraseña"
                className={userMismatch ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            )}
            {userMismatch && <p className="text-xs text-destructive">Las contraseñas no coinciden</p>}
          </div>
          <div className="space-y-2">
            <Label>Contraseña de permisos <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              type="password"
              value={opts.ownerPassword ?? ""}
              onChange={(e) => { setOpts({ ...opts, ownerPassword: e.target.value }); setOwnerConfirm("") }}
              placeholder="Para cambiar permisos"
            />
            {opts.ownerPassword?.trim() && (
              <Input
                type="password"
                value={ownerConfirm}
                onChange={(e) => setOwnerConfirm(e.target.value)}
                placeholder="Confirmar contraseña"
                className={ownerMismatch ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            )}
            {ownerMismatch && <p className="text-xs text-destructive">Las contraseñas no coinciden</p>}
          </div>
          <div className="space-y-2">
            <Label>Permisos</Label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ["printing", "Imprimir"],
                  ["copying", "Copiar texto"],
                  ["modifying", "Modificar"],
                  ["annotating", "Anotar"],
                  ["fillingForms", "Llenar formularios"],
                  ["documentAssembly", "Reorganizar"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Switch
                    checked={opts.permissions?.[key] ?? false}
                    onCheckedChange={() => togglePerm(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {existing && (
            <Button variant="ghost" onClick={remove} className="mr-auto">
              Quitar protección
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={noneSet || userMismatch || ownerMismatch}
          >
            {existing ? "Guardar" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
