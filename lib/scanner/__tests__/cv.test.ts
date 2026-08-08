import { describe, it, expect } from "vitest"
import { loadCv, cvStatus } from "../cv"

describe("cargador de OpenCV", () => {
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
})
