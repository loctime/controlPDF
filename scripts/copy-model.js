const fs = require("fs")
const path = require("path")

// Copia el modelo de detección de esquinas y su runtime de ONNX desde la
// dependencia versionada en package.json a /public/scanner-model.
//
// Por defecto scanic los baja de un CDN de terceros en la primera detección.
// Auto-hospedarlos evita depender de que ese CDN siga vivo, evita peticiones a
// terceros desde una app que promete no tener backend, y deja la versión del
// modelo fijada por package.json en vez de por lo que sirva el CDN.
//
// Mismo patrón que copy-opencv.js. Los archivos van a .gitignore: se regeneran
// en cada build a partir de node_modules.
const ARCHIVOS = [
  "doccornernet_lean.ort", // el modelo, ~1,9 MB
  "ort-wasm-simd-threaded.wasm", // runtime de ONNX recortado, ~1,5 MB
  "ort-wasm-simd-threaded.mjs", // glue del runtime
]

// pnpm resuelve node_modules con symlinks: hay que seguirlos hasta el real.
const paquete = path.dirname(require.resolve("scanic-ml/package.json"))
const origen = path.join(paquete, "dist")
const destino = path.join(__dirname, "..", "public", "scanner-model")

fs.mkdirSync(destino, { recursive: true })

let total = 0
for (const archivo of ARCHIVOS) {
  const src = path.join(origen, archivo)
  if (!fs.existsSync(src)) {
    console.error(`falta ${archivo} en scanic-ml — se cancela la copia`)
    process.exit(1)
  }
  fs.copyFileSync(src, path.join(destino, archivo))
  total += fs.statSync(src).size
}

console.log(
  `modelo del scanner copiado a public/scanner-model/ (${(total / 1024 / 1024).toFixed(1)} MB)`,
)
