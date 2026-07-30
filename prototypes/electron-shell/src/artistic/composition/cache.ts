/**
 * Cache de composição artística: um cálculo por fase do trio; promote só
 * remapeia assentos salvos (origem → destino), sem novo createArtisticLayoutPlan.
 *
 * Tipografia do cartaz: ratio fontVw/largura congelado por frase. Herói e apoio
 * só mudam caixa/opacidade — a quebra interna (wrap dos blocos) permanece.
 *
 * Sessão = seed (+ layout version). Keywords NÃO invalidam o mosaico: edição
 * ao vivo só pinta word.keyword (ênfase), sem recalcular assentos/quebras.
 *
 * COMPOSITION_LAYOUT_VERSION entra na sessionKey: muda o algoritmo de quebra
 * → cache antigo invalida sem reiniciar o app.
 */
import type {
  ArtisticAlign,
  ArtisticExitMode,
  ArtisticLayoutPlan,
  ArtisticPhase,
  ArtisticPhrasePlan,
  ArtisticPhraseTarget,
  ArtisticVariationId,
} from '../../theme/artisticLayout.ts'
import {
  artisticSeed,
  createArtisticLayoutPlan,
  enforceCurrentHeroHierarchy,
  normalizeArtisticKeywords,
  paintArtisticKeywordFlags,
  refitArtisticTargetForBlocks,
} from '../../theme/artisticLayout.ts'
import { artisticSlotContentIds } from '../../components/artisticReflow.ts'
import { isShortSupport } from './select.ts'

/** Bump quando makeBlocks / ritmo de quebra / tipografia congelada mudam. */
export const COMPOSITION_LAYOUT_VERSION = 5

export type CompositionSeat = {
  readonly target: Readonly<ArtisticPhraseTarget>
}

export type CompositionSeatTable = {
  readonly phase: ArtisticPhase
  /** seats[0] = apoio mais antigo; seats[last] = herói. */
  readonly seats: ReadonlyArray<CompositionSeat>
  /**
   * Tipografia por frase×assento: caixa do assento + fontVw das quebras da frase.
   */
  readonly fittedByPhrase: ReadonlyMap<
    string,
    ReadonlyArray<ArtisticPhraseTarget>
  >
  readonly exitMode: ArtisticExitMode
  readonly variationId: ArtisticVariationId
  readonly seed: number
  readonly recovered: boolean
  readonly recoveryReason?: string
}

export type FrozenPhrasePlan = {
  readonly id: string
  readonly text: string
  readonly blocks: ArtisticPhrasePlan['blocks']
  readonly enterEffect: ArtisticPhrasePlan['enterEffect']
  readonly landBlink: boolean
  /**
   * Tipografia do cartaz — uma só para herói e apoio. Promote/demote só muda
   * caixa/opacidade, não o layout interno (align/rotação/quebras).
   * layoutFontVw @ layoutWidth define o ritmo do wrap; nos outros assentos
   * fontVw escala com a largura para manter a mesma quebra.
   */
  readonly layoutAlign?: ArtisticAlign
  readonly layoutRotationDeg?: number
  readonly layoutFontVw?: number
  readonly layoutWidth?: number
}

export type CompositionEntry = {
  readonly id: string
  readonly text: string
}

/**
 * Sessão do mosaico (= seed). Cresce de fase 1→3 sem trocar de sessão;
 * promote só reordena. Trio novo / música nova muda o seed (origin).
 * Keywords editadas ao vivo não trocam a sessão.
 */
export type CompositionSessionKey = string

export type CompositionCache = {
  readonly sessionKey: CompositionSessionKey
  readonly seed: number
  readonly keywords: ReadonlyArray<string>
  /** Ordem de entrada na composição (congelada; promote não altera). */
  readonly entryOrder: ReadonlyArray<CompositionEntry>
  readonly phrasePlans: ReadonlyMap<string, FrozenPhrasePlan>
  readonly seatTables: ReadonlyMap<ArtisticPhase, CompositionSeatTable>
}

