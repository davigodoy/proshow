import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectionTheme } from '../theme/types'
import { toastAlert } from '../toast'
import { ConfirmModal } from './ConfirmModal'
import {
  SECTION_KIND_LABEL,
  SECTION_KIND_ORDER,
  ensureEditableSections,
  flattenSections,
  flattenSectionsRaw,
  joinLineWithPrev,
  moveLinesToSection,
  removeLinesAt,
  replaceLineWithPaste,
  resolveSections,
  sectionDisplayName,
  splitLineAt,
  updateLineAt,
  type LyricSection,
  type SectionKind,
} from '../lyrics/songSections'
import './song-editor.css'

export type LibrarySongHint = {
  id: string
  title?: string
  artist?: string | null
  label?: string
  lines: string[]
  sections?: LyricSection[] | null
}

type Props = {
  initial?: {
    id?: string
    title?: string
    artist?: string | null
    lines?: string[]
    sections?: LyricSection[] | null
    themeId?: string | null
  } | null
  themes?: ProjectionTheme[]
  knownArtists?: string[]
  librarySongs?: LibrarySongHint[]
  onSave: (song: {
    id: string
    title: string
    artist: string | null
    label: string
    lines: string[]
    sections: LyricSection[]
    kind: 'lyrics'
    themeId?: string | null
  }) => void
  onCancel: () => void
}

/** Converte slides → texto (colar / legado). */
export function linesToBody(lines: string[] | undefined): string {
  return (lines || [])
    .map((slide) =>
      String(slide)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' · '),
    )
    .join('\n')
}

