/// <reference lib="webworker" />
import { detectCorners } from "./detect"
import { warpToRect } from "./warp"
import { stylize } from "./stylize"
import { detectOrientation, rotateQuarterTurns } from "./orientation"
import type { RawImage, WorkerRequest, WorkerResponse } from "./types"

/** Warp de la página en confirmación. Se reusa al cambiar de modo y al girar. */
let cachedWarp: RawImage | null = null

/**
 * Pone la página con el texto para arriba.
 *
 * El enderezado deja la hoja rectangular pero orientada como estaba en la
 * foto: si el papel estaba acostado sobre la mesa, la página sale acostada.
 * Geométricamente no hay nada que corregir —un rectángulo girado es el mismo
 * rectángulo— así que la única pista es cómo corre la tinta.
 *
 * Es best-effort por definición: si no se puede decidir, la página queda como
 * salió y el botón de girar lo arregla en un toque.
 */
async function autoUpright(page: RawImage): Promise<RawImage> {
  try {
    const { turns } = await detectOrientation(page)
    return turns === 0 ? page : rotateQuarterTurns(page, turns)
  } catch (err) {
    console.warn(
      "[scanner] no se pudo deducir la orientación:",
      err instanceof Error ? err.message : err,
    )
    return page
  }
}

function bitmapToRaw(bitmap: ImageBitmap): RawImage {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("OffscreenCanvas sin contexto 2d")
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  return { data: data.data, width: data.width, height: data.height }
}

function rawToBitmap(img: RawImage): ImageBitmap {
  const canvas = new OffscreenCanvas(img.width, img.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("OffscreenCanvas sin contexto 2d")
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0)
  return canvas.transferToImageBitmap()
}

function reply(msg: WorkerResponse, transfer: Transferable[] = []) {
  ;(self as unknown as Worker).postMessage(msg, transfer)
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  try {
    switch (req.op) {
      case "detect": {
        const raw = bitmapToRaw(req.bitmap)
        req.bitmap.close()
        const corners = await detectCorners(raw)
        reply({ id: req.id, ok: true, op: "detect", corners })
        break
      }
      case "warp": {
        const raw = bitmapToRaw(req.bitmap)
        req.bitmap.close()
        cachedWarp = await autoUpright(await warpToRect(raw, req.corners))
        const styled = await stylize(cachedWarp, req.mode)
        const bitmap = rawToBitmap(styled)
        reply({ id: req.id, ok: true, op: "warp", bitmap }, [bitmap])
        break
      }
      case "rotate": {
        if (!cachedWarp) throw new Error("No hay página en edición")
        // Se gira el enderezado cacheado y no la vista previa: así el giro
        // sobrevive a un cambio de modo, que se recalcula desde acá.
        cachedWarp = rotateQuarterTurns(cachedWarp, 1)
        const styled = await stylize(cachedWarp, req.mode)
        const bitmap = rawToBitmap(styled)
        reply({ id: req.id, ok: true, op: "rotate", bitmap }, [bitmap])
        break
      }
      case "restyle": {
        if (!cachedWarp) throw new Error("No hay página en edición")
        const styled = await stylize(cachedWarp, req.mode)
        const bitmap = rawToBitmap(styled)
        reply({ id: req.id, ok: true, op: "restyle", bitmap }, [bitmap])
        break
      }
      case "release": {
        cachedWarp = null
        reply({ id: req.id, ok: true, op: "release" })
        break
      }
    }
  } catch (err) {
    reply({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
