const fs = require("fs")
const path = require("path")

// Copia los dos chunks JavaScript del detector neuronal al lado del bundle.
//
// scanic marca ese import con `/* webpackIgnore: true */` a propósito, para que
// webpack no meta onnxruntime en el grafo de módulos de todas las apps que la
// usan. La consecuencia es que queda como un import nativo **relativo al chunk
// que lo contiene**: nuestro worker vive en /_next/static/chunks/, así que ahí
// es donde el navegador va a buscar `./scanic-mlDetector.js`.
//
// Sin esto el import da 404, la detección cae al respaldo con OpenCV y nadie se
// entera salvo por el aviso en consola. Por eso este script falla ruidosamente.
//
// La cadena completa es:
//   worker → scanic-mlDetector.js → scanic-ort.wasm.min.js → /scanner-model/*
// Los últimos (modelo y wasm) los resuelve `assetBaseUrl` en detect-ml.ts y los
// copia copy-model.js; estos dos primeros son los que dependen de la ubicación.
const ARCHIVOS = ["scanic-mlDetector.js", "scanic-ort.wasm.min.js"]

// `scanic` no expone package.json en sus exports, así que se resuelve por el
// entry point principal (dist/scanic.umd.cjs) y se toma su directorio.
const origen = path.dirname(require.resolve("scanic"))
const destino = path.join(__dirname, "..", ".next", "static", "chunks")

if (!fs.existsSync(destino)) {
  console.error(
    `no existe ${destino}. Este script corre como postbuild, después de next build.`,
  )
  process.exit(1)
}

for (const archivo of ARCHIVOS) {
  const src = path.join(origen, archivo)
  if (!fs.existsSync(src)) {
    console.error(`falta ${archivo} en scanic — se cancela la copia`)
    process.exit(1)
  }
  fs.copyFileSync(src, path.join(destino, archivo))
}

console.log(`chunks del detector copiados a .next/static/chunks/ (${ARCHIVOS.length})`)
