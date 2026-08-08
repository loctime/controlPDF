/// <reference lib="webworker" />
import { detectCorners } from "./detect"
import { warpToRect } from "./warp"
import { stylize } from "./stylize"
import type { RawImage, WorkerRequest, WorkerResponse } from "./types"

/** Warp de la página en confirmación. Se reusa al cambiar de modo. */
let cachedWarp: RawImage | null = null

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
        cachedWarp = await warpToRect(raw, req.corners)
        const styled = await stylize(cachedWarp, req.mode)
        const bitmap = rawToBitmap(styled)
        reply({ id: req.id, ok: true, op: "warp", bitmap }, [bitmap])
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