function normalizePhrase(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function occurrenceIds(phrases: readonly string[]): string[] {
  return artisticSlotContentIds(phrases.map((phrase) => [phrase]))
}

export function compositionSessionKey(
  seed: string | number,
  _keywords: readonly string[] = [],
): CompositionSessionKey {
  const numericSeed = artisticSeed(seed)
  // Keywords propositalmente fora da chave: editar a lista ao vivo não
  // recalcula o mosaico (só pinta ênfase nas palavras).
  return `v${COMPOSITION_LAYOUT_VERSION}\x01${numericSeed}`
}

function sortedKeywordList(keywords: readonly string[]): string[] {
  return normalizeArtisticKeywords([...keywords])
    .map(normalizePhrase)
    .filter(Boolean)
    .sort()
}

function sameKeywordList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Pinta keywords nos blocos congelados sem tocar assentos/tipografia. */
function refreshCacheKeywords(
  cache: CompositionCache,
  keywords: readonly string[],
): CompositionCache {
  const sorted = sortedKeywordList(keywords)
  if (sameKeywordList(cache.keywords, sorted)) return cache
  const phrasePlans = new Map<string, FrozenPhrasePlan>()
  for (const [id, frozen] of cache.phrasePlans) {
    phrasePlans.set(id, {
      ...frozen,
      blocks: paintArtisticKeywordFlags(frozen.blocks, sorted),
    })
  }
  return {
    ...cache,
    keywords: sorted,
    phrasePlans,
  }
}

function samePhraseMultiset(
  a: readonly CompositionEntry[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false
  const idsA = a.map((entry) => entry.id)
  const idsB = occurrenceIds(b)
  const counts = new Map<string, number>()
  for (const id of idsA) counts.set(id, (counts.get(id) || 0) + 1)
  for (const id of idsB) {
    const n = counts.get(id)
    if (!n) return false
    if (n === 1) counts.delete(id)
    else counts.set(id, n - 1)
  }
  return counts.size === 0
}

function isSupersetGrowth(
  entryOrder: readonly CompositionEntry[],
  displayPhrases: readonly string[],
): boolean {
  if (displayPhrases.length <= entryOrder.length) return false
  const displayIds = occurrenceIds(displayPhrases)
  const counts = new Map<string, number>()
  for (const id of displayIds) counts.set(id, (counts.get(id) || 0) + 1)
  for (const entry of entryOrder) {
    const n = counts.get(entry.id)
    if (!n) return false
    counts.set(entry.id, n - 1)
  }
  return true
}

function extendEntryOrder(
  existing: readonly CompositionEntry[],
  displayPhrases: readonly string[],
): CompositionEntry[] {
  const displayIds = occurrenceIds(displayPhrases)
  const next = [...existing]
  const seen = new Map<string, number>()
  for (const entry of existing) {
    seen.set(entry.id, (seen.get(entry.id) || 0) + 1)
  }
  for (let i = 0; i < displayPhrases.length; i += 1) {
    const id = displayIds[i]
    const have = seen.get(id) || 0
    if (have > 0) {
      seen.set(id, have - 1)
      continue
    }
    next.push({ id, text: displayPhrases[i] })
    seen.set(id, 0)
  }
  return next
}

function buildSeats(plan: ArtisticLayoutPlan): CompositionSeat[] {
  return plan.phrases.map((phrase) => ({
    target: { ...phrase.targets[plan.phase]! },
  }))
}

/**
 * Assento portrait só cabe frase curta. No promote, frase longa no slot
 * retrato vira faixa landscape no mesmo canto — sem novo solver.
 */
export function adaptSeatTargetForPhrase(
  target: Readonly<ArtisticPhraseTarget>,
  phrase: string,
): ArtisticPhraseTarget {
  const next = { ...target }
  if (next.orientation !== 'portrait-stack') return next
  if (isShortSupport(phrase)) return next

  const leftEdge =
    next.anchor === 'edge-left' ||
    next.anchor === 'tl' ||
    next.anchor === 'bl' ||
    next.x < 30
  const rightEdge =
    next.anchor === 'edge-right' ||
    next.anchor === 'tr' ||
    next.anchor === 'br' ||
    next.x > 55

  if (leftEdge) {
    return {
      ...next,
      orientation: 'landscape',
      anchor: 'none',
      motionRecipeHint: undefined,
      x: 2,
      y: Math.max(4, Math.min(next.y, 58)),
      width: 30,
      height: Math.min(36, Math.max(24, next.height * 0.42)),
      align: 'left',
    }
  }
  if (rightEdge) {
    return {
      ...next,
      orientation: 'landscape',
      anchor: 'none',
      motionRecipeHint: undefined,
      x: 68,
      y: Math.max(4, Math.min(next.y, 58)),
      width: 30,
      height: Math.min(36, Math.max(24, next.height * 0.42)),
      align: 'right',
    }
  }
  return {
    ...next,
    orientation: 'landscape',
    anchor: 'none',
    motionRecipeHint: undefined,
    width: Math.max(next.width, 36),
    height: Math.min(next.height, 28),
  }
}

/** Tipografia + align/rotação do cartaz; fontVw proporcional à largura do assento. */
function applyFrozenLayout(
  target: ArtisticPhraseTarget,
  frozen: FrozenPhrasePlan,
): { target: ArtisticPhraseTarget; frozen: FrozenPhrasePlan } {
  let nextFrozen = frozen
  if (
    nextFrozen.layoutAlign == null ||
    nextFrozen.layoutFontVw == null ||
    nextFrozen.layoutWidth == null
  ) {
    nextFrozen = {
      ...nextFrozen,
      layoutAlign: nextFrozen.layoutAlign ?? target.align,
      layoutRotationDeg: nextFrozen.layoutRotationDeg ?? target.rotationDeg,
      layoutFontVw: nextFrozen.layoutFontVw ?? target.fontVw,
      layoutWidth: nextFrozen.layoutWidth ?? Math.max(target.width, 1),
    }
  }
  const layoutWidth = Math.max(nextFrozen.layoutWidth!, 1)
  const width = Math.max(target.width, 1)
  const fontVw =
    Math.round(nextFrozen.layoutFontVw! * (width / layoutWidth) * 100) / 100
  return {
    frozen: nextFrozen,
    target: {
      ...target,
      align: nextFrozen.layoutAlign!,
      rotationDeg: nextFrozen.layoutRotationDeg ?? target.rotationDeg,
      fontVw,
    },
  }
}

/** Uma passagem: mesma quebra em todo assento (fontVw ∝ largura). */
function buildFittedByPhrase(
  seats: readonly CompositionSeat[],
  entries: readonly CompositionEntry[],
  phrasePlans: Map<string, FrozenPhrasePlan>,
): Map<string, ArtisticPhraseTarget[]> {
  const fitted = new Map<string, ArtisticPhraseTarget[]>()
  const heroSeat = seats[seats.length - 1]
  for (const entry of entries) {
    let frozen = phrasePlans.get(entry.id)
    if (!frozen || !heroSeat) continue
    // Referência = cartaz desta frase no assento herói (não o fontVw de outra).
    if (frozen.layoutFontVw == null || frozen.layoutWidth == null) {
      const heroBase = refitArtisticTargetForBlocks(
        adaptSeatTargetForPhrase(heroSeat.target, entry.text),
        frozen.blocks,
      )
      const seeded = applyFrozenLayout(heroBase, {
        ...frozen,
        layoutFontVw: undefined,
        layoutWidth: undefined,
      })
      frozen = seeded.frozen
      phrasePlans.set(entry.id, frozen)
    } else if (frozen.layoutAlign == null) {
      const seeded = applyFrozenLayout(
        adaptSeatTargetForPhrase(heroSeat.target, entry.text),
        frozen,
      )
      frozen = seeded.frozen
      phrasePlans.set(entry.id, frozen)
    }
    fitted.set(
      entry.id,
      seats.map((seat) => {
        const applied = applyFrozenLayout(
          adaptSeatTargetForPhrase(seat.target, entry.text),
          frozen!,
        )
        frozen = applied.frozen
        phrasePlans.set(entry.id, frozen)
        return applied.target
      }),
    )
  }
  return fitted
}

function freezeFromPlan(
  plan: ArtisticLayoutPlan,
  entries: readonly CompositionEntry[],
  previous?: ReadonlyMap<string, FrozenPhrasePlan>,
): Map<string, FrozenPhrasePlan> {
  const phrasePlans = new Map(previous || [])
  for (let i = 0; i < plan.phrases.length; i += 1) {
    const phrase = plan.phrases[i]
    const entry = entries[i]
    if (!entry) continue
    const target = phrase.targets[plan.phase]
    if (!target) continue

    const existing = phrasePlans.get(entry.id)
    const isHeroPhrase = i === plan.phrases.length - 1
    if (!existing) {
      phrasePlans.set(entry.id, {
        id: phrase.id,
        text: phrase.text,
        blocks: phrase.blocks,
        enterEffect: phrase.enterEffect,
        landBlink: phrase.landBlink,
        layoutAlign: target.align,
        layoutRotationDeg: target.rotationDeg,
        // Tipografia de referência só do papel herói; apoio espera o refit no hero seat.
        ...(isHeroPhrase
          ? {
              layoutFontVw: target.fontVw,
              layoutWidth: Math.max(target.width, 1),
            }
          : null),
      })
      continue
    }

    // `-readonly` porque o patch é montado campo a campo antes de virar um
    // FrozenPhrasePlan novo; o congelado continua imutável.
    const patch: { -readonly [K in keyof FrozenPhrasePlan]?: FrozenPhrasePlan[K] } = {}
    if (existing.layoutAlign == null) {
      patch.layoutAlign = target.align
      patch.layoutRotationDeg = target.rotationDeg
    }
    if (
      isHeroPhrase &&
      (existing.layoutFontVw == null || existing.layoutWidth == null)
    ) {
      patch.layoutFontVw = target.fontVw
      patch.layoutWidth = Math.max(target.width, 1)
    }
    if (Object.keys(patch).length) {
      phrasePlans.set(entry.id, { ...existing, ...patch })
    }
  }
  return phrasePlans
}

/**
 * Obtém ou cria o cache da composição.
 *
 * Chama `createArtisticLayoutPlan` só quando:
 * - sessão nova (seed), ou
 * - a fase cresce (1→2→3).
 *
 * Promote (mesmo conjunto, outra ordem) devolve o mesmo cache, sem recalcular.
 * Só keywords mudaram → pinta ênfase, mantém assentos e quebras.
 */
export function getOrCreateArtisticComposition(
  cache: CompositionCache | null,
  phrases: readonly string[],
  seed: string | number,
  keywords: readonly string[] = [],
): CompositionCache {
  const normalizedPhrases = phrases
    .map(normalizePhrase)
    .filter(Boolean)
    .slice(0, 3)
  const numericSeed = artisticSeed(seed)
  const sortedKeywords = sortedKeywordList(keywords)
  const sessionKey = compositionSessionKey(numericSeed)

  if (!normalizedPhrases.length) {
    return {
      sessionKey,
      seed: numericSeed,
      keywords: sortedKeywords,
      entryOrder: [],
      phrasePlans: new Map(),
      seatTables: new Map(),
    }
  }

  const phase = normalizedPhrases.length as ArtisticPhase

  // Mesma sessão + mesmo conjunto (promote / keyword edit).
  if (
    cache &&
    cache.sessionKey === sessionKey &&
    samePhraseMultiset(cache.entryOrder, normalizedPhrases) &&
    cache.seatTables.has(phase)
  ) {
    return refreshCacheKeywords(cache, sortedKeywords)
  }

  // Mesma sessão + crescimento de fase: um cálculo só para a fase nova.
  const growing =
    Boolean(cache) &&
    cache!.sessionKey === sessionKey &&
    isSupersetGrowth(cache!.entryOrder, normalizedPhrases)

  const entryOrder = growing
    ? extendEntryOrder(cache!.entryOrder, normalizedPhrases)
    : occurrenceIds(normalizedPhrases).map((id, index) => ({
        id,
        text: normalizedPhrases[index],
      }))

  const canonicalPhrases = entryOrder.slice(0, phase).map((entry) => entry.text)
  const canonicalPlan = createArtisticLayoutPlan({
    phrases: canonicalPhrases,
    seed: numericSeed,
    keywords: [...sortedKeywords],
  })

  const seats = buildSeats(canonicalPlan)
  const phrasePlans = freezeFromPlan(
    canonicalPlan,
    entryOrder.slice(0, phase),
    growing ? cache!.phrasePlans : undefined,
  )
  // Se cresceu com keywords novas, pinta também as frases já congeladas.
  if (growing && !sameKeywordList(cache!.keywords, sortedKeywords)) {
    for (const [id, frozen] of phrasePlans) {
      phrasePlans.set(id, {
        ...frozen,
        blocks: paintArtisticKeywordFlags(frozen.blocks, sortedKeywords),
      })
    }
  }
  const fittedByPhrase = buildFittedByPhrase(
    seats,
    entryOrder.slice(0, phase),
    phrasePlans,
  )
  const seatTable: CompositionSeatTable = {
    phase: canonicalPlan.phase,
    seats,
    fittedByPhrase,
    exitMode: canonicalPlan.exitMode,
    variationId: canonicalPlan.variationId,
    seed: canonicalPlan.seed,
    recovered: canonicalPlan.recovered,
    ...(canonicalPlan.recoveryReason
      ? { recoveryReason: canonicalPlan.recoveryReason }
      : null),
  }
  const seatTables = new Map(growing ? cache!.seatTables : [])
  seatTables.set(seatTable.phase, seatTable)

  return {
    sessionKey,
    seed: numericSeed,
    keywords: sortedKeywords,
    entryOrder,
    phrasePlans,
    seatTables,
  }
}

/**
 * Monta o ArtisticLayoutPlan para a ordem de display atual.
 * Só remapeia assentos — não chama o solver.
 */
export function resolveArtisticPlanForOrder(
  cache: CompositionCache,
  displayOrder: readonly string[],
): ArtisticLayoutPlan {
  const phrases = displayOrder.map(normalizePhrase).filter(Boolean).slice(0, 3)
  const phase = phrases.length as ArtisticPhase
  const seatTable = cache.seatTables.get(phase)
  if (!seatTable) {
    throw new Error(
      `[CompositionCache] fase ${phase} ausente — chame getOrCreateArtisticComposition antes.`,
    )
  }

  const ids = occurrenceIds(phrases)
  const resolved: ArtisticPhrasePlan[] = phrases.map((text, seatIndex) => {
    const id = ids[seatIndex]
    const frozen = cache.phrasePlans.get(id)
    const seat = seatTable.seats[seatIndex]
    if (!frozen || !seat) {
      throw new Error(
        `[CompositionCache] frase/assento ausente text="${text}" seat=${seatIndex}`,
      )
    }
    const fitted =
      seatTable.fittedByPhrase.get(id)?.[seatIndex] ||
      applyFrozenLayout(
        adaptSeatTargetForPhrase(seat.target, text),
        frozen,
      ).target
    return {
      id: frozen.id,
      text: frozen.text,
      enterEffect: frozen.enterEffect,
      landBlink: frozen.landBlink,
      blocks: frozen.blocks,
      targets: {
        [phase]: { ...fitted },
      },
    }
  })

  // Hierarquia de caixa/opacidade; tipografia volta ao ratio congelado (mesma quebra).
  enforceCurrentHeroHierarchy(resolved, phase, seatTable.seed)
  for (let i = 0; i < resolved.length; i += 1) {
    const frozen = cache.phrasePlans.get(ids[i])
    const target = resolved[i].targets[phase]
    if (!frozen || !target) continue
    resolved[i].targets[phase] = applyFrozenLayout(target, frozen).target
  }

  return {
    version: 1,
    seed: seatTable.seed,
    variationId: seatTable.variationId,
    phase,
    exitMode: seatTable.exitMode,
    phrases: resolved,
    recovered: seatTable.recovered,
    ...(seatTable.recoveryReason
      ? { recoveryReason: seatTable.recoveryReason }
      : null),
  }
}

/** Atalho: atualiza cache e devolve o plano para a ordem atual. */
export function resolveCachedArtisticPlan(
  cache: CompositionCache | null,
  phrases: readonly string[],
  seed: string | number,
  keywords: readonly string[] = [],
): { cache: CompositionCache; plan: ArtisticLayoutPlan | null } {
  const next = getOrCreateArtisticComposition(cache, phrases, seed, keywords)
  if (!phrases.map(normalizePhrase).filter(Boolean).length) {
    return { cache: next, plan: null }
  }
  return { cache: next, plan: resolveArtisticPlanForOrder(next, phrases) }
}
