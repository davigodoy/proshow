import { useLayoutEffect, useRef } from 'react'
import { toMediaUrl } from '../mediaUrl'
import './deck-scroll-crop.css'

type Props = {
  slidePaths: ReadonlyArray<string | null | undefined>
  /** 0 = topo, 1 = fim do documento */
  scrollRatio?: number
  className?: string
}

/**
 * Documento contínuo (páginas empilhadas) com recorte da viewport —
 * o ratio espelha o scroll do operador na coluna Apresentação.
 */
export function DeckScrollCrop({
  slidePaths,
  scrollRatio = 0,
  className = '',
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const paths = slidePaths.filter((path): path is string => Boolean(path))

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const strip = stripRef.current
    if (!viewport || !strip || !paths.length) return

    const apply = () => {
      const viewH = viewport.clientHeight
      const contentH = strip.scrollHeight
      const maxOffset = Math.max(0, contentH - viewH)
      const ratio = Math.max(0, Math.min(1, scrollRatio))
      strip.style.transform = `translate3d(0, ${-maxOffset * ratio}px, 0)`
    }

    apply()
    const images = Array.from(strip.querySelectorAll('img'))
    for (const img of images) {
      if (!img.complete) img.addEventListener('load', apply, { once: true })
    }
    const ro = new ResizeObserver(apply)
    ro.observe(viewport)
    ro.observe(strip)
    return () => ro.disconnect()
  }, [paths.join('|'), scrollRatio])

  if (!paths.length) {
    return (
      <div className={`deck-scroll-crop ${className}`.trim()}>
        <div className="deck-scroll-crop-empty">Apresentação</div>
      </div>
    )
  }

  return (
    <div
      ref={viewportRef}
      className={`deck-scroll-crop ${className}`.trim()}
      aria-hidden
    >
      <div ref={stripRef} className="deck-scroll-crop-strip">
        {paths.map((path, index) => (
          <img
            key={`${path}-${index}`}
            className="deck-scroll-crop-page"
            src={toMediaUrl(path) ?? undefined}
            alt=""
            draggable={false}
          />
        ))}
      </div>
    </div>
  )
}
