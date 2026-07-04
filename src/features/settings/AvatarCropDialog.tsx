import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const VIEWPORT = 288 // on-screen crop square (px)
const OUTPUT = 512 // exported avatar size (px)
const MAX_ZOOM = 4

type Props = {
  /** The raw file the user picked. */
  file: File
  onCancel: () => void
  /** Fires with the square-cropped image as a PNG blob. */
  onCropped: (blob: Blob) => void
}

/**
 * Dependency-free square avatar cropper: drag to pan, slider/wheel to zoom
 * inside a circular viewport. The exported crop matches the preview exactly —
 * both derive from the same base-cover scale, zoom, and offset.
 */
export function AvatarCropDialog({ file, onCancel, onCropped }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  // Load the picked file into an Image.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => setImg(image)
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const baseScale = img ? Math.max(VIEWPORT / img.naturalWidth, VIEWPORT / img.naturalHeight) : 1
  const scale = baseScale * zoom
  const dispW = img ? img.naturalWidth * scale : 0
  const dispH = img ? img.naturalHeight * scale : 0

  // Keep the image covering the viewport (no empty gaps at the edges).
  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(VIEWPORT - dispW, x)),
      y: Math.min(0, Math.max(VIEWPORT - dispH, y)),
    }),
    [dispW, dispH],
  )

  // Center the image once it (or its display size) is known.
  useEffect(() => {
    if (!img) return
    setOffset(clamp((VIEWPORT - dispW) / 2, (VIEWPORT - dispH) / 2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img])

  function applyZoom(nextZoom: number) {
    const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom))
    const nextScale = baseScale * z
    // Keep the viewport centre pointing at the same image point.
    const cx = (-offset.x + VIEWPORT / 2) / scale
    const cy = (-offset.y + VIEWPORT / 2) / scale
    const nx = VIEWPORT / 2 - cx * nextScale
    const ny = VIEWPORT / 2 - cy * nextScale
    setZoom(z)
    const nextDispW = img!.naturalWidth * nextScale
    const nextDispH = img!.naturalHeight * nextScale
    setOffset({
      x: Math.min(0, Math.max(VIEWPORT - nextDispW, nx)),
      y: Math.min(0, Math.max(VIEWPORT - nextDispH, ny)),
    })
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.px
    const dy = e.clientY - drag.current.py
    setOffset(clamp(drag.current.ox + dx, drag.current.oy + dy))
  }
  function onPointerUp() {
    drag.current = null
  }

  async function confirm() {
    if (!img) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT
      canvas.height = OUTPUT
      const ctx = canvas.getContext('2d')!
      // Source rect (natural px) that currently fills the viewport.
      const sx = -offset.x / scale
      const sy = -offset.y / scale
      const sSize = VIEWPORT / scale
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT)
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png', 0.92))
      if (blob) onCropped(blob)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onCancel} title="Adjust photo" description="Drag to reposition, zoom to frame your face.">
      <div className="space-y-4">
        <div
          className="relative mx-auto touch-none overflow-hidden rounded-full bg-page select-none"
          style={{ width: VIEWPORT, height: VIEWPORT, cursor: drag.current ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => applyZoom(zoom - e.deltaY * 0.0015)}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: dispW, height: dispH, left: offset.x, top: offset.y }}
            />
          )}
          {/* subtle ring to frame the circle */}
          <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10" />
        </div>

        <div className="flex items-center gap-3">
          <ZoomOut className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="h-1 w-full cursor-pointer accent-accent"
            aria-label="Zoom"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-ink-muted" />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!img || busy}>
            {busy ? 'Saving…' : 'Save photo'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
