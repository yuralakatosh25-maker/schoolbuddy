import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { CameraOff } from 'lucide-react'
import { useApp } from '../app/context'
import { Button, Sheet } from './ui'
import { extractToken } from '../lib/qr'

export function QrImage({ value, size = 220 }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0c0e', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
    return () => { alive = false }
  }, [value])
  return (
    <div className="rounded-2xl bg-white p-3" style={{ width: size, height: size }}>
      <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}

// Сканер QR: камера (jsQR) + ручне введення як запасний варіант
export function QrScanner({ open, onClose, onResult, title }) {
  const { t } = useApp()
  const videoRef = useRef(null)
  const [error, setError] = useState(false)
  const [manual, setManual] = useState('')

  useEffect(() => {
    if (!open) return
    let stream
    let raf
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const scan = () => {
      const video = videoRef.current
      if (stopped || !video) return
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        if (code?.data) {
          stopped = true
          onResult(extractToken(code.data))
          return
        }
      }
      raf = requestAnimationFrame(scan)
    }

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
        raf = requestAnimationFrame(scan)
      })
      .catch(() => setError(true))
      ?? setError(true)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [open, onResult])

  return (
    <Sheet open={open} onClose={onClose} title={title ?? t('scannerTitle')}>
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-black">
        {error ? (
          <div className="grid size-full place-items-center p-6 text-center text-[13px] text-muted">
            <div><CameraOff className="mx-auto mb-2 size-6" />{t('scannerNoCamera')}</div>
          </div>
        ) : (
          <>
            <video ref={videoRef} muted playsInline className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-accent/80" />
          </>
        )}
      </div>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) onResult(extractToken(manual)) }}>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t('scannerManual')} className="field" />
        <Button type="submit" variant="primary" disabled={!manual.trim()}>{t('confirm')}</Button>
      </form>
    </Sheet>
  )
}
