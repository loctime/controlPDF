import { describe, it, expect } from "vitest"
import cvReady from "@techstark/opencv-js"
import { makeDocumentPhoto } from "./fixtures"

describe("infraestructura", () => {
  it("carga OpenCV en Node y expone las funciones que usamos", async () => {
    const cv = await cvReady
    expect(typeof cv.Mat).toBe("function")
    expect(typeof cv.matFromImageData).toBe("function")
    expect(typeof cv.findContours).toBe("function")
    expect(typeof cv.getPerspectiveTransform).toBe("function")
    expect(typeof cv.warpPerspective).toBe("function")
    expect(typeof cv.adaptiveThreshold).toBe("function")
  })

  it("genera una foto sintética con el papel más claro que el fondo", () => {
    const { image, corners } = makeDocumentPhoto()
    expect(image.width).toBe(1200)
    expect(image.height).toBe(900)
    expect(corners).toHaveLength(4)

    const at = (x: number, y: number) => image.data[(y * image.width + x) * 4]
    expect(at(600, 400)).toBeGreaterThan(200) // centro del papel
    expect(at(20, 20)).toBeLessThan(60) // esquina de fondo
  })
})
