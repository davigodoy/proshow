/**
 * Seções da letra (verso / refrão / coro / pré-coro / ponte).
 * Podem vir do editor OU ser inferidas por repetição — zero cadastro obrigatório.
 */

function normalizeLyricText(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type SectionKind =
  | 'verso'
  | 'refrao'
  | 'coro'
  | 'precoro'
  | 'ponte'
  | 'outro'

export type LyricSection = {
  id: string
  kind: SectionKind
  /** 0 = A, 1 = B… */
  variant: number
  lines: string[]
}

export const SECTION_KIND_ORDER: SectionKind[] = [
  'refrao',
  'coro',
  'precoro',
  'ponte',
  'verso',
]

export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  verso: 'Verso',
  refrao: 'Refrão',
  coro: 'Coro',
  precoro: 'Pré-coro',
  ponte: 'Ponte',
  outro: 'Outro',
}

export function sectionDisplayName(s: LyricSection): string {
  const base = SECTION_KIND_LABEL[s.kind] || 'Seção'
  if (s.variant <= 0) return base
  return `${base} ${String.fromCharCode(65 + s.variant)}`
}

export function newSectionId(): string {
  return `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function flattenSections(sections: LyricSection[]): string[] {
  return sections.flatMap((s) =>
    (s.lines || []).map((l) => String(l || '').trim()).filter(Boolean),
  )
}

/** Inclui linhas vazias — índice do editor. */
export function flattenSectionsRaw(sections: LyricSection[]): string[] {
  return sections.flatMap((s) => [...(s.lines || []).map((l) => String(l ?? ''))])
}

/** Mapa slideIndex → seção (após flatten). */
export function sectionSpans(
  sections: LyricSection[],
): Array<{ section: LyricSection; start: number; end: number }> {
  const out: Array<{ section: LyricSection; start: number; end: number }> = []
  let i = 0
  for (const section of sections) {
    const n = (section.lines || []).filter((l) => String(l || '').trim()).length
    if (!n) continue
    out.push({ section, start: i, end: i + n })
    i += n
  }
  return out
}

/** Spans com linhas vazias (edição). */
export function sectionSpansRaw(
  sections: LyricSection[],
): Array<{ section: LyricSection; start: number; end: number }> {
  const out: Array<{ section: LyricSection; start: number; end: number }> = []
  let i = 0
  for (const section of sections) {
    const n = (section.lines || []).length
    if (!n) continue
    out.push({ section, start: i, end: i + n })
    i += n
  }
  return out
}

export function sectionAtSlide(
  sections: LyricSection[],
  slideIndex: number,
): LyricSection | null {
  for (const span of sectionSpans(sections)) {
    if (slideIndex >= span.start && slideIndex < span.end) return span.section
  }
  return null
}

/** Transições musicalmente comuns no culto. */
export function allowedNextKinds(kind: SectionKind): SectionKind[] {
  switch (kind) {
    case 'verso':
      return ['verso', 'precoro', 'coro', 'refrao', 'ponte']
    case 'precoro':
      return ['coro', 'refrao', 'ponte', 'verso']
    case 'coro':
      return ['coro', 'refrao', 'verso', 'ponte', 'precoro']
    case 'refrao':
      return ['refrao', 'coro', 'verso', 'ponte', 'precoro']
    case 'ponte':
      return ['coro', 'refrao', 'verso', 'precoro']
    default:
      return ['verso', 'refrao', 'coro', 'precoro', 'ponte', 'outro']
  }
}

/**
 * Índices de slide permitidos a partir do AO VIVO, dado o grafo de seções.
 * Sempre inclui vizinhos próximos; libera refrão/coro mesmo longe.
 */
export function allowedSlideIndices(opts: {
  sections: LyricSection[]
  liveIndex: number
  previewIndex?: number
}): Set<number> {
  const lines = flattenSections(opts.sections)
  const n = lines.length
  const allowed = new Set<number>()
  if (!n) return allowed

  const live = Math.max(0, Math.min(opts.liveIndex, n - 1))
  const spans = sectionSpans(opts.sections)
  const cur = sectionAtSlide(opts.sections, live)
  const nextKinds = new Set(
    cur ? allowedNextKinds(cur.kind) : (Object.keys(SECTION_KIND_LABEL) as SectionKind[]),
  )

  // Sempre: próxima linear + preview
  if (live + 1 < n) allowed.add(live + 1)
  if (opts.previewIndex != null && opts.previewIndex >= 0 && opts.previewIndex < n) {
    allowed.add(opts.previewIndex)
  }
  for (let d = 1; d <= 2; d++) {
    if (live + d < n) allowed.add(live + d)
    if (live - d >= 0) allowed.add(live - d)
  }

  for (const span of spans) {
    const kind = span.section.kind
    const isRepeatable = kind === 'refrao' || kind === 'coro'
    const kindOk = nextKinds.has(kind) || isRepeatable
    if (!kindOk) continue
    for (let i = span.start; i < span.end; i++) {
      if (i === live) continue
      // Dentro da seção atual: só à frente (fluxo)
      if (cur && span.section.id === cur.id) {
        if (i > live) allowed.add(i)
        continue
      }
      allowed.add(i)
    }
  }

  return allowed
}

function blockKey(lines: string[]): string {
  return lines.map((l) => normalizeLyricText(l)).filter(Boolean).join(' | ')
}

/**
 * Infere seções por repetição: bloco que reaparece → Refrão;
 * trechos únicos em sequência → Verso A/B/…
 */
export function inferSectionsFromLines(lines: string[]): LyricSection[] {
  const slides = (lines || []).map((l) => String(l || '').trim()).filter(Boolean)
  if (!slides.length) return []

  // Procura o maior bloco (1–6 linhas) que se repete
  let best: { start: number; len: number; count: number } | null = null
  for (let len = Math.min(6, Math.floor(slides.length / 2)); len >= 1; len--) {
    const counts = new Map<string, number[]>()
    for (let i = 0; i + len <= slides.length; i++) {
      const key = blockKey(slides.slice(i, i + len))
      if (!key) continue
      const arr = counts.get(key) || []
      // Evita overlapping imediato no mesmo run
      if (arr.length && i < arr[arr.length - 1] + len) continue
      arr.push(i)
      counts.set(key, arr)
    }
    for (const [, starts] of counts) {
      if (starts.length < 2) continue
      const score = starts.length * len
      const bestScore = best ? best.count * best.len : 0
      if (score > bestScore) {
        best = { start: starts[0], len, count: starts.length }
      }
    }
    if (best && best.len >= 2) break
  }

  const refrainStarts = new Set<number>()
  let refrainLen = 0
  let refrainKey = ''
  if (best) {
    refrainLen = best.len
    refrainKey = blockKey(slides.slice(best.start, best.start + best.len))
    for (let i = 0; i + refrainLen <= slides.length; i++) {
      if (blockKey(slides.slice(i, i + refrainLen)) === refrainKey) {
        refrainStarts.add(i)
      }
    }
  }

  const used = new Array(slides.length).fill(false)
  const sections: LyricSection[] = []
  let verseVariant = 0

  let i = 0
  while (i < slides.length) {
    if (refrainStarts.has(i) && refrainLen > 0) {
      sections.push({
        id: newSectionId(),
        kind: 'refrao',
        variant: 0,
        lines: slides.slice(i, i + refrainLen),
      })
      for (let k = 0; k < refrainLen; k++) used[i + k] = true
      i += refrainLen
      continue
    }
    // Acumula verso até próximo refrão
    const start = i
    i += 1
    while (i < slides.length && !refrainStarts.has(i)) i += 1
    sections.push({
      id: newSectionId(),
      kind: 'verso',
      variant: verseVariant++,
      lines: slides.slice(start, i),
    })
  }

  return sections.filter((s) => s.lines.length > 0)
}

/** Normaliza seções salvas ou infere se vazio. */
export function resolveSections(
  lines: string[],
  sections?: LyricSection[] | null,
): LyricSection[] {
  if (sections && sections.length) {
    const cleaned = sections
      .map((s) => ({
        id: s.id || newSectionId(),
        kind: (s.kind in SECTION_KIND_LABEL ? s.kind : 'verso') as SectionKind,
        variant: Math.max(0, Number(s.variant) || 0),
        lines: (s.lines || []).map((l) => String(l || '').trim()).filter(Boolean),
      }))
      .filter((s) => s.lines.length)
    if (cleaned.length) return cleaned
  }
  return inferSectionsFromLines(lines)
}

export function nextVariantForKind(
  sections: LyricSection[],
  kind: SectionKind,
): number {
  let max = -1
  for (const s of sections) {
    if (s.kind === kind) max = Math.max(max, s.variant)
  }
  return max + 1
}

/** Move linhas (índices no flatten raw) para seção existente ou nova por kind. */
export function moveLinesToSection(
  sections: LyricSection[],
  globalIndices: number[],
  target: { sectionId?: string; kind?: SectionKind; newVariant?: boolean },
): LyricSection[] {
  const flat = flattenSectionsRaw(sections)
  const idxs = [...new Set(globalIndices)]
    .filter((i) => i >= 0 && i < flat.length)
    .sort((a, b) => a - b)
  if (!idxs.length) return sections

  const moving = idxs.map((i) => flat[i])
  const moveSet = new Set(idxs)
  const spans = sectionSpansRaw(sections)

  let next: LyricSection[] = sections.map((s) => {
    const span = spans.find((x) => x.section.id === s.id)
    if (!span) return { ...s, lines: [...s.lines] }
    const kept: string[] = []
    for (let i = span.start; i < span.end; i++) {
      if (!moveSet.has(i)) kept.push(flat[i])
    }
    return { ...s, id: s.id, kind: s.kind, variant: s.variant, lines: kept }
  })

  if (target.sectionId) {
    const has = next.some((s) => s.id === target.sectionId)
    next = next.map((s) =>
      s.id === target.sectionId ? { ...s, lines: [...s.lines, ...moving] } : s,
    )
    if (!has) {
      next.push({
        id: target.sectionId,
        kind: target.kind || 'outro',
        variant: 0,
        lines: moving,
      })
    }
  } else if (target.kind) {
    if (target.newVariant) {
      next.push({
        id: newSectionId(),
        kind: target.kind,
        variant: nextVariantForKind(next, target.kind),
        lines: moving,
      })
    } else {
      const existing = next.find(
        (s) => s.kind === target.kind && s.variant === 0,
      )
      if (existing) {
        next = next.map((s) =>
          s.id === existing.id ? { ...s, lines: [...s.lines, ...moving] } : s,
        )
      } else {
        next.push({
          id: newSectionId(),
          kind: target.kind,
          variant: 0,
          lines: moving,
        })
      }
    }
  }

  return ensureEditableSections(next.filter((s) => s.lines.length > 0))
}

/** Garante ao menos uma linha digitável (Verso vazio).
 * Seções só com linha(s) em branco somem. */
export function ensureEditableSections(
  sections: LyricSection[],
): LyricSection[] {
  const cleaned = (sections || []).filter((s) =>
    (s.lines || []).some((l) => String(l || '').trim().length > 0),
  )
  if (cleaned.length) return cleaned
  return [
    {
      id: newSectionId(),
      kind: 'verso',
      variant: 0,
      lines: [''],
    },
  ]
}

export function updateLineAt(
  sections: LyricSection[],
  globalIndex: number,
  text: string,
): LyricSection[] {
  const spans = sectionSpansRaw(sections)
  return sections.map((s) => {
    const span = spans.find((x) => x.section.id === s.id)
    if (!span) return s
    if (globalIndex < span.start || globalIndex >= span.end) return s
    const local = globalIndex - span.start
    const lines = [...s.lines]
    lines[local] = text
    return { ...s, lines }
  })
}

/** Enter: parte a linha no cursor; foco vai para a nova. */
export function splitLineAt(
  sections: LyricSection[],
  globalIndex: number,
  cursor: number,
): { sections: LyricSection[]; focusIndex: number } {
  const spans = sectionSpansRaw(sections)
  const next = sections.map((s) => {
    const span = spans.find((x) => x.section.id === s.id)
    if (!span) return s
    if (globalIndex < span.start || globalIndex >= span.end) return s
    const local = globalIndex - span.start
    const cur = s.lines[local] ?? ''
    const c = Math.max(0, Math.min(cursor, cur.length))
    const left = cur.slice(0, c)
    const right = cur.slice(c)
    const lines = [
      ...s.lines.slice(0, local),
      left,
      right,
      ...s.lines.slice(local + 1),
    ]
    return { ...s, lines }
  })
  return { sections: next, focusIndex: globalIndex + 1 }
}

/**
 * Backspace no início: junta com a linha de cima (mesmo se outra seção —
 * a de cima absorve e a seção vazia some).
 */
export function joinLineWithPrev(
  sections: LyricSection[],
  globalIndex: number,
): { sections: LyricSection[]; focusIndex: number; cursor: number } | null {
  if (globalIndex <= 0) return null
  const flat = flattenSectionsRaw(sections)
  if (globalIndex >= flat.length) return null
  const prev = flat[globalIndex - 1] ?? ''
  const cur = flat[globalIndex] ?? ''
  const joined = prev + cur
  const cursor = prev.length

  const removeSet = new Set([globalIndex - 1, globalIndex])
  const spans = sectionSpansRaw(sections)
  let next = sections.map((s) => {
    const span = spans.find((x) => x.section.id === s.id)
    if (!span) return s
    const lines: string[] = []
    for (let i = span.start; i < span.end; i++) {
      if (i === globalIndex - 1) lines.push(joined)
      else if (!removeSet.has(i)) lines.push(flat[i])
    }
    return { ...s, lines }
  })
  next = next.filter((s) => s.lines.length > 0)
  return {
    sections: ensureEditableSections(next),
    focusIndex: globalIndex - 1,
    cursor,
  }
}

/** Remove linhas por índices globais (seleção + Delete). */
export function removeLinesAt(
  sections: LyricSection[],
  globalIndices: number[],
): { sections: LyricSection[]; focusIndex: number } {
  const flat = flattenSectionsRaw(sections)
  const removeSet = new Set(
    [...new Set(globalIndices)].filter((i) => i >= 0 && i < flat.length),
  )
  if (!removeSet.size) {
    return { sections, focusIndex: Math.max(0, Math.min(...globalIndices, flat.length - 1)) }
  }
  const firstRemoved = Math.min(...removeSet)
  const spans = sectionSpansRaw(sections)
  let next = sections.map((s) => {
    const span = spans.find((x) => x.section.id === s.id)
    if (!span) return s
    const lines: string[] = []
    for (let i = span.start; i < span.end; i++) {
      if (!removeSet.has(i)) lines.push(flat[i])
    }
    return { ...s, lines }
  })
  next = next.filter((s) => s.lines.length > 0)
  const ensured = ensureEditableSections(next)
  const newFlat = flattenSectionsRaw(ensured)
  const focusIndex = Math.max(0, Math.min(firstRemoved, Math.max(0, newFlat.length - 1)))
  return { sections: ensured, focusIndex }
}

/** Substitui a linha e insere o restante (colar multilinha). */
export function replaceLineWithPaste(
  sections: LyricSection[],
  globalIndex: number,
  pasted: string,
): { sections: LyricSection[]; focusIndex: number } {
  const parts = String(pasted || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
  if (!parts.length) {
    return { sections: updateLineAt(sections, globalIndex, ''), focusIndex: globalIndex }
  }
  const spans = sectionSpansRaw(sections)
  let focusIndex = globalIndex
  const next = sections.map((s) => {
    const span = spans.find((x) => x.section.id === s.id)
    if (!span) return s
    if (globalIndex < span.start || globalIndex >= span.end) return s
    const local = globalIndex - span.start
    const lines = [
      ...s.lines.slice(0, local),
      ...parts,
      ...s.lines.slice(local + 1),
    ]
    focusIndex = span.start + local + parts.length - 1
    return { ...s, lines }
  })
  return { sections: next, focusIndex }
}
