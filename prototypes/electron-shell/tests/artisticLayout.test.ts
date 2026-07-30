import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ARTISTIC_MAX_OVERFLOW_OF_TEXT,
  ARTISTIC_SOLO_LAYOUTS,
  ARTISTIC_SUPPORT_MIN_VISIBLE_RATIO,
  ARTISTIC_VARIATIONS,
  artisticAabbFrameOverflow,
  artisticOverflowLimits,
  artisticTargetAabb,
  artisticTargetWithinOverflowBudget,
  artisticTargetsCollide,
  artisticTargetsExceedFrame,
  createArtisticLayoutPlan,
  pickArtisticSoloLayout,
} from '../src/theme/artisticLayout.ts'

const PHRASES = [
  'AO ERGUERMOS AS MÃOS PRA ADORAR',
  'E CLAMARMOS A TI TU VIRÁS',
  'NÓS VIEMOS AQUI TE ADORAR',
]

test('keeps a complete artistic plan through phases 1, 2 and 3', () => {
  for (const phase of [1, 2, 3] as const) {
    const plan = createArtisticLayoutPlan({
      phrases: PHRASES.slice(0, phase),
      seed: 'regression-song:0',
    })

    assert.equal(plan.phase, phase)
    assert.equal(plan.phrases.length, phase)
    for (const phrase of plan.phrases) {
      assert.ok(phrase.blocks.length)
      assert.ok(phrase.targets[phase])
    }
  }
})

test('makes the latest phrase the largest hero in phases 2 and 3', () => {
  for (const phase of [2, 3] as const) {
    for (let seed = 0; seed < ARTISTIC_VARIATIONS.length; seed += 1) {
      const plan = createArtisticLayoutPlan({
        phrases: PHRASES.slice(0, phase),
        seed,
      })
      const targets = plan.phrases.map((phrase) => phrase.targets[phase]!)
      const hero = targets[targets.length - 1]

      assert.equal(hero.hero, true)
      assert.ok(
        targets.slice(0, -1).every((target) => hero.fontVw > target.fontVw),
        `${plan.variationId}: latest phrase should be largest`,
      )
      assert.ok(
        targets.slice(0, -1).every((target) => hero.zIndex > target.zIndex),
        `${plan.variationId}: latest phrase should be on top`,
      )
      const expectedRatios = phase === 2 ? [0.38] : [0.32, 0.42]
      targets.slice(0, -1).forEach((target, index) => {
        assert.ok(
          target.fontVw >= 2.5,
          `${plan.variationId}: prior phrase should remain readable`,
        )
        assert.ok(
          target.fontVw <= hero.fontVw * expectedRatios[index] + 0.01,
          `${plan.variationId}: prior phrase should be clearly below hero`,
        )
        assert.ok(
          hero.fontVw - target.fontVw >= 1.8,
          `${plan.variationId}: hero hierarchy should be visually strong`,
        )
        assert.ok(
          (target.opacity ?? 1) < (hero.opacity ?? 1),
          `${plan.variationId}: support should be out of focus`,
        )
        assert.equal(hero.opacity, 1)
      })
      if (phase === 3) {
        assert.equal(hero.stamp, true)
        assert.ok(Math.abs(hero.rotationDeg) >= 2)
      }
    }
  }
})

test('makes keyword blocks substantially larger than ordinary blocks', () => {
  const plan = createArtisticLayoutPlan({
    phrases: ['TUA GRAÇA ME BASTA'],
    seed: 'keyword-emphasis',
    keywords: ['GRAÇA'],
  })
  const blocks = plan.phrases[0].blocks
  const keywords = blocks.filter((block) => block.keyword)
  const ordinary = blocks.filter((block) => !block.keyword)

  assert.equal(keywords.length, 1)
  assert.ok(ordinary.length > 0)
  assert.ok(
    keywords[0].words.some((word) => word.text === 'GRAÇA' && word.keyword),
  )
  assert.ok(keywords.every((block) => block.scale >= 1.95))
  // Todo bloco é fileira própria agora (compor > caber) — keyword e comum.
  assert.ok(blocks.every((block) => block.fullLine))
  assert.ok(
    Math.min(...keywords.map((block) => block.scale)) >
      Math.max(...ordinary.map((block) => block.scale)),
  )
})

