import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeLyricText,
  scoreTranscriptAgainstLine,
  shouldAdvanceToNext,
  pickLiveTarget,
  pickAutoTarget,
  priorForCandidate,
  candidateIndices,
  grammarPhrasesFromCandidates,
  type AutoLineCandidate,
} from '../src/auto-advance/match.ts'

describe('auto-advance match', () => {
  it('normaliza acentos e pontuação', () => {
    assert.equal(normalizeLyricText('Ó Senhor, Tu és!'), 'o senhor tu es')
  })

  it('pontua overlap com a linha', () => {
    const s = scoreTranscriptAgainstLine(
      'tua graca me basta senhor',
      'Tua graça me basta',
    )
    assert.ok(s > 0.5, `score=${s}`)
  })

  it('candidatos incluem a música inteira (exceto live)', () => {
    const idxs = candidateIndices({
      linesLength: 20,
      liveIndex: 5,
      previewIndex: 6,
    })
    assert.ok(idxs.includes(6))
    assert.ok(idxs.includes(15))
    assert.ok(!idxs.includes(5))
  })

  it('prioriza vizinho sobre verso longe com score parecido', () => {
    const live = 0
    const pref = 1
    const lines = [
      'Abertura',
      'ainda que a figueira nao floreca bem',
      'outro verso qualquer',
      'ainda que a figueira nao floreca bem',
    ]
    const cands: AutoLineCandidate[] = lines
      .map((line, i) => ({
        key: `s:${i}`,
        planItemId: 'song',
        slideIndex: i,
        line,
        prior: priorForCandidate({
          sameItem: true,
          slideIndex: i,
          liveIndex: live,
          previewIndex: pref,
          planDistance: 0,
        }),
        sameItem: true,
        neighborDist: Math.abs(i - live),
      }))
      .filter((c) => c.slideIndex !== live)

    const pick = pickAutoTarget({
      transcript: 'ainda que a figueira nao floreca',
      candidates: cands,
      liveLine: lines[0],
    })
    assert.equal(pick.target?.slideIndex, 1)
  })

  it('acha o verso certo mesmo longe da Preview', () => {
    const lines = [
      'Abertura',
      'TU ÉS A MINHA HERANÇA',
      'Outra',
      'Ainda que a figueira não floreça',
      'Nem haja fruto nas vides',
    ]
    const pick = pickLiveTarget({
      transcript: 'ainda que a figueira nao floreca',
      lines,
      liveIndex: 0,
      previewIndex: 1,
      minScore: 0.22,
      minJumpScore: 0.34,
    })
    assert.equal(pick.targetIndex, 3)
  })

  it('pode saltar para outro item do plano com score alto', () => {
    const cands: AutoLineCandidate[] = [
      {
        key: 'a:1',
        planItemId: 'a',
        slideIndex: 1,
        line: 'TU ÉS A MINHA HERANÇA',
        prior: 0.22,
        sameItem: true,
        neighborDist: 1,
      },
      {
        key: 'b:0',
        planItemId: 'b',
        slideIndex: 0,
        line: 'Grande e o Senhor e mui digno de louvor',
        prior: 0.05,
        sameItem: false,
        neighborDist: 99,
      },
    ]
    const pick = pickAutoTarget({
      transcript: 'grande e o senhor e mui digno de louvor',
      candidates: cands,
      liveLine: 'verso atual da musica a',
      minOtherItemScore: 0.35,
    })
    assert.equal(pick.target?.planItemId, 'b')
    assert.equal(pick.target?.slideIndex, 0)
  })

  it('grammar prioriza aberturas da Preview/vizinhos', () => {
    const cands: AutoLineCandidate[] = [
      {
        key: 's:1',
        planItemId: 's',
        slideIndex: 1,
        line: 'Ainda que a figueira não floreça',
        prior: 0.28,
        sameItem: true,
        neighborDist: 1,
      },
      {
        key: 's:8',
        planItemId: 's',
        slideIndex: 8,
        line: 'Outro verso bem distante daqui',
        prior: 0,
        sameItem: true,
        neighborDist: 8,
      },
    ]
    const phrases = grammarPhrasesFromCandidates(cands, 6)
    assert.ok(phrases.some((p) => /figueira|ainda que/i.test(p)))
    assert.ok(phrases.some((p) => p.startsWith('ainda')))
  })

  it('avança na abertura da próxima — sem esperar a frase toda', () => {
    const lines = [
      'Tua graca me basta senhor',
      'Ainda que a figueira nao floreca',
      'Nem haja fruto nas vides',
    ]
    const pick = pickLiveTarget({
      transcript: 'ainda que a figueira',
      lines,
      liveIndex: 0,
      previewIndex: 1,
    })
    assert.equal(pick.targetIndex, 1)
    assert.ok(pick.preferredScore >= 0.32 || (pick.best?.score ?? 0) >= 0.32)
  })

  it('não troca se ainda está na frase do ar', () => {
    const lines = ['Tua graça me basta', 'Quão grandes são']
    const pick = pickLiveTarget({
      transcript: 'tua graca me basta',
      lines,
      liveIndex: 0,
      previewIndex: 1,
    })
    assert.equal(pick.targetIndex, null)
  })

  it('não salta por transcript fraco / alucinado', () => {
    const lines = [
      'Primeira',
      'Segunda linha do canto',
      'Terceira',
      'Quarta',
      'Quinta',
      'Sexta',
      'Setima',
      'Oitava',
      'Com a criacao eu canto',
    ]
    const pick = pickLiveTarget({
      transcript: 'bom dia pessoal',
      lines,
      liveIndex: 1,
      previewIndex: 2,
      minScore: 0.32,
      minJumpScore: 0.48,
    })
    assert.equal(pick.targetIndex, null)
  })

  it('ignora filler típico do Whisper', () => {
    const lines = ['Primeira frase aqui', 'Segunda linha do canto']
    const pick = pickLiveTarget({
      transcript: 'E aí!',
      lines,
      liveIndex: 0,
      previewIndex: 1,
    })
    assert.equal(pick.targetIndex, null)
    assert.equal(pick.best, null)
  })

  it('volta pro refrão quando a abertura de trás ganha', () => {
    const lines = [
      'Refrao grande e o senhor',
      'Verso um da estrofe',
      'Verso dois da estrofe',
      'Verso tres agora',
    ]
    const pick = pickLiveTarget({
      transcript: 'refrao grande e o senhor',
      lines,
      liveIndex: 3,
      previewIndex: 4,
    })
    assert.equal(pick.targetIndex, 0)
  })

  it('shouldAdvanceToNext compat: avança só se alvo for a próxima', () => {
    const lines = ['Primeira frase aqui', 'Segunda linha do canto', 'Terceira']
    const decision = shouldAdvanceToNext({
      transcript: 'segunda linha do canto',
      lines,
      liveIndex: 0,
    })
    assert.equal(decision.advance, true)
  })
})
