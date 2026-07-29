/** Shared text-fit for studio canvas + LyricStage output/simulation. */

import { resolveSizeMode } from './sizeMode'

export type FitTextOptions = {
  preferredPx: number
  maxWidth: number
  maxHeight: number
  minPx?: number
  wrap?: boolean
}

export type FitPhraseOptions = {
  /** Margin / safe-area box — phrase AABB must stay inside. */
  clip: HTMLElement
  /** Full stage width used by legacy vw-sized themes. */
  stageWidth?: number
  /**
   * Tema legado (sem `fillMode`) mantém os dois sentidos antigos:
   * ≤20 = % da largura do quadro; >20 = % do maior tamanho que cabe.
   * Com `fillMode` definido, este campo é só o tamanho fixo em vw.
   */
  lyricSizeVw: number
  /** PREENCHER — ver `sizeMode.ts`. Ausente = tema legado. */
  fillMode?: boolean
  /** % da área quando `fillMode === true`. */
  fillPct?: number
  rotationDeg?: number
  wrap?: boolean
  /** Title text node — phrase must never overlap this. */
  minPx?: number
}

type Box = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const GAP = 10
const PAD = 2

function isVisible(el: HTMLElement | null | undefined): el is HTMLElement {
  return Boolean(el && el.isConnected && el.getClientRects().length > 0)
}

function getBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect()
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  }
}

