import assert from 'node:assert/strict'
import test from 'node:test'
import {
  artisticPhraseContentId,
  artisticReflowMotion,
  artisticSlotContentIds,
  sameArtisticPhraseSet,
} from '../src/components/artisticReflow.ts'
import { createArtisticLayoutPlan } from '../src/theme/artisticLayout.ts'

const PHRASES = [
  'AO ERGUERMOS AS MÃOS PRA ADORAR',
  'E CLAMARMOS A TI TU VIRÁS',
  'NÓS VIEMOS AQUI TE ADORAR',
]

const COMPOSITION_SEED = 'promote-reflow:0'

test('assigns unique content ids for repeated lyric phrases', () => {
  const ids = artisticSlotContentIds([
    ['Aleluia'],
    ['Aleluia'],
    ['Santo'],
  ])
  assert.deepEqual(ids, [
    'art:Aleluia',
    'art:Aleluia#1',
    'art:Santo',
  ])
  assert.equal(sameArtisticPhraseSet(ids, ids), true)
  assert.equal(
    sameArtisticPhraseSet(ids, ['art:Aleluia', 'art:Santo']),
    false,
  )
})

test('promoting a reduced phrase reverses size roles inside the same mosaic', () => {
  const initial = createArtisticLayoutPlan({
    phrases: PHRASES.slice(0, 2),
    seed: COMPOSITION_SEED,
  })
  const promotedOrder = [PHRASES[1], PHRASES[0]]
  const promoted = createArtisticLayoutPlan({
    phrases: promotedOrder,
    seed: COMPOSITION_SEED,
  })

  assert.equal(initial.variationId, promoted.variationId)
  assert.equal(initial.seed, promoted.seed)

  const firstId = artisticPhraseContentId([PHRASES[0]])
  const secondId = artisticPhraseContentId([PHRASES[1]])
  const before = new Map(
    initial.phrases.map((phrase) => [
      artisticPhraseContentId([phrase.text]),
      phrase.targets[2]!,
    ]),
  )
  const after = new Map(
    promoted.phrases.map((phrase) => [
      artisticPhraseContentId([phrase.text]),
      phrase.targets[2]!,
    ]),
  )

  const firstBefore = before.get(firstId)!
  const firstAfter = after.get(firstId)!
  const secondBefore = before.get(secondId)!
  const secondAfter = after.get(secondId)!

  // 1ª encolheu no canto; ao reclicar cresce de volta ao centro (herói).
  assert.equal(firstBefore.hero, false)
  assert.equal(firstAfter.hero, true)
  assert.ok(firstAfter.fontVw > firstBefore.fontVw)
  assert.ok((firstAfter.opacity ?? 1) > (firstBefore.opacity ?? 1))
  assert.equal(artisticReflowMotion(firstBefore, firstAfter), 'growing')

  // A do centro (2ª) sai do herói e encolhe para o canto.
  assert.equal(secondBefore.hero, true)
  assert.equal(secondAfter.hero, false)
  assert.ok(secondAfter.fontVw < secondBefore.fontVw)
  assert.ok((secondAfter.opacity ?? 1) < (secondBefore.opacity ?? 1))
  assert.equal(artisticReflowMotion(secondBefore, secondAfter), 'shrinking')
  assert.equal(artisticReflowMotion(secondBefore, secondAfter), 'shrinking')

  // Geometria: a 1ª volta aproximadamente para onde a 2ª estava (centro).
  assert.ok(Math.abs(firstAfter.x - secondBefore.x) < 8)
  assert.ok(Math.abs(firstAfter.y - secondBefore.y) < 8)
  assert.ok(Math.abs(firstAfter.width - secondBefore.width) < 8)
  assert.ok(Math.abs(firstAfter.height - secondBefore.height) < 8)
})

test('keeps phrase identities and reverses reflow when promoting an on-screen phrase', () => {
  const promotedOrder = [PHRASES[1], PHRASES[2], PHRASES[0]]
  const initial = createArtisticLayoutPlan({
    phrases: PHRASES,
    seed: COMPOSITION_SEED,
  })
  const promoted = createArtisticLayoutPlan({
    phrases: promotedOrder,
    seed: COMPOSITION_SEED,
  })
  const initialIds = PHRASES.map((phrase) =>
    artisticPhraseContentId([phrase]),
  )
  const promotedIds = promotedOrder.map((phrase) =>
    artisticPhraseContentId([phrase]),
  )

  assert.equal(sameArtisticPhraseSet(initialIds, promotedIds), true)
  assert.notDeepEqual(initialIds, promotedIds)
  assert.equal(initial.variationId, promoted.variationId)

  const returningId = artisticPhraseContentId([PHRASES[0]])
  const previousHeroId = artisticPhraseContentId([PHRASES[2]])
  const initialTargets = new Map(
    initial.phrases.map((phrase) => [
      artisticPhraseContentId([phrase.text]),
      phrase.targets[3]!,
    ]),
  )
  const promotedTargets = new Map(
    promoted.phrases.map((phrase) => [
      artisticPhraseContentId([phrase.text]),
      phrase.targets[3]!,
    ]),
  )
  const returningBefore = initialTargets.get(returningId)!
  const returningAfter = promotedTargets.get(returningId)!
  const heroBefore = initialTargets.get(previousHeroId)!
  const heroAfter = promotedTargets.get(previousHeroId)!

  assert.ok(returningAfter.fontVw > returningBefore.fontVw)
  assert.equal(artisticReflowMotion(returningBefore, returningAfter), 'growing')
  assert.ok(heroAfter.fontVw < heroBefore.fontVw)
  assert.equal(artisticReflowMotion(heroBefore, heroAfter), 'shrinking')
})

test('keeps keyword blocks stable when a phrase changes stack index', () => {
  const keywords = ['GRAÇA']
  const first = createArtisticLayoutPlan({
    phrases: ['TUA GRAÇA ME BASTA', 'SEGUNDA FRASE'],
    seed: COMPOSITION_SEED,
    keywords,
  })
  const promoted = createArtisticLayoutPlan({
    phrases: ['SEGUNDA FRASE', 'TUA GRAÇA ME BASTA'],
    seed: COMPOSITION_SEED,
    keywords,
  })
  const before = first.phrases.find((p) => p.text.includes('GRAÇA'))!
  const after = promoted.phrases.find((p) => p.text.includes('GRAÇA'))!
  assert.deepEqual(
    before.blocks.map((block) => ({
      words: block.words.map((word) => word.text),
      keyword: block.keyword,
      scale: block.scale,
    })),
    after.blocks.map((block) => ({
      words: block.words.map((word) => word.text),
      keyword: block.keyword,
      scale: block.scale,
    })),
  )
})

test('normalizes whitespace in artistic phrase identities', () => {
  assert.equal(
    artisticPhraseContentId(['  TUA   GRAÇA', 'ME BASTA  ']),
    artisticPhraseContentId(['TUA GRAÇA ME BASTA']),
  )
})