export function bodyToLines(body: string): string[] {
  return String(body || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

type DragPayload = { indices: number[] }

type OnlineSlot = {
  key: string
  title: string
  artist: string
}

function normalizeQuery(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function sectionsFingerprint(sections: LyricSection[]): string {
  return sections
    .map((s) =>
      [
        s.kind,
        s.variant,
        ...s.lines.map((l) => l.trim()).filter(Boolean),
      ].join('\u0001'),
    )
    .filter(Boolean)
    .join('\u0002')
}

function editorSnapshot(opts: {
  title: string
  artist: string
  themeId: string
  sections: LyricSection[]
}): string {
  return [
    opts.title.trim(),
    opts.artist.trim(),
    opts.themeId || '',
    sectionsFingerprint(opts.sections),
  ].join('\u0003')
}

export function SongEditor({
  initial = null,
  themes = [],
  knownArtists = [],
  librarySongs = [],
  onSave,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(initial?.title || '')
  const [artist, setArtist] = useState(initial?.artist || '')
  const [sections, setSections] = useState<LyricSection[]>(() =>
    ensureEditableSections(
      resolveSections(initial?.lines || [], initial?.sections),
    ),
  )
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [themeId, setThemeId] = useState(initial?.themeId || '')
  const [dropKind, setDropKind] = useState<SectionKind | null>(null)
  const [dropSectionId, setDropSectionId] = useState<string | null>(null)
  const [onlineSlots, setOnlineSlots] = useState<OnlineSlot[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [loadingSlotKey, setLoadingSlotKey] = useState<string | null>(null)
  const [slotsOpen, setSlotsOpen] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)

  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map())
  const pendingFocus = useRef<{ index: number; cursor?: number } | null>(null)
  const baselineRef = useRef('')
  const suggestSeq = useRef(0)
  const skipSuggestUntil = useRef('')
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  const historyRef = useRef<{ past: LyricSection[][]; future: LyricSection[][] }>({
    past: [],
    future: [],
  })
  const typingBaseRef = useRef<LyricSection[] | null>(null)
  const typingTimerRef = useRef<number | null>(null)

  function cloneSections(secs: LyricSection[]): LyricSection[] {
    return secs.map((s) => ({
      ...s,
      lines: [...s.lines],
    }))
  }

  function resetHistory() {
    historyRef.current = { past: [], future: [] }
    typingBaseRef.current = null
    if (typingTimerRef.current != null) {
      window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
    setHistoryTick((n) => n + 1)
  }

  function flushTypingHistory() {
    if (typingTimerRef.current != null) {
      window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
    if (typingBaseRef.current) {
      historyRef.current.past.push(typingBaseRef.current)
      if (historyRef.current.past.length > 80) historyRef.current.past.shift()
      historyRef.current.future = []
      typingBaseRef.current = null
      setHistoryTick((n) => n + 1)
    }
  }

  /** Aplica seções; por padrão grava no histórico (desfazer). */
  function applySections(
    next: LyricSection[] | ((prev: LyricSection[]) => LyricSection[]),
    opts?: { record?: boolean },
  ) {
    const record = opts?.record !== false
    if (record) {
      flushTypingHistory()
      historyRef.current.past.push(cloneSections(sectionsRef.current))
      if (historyRef.current.past.length > 80) historyRef.current.past.shift()
      historyRef.current.future = []
      setHistoryTick((n) => n + 1)
    }
    setSections(next)
  }

  function undoSections() {
    if (typingTimerRef.current != null) {
      window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
    if (typingBaseRef.current) {
      const base = typingBaseRef.current
      typingBaseRef.current = null
      historyRef.current.future = [cloneSections(sectionsRef.current)]
      setSections(base)
      setSelected(new Set())
      setHistoryTick((n) => n + 1)
      return
    }
    const prev = historyRef.current.past.pop()
    if (!prev) return
    historyRef.current.future.push(cloneSections(sectionsRef.current))
    setSections(prev)
    setSelected(new Set())
    setHistoryTick((n) => n + 1)
  }

  function redoSections() {
    if (typingTimerRef.current != null) {
      window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
    typingBaseRef.current = null
    const next = historyRef.current.future.pop()
    if (!next) return
    historyRef.current.past.push(cloneSections(sectionsRef.current))
    setSections(next)
    setSelected(new Set())
    setHistoryTick((n) => n + 1)
  }

  const canUndo = historyRef.current.past.length > 0 || Boolean(typingBaseRef.current)
  const canRedo = historyRef.current.future.length > 0
  void historyTick

  function captureBaseline(
    nextTitle: string,
    nextArtist: string,
    nextThemeId: string,
    nextSections: LyricSection[],
  ) {
    baselineRef.current = editorSnapshot({
      title: nextTitle,
      artist: nextArtist,
      themeId: nextThemeId,
      sections: nextSections,
    })
  }

  useEffect(() => {
    const nextTitle = initial?.title || ''
    const nextArtist = initial?.artist || ''
    const nextThemeId = initial?.themeId || ''
    const nextSections = ensureEditableSections(
      resolveSections(initial?.lines || [], initial?.sections),
    )
    setTitle(nextTitle)
    setArtist(nextArtist)
    setSections(nextSections)
    setThemeId(nextThemeId)
    setSelected(new Set())
    setOnlineSlots([])
    setSlotsOpen(false)
    skipSuggestUntil.current = ''
    resetHistory()
    captureBaseline(nextTitle, nextArtist, nextThemeId, nextSections)
  }, [initial?.id])

  useEffect(() => {
    if (baselineRef.current) return
    captureBaseline(title, artist, themeId, sections)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function isDirty(): boolean {
    return (
      editorSnapshot({ title, artist, themeId, sections }) !==
      baselineRef.current
    )
  }

  function requestClose() {
    if (isDirty()) {
      setDiscardConfirmOpen(true)
      return
    }
    onCancel()
  }

  function confirmDiscard() {
    setDiscardConfirmOpen(false)
    onCancel()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (discardConfirmOpen) return
      if (slotsOpen) {
        setSlotsOpen(false)
        return
      }
      e.preventDefault()
      requestClose()
    }
    function onHistoryKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoSections()
        return
      }
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redoSections()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onHistoryKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onHistoryKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, artist, themeId, sections, slotsOpen, discardConfirmOpen])

  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    pendingFocus.current = null
    const el = inputRefs.current.get(pending.index)
    if (!el) return
    el.focus()
    const c = pending.cursor == null ? el.value.length : pending.cursor
    el.setSelectionRange(c, c)
  })

  const flatLines = useMemo(() => flattenSectionsRaw(sections), [sections])
  const sectionRows = useMemo(() => {
    let i = 0
    return sections.map((sec) => {
      const start = i
      i += sec.lines.length
      return { sec, start }
    })
  }, [sections])
  const isEdit = Boolean(initial?.id)
  const themeOptions = useMemo(
    () => [...themes].sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    [themes],
  )
  const selectAnchorRef = useRef(0)
  const lineDragSelectRef = useRef<{ anchor: number } | null>(null)
  const caretColRef = useRef(0)

  const librarySlots = useMemo(() => {
    const q = normalizeQuery(title)
    if (q.length < 2) return []
    const selfId = initial?.id
    return librarySongs
      .filter((s) => {
        if (selfId && s.id === selfId) return false
        const t = normalizeQuery(s.title || s.label || '')
        const a = normalizeQuery(s.artist || '')
        return t.includes(q) || a.includes(q) || `${t} ${a}`.includes(q)
      })
      .slice(0, 6)
  }, [title, librarySongs, initial?.id])

  // Busca online enquanto digita o título
  useEffect(() => {
    const q = title.trim()
    if (q.length < 2) {
      setOnlineSlots([])
      setSuggesting(false)
      return
    }
    if (skipSuggestUntil.current === q) return

    const seq = ++suggestSeq.current
    const timer = window.setTimeout(() => {
      setSuggesting(true)
      void (async () => {
        try {
          const result = await window.projection?.lyricsSuggest?.({
            query: artist.trim() ? `${title.trim()} ${artist.trim()}` : q,
            limit: 6,
          })
          if (seq !== suggestSeq.current) return
          if (result?.ok) {
            setOnlineSlots(
              result.items.map((it) => ({
                key: `on:${it.title}|${it.artist}`,
                title: it.title,
                artist: it.artist,
              })),
            )
            setSlotsOpen(true)
          } else {
            setOnlineSlots([])
          }
        } catch {
          if (seq === suggestSeq.current) setOnlineSlots([])
        } finally {
          if (seq === suggestSeq.current) setSuggesting(false)
        }
      })()
    }, 380)

    return () => window.clearTimeout(timer)
  }, [title, artist])

  const showSlots =
    slotsOpen &&
    title.trim().length >= 2 &&
    (librarySlots.length > 0 || onlineSlots.length > 0 || suggesting)

  function focusLine(index: number, cursor?: number) {
    pendingFocus.current = { index, cursor }
  }

  function applySongContent(opts: {
    title: string
    artist: string | null
    lines: string[]
    sections?: LyricSection[] | null
  }) {
    const nextSections = ensureEditableSections(
      resolveSections(opts.lines, opts.sections),
    )
    setTitle(opts.title)
    setArtist(opts.artist || '')
    applySections(nextSections)
    setSelected(new Set())
    setOnlineSlots([])
    setSlotsOpen(false)
    skipSuggestUntil.current = opts.title.trim()
    focusLine(0, 0)
  }

  function pickLibrary(song: LibrarySongHint) {
    applySongContent({
      title: song.title || song.label || title,
      artist: song.artist ?? null,
      lines: song.lines || [],
      sections: song.sections,
    })
  }

  async function pickOnline(slot: OnlineSlot) {
    setLoadingSlotKey(slot.key)
    try {
      const result = await window.projection?.lyricsSearch?.({
        title: slot.title,
        artist: slot.artist || null,
      })
      if (!result?.ok) {
        toastAlert('Não foi possível carregar a letra. Digite ou cole abaixo.')
        return
      }
      applySongContent({
        title: result.title || slot.title,
        artist: result.artist || slot.artist || null,
        lines: result.lines,
        sections: null,
      })
    } finally {
      setLoadingSlotKey(null)
    }
  }

  function setLineRange(from: number, to: number) {
    const a = Math.max(0, Math.min(from, to, flatLines.length - 1))
    const b = Math.min(flatLines.length - 1, Math.max(from, to, 0))
    const next = new Set<number>()
    for (let i = a; i <= b; i++) next.add(i)
    setSelected(next)
  }

  function onLinePointerDown(gi: number, e: React.PointerEvent) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.song-flow-handle')) return
    if (e.shiftKey) {
      setLineRange(selectAnchorRef.current, gi)
      return
    }
    selectAnchorRef.current = gi
    // Clique no texto limpa seleção multi — arraste de linhas usa a alça
    setSelected(new Set())
    lineDragSelectRef.current = { anchor: gi }
  }

  useEffect(() => {
    function onUp() {
      lineDragSelectRef.current = null
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [])

  function onLinePointerEnter(gi: number) {
    const drag = lineDragSelectRef.current
    if (!drag) return
    if (gi === drag.anchor) return
    setLineRange(drag.anchor, gi)
  }

  function assignToKind(kind: SectionKind, asNewVariant: boolean) {
    const idxs = [...selected]
    if (!idxs.length) {
      toastAlert('Selecione linhas (Shift+setas ou arraste entre linhas) e solte na tag.')
      return
    }
    applySections((secs) =>
      moveLinesToSection(secs, idxs, { kind, newVariant: asNewVariant }),
    )
    setSelected(new Set())
  }

  function beginLineDrag(e: React.DragEvent, index: number) {
    const indices =
      selected.has(index) && selected.size > 0
        ? [...selected].sort((a, b) => a - b)
        : [index]
    if (!selected.has(index) || selected.size === 0) {
      setSelected(new Set(indices))
    }
    e.dataTransfer.setData(
      'application/x-proshow-lines',
      JSON.stringify({ indices }),
    )
    e.dataTransfer.effectAllowed = 'move'
    try {
      const ghost = document.createElement('div')
      ghost.textContent =
        indices.length === 1
          ? flatLines[indices[0]]?.slice(0, 40) || '1 linha'
          : `${indices.length} linhas`
      ghost.style.cssText =
        'position:fixed;top:-80px;left:-80px;padding:6px 10px;background:#1a2330;color:#e8ecf2;border-radius:6px;font:12px sans-serif;pointer-events:none;z-index:99'
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 12, 12)
      window.setTimeout(() => ghost.remove(), 0)
    } catch {
      /* ignore */
    }
  }

  function readDrag(e: React.DragEvent): number[] {
    try {
      const raw = e.dataTransfer.getData('application/x-proshow-lines')
      const parsed = JSON.parse(raw) as DragPayload
      return parsed.indices || []
    } catch {
      return [...selected]
    }
  }

  function dropOnKind(e: React.DragEvent, kind: SectionKind) {
    e.preventDefault()
    setDropKind(null)
    const indices = readDrag(e)
    if (!indices.length) return
    const already = sections.some((s) => s.kind === kind)
    applySections((secs) =>
      moveLinesToSection(secs, indices, { kind, newVariant: already }),
    )
    setSelected(new Set())
  }

  function dropOnSection(e: React.DragEvent, sectionId: string) {
    e.preventDefault()
    setDropSectionId(null)
    const indices = readDrag(e)
    if (!indices.length) return
    applySections((secs) => moveLinesToSection(secs, indices, { sectionId }))
    setSelected(new Set())
  }

  function onLineChange(gi: number, value: string) {
    if (!typingBaseRef.current) {
      typingBaseRef.current = cloneSections(sectionsRef.current)
    }
    setSections((secs) => updateLineAt(secs, gi, value))
    if (typingTimerRef.current != null) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(() => {
      flushTypingHistory()
    }, 450)
  }

  /** Ao sair: linhas em branco somem; seção só vazia some junto. */
  function onLineBlur(gi: number) {
    const before = sectionsRef.current
    const flat = flattenSectionsRaw(before)
    if (flat.length <= 1) return
    let next = before.map((s) => ({
      ...s,
      lines: s.lines.filter((l) => String(l || '').trim().length > 0),
    }))
    next = ensureEditableSections(next)
    if (sectionsFingerprint(before) === sectionsFingerprint(next)) return
    applySections(() => next)
    const newLen = flattenSectionsRaw(next).length
    focusLine(Math.max(0, Math.min(gi, newLen - 1)))
  }

  function onLineKeyDown(gi: number, e: React.KeyboardEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const col = input.selectionStart ?? input.value.length
    caretColRef.current = col

    // Linhas selecionadas (Shift/arraste) + Delete → remove
    // Backspace só remove se houver mais de uma (1 linha: edita/junta)
    if (
      selected.size > 0 &&
      selected.has(gi) &&
      (e.key === 'Delete' || (e.key === 'Backspace' && selected.size > 1))
    ) {
      const selStart = input.selectionStart ?? 0
      const selEnd = input.selectionEnd ?? 0
      if (e.key === 'Delete' && selected.size === 1 && selStart !== selEnd) {
        // Apaga só o trecho de texto na linha
        return
      }
      e.preventDefault()
      const idxs = [...selected]
      applySections((secs) => {
        const r = removeLinesAt(secs, idxs)
        focusLine(r.focusIndex)
        return r.sections
      })
      setSelected(new Set())
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      applySections((secs) => {
        const r = splitLineAt(secs, gi, col)
        focusLine(r.focusIndex, 0)
        return r.sections
      })
      setSelected(new Set())
      return
    }
    if (
      e.key === 'Backspace' &&
      (input.selectionStart ?? 0) === 0 &&
      (input.selectionEnd ?? 0) === 0
    ) {
      e.preventDefault()
      applySections((secs) => {
        const r = joinLineWithPrev(secs, gi)
        if (!r) return secs
        focusLine(r.focusIndex, r.cursor)
        return r.sections
      })
      setSelected(new Set())
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (gi <= 0) return
      const next = gi - 1
      if (e.shiftKey) {
        setLineRange(selectAnchorRef.current, next)
      } else {
        selectAnchorRef.current = next
        setSelected(new Set())
      }
      focusLine(next, Math.min(caretColRef.current, (flatLines[next] || '').length))
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (gi >= flatLines.length - 1) return
      const next = gi + 1
      if (e.shiftKey) {
        setLineRange(selectAnchorRef.current, next)
      } else {
        selectAnchorRef.current = next
        setSelected(new Set())
      }
      focusLine(next, Math.min(caretColRef.current, (flatLines[next] || '').length))
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      requestAnimationFrame(() => {
        const el = inputRefs.current.get(gi)
        if (el) caretColRef.current = el.selectionStart ?? 0
      })
    }
  }

  function onLinePaste(gi: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\n') && !text.includes('\r')) return
    e.preventDefault()
    applySections((secs) => {
      const r = replaceLineWithPaste(secs, gi, text)
      focusLine(r.focusIndex)
      return r.sections
    })
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const t = title.trim() || 'Sem título'
    const a = artist.trim() || null
    const lines = flattenSections(sections)
    if (!lines.length) {
      toastAlert('Digite pelo menos uma linha da letra.')
      return
    }
    const cleaned = sections
      .map((s) => ({
        ...s,
        lines: s.lines.map((l) => l.trim()).filter(Boolean),
      }))
      .filter((s) => s.lines.length)
    onSave({
      id: initial?.id || `song-${Date.now().toString(36)}`,
      title: t,
      artist: a,
      label: a ? `${t} — ${a}` : t,
      lines,
      sections: cleaned,
      kind: 'lyrics',
      themeId: themeId || null,
    })
  }

  return (
    <div
      className="song-editor-backdrop"
      role="presentation"
      onClick={requestClose}
    >
      <form
        className="song-editor modal song-editor-wide"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="song-editor-head">
          <h2>{isEdit ? 'Editar música' : 'Nova música'}</h2>
          <button
            type="button"
            className="song-editor-close"
            aria-label="Fechar"
            title="Fechar"
            onClick={requestClose}
          >
            ×
          </button>
        </div>

        <div className="song-editor-title-wrap">
          <label>
            Título
            <input
              value={title}
              onChange={(e) => {
                skipSuggestUntil.current = ''
                setTitle(e.target.value)
                setSlotsOpen(true)
              }}
              onFocus={() => {
                if (title.trim().length >= 2) setSlotsOpen(true)
              }}
              placeholder="Nome da música"
              autoFocus
              autoComplete="off"
            />
          </label>
          {showSlots ? (
            <div className="song-suggest-slots" role="listbox">
              {librarySlots.map((song) => (
                <button
                  key={`lib:${song.id}`}
                  type="button"
                  className="song-suggest-slot local"
                  role="option"
                  onClick={() => pickLibrary(song)}
                >
                  <span className="song-suggest-title">
                    {song.title || song.label}
                  </span>
                  <span className="song-suggest-meta">
                    {[song.artist, 'biblioteca'].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
              {onlineSlots.map((slot) => (
                <button
                  key={slot.key}
                  type="button"
                  className="song-suggest-slot online"
                  role="option"
                  disabled={loadingSlotKey === slot.key}
                  onClick={() => void pickOnline(slot)}
                >
                  <span className="song-suggest-title">{slot.title}</span>
                  <span className="song-suggest-meta">
                    {[slot.artist || null, loadingSlotKey === slot.key ? 'carregando…' : 'online']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              ))}
              {suggesting && !onlineSlots.length ? (
                <div className="song-suggest-status">Buscando…</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <label>
          Artista / autor
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Opcional"
            list="song-editor-known-artists"
          />
          {knownArtists.length ? (
            <datalist id="song-editor-known-artists">
              {knownArtists.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          ) : null}
        </label>

        <div className="song-flow" role="textbox" aria-label="Letra">
          <div className="song-flow-tags" aria-label="Seções">
            <div className="song-flow-tags-chips">
              {SECTION_KIND_ORDER.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`song-section-chip kind-${kind}${dropKind === kind ? ' drop' : ''}`}
                  title={
                    sections.some((s) => s.kind === kind)
                      ? `Soltar cria ${SECTION_KIND_LABEL[kind]} B`
                      : `Soltar linhas → ${SECTION_KIND_LABEL[kind]}`
                  }
                  onClick={() =>
                    assignToKind(
                      kind,
                      sections.some((s) => s.kind === kind),
                    )
                  }
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropKind(kind)
                  }}
                  onDragLeave={() => setDropKind(null)}
                  onDrop={(e) => dropOnKind(e, kind)}
                >
                  {SECTION_KIND_LABEL[kind]}
                </button>
              ))}
            </div>
            <div className="song-flow-history" role="group" aria-label="Histórico">
              <button
                type="button"
                className="song-history-btn"
                title="Desfazer (⌘Z)"
                aria-label="Desfazer"
                disabled={!canUndo}
                onClick={undoSections}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 14 4 9l5-5"
                  />
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="song-history-btn"
                title="Refazer (⌘⇧Z)"
                aria-label="Refazer"
                disabled={!canRedo}
                onClick={redoSections}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m15 14 5-5-5-5"
                  />
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="song-flow-body">
            {sectionRows.map(({ sec, start }) => (
              <div
                key={sec.id}
                className={`song-flow-section kind-${sec.kind}${dropSectionId === sec.id ? ' drop' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropSectionId(sec.id)
                }}
                onDragLeave={() => setDropSectionId(null)}
                onDrop={(e) => dropOnSection(e, sec.id)}
              >
                <div
                  className="song-flow-rail"
                  title={sectionDisplayName(sec)}
                  onClick={() => {
                    const idxs = sec.lines.map((_, li) => start + li)
                    if (!idxs.length) return
                    selectAnchorRef.current = idxs[0]
                    setSelected(new Set(idxs))
                  }}
                >
                  <span>{sectionDisplayName(sec)}</span>
                </div>
                <div className="song-flow-lines">
                  {sec.lines.map((line, li) => {
                    const gi = start + li
                    const isSel = selected.has(gi)
                    return (
                      <div
                        key={`${sec.id}-${li}`}
                        className={`song-flow-row${isSel ? ' is-selected' : ''}`}
                        onPointerDown={(e) => onLinePointerDown(gi, e)}
                        onPointerEnter={() => onLinePointerEnter(gi)}
                      >
                        <span
                          className="song-flow-handle"
                          draggable
                          title="Arrastar para uma tag de seção"
                          aria-label={`Arrastar linha ${gi + 1}`}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            lineDragSelectRef.current = null
                            if (e.shiftKey) {
                              setLineRange(selectAnchorRef.current, gi)
                              return
                            }
                            if (!selected.has(gi)) {
                              selectAnchorRef.current = gi
                              setSelected(new Set([gi]))
                            }
                          }}
                          onDragStart={(e) => {
                            e.stopPropagation()
                            beginLineDrag(e, gi)
                          }}
                          onDragEnd={() => {
                            setDropKind(null)
                            setDropSectionId(null)
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="9" cy="5" r="1.25" fill="currentColor" />
                            <circle cx="15" cy="5" r="1.25" fill="currentColor" />
                            <circle cx="9" cy="12" r="1.25" fill="currentColor" />
                            <circle cx="15" cy="12" r="1.25" fill="currentColor" />
                            <circle cx="9" cy="19" r="1.25" fill="currentColor" />
                            <circle cx="15" cy="19" r="1.25" fill="currentColor" />
                          </svg>
                        </span>
                        <input
                          className="song-flow-input"
                          value={line}
                          placeholder={gi === 0 ? 'Digite a letra…' : undefined}
                          spellCheck
                          ref={(el) => {
                            if (el) inputRefs.current.set(gi, el)
                            else inputRefs.current.delete(gi)
                          }}
                          onChange={(e) => onLineChange(gi, e.target.value)}
                          onKeyDown={(e) => onLineKeyDown(gi, e)}
                          onPaste={(e) => onLinePaste(gi, e)}
                          onBlur={() => onLineBlur(gi)}
                          onFocus={() => {
                            if (!selected.has(gi)) selectAnchorRef.current = gi
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="song-editor-theme">
          Tema padrão
          <select
            value={themeId}
            onChange={(e) => setThemeId(e.target.value)}
          >
            <option value="">Tema global (aba Temas)</option>
            {themeOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={requestClose}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            {isEdit ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </form>
      {discardConfirmOpen ? (
        <ConfirmModal
          backdropClassName="song-editor-confirm"
          title="Fechar sem salvar"
          message="Há alterações não salvas. Fechar sem salvar?"
          confirmLabel="Fechar sem salvar"
          cancelLabel="Cancelar"
          danger
          onCancel={() => setDiscardConfirmOpen(false)}
          onConfirm={confirmDiscard}
        />
      ) : null}
    </div>
  )
}
