import {
  selectCompositionTemplate,
  isShortSupport,
} from '../artistic/composition/index.ts'
import type { CompositionSlot } from '../artistic/composition/index.ts'
import { findRecipe } from '../artistic/motion/contract.ts'

export type ArtisticPhase = 1 | 2 | 3
export type ArtisticAlign = 'left' | 'center' | 'right'
export type ArtisticOrientation = 'landscape' | 'portrait-stack'
export type ArtisticAnchor =
  | 'tl'
  | 'tr'
  | 'bl'
  | 'br'
  | 'edge-left'
  | 'edge-right'
  | 'none'
export type ArtisticExitMode = 'block' | 'individual'
export type ArtisticEnterEffect =
  | 'stamp'
  | 'slam'
  | 'punch'
  | 'fade'
  | 'slide-up'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'soft-rise'
export type ArtisticExitEffect =
  | 'fade'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'zoom'

export type ArtisticWord = {
  text: string
  keyword: boolean
}

export type ArtisticBlock = {
  id: string
  words: ArtisticWord[]
  keyword: boolean
  /** Empilha o bloco em linha própria (cartaz / bloco quadrado). */
  fullLine: boolean
  /**
   * Após este bloco, força fileira nova no flex (ritmo ~2 pedaços/linha).
   * Independente da largura da caixa — mesma quebra em herói e apoio.
   */
  breakAfter?: boolean
  scale: number
  weight: number
  /** Cor própria do bloco. Ausente = herda a cor de letra do tema. */
  color?: string
  /** Fonte própria do bloco. Ausente = herda a fonte da frase/tema. */
  fontFamily?: string
  exitEffect: ArtisticExitEffect
  exitDelayMs: number
}

export type ArtisticPhraseTarget = {
  x: number
  y: number
  width: number
  height: number
  fontVw: number
  rotationDeg: number
  align: ArtisticAlign
  zIndex: number
  hero: boolean
  stamp: boolean
  /** 1 = foco (hero); support < 1 para ceder atenção visual. */
  opacity: number
  /**
   * Orientação da frase no estado atual. 'portrait-stack' = coluna estreita de
   * PALAVRAS legíveis na horizontal (uma palavra de conteúdo por linha), NÃO
   * glifos girados 90°. Consumido pelo LyricStage (classe is-portrait-stack).
   */
  orientation?: ArtisticOrientation
  /** Canto/borda a que a frase se ancora (coluna retrato cede o canto). */
  anchor?: ArtisticAnchor
  /** Dica de receita de movimento (ex.: 'pivot-canto' para apoio retrato). */
  motionRecipeHint?: string
}

export type ArtisticPhrasePlan = {
  id: string
  text: string
  enterEffect: ArtisticEnterEffect
  /** Pisca no pouso da entrada (~aleatório). */
  landBlink: boolean
  blocks: ArtisticBlock[]
  targets: Partial<Record<ArtisticPhase, ArtisticPhraseTarget>>
}

export type ArtisticLayoutPlan = {
  version: 1
  seed: number
  variationId: ArtisticVariationId
  phase: ArtisticPhase
  exitMode: ArtisticExitMode
  phrases: ArtisticPhrasePlan[]
  /** A composição inicial foi trocada por uma variação artística conservadora. */
  recovered: boolean
  recoveryReason?: string
}

export type Rect = [x: number, y: number, width: number, height: number]
type Flow = 'horizontal' | 'vertical' | 'diagonal' | 'radial'

type Grammar = {
  id: string
  regions: [Rect, Rect, Rect]
  readingOrder: string
  scale: [number, number, number]
  align: [ArtisticAlign, ArtisticAlign, ArtisticAlign]
  flow: Flow
  stampFinal: boolean
}

const r = (x: number, y: number, width: number, height: number): Rect => [
  x,
  y,
  width,
  height,
]

/**
 * Regiões normalizadas à safe area. As duas primeiras regiões não se
 * sobrepõem; a terceira fica livre para funcionar como carimbo.
 */
export const ARTISTIC_VARIATIONS = [
  { id: 'z-path', regions: [r(2, 3, 57, 27), r(41, 36, 57, 27), r(2, 70, 57, 27)], readingOrder: 'z', scale: [1.05, 0.92, 1.02], align: ['left', 'right', 'left'], flow: 'diagonal', stampFinal: false },
  { id: 'staircase-down', regions: [r(2, 3, 62, 27), r(19, 36, 62, 27), r(36, 70, 62, 27)], readingOrder: 'down-right', scale: [1.06, 0.95, 0.88], align: ['left', 'center', 'right'], flow: 'diagonal', stampFinal: false },
  { id: 'staircase-up', regions: [r(36, 3, 62, 27), r(19, 36, 62, 27), r(2, 70, 62, 27)], readingOrder: 'down-left', scale: [0.92, 0.98, 1.08], align: ['right', 'center', 'left'], flow: 'diagonal', stampFinal: false },
  { id: 'diagonal-tl-br', regions: [r(2, 2, 49, 28), r(25, 36, 50, 27), r(49, 70, 49, 28)], readingOrder: 'tl-br', scale: [1.08, 0.94, 1], align: ['left', 'center', 'right'], flow: 'diagonal', stampFinal: false },
  { id: 'diagonal-tr-bl', regions: [r(49, 2, 49, 28), r(25, 36, 50, 27), r(2, 70, 49, 28)], readingOrder: 'tr-bl', scale: [1.02, 0.94, 1.08], align: ['right', 'center', 'left'], flow: 'diagonal', stampFinal: false },
  { id: 'columns-2-left-heavy', regions: [r(2, 3, 57, 43), r(62, 3, 36, 43), r(32, 53, 66, 44)], readingOrder: 'wide-left', scale: [1.08, 0.88, 0.98], align: ['left', 'right', 'right'], flow: 'horizontal', stampFinal: false },
  { id: 'columns-2-right-heavy', regions: [r(2, 3, 36, 43), r(41, 3, 57, 43), r(2, 53, 66, 44)], readingOrder: 'wide-right', scale: [0.88, 1.08, 0.98], align: ['left', 'right', 'left'], flow: 'horizontal', stampFinal: false },
  { id: 'corner-tl-br-stamp', regions: [r(2, 2, 53, 31), r(43, 39, 55, 31), r(4, 73, 50, 25)], readingOrder: 'opposite-corners', scale: [1.08, 0.94, 1.03], align: ['left', 'right', 'left'], flow: 'diagonal', stampFinal: true },
  { id: 'corner-tr-bl-stamp', regions: [r(45, 2, 53, 31), r(2, 39, 55, 31), r(46, 73, 50, 25)], readingOrder: 'opposite-corners-reverse', scale: [1.08, 0.94, 1.03], align: ['right', 'left', 'right'], flow: 'diagonal', stampFinal: true },
  { id: 'center-burst', regions: [r(3, 3, 43, 34), r(54, 3, 43, 34), r(17, 48, 66, 49)], readingOrder: 'inward-down', scale: [0.92, 0.92, 1.12], align: ['left', 'right', 'center'], flow: 'radial', stampFinal: true },
  { id: 'top-banner-then-stack', regions: [r(2, 2, 96, 28), r(2, 36, 47, 61), r(53, 36, 45, 61)], readingOrder: 'banner-columns', scale: [1.08, 0.9, 0.98], align: ['center', 'left', 'right'], flow: 'vertical', stampFinal: false },
  { id: 'bottom-anchor-stamp', regions: [r(2, 2, 47, 43), r(52, 2, 46, 43), r(12, 57, 76, 40)], readingOrder: 'top-pair-anchor', scale: [0.94, 0.94, 1.12], align: ['left', 'right', 'center'], flow: 'vertical', stampFinal: true },
  { id: 'left-rail-cascade', regions: [r(2, 2, 34, 45), r(39, 2, 59, 45), r(20, 54, 78, 43)], readingOrder: 'left-rail', scale: [0.9, 1.05, 0.98], align: ['left', 'left', 'right'], flow: 'horizontal', stampFinal: false },
  { id: 'right-rail-cascade', regions: [r(64, 2, 34, 45), r(2, 2, 59, 45), r(2, 54, 78, 43)], readingOrder: 'right-rail', scale: [0.9, 1.05, 0.98], align: ['right', 'right', 'left'], flow: 'horizontal', stampFinal: false },
  { id: 'sandwich-mid-hero', regions: [r(5, 2, 90, 23), r(2, 30, 96, 43), r(10, 78, 80, 20)], readingOrder: 'hero-middle', scale: [0.86, 1.14, 0.9], align: ['left', 'center', 'right'], flow: 'vertical', stampFinal: false },
  { id: 'tetris-L', regions: [r(2, 2, 39, 43), r(2, 51, 39, 46), r(45, 2, 53, 95)], readingOrder: 'l-shape', scale: [0.92, 0.98, 1.06], align: ['left', 'left', 'right'], flow: 'horizontal', stampFinal: false },
  { id: 'tetris-T', regions: [r(2, 2, 46, 36), r(52, 2, 46, 36), r(22, 45, 56, 52)], readingOrder: 't-shape', scale: [0.94, 0.94, 1.08], align: ['left', 'right', 'center'], flow: 'vertical', stampFinal: true },
  { id: 'tetris-S', regions: [r(35, 2, 63, 30), r(2, 36, 62, 29), r(35, 69, 63, 29)], readingOrder: 's-shape', scale: [1, 0.94, 1.04], align: ['right', 'left', 'right'], flow: 'diagonal', stampFinal: false },
  { id: 'tetris-Z', regions: [r(2, 2, 63, 30), r(36, 36, 62, 29), r(2, 69, 63, 29)], readingOrder: 'z-shape', scale: [1, 0.94, 1.04], align: ['left', 'right', 'left'], flow: 'diagonal', stampFinal: false },
  { id: 'tetris-square-pack', regions: [r(2, 2, 47, 95), r(53, 2, 45, 45), r(53, 54, 45, 43)], readingOrder: 'square-pack', scale: [1.06, 0.92, 0.98], align: ['left', 'right', 'right'], flow: 'horizontal', stampFinal: false },
  { id: 'word-river-horizontal', regions: [r(2, 5, 72, 26), r(26, 37, 72, 26), r(2, 69, 72, 26)], readingOrder: 'horizontal-river', scale: [1.04, 0.94, 1], align: ['left', 'right', 'left'], flow: 'horizontal', stampFinal: false },
  { id: 'word-river-vertical-ish', regions: [r(2, 2, 38, 28), r(31, 36, 38, 28), r(60, 70, 38, 28)], readingOrder: 'soft-vertical-river', scale: [1, 0.94, 1.04], align: ['left', 'center', 'right'], flow: 'diagonal', stampFinal: false },
  { id: 'keyword-hero-center', regions: [r(2, 2, 40, 35), r(58, 2, 40, 35), r(12, 43, 76, 54)], readingOrder: 'keyword-center', scale: [0.9, 0.9, 1.14], align: ['left', 'right', 'center'], flow: 'radial', stampFinal: true },
  { id: 'keyword-hero-left', regions: [r(2, 2, 58, 47), r(64, 2, 34, 47), r(2, 56, 75, 41)], readingOrder: 'keyword-left', scale: [1.12, 0.86, 1], align: ['left', 'right', 'left'], flow: 'horizontal', stampFinal: true },
  { id: 'keyword-hero-right', regions: [r(40, 2, 58, 47), r(2, 2, 34, 47), r(23, 56, 75, 41)], readingOrder: 'keyword-right', scale: [1.12, 0.86, 1], align: ['right', 'left', 'right'], flow: 'horizontal', stampFinal: true },
  { id: 'echo-repeat-offset', regions: [r(2, 2, 64, 29), r(34, 36, 64, 29), r(12, 69, 76, 29)], readingOrder: 'echo-offset', scale: [1.04, 0.92, 1.08], align: ['left', 'right', 'center'], flow: 'diagonal', stampFinal: true },
  { id: 'stamp-final-only', regions: [r(2, 2, 47, 42), r(51, 2, 47, 42), r(10, 53, 80, 44)], readingOrder: 'pair-then-stamp', scale: [0.94, 0.94, 1.14], align: ['left', 'right', 'center'], flow: 'vertical', stampFinal: true },
  { id: 'no-stamp-safe-grid', regions: [r(2, 2, 96, 28), r(2, 36, 47, 61), r(51, 36, 47, 61)], readingOrder: 'safe-grid', scale: [1.04, 0.96, 0.96], align: ['center', 'left', 'right'], flow: 'vertical', stampFinal: false },
  { id: 'asymmetric-big-small-big', regions: [r(2, 2, 68, 30), r(73, 2, 25, 30), r(14, 39, 84, 58)], readingOrder: 'big-small-big', scale: [1.08, 0.84, 1.1], align: ['left', 'right', 'right'], flow: 'horizontal', stampFinal: false },
  { id: 'dense-fill-balanced', regions: [r(2, 2, 47, 45), r(53, 2, 45, 45), r(12, 53, 76, 44)], readingOrder: 'balanced-fill', scale: [1, 1, 1.04], align: ['left', 'right', 'center'], flow: 'radial', stampFinal: false },
  { id: 'sparse-editorial', regions: [r(2, 2, 55, 24), r(43, 39, 55, 24), r(2, 74, 70, 24)], readingOrder: 'editorial-air', scale: [1.08, 0.9, 1], align: ['left', 'right', 'left'], flow: 'diagonal', stampFinal: false },
  { id: 'lower-third-mosaic', regions: [r(2, 34, 47, 29), r(51, 34, 47, 29), r(10, 68, 88, 29)], readingOrder: 'lower-mosaic', scale: [0.94, 0.94, 1.08], align: ['left', 'right', 'right'], flow: 'horizontal', stampFinal: true },
  { id: 'upper-third-mosaic', regions: [r(2, 2, 47, 29), r(51, 2, 47, 29), r(2, 36, 88, 31)], readingOrder: 'upper-mosaic', scale: [0.94, 0.94, 1.08], align: ['left', 'right', 'left'], flow: 'horizontal', stampFinal: true },
  { id: 'cross-axis-balance', regions: [r(2, 2, 45, 43), r(53, 2, 45, 43), r(22, 52, 56, 45)], readingOrder: 'cross-axis', scale: [1, 1, 1.04], align: ['left', 'right', 'center'], flow: 'radial', stampFinal: false },
  { id: 'spiral-soft', regions: [r(5, 2, 61, 29), r(52, 36, 46, 29), r(12, 69, 61, 29)], readingOrder: 'clockwise-soft', scale: [1.06, 0.9, 1.02], align: ['left', 'right', 'left'], flow: 'radial', stampFinal: true },
  { id: 'cascade-fade-depth', regions: [r(2, 2, 70, 28), r(14, 36, 72, 28), r(26, 70, 72, 28)], readingOrder: 'depth-cascade', scale: [1.08, 0.98, 0.9], align: ['left', 'center', 'right'], flow: 'diagonal', stampFinal: false },
] as const satisfies readonly Grammar[]

