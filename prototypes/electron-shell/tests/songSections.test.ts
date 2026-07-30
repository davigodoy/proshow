import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allowedSlideIndices,
  ensureEditableSections,
  flattenSections,
  inferSectionsFromLines,
  joinLineWithPrev,
  moveLinesToSection,
  removeLinesAt,
  resolveSections,
  sectionDisplayName,
  splitLineAt,
  updateLineAt,
} from '../src/lyrics/songSections.ts'

describe('song sections', () => {
  it('infere refrão por bloco repetido', () => {
    const lines = [
      'Verso um linha a',
      'Verso um linha b',
      'Deus de promessas',
      'Deus de aliança',
      'Verso dois linha a',
      'Verso dois linha b',
      'Deus de promessas',
      'Deus de aliança',
    ]
    const secs = inferSectionsFromLines(lines)
    assert.ok(secs.some((s) => s.kind === 'refrao'))
    assert.equal(flattenSections(secs).length, lines.length)
    const ref = secs.filter((s) => s.kind === 'refrao')
    assert.ok(ref.length >= 2)
  })

  it('resolveSections infere quando vazio', () => {
    const lines = ['A', 'B', 'A', 'B']
    const secs = resolveSections(lines, null)
    assert.ok(secs.length >= 1)
    assert.equal(flattenSections(secs).join('|'), 'A|B|A|B')
  })

  it('move linhas para refrão e cria variante B', () => {
    let secs = inferSectionsFromLines([
      'um',
      'dois',
      'tres',
      'um',
      'dois',
    ])
    // move slide 2 (tres) para novo refrão B
    secs = moveLinesToSection(secs, [2], { kind: 'refrao', newVariant: true })
    assert.ok(secs.some((s) => s.kind === 'refrao' && s.variant >= 1))
    assert.ok(sectionDisplayName(secs.find((s) => s.variant >= 1)!).includes('B'))
  })

  it('allowedSlideIndices libera refrão mesmo longe', () => {
    const secs = inferSectionsFromLines([
      'v1a',
      'v1b',
      'ref a',
      'ref b',
      'v2a',
      'v2b',
      'ref a',
      'ref b',
    ])
    const flat = flattenSections(secs)
    const live = flat.findIndex((l) => l === 'v2b')
    const allowed = allowedSlideIndices({ sections: secs, liveIndex: live })
    const refIdx = flat.findIndex((l) => l === 'ref a')
    assert.ok(allowed.has(refIdx), 'deve permitir voltar ao refrão')
  })

  it('Enter parte linha; Backspace junta', () => {
    let secs = resolveSections(['abc', 'def'], null)
    secs = updateLineAt(secs, 0, 'abXYc')
    const split = splitLineAt(secs, 0, 2)
    assert.equal(flattenSections(split.sections).join('|'), 'ab|XYc|def')
    assert.equal(split.focusIndex, 1)
    const joined = joinLineWithPrev(split.sections, 1)
    assert.ok(joined)
    assert.equal(flattenSections(joined!.sections).join('|'), 'abXYc|def')
    assert.equal(joined!.cursor, 2)
  })

  it('removeLinesAt tira seleção e limpa seção vazia', () => {
    let secs = resolveSections(['a', 'b', 'c', 'd'], null)
    secs = moveLinesToSection(secs, [2, 3], { kind: 'refrao', newVariant: true })
    const removed = removeLinesAt(secs, [1, 2])
    assert.equal(flattenSections(removed.sections).join('|'), 'a|d')
    assert.equal(removed.focusIndex, 1)
  })

  it('ensureEditableSections descarta seção só com linha vazia', () => {
    const secs = ensureEditableSections([
      {
        id: '1',
        kind: 'verso',
        variant: 0,
        lines: ['ainda tem'],
      },
      {
        id: '2',
        kind: 'refrao',
        variant: 0,
        lines: ['', '  '],
      },
    ])
    assert.equal(secs.length, 1)
    assert.equal(secs[0].kind, 'verso')
    assert.equal(flattenSections(secs).join('|'), 'ainda tem')
  })
})
