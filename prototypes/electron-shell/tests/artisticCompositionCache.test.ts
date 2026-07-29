import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getOrCreateArtisticComposition,
  resolveArtisticPlanForOrder,
  adaptSeatTargetForPhrase,
} from '../src/artistic/composition/cache.ts'
import { artisticReflowMotion } from '../src/components/artisticReflow.ts'
import { isShortSupport } from '../src/artistic/composition/select.ts'
import type { ArtisticPhraseTarget } from '../src/theme/artisticLayout.ts'

test('getOrCreateArtisticComposition returns same cache object on pure reorder', () => {
  const cache1 = getOrCreateArtisticComposition(null, ['A', 'B'], 42, [])
  const cache2 = getOrCreateArtisticComposition(cache1, ['B', 'A'], 42, [])
  assert.equal(cache1, cache2)
  assert.equal(cache1.seatTables.get(2), cache2.seatTables.get(2))
})

test('phase growth adds new seat table without replacing existing ones', () => {
  const c1 = getOrCreateArtisticComposition(null, ['A'], 42, [])
  assert.equal(c1.seatTables.has(1), true)
  assert.equal(c1.seatTables.has(2), false)

  const c2 = getOrCreateArtisticComposition(c1, ['A', 'B'], 42, [])
  assert.notEqual(c1, c2)
  assert.equal(c2.seatTables.has(1), true)
  assert.equal(c2.seatTables.has(2), true)
  assert.equal(c2.seatTables.get(1), c1.seatTables.get(1))
})

test('new phrase set after full trio creates a fresh cache', () => {
  let cache = getOrCreateArtisticComposition(null, ['A'], 42, [])
  cache = getOrCreateArtisticComposition(cache, ['A', 'B'], 42, [])
  cache = getOrCreateArtisticComposition(cache, ['A', 'B', 'C'], 42, [])
  // Sessão nova (seed/origin diferente) — trio descartado.
  const next = getOrCreateArtisticComposition(cache, ['D'], 99, [])
  assert.notEqual(cache.sessionKey, next.sessionKey)
  assert.equal(next.seatTables.size, 1)
  assert.equal(next.entryOrder[0]?.text, 'D')
})

test('seed change creates a fresh cache', () => {
  const c1 = getOrCreateArtisticComposition(null, ['A', 'B'], 42, [])
  const c2 = getOrCreateArtisticComposition(c1, ['A', 'B'], 99, [])
  assert.notEqual(c1.sessionKey, c2.sessionKey)
})

test('resolveArtisticPlanForOrder assigns hero seat to last phrase', () => {
  const cache = getOrCreateArtisticComposition(null, ['A', 'B'], 42, [])

  const planAB = resolveArtisticPlanForOrder(cache, ['A', 'B'])
  assert.equal(planAB.phrases[0].text, 'A')
  assert.equal(planAB.phrases[0].targets[2]!.hero, false)
  assert.equal(planAB.phrases[1].text, 'B')
  assert.equal(planAB.phrases[1].targets[2]!.hero, true)

  const planBA = resolveArtisticPlanForOrder(cache, ['B', 'A'])
  assert.equal(planBA.phrases[0].text, 'B')
  assert.equal(planBA.phrases[0].targets[2]!.hero, false)
  assert.equal(planBA.phrases[1].text, 'A')
  assert.equal(planBA.phrases[1].targets[2]!.hero, true)
})

test('seat box is stable across reorders; fontVw fits the occupying phrase blocks', () => {
  const cache = getOrCreateArtisticComposition(null, ['A', 'B'], 42, [])
  const planAB = resolveArtisticPlanForOrder(cache, ['A', 'B'])
  const planBA = resolveArtisticPlanForOrder(cache, ['B', 'A'])

  const boxOf = (target: {
    x: number
    y: number
    width: number
    height: number
    hero: boolean
  }) => ({
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    hero: target.hero,
  })

  // Caixa/papel do assento é estável; tipografia pode diferir por frase.
  assert.deepEqual(
    boxOf(planAB.phrases[0].targets[2]!),
    boxOf(planBA.phrases[0].targets[2]!),
  )
  assert.deepEqual(
    boxOf(planAB.phrases[1].targets[2]!),
    boxOf(planBA.phrases[1].targets[2]!),
  )
})

