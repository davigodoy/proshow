import type { SpectrumStyleId } from './types'

export type DrawSpectrumOpts = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  /** 0–255 frequency bins */
  freqs: Uint8Array
  style: SpectrumStyleId
  /** hud = mais compacto / menos glow */
  variant: 'full' | 'hud'
  time: number
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number }

const particles: Particle[] = []

function bassEnergy(freqs: Uint8Array) {
  let sum = 0
  const n = Math.min(12, freqs.length)
  for (let i = 0; i < n; i++) sum += freqs[i]
  return n ? sum / (n * 255) : 0
}

function midEnergy(freqs: Uint8Array) {
  let sum = 0
  const start = Math.floor(freqs.length * 0.15)
  const end = Math.floor(freqs.length * 0.45)
  for (let i = start; i < end; i++) sum += freqs[i]
  const n = Math.max(1, end - start)
  return sum / (n * 255)
}

export function drawSpectrum(opts: DrawSpectrumOpts) {
  const { ctx, width, height, freqs, style, variant, time } = opts
  ctx.clearRect(0, 0, width, height)
  const hud = variant === 'hud'
  const glow = hud ? 8 : 22

  switch (style) {
    case 'bars-neon':
      drawBars(ctx, width, height, freqs, { mirror: false, glow, hud })
      break
    case 'bars-mirror':
      drawBars(ctx, width, height, freqs, { mirror: true, glow, hud })
      break
    case 'wave-silk':
      drawWave(ctx, width, height, freqs, time, hud)
      break
    case 'radial-pulse':
      drawRadial(ctx, width, height, freqs, time, hud)
      break
    case 'mesh-3d':
      drawMesh3d(ctx, width, height, freqs, time, hud)
      break
    case 'particles':
      drawParticles(ctx, width, height, freqs, hud)
      break
    default:
      drawBars(ctx, width, height, freqs, { mirror: false, glow, hud })
  }
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freqs: Uint8Array,
  opts: { mirror: boolean; glow: number; hud: boolean },
) {
  const bars = opts.hud ? 28 : 64
  const step = Math.max(1, Math.floor(freqs.length / bars))
  const gap = opts.hud ? 2 : 3
  const barW = Math.max(2, (w - gap * bars) / bars)
  const midY = h * 0.5
  const maxH = opts.mirror ? h * 0.42 : h * 0.78
  const baseY = opts.mirror ? midY : h * 0.92

  ctx.save()
  ctx.shadowBlur = opts.glow
  ctx.shadowColor = 'rgba(120, 200, 255, 0.85)'

  for (let i = 0; i < bars; i++) {
    let v = 0
    const start = i * step
    for (let j = 0; j < step && start + j < freqs.length; j++) {
      v = Math.max(v, freqs[start + j])
    }
    const amp = (v / 255) * maxH
    const x = i * (barW + gap) + gap
    const hue = 190 + (i / bars) * 80
    ctx.fillStyle = `hsla(${hue}, 90%, 62%, 0.92)`
    if (opts.mirror) {
      ctx.fillRect(x, midY - amp, barW, amp)
      ctx.fillRect(x, midY, barW, amp)
    } else {
      ctx.fillRect(x, baseY - amp, barW, amp)
    }
  }
  ctx.restore()
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freqs: Uint8Array,
  time: number,
  hud: boolean,
) {
  const points = hud ? 48 : 96
  const step = Math.max(1, Math.floor(freqs.length / points))
  const mid = h * 0.55
  const ampScale = h * (hud ? 0.28 : 0.38)

  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let i = 0; i <= points; i++) {
    const idx = Math.min(freqs.length - 1, i * step)
    const v = freqs[idx] / 255
    const x = (i / points) * w
    const y =
      mid -
      v * ampScale * (0.55 + 0.45 * Math.sin(time * 0.002 + i * 0.12))
    if (i === 0) ctx.lineTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.lineTo(w, h)
  ctx.closePath()

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, 'rgba(100, 220, 255, 0.55)')
  grad.addColorStop(0.55, 'rgba(80, 140, 255, 0.28)')
  grad.addColorStop(1, 'rgba(20, 40, 80, 0.05)')
  ctx.fillStyle = grad
  ctx.fill()

  ctx.strokeStyle = 'rgba(180, 240, 255, 0.85)'
  ctx.lineWidth = hud ? 1.5 : 2.5
  ctx.shadowBlur = hud ? 6 : 16
  ctx.shadowColor = 'rgba(120, 200, 255, 0.7)'
  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const idx = Math.min(freqs.length - 1, i * step)
    const v = freqs[idx] / 255
    const x = (i / points) * w
    const y =
      mid -
      v * ampScale * (0.55 + 0.45 * Math.sin(time * 0.002 + i * 0.12))
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}

