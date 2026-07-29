import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ELLIPSIS,
  splitTextToFit,
  withLeadingEllipsis,
  withTrailingEllipsis,
} from '../src/theme/splitText.ts'

/** "Cabe" = no máximo N caracteres, contando as reticências. */
const maxChars = (n: number) => (candidate: string) => candidate.length <= n

test('texto que cabe não é repartido', () => {
  const text = 'Grande é o Senhor'
  assert.deepEqual(splitTextToFit(text, maxChars(50)), [text])
})

test('texto vazio não vira slide', () => {
  assert.deepEqual(splitTextToFit('', maxChars(10)), [])
  assert.deepEqual(splitTextToFit('   ', maxChars(10)), [])
})

test('emenda leva reticências no fim da anterior e no início da seguinte', () => {
  const text =
    'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, ' +
    'para que todo aquele que nele crê não pereça'
  const parts = splitTextToFit(text, maxChars(80))

  assert.ok(parts.length > 1, 'deveria repartir')
  for (const [i, part] of parts.entries()) {
    if (i < parts.length - 1) {
      assert.ok(part.endsWith(ELLIPSIS), `parte ${i} deveria terminar com reticências`)
    }
    if (i > 0) {
      assert.ok(part.startsWith(ELLIPSIS), `parte ${i} deveria começar com reticências`)
    }
  }
})

test('nenhuma parte estoura a área, já contando as reticências', () => {
  const text =
    'Tua graça cobre os meus temores, tua forte mão me guiará, ' +
    'se estou cercado pelo medo, tu és fiel, nunca vais falhar'
  const limit = 45
  const parts = splitTextToFit(text, maxChars(limit))

  assert.ok(parts.length > 1)
  for (const part of parts) {
    assert.ok(
      part.length <= limit,
      `parte estourou (${part.length} > ${limit}): ${JSON.stringify(part)}`,
    )
  }
})

test('reunir as partes reconstrói o texto original', () => {
  const text =
    'Ao Teu nome clamarei, e além das ondas olharei, se o mar crescer, ' +
    'somente em Ti descansarei'
  const parts = splitTextToFit(text, maxChars(40))

  const rebuilt = parts
    .map((p, i) => {
      let s = p
      if (i > 0) s = s.slice(ELLIPSIS.length).trimStart()
      if (i < parts.length - 1) s = s.slice(0, -ELLIPSIS.length).trimEnd()
      return s
    })
    .join(' ')

  assert.equal(rebuilt, text)
})

test('prefere cortar na pontuação quando não desperdiça a área', () => {
  // A vírgula fica logo antes do limite: é o melhor corte disponível.
  const text = 'Em meio ao mar confiarei, ao Teu nome clamarei'
  const parts = splitTextToFit(text, maxChars(30))

  assert.ok(parts[0].startsWith('Em meio ao mar confiarei,'))
})

test('quebra de linha ganha da pontuação', () => {
  const text = 'Primeira linha, com vírgula\nSegunda linha do bloco'
  const parts = splitTextToFit(text, maxChars(32))

  assert.ok(parts.length > 1)
  assert.ok(
    parts[0].includes('Primeira linha, com vírgula'),
    `esperava corte na quebra de linha, veio: ${JSON.stringify(parts[0])}`,
  )
})

test('não corta cedo demais só porque existe uma vírgula no começo', () => {
  // A vírgula está a ~15% do que caberia — usar esse corte desperdiçaria tela.
  const text =
    'Sim, Ele é o Deus que sempre me sustenta e nunca me abandona em momento algum'
  const parts = splitTextToFit(text, maxChars(60))

  assert.ok(
    parts[0].length > 30,
    `cortou cedo demais: ${JSON.stringify(parts[0])}`,
  )
})

test('palavra única maior que a área não trava nem some', () => {
  const text = 'Supercalifragilisticexpialidocious'
  const parts = splitTextToFit(text, maxChars(10))

  assert.equal(parts.length, 1)
  assert.ok(parts[0].includes('Supercalifragilisticexpialidocious'))
})

test('área minúscula termina — não entra em laço infinito', () => {
  const text = 'uma frase comum de louvor para o culto de domingo'
  const parts = splitTextToFit(text, maxChars(6))

  assert.ok(parts.length > 1)
  assert.ok(parts.length < 200, 'deveria parar antes da rede de segurança')
})

test('helpers de reticências', () => {
  assert.equal(withTrailingEllipsis('fim'), `fim ${ELLIPSIS}`)
  assert.equal(withLeadingEllipsis('começo'), `${ELLIPSIS} começo`)
})