test('returning hero keeps its frozen layout align across roles', () => {
  const first = 'AO ERGUERMOS AS MÃOS PRA ADORAR'
  const second = 'E CLAMARMOS A TI TU VIRÁS'
  let cache = getOrCreateArtisticComposition(null, [first], 'align-freeze:0', [])
  const alone = resolveArtisticPlanForOrder(cache, [first])
  const layoutAlign = alone.phrases[0].targets[1]!.align
  assert.ok(
    layoutAlign === 'left' ||
      layoutAlign === 'center' ||
      layoutAlign === 'right',
  )

  cache = getOrCreateArtisticComposition(cache, [first, second], 'align-freeze:0', [])
  const asSupport = resolveArtisticPlanForOrder(cache, [first, second])
  assert.equal(asSupport.phrases[0].targets[2]!.hero, false)
  assert.equal(asSupport.phrases[0].targets[2]!.align, layoutAlign)

  const back = resolveArtisticPlanForOrder(cache, [second, first])
  assert.equal(back.phrases[1].text, first)
  assert.equal(back.phrases[1].targets[2]!.hero, true)
  assert.equal(back.phrases[1].targets[2]!.align, layoutAlign)
})

test('returning hero keeps fontVw/width ratio so wrap stays identical', () => {
  const first = 'AO ERGUERMOS AS MÃOS PRA ADORAR'
  const second = 'E CLAMARMOS A TI TU VIRÁS'
  let cache = getOrCreateArtisticComposition(null, [first], 'wrap-stable:0', [])
  cache = getOrCreateArtisticComposition(cache, [first, second], 'wrap-stable:0', [])

  const asSupport = resolveArtisticPlanForOrder(cache, [first, second])
  const asHero = resolveArtisticPlanForOrder(cache, [second, first])

  const support = asSupport.phrases[0].targets[2]!
  const hero = asHero.phrases[1].targets[2]!
  assert.equal(asSupport.phrases[0].text, first)
  assert.equal(asHero.phrases[1].text, first)
  assert.deepEqual(asSupport.phrases[0].blocks, asHero.phrases[1].blocks)

  const supportRatio = support.fontVw / Math.max(support.width, 1)
  const heroRatio = hero.fontVw / Math.max(hero.width, 1)
  assert.ok(
    Math.abs(supportRatio - heroRatio) < 0.02,
    `font/width ratio drifted: support ${supportRatio} vs hero ${heroRatio}`,
  )
})

test('returning hero uses fontVw fitted to its own line-break blocks', () => {
  const short = 'Ele reina'
  const long = 'O Senhor é a minha força e salvação'
  // long no apoio, short no herói → promove long → long volta ao herói
  const cache = getOrCreateArtisticComposition(null, [long, short], 0, [])
  const longEntry = cache.entryOrder.find((entry) => entry.text === long)!
  const frozenLong = cache.phrasePlans.get(longEntry.id)!
  assert.ok(
    frozenLong.blocks.length >= 2,
    'long phrase should keep stacked line breaks',
  )
  assert.ok(
    frozenLong.blocks.some((block) => !block.fullLine) ||
      frozenLong.blocks.length >= 2,
    'long phrase should expose wrap chunks, not only full-line blocks',
  )

  const initial = resolveArtisticPlanForOrder(cache, [long, short])
  const promoted = resolveArtisticPlanForOrder(cache, [short, long])

  assert.equal(initial.phrases[0].targets[2]!.hero, false)
  assert.equal(promoted.phrases[1].text, long)
  assert.equal(promoted.phrases[1].targets[2]!.hero, true)

  const shortAsHero = initial.phrases[1].targets[2]!
  const longAsHero = promoted.phrases[1].targets[2]!
  assert.ok(Math.abs(longAsHero.x - shortAsHero.x) < 0.01)
  assert.ok(Math.abs(longAsHero.width - shortAsHero.width) < 0.01)
  // Tipografia do long respeita as quebras dele — não herda o fontVw do short.
  assert.ok(
    longAsHero.fontVw <= shortAsHero.fontVw + 0.05,
    `long hero fontVw ${longAsHero.fontVw} should not exceed short hero ${shortAsHero.fontVw}`,
  )
})

