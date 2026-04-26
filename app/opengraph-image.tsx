import { ImageResponse } from "next/og"

export const alt = "controlPDF — Herramientas PDF privadas"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#0b0b0c",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div
            style={{
              width: "112px",
              height: "112px",
              borderRadius: "24px",
              backgroundColor: "#fafafa",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "64px",
              fontWeight: 700,
              color: "#0b0b0c",
              letterSpacing: "-0.04em",
            }}
          >
            P
          </div>
          <div
            style={{
              fontSize: "104px",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            controlPDF
          </div>
        </div>
        <div
          style={{
            marginTop: "44px",
            fontSize: "40px",
            color: "#a1a1aa",
            lineHeight: 1.25,
            maxWidth: "900px",
          }}
        >
          Unir, dividir, firmar, OCR y más — 100% en tu navegador.
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            gap: "16px",
            fontSize: "24px",
            color: "#71717a",
          }}
        >
          <span>Sin servidores</span>
          <span>·</span>
          <span>Sin cuentas</span>
          <span>·</span>
          <span>Sin tracking</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
