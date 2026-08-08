import { describe, it, expect } from "vitest"
import { toScreen, toImage, documentOverflowsFrame } from "../coords"
import type { Corners, Point } from "../types"

describe("toScreen / toImage", () => {
  it("ida y vuelta: toImage(toScreen(p)) vuelve a p, para varios tamaños de caja", () => {
    const natural = { w: 1200, h: 900 }
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1200, y: 900 },
      { x: 600, y: 450 },
      { x: 37, y: 812 },
    ]
    const boxes = [
      { w: 300, h: 225 }, // renderizada más chica que el natural
      { w: 1200, h: 900 }, // misma escala
      { w: 2400, h: 1800 }, // renderizada más grande que el natural
    ]

    for (const box of boxes) {
      // El rect que devolvería getBoundingClientRect() para una imagen
      // que arranca en el origen de la pantalla.
      const rect = { left: 0, top: 0, width: box.w, height: box.h }
      for (const p of points) {
        const screen = toScreen(p, natural, box)
        const back = toImage(screen.x, screen.y, natural, rect)
        // El redondeo a px entero dentro de toImage puede desviar 1px.
        expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(1)
      }
    }
  })

  it("ida y vuelta con la imagen desplazada de pantalla (rect.left/top != 0)", () => {
    const natural = { w: 800, h: 600 }
    const box = { w: 400, h: 300 }
    const rect = { left: 120, top: 64, width: box.w, height: box.h }
    const p: Point = { x: 640, y: 90 }

    // toScreen da coordenadas relativas a la imagen; para simular clientX/Y
    // hay que sumarle el offset de pantalla del rect.
    const screen = toScreen(p, natural, box)
    const back = toImage(screen.x + rect.left, screen.y + rect.top, natural, rect)
    expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(1)
  })

  it("clampea un puntero fuera de los bordes de la imagen renderizada", () => {
    const natural = { w: 1000, h: 800 }
    const rect = { left: 50, top: 50, width: 500, height: 400 }

    // Muy arriba/a la izquierda del rect: no debe dar negativo.
    expect(toImage(-1000, -1000, natural, rect)).toEqual({ x: 0, y: 0 })

    // Muy abajo/a la derecha del rect: no debe superar el natural.
    expect(toImage(100000, 100000, natural, rect)).toEqual({ x: 1000, y: 800 })

    // Exactamente en el borde del rect: coincide con el límite de la imagen.
    expect(toImage(rect.left, rect.top, natural, rect)).toEqual({ x: 0, y: 0 })
    expect(toImage(rect.left + rect.width, rect.top + rect.height, natural, rect)).toEqual({
      x: 1000,
      y: 800,
    })
  })

  it("funciona con escala asimétrica entre ejes (imagen angosta y alta, renderizada ancha y baja)", () => {
    const natural = { w: 1000, h: 2000 }
    const box = { w: 500, h: 250 } // escala x = 0.5, escala y = 0.125
    const p: Point = { x: 800, y: 1500 }

    const screen = toScreen(p, natural, box)
    expect(screen.x).toBeCloseTo(400, 5)
    expect(screen.y).toBeCloseTo(187.5, 5)

    const rect = { left: 0, top: 0, width: box.w, height: box.h }
    const back = toImage(screen.x, screen.y, natural, rect)
    expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(1)
  })

  it("toScreen y toImage devuelven {0,0} en vez de NaN/Infinity cuando falta medir todavía", () => {
    expect(toScreen({ x: 10, y: 10 }, { w: 0, h: 0 }, { w: 0, h: 0 })).toEqual({ x: 0, y: 0 })
    expect(toImage(10, 10, { w: 100, h: 100 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual(
      { x: 0, y: 0 },
    )
  })
})

describe("documentOverflowsFrame", () => {
  // Valores reales de las fotos de lib/scanner/__tests__/photos.
  const FOTO = { w: 1536, h: 2048 }

  it("no avisa cuando el documento entra entero", () => {
    const corners = [
      { x: 311, y: 96 },
      { x: 1472, y: 264 },
      { x: 1208, y: 1859 },
      { x: 84, y: 1661 },
    ] as Corners
    expect(documentOverflowsFrame(corners, FOTO.w, FOTO.h)).toBe(false)
  })

  it("no avisa cuando el documento llena el cuadro y toca los bordes", () => {
    // 02-hoja-toca-borde.jpg: esquinas en x=0 y x=1534 sobre 1536 de ancho.
    // Está perfectamente capturado; avisar acá seria un falso positivo.
    const corners = [
      { x: 0, y: 436 },
      { x: 938, y: 66 },
      { x: 1534, y: 1473 },
      { x: 534, y: 1864 },
    ] as Corners
    expect(documentOverflowsFrame(corners, FOTO.w, FOTO.h)).toBe(false)
  })

  it("avisa cuando el papel se sale por izquierda y arriba", () => {
    // 03-sale-por-tres-lados.jpg
    const corners = [
      { x: -236, y: 385 },
      { x: 967, y: -154 },
      { x: 1700, y: 1481 },
      { x: 500, y: 2019 },
    ] as Corners
    expect(documentOverflowsFrame(corners, FOTO.w, FOTO.h)).toBe(true)
  })

  it("avisa cuando se sale por abajo", () => {
    // 04-sale-y-pila-de-hojas.jpg
    const corners = [
      { x: -76, y: 27 },
      { x: 1300, y: -80 },
      { x: 1460, y: 1958 },
      { x: 84, y: 2066 },
    ] as Corners
    expect(documentOverflowsFrame(corners, FOTO.w, FOTO.h)).toBe(true)
  })
})
