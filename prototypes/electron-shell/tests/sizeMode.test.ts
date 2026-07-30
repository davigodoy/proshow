import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_FILL_PCT,
  DEFAULT_LYRIC_SIZE_VW,
  resolveSizeMode,
  shouldSplitOverflow,
  toExplicitSizeFields,
} from '../src/theme/sizeMode.ts'

test('tema legado permanece legado — nada muda sozinho', () => {
  assert.deepEqual(resolveSizeMode({ lyricSizeVw: 5 }), {
    kind: 'legacy',
    lyricSizeVw: 5,
    effectiveFill: false,
  })
  assert.deepEqual(resolveSizeMode({ lyricSizeVw: 45 }), {
    kind: 'legacy',
    lyricSizeVw: 45,
    effectiveFill: true,
  })
})

test('legado nunca reparte — continua encolhendo como hoje', () => {
  assert.equal(shouldSplitOverflow({ lyricSizeVw: 5 }), false)
  assert.equal(shouldSplitOverflow({ lyricSizeVw: 45 }), false)
})

test('só o modo fixo reparte', () => {
  assert.equal(shouldSplitOverflow({ lyricSizeVw: 5, fillMode: false }), true)
  assert.equal(
    shouldSplitOverflow({ lyricSizeVw: 5, fillMode: true, fillPct: 80 }),
    false,
  )
})

test('PREENCHER explícito lê o percentual, não o vw', () => {
  assert.deepEqual(
    resolveSizeMode({ lyricSizeVw: 5, fillMode: true, fillPct: 80 }),
    { kind: 'fill', pct: 80 },
  )
})

test('fixo explícito lê o vw', () => {
  assert.deepEqual(resolveSizeMode({ lyricSizeVw: 6.5, fillMode: false }), {
    kind: 'fixed',
    vw: 6.5,
  })
})

test('legado de preencher migra o valor para fillPct, não para o vw', () => {
  // O ponto do bug: 45 significa "preencher 45%". Copiar para lyricSizeVw
  // faria 45vw — letra gigante no primeiro clique do operador.
  const explicit = toExplicitSizeFields({ lyricSizeVw: 45 })

  assert.equal(explicit.fillMode, true)
  assert.equal(explicit.fillPct, 45)
  assert.equal(explicit.lyricSizeVw, DEFAULT_LYRIC_SIZE_VW)
  assert.notEqual(explicit.lyricSizeVw, 45)
})

test('legado de vw migra o valor para lyricSizeVw', () => {
  const explicit = toExplicitSizeFields({ lyricSizeVw: 4.5 })

  assert.equal(explicit.fillMode, false)
  assert.equal(explicit.lyricSizeVw, 4.5)
  assert.equal(explicit.fillPct, DEFAULT_FILL_PCT)
})

test('migrar duas vezes não muda mais nada', () => {
  const once = toExplicitSizeFields({ lyricSizeVw: 45 })
  const twice = toExplicitSizeFields(once)
  assert.deepEqual(twice, once)
})

test('valores fora da faixa são contidos', () => {
  assert.deepEqual(
    resolveSizeMode({ lyricSizeVw: 5, fillMode: true, fillPct: 999 }),
    { kind: 'fill', pct: 100 },
  )
  assert.deepEqual(resolveSizeMode({ lyricSizeVw: 999, fillMode: false }), {
    kind: 'fixed',
    vw: 20,
  })
})

test('campo ausente ou inválido não quebra', () => {
  assert.equal(resolveSizeMode({} as never).kind, 'legacy')
  assert.equal(
    resolveSizeMode({ lyricSizeVw: Number.NaN }).kind,
    'legacy',
  )
})
