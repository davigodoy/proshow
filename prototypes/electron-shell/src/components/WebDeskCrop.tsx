import { useEffect, useLayoutEffect, useRef } from 'react'
import { WEB_DESK_WIDTH } from './webDesk'
import './web-desk-crop.css'

type WebviewEl = HTMLElement & {
  src?: string
  getURL?: () => string
  loadURL?: (url: string) => Promise<void> | void
  setZoomFactor?: (factor: number) => void
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
}

type Props = {
  url: string
  /** 0 = topo, 1 = fim */
  scrollRatio?: number
  className?: string
}

const APPLY_SCROLL = (ratio: number) => `(() => {
  const root = document.documentElement;
  const body = document.body;
  const height = Math.max(
    root ? root.scrollHeight : 0,
    body ? body.scrollHeight : 0,
    root ? root.offsetHeight : 0,
    body ? body.offsetHeight : 0,
  );
  const max = Math.max(0, height - window.innerHeight);
  const r = Math.max(0, Math.min(1, ${JSON.stringify(ratio)}));
  window.scrollTo(0, max * r);
  return true;
})()`

function applyDeskZoom(view: WebviewEl, viewport: HTMLElement) {
  const vw = Math.max(1, viewport.clientWidth)
  const factor = Math.max(0.25, Math.min(1, vw / WEB_DESK_WIDTH))
  try {
    view.setZoomFactor?.(factor)
  } catch {
    /* ignore */
  }
}

/**
 * Recorte do site na Saída / AO VIVO — webview full-bleed + zoom desk.
 */
export function WebDeskCrop({
  url,
  scrollRatio = 0,
  className = '',
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<WebviewEl | null>(null)
  const ratioRef = useRef(scrollRatio)
  const applyBusyRef = useRef(false)
  ratioRef.current = scrollRatio

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    let raf = 0
    const layout = () => {
      const view = viewRef.current
      if (!view) return
      applyDeskZoom(view, viewport)
    }

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        layout()
      })
    }

    layout()
    const ro = new ResizeObserver(schedule)
    ro.observe(viewport)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !url || !/^https?:\/\//i.test(url)) return

    let view = viewRef.current
    if (!view) {
      view = document.createElement('webview') as WebviewEl
      view.className = 'web-desk-crop-frame'
      view.setAttribute('allowpopups', 'false')
      view.setAttribute('partition', 'persist:proshow-live')
      view.style.pointerEvents = 'none'
      viewRef.current = view

      const applyScroll = () => {
        applyDeskZoom(view!, viewport)
        if (applyBusyRef.current) return
        applyBusyRef.current = true
        void view!
          .executeJavaScript?.(APPLY_SCROLL(ratioRef.current))
          .catch(() => undefined)
          .finally(() => {
            applyBusyRef.current = false
          })
      }

      view.addEventListener('did-finish-load', applyScroll)
      view.addEventListener('dom-ready', applyScroll)
      viewport.appendChild(view)
      view.setAttribute('src', url)
      applyDeskZoom(view, viewport)
    } else {
      const current = (() => {
        try {
          return view.getURL?.() || view.getAttribute('src') || ''
        } catch {
          return view.getAttribute('src') || ''
        }
      })()
      if (current !== url) {
        try {
          if (typeof view.loadURL === 'function') void view.loadURL(url)
          else view.setAttribute('src', url)
        } catch {
          view.setAttribute('src', url)
        }
      }
      applyDeskZoom(view, viewport)
    }

    return () => {
      /* limpa no unmount */
    }
  }, [url])

  useEffect(() => {
    return () => {
      const viewport = viewportRef.current
      viewRef.current = null
      try {
        viewport?.replaceChildren()
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view?.executeJavaScript || applyBusyRef.current) return
    applyBusyRef.current = true
    void view
      .executeJavaScript(APPLY_SCROLL(scrollRatio))
      .catch(() => undefined)
      .finally(() => {
        applyBusyRef.current = false
      })
  }, [scrollRatio])

  if (!url || !/^https?:\/\//i.test(url)) {
    return (
      <div className={`web-desk-crop ${className}`.trim()}>
        <div className="web-desk-crop-empty">Site</div>
      </div>
    )
  }

  return (
    <div
      ref={viewportRef}
      className={`web-desk-crop ${className}`.trim()}
      aria-hidden
    />
  )
}
