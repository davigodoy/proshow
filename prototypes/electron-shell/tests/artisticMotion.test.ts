import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MOTION_BANK,
  findRecipe,
  motionEnterClass,
  motionExitClass,
  motionReflowClass,
  selectMotion,
} from '../src/artistic/motion/index.ts'

/** Efeitos de entrada históricos (ArtisticEnterEffect em artisticLayout.ts). */
const LEGACY_ENTER_EFFECTS = [
  'stamp',
  'slam',
  'punch',
  'fade',
  'slide-up',
  'slide-left',
  'slide-right',
  'zoom-in',
  'soft-rise',
] as const

/** Efeitos de saída históricos (ArtisticExitEffect em artisticLayout.ts). */
const LEGACY_EXIT_EFFECTS = ['fade', 'left', 'right', 'up', 'down', 'zoom'] as const

test('every legacy enter effect maps to a recipe (legacyEnter or id)', () => {
  for (const effect of LEGACY_ENTER_EFFECTS) {
    const match = MOTION_BANK.find(
      (recipe) =>
        recipe.when.includes('enter') &&
        (recipe.legacyEnter === effect || recipe.id === effect),
    )
    assert.ok(match, `missing enter recipe for legacy effect "${effect}"`)
  }
})

test('every legacy exit effect maps to a recipe (legacyExit or id)', () => {
  for (const effect of LEGACY_EXIT_EFFECTS) {
    const match = MOTION_BANK.find(
      (recipe) =>
        recipe.when.includes('exit') &&
        (recipe.legacyExit === effect || recipe.id === effect),
    )
    assert.ok(match, `missing exit recipe for legacy effect "${effect}"`)
  }
})

test('recipe ids are unique', () => {
  const ids = MOTION_BANK.map((recipe) => recipe.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('selectMotion is deterministic for the same input', () => {
  const input = {
    phraseText: 'NÓS VIEMOS AQUI TE ADORAR',
    seed: 12345,
    phase: 3 as const,
    role: 'hero' as const,
    stamp: false,
    reverse: false,
    letters: 21,
    blocks: 5,
  }
  const a = selectMotion(input)
  const b = selectMotion({ ...input })
  assert.deepEqual(a, b)
})

test('different phrases can yield different enter recipes', () => {
  const common = {
    seed: 7,
    phase: 1 as const,
    role: 'hero' as const,
    stamp: false,
    reverse: false,
    letters: 10,
    blocks: 2,
  }
  const enters = new Set(
    [
      'AO ERGUERMOS AS MÃOS',
      'E CLAMARMOS A TI',
      'NÓS VIEMOS AQUI',
      'TUA GRAÇA ME BASTA',
      'SANTO É O SENHOR',
    ].map((phraseText) => selectMotion({ ...common, phraseText }).enterRecipeId),
  )
  assert.ok(enters.size > 1, 'seed/phrase mix should vary enter recipes')
})

test('stamp forces the carimbo enter recipe', () => {
  for (let seed = 0; seed < 24; seed += 1) {
    const assignment = selectMotion({
      phraseText: `frase ${seed}`,
      seed,
      phase: 3,
      role: 'hero',
      stamp: true,
      reverse: false,
      letters: 12,
      blocks: 3,
    })
    assert.equal(assignment.enterRecipeId, 'carimbo')
  }
})

test('short support in phase 2 always pivots to the corner', () => {
  for (let seed = 0; seed < 48; seed += 1) {
    const assignment = selectMotion({
      phraseText: `apoio ${seed}`,
      seed,
      phase: 2,
      role: 'support',
      stamp: false,
      reverse: false,
      letters: 12,
      blocks: 2,
    })
    assert.equal(
      assignment.reflowRecipeId,
      'pivot-canto',
      `seed ${seed}: short support phase 2 should pivot`,
    )
    assert.equal(assignment.geometry?.portraitStack, true)
    assert.equal(assignment.geometry?.yield, 'horizontal')
  }
})

test('reverse prefers the crescer-heroi reflow', () => {
  const assignment = selectMotion({
    phraseText: 'HERÓI VOLTA AO FOCO PARA ADORAR',
    seed: 99,
    phase: 3,
    role: 'support',
    stamp: false,
    reverse: true,
    letters: 30,
    blocks: 5,
  })
  assert.equal(assignment.reflowRecipeId, 'crescer-heroi')
})

test('reflow falls back to role default (crescer/ceder)', () => {
  const hero = selectMotion({
    phraseText: 'frase longa de herói que não pivota nunca aqui',
    seed: 3,
    phase: 3,
    role: 'hero',
    stamp: false,
    reverse: false,
    letters: 40,
    blocks: 6,
  })
  assert.equal(hero.reflowRecipeId, 'crescer-heroi')

  const support = selectMotion({
    phraseText: 'frase longa de apoio que não cabe em canto nenhum',
    seed: 3,
    phase: 3,
    role: 'support',
    stamp: false,
    reverse: false,
    letters: 40,
    blocks: 6,
  })
  assert.equal(support.reflowRecipeId, 'ceder-encolhendo')
})

test('contract helpers resolve class names with sensible fallbacks', () => {
  assert.equal(motionEnterClass('carimbo'), 'artistic-enter-stamp')
  assert.equal(motionEnterClass('subida-suave'), 'artistic-enter-soft-rise')
  assert.equal(motionEnterClass('does-not-exist'), 'artistic-enter-soft-rise')

  assert.equal(motionExitClass('dispersar-left'), 'artistic-exit-left')
  assert.equal(motionExitClass('does-not-exist'), 'artistic-exit-fade')

  assert.equal(motionReflowClass('crescer-heroi'), 'is-growing')
  assert.equal(motionReflowClass('ceder-encolhendo'), 'is-shrinking')
  assert.equal(motionReflowClass('pivot-canto'), 'is-pivoting is-shrinking')
  assert.equal(motionReflowClass(undefined), '')
  assert.equal(motionReflowClass('does-not-exist'), '')
})

test('findRecipe returns the matching recipe or undefined', () => {
  assert.equal(findRecipe('pivot-canto')?.id, 'pivot-canto')
  assert.equal(findRecipe('nope'), undefined)
})