test('varies ordinary line weight inside a phrase block', () => {
  // O ritmo tipográfico vem do PESO, não do tamanho. No solo o tamanho é
  // resolvido pelo box com fonte uniforme (ver soloComposeLines): variar a
  // escala por linha ali só encolheria a letra, que é o defeito
  // "pequeno demais". A palavra-chave segue como a exceção que cresce.
  const plan = createArtisticLayoutPlan({
    phrases: ['AO ERGUERMOS AS MÃOS PRA ADORAR'],
    seed: 'line-rhythm',
  })
  const ordinary = plan.phrases[0].blocks.filter((block) => !block.keyword)
  assert.ok(ordinary.length >= 3)
  const weights = ordinary.map((block) => block.weight)
  assert.ok(
    Math.max(...weights) - Math.min(...weights) >= 20,
    `ordinary lines should vary in weight inside the block (got ${weights.join(',')})`,
  )
  // E o tamanho tem de ficar uniforme — é o que garante a letra máxima.
  const scales = ordinary.map((block) => block.scale)
  assert.equal(
    Math.max(...scales) - Math.min(...scales),
    0,
    'ordinary lines share one size; the box decides it',
  )
})

test('breaks ordinary phrases into short wrapping chunks', () => {
  const plan = createArtisticLayoutPlan({
    phrases: ['AO ERGUERMOS AS MÃOS PRA ADORAR'],
    seed: 'square-blocks',
  })
  const blocks = plan.phrases[0].blocks
  assert.ok(blocks.length >= 3, 'should split into several short chunks')
  assert.ok(
    blocks.every((block) => block.words.length <= 4),
    'chunks should stay short',
  )
  // Compor > caber: todo bloco é fileira própria (fullLine), não só keyword.
  assert.ok(blocks.every((block) => block.fullLine))
  const ordinary = blocks.filter((block) => !block.keyword)
  const forcedBreaks = ordinary.filter((block) => block.breakAfter).length
  assert.ok(
    forcedBreaks >= ordinary.length - 1,
    'every ordinary chunk except the last should force its own row',
  )
})

test('short phrases (≤3 words) compose into lines, never one word per block', () => {
  // Quebra é pra compor, não pra caber (preencher artisticamente) — mas uma
  // frase curta partida palavra a palavra é fragmentação, não composição.
  const samples = ['Tu és bom', 'Nós te adoramos', 'Nada além', 'Aleluia']
  for (const phrase of samples) {
    for (let seed = 0; seed < 8; seed += 1) {
      const plan = createArtisticLayoutPlan({
        phrases: [phrase],
        seed: `short-compose:${seed}:${phrase}`,
      })
      const blocks = plan.phrases[0].blocks
      assert.ok(
        blocks.length <= 2,
        `${phrase} (seed ${seed}): expected at most 2 blocks (compose, not fragment), got ${blocks.map((b) => b.words.map((w) => w.text).join(' ')).join(' / ')}`,
      )
    }
  }
})

test('short phrase (≤3 words) with a keyword does not fragment word-by-word', () => {
  const plan = createArtisticLayoutPlan({
    phrases: ['Tua graça basta'],
    seed: 'short-keyword-isolated',
    keywords: ['graça'],
  })
  const blocks = plan.phrases[0].blocks
  // Sem o guard de frase curta, cada palavra vira bloco: 3 blocos numa frase
  // de 3 palavras. Isolar a keyword ainda pode aninhar um vizinho curto nela
  // (regra "TUA GRAÇA" já existente) — o que importa é não fragmentar mais.
  assert.ok(
    blocks.length <= 2,
    `expected at most 2 blocks, got ${blocks.length}: ${blocks.map((b) => b.words.map((w) => w.text).join(' ')).join(' / ')}`,
  )
  const keyword = blocks.find((block) => block.keyword)
  assert.ok(keyword, 'keyword should still be flagged on its block')
  assert.ok(keyword.words.some((word) => word.text === 'graça' && word.keyword))
  const allWords = blocks.flatMap((block) => block.words.map((word) => word.text))
  assert.deepEqual(allWords, ['Tua', 'graça', 'basta'])
})