export type ArtisticVariationId = (typeof ARTISTIC_VARIATIONS)[number]['id']

const MIN_FONT_VW = 2.5 // 48px em 1920×1080
const SAFE_ARTISTIC_VARIATION =
  ARTISTIC_VARIATIONS.find(
    (variation) => variation.id === 'no-stamp-safe-grid',
  ) || ARTISTIC_VARIATIONS[0]

export type ArtisticAabb = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/**
 * Overflow máximo do herói (texto em leitura): fração do tamanho do próprio
 * texto. 1% evita cortar letras inteiras.
 */
export const ARTISTIC_MAX_OVERFLOW_OF_TEXT = 0.01
/**
 * Apoio que cede espaço: pode vazar até ~30% (mínimo 70% aparente).
 */
export const ARTISTIC_SUPPORT_MIN_VISIBLE_RATIO = 0.7

/**
 * Modo artístico ignora `animationMs` / `animationIntervalMs` do tema.
 * Enter, exit e reflow usam só estes tempos.
 */
export const ARTISTIC_MOTION_MS = 720
/**
 * Respiro entre um trio que sai e o próximo que entra.
 * O novo trio só começa depois do desvanecer (~85% do exit + este gap).
 */
export const ARTISTIC_SEQUENCE_GAP_MS = 280
/** Fração do exit do trio anterior antes de liberar a entrada do novo. */
export const ARTISTIC_SEQUENCE_EXIT_HANDOFF = 0.85
/** @deprecated use ARTISTIC_MAX_OVERFLOW_OF_TEXT (herói). */
export const ARTISTIC_SOFT_BLEED_PCT = 1
/** @deprecated use ARTISTIC_MAX_OVERFLOW_OF_TEXT (herói). */
export const ARTISTIC_HARD_BLEED_PCT = 1
/** @deprecated herói usa overflow ≤1% do texto; apoio até 30% fora. */
export const ARTISTIC_MIN_VISIBLE_RATIO = 0.99

/** AABB rotacionada em percentuais da safe area. */
export function artisticTargetAabb(
  target: Pick<
    ArtisticPhraseTarget,
    'x' | 'y' | 'width' | 'height' | 'rotationDeg'
  >,
  aspect = 16 / 9,
): ArtisticAabb {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
  const angle = (Math.abs(target.rotationDeg) * Math.PI) / 180
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const width = target.width * cos + (target.height / safeAspect) * sin
  const height = target.height * cos + target.width * safeAspect * sin
  const centerX = target.x + target.width / 2
  const centerY = target.y + target.height / 2
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
  }
}

export type ArtisticFrameOverflow = {
  left: number
  top: number
  right: number
  bottom: number
  max: number
  visibleRatio: number
}

/** Quanto o AABB sai do quadro [0–100] (valores positivos = fora). */
export function artisticAabbFrameOverflow(
  bounds: ArtisticAabb,
  frame = { left: 0, top: 0, right: 100, bottom: 100 },
): ArtisticFrameOverflow {
  const left = Math.max(0, frame.left - bounds.left)
  const top = Math.max(0, frame.top - bounds.top)
  const right = Math.max(0, bounds.right - frame.right)
  const bottom = Math.max(0, bounds.bottom - frame.bottom)
  const visibleWidth = Math.max(
    0,
    Math.min(bounds.right, frame.right) - Math.max(bounds.left, frame.left),
  )
  const visibleHeight = Math.max(
    0,
    Math.min(bounds.bottom, frame.bottom) - Math.max(bounds.top, frame.top),
  )
  const area = Math.max(1e-6, bounds.width * bounds.height)
  const visibleRatio = (visibleWidth * visibleHeight) / area
  return {
    left,
    top,
    right,
    bottom,
    max: Math.max(left, top, right, bottom),
    visibleRatio,
  }
}

/** Limite de vazamento por eixo = % do tamanho do texto nesse eixo. */
export function artisticOverflowLimits(
  bounds: ArtisticAabb,
  ratio = ARTISTIC_MAX_OVERFLOW_OF_TEXT,
): { x: number; y: number } {
  const r = Math.max(0, ratio)
  return {
    x: Math.max(0.02, bounds.width * r),
    y: Math.max(0.02, bounds.height * r),
  }
}

export function artisticTargetWithinOverflowBudget(
  target: Pick<
    ArtisticPhraseTarget,
    'x' | 'y' | 'width' | 'height' | 'rotationDeg' | 'hero'
  >,
  aspect = 16 / 9,
  ratio = ARTISTIC_MAX_OVERFLOW_OF_TEXT,
): boolean {
  if (!target.hero) {
    const bounds = artisticTargetAabb(target, aspect)
    const overflow = artisticAabbFrameOverflow(bounds)
    return overflow.visibleRatio >= ARTISTIC_SUPPORT_MIN_VISIBLE_RATIO - 0.01
  }
  const bounds = artisticTargetAabb(target, aspect)
  const limit = artisticOverflowLimits(bounds, ratio)
  const overflow = artisticAabbFrameOverflow(bounds)
  return (
    overflow.left <= limit.x + 0.02 &&
    overflow.right <= limit.x + 0.02 &&
    overflow.top <= limit.y + 0.02 &&
    overflow.bottom <= limit.y + 0.02
  )
}

/**
 * Herói: overflow ≤1% do tamanho do texto (puxa/encolhe se preciso).
 * Apoio: pode vazar até ~30%; mantém ≥70% aparente.
 */