/** Actual rendered text bounds, independent of a width:100% line box. */
function textBox(el: HTMLElement): Box | null {
  try {
    const range = document.createRange()
    range.selectNodeContents(el)
    const r = range.getBoundingClientRect()
    if (r.width > 0 || r.height > 0) {
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Área útil do box (client − padding). */
export function contentBoxSize(el: HTMLElement): {
  width: number
  height: number
} {
  const cs = window.getComputedStyle(el)
  const pl = parseFloat(cs.paddingLeft) || 0
  const pr = parseFloat(cs.paddingRight) || 0
  const pt = parseFloat(cs.paddingTop) || 0
  const pb = parseFloat(cs.paddingBottom) || 0
  return {
    width: Math.max(0, el.clientWidth - pl - pr),
    height: Math.max(0, el.clientHeight - pt - pb),
  }
}

/** Largura intrínseca do texto — não confundir com scrollWidth de width:100%. */
function intrinsicLineWidth(el: HTMLElement): number {
  const text = textBox(el)
  if (text && text.width > 0) return text.width
  const prev = el.style.width
  el.style.width = 'max-content'
  const w = el.getBoundingClientRect().width
  el.style.width = prev
  return w
}

function maxLineWidth(elements: HTMLElement[]): number {
  let max = 0
  for (const el of elements) {
    max = Math.max(max, intrinsicLineWidth(el))
  }
  return max
}

/**
 * Converte lyricSizeVw → px alvo.
 * ≤20 = % da largura do quadro; >20 = % do máximo que cabe.
 *
 * Em prosa com quebra, presets legados (4–5vw) também escalam com o máximo
 * medido. O vw continua como piso para não diminuir versículos longos que já
 * cabiam; 4vw usa 80% e 5vw usa 100% de maxFit, aproveitando textos curtos.
 */
export function preferredLyricPx(
  maxFitPx: number,
  stageWidth: number,
  lyricSizeVw: number,
  minPx = 12,
  wrap = false,
): number {
  const v = Number(lyricSizeVw) || 5
  if (v > 20) {
    const pct = Math.min(100, Math.max(2, v)) / 100
    return Math.max(minPx, maxFitPx * pct)
  }
  const w = Math.max(1, stageWidth)
  const legacyVwPx = (w * v) / 100
  if (!wrap) return Math.max(minPx, legacyVwPx)

  const fitScale = Math.min(1, Math.max(0.6, v / 5))
  return Math.max(
    minPx,
    Math.min(maxFitPx, Math.max(legacyVwPx, maxFitPx * fitScale)),
  )
}

function lineBlockHeight(elements: HTMLElement[]): number {
  let h = 0
  for (const el of elements) {
    const style = window.getComputedStyle(el)
    const mt = parseFloat(style.marginTop) || 0
    const mb = parseFloat(style.marginBottom) || 0
    h += el.offsetHeight + mt + mb
  }
  return h
}

/**
 * Overflow horizontal real do layout quebrado. Não usa largura intrínseca:
 * ela representa a frase sem quebra e faria a busca encolher prosa válida.
 */
function wrappedHorizontalOverflow(
  elements: HTMLElement[],
  maxWidth: number,
): boolean {
  return elements.some(
    (el) =>
      el.clientWidth > maxWidth + 1 ||
      el.scrollWidth > el.clientWidth + 1,
  )
}

function unionBox(els: HTMLElement[]): Box | null {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  let any = false
  for (const el of els) {
    if (!isVisible(el)) continue
    const r = textBox(el) || el.getBoundingClientRect()
    if (r.width <= 0 && r.height <= 0) continue
    any = true
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  }
  if (!any) return null
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

function boxesOverlap(a: Box, b: Box, gap = GAP): boolean {
  return (
    a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.top < b.bottom + gap &&
    a.bottom > b.top - gap
  )
}

function outsideClip(box: Box, clip: Box, pad = PAD): boolean {
  return (
    box.left < clip.left - pad ||
    box.right > clip.right + pad ||
    box.top < clip.top - pad ||
    box.bottom > clip.bottom + pad
  )
}

/** Actual title/artist text bounds, excluding wide drag/layout wrappers. */
function avoidBox(avoid: HTMLElement | null): Box | null {
  if (!avoid || !isVisible(avoid)) return null
  const inner = Array.from(
    avoid.querySelectorAll<HTMLElement>(
      '.fitted-theme-title, .lyric-stage-title, .lyric-stage-artist',
    ),
  )
  const innerBox = unionBox(inner)
  if (innerBox) return innerBox
  return textBox(avoid) || getBox(avoid)
}

function setNudge(el: HTMLElement, nx: number, ny: number) {
  el.style.setProperty('--theme-fit-nx', `${nx}px`)
  el.style.setProperty('--theme-fit-ny', `${ny}px`)
}

function clearNudge(el: HTMLElement) {
  setNudge(el, 0, 0)
}

/**
 * Maior font-size ≤ preferred que faz as linhas caberem no box.
 */
export function fitElementsToBox(
  elements: HTMLElement[],
  _measureRoot: HTMLElement,
  opts: FitTextOptions,
): number {
  if (!elements.length || opts.maxWidth < 8 || opts.maxHeight < 8) {
    return opts.minPx ?? 8
  }

  const minPx = Math.max(6, opts.minPx ?? 8)
  const preferred = Math.max(minPx, opts.preferredPx)
  const maxW = opts.maxWidth
  const maxH = opts.maxHeight
  const wrap = Boolean(opts.wrap)

  const prev = elements.map((el) => ({
    fontSize: el.style.fontSize,
    whiteSpace: el.style.whiteSpace,
    overflowWrap: el.style.overflowWrap,
    wordBreak: el.style.wordBreak,
  }))

  const apply = (px: number) => {
    const v = `${px}px`
    for (const el of elements) {
      el.style.fontSize = v
      if (wrap) {
        el.style.whiteSpace = 'pre-wrap'
        el.style.overflowWrap = 'break-word'
        el.style.wordBreak = 'normal'
      } else {
        el.style.whiteSpace = 'nowrap'
        el.style.overflowWrap = 'normal'
        el.style.wordBreak = 'normal'
      }
    }
  }

  const overflows = () => {
    // Wrapped prose is laid out at the element width. Its unwrapped intrinsic
    // width is not a fit constraint; height captures the resulting line flow.
    if (!wrap && maxLineWidth(elements) > maxW + 1) return true
    if (wrap && wrappedHorizontalOverflow(elements, maxW)) return true
    return lineBlockHeight(elements) > maxH + 1
  }

  try {
    apply(preferred)
    if (!overflows()) return preferred

    let lo = minPx
    let hi = preferred
    let best = minPx
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2
      apply(mid)
      if (overflows()) hi = mid
      else {
        best = mid
        lo = mid
      }
    }
    apply(best)
    return best
  } catch {
    for (let i = 0; i < elements.length; i++) {
      elements[i].style.fontSize = prev[i].fontSize
      elements[i].style.whiteSpace = prev[i].whiteSpace
      elements[i].style.overflowWrap = prev[i].overflowWrap
      elements[i].style.wordBreak = prev[i].wordBreak
    }
    return minPx
  }
}

function phraseBounds(
  lineEls: HTMLElement[],
  measureRoot: HTMLElement,
): Box | null {
  const fromLines = unionBox(lineEls)
  if (fromLines && fromLines.width > 0 && fromLines.height > 0) return fromLines
  if (isVisible(measureRoot)) return getBox(measureRoot)
  return null
}

/**
 * A slot uses its own transformed phrase node as the clip element. Measure the
 * slot's layout box without that phrase transform, then restore it.
 */
function clipBox(clip: HTMLElement, measureRoot: HTMLElement): Box {
  if (clip !== measureRoot || window.getComputedStyle(clip).transform === 'none') {
    return getBox(clip)
  }
  const previous = clip.style.transform
  try {
    clip.style.transform = 'none'
    return getBox(clip)
  } finally {
    clip.style.transform = previous
  }
}

function violatesHardLimits(
  lineEls: HTMLElement[],
  measureRoot: HTMLElement,
  clip: Box,
  avoid: HTMLElement | null,
): boolean {
  const box = phraseBounds(lineEls, measureRoot)
  if (!box) return false
  if (outsideClip(box, clip)) return true
  const a = avoidBox(avoid)
  if (a && boxesOverlap(box, a)) return true
  return false
}

/** Push phrase inside region / clear of title via --theme-fit-nx/ny. */
function nudgePhrase(
  measureRoot: HTMLElement,
  lineEls: HTMLElement[],
  clip: Box,
  avoid: HTMLElement | null,
): void {
  const box = phraseBounds(lineEls, measureRoot)
  if (!box) return

  let dx = 0
  let dy = 0

  if (box.left < clip.left) dx += clip.left - box.left
  if (box.right > clip.right) dx -= box.right - clip.right
  if (box.top < clip.top) dy += clip.top - box.top
  if (box.bottom > clip.bottom) dy -= box.bottom - clip.bottom

  const a = avoidBox(avoid)
  if (a) {
    const next = {
      left: box.left + dx,
      top: box.top + dy,
      right: box.right + dx,
      bottom: box.bottom + dy,
      width: box.width,
      height: box.height,
    }
    if (boxesOverlap(next, a)) {
      const pushDown = a.bottom + GAP - next.top
      const pushUp = next.bottom - (a.top - GAP)
      dy += pushDown <= pushUp ? pushDown : -pushUp
    }
  }

  const after = {
    left: box.left + dx,
    top: box.top + dy,
    right: box.right + dx,
    bottom: box.bottom + dy,
  }
  if (after.left < clip.left) dx += clip.left - after.left
  if (after.right > clip.right) dx -= after.right - clip.right
  if (after.top < clip.top) dy += clip.top - after.top
  if (after.bottom > clip.bottom) dy -= after.bottom - clip.bottom

  if (dx || dy) setNudge(measureRoot, dx, dy)
}

/**
 * Encaixa a frase no quadro.
 * lyricSizeVw ≤20 → vw do quadro; >20 → % do máximo que cabe.
 */
export function fitPhraseLines(
  lineEls: HTMLElement[],
  measureRoot: HTMLElement,
  opts: FitPhraseOptions,
): boolean {
  if (!lineEls.length || !measureRoot.isConnected || !opts.clip?.isConnected) {
    return false
  }

  const clipEl = opts.clip
  if (clipEl.clientWidth < 8 || clipEl.clientHeight < 8) return false

  clearNudge(measureRoot)

  const wrap = Boolean(opts.wrap)
  const stageWidth = Math.max(Number(opts.stageWidth) || clipEl.clientWidth, 1)
  const scaledDefaultMin = (stageWidth * (wrap ? 14 : 12)) / 1920
  const minPx = Math.max(4, opts.minPx ?? scaledDefaultMin)
  const clip = clipBox(clipEl, measureRoot)
  // O título NÃO entra na conta. Descontar a área dele daqui fazia o tamanho
  // e a posição da letra dependerem de onde o título está — o tema deixava de
  // ser reproduzido fielmente. A letra usa a caixa de texto do tema inteira;
  // o que não couber é problema do repartidor, não deste cálculo.
  const allowed = { ...clip }

  const maxW = Math.max(8, allowed.width - (wrap ? 0 : 4))
  const maxH = Math.max(8, allowed.height - 4)

  const ceiling = Math.max(
    minPx,
    Math.min(maxH * 0.95, maxW * 0.45, clipEl.clientHeight * 0.8, 480),
  )

  const applySize = (px: number) => {
    const v = `${Math.max(minPx, px)}px`
    for (const el of lineEls) {
      el.style.fontSize = v
      if (wrap) {
        el.style.whiteSpace = 'pre-wrap'
        el.style.overflowWrap = 'break-word'
        el.style.wordBreak = 'normal'
      } else {
        el.style.whiteSpace = 'nowrap'
        el.style.overflowWrap = 'normal'
        el.style.wordBreak = 'normal'
      }
    }
  }

  const softOverflow = () => {
    // In wrap mode the line boxes already own the available width. Measuring
    // their nowrap/intrinsic width would shrink prose before it can reflow.
    if (!wrap && maxLineWidth(lineEls) > maxW + 1) return true
    if (wrap && wrappedHorizontalOverflow(lineEls, maxW)) return true
    return lineBlockHeight(lineEls) > maxH + 1
  }

  const hardOverflow = () =>
    violatesHardLimits(lineEls, measureRoot, clip, null)

  // 1) Maior tamanho que ainda cabe (soft)
  applySize(ceiling)
  void measureRoot.offsetWidth
  let maxFit = minPx
  if (!softOverflow()) {
    maxFit = ceiling
  } else {
    let lo = minPx
    let hi = ceiling
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2
      applySize(mid)
      void measureRoot.offsetWidth
      if (softOverflow()) hi = mid
      else {
        maxFit = mid
        lo = mid
      }
    }
  }

  // 2) Tamanho alvo do tema, conforme o modo (ver sizeMode.ts)
  const mode = resolveSizeMode(opts)
  let target: number
  if (mode.kind === 'fixed') {
    // Fixo respeita o tamanho do tema mesmo se transbordar: quem resolve o
    // excedente é o repartidor (splitText), criando um slide novo. Encolher
    // aqui devolveria justamente o problema de legibilidade que o modo fixo
    // existe para resolver.
    target = Math.max(minPx, (Math.max(1, stageWidth) * mode.vw) / 100)
  } else if (mode.kind === 'fill') {
    target = Math.max(minPx, maxFit * (mode.pct / 100))
  } else {
    target = Math.min(
      maxFit,
      preferredLyricPx(maxFit, stageWidth, opts.lyricSizeVw, minPx, wrap),
    )
  }

  const placeAt = (px: number): boolean => {
    clearNudge(measureRoot)
    applySize(px)
    void measureRoot.offsetWidth
    const softOk = !softOverflow()
    if (hardOverflow()) {
      nudgePhrase(measureRoot, lineEls, clip, null)
      void measureRoot.offsetWidth
    }
    return softOk && !hardOverflow()
  }

  // 3) Nudge; if transformed bounds still fail, find the largest hard fit.
  //    No modo fixo não há busca por tamanho menor: o tamanho é o do tema, e
  //    o transbordo é responsabilidade do repartidor.
  if (mode.kind === 'fixed') {
    placeAt(target)
    return true
  }
  if (!placeAt(target)) {
    let lo = minPx
    let hi = target
    let best = minPx
    if (placeAt(minPx)) {
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2
        if (placeAt(mid)) {
          best = mid
          lo = mid
        } else {
          hi = mid
        }
      }
      placeAt(best)
    }
  }

  return true
}

/** Título: titleSizeVw em % da largura do container (vw/cqw). */
export function preferredTitlePx(
  containerWidth: number,
  titleSizeVw: number,
): number {
  const w = Math.max(1, containerWidth)
  const pct = Math.min(20, Math.max(0.4, Number(titleSizeVw) || 1.5))
  return (pct / 100) * w
}
