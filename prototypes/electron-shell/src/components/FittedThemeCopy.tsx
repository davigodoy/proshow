import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { ProjectionTheme } from '../theme/types'
import { themeToCssVars } from '../theme/types'
import {
  fitPhraseLines,
  preferredTitlePx,
} from '../theme/fitText'
import './fitted-theme-copy.css'

export type SafeInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

export type FittedThemeCopyProps = {
  theme: ProjectionTheme
  title?: string
  lines: string[]
  contained?: boolean
  /** Se omitido, usa theme.wrapLines */
  wrapLines?: boolean
  /**
   * Margens da área de texto (%). Com isso o root é o stage inteiro:
   * título livre na tela; letra na área (largura 100%).
   */
  safeInsets?: SafeInsets | null
  className?: string
  onTitlePointerDown?: (e: ReactPointerEvent) => void
  onPhrasePointerDown?: (e: ReactPointerEvent) => void
  titleSelected?: boolean
  phraseSelected?: boolean
  titleTag?: ReactNode
  phraseTag?: ReactNode
  titleRef?: (el: HTMLDivElement | null) => void
  phraseRef?: (el: HTMLDivElement | null) => void
  phraseAreaRef?: (el: HTMLDivElement | null) => void
}

/**
 * Coração visual do tema: título + letra com posições/rotações independentes.
 * Fit compartilhado com LyricStage (`fitPhraseLines`):
 * lyricSizeVw ≤20 = vw do quadro; >20 = % do máximo que cabe.
 */
