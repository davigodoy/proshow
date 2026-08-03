/**
 * Match de transcript × linhas candidatas do plano.
 * Prioriza vizinhos do AO VIVO / Preview; ainda olha a música e o resto do plano.
 */

export function normalizeLyricText(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(input: string): string[] {
  const n = normalizeLyricText(input)
  return n ? n.split(' ').filter(Boolean) : []
}

const HALLUCINATION_RE =
  /^(e ai!?|e ai\?|please\.?|thanks for watching\.?|subscribe\.?|legendas?|um pouquinho\.?|fufu\.?|daa!?|tchau\.?|bye\.?|ok\.?|hmm+|uh+|ah+|oh+|yeah\.?|yes\.?|no\.?|obrigado\.?|valeu\.?)$/i

export function isLikelyHallucination(transcript: string): boolean {
  const raw = String(transcript || '').trim()
  if (!raw) return true
  if (HALLUCINATION_RE.test(raw)) return true
  const n = normalizeLyricText(raw)
  if (!n || n.length < 3) return true
  const toks = n.split(' ').filter(Boolean)
  if (toks.length === 1 && toks[0].length <= 3) return true
  if (
    toks.length <= 2 &&
    toks.every((t) =>
      ['e', 'ai', 'ei', 'oi', 'la', 'ne', 'ta', 'pra'].includes(t),
    )
  ) {
    return true
  }
  return false
}

export function charBigramSimilarity(a: string, b: string): number {
  const x = normalizeLyricText(a).replace(/\s/g, '')
  const y = normalizeLyricText(b).replace(/\s/g, '')
  if (!x.length || !y.length) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0

  const grams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) || 0) + 1)
    }
    return m
  }
  const A = grams(x)
  const B = grams(y)
  let inter = 0
  for (const [g, c] of A) inter += Math.min(c, B.get(g) || 0)
  const total =
    [...A.values()].reduce((s, n) => s + n, 0) +
    [...B.values()].reduce((s, n) => s + n, 0)
  return total > 0 ? (2 * inter) / total : 0
}

function wordHitsInText(haystack: string, word: string): boolean {
  if (!word) return false
  if (haystack.includes(word)) return true
  if (word.length < 4) return false
  const stem = word.slice(0, Math.max(4, word.length - 2))
  return stem.length >= 4 && haystack.includes(stem)
}

function softTokenCoverage(
  transcriptToks: string[],
  lineToks: string[],
): number {
  if (!lineToks.length) return 0
  const hay = transcriptToks.join(' ')
  let hit = 0
  for (const lw of lineToks) {
    if (lw.length < 3) {
      if (transcriptToks.includes(lw)) hit += 1
      continue
    }
    if (wordHitsInText(hay, lw)) {
      hit += 1
      continue
    }
    const soft = transcriptToks.some(
      (tw) =>
        tw.length >= 3 &&
        (tw.startsWith(lw.slice(0, 3)) ||
          lw.startsWith(tw.slice(0, 3)) ||
          (lw.length >= 4 && tw.includes(lw.slice(0, 4))) ||
          (tw.length >= 4 && lw.includes(tw.slice(0, 4)))),
    )
    if (soft) hit += 0.65
  }
  return hit / lineToks.length
}

function distinctiveBoost(transcript: string, line: string): number {
  const hay = normalizeLyricText(transcript)
  const words = tokenize(line).filter((w) => w.length >= 5)
  if (!words.length || !hay) return 0
  let hits = 0
  for (const w of words) {
    if (wordHitsInText(hay, w)) hits += 1
  }
  return (hits / words.length) * 0.4
}

/** Primeiras N palavras da linha (abertura do verso) — sem acento (match). */
export function lineOpening(line: string, maxWords = 4): string {
  return tokenize(line).slice(0, Math.max(1, maxWords)).join(' ')
}

/** Abertura com acentos — para grammar do Vosk PT. */
export function lineOpeningRaw(line: string, maxWords = 4): string {
  return String(line || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, Math.max(1, maxWords))
    .join(' ')
}

/**
 * Frases da grammar fechada.
 * Sempre reserva aberturas pra trás (refrão) + Preview/frente.
 */
