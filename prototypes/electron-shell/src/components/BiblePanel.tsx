import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toastInfo } from '../toast'
import './bible-panel.css'

type Version = { id: string; label: string }
type Book = { index: number; abbrev: string; name: string; chapters: number }
type Verse = { n: number; text: string }

/** Minúsculo e sem acentos, pra busca tolerante. */
function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Números de 1..max cujo texto começa com o digitado (lista vazia = todos). */
function numberMatches(query: string, max: number): number[] {
  const q = query.trim()
  const all = Array.from({ length: max }, (_, i) => i + 1)
  if (!q) return all
  return all.filter((n) => String(n).startsWith(q))
}

/** Prende o Tab dentro do overlay (não deixa vazar pro resto da tela). */
function trapTabWithin(e: React.KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== 'Tab' || !container) return
  const focusables = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  if (!focusables.length) return
  e.preventDefault()
  const list = Array.from(focusables)
  const idx = list.indexOf(document.activeElement as HTMLElement)
  const next = e.shiftKey
    ? idx <= 0
      ? list.length - 1
      : idx - 1
    : idx === -1 || idx === list.length - 1
      ? 0
      : idx + 1
  list[next]?.focus()
}

export type BibleItem = {
  id: string
  kind: 'bible'
  label: string
  title?: string
  lines: string[]
  source?: string
}

type Props = {
  onGoLive: (item: BibleItem) => void
  onPreview?: (item: BibleItem) => void
  onAddToPlan?: (item: BibleItem) => void
  onVersionsLoaded?: (count: number) => void
}

/** Navegação por teclado dirigida pelo operador (setas + Enter). */
export type BiblePanelHandle = {
  /** Desliza a janela De–Até pelo capítulo; ao chegar na borda, tenta próximo/anterior capítulo. Retorna true se conseguiu. */
  step: (delta: number) => boolean
  /** Projeta a janela atual e desliza para a próxima. */
  liveAndAdvance: () => void
  /** Navega capítulo anterior/próximo (delta=±1). */
  stepChapter: (delta: number) => void
  /** Foca o verso inicial da seleção atual (entrada via Tab). */
  focusCurrent: () => void
  /** Abre o overlay de busca rápida de livro, já com o 1º caractere digitado. */
  startJump: (char: string) => void
}

