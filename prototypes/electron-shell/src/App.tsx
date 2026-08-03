import { useEffect, useMemo, useState } from 'react'
import type { LiveState, ProjectionTheme, SpectrumConfig } from './projection'
import { DEFAULT_THEME } from './theme/presets'
import { resolveActiveTheme, hydrateThemeMedia, andThemeShowGates } from './theme/activeTheme'
import { FULL_FRAME_SAFE_AREA, normalizeOutputSafeArea, type ThemeSafeArea } from './theme/safeArea'
import { DEFAULT_SPECTRUM, normalizeSpectrum } from './spectrum'
import { Operator } from './screens/Operator'
import { Output } from './screens/Output'
import { ToastHost } from './toast'
import './App.css'

function routeFromHash(): 'operator' | 'output' {
  const h = window.location.hash.replace(/^#\/?/, '')
  return h.startsWith('output') ? 'output' : 'operator'
}

const demoLive: LiveState = {
  title: 'Bem-vindo',
  artist: null,
  lines: ['ProShow', 'Pronto para o show'],
  emphasis: [],
  visible: false,
  kind: 'lyrics',
  cameraDeviceId: null,
  cameraCaption: null,
  cameraPlanItemId: null,
  mediaPath: null,
  mediaKind: null,
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash)
  const [live, setLive] = useState<LiveState>(demoLive)
  const [theme, setTheme] = useState<ProjectionTheme>(DEFAULT_THEME)
  const [themes, setThemes] = useState<ProjectionTheme[]>([])
  const [bibleThemeId, setBibleThemeId] = useState<string | null>(null)
  const [bibleShowTitle, setBibleShowTitle] = useState(true)
  const [bibleShowLyrics, setBibleShowLyrics] = useState(true)
  /** Limite externo único — o tema recorta dentro dele, nunca para fora. */
  const [outputSafeArea, setOutputSafeArea] = useState<ThemeSafeArea>(
    FULL_FRAME_SAFE_AREA,
  )
  const [spectrum, setSpectrum] = useState<SpectrumConfig>(DEFAULT_SPECTRUM)

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const api = window.projection
    if (!api) return
    api.getLive().then(setLive)
    api.getTheme?.().then(setTheme)
    api.listThemes?.().then((list) => {
      if (list?.length) setThemes(list)
    })
    api.getOutputConfig?.().then((c) => {
      setOutputSafeArea(normalizeOutputSafeArea(c.safeArea))
      if (c.bibleThemeId !== undefined) setBibleThemeId(c.bibleThemeId)
      if (typeof c.bibleShowTitle === 'boolean') setBibleShowTitle(c.bibleShowTitle)
      if (typeof c.bibleShowLyrics === 'boolean') setBibleShowLyrics(c.bibleShowLyrics)
      if (c.spectrum) setSpectrum(normalizeSpectrum(c.spectrum))
    })
    api.fontsList?.().then((data) => {
      if (!data?.css) return
      let el = document.getElementById('ible-imported-fonts') as HTMLStyleElement | null
      if (!el) {
        el = document.createElement('style')
        el.id = 'ible-imported-fonts'
        document.head.appendChild(el)
      }
      el.textContent = data.css
    })
    const offLive = api.onLive(setLive)
    const offTheme = api.onTheme?.(setTheme)
    const offOut = api.onOutputConfig?.((cfg) => {
      if (cfg.safeArea) setOutputSafeArea(normalizeOutputSafeArea(cfg.safeArea))
      if (cfg.bibleThemeId !== undefined) setBibleThemeId(cfg.bibleThemeId ?? null)
      if (typeof cfg.bibleShowTitle === 'boolean') setBibleShowTitle(cfg.bibleShowTitle)
      if (typeof cfg.bibleShowLyrics === 'boolean') setBibleShowLyrics(cfg.bibleShowLyrics)
      if (cfg.spectrum) setSpectrum(normalizeSpectrum(cfg.spectrum))
    })
    const offThemesList = api.onThemesList?.((list) => {
      if (!Array.isArray(list) || !list.length) return
      setThemes(list)
      setTheme((prev) => {
        const hit = list.find((t) => t.id === prev.id)
        return hit ? { ...hit } : prev
      })
    })
    const offFonts = api.onFonts?.((data) => {
      if (!data?.css) return
      let el = document.getElementById('ible-imported-fonts') as HTMLStyleElement | null
      if (!el) {
        el = document.createElement('style')
        el.id = 'ible-imported-fonts'
        document.head.appendChild(el)
      }
      el.textContent = data.css
    })
    return () => {
      offLive()
      offTheme?.()
      offOut?.()
      offThemesList?.()
      offFonts?.()
    }
  }, [])

  async function updateLive(next: Partial<LiveState>) {
    if (window.projection) {
      const saved = await window.projection.setLive(next)
      setLive(saved)
    } else {
      setLive((prev) => ({ ...prev, ...next }))
    }
  }

  async function updateTheme(next: ProjectionTheme) {
    if (window.projection?.setTheme) {
      const saved = await window.projection.setTheme(next)
      setTheme(saved)
    } else {
      setTheme(next)
    }
  }

  const bibleTheme = useMemo(() => {
    const base =
      (bibleThemeId && themes.find((t) => t.id === bibleThemeId)) || theme
    return {
      ...base,
      // Checkbox "Referência" — não segue o showTitle do tema nomeado
      showTitle: bibleShowTitle !== false,
      showLyrics: bibleShowLyrics,
      showArtist: false,
      // Bíblia sempre quebra linha — evita encolher versículos como nowrap
      wrapLines: true,
    }
  }, [bibleThemeId, bibleShowTitle, bibleShowLyrics, themes, theme])

  const activeTheme = (() => {
    let t = hydrateThemeMedia(
      resolveActiveTheme(live, theme, bibleTheme),
      themes,
    )
    if (live.kind === 'audio' && !t.backgroundImage && !t.backgroundVideo) {
      const id = live.themeOverride?.id || null
      const fromList = id ? themes.find((x) => x.id === id) : null
      if (fromList?.backgroundImage || fromList?.backgroundVideo) {
        t = {
          ...t,
          backgroundImage: fromList.backgroundImage || null,
          backgroundVideo: fromList.backgroundVideo || null,
        }
      } else if (
        (theme.backgroundImage || theme.backgroundVideo) &&
        (!id || id === theme.id)
      ) {
        t = {
          ...t,
          backgroundImage: theme.backgroundImage || null,
          backgroundVideo: theme.backgroundVideo || null,
        }
      }
    }
    if (live.cameraDeviceId) {
      // Áudio com arte do tema: mantém o fundo (câmera não cobre)
      const keepAudioArt =
        live.kind === 'audio' &&
        Boolean(t.backgroundImage || t.backgroundVideo)
      if (!keepAudioArt) {
        t = { ...t, backgroundImage: null, backgroundVideo: null }
      }
    }
    t = andThemeShowGates(t, { ...live, showText: true })
    // Bíblia: checkbox da referência vale; o gate AO VIVO não apaga
    if (live.kind === 'bible') {
      t = {
        ...t,
        showTitle: bibleTheme.showTitle !== false,
        showArtist: false,
      }
    }
    return t
  })()

  if (route === 'output') {
    return (
      <Output
        live={live}
        theme={activeTheme}
        outputSafeArea={outputSafeArea}
        spectrum={spectrum}
      />
    )
  }

  return (
    <>
      <ToastHost />
      <Operator
        live={live}
        theme={theme}
        outputSafeArea={outputSafeArea}
        bibleTheme={bibleTheme}
        bibleThemeId={bibleThemeId}
        onLiveChange={updateLive}
        onThemeChange={updateTheme}
        onBibleThemeIdChange={(id) => {
          setBibleThemeId(id)
          void window.projection?.setOutputConfig({ bibleThemeId: id })
        }}
        onBibleShowChange={(next) => {
          if (typeof next.bibleShowTitle === 'boolean') {
            setBibleShowTitle(next.bibleShowTitle)
          }
          if (typeof next.bibleShowLyrics === 'boolean') {
            setBibleShowLyrics(next.bibleShowLyrics)
          }
          void window.projection?.setOutputConfig(next)
        }}
      />
    </>
  )
}