export function grammarPhrasesFromCandidates(
  candidates: AutoLineCandidate[],
  limit = 18,
  liveIndex?: number,
): string[] {
  const same = candidates.filter((c) => c.sameItem)
  const behind =
    liveIndex != null
      ? same
          .filter((c) => c.slideIndex < liveIndex)
          .sort((a, b) => b.slideIndex - a.slideIndex)
          .slice(0, 6)
      : same
          .filter((c) => c.prior >= 0.1 && c.neighborDist <= 4)
          .slice(0, 4)

  const ahead = same
    .filter(
      (c) =>
        liveIndex == null ||
        c.slideIndex > liveIndex,
    )
    .sort((a, b) => b.prior - a.prior || a.neighborDist - b.neighborDist)
    .slice(0, 8)

  const rest = candidates
    .filter(
      (c) =>
        !behind.some((b) => b.key === c.key) &&
        !ahead.some((a) => a.key === c.key),
    )
    .sort((a, b) => b.prior - a.prior)
    .slice(0, 4)

  // Frente primeiro na lista, mas behind garantido na grammar
  const ordered = [...ahead, ...behind, ...rest].slice(0, limit)
  const out: string[] = []
  for (const c of ordered) {
    for (const n of [3, 4, 2]) {
      const raw = lineOpeningRaw(c.line, n)
      const words = raw.split(' ').filter(Boolean)
      if (words.length >= 2 && raw.length >= 5) out.push(raw)
    }
  }
  return [...new Set(out)]
}

/** Só o fim do transcript — o que está sendo cantado agora, não o verso anterior. */
export function recentTranscript(transcript: string, maxWords = 7): string {
  return tokenize(transcript).slice(-Math.max(2, maxWords)).join(' ')
}

function softWordEq(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b.slice(0, 3)) || b.startsWith(a.slice(0, 3)))) {
    return true
  }
  return wordHitsInText(a, b) || wordHitsInText(b, a)
}

/**
 * Score das primeiras palavras: sequência + cobertura no fim do transcript.
 * É o caminho rápido — não espera o slide inteiro.
 */
export function scoreTranscriptAgainstOpening(
  transcript: string,
  line: string,
  maxWords = 4,
): number {
  const recent = tokenize(recentTranscript(transcript, Math.max(maxWords + 3, 8)))
  if (!recent.length) return 0

  let best = 0
  for (const n of [2, 3, 4]) {
    if (n > maxWords) continue
    const opening = tokenize(line).slice(0, n)
    if (opening.length < Math.min(2, n)) continue

    // Quantas palavras da abertura aparecem em ordem no recent
    let seq = 0
    let ri = 0
    while (ri < recent.length && seq < opening.length) {
      if (softWordEq(recent[ri], opening[seq])) seq++
      ri++
    }
    // Também tenta achar a abertura como bloco perto do fim
    let block = 0
    for (let start = 0; start <= recent.length - 1; start++) {
      let hit = 0
      for (let k = 0; k < opening.length && start + k < recent.length; k++) {
        if (softWordEq(recent[start + k], opening[k])) hit++
        else break
      }
      if (hit > block) block = hit
    }
    const seqScore = seq / opening.length
    const blockScore = block / opening.length
    const cov = softTokenCoverage(recent, opening)
    const big = charBigramSimilarity(recent.join(' '), opening.join(' '))
    const s = Math.min(
      1,
      blockScore * 0.42 + seqScore * 0.28 + cov * 0.18 + big * 0.12,
    )
    if (s > best) best = s
  }
  return best
}

export function scoreTranscriptAgainstLine(
  transcript: string,
  line: string,
): number {
  // Decisão rápida: prioriza abertura no trecho recente
  const opening = scoreTranscriptAgainstOpening(transcript, line, 4)
  const recent = recentTranscript(transcript, 8)
  const t = tokenize(recent)
  const l = tokenize(line)
  if (!t.length || !l.length) return opening

  const tSet = new Set(t)
  const lSet = new Set(l)
  let inter = 0
  for (const w of tSet) if (lSet.has(w)) inter++
  const union = tSet.size + lSet.size - inter
  const jaccard = union > 0 ? inter / union : 0

  const coverage = softTokenCoverage(t, l.slice(0, Math.min(l.length, 6)))
  const bigram = charBigramSimilarity(recent, lineOpening(line, 5))
  const distinctive = distinctiveBoost(recent, lineOpening(line, 5))

  const fullish = Math.min(
    1,
    jaccard * 0.2 + coverage * 0.35 + bigram * 0.2 + distinctive * 0.25,
  )
  // Abertura manda — não precisa “ver a frase toda”
  return Math.min(1, Math.max(opening, fullish * 0.85, opening * 0.55 + fullish * 0.45))
}