test('does not leave short connectors alone on a line', () => {
  const connectorSet = new Set([
    'a', 'à', 'ao', 'aos', 'às', 'as', 'com', 'da', 'das', 'de', 'do', 'dos',
    'e', 'em', 'já', 'lhe', 'mas', 'me', 'meu', 'na', 'nas', 'nem', 'no', 'nos',
    'num', 'numa', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos',
    'por', 'pra', 'que', 'se', 'sem', 'seu', 'só', 'sua', 'te', 'teu', 'tua',
    'um', 'uma',
  ])
  const norm = (text: string) =>
    text
      .toLocaleLowerCase('pt-BR')
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  const letterCount = (text: string) =>
    (norm(text).normalize('NFC').match(/\p{L}/gu) || []).length
  const samples = [
    'Cantaremos sobre a Tua fidelidade de geração em geração',
    'Se o Senhor não edificar a casa',
    'Porque Dele e por Ele e para Ele são todas as coisas',
    'AO ERGUERMOS AS MÃOS PRA ADORAR',
    'Vem a nós com paz',
  ]
  for (const phrase of samples) {
    for (let seed = 0; seed < 12; seed += 1) {
      const plan = createArtisticLayoutPlan({
        phrases: [phrase],
        seed: `connector-orphan:${seed}:${phrase.slice(0, 12)}`,
        keywords: ['fidelidade', 'Senhor'],
      })
      const blocks = plan.phrases[0].blocks
      if (blocks.length <= 1) continue
      for (const block of blocks) {
        if (block.keyword) continue
        const onlyConnectors = block.words.every((word) =>
          connectorSet.has(norm(word.text)),
        )
        assert.equal(
          onlyConnectors,
          false,
          `orphan line "${block.words.map((w) => w.text).join(' ')}" in: ${phrase}`,
        )
        if (block.words.length === 1) {
          // 4, não 5: palavra de conteúdo com 4 letras sozinha é composição.
          // Ver MIN_LONE_WORD_LETTERS — colar "QUÃO" em "PROFUNDAS" fazia
          // linha de 14 chars e derrubava a fonte.
          assert.ok(
            letterCount(block.words[0].text) >= 4,
            `short lone word "${block.words[0].text}" in: ${phrase}`,
          )
        }
      }
    }
  }
})

test('keeps short keyword words alone when emphasized', () => {
  const plan = createArtisticLayoutPlan({
    phrases: ['Tua FÉ me basta'],
    seed: 'short-keyword-alone',
    keywords: ['FÉ'],
  })
  const keyword = plan.phrases[0].blocks.find((block) => block.keyword)
  assert.ok(keyword)
  assert.equal(keyword!.words.length, 1)
  assert.equal(keyword!.words[0].text, 'FÉ')
})

test('chooses artistic arrival effects deterministically from the plan seed', () => {
  const first = createArtisticLayoutPlan({
    phrases: PHRASES,
    seed: 'deterministic-arrivals',
  })
  const second = createArtisticLayoutPlan({
    phrases: PHRASES,
    seed: 'deterministic-arrivals',
  })

  assert.deepEqual(
    first.phrases.map((phrase) => phrase.enterEffect),
    second.phrases.map((phrase) => phrase.enterEffect),
  )
  assert.deepEqual(
    first.phrases.map((phrase) => phrase.landBlink),
    second.phrases.map((phrase) => phrase.landBlink),
  )
  assert.equal(first.phrases.at(-1)?.enterEffect, 'stamp')
  assert.equal(typeof first.phrases.at(-1)?.landBlink, 'boolean')
})

test('recovers with the safe artistic grid instead of ordered bands', () => {
  const hardPhrases = [
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    'YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
    'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
  ]
  const narrowVariation = ARTISTIC_VARIATIONS.findIndex(
    (variation) => variation.id === 'asymmetric-big-small-big',
  )
  assert.notEqual(narrowVariation, -1)

  const plan = createArtisticLayoutPlan({
    phrases: hardPhrases,
    seed: narrowVariation,
  })

  assert.equal(plan.phase, 3)
  assert.equal(plan.variationId, 'no-stamp-safe-grid')
  assert.equal(plan.recovered, true)
  assert.equal(plan.phrases.length, 3)
  assert.ok(
    plan.phrases.every(
      (phrase) =>
        phrase.targets[3] &&
        phrase.targets[3]!.fontVw >= 2.5,
    ),
  )
})

test('hero stays within 1% of its text size; support may leave up to ~30%', () => {
  const phrases = [
    'Tu és bom',
    'Cantaremos sobre a Tua fidelidade de geração em geração',
    'Quando atravessarmos os vales permaneceremos firmes porque Tua presença nos sustentará',
  ]

  for (const phase of [1, 2, 3] as const) {
    for (let seed = 0; seed < ARTISTIC_VARIATIONS.length; seed += 1) {
      const plan = createArtisticLayoutPlan({
        phrases: phrases.slice(0, phase),
        seed,
        keywords: ['fidelidade', 'presença'],
      })
      assert.equal(plan.phase, phase)
      for (const phrase of plan.phrases) {
        const target = phrase.targets[phase]
        assert.ok(target)
        const bounds = artisticTargetAabb(target!)
        const overflow = artisticAabbFrameOverflow(bounds)
        if (target!.hero) {
          const limit = artisticOverflowLimits(
            bounds,
            ARTISTIC_MAX_OVERFLOW_OF_TEXT,
          )
          assert.ok(
            overflow.left <= limit.x + 0.03 &&
              overflow.right <= limit.x + 0.03 &&
              overflow.top <= limit.y + 0.03 &&
              overflow.bottom <= limit.y + 0.03,
            `${plan.variationId}: hero overflow L${overflow.left} R${overflow.right} T${overflow.top} B${overflow.bottom} lim ${limit.x}/${limit.y}`,
          )
          assert.equal(
            artisticTargetWithinOverflowBudget(target!),
            true,
            `${plan.variationId}: hero within 1% budget`,
          )
        } else {
          assert.ok(
            overflow.visibleRatio >= ARTISTIC_SUPPORT_MIN_VISIBLE_RATIO - 0.02,
            `${plan.variationId}: support should keep ≥70% visible (${overflow.visibleRatio})`,
          )
        }
      }
      const targets = plan.phrases.map((phrase) => phrase.targets[phase]!)
      assert.equal(
        artisticTargetsExceedFrame(targets),
        false,
        `${plan.variationId} phase ${phase}: overflow budgets should hold`,
      )
    }
  }
})