test('blocks are phrase-specific and stable on seat swap', () => {
  const cache = getOrCreateArtisticComposition(
    null,
    ['TUA GRAÇA ME BASTA', 'SEGUNDA FRASE'],
    42,
    ['GRAÇA'],
  )
  const planAB = resolveArtisticPlanForOrder(cache, [
    'TUA GRAÇA ME BASTA',
    'SEGUNDA FRASE',
  ])
  const planBA = resolveArtisticPlanForOrder(cache, [
    'SEGUNDA FRASE',
    'TUA GRAÇA ME BASTA',
  ])

  assert.deepEqual(planAB.phrases[0].blocks, planBA.phrases[1].blocks)
  assert.deepEqual(planAB.phrases[1].blocks, planBA.phrases[0].blocks)
})

test('artisticReflowMotion reports growing when a phrase moves to hero seat', () => {
  const cache = getOrCreateArtisticComposition(null, ['A', 'B'], 42, [])
  const before = resolveArtisticPlanForOrder(cache, ['A', 'B'])
  const after = resolveArtisticPlanForOrder(cache, ['B', 'A'])

  assert.equal(
    artisticReflowMotion(before.phrases[0].targets[2]!, after.phrases[1].targets[2]!),
    'growing',
  )
  assert.equal(
    artisticReflowMotion(before.phrases[1].targets[2]!, after.phrases[0].targets[2]!),
    'shrinking',
  )
})

test('promoting short portrait support returns to the cached hero seat', () => {
  const short = 'Ele reina'
  const long = 'O Senhor é a minha força e salvação'
  assert.equal(isShortSupport(short), true)

  const cache = getOrCreateArtisticComposition(null, [short, long], 0, [])
  const before = resolveArtisticPlanForOrder(cache, [short, long])
  const after = resolveArtisticPlanForOrder(cache, [long, short])

  const supportBefore = before.phrases[0].targets[2]!
  const heroBefore = before.phrases[1].targets[2]!
  const heroAfter = after.phrases[1].targets[2]!
  const supportAfter = after.phrases[0].targets[2]!

  assert.equal(supportBefore.orientation, 'portrait-stack')
  assert.equal(heroAfter.hero, true)
  assert.ok(Math.abs(heroAfter.x - heroBefore.x) < 0.01)
  assert.ok(Math.abs(heroAfter.y - heroBefore.y) < 0.01)
  assert.ok(Math.abs(heroAfter.width - heroBefore.width) < 0.01)
  assert.ok(Math.abs(heroAfter.height - heroBefore.height) < 0.01)
  assert.notEqual(supportAfter.orientation, 'portrait-stack')
  assert.equal(cache, getOrCreateArtisticComposition(cache, [long, short], 0, []))
})

test('entryOrder is frozen at first computation for a session', () => {
  let cache = getOrCreateArtisticComposition(null, ['A', 'B'], 42, [])
  assert.deepEqual(
    cache.entryOrder.map((entry) => entry.text),
    ['A', 'B'],
  )
  cache = getOrCreateArtisticComposition(cache, ['B', 'A'], 42, [])
  assert.deepEqual(
    cache.entryOrder.map((entry) => entry.text),
    ['A', 'B'],
  )
})