/** Uma linha candidata (slide) — pode ser da música atual ou de outro item do plano. */
export type AutoLineCandidate = {
  key: string
  planItemId: string
  slideIndex: number
  line: string
  /** Bônus de ranking (vizinho > longe > outro item). */
  prior: number
  sameItem: boolean
  /** Distância ao slide AO VIVO (mesmo item); 99 se outro item. */
  neighborDist: number
}

export type RankedCandidate = AutoLineCandidate & {
  score: number
  ranked: number
}

export type AutoGoLiveTarget = {
  planItemId: string
  slideIndex: number
}

/** Prior: Preview/próxima no topo; refrão (atrás) com peso real; resto depois. */
export function priorForCandidate(opts: {
  sameItem: boolean
  slideIndex: number
  liveIndex: number
  previewIndex: number
  planDistance: number
}): number {
  if (opts.sameItem) {
    if (opts.slideIndex === opts.previewIndex) return 0.28
    if (opts.slideIndex === opts.liveIndex + 1) return 0.24

    const back = opts.liveIndex - opts.slideIndex
    if (back === 1) return 0.2
    if (back === 2) return 0.16
    if (back === 3 || back === 4) return 0.12
    if (back > 0 && back <= 10) return 0.08

    const distLive = Math.abs(opts.slideIndex - opts.liveIndex)
    const distPref = Math.abs(opts.slideIndex - opts.previewIndex)
    if (distLive === 1 || distPref === 1) return 0.16
    if (distLive === 2 || distPref === 2) return 0.09
    if (distLive <= 4 || distPref <= 3) return 0.03
    return 0
  }
  if (opts.planDistance === 1) return 0.05
  if (opts.planDistance === 2) return 0.025
  return 0.01
}

export function scoreAutoCandidates(opts: {
  transcript: string
  candidates: AutoLineCandidate[]
}): RankedCandidate[] {
  return opts.candidates
    .map((c) => {
      const score = scoreTranscriptAgainstLine(opts.transcript, c.line)
      return {
        ...c,
        score,
        ranked: Math.min(1.4, score + c.prior),
      }
    })
    .sort((a, b) => b.ranked - a.ranked || b.score - a.score)
}

/**
 * Escolhe alvo: Preview/próxima rápido; refrão (atrás) com caminho próprio;
 * salto longe / outro item só com score claro.
 */
