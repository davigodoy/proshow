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
    case 'aurora':
      drawAurora(ctx, width, height, freqs, time, hud)
      break
    case 'horizon':
      drawHorizon(ctx, width, height, freqs, time, hud)
      break
    case 'halo':
      drawHalo(ctx, width, height, freqs, time, hud)
      break
    case 'ember':
      drawEmber(ctx, width, height, freqs, time, hud)
      break
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
      drawAurora(ctx, width, height, freqs, time, hud)
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

function bandAt(freqs: Uint8Array, t: number) {
  const idx = Math.min(
    freqs.length - 1,
    Math.max(0, Math.floor(t * (freqs.length - 1))),
  )
  return freqs[idx] / 255
}

/** Véus verticais que preenchem o quadro (fundo) ou faixas horizontais (barra). */
function drawAurora(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freqs: Uint8Array,
  time: number,
  hud: boolean,
) {
  const bass = bassEnergy(freqs)
  const mid = midEnergy(freqs)
  const curtains = hud ? 14 : 22

  if (!hud) {
    const wash = ctx.createLinearGradient(0, 0, 0, h)
    wash.addColorStop(0, `rgba(40, 30, 90, ${0.12 + bass * 0.18})`)
    wash.addColorStop(0.45, `rgba(20, 60, 110, ${0.08 + mid * 0.12})`)
    wash.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)
  }

  for (let i = 0; i < curtains; i++) {
    const t = i / Math.max(1, curtains - 1)
    const v = bandAt(freqs, t * 0.85)
    const sway =
      Math.sin(time * 0.0009 + i * 0.55) * (hud ? 0.04 : 0.08) +
      Math.sin(time * 0.0017 + i * 0.31) * 0.03
    const hue = 195 + t * 70 + bass * 25
    const alpha = 0.12 + v * (hud ? 0.55 : 0.42) + bass * 0.08

    if (hud) {
      const y = h * (0.15 + t * 0.7 + sway * 0.5)
      const thick = Math.max(2, h * (0.04 + v * 0.14))
      const grad = ctx.createLinearGradient(0, y - thick, 0, y + thick)
      grad.addColorStop(0, `hsla(${hue}, 80%, 70%, 0)`)
      grad.addColorStop(0.5, `hsla(${hue}, 85%, 68%, ${alpha})`)
      grad.addColorStop(1, `hsla(${hue + 20}, 80%, 70%, 0)`)
      ctx.fillStyle = grad
      ctx.fillRect(0, y - thick, w, thick * 2)
    } else {
      const x = w * (t + sway)
      const thick = Math.max(8, w * (0.035 + v * 0.07 + bass * 0.02))
      const grad = ctx.createLinearGradient(x - thick, 0, x + thick, 0)
      grad.addColorStop(0, `hsla(${hue}, 75%, 65%, 0)`)
      grad.addColorStop(0.5, `hsla(${hue}, 85%, 70%, ${alpha})`)
      grad.addColorStop(1, `hsla(${hue + 25}, 80%, 68%, 0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      const topBend = Math.sin(time * 0.0012 + i) * w * 0.02
      ctx.moveTo(x - thick + topBend, 0)
      ctx.quadraticCurveTo(
        x + Math.sin(time * 0.001 + i * 0.4) * thick,
        h * 0.45,
        x - thick * 0.6,
        h,
      )
      ctx.lineTo(x + thick * 0.6, h)
      ctx.quadraticCurveTo(
        x + thick,
        h * 0.45,
        x + thick + topBend,
        0,
      )
      ctx.closePath()
      ctx.fill()
    }
  }

  ctx.shadowBlur = hud ? 6 : 18
  ctx.shadowColor = 'rgba(160, 210, 255, 0.45)'
  ctx.strokeStyle = `rgba(200, 230, 255, ${0.15 + mid * 0.35})`
  ctx.lineWidth = hud ? 1.2 : 2
  ctx.beginPath()
  const pts = hud ? 40 : 72
  for (let i = 0; i <= pts; i++) {
    const t = i / pts
    const v = bandAt(freqs, t * 0.7)
    const x = t * w
    const y =
      h *
      (hud ? 0.55 : 0.62) -
      v * h * (hud ? 0.35 : 0.28) *
        (0.6 + 0.4 * Math.sin(time * 0.002 + i * 0.15))
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}

/** Horizonte / montanhas preenchidas — comunica energia e ocupa área. */
function drawHorizon(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freqs: Uint8Array,
  time: number,
  hud: boolean,
) {
  const bass = bassEnergy(freqs)
  const layers = hud ? 2 : 3
  const baseY = hud ? h * 0.92 : h * 0.96

  for (let layer = layers - 1; layer >= 0; layer--) {
    const depth = layer / Math.max(1, layers - 1)
    const points = hud ? 36 : 64
    const step = Math.max(1, Math.floor(freqs.length / points))
    const amp = h * (hud ? 0.55 : 0.62 - depth * 0.12) * (0.75 + bass * 0.35)
    const hue = 28 + depth * 40 + (1 - depth) * 30

    ctx.beginPath()
    ctx.moveTo(0, h)
    ctx.lineTo(0, baseY)
    for (let i = 0; i <= points; i++) {
      const idx = Math.min(freqs.length - 1, i * step)
      const v = freqs[idx] / 255
      const x = (i / points) * w
      const wave =
        0.55 +
        0.25 * Math.sin(time * 0.0011 + i * 0.18 + layer) +
        0.2 * Math.sin(time * 0.0006 + i * 0.07)
      const y = baseY - v * amp * wave * (0.65 + (1 - depth) * 0.45)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, baseY)
    ctx.lineTo(w, h)
    ctx.closePath()

    const grad = ctx.createLinearGradient(0, h * (hud ? 0.2 : 0.25), 0, h)
    grad.addColorStop(
      0,
      `hsla(${hue}, 85%, ${62 - depth * 8}%, ${0.35 + (1 - depth) * 0.35})`,
    )
    grad.addColorStop(
      0.55,
      `hsla(${hue + 25}, 70%, 45%, ${0.28 + bass * 0.2})`,
    )
    grad.addColorStop(1, `hsla(${hue + 40}, 60%, 20%, ${0.08 + depth * 0.1})`)
    ctx.fillStyle = grad
    ctx.fill()

    ctx.strokeStyle = `hsla(${hue + 10}, 90%, 75%, ${0.25 + (1 - depth) * 0.35})`
    ctx.lineWidth = hud ? 1.25 : 2
    ctx.shadowBlur = hud ? 4 : 14
    ctx.shadowColor = `hsla(${hue}, 90%, 70%, 0.55)`
    ctx.beginPath()
    for (let i = 0; i <= points; i++) {
      const idx = Math.min(freqs.length - 1, i * step)
      const v = freqs[idx] / 255
      const x = (i / points) * w
      const wave =
        0.55 +
        0.25 * Math.sin(time * 0.0011 + i * 0.18 + layer) +
        0.2 * Math.sin(time * 0.0006 + i * 0.07)
      const y = baseY - v * amp * wave * (0.65 + (1 - depth) * 0.45)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  if (!hud) {
    const glow = ctx.createRadialGradient(
      w * 0.5,
      h * 0.78,
      10,
      w * 0.5,
      h * 0.78,
      h * 0.55,
    )
    glow.addColorStop(0, `rgba(255, 200, 120, ${0.08 + bass * 0.18})`)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)
  }
}

/** Raios / pétalas de luz — lê bem em fundo e vira leque na barra. */
function drawHalo(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freqs: Uint8Array,
  time: number,
  hud: boolean,
) {
  const bass = bassEnergy(freqs)
  const mid = midEnergy(freqs)
  const cx = w * 0.5
  const cy = hud ? h * 0.95 : h * 0.88
  const rays = hud ? 28 : 48
  const maxLen = Math.min(w, h) * (hud ? 0.95 : 1.05)

  if (!hud) {
    const core = ctx.createRadialGradient(cx, cy, 4, cx, cy, maxLen * 0.55)
    core.addColorStop(0, `rgba(255, 230, 180, ${0.2 + bass * 0.35})`)
    core.addColorStop(0.35, `rgba(180, 140, 255, ${0.1 + mid * 0.15})`)
    core.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = core
    ctx.fillRect(0, 0, w, h)
  }

  ctx.save()
  ctx.translate(cx, cy)
  for (let i = 0; i < rays; i++) {
    const t = i / rays
    const v = bandAt(freqs, t * 0.9)
    const angle = -Math.PI + t * Math.PI + Math.sin(time * 0.0008 + i) * 0.03
    const len = maxLen * (0.28 + v * 0.72) * (0.85 + bass * 0.2)
    const spread = (hud ? 0.035 : 0.028) + v * 0.02
    const hue = 35 + t * 50 + mid * 30

    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(
      Math.cos(angle - spread) * len,
      Math.sin(angle - spread) * len,
    )
    ctx.lineTo(
      Math.cos(angle + spread) * len,
      Math.sin(angle + spread) * len,
    )
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, 0, Math.cos(angle) * len, Math.sin(angle) * len)
    grad.addColorStop(0, `hsla(${hue}, 90%, 75%, ${0.35 + v * 0.45})`)
    grad.addColorStop(0.55, `hsla(${hue + 25}, 80%, 60%, ${0.12 + v * 0.25})`)
    grad.addColorStop(1, `hsla(${hue + 40}, 70%, 50%, 0)`)
    ctx.fillStyle = grad
    ctx.fill()
  }
  ctx.restore()

  ctx.beginPath()
  ctx.arc(cx, cy, (hud ? 6 : 14) + bass * (hud ? 8 : 22), 0, Math.PI * 2)
  ctx.fillStyle = `rgba(255, 240, 210, ${0.35 + bass * 0.4})`
  ctx.shadowBlur = hud ? 10 : 28
  ctx.shadowColor = 'rgba(255, 200, 120, 0.8)'
  ctx.fill()
  ctx.shadowBlur = 0
}

type EmberCol = { x: number; life: number; hue: number }

const emberSparks: Particle[] = []
const emberCols: EmberCol[] = []

/** Colunas quentes + brasas — atmosfera de culto / preenchimento vertical. */
function drawEmber(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freqs: Uint8Array,
  time: number,
  hud: boolean,
) {
  const bass = bassEnergy(freqs)
  const mid = midEnergy(freqs)
  const cols = hud ? 20 : 36

  if (emberCols.length !== cols) {
    emberCols.length = 0
    for (let i = 0; i < cols; i++) {
      emberCols.push({
        x: (i + 0.5) / cols,
        life: Math.random(),
        hue: 25 + Math.random() * 35,
      })
    }
  }

  if (!hud) {
    const floor = ctx.createLinearGradient(0, h * 0.45, 0, h)
    floor.addColorStop(0, 'rgba(0,0,0,0)')
    floor.addColorStop(0.5, `rgba(80, 30, 10, ${0.1 + bass * 0.15})`)
    floor.addColorStop(1, `rgba(40, 10, 5, ${0.2 + bass * 0.25})`)
    ctx.fillStyle = floor
    ctx.fillRect(0, 0, w, h)
  }

  for (let i = 0; i < cols; i++) {
    const col = emberCols[i]
    const v = bandAt(freqs, col.x * 0.85)
    const x = col.x * w
    const height =
      h *
      (hud ? 0.75 : 0.85) *
      (0.2 + v * 0.8) *
      (0.75 + mid * 0.35 + Math.sin(time * 0.002 + i) * 0.08)
    const thick = Math.max(hud ? 3 : 6, w / cols * (0.35 + v * 0.55))
    const top = h - height
    const grad = ctx.createLinearGradient(x, h, x, top)
    grad.addColorStop(0, `hsla(${col.hue}, 95%, 55%, ${0.55 + v * 0.35})`)
    grad.addColorStop(0.45, `hsla(${col.hue + 20}, 90%, 50%, ${0.25 + v * 0.3})`)
    grad.addColorStop(1, `hsla(${col.hue + 40}, 80%, 70%, 0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x - thick * 0.55, h)
    ctx.quadraticCurveTo(
      x + Math.sin(time * 0.0015 + i) * thick * 0.4,
      top + height * 0.4,
      x - thick * 0.15,
      top,
    )
    ctx.lineTo(x + thick * 0.15, top)
    ctx.quadraticCurveTo(
      x - Math.sin(time * 0.0015 + i) * thick * 0.4,
      top + height * 0.4,
      x + thick * 0.55,
      h,
    )
    ctx.closePath()
    ctx.fill()
  }

  const spawn = hud ? 1 + Math.floor(bass * 3) : 3 + Math.floor(bass * 8)
  for (let i = 0; i < spawn; i++) {
    if (emberSparks.length > (hud ? 60 : 180)) break
    emberSparks.push({
      x: Math.random() * w,
      y: h + 2,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -(1.2 + bass * 5 + Math.random() * 2.5),
      life: 1,
    })
  }

  ctx.save()
  for (let i = emberSparks.length - 1; i >= 0; i--) {
    const p = emberSparks[i]
    p.x += p.vx + Math.sin(time * 0.003 + p.y * 0.02) * 0.15
    p.y += p.vy
    p.life -= hud ? 0.02 : 0.011
    if (p.life <= 0 || p.y < -8) {
      emberSparks.splice(i, 1)
      continue
    }
    const r = (hud ? 1.2 : 2.2) + (1 - p.life) * 1.8
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = `hsla(${25 + bass * 30}, 95%, 65%, ${p.life * 0.9})`
    ctx.shadowBlur = hud ? 5 : 14
    ctx.shadowColor = 'rgba(255, 160, 60, 0.85)'
    ctx.fill()
  }
  ctx.restore()
  ctx.shadowBlur = 0
}
