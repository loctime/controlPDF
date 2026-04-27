"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isMac: boolean
}

export function ShortcutsDialog({ open, onOpenChange, isMac }: ShortcutsDialogProps) {
  const mod = isMac ? "⌘" : "Ctrl"
  const items: Array<{ keys: string; label: string }> = [
    { keys: `${mod} + O`, label: "Abrir selector de archivos" },
    { keys: `${mod} + A`, label: "Seleccionar todas las páginas" },
    { keys: `${mod} + Z`, label: "Deshacer" },
    { keys: `${mod} + Shift + Z`, label: "Rehacer" },
    { keys: "Click", label: "Seleccionar página" },
    { keys: "Shift + Click", label: "Seleccionar rango" },
    { keys: `${mod} + Click`, label: "Toggle selección" },
    { keys: "Esc", label: "Limpiar selección o todo" },
    { keys: "?", label: "Mostrar atajos" },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            Acelerá tu flujo de trabajo con estos atajos del editor.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.keys}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-foreground">{item.label}</span>
              <kbd className="px-2 py-0.5 text-xs font-mono rounded border border-border bg-muted text-muted-foreground">
                {item.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
