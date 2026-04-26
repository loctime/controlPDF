import { Skeleton } from "@/components/ui/skeleton"

export function PanelSkeleton() {
  return (
    <div className="space-y-4" aria-label="Cargando herramienta" aria-busy="true">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}
