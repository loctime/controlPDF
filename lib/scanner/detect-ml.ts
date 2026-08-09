import { scanDocument } from "scanic"
import type { Corners, RawImage } from "./types"

/**
 * Dónde viven el modelo y el runtime de ONNX. Los copia ahí
 * `scripts/copy-model.js` desde la dependencia versionada en package.json.
 *
 * Por defecto scanic los bajaría de un CDN de terceros: auto-hospedarlos evita
 * depender de que ese CDN siga vivo y evita peticiones a terceros desde una app
 * que promete no tener backend.
 */
const ASSET_BASE_URL = "/scanner-model"

/**
 * Probabilidad mínima de que haya un documento para dar la detección por buena.
 * Es el único número ajustable de este camino. En las mediciones dio 1.00 con
 * documento y 0.00 sin documento, así que el umbral está lejos de ambos.
 */
const MIN_SCORE = 0.5

/**
 * Detecta las cuatro esquinas con el modelo neuronal (DocCornerNet vía scanic).
 *
 * Devuelve las esquinas **con el etiquetado del propio modelo**, sin pasarlas
 * por `orderCorners`: el modelo ya distingue arriba-izquierda de abajo-derecha,
 * y reordenarlas reintroduciría el bug de rotación que este camino evita.
 *
 * Devuelve null si no hay documento o si el score no alcanza. Tirar una
 * excepción queda para las fallas reales (modelo que no carga), que el llamador
 * usa para caer al respaldo con OpenCV.
 */
export async function detectWithModel(img: RawImage): Promise<Corners | null> {
  const imageData = new ImageData(img.data, img.width, img.height)

  const result = await scanDocument(imageData, {
    detector: "ml",
    ml: { assetBaseUrl: ASSET_BASE_URL, minScore: MIN_SCORE },
  })

  if (!result.success || !result.corners) return null

  const { topLeft, topRight, bottomRight, bottomLeft } = result.corners
  return [topLeft, topRight, bottomRight, bottomLeft].map((p) => ({
    x: Math.round(p.x),
    y: Math.round(p.y),
  })) as Corners
}
