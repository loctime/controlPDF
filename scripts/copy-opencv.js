const fs = require("fs")
const path = require("path")

// Copia el glue de OpenCV desde la dependencia versionada en package.json a
// /public, para que el worker lo cargue con importScripts en tiempo de
// ejecución en vez de que el bundler intente meterlo en el grafo de módulos
// (Turbopack no soporta el archivo de 13 MB de Emscripten, ver Tarea 6).
const src = path.join(
  __dirname,
  "..",
  "node_modules",
  "@techstark",
  "opencv-js",
  "dist",
  "opencv.js",
)
const dest = path.join(__dirname, "..", "public", "opencv.js")

fs.copyFileSync(src, dest)
console.log("opencv.js copiado a public/")