function clampArtisticTarget(
  target: ArtisticPhraseTarget,
  aspect = 16 / 9,
): ArtisticPhraseTarget {
  const frame = { left: 0, top: 0, right: 100, bottom: 100 }
  let next = { ...target }
  let bounds = artisticTargetAabb(next, aspect)

  if (!next.hero) {
    for (let step = 0; step < 8; step += 1) {
      bounds = artisticTargetAabb(next, aspect)
      const overflow = artisticAabbFrameOverflow(bounds, frame)
      if (overflow.visibleRatio >= ARTISTIC_SUPPORT_MIN_VISIBLE_RATIO) break
      const cx = next.x + next.width / 2
      const cy = next.y + next.height / 2
      next.x += (50 - cx) * 0.28
      next.y += (50 - cy) * 0.28
    }
    return next
  }

  // Herói: caixa ≤ tela + 1% do próprio texto em cada lado.
  for (let step = 0; step < 10; step += 1) {
    bounds = artisticTargetAabb(next, aspect)
    const limit = artisticOverflowLimits(bounds)
    const maxW = 100 + limit.x * 2
    const maxH = 100 + limit.y * 2
    const boxScale = Math.min(
      1,
      bounds.width > 0 ? maxW / bounds.width : 1,
      bounds.height > 0 ? maxH / bounds.height : 1,
    )
    if (boxScale < 0.999) {
      const cx = next.x + next.width / 2
      const cy = next.y + next.height / 2
      next.width *= boxScale
      next.height *= boxScale
      next.x = cx - next.width / 2
      next.y = cy - next.height / 2
      bounds = artisticTargetAabb(next, aspect)
    }

    const lim = artisticOverflowLimits(bounds)
    const centerX = next.x + next.width / 2
    const centerY = next.y + next.height / 2
    const minCx = frame.left - lim.x + bounds.width / 2
    const maxCx = frame.right + lim.x - bounds.width / 2
    const minCy = frame.top - lim.y + bounds.height / 2
    const maxCy = frame.bottom + lim.y - bounds.height / 2
    const clampedCenterX = Math.min(maxCx, Math.max(minCx, centerX))
    const clampedCenterY = Math.min(maxCy, Math.max(minCy, centerY))
    next.x += clampedCenterX - centerX
    next.y += clampedCenterY - centerY

    bounds = artisticTargetAabb(next, aspect)
    const overflow = artisticAabbFrameOverflow(bounds, frame)
    const ok =
      overflow.left <= lim.x + 0.02 &&
      overflow.right <= lim.x + 0.02 &&
      overflow.top <= lim.y + 0.02 &&
      overflow.bottom <= lim.y + 0.02
    if (ok) break

    const cx = next.x + next.width / 2
    const cy = next.y + next.height / 2
    next.width *= 0.92
    next.height *= 0.92
    // Mantém box ≡ fonte: mesmo fator (evita herói “crescer” o texto fora da caixa).
    next.fontVw =
      Math.round(Math.max(MIN_FONT_VW, next.fontVw * 0.92) * 100) / 100
    next.x = cx - next.width / 2
    next.y = cy - next.height / 2
  }

  return next
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function randomFor(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normalizedToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

export function normalizeArtisticKeywords(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const clean = String(value || '').trim()
    const normalized = normalizedToken(clean)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(clean)
  }
  return out.slice(0, 32)
}

/**
 * Atualiza só as flags de keyword nas palavras — sem remontar quebras,
 * fullLine, breakAfter ou tipografia. Usado quando o operador edita a lista
 * ao vivo sobre um mosaico já em cena.
 */
export function paintArtisticKeywordFlags(
  blocks: readonly ArtisticBlock[],
  keywords: readonly string[],
): ArtisticBlock[] {
  const keywordSet = new Set(
    normalizeArtisticKeywords([...keywords]).map(normalizedToken),
  )
  return blocks.map((block) => {
    const words = block.words.map((word) => ({
      ...word,
      keyword: keywordSet.has(normalizedToken(word.text)),
    }))
    return {
      ...block,
      words,
      // block.keyword / fullLine / scale ficam congelados (evita reflow).
    }
  })
}

const SHORT_CONNECTORS = new Set([
  'a',
  'à',
  'ao',
  'aos',
  'às',
  'as',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'já',
  'lhe',
  'mas',
  'me',
  'meu',
  'na',
  'nas',
  'nem',
  'no',
  'nos',
  'num',
  'numa',
  'o',
  'os',
  'ou',
  'para',
  'pela',
  'pelas',
  'pelo',
  'pelos',
  'por',
  'pra',
  'que',
  'se',
  'sem',
  'seu',
  'só',
  'sua',
  'te',
  'teu',
  'tua',
  'um',
  'uma',
])

function isShortConnector(text: string): boolean {
  return SHORT_CONNECTORS.has(normalizedToken(text))
}

/** Conta letras (pt) após normalizar — ignora pontuação. */
function letterCount(text: string): number {
  const token = normalizedToken(text).normalize('NFC')
  return (token.match(/\p{L}/gu) || []).length
}

/**
 * Palavra sozinha na linha: menos de 4 letras (não-keyword).
 *
 * Era 5, e isso colava palavra de conteúdo curta na seguinte — "QUÃO" (4)
 * grudava em "PROFUNDAS", virando uma linha de 14 caracteres. Linha longa =
 * fonte pequena, porque o tamanho é limitado pela linha mais comprida. Palavra
 * de conteúdo com 4 letras sozinha numa linha é composição, não órfã; órfã de
 * verdade é conector, e `isConnectorOnlyGroup` já cuida disso à parte.
 */
const MIN_LONE_WORD_LETTERS = 4

function isConnectorOnlyGroup(group: readonly ArtisticWord[]): boolean {
  return (
    group.length > 0 &&
    group.every((word) => !word.keyword && isShortConnector(word.text))
  )
}

/** Linha órfã: só conectores, ou uma única palavra não-keyword com <5 letras. */
function isShortOrphanGroup(group: readonly ArtisticWord[]): boolean {
  if (!group.length) return false
  if (group.some((word) => word.keyword)) return false
  if (isConnectorOnlyGroup(group)) return true
  return group.length === 1 && letterCount(group[0].text) < MIN_LONE_WORD_LETTERS
}

function mergeOrphanIntoNeighbor(
  group: ArtisticWord[],
  prev: ArtisticWord[] | undefined,
  next: ArtisticWord[] | undefined,
  working: ArtisticWord[][],
  nextIndex: number,
): 'prev' | 'next' | null {
  if (prev && !prev.some((word) => word.keyword)) {
    prev.push(...group)
    return 'prev'
  }
  if (next && !next.some((word) => word.keyword)) {
    working[nextIndex] = [...group, ...next]
    return 'next'
  }
  // Possessivo cola em keyword longa (TUA GRAÇA), não em keyword curta (FÉ).
  if (
    next &&
    next.length === 1 &&
    next[0].keyword &&
    letterCount(next[0].text) >= MIN_LONE_WORD_LETTERS
  ) {
    working[nextIndex] = [...group, ...next]
    return 'next'
  }
  if (
    prev &&
    prev.length === 1 &&
    prev[0].keyword &&
    letterCount(prev[0].text) >= MIN_LONE_WORD_LETTERS
  ) {
    prev.push(...group)
    return 'prev'
  }
  if (prev) {
    prev.push(...group)
    return 'prev'
  }
  return null
}

/** Evita linha só com “de/se/e…” ou palavra curta (<5 letras) sozinha. */
function repairLineOrphans(groups: ArtisticWord[][]): ArtisticWord[][] {
  const working = groups.map((group) => [...group]).filter((group) => group.length)
  const result: ArtisticWord[][] = []

  for (let i = 0; i < working.length; i += 1) {
    let group = working[i]
    if (!group.length) continue

    // Conectores no início da linha → sobem para a linha anterior (se não for keyword).
    while (
      group.length > 1 &&
      isShortConnector(group[0].text) &&
      !group[0].keyword &&
      result.length > 0 &&
      !result[result.length - 1].some((word) => word.keyword)
    ) {
      result[result.length - 1].push(group[0])
      group = group.slice(1)
    }

    if (isShortOrphanGroup(group)) {
      const merged = mergeOrphanIntoNeighbor(
        group,
        result[result.length - 1],
        working[i + 1],
        working,
        i + 1,
      )
      if (merged) continue
    }

    result.push(group)
  }

  // Segunda passagem: órfãos gerados após merges.
  const cleaned: ArtisticWord[][] = []
  for (let i = 0; i < result.length; i += 1) {
    const group = result[i]
    if (isShortOrphanGroup(group)) {
      const merged = mergeOrphanIntoNeighbor(
        group,
        cleaned[cleaned.length - 1],
        result[i + 1],
        result,
        i + 1,
      )
      if (merged === 'prev' || merged === 'next') continue
    }
    cleaned.push(group)
  }

  return cleaned.filter((group) => group.length)
}

/**
 * Conectivo rege o que vem DEPOIS, não o que veio antes. Terminar um bloco em
 * conectivo corta uma unidade de sentido no meio — era o corte
 * "Tua graça me" / "basta". Aqui o conectivo preso no fim de um bloco migra
 * para o começo do bloco seguinte, onde ele pertence.
 *
 * Bloco de palavra-chave não recebe migração: ele é isolado de propósito.
 */
function repairConnectorTails(groups: ArtisticWord[][]): ArtisticWord[][] {
  const out = groups.map((group) => [...group])
  for (let i = 0; i < out.length - 1; i += 1) {
    const cur = out[i]
    const next = out[i + 1]
    if (cur.length < 2 || !next.length) continue
    if (next.some((word) => word.keyword)) continue
    const tail = cur[cur.length - 1]
    if (tail.keyword || !isShortConnector(tail.text)) continue

    // Só migra se o que sobra continua sendo um bloco legítimo: nunca só
    // conectivos, nunca uma palavra curta sozinha. Sem isto, tirar o "te" de
    // "Nós te" deixaria "Nós" órfão — troca um defeito por outro.
    const rest = cur.slice(0, -1)
    if (!rest.length || isConnectorOnlyGroup(rest)) continue
    if (
      rest.length === 1 &&
      letterCount(rest[0].text) < MIN_LONE_WORD_LETTERS
    ) {
      continue
    }

    cur.pop()
    next.unshift(tail)
  }
  return out.filter((group) => group.length)
}

/**
 * Número de caracteres por linha que MAXIMIZA a fonte, para o solo.
 *
 * Linha demais e linha de menos encolhem a letra pelo mesmo motivo, por lados
 * opostos: com L linhas numa caixa W×H, a largura permite `fonte ∝ W·L/chars`
 * e a altura permite `fonte ∝ H/L`. Igualando as duas, `L ≈ √(chars · H·k/W)`
 * — e daí `chars por linha ≈ √(chars) / k`.
 *
 * Medido: "Grande é o Senhor e mui digno de louvor" (39 chars) saía em 5
 * linhas com o teto fixo de 6–10 chars; a altura enchia 91% e a largura só
 * 48%, com a fonte travada pela altura. O teto certo aqui é ~11.
 */
function soloMaxCharsPerLine(totalChars: number, jitter: number): number {
  const ideal = 1.745 * Math.sqrt(Math.max(1, totalChars))
  return Math.max(6, Math.round(ideal * (0.9 + jitter * 0.2)))
}

function makeBlocks(
  phrase: string,
  keywords: Set<string>,
  seed: number,
  /** Fase 1 (frase única). O mosaico do Max mantém o agrupamento antigo. */
  solo = false,
): ArtisticBlock[] {
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  const rng = randomFor(seed)
  const totalChars = words.reduce(
    (sum, word, index) => sum + word.length + (index ? 1 : 0),
    0,
  )
  const soloMaxChars = solo ? soloMaxCharsPerLine(totalChars, rng()) : 0
  const groups: ArtisticWord[][] = []
  let pending: ArtisticWord[] = []
  let pendingChars = 0

  const flush = () => {
    if (!pending.length) return
    groups.push(pending)
    pending = []
    pendingChars = 0
  }

  for (const text of words) {
    const keyword = keywords.has(normalizedToken(text))
    const word = { text, keyword }
    if (keyword) {
      flush()
      groups.push([word])
      continue
    }

    // Conector curto nunca inicia quebra: fica na linha atual.
    if (isShortConnector(text)) {
      pending.push(word)
      pendingChars += text.length + (pending.length > 1 ? 1 : 0)
      continue
    }

    // Não deixa palavra curta (<5 letras) sozinha na linha atual.
    const shortLone =
      pending.length === 1 && letterCount(pending[0].text) < MIN_LONE_WORD_LETTERS

    // Solo: teto derivado do comprimento da frase (maximiza a fonte).
    // Mosaico: linhas curtas de cartaz, ~6–10 chars, como sempre foi.
    const maxChars = solo ? soloMaxChars : 6 + Math.floor(rng() * 5)
    const nextChars = pendingChars + text.length + (pending.length ? 1 : 0)
    // Solo deixa o teto de caracteres decidir até 3 palavras; o mosaico
    // continua cortando em 2, que é o ritmo já calibrado do Max.
    const maxWords = solo ? 3 : 2
    if (
      !shortLone &&
      (pending.length >= maxWords ||
        (pendingChars && nextChars > maxChars))
    ) {
      flush()
    }
    pending.push(word)
    pendingChars += text.length + (pending.length > 1 ? 1 : 0)
  }
  flush()

  const repaired = repairConnectorTails(repairLineOrphans(groups))
  return styleBlocksFromLines(repaired, phrase, rng)
}

/**
 * Aplica ESTILO a linhas já decididas. Separado do agrupamento de propósito:
 * o solo descobre as linhas simulando o wrap dentro do box (ver
 * `soloComposeLines`) e reusa este mesmo estilo, em vez de duplicar a receita.
 *
 * `uniformScale` = solo: o tamanho já foi resolvido pelo box com fonte
 * uniforme, então variar a escala por linha aqui só encolheria a letra. O
 * ritmo fica por conta do peso e da cor; a palavra-chave continua sendo a
 * exceção que cresce — e vaza do box de propósito.
 */
function styleBlocksFromLines(
  repaired: ArtisticWord[][],
  phrase: string,
  rng: () => number,
  uniformScale = false,
): ArtisticBlock[] {
  const effects: ArtisticExitEffect[] = [
    'fade',
    'left',
    'right',
    'up',
    'down',
    'zoom',
  ]
  const lineCount = repaired.length
  return repaired.map((group, index) => {
    const keyword = group.some((word) => word.keyword)
    // Ritmo tipográfico no bloco: linhas alternam peso visual.
    const wave =
      uniformScale || lineCount <= 1
        ? 1
        : index === 0
          ? 1.06
          : index === lineCount - 1
            ? 0.88
            : index % 2 === 0
              ? 1.02
              : 0.82
    // Cada bloco força fileira própria (exceto o último): "A ele a" / "glória"
    // em 2 linhas ocupa muito mais tela que a mesma frase numa linha só — o
    // flex-wrap por largura não força isso sozinho quando os blocos cabem
    // lado a lado. Quebra é pra compor, não pra caber.
    const breakAfter = !keyword && index < repaired.length - 1
    return {
      id: `b-${hashString(phrase)}-${index}`,
      words: group,
      keyword,
      // Todo bloco agora é fileira própria (breakAfter acima) — então todo
      // bloco também ocupa a largura toda da linha (como o keyword sempre
      // fez). Sem isto, cada linha encolhe pro tamanho do próprio texto e
      // fica à esquerda com a caixa vazia do lado, mesmo já quebrada.
      fullLine: true,
      breakAfter,
      scale: keyword
        ? 1.95 + rng() * 0.35
        : uniformScale
          ? 1
          : Math.round((0.78 + rng() * 0.1) * wave * 100) / 100,
      weight: keyword ? 900 : 640 + Math.round(rng() * 120),
      exitEffect: effects[Math.floor(rng() * effects.length)] || 'fade',
      exitDelayMs: Math.round((index * 55 + rng() * 90) / 10) * 10,
    }
  })
}

/**
 * Coluna-retrato só para apoio curto. No promote, a frase longa pode cair no
 * slot portrait do template estável — converte para faixa landscape no mesmo
 * canto, sem roubar a região generosa do herói.
 */
function resolveCompositionSlot(
  slot: CompositionSlot | undefined,
  phrase: string,
): CompositionSlot | undefined {
  if (!slot) return undefined
  if (slot.orientation !== 'portrait-stack') return slot
  if (isShortSupport(phrase)) return slot

  const [x, y, w, h] = slot.region
  const leftEdge =
    slot.anchor === 'edge-left' ||
    slot.anchor === 'tl' ||
    slot.anchor === 'bl' ||
    x < 30
  const rightEdge =
    slot.anchor === 'edge-right' ||
    slot.anchor === 'tr' ||
    slot.anchor === 'br' ||
    x > 55

  if (leftEdge) {
    return {
      ...slot,
      orientation: 'landscape',
      region: [2, Math.max(4, Math.min(y, 58)), 30, Math.min(36, Math.max(24, h * 0.42))],
      anchor: 'none',
      align: 'left',
      scale: Math.max(slot.scale, 0.7),
      motionRecipeHint: undefined,
    }
  }
  if (rightEdge) {
    return {
      ...slot,
      orientation: 'landscape',
      region: [68, Math.max(4, Math.min(y, 58)), 30, Math.min(36, Math.max(24, h * 0.42))],
      anchor: 'none',
      align: 'right',
      scale: Math.max(slot.scale, 0.7),
      motionRecipeHint: undefined,
    }
  }
  return {
    ...slot,
    orientation: 'landscape',
    region: [x, y, Math.max(w, 36), Math.min(h, 28)],
    anchor: 'none',
    motionRecipeHint: undefined,
  }
}

function phaseTwoRects(grammar: Grammar): [Rect, Rect] {
  const first = grammar.regions[0]
  const firstCenterX = first[0] + first[2] / 2
  const firstCenterY = first[1] + first[3] / 2

  // Support cede faixa estreita; hero ocupa o grosso da safe area.
  if (grammar.flow === 'vertical') {
    if (firstCenterY > 50) {
      return [r(4, 74, 92, 22), r(2, 2, 96, 68)]
    }
    return [r(4, 2, 92, 22), r(2, 28, 96, 68)]
  }
  if (grammar.flow === 'horizontal') {
    if (firstCenterX > 50) {
      return [r(72, 4, 26, 42), r(2, 22, 66, 74)]
    }
    return [r(2, 4, 26, 42), r(32, 22, 66, 74)]
  }
  if (grammar.flow === 'radial') {
    return firstCenterX > 50
      ? [r(58, 3, 40, 28), r(2, 30, 78, 66)]
      : [r(2, 3, 40, 28), r(20, 30, 78, 66)]
  }
  return firstCenterX > 50
    ? [r(60, 2, 38, 28), r(2, 30, 72, 66)]
    : [r(2, 2, 38, 28), r(26, 30, 72, 66)]
}

/**
 * Reestima fontVw de um target para os blocos (quebras) da frase que vai
 * ocupar o assento. O remapeamento de promote reusa a CAIXA do assento, mas a
 * tipografia tem de caber nas linhas da frase — senão volta ao herói “sem
 * quebra” / vazando com o fontVw de outra frase.
 */
export function refitArtisticTargetForBlocks(
  target: ArtisticPhraseTarget,
  blocks: ArtisticBlock[],
  aspect = 16 / 9,
): ArtisticPhraseTarget {
  const rect: Rect = [target.x, target.y, target.width, target.height]
  const portrait = target.orientation === 'portrait-stack'
  const keywordOrFull = blocks.filter(
    (block) => block.fullLine || block.keyword,
  ).length
  const wrapChunks = blocks.length - keywordOrFull
  // Wrap: ~2 pedaços por fileira; keyword/fullLine = 1 fileira cada.
  const lineCount = Math.max(1, keywordOrFull + Math.ceil(wrapChunks / 2))
  // Teto alto o bastante para o enforce de hierarquia recuperar ênfase do herói.
  const heroCap =
    lineCount >= 4 ? 7.2 : lineCount === 3 ? 8.0 : lineCount === 2 ? 8.6 : 9.2
  const cap = target.hero ? heroCap : portrait ? 4.0 : 4.6
  const scale = target.hero ? 1.14 : portrait ? 0.72 : 0.78
  const estimated = estimateFontVw(blocks, rect, cap, scale)
  // Assento herói já veio densificado: preserva ênfase; só cede se a frase
  // for claramente mais densa (estimated menor, mas não abaixo de 92%).
  const fontVw =
    target.hero && target.fontVw > 0
      ? Math.max(estimated, target.fontVw * 0.92)
      : estimated
  return clampArtisticTarget(
    {
      ...target,
      fontVw,
    },
    aspect,
  )
}

function blockCharCount(block: ArtisticBlock): number {
  return block.words.reduce(
    (sum, word, index) => sum + word.text.length + (index ? 1 : 0),
    0,
  )
}

/**
 * Estima fontVw levando em conta scale dos blocos e número de linhas
 * (fullLine), para keywords grandes não forçarem encolhimento cego depois.
 */
function estimateFontVw(
  blocks: ArtisticBlock[],
  rect: Rect,
  cap: number,
  scale: number,
): number {
  if (!blocks.length) return Math.min(cap, MIN_FONT_VW + 0.35)

  const longestVisual = Math.max(
    1,
    ...blocks.map((block) => {
      // Keyword scale (≈2×) é ênfase visual no CSS — não pode esmagar o fontVw
      // base, senão a keyword “some” e o herói fica pequeno.
      const fitScale = Math.min(1.28, Math.max(0.75, block.scale))
      return blockCharCount(block) * fitScale
    }),
  )
  const weightedChars = blocks.reduce((sum, block) => {
    const fitScale = Math.min(1.28, Math.max(0.75, block.scale))
    return sum + blockCharCount(block) * fitScale
  }, 0)
  const keywordOrFull = blocks.filter(
    (block) => block.fullLine || block.keyword,
  ).length
  const wrapChunks = blocks.length - keywordOrFull
  const lineCount = Math.max(1, keywordOrFull + Math.ceil(wrapChunks / 2))
  const maxScale = Math.max(...blocks.map((block) => block.scale), 1)

  const widthFit = (rect[2] * 0.94) / (longestVisual * 0.56)
  const usableArea = rect[2] * rect[3] * 0.62
  const areaFit = Math.sqrt(usableArea / Math.max(8, weightedChars * 0.7))
  const heightFit = (rect[3] * 0.9) / (lineCount * 1.0 * maxScale * 1.08)

  // FINAL-STATE-FIRST: sem penalidade cega. O herói mira grande (preenche a
  // região destino); o clamp de overflow (≤1% no herói) e o densify/shrink no
  // finalize corrigem excesso só onde realmente ocorre, e o fit no DOM valida.
  return (
    Math.round(
      Math.min(cap, widthFit, areaFit * 1.18, heightFit) * scale * 100,
    ) / 100
  )
}

function targetFor(
  blocks: ArtisticBlock[],
  rect: Rect,
  input: {
    cap: number
    scale: number
    rotationDeg: number
    align: ArtisticAlign
    zIndex: number
    hero: boolean
    stamp: boolean
    opacity?: number
    orientation?: ArtisticOrientation
    anchor?: ArtisticAnchor
    motionRecipeHint?: string
  },
): ArtisticPhraseTarget {
  const [x, y, width, height] = rect
  return clampArtisticTarget({
    x,
    y,
    width,
    height,
    fontVw: estimateFontVw(blocks, rect, input.cap, input.scale),
    rotationDeg: input.rotationDeg,
    align: input.align,
    zIndex: input.zIndex,
    hero: input.hero,
    stamp: input.stamp,
    opacity: input.opacity ?? (input.hero ? 1 : 0.6),
    ...(input.orientation ? { orientation: input.orientation } : null),
    ...(input.anchor ? { anchor: input.anchor } : null),
    ...(input.motionRecipeHint
      ? { motionRecipeHint: input.motionRecipeHint }
      : null),
  })
}

function phraseRotation(
  seed: number,
  index: number,
  phase: ArtisticPhase,
  stamp: boolean,
): number {
  const rng = randomFor(seed ^ Math.imul(index + 1, 0x9e3779b1) ^ phase)
  const limit = stamp ? 6.5 : phase === 1 ? 1.1 : 1.8
  let value = (rng() * 2 - 1) * limit
  if (stamp && Math.abs(value) < 2) {
    value = value < 0 ? -2 : 2
  }
  return Math.round(value * 10) / 10
}

function phraseEnterEffect(
  phraseSeed: number,
  stamp: boolean,
): ArtisticEnterEffect {
  if (stamp) return 'stamp'
  const effects: ArtisticEnterEffect[] = [
    'stamp',
    'stamp',
    'slam',
    'punch',
    'fade',
    'slide-up',
    'slide-left',
    'slide-right',
    'zoom-in',
    'soft-rise',
  ]
  const rng = randomFor(phraseSeed ^ 0xa11ce5ed)
  return effects[Math.floor(rng() * effects.length)] || 'soft-rise'
}

/** ~45% das entradas: blinker no pouso. */
function phraseLandBlink(phraseSeed: number): boolean {
  const rng = randomFor(phraseSeed ^ 0xb114e)
  return rng() < 0.45
}

/**
 * Biblioteca de layouts do Criativo solo (frase única, Max desligado).
 *
 * Os 33 `ARTISTIC_VARIATIONS` descrevem TRÊS regiões cada — calibradas pro
 * mosaico do Max, não pro solo. Esta tabela é estrutura própria: cada entrada
 * é uma composição completa pra UMA frase, aplicada em `phase === 1` (ver
 * `enforceCurrentHeroHierarchy` abaixo), nunca somada às variações do mosaico.
 */
export type ArtisticSoloFamily = 'centrado' | 'coluna' | 'cascata' | 'carimbo'

export type ArtisticSoloLayout = {
  id: string
  family: ArtisticSoloFamily
  /** Região na área da SAÍDA, em % — [x, y, largura, altura]. */
  rect: Rect
  align: ArtisticAlign
  /** Rotação do bloco em graus. 0 = reto. */
  rotationDeg: number
  /** Multiplicador do alvo. 1 = preencher a região. */
  scale: number
  /** Fonte própria do layout. Ausente = herda do tema. */
  fontFamily?: string
  /** Id de receita no banco de movimento (`src/artistic/motion/bank.ts`). */
  enterRecipeId: string
  exitRecipeId: string
  /** Movimento ambiente (flutuação). Reservado — `when: 'ambient'` ainda não
   *  existe no banco (próximo passo); nenhuma entrada usa isto ainda. */
  ambientRecipeId?: string
  weight?: number
}

// prettier-ignore
export const ARTISTIC_SOLO_LAYOUTS: readonly ArtisticSoloLayout[] = [
  // centrado — bloco cheio ao centro, peso alternando entre linhas
  // Leitura é esq→dir: rotação predominantemente anti-horária (negativa) lê
  // melhor que horária, que "briga" com o sentido da leitura e cansa.
  { id: 'centrado-1', family: 'centrado', rect: [4, 4, 92, 92], align: 'center', rotationDeg: 0,  scale: 1,    enterRecipeId: 'surgir',        exitRecipeId: 'dispersar-fade' },
  { id: 'centrado-2', family: 'centrado', rect: [4, 4, 92, 92], align: 'center', rotationDeg: -2, scale: 1.02, enterRecipeId: 'aproximar',      exitRecipeId: 'dispersar-zoom' },
  { id: 'centrado-3', family: 'centrado', rect: [4, 4, 92, 92], align: 'center', rotationDeg: 2,  scale: 0.98, enterRecipeId: 'subida-suave',   exitRecipeId: 'dispersar-up' },
  { id: 'centrado-4', family: 'centrado', rect: [4, 4, 92, 92], align: 'center', rotationDeg: -3, scale: 1,    enterRecipeId: 'impacto',        exitRecipeId: 'dispersar-down', weight: 800 },

  // coluna — coluna estreita, alinhada a um lado
  // Largura ≥68%: coluna "estreita" ainda tem que bater o piso de 60% de
  // cobertura — 44% de largura lia bonito no papel e dava 43% de área (medido
  // pelo teste), o que é exatamente fonte pequena demais pra ler.
  { id: 'coluna-1', family: 'coluna', rect: [4, 4, 68, 92],  align: 'left',  rotationDeg: 0, scale: 1,    enterRecipeId: 'deslize-left',  exitRecipeId: 'dispersar-left' },
  { id: 'coluna-2', family: 'coluna', rect: [28, 4, 68, 92], align: 'right', rotationDeg: 0, scale: 1,    enterRecipeId: 'deslize-right', exitRecipeId: 'dispersar-right' },
  { id: 'coluna-3', family: 'coluna', rect: [4, 4, 68, 92],  align: 'left',  rotationDeg: 0, scale: 0.96, enterRecipeId: 'subida-suave',  exitRecipeId: 'dispersar-fade', weight: 720 },

  // cascata — linhas escalonadas na diagonal
  { id: 'cascata-1', family: 'cascata', rect: [4, 6, 92, 88], align: 'left',  rotationDeg: -3, scale: 1,    enterRecipeId: 'deslize-up',   exitRecipeId: 'dispersar-up' },
  { id: 'cascata-2', family: 'cascata', rect: [4, 6, 92, 88], align: 'right', rotationDeg: 3,  scale: 1,    enterRecipeId: 'carimbo',      exitRecipeId: 'dispersar-down' },
  { id: 'cascata-3', family: 'cascata', rect: [4, 6, 92, 88], align: 'left',  rotationDeg: -6, scale: 0.98, enterRecipeId: 'soco',         exitRecipeId: 'dispersar-left' },
  { id: 'cascata-4', family: 'cascata', rect: [4, 6, 92, 88], align: 'right', rotationDeg: 6,  scale: 0.98, enterRecipeId: 'impacto',      exitRecipeId: 'dispersar-right' },

  // carimbo — bloco rotacionado, ancorado central mas girado com força
  { id: 'carimbo-1', family: 'carimbo', rect: [8, 8, 84, 84], align: 'center', rotationDeg: -8,  scale: 1,    enterRecipeId: 'carimbo', exitRecipeId: 'dispersar-zoom' },
  { id: 'carimbo-2', family: 'carimbo', rect: [8, 8, 84, 84], align: 'center', rotationDeg: 8,   scale: 1,    enterRecipeId: 'impacto', exitRecipeId: 'dispersar-fade' },
  { id: 'carimbo-3', family: 'carimbo', rect: [8, 8, 84, 84], align: 'center', rotationDeg: -12, scale: 0.96, enterRecipeId: 'soco',    exitRecipeId: 'dispersar-zoom', weight: 780 },
]

export function pickArtisticSoloLayout(seed: number): ArtisticSoloLayout {
  const rng = randomFor(seed ^ 0x501010)
  const index = Math.min(
    ARTISTIC_SOLO_LAYOUTS.length - 1,
    Math.floor(rng() * ARTISTIC_SOLO_LAYOUTS.length),
  )
  return ARTISTIC_SOLO_LAYOUTS[index]!
}

/**
 * Piso e teto de `fontVw` só pro Criativo solo. Projeção vista a metros de
 * distância exige letra grande sempre — mais alto que `MIN_FONT_VW`, que é
 * piso genérico (serve legenda comum, bem mais perto do olho). Teto evita
 * estourar em frases muito curtas/blocos muito largos.
 */
const ARTISTIC_SOLO_MIN_FONT_VW = 5.5
const ARTISTIC_SOLO_MAX_FONT_VW = 22

/** Largura média de glifo, em em. Mesma constante que `estimateFontVw` usa. */
const SOLO_GLYPH_EM = 0.56
/** Altura da linha, em em. Espelha `line-height: 0.96` do `.artistic-blocks`. */
const SOLO_LINE_EM = 0.96
/**
 * Quanto a palavra-chave PESA na conta de altura, mesmo tendo escala ~2×.
 * Ela vaza do box de propósito (é o destaque), então cobrar os 2× inteiros
 * faria o texto todo encolher para abrir espaço a um vazamento desejado.
 */
const SOLO_KEYWORD_HEIGHT_WEIGHT = 1.45

/**
 * Funde linha órfã (só conectivos, ou palavra curta sozinha) na linha
 * SEGUINTE — não na anterior.
 *
 * `repairLineOrphans` funde para trás, o que é certo no mosaico mas errado
 * aqui por dois motivos: o conectivo rege o que vem DEPOIS ("A / GLÓRIA" tem
 * de virar "A GLÓRIA", não "A ELE A"), e fundir para trás ALARGA uma linha já
 * cheia — o wrap acabou de decidir que ali não cabia mais nada. Alargar
 * obriga a busca a baixar a fonte, que é exatamente o defeito a evitar.
 */
function mergeOrphanLinesForward(lines: ArtisticWord[][]): ArtisticWord[][] {
  const pending = lines.map((line) => [...line])
  const out: ArtisticWord[][] = []
  for (let index = 0; index < pending.length; index += 1) {
    const line = pending[index]
    if (!line.length) continue
    if (!isShortOrphanGroup(line)) {
      out.push(line)
      continue
    }
    const next = pending[index + 1]
    // Palavra-chave CURTA fica sozinha: é o destaque da composição, e colar um
    // "Tua" nela rouba o efeito. Keyword longa aceita o possessivo ("TUA GRAÇA").
    const nextGuardsKeyword =
      next?.some(
        (word) =>
          word.keyword && letterCount(word.text) < MIN_LONE_WORD_LETTERS,
      ) ?? false
    if (next?.length && !nextGuardsKeyword) {
      // Desce: a linha seguinte recebe o órfão no começo, onde ele pertence.
      pending[index + 1] = [...line, ...next]
      continue
    }
    // Última linha não tem para onde descer: aí sim volta para a anterior.
    if (out.length) out[out.length - 1].push(...line)
    else out.push(line)
  }
  return out.filter((line) => line.length)
}

/**
 * O BOX manda: acha a maior fonte UNIFORME em que a frase cabe no retângulo, e
 * devolve as linhas que o wrap produziu nesse tamanho.
 *
 * Inverte a dependência antiga. Antes: agrupava blocos por heurística, e o
 * tamanho saía do agrupamento — duas fontes de verdade (o modelo em Node
 * adivinhava, o DOM corrigia depois), que foi a origem dos defeitos de
 * "pequeno demais". Agora existe uma só: cresce até encostar no box.
 *
 * Converge sozinho no equilíbrio largura×altura, sem constante mágica: fonte
 * maior ⇒ mais linhas ⇒ mais altura, então a altura é monotônica no tamanho e
 * a busca binária acha o ponto exato. É por isso que não há mais heurística de
 * "caracteres por linha" aqui.
 */
function soloComposeLines(
  words: readonly ArtisticWord[],
  boxWvw: number,
  boxHvw: number,
): { fontVw: number; lines: ArtisticWord[][] } {
  const charsOf = (line: readonly ArtisticWord[]) =>
    line.reduce((sum, word, index) => sum + word.text.length + (index ? 1 : 0), 0)

  const wrapAt = (fontVw: number): ArtisticWord[][] => {
    const lines: ArtisticWord[][] = []
    let current: ArtisticWord[] = []
    for (const word of words) {
      // Palavra-chave em linha própria: é o elemento que vaza, e o vazamento
      // tem de ser vertical e controlado, não no meio de uma linha de texto.
      if (word.keyword) {
        if (current.length) lines.push(current)
        lines.push([word])
        current = []
        continue
      }
      const candidate = [...current, word]
      if (!current.length || charsOf(candidate) * SOLO_GLYPH_EM * fontVw <= boxWvw) {
        current = candidate
        continue
      }
      // Quebra aqui. Conectivo rege o que vem DEPOIS, então conectivo no fim
      // da linha desce junto com a palavra que ele rege ("A ELE A / GLÓRIA"
      // vira "A ELE / A GLÓRIA"). Descer NUNCA alarga uma linha — corrigir
      // isto depois, fundindo linhas, alargava e forçava fonte menor.
      const carry: ArtisticWord[] = []
      while (
        current.length > 1 &&
        !current[current.length - 1].keyword &&
        isShortConnector(current[current.length - 1].text)
      ) {
        carry.unshift(current.pop()!)
      }
      // Só desce se o que sobra continua uma linha legítima.
      if (
        !current.length ||
        isConnectorOnlyGroup(current) ||
        (current.length === 1 &&
          letterCount(current[0].text) < MIN_LONE_WORD_LETTERS)
      ) {
        current.push(...carry)
        carry.length = 0
      }
      lines.push(current)
      current = [...carry, word]
    }
    if (current.length) lines.push(current)
    return mergeOrphanLinesForward(lines)
  }

  const heightOf = (lines: ArtisticWord[][], fontVw: number) =>
    lines.reduce(
      (sum, line) =>
        sum +
        fontVw *
          SOLO_LINE_EM *
          (line.some((word) => word.keyword) ? SOLO_KEYWORD_HEIGHT_WEIGHT : 1),
      0,
    )

  const fits = (fontVw: number) => {
    const lines = wrapAt(fontVw)
    const widest = Math.max(
      ...lines.map((line) => charsOf(line) * SOLO_GLYPH_EM * fontVw),
    )
    return widest <= boxWvw && heightOf(lines, fontVw) <= boxHvw
  }

  let low = ARTISTIC_SOLO_MIN_FONT_VW
  let high = ARTISTIC_SOLO_MAX_FONT_VW
  if (fits(high)) low = high
  else {
    for (let step = 0; step < 22; step += 1) {
      const mid = (low + high) / 2
      if (fits(mid)) low = mid
      else high = mid
    }
  }
  const fontVw = Math.round(low * 100) / 100
  return { fontVw, lines: wrapAt(fontVw) }
}

/**
 * Sobrescreve o alvo da fase 1 (frase única) com um layout solo sorteado.
 * `fontVw` é recalculado pro `rect` do layout escolhido — reusar o `fontVw`
 * de outra região daria tamanho errado pro espaço novo.
 */
function applyArtisticSoloLayout(
  heroPlan: ArtisticPhrasePlan,
  hero: ArtisticPhraseTarget,
  seed: number,
  aspect = 16 / 9,
): void {
  const blocks = heroPlan.blocks
  if (!blocks.length) return
  const layout = pickArtisticSoloLayout(seed)
  hero.x = layout.rect[0]
  hero.y = layout.rect[1]
  hero.width = layout.rect[2]
  hero.height = layout.rect[3]
  hero.align = layout.align
  hero.rotationDeg = layout.rotationDeg

  // Geometria PRIMEIRO, tipografia depois. O clamp do herói, quando a AABB
  // rotacionada estoura o quadro, encolhe `fontVw` em 0,92 por passo — até 10
  // passos, ou 0,43× do tamanho. Como layout girado sempre tem AABB maior que
  // o retângulo, todo layout rotacionado saía com a fonte esmagada (era a
  // causa de "A ELE A GLÓRIA" minúsculo). Rodando o clamp antes, ele acerta
  // x/y com um `fontVw` descartável, e o tamanho real é calculado depois,
  // sobre o retângulo já assentado.
  hero.fontVw = ARTISTIC_SOLO_MIN_FONT_VW
  Object.assign(hero, clampArtisticTarget(hero, aspect))
  const settledRect: Rect = [hero.x, hero.y, hero.width, hero.height]

  // O BOX manda. Simula o wrap dentro do retângulo já assentado, com fonte
  // uniforme, e RECOMPÕE os blocos a partir das linhas que saíram dali — em
  // vez de herdar o agrupamento feito às cegas, sem saber o retângulo.
  //
  // A altura do retângulo é % da ALTURA do quadro e `fontVw` é % da LARGURA;
  // `/ aspect` converte para a mesma unidade. Comparar as duas sem converter
  // superestimava a altura disponível em ~1,78× num 16:9.
  const composed = soloComposeLines(
    blocks.flatMap((block) => block.words),
    settledRect[2] * 0.96 * layout.scale,
    (settledRect[3] / aspect) * 0.94 * layout.scale,
  )
  heroPlan.blocks = styleBlocksFromLines(
    composed.lines,
    heroPlan.text,
    randomFor(seed ^ hashString(heroPlan.text)),
    // Tamanho já resolvido pelo box com fonte uniforme: variar a escala por
    // linha aqui só encolheria a letra. O ritmo fica no peso e na cor; a
    // palavra-chave segue crescendo e vazando do box, que é o destaque.
    true,
  )
  hero.fontVw = composed.fontVw

  // Entrada/saída próprias por família — sem isto, toda família herda a
  // mesma pool de efeitos genéricos sorteados por frase e vira "sempre a
  // mesma cara" (a reclamação de "entradas e saídas monótonas"). A ponte
  // `legacyEnter`/`legacyExit` já existe no banco pra isso.
  const enterRecipe = findRecipe(layout.enterRecipeId)
  if (enterRecipe?.legacyEnter) {
    heroPlan.enterEffect = enterRecipe.legacyEnter as ArtisticEnterEffect
  }
  const exitRecipe = findRecipe(layout.exitRecipeId)
  if (exitRecipe?.legacyExit) {
    const legacyExit = exitRecipe.legacyExit as ArtisticExitEffect
    for (const block of heroPlan.blocks) {
      block.exitEffect = legacyExit
    }
  }
}

export function enforceCurrentHeroHierarchy(
  plans: ArtisticPhrasePlan[],
  phase: ArtisticPhase,
  seed: number,
): void {
  const targets = plans
    .map((phrase) => phrase.targets[phase])
    .filter((target): target is ArtisticPhraseTarget => Boolean(target))
  const hero = targets[targets.length - 1]
  if (!hero) return

  hero.hero = true
  hero.opacity = 1
  hero.zIndex = Math.max(hero.zIndex, phase === 3 ? 9 : phase === 2 ? 6 : 4)
  if (phase === 1) {
    hero.opacity = 1
    const heroPlan = plans[plans.length - 1]
    if (heroPlan) applyArtisticSoloLayout(heroPlan, hero, seed)
    return
  }

  // Support reduz e sai de foco; hero cresce e toma o espaço.
  // phase 2: support ~38% · phase 3: mais antigo ~32%, médio ~42%
  const ratios = targets.slice(0, -1).map((_, index) => {
    const age = targets.length - 1 - index
    return phase === 3 ? (age >= 2 ? 0.32 : 0.42) : 0.38
  })
  const opacities = targets.slice(0, -1).map((target, index) => {
    const age = targets.length - 1 - index
    const base = phase === 3 ? (age >= 2 ? 0.48 : 0.62) : 0.58
    // Coluna retrato: não esmaga abaixo de 0.55 (legibilidade da coluna).
    return target.orientation === 'portrait-stack' ? Math.max(base, 0.55) : base
  })
  const smallestRatio = Math.min(...ratios)
  hero.fontVw =
    Math.round(
      Math.max(
        hero.fontVw,
        MIN_FONT_VW + 0.7,
        MIN_FONT_VW / smallestRatio,
      ) * 100,
    ) / 100
  // Hero ganha área ao ceder o support.
  const heroCx = hero.x + hero.width / 2
  const heroCy = hero.y + hero.height / 2
  hero.width = Math.min(98, hero.width * (phase === 3 ? 1.08 : 1.1))
  hero.height = Math.min(92, hero.height * (phase === 3 ? 1.06 : 1.08))
  hero.x = heroCx - hero.width / 2
  hero.y = heroCy - hero.height / 2

  targets.slice(0, -1).forEach((target, index) => {
    const ratio = ratios[index]
    target.hero = false
    target.opacity = opacities[index]
    target.zIndex = Math.min(target.zIndex, hero.zIndex - (targets.length - index))
    const cx = target.x + target.width / 2
    const cy = target.y + target.height / 2
    target.width *= phase === 3 && index === 0 ? 0.86 : 0.9
    target.height *= phase === 3 && index === 0 ? 0.86 : 0.9
    target.x = cx - target.width / 2
    target.y = cy - target.height / 2
    target.fontVw =
      Math.round(
        Math.max(
          MIN_FONT_VW,
          Math.min(target.fontVw, hero.fontVw * ratio, hero.fontVw - 1.6),
        ) * 100,
      ) / 100
  })
}

/** Penetração positiva = colisão (com folga `gap` em % da safe area). */
export function artisticAabbOverlap(
  a: ArtisticAabb,
  b: ArtisticAabb,
  gap = 0,
): { overlapX: number; overlapY: number } | null {
  const overlapX =
    Math.min(a.right, b.right) - Math.max(a.left, b.left) + gap
  const overlapY =
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + gap
  if (overlapX <= 0 || overlapY <= 0) return null
  return { overlapX, overlapY }
}

export function artisticTargetsCollide(
  targets: readonly ArtisticPhraseTarget[],
  gap = 1.25,
  aspect = 16 / 9,
): boolean {
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      if (
        artisticAabbOverlap(
          artisticTargetAabb(targets[i], aspect),
          artisticTargetAabb(targets[j], aspect),
          gap,
        )
      ) {
        return true
      }
    }
  }
  return false
}