export function pickAutoTarget(opts: {
  transcript: string
  candidates: AutoLineCandidate[]
  liveLine: string
  liveIndex?: number
  minNeighborScore?: number
  /** Limiar pra voltar (refrão) — abaixo do salto longe pra frente. */
  minBehindScore?: number
  minFarScore?: number
  minOtherItemScore?: number
  marginOverLive?: number
}): {
  target: AutoGoLiveTarget | null
  liveScore: number
  best: RankedCandidate | null
  preferred: RankedCandidate | null
} {
  if (isLikelyHallucination(opts.transcript)) {
    return { target: null, liveScore: 0, best: null, preferred: null }
  }

  const minNeighbor = opts.minNeighborScore ?? 0.36
  const minBehind = opts.minBehindScore ?? 0.34
  const minFar = opts.minFarScore ?? 0.48
  const minOther = opts.minOtherItemScore ?? 0.55
  const margin = opts.marginOverLive ?? 0.02
  const liveIdx = opts.liveIndex ?? -1

  const liveScore = scoreTranscriptAgainstOpening(
    opts.transcript,
    opts.liveLine || '',
    4,
  )
  const ranked = scoreAutoCandidates(opts)
  const best = ranked[0] ?? null
  const preferred =
    ranked.find((c) => c.sameItem && c.prior >= 0.24) ??
    ranked.find(
      (c) =>
        c.sameItem &&
        liveIdx >= 0 &&
        c.slideIndex === liveIdx + 1,
    ) ??
    null

  if (!best) {
    return { target: null, liveScore, best: null, preferred }
  }

  if (liveScore >= best.score + 0.06 && liveScore >= minNeighbor) {
    return { target: null, liveScore, best, preferred }
  }

  function accept(
    c: RankedCandidate,
    min: number,
  ): AutoGoLiveTarget | null {
    if (c.score < min) return null
    if (c.score < liveScore + margin) return null
    return { planItemId: c.planItemId, slideIndex: c.slideIndex }
  }

  const behindPool =
    liveIdx >= 0
      ? ranked.filter((c) => c.sameItem && c.slideIndex < liveIdx)
      : []
  const bestBehind = behindPool[0] ?? null

  // Refrão/volta: se a abertura de trás ganha claro da Preview, volta já
  if (bestBehind) {
    const openBack = scoreTranscriptAgainstOpening(
      opts.transcript,
      bestBehind.line,
      4,
    )
    const backScore = Math.max(bestBehind.score, openBack)
    const prefScore = preferred
      ? Math.max(
          preferred.score,
          scoreTranscriptAgainstOpening(opts.transcript, preferred.line, 4),
        )
      : 0
    if (
      backScore >= minBehind &&
      backScore >= liveScore + margin &&
      backScore + 0.02 >= prefScore
    ) {
      return {
        target: {
          planItemId: bestBehind.planItemId,
          slideIndex: bestBehind.slideIndex,
        },
        liveScore,
        best,
        preferred,
      }
    }
  }

  // Preview / live+1 — só se não perdeu pro refrão
  if (preferred) {
    const openPref = scoreTranscriptAgainstOpening(
      opts.transcript,
      preferred.line,
      4,
    )
    const score = Math.max(preferred.score, openPref)
    if (score >= Math.min(minNeighbor, 0.32) && score >= liveScore + margin) {
      return {
        target: {
          planItemId: preferred.planItemId,
          slideIndex: preferred.slideIndex,
        },
        liveScore,
        best,
        preferred,
      }
    }
  }

  // Vizinho próximo (frente ou -1/-2)
  const neighborPool = ranked.filter(
    (c) => c.sameItem && (c.neighborDist <= 2 || c.prior >= 0.09),
  )
  const bestNeighbor = neighborPool[0]
  if (bestNeighbor) {
    if (
      bestNeighbor.ranked + 0.06 >= best.ranked ||
      bestNeighbor.score + 0.1 >= best.score
    ) {
      const behind =
        liveIdx >= 0 && bestNeighbor.slideIndex < liveIdx
      const t = accept(bestNeighbor, behind ? minBehind : minNeighbor)
      if (t) return { target: t, liveScore, best, preferred }
    }
  }

  // Mesma música, mais longe
  if (best.sameItem) {
    const isBehind = liveIdx >= 0 && best.slideIndex < liveIdx
    const near = best.neighborDist <= 2
    const min = isBehind ? minBehind : near ? minNeighbor : minFar
    const t = accept(best, min)
    if (t) return { target: t, liveScore, best, preferred }
  }

  if (!best.sameItem) {
    const t = accept(best, minOther)
    if (t) return { target: t, liveScore, best, preferred }
  }

  return { target: null, liveScore, best, preferred }
}

/** Compat: API antiga baseada só em lines[] da música atual. */
export function candidateIndices(opts: {
  linesLength: number
  liveIndex: number
  previewIndex?: number
  ahead?: number
  behind?: number
}): number[] {
  const n = opts.linesLength
  const live = Math.max(0, opts.liveIndex)
  const set = new Set<number>()
  for (let i = 0; i < n; i++) {
    if (i !== live) set.add(i)
  }
  return [...set].sort((a, b) => a - b)
}

export function scoreProgramCandidates(opts: {
  transcript: string
  lines: string[]
  liveIndex: number
  previewIndex?: number
}): Array<{ index: number; line: string; score: number; ranked: number }> {
  const live = Math.max(0, opts.liveIndex)
  const preferred =
    opts.previewIndex != null && opts.previewIndex >= 0
      ? opts.previewIndex
      : live + 1
  const candidates: AutoLineCandidate[] = opts.lines.map((line, i) => ({
    key: `x:${i}`,
    planItemId: 'x',
    slideIndex: i,
    line,
    prior:
      i === live
        ? -1
        : priorForCandidate({
            sameItem: true,
            slideIndex: i,
            liveIndex: live,
            previewIndex: preferred,
            planDistance: 0,
          }),
    sameItem: true,
    neighborDist: Math.abs(i - live),
  })).filter((c) => c.slideIndex !== live)

  return scoreAutoCandidates({
    transcript: opts.transcript,
    candidates,
  }).map((c) => ({
    index: c.slideIndex,
    line: c.line,
    score: c.score,
    ranked: c.ranked,
  }))
}