export function FittedThemeCopy({
  theme,
  title = '',
  lines,
  contained = true,
  wrapLines: wrapLinesProp,
  safeInsets = null,
  className = '',
  onTitlePointerDown,
  onPhrasePointerDown,
  titleSelected,
  phraseSelected,
  titleTag,
  phraseTag,
  titleRef,
  phraseRef,
  phraseAreaRef,
}: FittedThemeCopyProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const phraseAreaElRef = useRef<HTMLDivElement>(null)
  const titleBoxRef = useRef<HTMLDivElement>(null)
  const titleTextRef = useRef<HTMLDivElement>(null)
  const phraseBoxRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const fitGen = useRef(0)

  const unitMode = contained ? 'container' : 'viewport'
  const wantTitle = Boolean(title)
  const wantLines = lines.some((l) => l.trim())
  const wrapLines =
    wrapLinesProp !== undefined ? wrapLinesProp : Boolean(theme.wrapLines)
  const hasSafe = Boolean(safeInsets)

  const style = {
    ...themeToCssVars(theme, unitMode),
    ...(hasSafe && safeInsets
      ? {
          '--safe-top': `${safeInsets.top}%`,
          '--safe-right': `${safeInsets.right}%`,
          '--safe-bottom': `${safeInsets.bottom}%`,
          '--safe-left': `${safeInsets.left}%`,
        }
      : null),
  } as CSSProperties

  useLayoutEffect(() => {
    const root = rootRef.current
    const stack = stackRef.current
    const phraseBox = phraseBoxRef.current
    if (!root || !stack) return
    const gen = ++fitGen.current
    const clip = phraseAreaElRef.current || root
    const measureRoot = phraseBox || root

    const applyTitleSize = () => {
      const titleEl = titleTextRef.current
      if (!titleEl || !wantTitle) return
      const w = Math.max(root.clientWidth, clip.clientWidth, 1)
      titleEl.style.fontSize = `${preferredTitlePx(w, theme.titleSizeVw)}px`
    }

    const run = (): boolean => {
      if (gen !== fitGen.current) return false
      if (root.clientWidth < 8 || root.clientHeight < 8) return false
      if (clip.clientWidth < 8 || clip.clientHeight < 8) return false

      applyTitleSize()

      const lineEls = Array.from(
        stack.querySelectorAll<HTMLElement>('.fitted-theme-line'),
      )
      if (!lineEls.length) return true

      return fitPhraseLines(lineEls, measureRoot, {
        clip,
        stageWidth: root.clientWidth,
        lyricSizeVw: theme.lyricSizeVw,
        fillMode: theme.fillMode,
        fillPct: theme.fillPct,
        rotationDeg: Number(theme.rotationDeg) || 0,
        wrap: wrapLines,
      })
    }

    let cancelled = false
    let retry = 0
    let retryCount = 0
    const MAX_FIT_RETRIES = 24
    const finish = (ok: boolean) => {
      if (cancelled || gen !== fitGen.current) return
      if (!ok) {
        retryCount += 1
        if (retryCount >= MAX_FIT_RETRIES) return
        window.clearTimeout(retry)
        retry = window.setTimeout(() => finish(run()), 32)
      } else {
        retryCount = 0
      }
    }

    const start = () => {
      void root.offsetHeight
      finish(run())
    }

    // Fit with the currently available face so a stalled font load cannot
    // leave live slider changes unapplied. Refit when the requested face lands.
    start()
    const onFontsDone = () => {
      if (cancelled || gen !== fitGen.current) return
      finish(run())
    }
    document.fonts?.addEventListener?.('loadingdone', onFontsDone)

    const ro = new ResizeObserver(() => {
      if (cancelled || gen !== fitGen.current) return
      finish(run())
    })
    ro.observe(root)
    ro.observe(clip)
    if (phraseBox) ro.observe(phraseBox)

    return () => {
      cancelled = true
      window.clearTimeout(retry)
      document.fonts?.removeEventListener?.('loadingdone', onFontsDone)
      ro.disconnect()
    }
  }, [
    theme,
    theme.lyricSizeVw,
    theme.titleSizeVw,
    theme.titleFontFamily,
    theme.phraseFontFamily,
    theme.fontFamily,
    theme.rotationDeg,
    theme.titleRotationDeg,
    theme.offsetXPct,
    theme.offsetYPct,
    theme.titleOffsetXPct,
    theme.titleOffsetYPct,
    theme.uppercase,
    theme.letterSpacingEm,
    theme.lineHeight,
    theme.vertical,
    theme.wrapLines,
    theme.showTitle,
    theme.safeArea?.top,
    theme.safeArea?.right,
    theme.safeArea?.bottom,
    theme.safeArea?.left,
    title,
    lines.join('\n'),
    wrapLines,
    contained,
    wantTitle,
    safeInsets?.top,
    safeInsets?.right,
    safeInsets?.bottom,
    safeInsets?.left,
  ])

  return (
    <div
      ref={rootRef}
      className={`fitted-theme-copy is-free${contained ? ' is-contained' : ''}${
        hasSafe ? ' has-safe-insets' : ''
      }${className ? ` ${className}` : ''}`}
      style={style}
      data-theme={theme.id}
      data-align={theme.textAlign || 'center'}
    >
      <div
        ref={(el) => {
          phraseAreaElRef.current = el
          phraseAreaRef?.(el)
        }}
        className={`fitted-theme-phrase-area${hasSafe ? ' is-inset' : ''}`}
      >
        {wantLines ? (
          <div
            ref={(el) => {
              phraseBoxRef.current = el
              phraseRef?.(el)
            }}
            className={`fitted-theme-phrase-float${phraseSelected ? ' is-selected' : ''}`}
            onPointerDown={onPhrasePointerDown}
            role={onPhrasePointerDown ? 'button' : undefined}
          >
            {phraseTag}
            <div ref={stackRef} className="fitted-theme-stack">
              {lines.map((line, i) => (
                <p
                  key={`${i}-${line.slice(0, 40)}`}
                  className={`fitted-theme-line${wrapLines ? ' is-wrapping' : ''}`}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div ref={stackRef} className="fitted-theme-stack" hidden />
        )}
      </div>

      {wantTitle ? (
        <div
          ref={(el) => {
            titleBoxRef.current = el
            titleRef?.(el)
          }}
          className={`fitted-theme-title-float${titleSelected ? ' is-selected' : ''}`}
          onPointerDown={onTitlePointerDown}
          role={onTitlePointerDown ? 'button' : undefined}
        >
          {titleTag}
          <div ref={titleTextRef} className="fitted-theme-title">
            {title}
          </div>
        </div>
      ) : null}
    </div>
  )
}
