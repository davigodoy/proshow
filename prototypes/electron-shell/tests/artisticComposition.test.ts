import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMPOSITION_TEMPLATES,
  LEGACY_TEMPLATE_IDS,
  getCompositionTemplate,
  portraitBlockScale,
  portraitFeasible,
  regroupPortraitLines,
  selectCompositionTemplate,
} from '../src/artistic/composition/index.ts'
import {
  artisticTargetAabb,
  artisticTargetWithinOverflowBudget,
  artisticTargetsCollide,
  artisticTargetsExceedFrame,
  createArtisticLayoutPlan,
} from '../src/theme/artisticLayout.ts'
import { artisticPhraseContentId } from '../src/components/artisticReflow.ts'

const PORTRAIT_CONSTRAINTS = { maxLines: 6, maxWordChars: 12 }

const regionArea = (region: readonly number[]): number =>
  region[2] * region[3]

test('portrait regroup keeps one content word per line and glues connectors', () => {
  const words = [
    { text: 'de', keyword: false },
    { text: 'graça', keyword: false },
    { text: 'em', keyword: false },
    { text: 'graça', keyword: false },
  ]
  const lines = regroupPortraitLines(words)

  assert.equal(lines.length, 2)
  assert.deepEqual(
    lines.map((line) => line.map((word) => word.text)),
    [
      ['de', 'graça'],
      ['em', 'graça'],
    ],
  )
  // Cada linha tem exatamente uma palavra de conteúdo.
  for (const line of lines) {
    const content = line.filter((word) => word.text !== 'de' && word.text !== 'em')
    assert.equal(content.length, 1)
  }
})

test('portrait regroup glues a trailing connector to the previous word', () => {
  const words = [
    { text: 'Santo', keyword: true },
    { text: 'e', keyword: false },
  ]
  const lines = regroupPortraitLines(words)
  assert.equal(lines.length, 1)
  assert.deepEqual(lines[0].map((word) => word.text), ['Santo', 'e'])
})

test('portraitFeasible rejects long words and long phrases', () => {
  // Palavra comprida não cabe na coluna estreita.
  assert.equal(
    portraitFeasible('misericórdia', { maxLines: 6, maxWordChars: 10 }),
    false,
  )
  // Frase longa: palavras de conteúdo demais para a coluna.
  assert.equal(
    portraitFeasible(
      'quando eu não sei o que fazer eu corro para os teus braços firmes',
      PORTRAIT_CONSTRAINTS,
    ),
    false,
  )
  // Apoio curto cabe.
  assert.equal(portraitFeasible('Ele reina', PORTRAIT_CONSTRAINTS), true)
})

test('portrait keyword block scale is capped around 1.3', () => {
  assert.ok(portraitBlockScale(true, () => 1) <= 1.3)
  assert.ok(portraitBlockScale(true, () => 0) <= 1.3)
  assert.ok(portraitBlockScale(true, () => 0.5) <= 1.3)
  // Não-keyword fica claramente menor.
  assert.ok(portraitBlockScale(false, () => 1) < portraitBlockScale(true, () => 1))
})

test('left-yield corner template phase 2 has a portrait support and a larger hero region', () => {
  const template = getCompositionTemplate('corner-column-left-yield')
  assert.ok(template)
  const [support, hero] = template!.phases[2]
  assert.equal(support.role, 'support-1')
  assert.equal(support.orientation, 'portrait-stack')
  assert.equal(support.anchor, 'edge-left')
  assert.equal(hero.role, 'hero')
  assert.equal(hero.orientation, 'landscape')
  // Herói ocupa muito mais área que o apoio.
  assert.ok(regionArea(hero.region) > regionArea(support.region) * 2)
  // A coluna de apoio é alta e estreita.
  assert.ok(support.region[3] > support.region[2] * 2)
})