/** true se o herói (leitura) vaza além de 5% do próprio texto. Apoio ignora. */
export function artisticTargetsExceedFrame(
  targets: readonly ArtisticPhraseTarget[],
  _hardBleed = ARTISTIC_HARD_BLEED_PCT,
  _minVisible = ARTISTIC_MIN_VISIBLE_RATIO,
  aspect = 16 / 9,
): boolean {
  for (const target of targets) {
    if (!artisticTargetWithinOverflowBudget(target, aspect)) return true
  }
  return false
}

function moveArtisticTarget(
  target: ArtisticPhraseTarget,
  dx: number,
  dy: number,
  aspect = 16 / 9,
): void {
  target.x += dx
  target.y += dy
  // Colisão manda: apoio pode sair da tela; só o herói é limitado a 5%.
  Object.assign(target, clampArtisticTarget(target, aspect))
}

/**
 * Separa AABBs do estado final. Prioridade: zero colisão.
 * Herói quase não se mexe; apoio é empurrado (pode vazar).
 */
function separateArtisticCollisions(
  targets: ArtisticPhraseTarget[],
  aspect = 16 / 9,
  gap = 1.6,
): void {
  if (targets.length < 2) return

  for (let iter = 0; iter < 40; iter += 1) {
    let moved = false
    for (let i = 0; i < targets.length; i += 1) {
      for (let j = i + 1; j < targets.length; j += 1) {
        const a = targets[i]
        const b = targets[j]
        const overlap = artisticAabbOverlap(
          artisticTargetAabb(a, aspect),
          artisticTargetAabb(b, aspect),
          gap,
        )
        if (!overlap) continue
        moved = true

        // Apoio cede quase todo o deslocamento; herói quase parado.
        const aMass = a.hero ? 12 : 1
        const bMass = b.hero ? 12 : 1
        const total = aMass + bMass
        const aCx = a.x + a.width / 2
        const aCy = a.y + a.height / 2
        const bCx = b.x + b.width / 2
        const bCy = b.y + b.height / 2

        if (overlap.overlapX <= overlap.overlapY) {
          const push = overlap.overlapX + 0.2
          if (aCx <= bCx) {
            moveArtisticTarget(a, (-push * bMass) / total, 0, aspect)
            moveArtisticTarget(b, (push * aMass) / total, 0, aspect)
          } else {
            moveArtisticTarget(a, (push * bMass) / total, 0, aspect)
            moveArtisticTarget(b, (-push * aMass) / total, 0, aspect)
          }
        } else {
          const push = overlap.overlapY + 0.2
          if (aCy <= bCy) {
            moveArtisticTarget(a, 0, (-push * bMass) / total, aspect)
            moveArtisticTarget(b, 0, (push * aMass) / total, aspect)
          } else {
            moveArtisticTarget(a, 0, (push * bMass) / total, aspect)
            moveArtisticTarget(b, 0, (-push * aMass) / total, aspect)
          }
        }
      }
    }
    if (!moved) return

    // Ainda colidindo: encolhe só o apoio (caixa + fonte).
    if (iter > 0 && iter % 5 === 0) {
      for (const target of targets) {
        if (target.hero) continue
        const cx = target.x + target.width / 2
        const cy = target.y + target.height / 2
        target.width *= 0.92
        target.height *= 0.92
        target.x = cx - target.width / 2
        target.y = cy - target.height / 2
        target.fontVw =
          Math.round(Math.max(MIN_FONT_VW, target.fontVw * 0.92) * 100) / 100
        Object.assign(target, clampArtisticTarget(target, aspect))
      }
    }
  }
}