function drawRadial(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freqs: Uint8Array,
  time: number,
  hud: boolean,
) {
  const cx = w * 0.5
  const cy = h * 0.5
  const rings = hud ? 5 : 8
  const maxR = Math.min(w, h) * (hud ? 0.42 : 0.48)
  const bass = bassEnergy(freqs)

  for (let r = 0; r < rings; r++) {
    const t = (r + 1) / rings
    const band = freqs[Math.floor((r / rings) * freqs.length * 0.5)] / 255
    const radius = maxR * t * (0.65 + band * 0.55 + bass * 0.15)
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.strokeStyle = `hsla(${200 + r * 12 + time * 0.02}, 85%, 65%, ${0.15 + band * 0.55})`
    ctx.lineWidth = hud ? 1.5 : 2.5 + band * 3
    ctx.shadowBlur = hud ? 4 : 14
    ctx.shadowColor = 'rgba(140, 210, 255, 0.8)'
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

function drawMesh3d(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freqs: Uint8Array,
  time: number,
  hud: boolean,
) {
  const cols = hud ? 18 : 36
  const rows = hud ? 8 : 16
  const perspective = 1.55
  const horizon = h * 0.28
  const floor = h * 0.95
  const bass = bassEnergy(freqs)
  const mid = midEnergy(freqs)

  ctx.strokeStyle = 'rgba(120, 200, 255, 0.35)'
  ctx.lineWidth = hud ? 1 : 1.25
  ctx.shadowBlur = hud ? 0 : 8
  ctx.shadowColor = 'rgba(100, 180, 255, 0.5)'

  for (let row = 0; row <= rows; row++) {
    const ty = row / rows
    const y = horizon + (floor - horizon) * Math.pow(ty, perspective)
    const scale = 0.2 + ty * 0.8
    const left = w * 0.5 - (w * 0.48) * scale
    const right = w * 0.5 + (w * 0.48) * scale
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.strokeStyle = `rgba(130, 210, 255, ${0.12 + ty * 0.35})`
    ctx.stroke()
  }

  for (let col = 0; col <= cols; col++) {
    const tx = col / cols
    ctx.beginPath()
    for (let row = 0; row <= rows; row++) {
      const ty = row / rows
      const y = horizon + (floor - horizon) * Math.pow(ty, perspective)
      const scale = 0.2 + ty * 0.8
      const freqIdx = Math.min(
        freqs.length - 1,
        Math.floor(tx * freqs.length * 0.6),
      )
      const bump =
        (freqs[freqIdx] / 255) *
        (hud ? 18 : 42) *
        (0.4 + mid) *
        Math.sin(time * 0.003 + col * 0.4 + row * 0.2)
      const x = w * 0.5 + (tx - 0.5) * w * 0.96 * scale
      const yy = y - Math.abs(bump) * (0.5 + bass)
      if (row === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.strokeStyle = `hsla(${195 + col * 2}, 90%, 70%, ${0.25 + bass * 0.4})`
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freqs: Uint8Array,
  hud: boolean,
) {
  const bass = bassEnergy(freqs)
  const spawn = hud ? 2 + Math.floor(bass * 4) : 4 + Math.floor(bass * 10)
  for (let i = 0; i < spawn; i++) {
    if (particles.length > (hud ? 80 : 220)) break
    particles.push({
      x: Math.random() * w,
      y: h + 4,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -(1.5 + bass * 6 + Math.random() * 2),
      life: 1,
    })
  }

  ctx.save()
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.life -= hud ? 0.018 : 0.012
    if (p.life <= 0 || p.y < -10) {
      particles.splice(i, 1)
      continue
    }
    const r = (hud ? 1.5 : 2.5) + (1 - p.life) * 2
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = `hsla(${200 + bass * 40}, 90%, 70%, ${p.life * 0.85})`
    ctx.shadowBlur = hud ? 4 : 12
    ctx.shadowColor = 'rgba(140, 220, 255, 0.9)'
    ctx.fill()
  }
  ctx.restore()
  ctx.shadowBlur = 0
}
