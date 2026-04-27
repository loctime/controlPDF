"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useEditorStore } from "@/lib/editor/store"
import type { PageScope } from "@/lib/editor/types"
import { useShallow } from "zustand/react/shallow"

interface PageScopeSelectorProps {
  scope: PageScope
  onChange: (scope: PageScope) => void
}

export function PageScopeSelector({ scope, onChange }: PageScopeSelectorProps) {
  const { visibleCount, currentSelectionIds } = useEditorStore(
    useShallow((s) => ({
      visibleCount: s.pages.filter((p) => !p.deleted).length,
      currentSelectionIds: Array.from(s.selection.pageIds),
    })),
  )

  const set = (kind: PageScope["kind"]) => {
    if (kind === "all") onChange({ kind: "all" })
    else if (kind === "selected") {
      onChange({ kind: "selected", pageIds: currentSelectionIds })
    } else {
      const prev = scope.kind === "range" ? scope : { from: 1, to: visibleCount || 1 }
      onChange({ kind: "range", from: prev.from, to: prev.to })
    }
  }

  return (
    <div className="space-y-2">
      <Label>Aplicar a</Label>
      <div className="grid grid-cols-3 gap-2">
        <ScopeButton
          active={scope.kind === "all"}
          onClick={() => set("all")}
          label="Todas"
          subtitle={`${visibleCount} ${visibleCount === 1 ? "página" : "páginas"}`}
        />
        <ScopeButton
          active={scope.kind === "selected"}
          onClick={() => set("selected")}
          disabled={currentSelectionIds.length === 0 && scope.kind !== "selected"}
          label="Selección"
          subtitle={
            scope.kind === "selected"
              ? `${scope.pageIds.length} fija${scope.pageIds.length !== 1 ? "s" : ""}`
              : `${currentSelectionIds.length} ahora`
          }
        />
        <ScopeButton
          active={scope.kind === "range"}
          onClick={() => set("range")}
          label="Rango"
          subtitle="ej. 1-5"
        />
      </div>
      {scope.kind === "range" && (
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input
              type="number"
              min={1}
              max={visibleCount}
              value={scope.from}
              onChange={(e) => {
                const v = Math.max(1, parseInt(e.target.value, 10) || 1)
                onChange({ kind: "range", from: v, to: Math.max(v, scope.to) })
              }}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input
              type="number"
              min={scope.from}
              max={visibleCount}
              value={scope.to}
              onChange={(e) => {
                const v = Math.max(
                  scope.from,
                  Math.min(visibleCount, parseInt(e.target.value, 10) || scope.from),
                )
                onChange({ kind: "range", from: scope.from, to: v })
              }}
            />
          </div>
        </div>
      )}
      {scope.kind === "selected" && scope.pageIds.length === 0 && (
        <p className="text-xs text-destructive">
          No hay páginas seleccionadas. Cancelá y seleccioná páginas primero.
        </p>
      )}
    </div>
  )
}

function ScopeButton({
  active,
  onClick,
  disabled,
  label,
  subtitle,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  label: string
  subtitle: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-start rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-input hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </button>
  )
}