/**
 * FINAL-STATE-FIRST: adensa o herói o máximo possível (caixa + fonte) para
 * preencher o espaço livre, parando só quando colidiria ou vazaria além do
 * orçamento. O apoio ganha um empurrão mínimo. Overflow é vetado no herói
 * (≤1% do texto); colisão é vetada sempre.
 */
function densifyArtisticLayout(
  targets: ArtisticPhraseTarget[],
  aspect = 16 / 9,
  gap = 1.6,
): void {
  if (targets.length < 2) {
    if (targets[0]) {
      const before = { ...targets[0] }
      targets[0].fontVw =
        Math.round(
          Math.min(targets[0].fontVw * 1.12, targets[0].fontVw + 0.75) * 100,
        ) / 100
      const cx = targets[0].x + targets[0].width / 2
      const cy = targets[0].y + targets[0].height / 2
      targets[0].width = Math.min(98, targets[0].width * 1.06)
      targets[0].height = Math.min(92, targets[0].height * 1.06)
      targets[0].x = cx - targets[0].width / 2
      targets[0].y = cy - targets[0].height / 2
      Object.assign(targets[0], clampArtisticTarget(targets[0], aspect))
      if (
        artisticTargetsExceedFrame(targets, undefined, undefined, aspect) ||
        !artisticTargetWithinOverflowBudget(targets[0], aspect)
      ) {
        Object.assign(targets[0], before)
      }
    }
    return
  }

  // Cresce a CAIXA do herói (+ fonte proporcional) em direção ao espaço livre.
  for (let step = 0; step < 6; step += 1) {
    const hero = targets.find((target) => target.hero)
    if (!hero) break
    const before = { ...hero }
    const cx = hero.x + hero.width / 2
    const cy = hero.y + hero.height / 2
    hero.width = Math.min(98, hero.width * 1.04)
    hero.height = Math.min(94, hero.height * 1.035)
    hero.fontVw = Math.round(hero.fontVw * 1.035 * 100) / 100
    hero.x = cx - hero.width / 2
    hero.y = cy - hero.height / 2
    Object.assign(hero, clampArtisticTarget(hero, aspect))
    if (
      artisticTargetsCollide(targets, gap, aspect) ||
      artisticTargetsExceedFrame(targets, undefined, undefined, aspect)
    ) {
      Object.assign(hero, before)
      break
    }
  }

  // Adensa a fonte (herói forte, apoio leve) enquanto couber.
  for (let step = 0; step < 5; step += 1) {
    const snapshots = targets.map((target) => ({ ...target }))
    for (const target of targets) {
      const bump = target.hero ? 1.05 : 1.015
      target.fontVw = Math.round(target.fontVw * bump * 100) / 100
      Object.assign(target, clampArtisticTarget(target, aspect))
    }
    if (
      artisticTargetsCollide(targets, gap, aspect) ||
      artisticTargetsExceedFrame(targets, undefined, undefined, aspect)
    ) {
      targets.forEach((target, index) => {
        Object.assign(target, snapshots[index])
      })
      break
    }
  }
}