export const BiblePanel = forwardRef<BiblePanelHandle, Props>(function BiblePanel(
  { onGoLive, onPreview, onAddToPlan, onVersionsLoaded }: Props,
  ref,
) {
  const [versions, setVersions] = useState<Version[]>([])
  const [versionId, setVersionId] = useState('nvi')
  const [books, setBooks] = useState<Book[]>([])
  const [bookIndex, setBookIndex] = useState(18) // Salmos
  const [chapterIndex, setChapterIndex] = useState(22) // 23
  const [verses, setVerses] = useState<Verse[]>([])
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(2)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const pendingVerseRef = useRef<number | null>(null)

  // Overlay de busca rápida (digitar → livro → capítulo → verso)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpStage, setJumpStage] = useState<'book' | 'chapter' | 'verse'>('book')
  const [jumpBookQuery, setJumpBookQuery] = useState('')
  const [jumpBookIdx, setJumpBookIdx] = useState<number | null>(null)
  const [jumpChapterQuery, setJumpChapterQuery] = useState('')
  const [jumpChapterNum, setJumpChapterNum] = useState<number | null>(null)
  const [jumpVerseQuery, setJumpVerseQuery] = useState('')
  /** null = ainda buscando o total de versos do capítulo escolhido */
  const [jumpVerseMax, setJumpVerseMax] = useState<number | null>(null)
  const jumpOverlayRef = useRef<HTMLDivElement | null>(null)
  const jumpBookInputRef = useRef<HTMLInputElement | null>(null)
  const jumpChapterInputRef = useRef<HTMLInputElement | null>(null)
  const jumpVerseInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void window.projection?.bibleVersions?.().then((v) => {
      const list = Array.isArray(v) ? v : []
      setVersions(list)
      onVersionsLoaded?.(list.length)
      if (list[0] && !list.find((x) => x.id === versionId)) {
        setVersionId(list[0].id)
      }
    })
  }, [onVersionsLoaded])

  useEffect(() => {
    if (!versionId) return
    void window.projection?.bibleBooks?.(versionId).then((b) => {
      setBooks(b || [])
    })
  }, [versionId])

  useEffect(() => {
    if (!versionId || bookIndex < 0) return
    setError(null)
    void window.projection
      ?.bibleChapter?.({ versionId, bookIndex, chapterIndex })
      .then((ch) => {
        setVerses(ch.verses || [])
        const total = ch.verses?.length || 1
        if (pendingVerseRef.current != null) {
          const v = Math.min(Math.max(1, pendingVerseRef.current), total)
          pendingVerseRef.current = null
          setFrom(v)
          setTo(v)
          focusVerse(v)
        } else {
          setFrom(1)
          setTo(Math.min(2, total))
        }
      })
      .catch((err) => {
        const msg = String(err)
        setError(msg)
        toastInfo(msg)
      })
  }, [versionId, bookIndex, chapterIndex])

  const book = books[bookIndex]
  const chapterCount = book?.chapters || 1

  async function buildItem(rangeFrom = from, rangeTo = to): Promise<BibleItem | null> {
    const range = await window.projection?.bibleRange?.({
      versionId,
      bookIndex,
      chapterIndex,
      from: rangeFrom,
      to: rangeTo,
    })
    if (!range) return null
    const label = `${range.ref} (${versionId.toUpperCase()})`
    return {
      id: `bible-${versionId}-${bookIndex}-${chapterIndex}-${rangeFrom}-${rangeTo}-${Date.now()}`,
      kind: 'bible',
      label,
      title: range.ref,
      lines: range.slides || range.lines || [],
      source: 'bible',
    }
  }

  async function previewSelection(rangeFrom = from, rangeTo = to) {
    if (!onPreview) return
    const item = await buildItem(rangeFrom, rangeTo)
    if (item) onPreview(item)
  }

  async function goLive(rangeFrom = from, rangeTo = to) {
    const item = await buildItem(rangeFrom, rangeTo)
    if (!item) return
    onPreview?.(item)
    onGoLive(item)
  }

  useEffect(() => {
    void previewSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, bookIndex, chapterIndex, from, to, verses.length])

  // Tab/clique pode chegar antes dos versos carregarem (1ª troca de aba) —
  // sem isso o foco antigo (ex.: item do plano) fica "preso" e a seta some.
  const pendingFocusRef = useRef(false)
  useEffect(() => {
    if (pendingFocusRef.current && verses.length) {
      pendingFocusRef.current = false
      focusVerse(from)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verses])

  const focusVerse = useCallback((n: number) => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(
        `[data-verse-n="${n}"]`,
      )
      if (!el) return
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'nearest' })
    })
  }, [])

  /**
   * Janela deslizante: mantém o tamanho do bloco De–Até e o move pelo
   * capítulo. Retorna null quando já está na borda.
   */
  const slideWindow = useCallback(
    (delta: number) => {
      const total = verses.length
      if (!total || !delta) return null
      const size = Math.max(1, to - from + 1)
      const nextFrom = from + delta * size
      if (nextFrom < 1 || nextFrom > total) return null
      const nextTo = Math.min(nextFrom + size - 1, total)
      return { from: nextFrom, to: nextTo }
    },
    [from, to, verses.length],
  )

  /** Livros que batem com o texto digitado — começa-com pontua melhor que contém. */
  const jumpMatches = useMemo(() => {
    const q = normalizeSearch(jumpBookQuery.trim()).replace(/\s+/g, '')
    if (!q) return []
    return books
      .map((b) => {
        const name = normalizeSearch(b.name).replace(/\s+/g, '')
        const abbrev = normalizeSearch(b.abbrev).replace(/\s+/g, '')
        let score = -1
        if (name.startsWith(q) || abbrev.startsWith(q)) score = 0
        else if (name.includes(q)) score = 1
        return { book: b, score }
      })
      .filter((x) => x.score >= 0)
      .sort((a, b2) => a.score - b2.score || a.book.name.length - b2.book.name.length)
      .map((x) => x.book)
  }, [books, jumpBookQuery])

  const jumpChapterMatches = useMemo(() => {
    const b = jumpBookIdx != null ? books[jumpBookIdx] : null
    if (!b) return []
    return numberMatches(jumpChapterQuery, b.chapters)
  }, [books, jumpBookIdx, jumpChapterQuery])

  const jumpVerseMatches = useMemo(() => {
    if (jumpVerseMax == null) return []
    return numberMatches(jumpVerseQuery, jumpVerseMax)
  }, [jumpVerseMax, jumpVerseQuery])

  function closeJump() {
    setJumpOpen(false)
  }

  /** Esc: 1 passo pra trás (livro←capítulo←verso). Só sai de vez no livro. */
  function jumpBack() {
    if (jumpStage === 'verse') {
      setJumpStage('chapter')
      requestAnimationFrame(() => jumpChapterInputRef.current?.focus())
      return
    }
    if (jumpStage === 'chapter') {
      setJumpStage('book')
      requestAnimationFrame(() => jumpBookInputRef.current?.focus())
      return
    }
    closeJump()
  }

  function pickJumpBook(b: Book) {
    setJumpBookIdx(b.index)
    setJumpChapterQuery('')
    setJumpStage('chapter')
    requestAnimationFrame(() => jumpChapterInputRef.current?.focus())
  }

  /** Confirma o capítulo (melhor match ou o número digitado) e já busca o total de versos dele. */
  async function pickJumpChapter() {
    const b = jumpBookIdx != null ? books[jumpBookIdx] : null
    if (!b) return
    const n =
      jumpChapterMatches[0] ??
      Math.min(Math.max(1, parseInt(jumpChapterQuery, 10) || 1), b.chapters)
    setJumpChapterNum(n)
    setJumpVerseQuery('')
    setJumpVerseMax(null)
    setJumpStage('verse')
    requestAnimationFrame(() => jumpVerseInputRef.current?.focus())
    try {
      const ch = await window.projection?.bibleChapter?.({
        versionId,
        bookIndex: b.index,
        chapterIndex: n - 1,
      })
      setJumpVerseMax(Math.max(1, ch?.verses?.length || 1))
    } catch {
      setJumpVerseMax(1)
    }
  }

  function commitJump() {
    const b = jumpBookIdx != null ? books[jumpBookIdx] : null
    if (!b || jumpChapterNum == null) return
    const verseNum =
      jumpVerseMatches[0] ?? Math.max(1, parseInt(jumpVerseQuery, 10) || 1)
    const chapterIdx = Math.max(0, jumpChapterNum - 1)
    const changed = b.index !== bookIndex || chapterIdx !== chapterIndex
    if (changed) {
      pendingVerseRef.current = verseNum
      setBookIndex(b.index)
      setChapterIndex(chapterIdx)
    } else {
      const total = verses.length || 1
      const v = Math.min(verseNum, total)
      setFrom(v)
      setTo(v)
      focusVerse(v)
    }
    closeJump()
  }

  useImperativeHandle(
    ref,
    () => ({
      step(delta: number) {
        const next = slideWindow(delta)
        if (next) {
          setFrom(next.from)
          setTo(next.to)
          focusVerse(next.from)
          return true
        }
        // Borda do capítulo: tenta próximo/anterior
        const book = books[bookIndex]
        if (!book) return false
        const nextChapter = chapterIndex + delta
        if (nextChapter < 0 || nextChapter >= book.chapters) return false
        setChapterIndex(nextChapter)
        setFrom(1)
        setTo(2)
        focusVerse(1)
        return true
      },
      liveAndAdvance() {
        void goLive(from, to)
        const next = slideWindow(1)
        if (!next) return
        setFrom(next.from)
        setTo(next.to)
        focusVerse(next.from)
      },
      stepChapter(delta: number) {
        const book = books[bookIndex]
        if (!book) return
        const nextChapter = chapterIndex + delta
        // Dentro do livro: só muda capítulo
        if (nextChapter >= 0 && nextChapter < book.chapters) {
          setChapterIndex(nextChapter)
          setFrom(1)
          setTo(2)
          return
        }
        // Borda: muda de livro
        const nextBook = bookIndex + delta
        if (nextBook < 0 || nextBook >= books.length) return
        setBookIndex(nextBook)
        // Posiciona no primeiro (se avançar) ou último capítulo (se voltar)
        const targetBook = books[nextBook]
        if (!targetBook) return
        const ch = delta > 0 ? 0 : Math.max(0, targetBook.chapters - 1)
        setChapterIndex(ch)
        setFrom(1)
        setTo(2)
      },
      focusCurrent() {
        if (!verses.length) {
          pendingFocusRef.current = true
          return
        }
        focusVerse(from)
      },
      startJump(char: string) {
        setJumpBookQuery(char)
        setJumpBookIdx(null)
        setJumpChapterQuery('')
        setJumpChapterNum(null)
        setJumpVerseQuery('')
        setJumpVerseMax(null)
        setJumpStage('book')
        setJumpOpen(true)
        requestAnimationFrame(() => {
          const input = jumpBookInputRef.current
          if (!input) return
          input.focus()
          input.setSelectionRange(input.value.length, input.value.length)
        })
      },
    }),
    // goLive depende da referência atual (versão/livro/capítulo/faixa)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, slideWindow, focusVerse, versionId, bookIndex, chapterIndex, books],
  )

  return (
    <div className="bible-panel">
      <div className="bible-row">
        <label>
          Versão
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="bible-row">
        <label>
          Livro
          <select
            value={bookIndex}
            onChange={(e) => {
              setBookIndex(Number(e.target.value))
              setChapterIndex(0)
            }}
          >
            {books.map((b) => (
              <option key={b.index} value={b.index}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cap.
          <select
            value={chapterIndex}
            onChange={(e) => setChapterIndex(Number(e.target.value))}
          >
            {Array.from({ length: chapterCount }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="bible-row">
        <label>
          De
          <input
            type="number"
            min={1}
            max={verses.length || 1}
            value={from}
            onChange={(e) => setFrom(Number(e.target.value))}
          />
        </label>
        <label>
          Até
          <input
            type="number"
            min={from}
            max={verses.length || 1}
            value={to}
            onChange={(e) => setTo(Number(e.target.value))}
          />
        </label>
        {onAddToPlan ? (
          <button
            type="button"
            className="ghost"
            title="Opcional"
            onClick={async () => {
              const item = await buildItem()
              if (item) onAddToPlan(item)
            }}
          >
            + plano
          </button>
        ) : null}
      </div>
      {error && <p className="hint">{error}</p>}
      <ul className="bible-verses" ref={listRef}>
        {verses.map((v) => (
          <li key={v.n}>
            <button
              type="button"
              data-phrase-nav="1"
              data-verse-n={v.n}
              className={v.n >= from && v.n <= to ? 'on' : ''}
              onClick={() => {
                if (v.n < from) setFrom(v.n)
                else if (v.n > to) setTo(v.n)
                else {
                  setFrom(v.n)
                  setTo(v.n)
                }
              }}
              onDoubleClick={() => {
                setFrom(v.n)
                setTo(v.n)
                void goLive(v.n, v.n)
              }}
              title="1 clique: seleção · 2 cliques: apresentação · Enter: ao vivo e avança"
            >
              <strong>{v.n}</strong> {v.text}
            </button>
          </li>
        ))}
      </ul>
      {jumpOpen && (
        <div
          className="bible-jump-overlay"
          role="presentation"
          onClick={closeJump}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              jumpBack()
              return
            }
            trapTabWithin(e, jumpOverlayRef.current)
          }}
        >
          <div
            className="bible-jump-box"
            ref={jumpOverlayRef}
            onClick={(e) => e.stopPropagation()}
          >
            {jumpStage === 'book' && (
              <>
                <label>
                  Livro
                  <input
                    ref={jumpBookInputRef}
                    value={jumpBookQuery}
                    onChange={(e) => setJumpBookQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (jumpMatches[0]) pickJumpBook(jumpMatches[0])
                      }
                    }}
                    placeholder="Digite o livro…"
                  />
                </label>
                <ul className="bible-jump-matches">
                  {jumpMatches.slice(0, 6).map((b, i) => (
                    <li key={b.index} className={i === 0 ? 'top' : ''}>
                      {b.name}
                    </li>
                  ))}
                  {jumpBookQuery.trim() && !jumpMatches.length ? (
                    <li className="empty">Nenhum livro encontrado</li>
                  ) : null}
                </ul>
              </>
            )}
            {jumpStage === 'chapter' && jumpBookIdx != null && books[jumpBookIdx] && (
              <>
                <label>
                  {books[jumpBookIdx].name} — capítulo (1–{books[jumpBookIdx].chapters})
                  <input
                    ref={jumpChapterInputRef}
                    value={jumpChapterQuery}
                    onChange={(e) => setJumpChapterQuery(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void pickJumpChapter()
                      }
                    }}
                    placeholder="Digite o capítulo…"
                  />
                </label>
                <ul className="bible-jump-matches">
                  {jumpChapterMatches.slice(0, 8).map((n, i) => (
                    <li key={n} className={i === 0 ? 'top' : ''}>
                      {n}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {jumpStage === 'verse' && jumpBookIdx != null && books[jumpBookIdx] && jumpChapterNum != null && (
              <>
                <label>
                  {books[jumpBookIdx].name} {jumpChapterNum} — verso
                  {jumpVerseMax != null ? ` (1–${jumpVerseMax})` : ''}
                  <input
                    ref={jumpVerseInputRef}
                    value={jumpVerseQuery}
                    onChange={(e) => setJumpVerseQuery(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitJump()
                      }
                    }}
                    placeholder="Digite o verso…"
                  />
                </label>
                <ul className="bible-jump-matches">
                  {jumpVerseMax == null ? (
                    <li className="empty">Carregando…</li>
                  ) : (
                    jumpVerseMatches.slice(0, 8).map((n, i) => (
                      <li key={n} className={i === 0 ? 'top' : ''}>
                        {n}
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
            <p className="bible-jump-hint">
              {jumpStage === 'book'
                ? 'Enter avança · Esc cancela'
                : 'Enter avança · Esc volta'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
})
