import { useEffect, useRef } from 'react'
import type { SpectrumConfig } from './types'
import { drawSpectrum } from './drawStyles'
import { useSpectrumAnalyser } from './useSpectrumAnalyser'
import './spectrum.css'

type Props = {
  config: SpectrumConfig
  cameraDeviceId?: string | null
  mediaLive?: boolean
  /** Caption visível — HUD cola ao lado */
  hasCaption?: boolean
}

export function SpectrumLayer({
  config,
  cameraDeviceId,
  mediaLive,
  hasCaption = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const freqsRef = useRef<Uint8Array | null>(null)
  const { analyser } = useSpectrumAnalyser({
    config,
    cameraDeviceId,
    mediaLive,
  })

  useEffect(() => {
    if (!config.enabled || !analyser) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    const variant = config.placement === 'hud' ? 'hud' : 'full'

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = parent.clientWidth
      const h = parent.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    const tick = (time: number) => {
      if (!running) return
      const bins = analyser.frequencyBinCount
      if (!freqsRef.current || freqsRef.current.length !== bins) {
        freqsRef.current = new Uint8Array(bins)
      }
      // TS DOM lib: getByteFrequencyData exige Uint8Array<ArrayBuffer>
      analyser.getByteFrequencyData(
        freqsRef.current as unknown as Uint8Array<ArrayBuffer>,
      )
      const cssW = canvas.clientWidth
      const cssH = canvas.clientHeight
      drawSpectrum({
        ctx,
        width: cssW,
        height: cssH,
        freqs: freqsRef.current,
        style: config.style,
        variant,
        time,
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [config.enabled, config.style, config.placement, analyser])

  if (!config.enabled) return null

  const hud = config.placement === 'hud'
  const className = [
    'spectrum-layer',
    hud ? 'is-hud' : 'is-background',
    hud && hasCaption ? 'has-caption' : '',
    hud && !hasCaption ? 'is-centered' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      style={{ opacity: config.opacity }}
      aria-hidden
    >
      <canvas ref={canvasRef} />
    </div>
  )
}
