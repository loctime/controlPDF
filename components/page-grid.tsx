"use client"

import { cn } from "@/lib/utils"
import { PageThumbnail } from "@/components/page-thumbnail"

export interface PageGridProps {
  file: File
  pageCount: number
  width?: number
  selectedPages?: Set<number>
  rotations?: Map<number, number>
  removedPages?: Set<number>
  onSelect?: (pageNumber: number) => void
  onRotate?: (pageNumber: number) => void
  onRemove?: (pageNumber: number) => void
  className?: string
  eager?: boolean
}

export function PageGrid({
  file,
  pageCount,
  width = 160,
  selectedPages,
  rotations,
  removedPages,
  onSelect,
  onRotate,
  onRemove,
  className,
  eager,
}: PageGridProps) {
  if (pageCount <= 0) return null

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)

  return (
    <div
      className={cn(
        "grid gap-3",
        "grid-cols-[repeat(auto-fill,minmax(140px,1fr))]",
        className,
      )}
    >
      {pages.map((pageNumber) => (
        <PageThumbnail
          key={pageNumber}
          file={file}
          pageNumber={pageNumber}
          width={width}
          rotation={rotations?.get(pageNumber) ?? 0}
          selected={selectedPages?.has(pageNumber)}
          removed={removedPages?.has(pageNumber)}
          onClick={onSelect ? () => onSelect(pageNumber) : undefined}
          onRotate={onRotate ? () => onRotate(pageNumber) : undefined}
          onRemove={onRemove ? () => onRemove(pageNumber) : undefined}
          lazy={!eager}
          className="mx-auto"
        />
      ))}
    </div>
  )
}
