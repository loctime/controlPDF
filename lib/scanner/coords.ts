import type { Point } from "./types"

export interface Size {
  w: number
  h: number
}

/** Rectángulo ya medido (por ejemplo `getBoundingClientRect()`), sin depender del DOM. */
export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Convierte un punto en el espacio de la imagen original al espacio de
 * pantalla (relativo a la esquina superior izquierda de la imagen renderizada).
 */
export function toScreen(p: Point, natural: Size, box: Size): Point {
  if (natural.w === 0 || natural.h === 0 || box.w === 0 || box.h === 0) {
    return { x: 0, y: 0 }
  }
  return { x: (p.x / natural.w) * box.w, y: (p.y / natural.h) * box.h }
}

/**
 * Convierte una posición de puntero en coordenadas de pantalla (`clientX`/`clientY`)
 * al espacio de la imagen original, topeando a los bordes de la imagen renderizada.
 */
export function toImage(
  clientX: number,
  clientY: number,
  natural: Size,
  rect: ScreenRect,
): Point {
  if (natural.w === 0 || natural.h === 0 || rect.width === 0 || rect.height === 0) {
    return { x: 0, y: 0 }
  }
  const sx = Math.min(Math.max(clientX - rect.left, 0), rect.width)
  const sy = Math.min(Math.max(clientY - rect.top, 0), rect.height)
  return {
    x: Math.round((sx / rect.width) * natural.w),
    y: Math.round((sy / rect.height) * natural.h),
  }
}
