import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveSlides,
  identityDerived,
  partLabel,
  remapIndex,
} from '../src/theme/derivedSlides.ts'

const maxChars = (n: number) => (candidate: string) => candidate.length <= n

test('desligado, cada linha continua sendo um slide', () => {
  const lines = ['uma linha bem longa que nao caberia', 'outra']
  const d = deriveSlides(lines, maxChars(10), false)

  assert.deepEqual(d.lines, lines)
  assert.deepEqual(d.sourceIndex, [0, 1])
  assert.deepEqual(d.partTotal, [1, 1])
})

test('linha que nao cabe vira mais de um slide, guardando a origem', () => {
  const lines = ['primeira linha bem comprida para repartir', 'curta']
  const d = deriveSlides(lines, maxChars(20), true)

  assert.ok(d.lines.length > 2, 'a primeira linha deveria ter sido repartida')
  // todas as partes da linha 0 apontam para 0
  const fromZero = d.sourceIndex.filter((s) => s === 0).length
  assert.ok(fromZero >= 2)
  // a linha curta continua inteira e é a última
  assert.equal(d.lines[d.lines.length - 1], 'curta')
  assert.equal(d.sourceIndex[d.sourceIndex.length - 1], 1)
})

test('linha vazia não desaparece do plano', () => {
  const d = deriveSlides(['', 'texto'], maxChars(20), true)
  assert.equal(d.lines.length, 2)
})

test('rótulo de parte só aparece quando houve divisão', () => {
  const d = deriveSlides(['uma frase longa que sera repartida', 'curta'], maxChars(18), true)

  assert.equal(partLabel(d, 0), 'parte 1 de ' + d.partTotal[0])
  const lastIdx = d.lines.length - 1
  assert.equal(partLabel(d, lastIdx), null, 'linha inteira não leva rótulo')
})

test('numeração das partes é sequencial dentro da linha', () => {
  const d = deriveSlides(['a frase comprida o suficiente para tres partes ok'], maxChars(20), true)
  const total = d.partTotal[0]
  assert.deepEqual(
    d.part,
    Array.from({ length: total }, (_, i) => i + 1),
  )
})

test('trocar de tema mantém o operador na mesma linha original', () => {
  const lines = ['linha zero curta', 'linha um que e bem mais comprida que a outra']

  // tema "largo": nada reparte
  const antes = deriveSlides(lines, maxChars(100), true)
  // tema "apertado": a linha 1 se divide
  const depois = deriveSlides(lines, maxChars(20), true)

  // operador estava na linha original 1
  const idxAntes = antes.sourceIndex.indexOf(1)
  const idxDepois = remapIndex(antes, depois, idxAntes)

  assert.equal(depois.sourceIndex[idxDepois], 1, 'deveria continuar na linha 1')
})

test('voltar para tema largo não deixa o cursor fora da lista', () => {
  const lines = ['zero', 'linha um que e bem mais comprida que a outra']
  const apertado = deriveSlides(lines, maxChars(20), true)
  const largo = deriveSlides(lines, maxChars(100), true)

  // estava na última parte da linha 1
  const ultimo = apertado.lines.length - 1
  const remapped = remapIndex(apertado, largo, ultimo)

  assert.ok(remapped < largo.lines.length, 'índice não pode estourar')
  assert.equal(largo.sourceIndex[remapped], 1)
})

test('remap tolera índice inválido e lista vazia', () => {
  const d = identityDerived(['a', 'b'])
  assert.equal(remapIndex(d, d, 99), 1)
  assert.equal(remapIndex(d, d, -5), 0)
  assert.equal(remapIndex(identityDerived([]), d, 0), 0)
})
