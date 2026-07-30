import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { WEB_DESK_WIDTH } from './webDesk'

export { WEB_DESK_WIDTH }

type NativeImageLike = {
  isEmpty?: () => boolean
  toDataURL?: () => string
}

type WebviewEl = HTMLElement & {
  getURL?: () => string
  src?: string
  canGoBack?: () => boolean
  canGoForward?: () => boolean
  goBack?: () => void
  goForward?: () => void
  reload?: () => void
  loadURL?: (url: string) => Promise<void> | void
  setZoomFactor?: (factor: number) => void
  getZoomFactor?: () => number
  capturePage?: () => Promise<NativeImageLike>
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
}

export type WebBrowseHandle = {
  captureDataUrl: () => Promise<string | null>
}

type Props = {
  src: string
  itemId: string
  /** Mesmo aspect ratio da Preview / Saída (ex.: 16/9). */
  aspectRatio?: number
  onUrlChange?: (url: string) => void
  onScrollRatio?: (ratio: number) => void
  onTakeLive?: () => void
}

type ScrollState = { ratio: number; max: number }

const SCROLL_HOOK = `(() => {
  if (window.__proshowScrollHook) return true;
  window.__proshowScrollHook = true;
  window.__proshowScroll = () => {
    const root = document.documentElement;
    const body = document.body;
    const height = Math.max(
      root ? root.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      root ? root.offsetHeight : 0,
      body ? body.offsetHeight : 0,
    );
    const max = Math.max(0, height - window.innerHeight);
    return { ratio: max > 0 ? window.scrollY / max : 0, max };
  };
  return true;
})()`

function urlsMatch(a: string, b: string) {
  const norm = (u: string) => {
    try {
      const parsed = new URL(u)
      const path = parsed.pathname.replace(/\/+$/, '') || '/'
      return `${parsed.origin}${path}${parsed.search}${parsed.hash}`
    } catch {
      return u.trim()
    }
  }
  return norm(a) === norm(b)
}

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
 * Site em modo desktop na coluna de detalhe.
 * AO VIVO usa captura desta viewport (sem segundo webview).
 */
