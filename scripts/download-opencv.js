const https = require("https")
const fs = require("fs")
const path = require("path")

const dest = path.join(__dirname, "..", "public", "opencv.js")

if (fs.existsSync(dest)) {
  console.log("opencv.js already present, skipping download")
  process.exit(0)
}

const SRC = "https://docs.opencv.org/4.x/opencv.js"
console.log("Downloading opencv.js from", SRC, "...")

const file = fs.createWriteStream(dest)
https
  .get(SRC, (res) => {
    if (res.statusCode !== 200) {
      file.close()
      fs.unlink(dest, () => {})
      console.error("HTTP", res.statusCode)
      process.exit(1)
    }
    const total = parseInt(res.headers["content-length"] || "0", 10)
    let received = 0
    res.on("data", (chunk) => {
      received += chunk.length
      if (total) process.stdout.write(`\r  ${((received / total) * 100).toFixed(0)}%`)
    })
    res.pipe(file)
    file.on("finish", () => {
      file.close()
      console.log("\nopencv.js ready")
    })
  })
  .on("error", (err) => {
    file.close()
    fs.unlink(dest, () => {})
    console.error("Download failed:", err.message)
    process.exit(1)
  })