export function scoreCandidates(
  transcript: string,
  lines: string[],
  fromIndex: number,
  windowSize = 4,
): Array<{ index: number; line: string; score: number; ranked: number }> {
  const live = Math.max(0, fromIndex - 1)
  return scoreProgramCandidates({
    transcript,
    lines,
    liveIndex: live,
    previewIndex: fromIndex,
  }).filter((c) => c.index >= fromIndex && c.index < fromIndex + windowSize)
}

export function pickLiveTarget(opts: {
  transcript: string
  lines: string[]
  liveIndex: number
  previewIndex?: number
  minScore?: number
  minJumpScore?: number
  marginOverLive?: number
}): {
  targetIndex: number | null
  liveScore: number
  preferredScore: number
  best: { index: number; line: string; score: number; ranked: number } | null
} {
  const live = Math.max(0, opts.liveIndex)
  const preferred =
    opts.previewIndex != null && opts.previewIndex >= 0
      ? opts.previewIndex
      : live + 1
  const candidates: AutoLineCandidate[] = opts.lines
    .map((line, i) => ({
      key: `x:${i}`,
      planItemId: 'x',
      slideIndex: i,
      line,
      prior: priorForCandidate({
        sameItem: true,
        slideIndex: i,
        liveIndex: live,
        previewIndex: preferred,
        planDistance: 0,
      }),
      sameItem: true,
      neighborDist: Math.abs(i - live),
    }))
    .filter((c) => c.slideIndex !== live)

  const pick = pickAutoTarget({
    transcript: opts.transcript,
    candidates,
    liveLine: opts.lines[live] || '',
    liveIndex: live,
    minNeighborScore: opts.minScore ?? 0.32,
    minBehindScore: Math.min(opts.minScore ?? 0.32, 0.34),
    minFarScore: opts.minJumpScore ?? 0.48,
    marginOverLive: opts.marginOverLive ?? 0.02,
  })

  const preferredScore = scoreTranscriptAgainstLine(
    opts.transcript,
    opts.lines[preferred] || '',
  )

  return {
    targetIndex: pick.target?.slideIndex ?? null,
    liveScore: pick.liveScore,
    preferredScore,
    best: pick.best
      ? {
          index: pick.best.slideIndex,
          line: pick.best.line,
          score: pick.best.score,
          ranked: pick.best.ranked,
        }
      : null,
  }
}

export function shouldAdvanceToNext(opts: {
  transcript: string
  lines: string[]
  liveIndex: number
  minNextScore?: number
  margin?: number
}): { advance: boolean; nextScore: number; currentScore: number } {
  const pick = pickLiveTarget({
    transcript: opts.transcript,
    lines: opts.lines,
    liveIndex: opts.liveIndex,
    previewIndex: opts.liveIndex + 1,
    minScore: opts.minNextScore,
    marginOverLive: opts.margin,
  })
  const next = opts.liveIndex + 1
  return {
    advance: pick.targetIndex === next,
    nextScore: pick.preferredScore,
    currentScore: pick.liveScore,
  }
}

export function whisperHintFromCandidates(
  candidates: AutoLineCandidate[],
  liveLine: string,
): string {
  const neighbors = candidates
    .filter((c) => c.sameItem && (c.neighborDist <= 2 || c.prior >= 0.2))
    .sort((a, b) => b.prior - a.prior || a.neighborDist - b.neighborDist)
    .slice(0, 5)
  // Só aberturas — empurra o Whisper pras primeiras palavras da próxima
  const parts = [
    lineOpening(liveLine, 4),
    ...neighbors.map((c) => lineOpening(c.line, 4)),
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  return [...new Set(parts)].join('. ').slice(0, 200)
}

/** @deprecated use whisperHintFromCandidates */
export function whisperHintFromLines(
  lines: string[],
  liveIndex: number,
  previewIndex: number,
): string {
  const idxs: number[] = []
  for (let d = -1; d <= 4; d++) {
    const i = liveIndex + d
    if (i >= 0 && i < lines.length) idxs.push(i)
  }
  for (let d = 0; d <= 3; d++) {
    const i = previewIndex + d
    if (i >= 0 && i < lines.length) idxs.push(i)
  }
  return [...new Set(idxs)]
    .map((i) => String(lines[i] || '').trim())
    .filter(Boolean)
    .join('. ')
    .slice(0, 280)
}