export const WebBrowsePane = forwardRef<WebBrowseHandle, Props>(
  function WebBrowsePane(
    { src, itemId, aspectRatio = 16 / 9, onUrlChange, onScrollRatio, onTakeLive },
    ref,
  ) {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<WebviewEl | null>(null)
    const homeSrcRef = useRef(src)
    const lastEmittedUrlRef = useRef<string | null>(null)
    const [canBack, setCanBack] = useState(false)
    const [canForward, setCanForward] = useState(false)
    const [atHome, setAtHome] = useState(true)
    const lastRatioRef = useRef(0)
    const readyRef = useRef(false)
    const pollBusyRef = useRef(false)
    const captureBusyRef = useRef(false)
    const onScrollRatioRef = useRef(onScrollRatio)
    const onUrlChangeRef = useRef(onUrlChange)
    onScrollRatioRef.current = onScrollRatio
    onUrlChangeRef.current = onUrlChange
    homeSrcRef.current = src

    useImperativeHandle(ref, () => ({
      async captureDataUrl() {
        const view = viewRef.current as WebviewEl & {
          getWebContents?: () => {
            capturePage?: () => Promise<NativeImageLike>
          }
        } | null
        if (!view || captureBusyRef.current) return null
        captureBusyRef.current = true
        try {
          let image: NativeImageLike | undefined
          if (typeof view.capturePage === 'function') {
            image = await view.capturePage()
          } else {
            const wc = view.getWebContents?.()
            if (wc?.capturePage) image = await wc.capturePage()
          }
          if (!image || image.isEmpty?.()) return null
          const dataUrl = image.toDataURL?.()
          return dataUrl && dataUrl.startsWith('data:image/') ? dataUrl : null
        } catch {
          return null
        } finally {
          captureBusyRef.current = false
        }
      },
    }))

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
    }, [itemId, src])

    useEffect(() => {
      const viewport = viewportRef.current
      if (!viewport || !src) return

      readyRef.current = false
      lastEmittedUrlRef.current = null
      lastRatioRef.current = 0
      viewport.replaceChildren()

      const view = document.createElement('webview') as WebviewEl
      view.className = 'web-desk-frame'
      view.setAttribute('src', src)
      view.setAttribute('allowpopups', 'false')
      view.setAttribute('partition', 'persist:proshow-browse')
      viewRef.current = view

      const emitUrl = (next: string) => {
        if (!next || lastEmittedUrlRef.current === next) return
        lastEmittedUrlRef.current = next
        onUrlChangeRef.current?.(next)
        setAtHome(urlsMatch(next, homeSrcRef.current))
      }

      const syncNav = () => {
        try {
          const next = view.getURL?.() || view.getAttribute('src') || src
          if (next) emitUrl(next)
          setCanBack(Boolean(view.canGoBack?.()))
          setCanForward(Boolean(view.canGoForward?.()))
        } catch {
          /* ignore */
        }
      }

      const onReady = () => {
        readyRef.current = true
        applyDeskZoom(view, viewport)
        syncNav()
        void view.executeJavaScript?.(SCROLL_HOOK).catch(() => undefined)
      }

      view.addEventListener('did-navigate', () => {
        syncNav()
        applyDeskZoom(view, viewport)
      })
      view.addEventListener('did-navigate-in-page', syncNav)
      view.addEventListener('did-finish-load', onReady)
      view.addEventListener('dom-ready', onReady)

      viewport.appendChild(view)
      applyDeskZoom(view, viewport)

      let cancelled = false
      const poll = window.setInterval(() => {
        const v = viewRef.current
        if (!v?.executeJavaScript || cancelled || !readyRef.current) return
        if (pollBusyRef.current) return
        pollBusyRef.current = true
        void v
          .executeJavaScript(
            `window.__proshowScroll ? window.__proshowScroll() : null`,
          )
          .then((raw) => {
            const state = raw as ScrollState | null
            if (!state || typeof state.ratio !== 'number') return
            const ratio = Math.max(0, Math.min(1, state.ratio))
            if (Math.abs(ratio - lastRatioRef.current) < 0.002) return
            lastRatioRef.current = ratio
            onScrollRatioRef.current?.(ratio)
          })
          .catch(() => undefined)
          .finally(() => {
            pollBusyRef.current = false
          })
      }, 200)

      return () => {
        cancelled = true
        readyRef.current = false
        window.clearInterval(poll)
        viewRef.current = null
        try {
          viewport.replaceChildren()
        } catch {
          /* ignore */
        }
      }
    }, [itemId, src])

    function goBack() {
      try {
        viewRef.current?.goBack?.()
      } catch {
        /* ignore */
      }
    }

    function goForward() {
      try {
        viewRef.current?.goForward?.()
      } catch {
        /* ignore */
      }
    }

    function goHome() {
      const view = viewRef.current
      const home = homeSrcRef.current
      if (!view || !home) return
      try {
        if (typeof view.loadURL === 'function') {
          void view.loadURL(home)
        } else {
          view.setAttribute('src', home)
        }
        setAtHome(true)
        lastEmittedUrlRef.current = home
        onUrlChangeRef.current?.(home)
      } catch {
        /* ignore */
      }
    }

    return (
      <div className="web-browse-pane">
        <div className="web-browse-toolbar">
          <button
            type="button"
            className="ghost"
            disabled={!canBack}
            onClick={goBack}
            title="Voltar"
            aria-label="Voltar"
          >
            ←
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!canForward}
            onClick={goForward}
            title="Avançar"
            aria-label="Avançar"
          >
            →
          </button>
          <button
            type="button"
            className="ghost"
            disabled={atHome}
            onClick={goHome}
            title="Início"
            aria-label="Início"
          >
            ⌂
          </button>
          <span className="web-browse-spacer" />
          <button
            type="button"
            className="primary"
            onClick={() => onTakeLive?.()}
            title="Ao vivo"
          >
            Ao vivo
          </button>
        </div>
        <div
          ref={viewportRef}
          className="web-desk-viewport"
          style={{
            ['--stage-ar' as string]: String(aspectRatio),
            aspectRatio: String(aspectRatio),
          }}
        />
      </div>
    )
  },
)