test('br-stamp template phase 3 has a portrait support in the bottom-right corner', () => {
  const template = getCompositionTemplate('corner-column-br-stamp')
  assert.ok(template)
  const portrait = template!.phases[3].find(
    (slot) => slot.orientation === 'portrait-stack',
  )
  assert.ok(portrait)
  assert.equal(portrait!.anchor, 'br')
  assert.equal(template!.stampFinal, true)
})

test('selectCompositionTemplate is deterministic by seed and null when not applicable', () => {
  const input = {
    phrase0: 'Ele reina',
    phrases: ['Ele reina', 'O Senhor é forte'],
  }
  const a = selectCompositionTemplate({
    seed: 3,
    phase: 2,
    phrases: input.phrases,
  })
  const b = selectCompositionTemplate({
    seed: 3,
    phase: 2,
    phrases: input.phrases,
  })
  assert.ok(a)
  assert.equal(a!.id, b!.id)

  // Fase 1 sem preferCornerYield → sem corner yield.
  assert.equal(
    selectCompositionTemplate({ seed: 3, phase: 1, phrases: ['Ele reina'] }),
    null,
  )
  // Mosaico só com frases longas → null (usa grammar legada).
  assert.equal(
    selectCompositionTemplate({
      seed: 3,
      phase: 2,
      phrases: [
        'Cantaremos sobre a Tua fidelidade de geração em geração',
        'O Senhor é o nosso refúgio e fortaleza',
      ],
    }),
    null,
  )
  // Promote: apoio longo + herói curto ainda seleciona template (mesmo mosaico).
  const promoted = selectCompositionTemplate({
    seed: 3,
    phase: 2,
    phrases: ['O Senhor é a minha força e salvação', 'Ele reina'],
  })
  assert.ok(promoted)
  assert.equal(
    promoted!.id,
    selectCompositionTemplate({
      seed: 3,
      phase: 2,
      phrases: ['Ele reina', 'O Senhor é a minha força e salvação'],
    })!.id,
  )
})

test('createArtisticLayoutPlan with a short support and corner yield gives a portrait, tall-narrow support', () => {
  // seed 0 → left-yield (seed % 3 === 0), apoio index 0 vira coluna retrato.
  const plan = createArtisticLayoutPlan({
    phrases: ['Ele reina', 'O Senhor é a minha força e o meu cântico'],
    seed: 0,
    preferCornerYield: true,
  })
  assert.equal(plan.phase, 2)

  const support = plan.phrases[0].targets[2]!
  const hero = plan.phrases[1].targets[2]!
  assert.equal(hero.hero, true)
  assert.equal(support.hero, false)

  // Apoio: orientação retrato OU região alta e estreita (height > width*2).
  const isPortrait = support.orientation === 'portrait-stack'
  const isTallNarrow = support.height > support.width * 2
  assert.ok(
    isPortrait || isTallNarrow,
    `support should be portrait or tall-narrow (o=${support.orientation} w=${support.width} h=${support.height})`,
  )
  assert.equal(isPortrait, true)
  // Coluna retrato não é esmagada abaixo de 0.55.
  assert.ok((support.opacity ?? 1) >= 0.55)
  // Apoio legível.
  assert.ok(support.fontVw >= 2.5)
})

