import type { ProjectionTheme, ThemeVertical } from './types'

/** Bases Y (% do centro da área) — título acima, letra abaixo (arraste ajusta o resto). */
export function themeBlockBases(
  vertical: ThemeVertical = 'center',
): { titleY: number; phraseY: number } {
  const bands =
    vertical === 'top'
      ? { hi: -30, lo: -6 }
      : vertical === 'bottom'
        ? { hi: 6, lo: 30 }
        : { hi: -15, lo: 15 }
  return { titleY: bands.hi, phraseY: bands.lo }
}

export function themeTitlePos(
  theme: Pick<
    ProjectionTheme,
    'vertical' | 'titleOffsetXPct' | 'titleOffsetYPct'
  >,
): { x: number; y: number } {
  const b = themeBlockBases(theme.vertical || 'center')
  return {
    x: Number(theme.titleOffsetXPct) || 0,
    y: b.titleY + (Number(theme.titleOffsetYPct) || 0),
  }
}

export function themePhrasePos(
  theme: Pick<ProjectionTheme, 'vertical' | 'offsetXPct' | 'offsetYPct'>,
): { x: number; y: number } {
  const b = themeBlockBases(theme.vertical || 'center')
  return {
    x: Number(theme.offsetXPct) || 0,
    y: b.phraseY + (Number(theme.offsetYPct) || 0),
  }
}

function clampPct(n: number, lo = -48, hi = 48) {
  return Math.max(lo, Math.min(hi, Math.round(n * 10) / 10))
}

function rectsOverlap(
  a: DOMRect,
  b: DOMRect,
  gap: number,
): boolean {
  return (
    a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.top < b.bottom + gap &&
    a.bottom > b.top - gap
  )
}

/**
 * Se há sobreposição, empurra o elemento que NÃO está sendo arrastado.
 * Prefere eixo Y; se o empurrão vertical for grande demais, usa X.
 */
export function separateOffsets(opts: {
  theme: ProjectionTheme
  dragged: 'title' | 'phrase'
  titleEl: HTMLElement
  phraseEl: HTMLElement
  /** Referência de % para o título (stage) */
  titleArea: { width: number; height: number }
  /** Referência de % para a letra (área de texto) */
  phraseArea: { width: number; height: number }
  gapPx?: number
}): Partial<
  Pick<
    ProjectionTheme,
    'titleOffsetXPct' | 'titleOffsetYPct' | 'offsetXPct' | 'offsetYPct'
  >
> | null {
  const gap = opts.gapPx ?? 12
  const tr = opts.titleEl.getBoundingClientRect()
  const pr = opts.phraseEl.getBoundingClientRect()
  if (tr.height < 1 || pr.height < 1) return null
  if (!rectsOverlap(tr, pr, gap)) return null

  const titleOx = Number(opts.theme.titleOffsetXPct) || 0
  const titleOy = Number(opts.theme.titleOffsetYPct) || 0
  const phraseOy = Number(opts.theme.offsetYPct) || 0

  const titleMidY = (tr.top + tr.bottom) / 2
  const phraseMidY = (pr.top + pr.bottom) / 2
  const titleMidX = (tr.left + tr.right) / 2
  const phraseMidX = (pr.left + pr.right) / 2

  // Quanto empurrar a letra para ficar abaixo/acima do título
  const phraseDown = tr.bottom + gap - pr.top
  const phraseUp = pr.bottom - (tr.top - gap)
  // Quanto empurrar o título para ficar abaixo/acima da letra
  const titleDown = pr.bottom + gap - tr.top
  const titleUp = tr.bottom - (pr.top - gap)

  const titleRight = pr.right + gap - tr.left
  const titleLeft = tr.right - (pr.left - gap)

  const preferY =
    Math.min(Math.abs(phraseDown), Math.abs(phraseUp)) <=
    Math.min(Math.abs(titleRight), Math.abs(titleLeft)) * 1.2

  if (opts.dragged === 'title') {
    // Letra solta sai do caminho — só no eixo Y (largura fixa da área)
    const h = Math.max(1, opts.phraseArea.height)
    const move =
      titleMidY <= phraseMidY
        ? Math.max(0, phraseDown)
        : -Math.max(0, phraseUp)
    const next = clampPct(phraseOy + (move / h) * 100)
    if (next === phraseOy) return null
    return { offsetXPct: 0, offsetYPct: next }
  }

  // Título solto sai do caminho (pode mover em X ou Y)
  const h = Math.max(1, opts.titleArea.height)
  const w = Math.max(1, opts.titleArea.width)
  if (preferY) {
    const move =
      phraseMidY <= titleMidY
        ? Math.max(0, titleDown)
        : -Math.max(0, titleUp)
    const next = clampPct(titleOy + (move / h) * 100, -50, 50)
    if (next === titleOy) return null
    return { titleOffsetYPct: next }
  }
  const move =
    phraseMidX <= titleMidX
      ? Math.max(0, titleRight)
      : -Math.max(0, titleLeft)
  const next = clampPct(titleOx + (move / w) * 100, -50, 50)
  if (next === titleOx) return null
  return { titleOffsetXPct: next }
}

/**
 * Mantém o bloco dentro de `area` (AABB).
 * Título: stage inteiro. Letra: área de texto.
 */
export function clampBlockIntoArea(opts: {
  theme: ProjectionTheme
  dragged: 'title' | 'phrase'
  el: HTMLElement
  area: HTMLElement
  /** Elemento de texto interno (opcional) — alinha o clamp ao texto real */
  textEl?: HTMLElement | null
  padPx?: number
}): Partial<
  Pick<
    ProjectionTheme,
    'titleOffsetXPct' | 'titleOffsetYPct' | 'offsetXPct' | 'offsetYPct'
  >
> | null {
  const pad = opts.padPx ?? 4
  const ar = opts.area.getBoundingClientRect()
  const er = (opts.textEl || opts.el).getBoundingClientRect()
  if (ar.width < 8 || ar.height < 8 || er.width < 1 || er.height < 1) {
    return null
  }

  let dx = 0
  let dy = 0
  if (er.left < ar.left + pad) dx = ar.left + pad - er.left
  else if (er.right > ar.right - pad) dx = ar.right - pad - er.right
  if (er.top < ar.top + pad) dy = ar.top + pad - er.top
  else if (er.bottom > ar.bottom - pad) dy = ar.bottom - pad - er.bottom

  if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return null

  const dxPct = (dx / ar.width) * 100
  const dyPct = (dy / ar.height) * 100

  if (opts.dragged === 'title') {
    return {
      titleOffsetXPct: clampPct(
        (Number(opts.theme.titleOffsetXPct) || 0) + dxPct,
        -50,
        50,
      ),
      titleOffsetYPct: clampPct(
        (Number(opts.theme.titleOffsetYPct) || 0) + dyPct,
        -50,
        50,
      ),
    }
  }
  // Letra: só eixo Y (largura = área de texto)
  if (Math.abs(dy) < 0.25) return null
  return {
    offsetXPct: 0,
    offsetYPct: clampPct((Number(opts.theme.offsetYPct) || 0) + dyPct),
  }
}