test('cached resolve restores hero size emphasis over support', () => {
  const phrases = [
    'AO ERGUERMOS AS MÃOS PRA ADORAR',
    'E CLAMARMOS A TI TU VIRÁS',
  ]
  const cache = getOrCreateArtisticComposition(null, phrases, 0, [
    'MÃOS',
    'CLAMARMOS',
  ])
  const plan = resolveArtisticPlanForOrder(cache, phrases)
  const support = plan.phrases[0].targets[2]!
  const hero = plan.phrases[1].targets[2]!
  assert.equal(hero.hero, true)
  assert.ok(hero.fontVw > support.fontVw * 2.5)
  assert.ok(hero.fontVw >= 8)
  const keywords = plan.phrases.flatMap((phrase) =>
    phrase.blocks.filter((block) => block.keyword),
  )
  assert.ok(keywords.length >= 1)
  assert.ok(keywords.every((block) => block.scale >= 1.8))
})

test('adaptSeatTargetForPhrase clears portrait for long phrases', () => {
  const portrait: ArtisticPhraseTarget = {
    x: 2,
    y: 8,
    width: 20,
    height: 80,
    fontVw: 2.7,
    rotationDeg: 0,
    align: 'left',
    zIndex: 2,
    hero: false,
    stamp: false,
    opacity: 0.58,
    orientation: 'portrait-stack',
    anchor: 'edge-left',
    motionRecipeHint: 'pivot-canto',
  }
  const adapted = adaptSeatTargetForPhrase(
    portrait,
    'O Senhor é a minha força e salvação',
  )
  assert.equal(adapted.orientation, 'landscape')
  assert.equal(adapted.anchor, 'none')
  assert.equal(adapted.motionRecipeHint, undefined)
  assert.ok(adapted.width >= 30)
  assert.equal(adaptSeatTargetForPhrase(portrait, 'Ele reina').orientation, 'portrait-stack')
})

test('editing keywords live paints words without rebuilding seats', () => {
  const phrase = 'AO ERGUERMOS AS MÃOS PRA ADORAR'
  const cache1 = getOrCreateArtisticComposition(null, [phrase, 'SEGUNDA'], 42, [])
  const plan1 = resolveArtisticPlanForOrder(cache1, [phrase, 'SEGUNDA'])
  const seatTable1 = cache1.seatTables.get(2)!
  const blocksBefore = plan1.phrases[0].blocks

  const cache2 = getOrCreateArtisticComposition(
    cache1,
    [phrase, 'SEGUNDA'],
    42,
    ['MÃOS'],
  )
  const plan2 = resolveArtisticPlanForOrder(cache2, [phrase, 'SEGUNDA'])
  const seatTable2 = cache2.seatTables.get(2)!

  assert.equal(cache1.sessionKey, cache2.sessionKey)
  assert.equal(seatTable1, seatTable2)
  assert.deepEqual(
    plan1.phrases[0].targets[2],
    plan2.phrases[0].targets[2],
  )
  assert.deepEqual(
    plan1.phrases[1].targets[2],
    plan2.phrases[1].targets[2],
  )
  // Quebras/estrutura iguais; só word.keyword muda.
  assert.equal(blocksBefore.length, plan2.phrases[0].blocks.length)
  assert.deepEqual(
    blocksBefore.map((block) => block.words.map((word) => word.text)),
    plan2.phrases[0].blocks.map((block) =>
      block.words.map((word) => word.text),
    ),
  )
  assert.deepEqual(
    blocksBefore.map((block) => block.fullLine),
    plan2.phrases[0].blocks.map((block) => block.fullLine),
  )
  const painted = plan2.phrases[0].blocks.flatMap((block) => block.words)
  assert.ok(painted.some((word) => word.text === 'MÃOS' && word.keyword))
  assert.ok(painted.some((word) => word.text !== 'MÃOS' && !word.keyword))
})
