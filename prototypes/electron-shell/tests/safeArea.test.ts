import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FULL_FRAME_SAFE_AREA,
  composeSafeArea,
  effectiveSafeArea,
  normalizeOutputSafeArea,
  outputMaskClipPath,
  themeSafeArea,
} from '../src/theme/safeArea.ts'

test('sem margem, a máscara não recorta nada', () => {
  assert.equal(outputMaskClipPath(null), 'none')
  assert.equal(outputMaskClipPath(FULL_FRAME_SAFE_AREA), 'none')
})

test('a máscara recorta o retângulo das margens da saída', () => {
  assert.equal(
    outputMaskClipPath({ top: 15, right: 0, bottom: 5, left: 10 }),
    'inset(15% 0% 5% 10%)',
  )
})

test('saída sem margem: a área efetiva é a do tema, intacta', () => {
  const theme = { safeArea: { top: 6, right: 8, bottom: 10, left: 12 } }
  assert.deepEqual(
    effectiveSafeArea(theme as never, FULL_FRAME_SAFE_AREA),
    { top: 6, right: 8, bottom: 10, left: 12 },
  )
})

test('sem margem de saída informada, nada muda em relação a hoje', () => {
  const theme = { safeArea: { top: 6, right: 6, bottom: 6, left: 6 } }
  assert.deepEqual(
    effectiveSafeArea(theme as never, null),
    themeSafeArea(theme as never),
  )
})

test('tema sem margem própria: a área efetiva é a da saída', () => {
  const output = { top: 10, right: 10, bottom: 10, left: 10 }
  const theme = { top: 0, right: 0, bottom: 0, left: 0 }
  assert.deepEqual(composeSafeArea(output, theme), output)
})

test('a margem do tema recorta DENTRO da saída, nunca para fora', () => {
  // Saída corta 10% de cada lado → sobra 80% de largura e altura.
  // O tema pede 25% → 25% de 80 = 20 pontos do quadro, somados aos 10 da saída.
  const output = { top: 10, right: 10, bottom: 10, left: 10 }
  const theme = { top: 25, right: 25, bottom: 25, left: 25 }
  assert.deepEqual(composeSafeArea(output, theme), {
    top: 30,
    right: 30,
    bottom: 30,
    left: 30,
  })
})

test('o teto da margem do tema passa a valer sobre a área livre', () => {
  // 90% seria degenerado; a normalização cobra o teto de 40% ANTES de compor,
  // então o tema come no máximo 40% do que a saída liberou.
  const output = { top: 10, right: 10, bottom: 10, left: 10 }
  const got = composeSafeArea(output, {
    top: 90,
    right: 90,
    bottom: 90,
    left: 90,
  })
  assert.deepEqual(got, { top: 42, right: 42, bottom: 42, left: 42 })
  assert.ok(got.top + got.bottom < 100)
  assert.ok(got.left + got.right < 100)
})

test('margens assimétricas compõem lado a lado', () => {
  const output = { top: 20, right: 0, bottom: 0, left: 40 }
  const theme = { top: 30, right: 25, bottom: 10, left: 0 }
  // largura livre = 60, altura livre = 80
  assert.deepEqual(composeSafeArea(output, theme), {
    top: 20 + (30 * 80) / 100, // 44
    right: 0 + (25 * 60) / 100, // 15
    bottom: 0 + (10 * 80) / 100, // 8
    left: 40 + 0, // 40
  })
})

test('a área efetiva nunca escapa da margem da saída', () => {
  const output = normalizeOutputSafeArea({
    top: 40,
    right: 40,
    bottom: 40,
    left: 40,
  })
  for (const pct of [0, 10, 40, 100]) {
    const got = composeSafeArea(output, {
      top: pct,
      right: pct,
      bottom: pct,
      left: pct,
    })
    assert.ok(got.top >= output.top, `top ${pct}`)
    assert.ok(got.right >= output.right, `right ${pct}`)
    assert.ok(got.bottom >= output.bottom, `bottom ${pct}`)
    assert.ok(got.left >= output.left, `left ${pct}`)
    assert.ok(got.top + got.bottom <= 100, `altura ${pct}`)
    assert.ok(got.left + got.right <= 100, `largura ${pct}`)
  }
})

test('margem de saída ausente ou inválida vira quadro inteiro', () => {
  assert.deepEqual(
    normalizeOutputSafeArea(null),
    FULL_FRAME_SAFE_AREA,
  )
  assert.deepEqual(
    normalizeOutputSafeArea({ top: -5, right: 999, bottom: NaN, left: 3 }),
    { top: 0, right: 40, bottom: 0, left: 3 },
  )
})
