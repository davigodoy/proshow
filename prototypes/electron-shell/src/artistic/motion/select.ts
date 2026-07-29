import { MOTION_BANK } from './bank.ts'
import { findRecipe } from './contract.ts'
import type { MotionAssignment, MotionRecipe, MotionRole } from './types.ts'

/** FNV-1a — mesmo espírito do helper interno de artisticLayout.ts. */
export function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** PRNG determinístico (mulberry32) — igual ao de artisticLayout.ts. */
export function randomFor(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Sais por "quando": desacoplam as escolhas de enter/exit/reflow do mesmo seed.
const ENTER_SALT = 0x5a170001
const EXIT_SALT = 0x5a170002

/** Curto o suficiente para caber num pivô de canto (coluna estreita). */
const PIVOT_MAX_LETTERS = 18
const PIVOT_MAX_BLOCKS = 3

export type SelectMotionInput = {
  phraseText: string
  seed: number
  phase: 1 | 2 | 3
  role: MotionRole
  stamp: boolean
  reverse: boolean
  letters: number
  blocks: number
}

function recipesFor(when: MotionRecipe['when'][number]): MotionRecipe[] {
  return MOTION_BANK.filter((recipe) => recipe.when.includes(when))
}

/** Escolha determinística ponderada por `weight` (default 1). */
function weightedPick(
  recipes: readonly MotionRecipe[],
  rng: () => number,
  fallbackId: string,
): string {
  if (recipes.length === 0) return fallbackId
  const total = recipes.reduce(
    (sum, recipe) => sum + Math.max(0, recipe.weight ?? 1),
    0,
  )
  if (total <= 0) return fallbackId
  let ticket = rng() * total
  for (const recipe of recipes) {
    ticket -= Math.max(0, recipe.weight ?? 1)
    if (ticket < 0) return recipe.id
  }
  return recipes[recipes.length - 1]?.id ?? fallbackId
}

/**
 * Seleciona um trio de receitas (enter/reflow/exit) de forma determinística.
 *
 * Determinismo: `seed ^ hash(phraseText) ^ whenSalt`. Mesmos argumentos →
 * mesma atribuição. Regras artísticas fortes:
 *  - `stamp` força a entrada `carimbo`.
 *  - apoio curto na fase ≥2 pivota para o canto (`pivot-canto`).
 *  - `reverse` (herói voltando ao foco) prefere `crescer-heroi` no reflow.
 */
export function selectMotion(input: SelectMotionInput): MotionAssignment {
  const {
    phraseText,
    seed,
    phase,
    role,
    stamp,
    reverse,
    letters,
    blocks,
  } = input

  const base = (seed >>> 0) ^ hashString(phraseText)

  // ── ENTER ──────────────────────────────────────────────────────────────
  const enterRecipeId = stamp
    ? 'carimbo'
    : weightedPick(
        recipesFor('enter'),
        randomFor(base ^ ENTER_SALT),
        'subida-suave',
      )

  // ── EXIT ───────────────────────────────────────────────────────────────
  const exitRecipeId = weightedPick(
    recipesFor('exit').filter((recipe) => recipe.id.startsWith('dispersar')),
    randomFor(base ^ EXIT_SALT),
    'dispersar-fade',
  )

  // ── REFLOW ─────────────────────────────────────────────────────────────
  const shortSupport =
    letters <= PIVOT_MAX_LETTERS && blocks <= PIVOT_MAX_BLOCKS
  let reflowRecipeId: string
  if (role === 'support' && shortSupport && phase >= 2) {
    // Apoio curto: pivota para o canto liberando o eixo horizontal ao herói.
    reflowRecipeId = 'pivot-canto'
  } else if (reverse) {
    // Herói retomando o foco: cresce de volta.
    reflowRecipeId = 'crescer-heroi'
  } else {
    reflowRecipeId = role === 'hero' ? 'crescer-heroi' : 'ceder-encolhendo'
  }

  const geometry = findRecipe(reflowRecipeId)?.geometry

  return {
    enterRecipeId,
    reflowRecipeId,
    exitRecipeId,
    ...(geometry ? { geometry } : null),
  }
}