function shrinkSupportForClearance(
  targets: ArtisticPhraseTarget[],
  aspect = 16 / 9,
): void {
  for (const target of targets) {
    if (target.hero) continue
    const cx = target.x + target.width / 2
    const cy = target.y + target.height / 2
    target.width *= 0.9
    target.height *= 0.9
    target.fontVw =
      Math.round(Math.max(MIN_FONT_VW, target.fontVw * 0.9) * 100) / 100
    target.x = cx - target.width / 2
    target.y = cy - target.height / 2
    Object.assign(target, clampArtisticTarget(target, aspect))
  }
}

/** Estado final: zero colisão garantida; overflow do herói ≤1% do texto. */
export function finalizeArtisticPhaseTargets(
  targets: ArtisticPhraseTarget[],
  aspect = 16 / 9,
  gap = 1.6,
): void {
  if (!targets.length) return
  for (let round = 0; round < 4; round += 1) {
    separateArtisticCollisions(targets, aspect, gap)
    if (round === 0) densifyArtisticLayout(targets, aspect, gap)
    separateArtisticCollisions(targets, aspect, gap)
    for (const target of targets) {
      Object.assign(target, clampArtisticTarget(target, aspect))
    }
    if (!artisticTargetsCollide(targets, gap, aspect)) break
  }

  // Garantia dura: encolhe apoio até limpar colisão (ou esgotar).
  for (
    let guard = 0;
    guard < 24 && artisticTargetsCollide(targets, gap, aspect);
    guard += 1
  ) {
    shrinkSupportForClearance(targets, aspect)
    separateArtisticCollisions(targets, aspect, gap)
    for (const target of targets) {
      Object.assign(target, clampArtisticTarget(target, aspect))
    }
  }

  // Herói por último: clamp pode mover — se reintroduzir colisão, apoio cede de novo.
  for (const target of targets) {
    if (target.hero) Object.assign(target, clampArtisticTarget(target, aspect))
  }
  for (
    let guard = 0;
    guard < 12 && artisticTargetsCollide(targets, gap, aspect);
    guard += 1
  ) {
    shrinkSupportForClearance(targets, aspect)
    separateArtisticCollisions(targets, aspect, gap)
    for (const target of targets) {
      Object.assign(target, clampArtisticTarget(target, aspect))
    }
  }
}

