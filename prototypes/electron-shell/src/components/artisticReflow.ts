import type { ArtisticPhraseTarget } from '../theme/artisticLayout'

export type ArtisticReflowMotion = 'growing' | 'shrinking' | null

function normalizedPhraseText(phraseLines: readonly string[]): string {
  return phraseLines.join(' ').replace(/\s+/g, ' ').trim()
}

/** Keeps an on-screen artistic phrase mounted when its stack position changes. */
export function artisticPhraseContentId(
  phraseLines: readonly string[],
): string {
  return `art:${normalizedPhraseText(phraseLines)}`
}

/**
 * IDs únicos por ocorrência — frases repetidas (Aleluia×2) não colapsam
 * no Map/Set do LyricStage.
 */
export function artisticSlotContentIds(
  slots: readonly (readonly string[])[],
): string[] {
  const seen = new Map<string, number>()
  return slots.map((phraseLines) => {
    const base = artisticPhraseContentId(phraseLines)
    const n = seen.get(base) || 0
    seen.set(base, n + 1)
    return n ? `${base}#${n}` : base
  })
}

/** Compares phrase identities as a multiset, independent of stack order. */
export function sameArtisticPhraseSet(
  previousIds: readonly string[],
  nextIds: readonly string[],
): boolean {
  if (previousIds.length !== nextIds.length) return false

  const counts = new Map<string, number>()
  for (const id of previousIds) {
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  for (const id of nextIds) {
    const count = counts.get(id)
    if (!count) return false
    if (count === 1) counts.delete(id)
    else counts.set(id, count - 1)
  }
  return counts.size === 0
}

export function artisticReflowMotion(
  previous: ArtisticPhraseTarget,
  next: ArtisticPhraseTarget,
): ArtisticReflowMotion {
  // Promoção/democao de hero: anima o caminho inverso no mosaico.
  if (previous.hero !== next.hero) {
    return next.hero ? 'growing' : 'shrinking'
  }

  const fontDelta = next.fontVw - previous.fontVw
  if (Math.abs(fontDelta) > 0.01) {
    return fontDelta > 0 ? 'growing' : 'shrinking'
  }

  const areaDelta =
    next.width * next.height - previous.width * previous.height
  if (Math.abs(areaDelta) > 1) {
    return areaDelta > 0 ? 'growing' : 'shrinking'
  }

  const opacityDelta = (next.opacity ?? 1) - (previous.opacity ?? 1)
  if (Math.abs(opacityDelta) > 0.04) {
    return opacityDelta > 0 ? 'growing' : 'shrinking'
  }
  return null
}
