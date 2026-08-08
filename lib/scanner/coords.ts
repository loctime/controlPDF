import type { Corners, Point } from "./types"

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

/**
 * Dice si el documento detectado se sale del cuadro de la foto, o sea que le
 * falta lo que la cámara nunca capturó.
 *
 * La señal es que alguna esquina caiga FUERA de los límites de la imagen. Eso
 * pasa cuando la detección no encontró un cuadrilátero fiel y cayó al
 * rectángulo envolvente, que se extiende más allá del papel visible.
 *
 * Una esquina meramente pegada al borde NO sirve como señal: un documento que
 * llena bien el cuadro las tiene ahí y está perfectamente capturado. Avisar en
 * ese caso es un falso positivo que manda al usuario a repetir una foto que
 * estaba bien.
 */
export function documentOverflowsFrame(
  corners: Corners,
  width: number,
  height: number,
): boolean {
  const tolerance = Math.max(4, Math.round(0.01 * Math.max(width, height)))
  return corners.some(
    (p) =>
      p.x < -tolerance ||
      p.y < -tolerance ||
      p.x > width + tolerance ||
      p.y > height + tolerance,
  )
}
