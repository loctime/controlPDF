import { describe, it, expect, beforeEach, vi } from "vitest"
import { loadCv, cvStatus } from "../cv"

describe("cargador de OpenCV", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("arranca en idle", () => {
    expect(cvStatus()).toBe("idle")
  })

  it("resuelve la misma instancia en llamadas concurrentes", async () => {
    const [a, b] = await Promise.all([loadCv(), loadCv()])
    expect(a).toBe(b)
    expect(typeof a.Mat).toBe("function")
  })

  it("queda en ready después de cargar", async () => {
    await loadCv()
    expect(cvStatus()).toBe("ready")
  })

  it("rechaza y queda en failed cuando la carga falla", async () => {
    // Resetear módulos y mockear @techstark/opencv-js para fallar
    vi.resetModules()
    const testError = new Error("OpenCV load failed")
    vi.doMock("@techstark/opencv-js", () => ({
      default: Promise.reject(testError),
    }))

    // Importar dinámicamente para obtener un registro de módulos fresco
    const { loadCv: loadCvFail, cvStatus: cvStatusFail } = await import("../cv")

    // Llamada 1: debe rechazar
    await expect(loadCvFail()).rejects.toThrow("OpenCV load failed")
    expect(cvStatusFail()).toBe("failed")

    // Llamada 2: también rechaza (por ser Promise singleton)
    await expect(loadCvFail()).rejects.toThrow("OpenCV load failed")
  })
})
