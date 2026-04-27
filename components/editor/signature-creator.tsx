"use client"

import { useEffect, useRef, useState } from "react"
import { Eraser, Type, Upload } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { renderTextSignatureToDataUrl } from "@/lib/pdf"

interface SignatureCreatorProps {
  onCreated: (dataUrl: string) => void
}

export function SignatureCreator({ onCreated }: SignatureCreatorProps) {
  return (
    <Tabs defaultValue="draw" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="draw">
          <Eraser className="h-4 w-4" />
          Dibujar
        </TabsTrigger>
        <TabsTrigger value="type">
          <Type className="h-4 w-4" />
          Tipear
        </TabsTrigger>
        <TabsTrigger value="upload">
          <Upload className="h-4 w-4" />
          Subir
        </TabsTrigger>
      </TabsList>
      <TabsContent value="draw">
        <DrawTab onCreated={onCreated} />
      </TabsContent>
      <TabsContent value="type">
        <TypeTab onCreated={onCreated} />
      </TabsContent>
      <TabsContent value="upload">
        <UploadTab onCreated={onCreated} />
      </TabsContent>
    </Tabs>
  )
}

function DrawTab({ onCreated }: { onCreated: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = "#1f2937"
    ctx.lineWidth = 3
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
  }, [])

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = getPoint(e)
  }

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext("2d")
    const p = getPoint(e)
    if (!ctx || !p || !last.current) return
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    setHasInk(true)
  }

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false
    last.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const submit = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL("image/png")
    onCreated(dataUrl)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full touch-none rounded-md"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{ aspectRatio: "3 / 1" }}
        />
      </div>
      <div className="flex justify-between gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={clear}>
              Limpiar
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Borrar todo y empezar de nuevo</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" onClick={submit} disabled={!hasInk}>
              Usar firma
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Usar este dibujo como firma</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

function TypeTab({ onCreated }: { onCreated: (dataUrl: string) => void }) {
  const [text, setText] = useState("")
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!text.trim()) {
      setPreview(null)
      return
    }
    setPreview(renderTextSignatureToDataUrl(text.trim()))
  }, [text])

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Tu firma</Label>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tu nombre"
          maxLength={40}
        />
      </div>
      <div className="rounded-md border bg-white p-2 min-h-[88px] flex items-center justify-center">
        {preview ? (
          <img
            src={preview}
            alt="Vista previa"
            className="max-h-20"
            draggable={false}
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            Escribí tu nombre para previsualizar
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              onClick={() => preview && onCreated(preview)}
              disabled={!preview}
            >
              Usar firma
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Usar este texto como firma</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

function UploadTab({ onCreated }: { onCreated: (dataUrl: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null)

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") setPreview(result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Imagen (PNG / JPG)</Label>
        <Input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </div>
      <div className="rounded-md border bg-white p-2 min-h-[88px] flex items-center justify-center">
        {preview ? (
          <img
            src={preview}
            alt="Vista previa"
            className="max-h-32"
            draggable={false}
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            Subí un PNG con fondo transparente
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              onClick={() => preview && onCreated(preview)}
              disabled={!preview}
            >
              Usar firma
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Usar esta imagen como firma</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