test('hero maximizes screen usage in the committed final state', () => {
  const shortPhrases = ['Tu és bom', 'Tua graça me basta', 'Nós te adoramos']

  // Fase 1: herói sozinho deve mirar grande e preencher a safe area.
  for (let seed = 0; seed < ARTISTIC_VARIATIONS.length; seed += 1) {
    const plan = createArtisticLayoutPlan({
      phrases: shortPhrases.slice(0, 1),
      seed,
    })
    const hero = plan.phrases[0].targets[1]!
    assert.ok(
      hero.fontVw >= 4.0,
      `${plan.variationId}: phase 1 hero should aim large (fontVw ${hero.fontVw})`,
    )
    const bounds = artisticTargetAabb(hero)
    const coverage = (bounds.width * bounds.height) / (100 * 100)
    assert.ok(
      coverage >= 0.6,
      `${plan.variationId}: phase 1 hero should cover most of the safe area (${coverage})`,
    )
  }

  // Fases 2 e 3: herói continua claramente maior que o apoio e sem colisão.
  for (const phase of [2, 3] as const) {
    for (let seed = 0; seed < ARTISTIC_VARIATIONS.length; seed += 1) {
      const plan = createArtisticLayoutPlan({
        phrases: shortPhrases.slice(0, phase),
        seed,
      })
      const targets = plan.phrases.map((phrase) => phrase.targets[phase]!)
      const hero = targets[targets.length - 1]
      assert.ok(
        hero.fontVw >= 4.0,
        `${plan.variationId}: phase ${phase} hero should aim large (fontVw ${hero.fontVw})`,
      )
      assert.ok(
        targets.slice(0, -1).every((target) => hero.fontVw > target.fontVw),
        `${plan.variationId}: hero should stay largest while filling`,
      )
      assert.equal(
        artisticTargetsCollide(targets, 1.0),
        false,
        `${plan.variationId}: aggressive fill must stay collision-free`,
      )
    }
  }
})

test('every solo layout (ARTISTIC_SOLO_LAYOUTS) clears the phase-1 guard rail', () => {
  const shortPhrases = ['Tu és bom', 'Tua graça me basta', 'Nós te adoramos']
  const seenIds = new Set<string>()
  for (const phrase of shortPhrases) {
    for (let seed = 0; seed < 400; seed += 1) {
      const layout = pickArtisticSoloLayout(seed)
      if (seenIds.has(layout.id)) continue
      const plan = createArtisticLayoutPlan({ phrases: [phrase], seed })
      const hero = plan.phrases[0].targets[1]!
      assert.ok(
        hero.fontVw >= 4.0,
        `${layout.id} (${phrase}): phase 1 hero should aim large (fontVw ${hero.fontVw})`,
      )
      const bounds = artisticTargetAabb(hero)
      const coverage = (bounds.width * bounds.height) / (100 * 100)
      assert.ok(
        coverage >= 0.6,
        `${layout.id} (${phrase}): phase 1 hero should cover most of the safe area (${coverage})`,
      )
      seenIds.add(layout.id)
    }
  }
  for (const layout of ARTISTIC_SOLO_LAYOUTS) {
    assert.ok(seenIds.has(layout.id), `${layout.id} was never exercised — picker or seed range needs revisiting`)
  }
})

test('final artistic targets avoid AABB collisions in phases 2 and 3', () => {
  for (const phase of [2, 3] as const) {
    for (let seed = 0; seed < ARTISTIC_VARIATIONS.length; seed += 1) {
      const plan = createArtisticLayoutPlan({
        phrases: PHRASES.slice(0, phase),
        seed,
      })
      const targets = plan.phrases.map((phrase) => phrase.targets[phase]!)
      assert.equal(
        artisticTargetsCollide(targets, 1.0),
        false,
        `${plan.variationId} phase ${phase}: final targets should not collide`,
      )
      const hero = targets[targets.length - 1]
      assert.ok(
        targets.slice(0, -1).every((target) => hero.fontVw > target.fontVw),
        `${plan.variationId}: hero should stay largest after collision resolve`,
      )
    }
  }
})