export function artisticSeed(source: string | number): number {
  return typeof source === 'number'
    ? Math.max(0, Math.floor(source)) >>> 0
    : hashString(source)
}

export function createArtisticLayoutPlan(input: {
  phrases: string[]
  seed: string | number
  keywords?: string[]
  /** Força tentar templates de composição (corner yield) quando aplicável. */
  preferCornerYield?: boolean
}): ArtisticLayoutPlan {
  const phrases = input.phrases
    .slice(0, 3)
    .map((phrase) => String(phrase || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const seed = artisticSeed(input.seed)
  let grammar =
    ARTISTIC_VARIATIONS[seed % ARTISTIC_VARIATIONS.length] ||
    ARTISTIC_VARIATIONS[0]
  const phase = Math.max(1, Math.min(3, phrases.length || 1)) as ArtisticPhase
  const keywordSet = new Set(
    normalizeArtisticKeywords(input.keywords || []).map(normalizedToken),
  )

  // Templates de composição (corner yield): ativam quando o apoio é curto o
  // bastante (gate em selectCompositionTemplate) OU o caller força
  // preferCornerYield. Blocos de texto continuam landscape (makeBlocks) para
  // não remonta ao promover — o retrato é só região + CSS is-portrait-stack.
  const compTemplate = selectCompositionTemplate({
    seed,
    phase,
    phrases,
    preferCornerYield: input.preferCornerYield,
  })
  const compSlots =
    compTemplate && phase >= 2 ? compTemplate.phases[phase] : null

  const buildPhrasePlans = (
    selectedGrammar: Grammar,
    slots: readonly CompositionSlot[] | null,
  ) => {
    const twoRects = phaseTwoRects(selectedGrammar)
    return phrases.map((text, index): ArtisticPhrasePlan => {
      // Seed só da frase (sem índice): promover não remonta blocos/keywords.
      const phraseSeed = seed ^ hashString(text)
      // `slots` já é específico da fase atual (compTemplate.phases[phase]).
      const slot = resolveCompositionSlot(slots ? slots[index] : undefined, text)
      const blocks = makeBlocks(text, keywordSet, phraseSeed, phase === 1)
      const targets: Partial<Record<ArtisticPhase, ArtisticPhraseTarget>> = {}

      if (index === 0) {
        targets[1] = targetFor(blocks, r(2, 4, 96, 90), {
          cap: 7.6,
          scale: 1.1,
          rotationDeg: phraseRotation(seed, index, 1, false),
          align: selectedGrammar.align[0],
          zIndex: 3,
          hero: true,
          stamp: false,
          opacity: 1,
        })
      }
      if (index <= 1) {
        const slot2 = phase === 2 ? slot : undefined
        const isHero = slot2 ? slot2.role === 'hero' : index === 1
        targets[2] = targetFor(blocks, slot2 ? slot2.region : twoRects[index], {
          cap: isHero ? 7.4 : 3.8,
          scale: slot2 ? slot2.scale : isHero ? 1.14 : 0.72,
          rotationDeg: phraseRotation(seed, index, 2, false),
          align: slot2
            ? slot2.align
            : isHero
              ? selectedGrammar.align[1]
              : selectedGrammar.align[0],
          zIndex: isHero ? 4 : 2,
          hero: isHero,
          stamp: false,
          opacity: slot2 ? slot2.opacity : isHero ? 1 : 0.58,
          orientation: slot2?.orientation,
          anchor: slot2?.anchor,
          motionRecipeHint: slot2?.motionRecipeHint,
        })
      }

      const slot3 = phase === 3 ? slot : undefined
      const isHero = slot3 ? slot3.role === 'hero' : index === 2
      const stamp = slot3
        ? isHero && (compTemplate?.stampFinal ?? false)
        : index === 2
      const grammarScale = 1 + (selectedGrammar.scale[index] - 1) * 0.4
      const recencyScale = index === 2 ? 1.16 : index === 1 ? 0.74 : 0.58
      targets[3] = targetFor(blocks, slot3 ? slot3.region : selectedGrammar.regions[index], {
        cap: isHero ? 6.8 : index === 1 ? 3.9 : 3.2,
        scale: slot3 ? slot3.scale : grammarScale * recencyScale,
        rotationDeg: phraseRotation(seed, index, 3, stamp),
        align: slot3 ? slot3.align : selectedGrammar.align[index],
        zIndex: isHero ? 9 : index + 1,
        hero: isHero,
        stamp,
        opacity: slot3 ? slot3.opacity : isHero ? 1 : index === 1 ? 0.62 : 0.48,
        orientation: slot3?.orientation,
        anchor: slot3?.anchor,
        motionRecipeHint: slot3?.motionRecipeHint,
      })

      return {
        id: `p-${hashString(text)}-${index}`,
        text,
        enterEffect: phraseEnterEffect(phraseSeed, stamp),
        landBlink: phraseLandBlink(phraseSeed),
        blocks,
        targets,
      }
    })
  }

  let phrasePlans = buildPhrasePlans(grammar, compSlots)

  const recoveryReasonFor = (
    plans: ArtisticPhrasePlan[],
  ): string | undefined => {
    const currentTargets = plans
      .map((phrase) => phrase.targets[phase])
      .filter((target): target is ArtisticPhraseTarget => Boolean(target))
    if (!phrases.length || currentTargets.length !== phrases.length) {
      return 'plano incompleto'
    }
    if (plans.some((phrase) => !phrase.blocks.length)) {
      return 'frase sem blocos'
    }
    // Apoio em coluna-retrato pode estimar fonte < MIN antes de o enforce a
    // pisar no chão (>= MIN). Não é motivo de recuperação.
    const belowMin = currentTargets.some(
      (target) =>
        target.fontVw < MIN_FONT_VW &&
        !(target.orientation === 'portrait-stack' && !target.hero),
    )
    if (belowMin) {
      return 'fonte abaixo do mínimo legível'
    }
    return undefined
  }

  const recoveryReason = recoveryReasonFor(phrasePlans)

  // Uma região estreita não deve desmontar o mosaico inteiro. Recupera com
  // uma composição artística conservadora, sem nunca voltar a faixas fixas.
  if (
    recoveryReason &&
    grammar.id !== SAFE_ARTISTIC_VARIATION.id
  ) {
    grammar = SAFE_ARTISTIC_VARIATION
    // Na recuperação, abandona o template de composição e usa o grid seguro.
    phrasePlans = buildPhrasePlans(grammar, null)
  }
  enforceCurrentHeroHierarchy(phrasePlans, phase, seed)
  const phaseTargets = phrasePlans
    .map((phrase) => phrase.targets[phase])
    .filter((target): target is ArtisticPhraseTarget => Boolean(target))
  finalizeArtisticPhaseTargets(phaseTargets)
  // Mantém hierarquia de tamanho após densificar / separar.
  enforceCurrentHeroHierarchy(phrasePlans, phase, seed)
  finalizeArtisticPhaseTargets(phaseTargets)

  return {
    version: 1,
    seed,
    variationId: grammar.id,
    phase,
    exitMode: ((seed >>> 5) & 1) === 0 ? 'block' : 'individual',
    phrases: phrasePlans,
    recovered: Boolean(recoveryReason),
    ...(recoveryReason ? { recoveryReason } : null),
  }
}