test('corner yield keeps final targets collision-free and within overflow budgets', () => {
  const supports = ['Ele reina', 'Santo Deus', 'Tua glória']
  const phraseSets = {
    2: ['Ele reina', 'O Senhor é a minha força e salvação'],
    3: [
      'Ele reina',
      'Cantaremos ao Senhor com alegria',
      'A tua glória enche todo este lugar',
    ],
  }

  for (const phase of [2, 3] as const) {
    for (let seed = 0; seed < 9; seed += 1) {
      const plan = createArtisticLayoutPlan({
        phrases: phraseSets[phase],
        seed,
        preferCornerYield: true,
      })
      assert.equal(plan.phase, phase)
      const targets = plan.phrases.map((phrase) => phrase.targets[phase]!)

      assert.equal(
        artisticTargetsCollide(targets, 1.0),
        false,
        `seed ${seed} phase ${phase}: corner yield must stay collision-free`,
      )
      assert.equal(
        artisticTargetsExceedFrame(targets),
        false,
        `seed ${seed} phase ${phase}: overflow budgets should hold`,
      )
      for (const target of targets) {
        if (target.hero) {
          assert.equal(
            artisticTargetWithinOverflowBudget(target),
            true,
            `seed ${seed} phase ${phase}: hero within 1% budget`,
          )
        }
        assert.ok(
          target.fontVw >= 2.5,
          `seed ${seed} phase ${phase}: every phrase should stay readable`,
        )
        // Sanidade: AABB existe.
        const bounds = artisticTargetAabb(target)
        assert.ok(bounds.width > 0 && bounds.height > 0)
      }
      const hero = targets[targets.length - 1]
      assert.ok(
        targets.slice(0, -1).every((target) => hero.fontVw > target.fontVw),
        `seed ${seed} phase ${phase}: hero should remain the largest`,
      )
    }
  }
  void supports
})

test('corner templates are additive and expose a legacy fallback id', () => {
  assert.ok(COMPOSITION_TEMPLATES.length >= 3)
  for (const template of COMPOSITION_TEMPLATES) {
    assert.ok(template.fallbackId)
    assert.ok(LEGACY_TEMPLATE_IDS.includes(template.fallbackId as never))
  }
})

test('portrait support carries the pivot-canto motion hint', () => {
  const plan = createArtisticLayoutPlan({
    phrases: ['Ele reina', 'O Senhor é a minha força e salvação'],
    seed: 0,
    preferCornerYield: true,
  })
  const support = plan.phrases[0].targets[2]!
  assert.equal(support.orientation, 'portrait-stack')
  assert.equal(support.motionRecipeHint, 'pivot-canto')
})

test('createArtisticLayoutPlan auto-enables corner yield for short support without preferCornerYield', () => {
  const plan = createArtisticLayoutPlan({
    phrases: ['Ele reina', 'O Senhor é a minha força e salvação'],
    seed: 0,
  })
  const support = plan.phrases[0].targets[2]!
  assert.equal(support.orientation, 'portrait-stack')
  assert.equal(support.motionRecipeHint, 'pivot-canto')
  assert.equal(support.anchor, 'edge-left')
})

test('promoting a short portrait support returns it to the original hero seat', () => {
  const short = 'Ele reina'
  const long = 'O Senhor é a minha força e salvação'
  for (const seed of [0, 1, 3, 4]) {
    const initial = createArtisticLayoutPlan({
      phrases: [short, long],
      seed,
    })
    const promoted = createArtisticLayoutPlan({
      phrases: [long, short],
      seed,
    })
    const shortId = artisticPhraseContentId([short])
    const longId = artisticPhraseContentId([long])
    const before = Object.fromEntries(
      initial.phrases.map((phrase) => [
        artisticPhraseContentId([phrase.text]),
        phrase.targets[2]!,
      ]),
    )
    const after = Object.fromEntries(
      promoted.phrases.map((phrase) => [
        artisticPhraseContentId([phrase.text]),
        phrase.targets[2]!,
      ]),
    )

    assert.equal(before[shortId].orientation, 'portrait-stack')
    assert.equal(before[longId].hero, true)
    assert.equal(after[shortId].hero, true)
    assert.equal(after[shortId].orientation !== 'portrait-stack', true)
    assert.ok(Math.abs(after[shortId].x - before[longId].x) < 1.5)
    assert.ok(Math.abs(after[shortId].y - before[longId].y) < 1.5)
    assert.ok(Math.abs(after[shortId].width - before[longId].width) < 1.5)
    assert.ok(Math.abs(after[shortId].height - before[longId].height) < 1.5)
    assert.equal(artisticTargetWithinOverflowBudget(after[shortId]), true)
    // Apoio longo não fica preso em coluna-retrato.
    assert.notEqual(after[longId].orientation, 'portrait-stack')
  }
})
