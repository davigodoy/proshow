import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type { ProjectionTheme } from '../theme/types'
import { themeToCssVars } from '../theme/types'
import {
  fitPhraseLines,
  preferredTitlePx,
} from '../theme/fitText'
import { CameraFeed } from './CameraFeed'
import { MediaPlayer, type MediaPlayback, DEFAULT_PLAYBACK } from './MediaPlayer'
import { DeckScrollCrop } from './DeckScrollCrop'
import { toMediaUrl } from '../mediaUrl'
import type {
  ArtisticEnterEffect,
  ArtisticExitMode,
  ArtisticLayoutPlan,
  ArtisticPhrasePlan,
  ArtisticPhraseTarget,
} from '../theme/artisticLayout'
import {
  createArtisticLayoutPlan,
  artisticTargetAabb,
  ARTISTIC_MAX_OVERFLOW_OF_TEXT,
  ARTISTIC_MOTION_MS,
  ARTISTIC_SEQUENCE_EXIT_HANDOFF,
  ARTISTIC_SEQUENCE_GAP_MS,
  ARTISTIC_SUPPORT_MIN_VISIBLE_RATIO,
} from '../theme/artisticLayout'
import {
  artisticPhraseContentId,
  artisticReflowMotion,
  artisticSlotContentIds,
  sameArtisticPhraseSet,
  type ArtisticReflowMotion,
} from './artisticReflow'
import { SpectrumLayer, spectrumForContent } from '../spectrum'

export { toMediaUrl }

type MediaKind = 'image' | 'video' | 'audio' | 'deck' | 'file' | 'web' | null | undefined

/** Família de superfície no ar — troca entre famílias faz fade. */
export type StageContentFamily = string

function isYoutubeHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, '').toLowerCase()
  return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com'
}

function youtubeCommand(
  win: Window,
  func: string,
  args: Array<string | number | boolean> = [],
) {
  win.postMessage(
    JSON.stringify({ event: 'command', func, args }),
    '*',
  )
}

/** Ajusta mute / enablejsapi no embed do YouTube. */
function withYoutubeEmbedOptions(
  url: string,
  opts: { mute?: boolean },
): string {
  if (!url) return url
  try {
    const u = new URL(url)
    if (!isYoutubeHost(u.hostname)) return url
    u.searchParams.set('enablejsapi', '1')
    u.searchParams.set('playsinline', '1')
    if (opts.mute) u.searchParams.set('mute', '1')
    else u.searchParams.delete('mute')
    return u.toString()
  } catch {
    return url
  }
}

type Props = {
  title?: string
  artist?: string | null
  lines: string[]
  phraseSlots?: string[] | null
  /** Tema por frase da composição artística (alinhado a phraseSlots) */
  slotThemes?: ProjectionTheme[] | null
  artistic?: boolean
  artisticPlan?: ArtisticLayoutPlan | null
  theme: ProjectionTheme
  visible?: boolean
  /** kind do AO VIVO / preview (lyrics, bible, deck, …) — drive do fade entre tipos */
  contentKind?: string | null
  cameraDeviceId?: string | null
  showCamera?: boolean
  mirroredCamera?: boolean
  cameraAudio?: boolean
  cameraVoiceIsolate?: boolean
  /** Câmera principal: fica acima das máscaras/camadas artísticas. */
  cameraForeground?: boolean
  cameraCaption?: string | null
  mediaPath?: string | null
  mediaKind?: MediaKind
  /** Como a imagem preenche o quadro (imagem avulsa, não deck/tema). */
  mediaFit?: 'contain' | 'cover' | 'fill'
  /** Páginas do PDF/deck para recorte contínuo no ao vivo */
  mediaSlidePaths?: Array<string | null> | null
  mediaScrollRatio?: number
  mediaPlayback?: MediaPlayback
  mediaForceMuted?: boolean
  /** false = espelho só visual (navegação fica na coluna de detalhe) */
  mediaInteractive?: boolean
  onMediaTime?: (current: number, duration: number) => void
  contained?: boolean
  badge?: string
  className?: string
  /** Área de texto do tema (% do quadro) — a caixa da LETRA */
  safeArea?: { top: number; right: number; bottom: number; left: number } | null
  /** Margem da saída (% do quadro) — referência do título e limite externo */
  outputSafeArea?: { top: number; right: number; bottom: number; left: number } | null
  /** Quebra de linha (Bíblia / prosa) em vez de encolher numa linha só */
  wrapLines?: boolean
  /** Espectro de áudio (fundo ou HUD) — tipicamente só na janela de saída */
  spectrum?: import('../spectrum').SpectrumConfig | null
}

/**
 * Agrupa o que está no ar para decidir fade:
 * letra ↔ bíblia ↔ mídia (imagem/vídeo/deck/…) ↔ câmera.
 * Troca de slide na mesma família não usa este fade.
 */
export function stageContentFamily(
  contentKind?: string | null,
  mediaKind?: MediaKind,
  cameraForeground?: boolean,
): StageContentFamily {
  if (contentKind === 'camera' || cameraForeground) return 'camera'
  const kind = contentKind || null
  const media =
    mediaKind ||
    (kind === 'image' ||
    kind === 'video' ||
    kind === 'audio' ||
    kind === 'deck' ||
    kind === 'web' ||
    kind === 'file'
      ? kind
      : null)
  if (media) return `media:${media}`
  if (kind === 'bible') return 'bible'
  return 'lyrics'
}

function isPlaceholderLine(lines: string[] | undefined) {
  if (!lines?.length) return true
  if (lines.length === 1 && /^\[.+\]$/.test(lines[0].trim())) return true
  return false
}

function splitPhrase(phrase: string): string[] {
  return String(phrase)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function normalizedPhraseText(lines: string[]): string {
  return lines.join(' ').replace(/\s+/g, ' ').trim()
}

function animClass(name: ProjectionTheme['animation'] | undefined): string {
  switch (name) {
    case 'fade':
      return 'anim-fade'
    case 'slide-up':
      return 'anim-slide-up'
    case 'slide-down':
      return 'anim-slide-down'
    case 'slide-left':
      return 'anim-slide-left'
    case 'slide-right':
      return 'anim-slide-right'
    case 'zoom-in':
      return 'anim-zoom-in'
    case 'zoom-out':
      return 'anim-zoom-out'
    default:
      return ''
  }
}

/** Saída: continua o movimento de chegada (ou fade). */
function animExitClass(name: ProjectionTheme['animation'] | undefined): string {
  switch (name) {
    case 'fade':
      return 'anim-fade-out'
    case 'slide-up':
      return 'anim-slide-up-out'
    case 'slide-down':
      return 'anim-slide-down-out'
    case 'slide-left':
      return 'anim-slide-left-out'
    case 'slide-right':
      return 'anim-slide-right-out'
    case 'zoom-in':
      return 'anim-zoom-in-out'
    case 'zoom-out':
      return 'anim-zoom-out-out'
    default:
      return 'anim-fade-out'
  }
}

function artisticEnterClass(
  effect: ArtisticEnterEffect | undefined,
): string {
  return `artistic-enter-${effect || 'soft-rise'}`
}

function freezeTheme(theme: ProjectionTheme): ProjectionTheme {
  return { ...theme }
}

type ContentSnap = {
  copyKey: string
  title: string
  artist: string | null
  lines: string[]
  slots: string[][]
  slotThemes: ProjectionTheme[]
  useSlots: boolean
  artisticPlanKey: string
  wantTitle: boolean
  wantArtist: boolean
  wantLyrics: boolean
  onCamera: boolean
}

/** Um container por slide (1 linha): tema/efeito isolados e congelados */
type PhraseLayer = {
  id: string
  copyKey: string
  title: string
  artist: string | null
  lines: string[]
  /** Tema congelado na criação — nunca herda o próximo slide */
  theme: ProjectionTheme
  wantTitle: boolean
  wantArtist: boolean
  wantLyrics: boolean
  onCamera: boolean
  phase: 'measuring' | 'enter' | 'shown' | 'exit'
  /** Tamanhos do fit preservados na saída */
  lineFontSizes?: string[]
}

function themeVisualKey(t: ProjectionTheme): string {
  return [
    t.id,
    t.lyricColor,
    t.titleColor,
    t.fontFamily,
    t.phraseFontFamily,
    t.titleFontFamily,
    t.fontWeight,
    t.lyricSizeVw,
    t.titleSizeVw,
    t.letterSpacingEm,
    t.lineHeight,
    t.textAlign,
    t.vertical,
    t.uppercase,
    t.wrapLines,
    t.animation,
    t.animationMs,
    t.animationIntervalMs ?? 0,
    t.rotationDeg,
    t.titleRotationDeg ?? 0,
    t.offsetXPct,
    t.offsetYPct,
    t.titleOffsetXPct ?? 0,
    t.titleOffsetYPct ?? 0,
    t.padXVw,
    t.padYVh,
    t.safeArea?.top ?? '',
    t.safeArea?.right ?? '',
    t.safeArea?.bottom ?? '',
    t.safeArea?.left ?? '',
    t.textShadow,
    t.showTitle,
    t.showArtist,
    t.showLyrics,
  ].join('|')
}

/** Um container por frase na composição artística; tema/efeito ficam congelados. */
type SlotLayer = {
  id: string
  contentId: string
  index: number
  phraseLines: string[]
  theme: ProjectionTheme
  phase: 'measuring' | 'enter' | 'shown' | 'exit'
  reflow: ArtisticReflowMotion
  /** Assentamento suave pós-reflow (fit com transition, sem snap). */
  settling: boolean
  /** Trio inteiro saindo para dar lugar a uma sequência nova. */
  sequenceExit: boolean
  lineFontSizes?: string[]
  artistic: {
    phrase: ArtisticPhrasePlan
    target: ArtisticPhraseTarget
    exitMode: ArtisticExitMode
    planKey: string
    variationId: ArtisticLayoutPlan['variationId']
    enterDelayMs: number
  }
}

let layerSeq = 0
let slotLayerSeq = 0

function makeLayer(input: {
  copyKey: string
  title: string
  artist: string | null
  lines: string[]
  theme: ProjectionTheme
  wantTitle: boolean
  wantArtist: boolean
  wantLyrics: boolean
  onCamera: boolean
  phase?: PhraseLayer['phase']
}): PhraseLayer {
  return {
    id: `L${++layerSeq}:${input.copyKey}`,
    copyKey: input.copyKey,
    title: input.title,
    artist: input.artist,
    lines: input.lines,
    theme: freezeTheme(input.theme),
    wantTitle: input.wantTitle,
    wantArtist: input.wantArtist,
    wantLyrics: input.wantLyrics,
    onCamera: input.onCamera,
    phase: input.phase || 'measuring',
  }
}

function makeSlotLayer(input: {
  contentId: string
  index: number
  phraseLines: string[]
  theme: ProjectionTheme
  phase?: SlotLayer['phase']
  artistic: SlotLayer['artistic']
}): SlotLayer {
  return {
    id: `S${++slotLayerSeq}:${input.contentId}`,
    contentId: input.contentId,
    index: input.index,
    phraseLines: input.phraseLines,
    theme: freezeTheme(input.theme),
    phase: input.phase || 'measuring',
    reflow: null,
    settling: false,
    sequenceExit: false,
    artistic: input.artistic,
  }
}

export function LyricStage({
  title = '',
  artist = null,
  lines,
  phraseSlots = null,
  slotThemes = null,
  artistic = false,
  artisticPlan = null,
  theme,
  visible = true,
  contentKind = null,
  cameraDeviceId = null,
  showCamera = true,
  mirroredCamera = false,
  cameraAudio = false,
  cameraVoiceIsolate = false,
  cameraForeground = false,
  cameraCaption = null,
  mediaPath = null,
  mediaKind = null,
  mediaFit = 'contain',
  mediaSlidePaths = null,
  mediaScrollRatio = 0,
  mediaPlayback = DEFAULT_PLAYBACK,
  mediaForceMuted = false,
  mediaInteractive = true,
  onMediaTime,
  contained = false,
  badge,
  className = '',
  safeArea = null,
  outputSafeArea = null,
  wrapLines = false,
  spectrum = null,
}: Props) {
  const stageWraps = wrapLines || Boolean(theme.wrapLines)
  const contentFamily = stageContentFamily(
    contentKind,
    mediaKind,
    cameraForeground,
  )
  /** Câmera/mídia ao vivo → barra inferior; letra+cam de fundo mantém preferência */
  const spectrumEffective = spectrumForContent(spectrum, contentKind)
  const mediaUrl = toMediaUrl(mediaPath)
  const deckScrollPaths = (mediaSlidePaths || []).filter(Boolean) as string[]
  /** Site ao vivo = frame capturado (imagem); não usar strip de PDF. */
  const isWebCaptureFrame =
    contentKind === 'web' && mediaKind === 'image' && Boolean(mediaUrl)
  const hasDeckScroll =
    !isWebCaptureFrame &&
    deckScrollPaths.length > 0 &&
    (mediaKind === 'deck' || mediaKind === 'image')
  const hasImage = Boolean(
    mediaUrl && mediaKind === 'image' && !hasDeckScroll,
  )
  /** Player AV (vídeo ou áudio) — áudio só precisa do elemento pra transporte/espectro. */
  const hasAvPlayer = Boolean(
    mediaUrl && (mediaKind === 'video' || mediaKind === 'audio'),
  )
  /** Camada visual de mídia — áudio NÃO cobre o fundo (arte/tema). */
  const hasVideoVisual = Boolean(mediaUrl && mediaKind === 'video')
  const hasWebEmbed = Boolean(
    mediaKind === 'web' && mediaUrl && /^https?:\/\//i.test(mediaUrl),
  )
  const webMuted = Boolean(
    mediaForceMuted || mediaPlayback.muted || !visible,
  )
  const mediaPlaybackEffective: typeof mediaPlayback = visible
    ? mediaPlayback
    : {
        ...mediaPlayback,
        playing: false,
        muted: true,
        volume: 0,
      }
  // URL estável (mute inicial p/ autoplay); volume/mute depois via API
  const webEmbedSrc = hasWebEmbed
    ? withYoutubeEmbedOptions(mediaUrl!, { mute: true })
    : null
  const webIframeRef = useRef<HTMLIFrameElement | null>(null)
  const isYoutubeEmbed = Boolean(
    webEmbedSrc && /youtube\.com|youtu\.be/i.test(webEmbedSrc),
  )

  useEffect(() => {
    if (!hasWebEmbed || !isYoutubeEmbed) return
    const win = webIframeRef.current?.contentWindow
    if (!win) return
    const volume = Math.round(
      Math.max(0, Math.min(1, mediaPlaybackEffective.volume ?? 1)) * 100,
    )
    const apply = () => {
      youtubeCommand(win, webMuted ? 'mute' : 'unMute')
      youtubeCommand(win, 'setVolume', [volume])
      youtubeCommand(
        win,
        mediaPlaybackEffective.playing === false ? 'pauseVideo' : 'playVideo',
      )
    }
    apply()
    const t = window.setTimeout(apply, 600)
    return () => window.clearTimeout(t)
  }, [
    hasWebEmbed,
    isYoutubeEmbed,
    webMuted,
    mediaPlaybackEffective.volume,
    mediaPlaybackEffective.playing,
    mediaPath,
  ])

  const hasDeck = mediaKind === 'deck'
  const hasMediaBg =
    hasImage ||
    hasVideoVisual ||
    hasDeckScroll ||
    hasWebEmbed ||
    (hasDeck && Boolean(mediaUrl))

  const themeVideoUrl = toMediaUrl(theme.backgroundVideo)
  const themeImageUrl = toMediaUrl(theme.backgroundImage)
  const themeHasArt = Boolean(themeVideoUrl || themeImageUrl)
  // Áudio: arte do tema/mídia ganha da câmera de fundo
  const showCam = Boolean(
    showCamera &&
      cameraDeviceId &&
      !hasMediaBg &&
      !(contentKind === 'audio' && themeHasArt),
  )
  const showThemeVideo = Boolean(themeVideoUrl && !hasMediaBg && !showCam)
  const showThemeImage = Boolean(
    themeImageUrl && !hasMediaBg && !showCam && !showThemeVideo,
  )
  const showThemeBg = showThemeVideo || showThemeImage
  const showEmptyBg = !hasMediaBg && !showCam && !showThemeBg && !hasDeck

  /** Superfície visual (fundo) — troca dispara fade via preto (preview→AO VIVO). */
  const surfaceKey = [
    contentFamily,
    theme.backgroundImage || '',
    theme.backgroundVideo || '',
    showCam ? cameraDeviceId || 'cam' : '',
    showThemeBg ? 'theme' : '',
    hasMediaBg ? mediaPath || 'media' : '',
  ].join('|')

  const suppliedSlots = (phraseSlots || []).map(splitPhrase).filter((p) => p.length)
  // phraseSlots só têm significado no modo artístico; fora dele são ignorados.
  const useSlots = Boolean(artistic && suppliedSlots.length)
  const slots = useSlots ? suppliedSlots : []
  const flatLines = useSlots ? slots.flat() : lines
  const artisticPhraseTexts = slots.map(normalizedPhraseText)
  const artisticPhraseTextKey = artisticPhraseTexts.join('\u0000')
  const artisticSlotIds = useMemo(
    () => artisticSlotContentIds(slots),
    [artisticPhraseTextKey],
  )
  const artisticPlanMatchesSlots = Boolean(
    artisticPlan &&
      artisticPlan.phase === slots.length &&
      artisticPlan.phrases.length === slots.length &&
      artisticPlan.phrases.every(
        (phrase, index) =>
          phrase.text === artisticPhraseTexts[index] &&
          Boolean(phrase.targets[artisticPlan.phase]),
      ),
  )
  const resolvedArtisticPlan = useMemo(() => {
    if (!useSlots) return null
    if (artisticPlanMatchesSlots && artisticPlan) return artisticPlan
    // Fallback: plano ausente/stale (ex.: primeiro frame sem cache).
    // Em operação normal o Operator resolve via CompositionCache.
    const keywords =
      artisticPlan?.phrases.flatMap((phrase) =>
        phrase.blocks.flatMap((block) =>
          block.words.filter((word) => word.keyword).map((word) => word.text),
        ),
      ) || []
    return createArtisticLayoutPlan({
      phrases: artisticPhraseTextKey.split('\u0000').filter(Boolean),
      seed: artisticPlan?.seed ?? artisticPhraseTextKey,
      keywords,
    })
  }, [
    useSlots,
    artisticPlan,
    artisticPlanMatchesSlots,
    artisticPhraseTextKey,
  ])
  const artisticPlanKey =
    useSlots && resolvedArtisticPlan
      ? [
          resolvedArtisticPlan.seed,
          resolvedArtisticPlan.variationId,
          resolvedArtisticPlan.phase,
          // Ordem independente: promoção não muda a identidade da composição.
          [...resolvedArtisticPlan.phrases.map((phrase) => phrase.text)]
            .sort()
            .join('||'),
          // Keywords de propósito fora da chave: editar a lista ao vivo só
          // pinta ênfase — não deve marcar planChanged / reflow.
          // Assinatura da geometria atual (troca ao promover / reflow).
          resolvedArtisticPlan.phrases
            .map((phrase) => {
              const target = phrase.targets[resolvedArtisticPlan.phase]
              if (!target) return phrase.text
              return [
                phrase.text,
                target.x,
                target.y,
                target.width,
                target.height,
                target.fontVw,
                target.hero ? 1 : 0,
              ].join('@')
            })
            .join('|'),
        ].join(':')
      : ''
  // Qualquer mídia no ar: sem título/artista (o tema centra o título —
  // e label/title da mídia é o nome do arquivo).
  const mediaOnlyKind =
    contentKind === 'image' ||
    contentKind === 'video' ||
    contentKind === 'audio' ||
    contentKind === 'camera' ||
    contentKind === 'file' ||
    contentKind === 'deck' ||
    contentKind === 'web' ||
    mediaKind === 'image' ||
    mediaKind === 'video' ||
    mediaKind === 'audio' ||
    mediaKind === 'deck' ||
    mediaKind === 'file' ||
    mediaKind === 'web'
  const wantTitle = Boolean(
    theme.showTitle && title && !useSlots && !mediaOnlyKind,
  )
  const wantArtist = Boolean(
    theme.showArtist && artist && !useSlots && !mediaOnlyKind,
  )
  const deckTextOnly =
    hasDeck && !mediaUrl && !isPlaceholderLine(flatLines)
  const wantLyrics =
    theme.showLyrics !== false &&
    !isPlaceholderLine(flatLines) &&
    !(hasDeck && mediaUrl && flatLines.every((l) => /^Slide\s+\d+$/i.test(l.trim())))
  const onCamera = showCam || hasMediaBg || showThemeBg

  const fadeMs = Math.max(220, Math.min(Number(theme.animationMs) || 400, 600))
  const familyFadeMs = Math.max(280, Math.min(fadeMs, 500))
  // 1 linha: só a letra dispara transição — título/artista ficam na zona meta (sem animar)
  const copyKey = useSlots
    ? `${title}|${artist}|art:${slots.map((p) => p.join('\n')).join('||')}|${artisticPlanKey}`
    : `lines:${lines.join('\n')}`
  const unitMode = contained ? 'container' : 'viewport'
  const style = {
    ...themeToCssVars(theme, unitMode),
    '--theme-fade-ms': `${fadeMs}ms`,
    '--family-fade-ms': `${familyFadeMs}ms`,
    ...(safeArea
      ? {
          '--safe-top': `${safeArea.top}%`,
          '--safe-right': `${safeArea.right}%`,
          '--safe-bottom': `${safeArea.bottom}%`,
          '--safe-left': `${safeArea.left}%`,
        }
      : null),
    ...(outputSafeArea
      ? {
          '--out-top': `${outputSafeArea.top}%`,
          '--out-right': `${outputSafeArea.right}%`,
          '--out-bottom': `${outputSafeArea.bottom}%`,
          '--out-left': `${outputSafeArea.left}%`,
        }
      : null),
  } as CSSProperties

  const resolvedSlotThemes = useSlots
    ? (slotThemes || []).slice(0, slots.length)
    : []

  const nextContent: ContentSnap = {
    copyKey,
    title,
    artist,
    lines,
    slots,
    slotThemes: resolvedSlotThemes,
    useSlots,
    artisticPlanKey,
    wantTitle,
    wantArtist,
    wantLyrics: wantLyrics || deckTextOnly,
    onCamera,
  }

  const [programOn, setProgramOn] = useState(visible)
  /** Dispara fade via preto ao trocar letra / bíblia / mídia / câmera / fundo */
  const [familyFadeGen, setFamilyFadeGen] = useState(0)
  const contentFamilyRef = useRef(contentFamily)
  const surfaceKeyRef = useRef(surfaceKey)
  const [content, setContent] = useState<ContentSnap>(nextContent)
  /** Modo 1 linha: um container por slide */
  const [layers, setLayers] = useState<PhraseLayer[]>(() =>
    useSlots
      ? []
      : [
          makeLayer({
            copyKey,
            title,
            artist,
            lines,
            theme,
            wantTitle,
            wantArtist,
            wantLyrics: wantLyrics || deckTextOnly,
            onCamera,
            phase: 'measuring',
          }),
        ],
  )
  /** Composição artística: um container por frase. */
  const [slotLayers, setSlotLayers] = useState<SlotLayer[]>(() =>
    useSlots && resolvedArtisticPlan
      ? slots.map((phraseLines, i) =>
          makeSlotLayer({
            contentId: artisticSlotIds[i] || artisticPhraseContentId(phraseLines),
            index: i,
            phraseLines,
            theme: resolvedSlotThemes[i] || theme,
            phase: 'measuring',
            artistic: {
              phrase: resolvedArtisticPlan.phrases[i],
              target:
                resolvedArtisticPlan.phrases[i].targets[
                  resolvedArtisticPlan.phase
                ]!,
              exitMode: resolvedArtisticPlan.exitMode,
              planKey: artisticPlanKey,
              variationId: resolvedArtisticPlan.variationId,
              enterDelayMs: 0,
            },
          }),
        )
      : [],
  )
  const renderArtistic = content.useSlots && Boolean(content.artisticPlanKey)

  const contentKeyRef = useRef(copyKey)
  const handledSlideKeyRef = useRef(copyKey)
  const handledArtisticKeyRef = useRef(copyKey)
  const layersRef = useRef(layers)
  layersRef.current = layers
  const slotLayersRef = useRef(slotLayers)
  slotLayersRef.current = slotLayers
  const stageRef = useRef<HTMLDivElement>(null)
  const fitClipRef = useRef<HTMLDivElement>(null)
  const titleCellRef = useRef<HTMLDivElement>(null)
  const layerNodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const slotsRootRef = useRef<HTMLDivElement>(null)
  const fitGen = useRef(0)
  const lastStageSize = useRef({ w: 0, h: 0 })
  const measuringLayersKey = layers
    .filter((l) => l.phase === 'measuring')
    .map((l) => l.id)
    .join('|')
  const activeLayersFitKey = layers
    .filter((l) => l.phase !== 'exit')
    .map((l) => `${l.id}:${themeVisualKey(l.theme)}`)
    .join('|')
  const measuringSlotsKey = slotLayers
    .filter((l) => l.phase === 'measuring')
    .map((l) => l.id)
    .join('|')
  const activeSlotsFitKey = slotLayers
    .filter((l) => l.phase !== 'exit')
    .map(
      (l) =>
        `${l.id}:${themeVisualKey(l.theme)}:${l.reflow || ''}:${l.artistic.target.hero ? 1 : 0}`,
    )
    .join('|')
  /** Mantido só por compat; settling pós-reflow foi desligado (causava travamento). */
  const artisticSettlingFitKey = ''
  const stageThemeFitKey = themeVisualKey(theme)
  const reflowingSlotsKey = slotLayers
    .filter((layer) => layer.reflow && layer.phase !== 'exit')
    .map((layer) => `${layer.id}:${layer.reflow}`)
    .join('|')

  useEffect(() => {
    setProgramOn(visible)
  }, [visible])

  // Fade via preto ao trocar letra ↔ bíblia ↔ mídia ↔ câmera, ou fundo (tema/arte)
  useLayoutEffect(() => {
    const familyChanged = contentFamilyRef.current !== contentFamily
    const surfaceChanged = surfaceKeyRef.current !== surfaceKey
    contentFamilyRef.current = contentFamily
    surfaceKeyRef.current = surfaceKey
    if (!familyChanged && !surfaceChanged) return
    if (!visible) return
    setFamilyFadeGen((n) => n + 1)
  }, [contentFamily, surfaceKey, visible])

  // ─── Artístico: até três frases em composição progressiva ───
  useEffect(() => {
    if (!useSlots || !resolvedArtisticPlan) {
      setSlotLayers([])
      handledArtisticKeyRef.current = ''
      return
    }

    setLayers([])
    setContent(nextContent)

    const nextWantLyrics = wantLyrics || deckTextOnly
    const nextEntries = nextWantLyrics
      ? slots.flatMap((phraseLines, i) => {
          const phrase = resolvedArtisticPlan.phrases[i]
          const target = phrase?.targets[slots.length as 1 | 2 | 3]
          if (!phrase || !target) return []
          return [{
            contentId: artisticSlotIds[i] || artisticPhraseContentId(phraseLines),
            index: i,
            phraseLines,
            theme: freezeTheme(resolvedSlotThemes[i] || theme),
            artistic: {
              phrase,
              target,
              exitMode: resolvedArtisticPlan.exitMode,
              planKey: artisticPlanKey,
              variationId: resolvedArtisticPlan.variationId,
              enterDelayMs: 0,
            },
          }]
        })
      : []
    const nextById = new Map(nextEntries.map((e) => [e.contentId, e]))
    const nextSig = nextEntries.map((e) => e.contentId).join('||')

    const prev = slotLayersRef.current
    const active = prev.filter((l) => l.phase !== 'exit')
    const activeSig = active.map((l) => l.contentId).join('||')
    const samePhraseSet = sameArtisticPhraseSet(
      active.map((layer) => layer.contentId),
      nextEntries.map((entry) => entry.contentId),
    )
    const planChanged = active.some((layer) => {
      const next = nextById.get(layer.contentId)
      return next && layer.artistic.planKey !== next.artistic.planKey
    })

    // Promoção/live-edit do mesmo conjunto: preserva os nós DOM (ordem estável)
    // e só troca a geometria. Reordenar o array reinicia animações CSS.
    if (samePhraseSet) {
      const shouldReflow = activeSig !== nextSig || planChanged
      handledArtisticKeyRef.current = copyKey
      contentKeyRef.current = copyKey
      setSlotLayers((cur) => {
        const nextByContent = new Map(
          nextEntries.map((entry) => [entry.contentId, entry]),
        )
        return cur.map((layer) => {
          if (layer.phase === 'exit') return layer
          const next = nextByContent.get(layer.contentId)
          if (!next) return layer
          const reflow =
            shouldReflow && layer.phase !== 'measuring'
              ? artisticReflowMotion(
                  layer.artistic.target,
                  next.artistic.target,
                )
              : null
          return {
            ...layer,
            index: next.index,
            phraseLines: next.phraseLines,
            theme:
              themeVisualKey(layer.theme) === themeVisualKey(next.theme)
                ? layer.theme
                : freezeTheme(next.theme),
            // Cancela enter a meio: a frase já está na tela e só reflow.
            phase:
              shouldReflow && layer.phase === 'enter' ? 'shown' : layer.phase,
            reflow: shouldReflow ? reflow : layer.reflow,
            settling: shouldReflow ? false : layer.settling,
            sequenceExit: false,
            artistic: next.artistic,
          }
        })
      })
      return
    }

    // Strict Mode / deps extras: só ignora se as layers ativas já batem com o plano.
    if (handledArtisticKeyRef.current === copyKey) {
      contentKeyRef.current = copyKey
      const activeIds = active.map((layer) => layer.contentId)
      const nextIds = nextEntries.map((entry) => entry.contentId)
      if (
        active.length === nextEntries.length &&
        sameArtisticPhraseSet(activeIds, nextIds)
      ) {
        return
      }
      // copyKey igual mas layers dessincronizadas (ex.: 2ª frase não montou) → segue.
    }

    handledArtisticKeyRef.current = copyKey
    contentKeyRef.current = copyKey

    setSlotLayers((cur) => {
      const result: SlotLayer[] = []
      const staying = new Set<string>()
      const curActive = cur.filter((layer) => layer.phase !== 'exit')
      // Troca completa: nada do que está no ar continua. Aí a saída precisa
      // terminar antes da entrada, senão os dois efeitos rodam por cima um do
      // outro e não se vê o novo entrar.
      //
      // Antes isto exigia três frases no ar, calibrado para o mosaico do Max.
      // No Criativo solo há uma frase só, então nunca disparava e cada linha
      // entrava enquanto a anterior ainda saía. O que importa não é quantas
      // saem — é não sobrar nenhuma.
      const startsNewSequence =
        curActive.length > 0 &&
        nextEntries.length > 0 &&
        !curActive.some((layer) =>
          nextEntries.some((entry) => entry.contentId === layer.contentId),
        )
      const outgoingStagger = Math.max(
        0,
        ...curActive
          .filter((layer) => layer.artistic.exitMode === 'individual')
          .flatMap((layer) =>
            layer.artistic.phrase.blocks.map(
              (block) => block.exitDelayMs,
            ),
          ),
      )
      // Artístico: trio antigo desvanece antes do novo começar a aparecer.
      const outgoingDuration = ARTISTIC_MOTION_MS
      const newSequenceDelay = startsNewSequence
        ? Math.round(outgoingDuration * ARTISTIC_SEQUENCE_EXIT_HANDOFF) +
          outgoingStagger +
          ARTISTIC_SEQUENCE_GAP_MS
        : 0

      for (const layer of cur) {
        if (layer.phase === 'exit') {
          result.push(layer)
          continue
        }
        const next = nextById.get(layer.contentId)
        if (next) {
          staying.add(layer.contentId)
          const reflow =
            layer.phase === 'measuring'
              ? null
              : artisticReflowMotion(
                  layer.artistic.target,
                  next.artistic.target,
                )
          result.push({
            ...layer,
            index: next.index,
            phraseLines: next.phraseLines,
            theme:
              themeVisualKey(layer.theme) === themeVisualKey(next.theme)
                ? layer.theme
                : freezeTheme(next.theme),
            phase:
              reflow && layer.phase === 'enter' ? 'shown' : layer.phase,
            reflow,
            settling: reflow ? false : layer.settling,
            sequenceExit: false,
            artistic: next.artistic,
          })
        } else {
          result.push({
            ...layer,
            phase: 'exit',
            reflow: null,
            settling: false,
            sequenceExit: startsNewSequence,
          })
        }
      }

      for (const entry of nextEntries) {
        if (staying.has(entry.contentId)) continue
        result.push(
          makeSlotLayer({
            contentId: entry.contentId,
            index: entry.index,
            phraseLines: entry.phraseLines,
            theme: entry.theme,
            phase: 'measuring',
            artistic: {
              ...entry.artistic,
              enterDelayMs: newSequenceDelay,
            },
          }),
        )
      }
      return result
    })
  }, [
    useSlots,
    copyKey,
    title,
    artist,
    lines,
    phraseSlots,
    slotThemes,
    artistic,
    resolvedArtisticPlan,
    artisticPlanKey,
    wantTitle,
    wantArtist,
    wantLyrics,
    deckTextOnly,
    onCamera,
    theme,
  ])

  // Reflow reusa o mesmo nó DOM: limpa nudges de fit do apoio/retrato antes
  // da transição, senão o herói herda --art-fit-* e estaciona em overflow.
  useLayoutEffect(() => {
    if (!reflowingSlotsKey) return
    for (const layer of slotLayersRef.current) {
      if (!layer.reflow || layer.phase === 'exit') continue
      const node = layerNodeRefs.current.get(layer.id)
      if (!node) continue
      node.style.setProperty('--art-font-scale', '1')
      node.style.setProperty('--art-box-scale', '1')
      node.style.setProperty('--art-fit-x', '0px')
      node.style.setProperty('--art-fit-y', '0px')
    }
  }, [reflowingSlotsKey])

  // Após o reflow geométrico: só limpa a flag. Sem fit/settling no fim —
  // o fit síncrono engasgava o frame final; o destino já vem do plano.
  useEffect(() => {
    const reflowing = slotLayers.filter((layer) => layer.reflow)
    if (!reflowing.length) return
    const timer = window.setTimeout(() => {
      setSlotLayers((cur) =>
        cur.map((layer) =>
          layer.reflow ? { ...layer, reflow: null, settling: false } : layer,
        ),
      )
    }, ARTISTIC_MOTION_MS + 80)
    return () => window.clearTimeout(timer)
  }, [
    slotLayers
      .map((layer) => `${layer.id}:${layer.reflow || ''}`)
      .join('|'),
  ])

  // Failsafe: frase nova não pode ficar eternamente em measuring (opacity 0).
  useEffect(() => {
    const measuring = slotLayers.filter((layer) => layer.phase === 'measuring')
    if (!measuring.length) return
    const timer = window.setTimeout(() => {
      const ids = new Set(measuring.map((layer) => layer.id))
      setSlotLayers((prev) =>
        prev.map((layer) =>
          ids.has(layer.id) && layer.phase === 'measuring'
            ? { ...layer, phase: 'enter' as const }
            : layer,
        ),
      )
      window.setTimeout(() => {
        setSlotLayers((prev) =>
          prev.map((layer) =>
            ids.has(layer.id) && layer.phase === 'enter'
              ? { ...layer, phase: 'shown' as const }
              : layer,
          ),
        )
      }, ARTISTIC_MOTION_MS + 40)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [
    slotLayers
      .filter((layer) => layer.phase === 'measuring')
      .map((layer) => layer.id)
      .join('|'),
  ])

  // ─── 1 linha: um container por slide (tema/efeito próprios, congelados) ───
  useEffect(() => {
    if (useSlots) {
      setLayers([])
      handledSlideKeyRef.current = ''
      return
    }
    const nextWantLyrics = wantLyrics || deckTextOnly
    const nextThemeKey = themeVisualKey(theme)
    const prevLayers = layersRef.current
    const active = [...prevLayers].reverse().find((l) => l.phase !== 'exit')
    const sameSlide = Boolean(active && active.copyKey === copyKey)

    setContent(nextContent)

    if (sameSlide && active) {
      handledSlideKeyRef.current = copyKey
      contentKeyRef.current = copyKey
      if (
        active.title !== title ||
        active.artist !== artist ||
        active.wantTitle !== wantTitle ||
        active.wantArtist !== wantArtist ||
        active.wantLyrics !== nextWantLyrics ||
        active.onCamera !== onCamera ||
        themeVisualKey(active.theme) !== nextThemeKey
      ) {
        setLayers((prev) =>
          prev.map((layer) => {
            if (layer.id !== active.id) return layer
            return {
              ...layer,
              title,
              artist,
              lines,
              wantTitle,
              wantArtist,
              wantLyrics: nextWantLyrics,
              onCamera,
              theme: freezeTheme(theme),
            }
          }),
        )
      }
      return
    }

    // Strict Mode / re-entrada: já enfileiramos este slide
    if (handledSlideKeyRef.current === copyKey) {
      contentKeyRef.current = copyKey
      return
    }

    // Novo slide → container novo em measuring; o atual só sai depois do fit (+ intervalo)
    const incoming = makeLayer({
      copyKey,
      title,
      artist,
      lines,
      theme,
      wantTitle,
      wantArtist,
      wantLyrics: nextWantLyrics,
      onCamera,
      phase: 'measuring',
    })

    handledSlideKeyRef.current = copyKey
    contentKeyRef.current = copyKey

    setLayers((prev) => {
      const alreadyOut = prev.filter((l) => l.phase === 'exit')
      // Mantém o que está na tela; descarta measuring abortado (avanço rápido)
      const onScreen = prev.filter(
        (l) => l.phase === 'shown' || l.phase === 'enter',
      )
      return [...alreadyOut, ...onScreen, incoming]
    })
  }, [
    useSlots,
    copyKey,
    title,
    artist,
    lines,
    wantTitle,
    wantArtist,
    wantLyrics,
    deckTextOnly,
    onCamera,
    theme,
    theme.animationMs,
  ])

  // Remove layers em exit após a animação.
  useEffect(() => {
    const exitMs = Math.max(220, Math.min(Number(theme.animationMs) || 400, 700))
    const timers: number[] = []

    const slideExitIds = layers.filter((l) => l.phase === 'exit').map((l) => l.id)
    if (slideExitIds.length) {
      timers.push(
        window.setTimeout(() => {
          setLayers((cur) => cur.filter((l) => !slideExitIds.includes(l.id)))
        }, exitMs),
      )
    }

    const slotExitIds = slotLayers
      .filter((l) => l.phase === 'exit')
      .map((l) => l.id)
    if (slotExitIds.length) {
      const staggerMs = Math.max(
        0,
        ...slotLayers
          .filter(
            (layer) =>
              layer.phase === 'exit' &&
              layer.artistic.exitMode === 'individual',
          )
          .flatMap((layer) =>
            layer.artistic.phrase.blocks.map(
              (block) => block.exitDelayMs,
            ),
          ),
      )
      timers.push(
        window.setTimeout(() => {
          setSlotLayers((cur) => cur.filter((l) => !slotExitIds.includes(l.id)))
        }, ARTISTIC_MOTION_MS + staggerMs + 80),
      )
    }

    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [
    theme.animationMs,
    layers
      .filter((l) => l.phase === 'exit')
      .map((l) => l.id)
      .join('|'),
    slotLayers
      .filter((l) => l.phase === 'exit')
      .map((l) => l.id)
      .join('|'),
  ])

  /**
   * Fit: slots OU layers em measuring — cada um no próprio container/tema.
   */
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const gen = ++fitGen.current
    const clip = fitClipRef.current || stage

    const applyTitleSize = () => {
      const titleCell = titleCellRef.current
      if (!titleCell) return
      const px = preferredTitlePx(stage.clientWidth, theme.titleSizeVw)
      const titleEl = titleCell.querySelector<HTMLElement>('.lyric-stage-title')
      const artistEl = titleCell.querySelector<HTMLElement>('.lyric-stage-artist')
      if (titleEl) titleEl.style.fontSize = `${px}px`
      if (artistEl) artistEl.style.fontSize = `${px * 0.85}px`
    }

    const fitPhrase = (
      lineEls: HTMLElement[],
      box: HTMLElement,
      layerTheme: ProjectionTheme,
    ) => {
      if (!lineEls.length) return false
      return fitPhraseLines(lineEls, box, {
        clip,
        stageWidth: stage.clientWidth,
        lyricSizeVw: layerTheme.lyricSizeVw,
        fillMode: layerTheme.fillMode,
        fillPct: layerTheme.fillPct,
        rotationDeg: Number(layerTheme.rotationDeg) || 0,
        wrap: wrapLines || Boolean(layerTheme.wrapLines),
      })
    }

    const fitArtistic = (): boolean => {
      const root = slotsRootRef.current
      if (!root || !content.artisticPlanKey) return false
      const rootRect = root.getBoundingClientRect()
      const active = slotLayersRef.current.filter(
        (layer) => layer.phase !== 'exit',
      )
      if (!active.length) return false
      // Só espera sync se ainda há measuring pendente e count diverge.
      const pendingMeasure = active.some((layer) => layer.phase === 'measuring')
      if (pendingMeasure && active.length < content.slots.length) return false

      // Reflow anima geometria — não refitar no meio (evita snap).
      // Settling: fit suave no destino COM transition (sem freeze).
      const settlingIds = new Set(
        active.filter((layer) => layer.settling).map((layer) => layer.id),
      )
      const softFit = settlingIds.size > 0
      const lockedIds = new Set(
        softFit
          ? []
          : active
              .filter((layer) => layer.reflow || layer.phase === 'enter')
              .map((layer) => layer.id),
      )
      const reflowingIds = new Set(
        active.filter((layer) => layer.reflow).map((layer) => layer.id),
      )
      const frozenNodes: HTMLElement[] = []
      const freezeNode = (node: HTMLElement) => {
        if (softFit) return
        node.style.transition = 'none'
        frozenNodes.push(node)
      }
      const thawNodes = () => {
        if (softFit) return
        for (const node of frozenNodes) void node.offsetWidth
        for (const node of frozenNodes) node.style.removeProperty('transition')
      }

      const aspect =
        rootRect.height > 0 ? rootRect.width / rootRect.height : 16 / 9
      const destinationBoundsPx = (target: ArtisticPhraseTarget) => {
        const aabb = artisticTargetAabb(target, aspect)
        const left = rootRect.left + (aabb.left / 100) * rootRect.width
        const top = rootRect.top + (aabb.top / 100) * rootRect.height
        const right = rootRect.left + (aabb.right / 100) * rootRect.width
        const bottom = rootRect.top + (aabb.bottom / 100) * rootRect.height
        return {
          left,
          top,
          right,
          bottom,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top),
        }
      }

      const boundsFor = (elements: HTMLElement[]) => {
        let left = Infinity
        let top = Infinity
        let right = -Infinity
        let bottom = -Infinity
        for (const element of elements) {
          const rect = element.getBoundingClientRect()
          if (!rect.width && !rect.height) continue
          left = Math.min(left, rect.left)
          top = Math.min(top, rect.top)
          right = Math.max(right, rect.right)
          bottom = Math.max(bottom, rect.bottom)
        }
        if (!Number.isFinite(left)) return null
        return {
          left,
          top,
          right,
          bottom,
          width: right - left,
          height: bottom - top,
        }
      }

      const glyphEls = (node: HTMLElement, blocks: HTMLElement[]) => {
        const words = Array.from(
          node.querySelectorAll<HTMLElement>('.artistic-word'),
        )
        return words.length ? words : blocks
      }

      // Hard stop: fit nunca pode estacionar a frase fora da tela.
      const keepIntersecting = (
        item: {
          node: HTMLElement
          bounds: NonNullable<ReturnType<typeof boundsFor>>
          fitX: number
          fitY: number
        },
      ) => {
        const b = item.bounds
        let dx = 0
        let dy = 0
        if (b.right < rootRect.left + 8) dx += rootRect.left + 8 - b.right
        if (b.left > rootRect.right - 8) dx -= b.left - (rootRect.right - 8)
        if (b.bottom < rootRect.top + 8) dy += rootRect.top + 8 - b.bottom
        if (b.top > rootRect.bottom - 8) dy -= b.top - (rootRect.bottom - 8)
        if (!dx && !dy) return
        item.fitX += dx
        item.fitY += dy
        item.node.style.setProperty('--art-fit-x', `${item.fitX}px`)
        item.node.style.setProperty('--art-fit-y', `${item.fitY}px`)
        void item.node.offsetWidth
        const next = boundsFor([
          item.node,
          ...glyphEls(
            item.node,
            Array.from(item.node.querySelectorAll<HTMLElement>('.artistic-block')),
          ),
        ])
        if (next) item.bounds = next
      }

      for (const layer of active) {
        const node = layerNodeRefs.current.get(layer.id)
        if (!node) return false
        const blocksRoot =
          node.querySelector<HTMLElement>('.artistic-blocks')
        const blocks = Array.from(
          node.querySelectorAll<HTMLElement>('.artistic-block'),
        )
        if (!blocksRoot || !blocks.length) return false

        if (lockedIds.has(layer.id)) continue

        freezeNode(node)
        node.style.setProperty('--art-font-scale', '1')
        node.style.setProperty('--art-box-scale', '1')
        node.style.setProperty('--art-fit-x', '0px')
        node.style.setProperty('--art-fit-y', '0px')

        // Mede sem rotação. Não mexer em animation (reinicia enter → opacity 0).
        const transform = node.style.transform
        node.style.transform = 'none'
        void node.offsetWidth
        const glyphs = glyphEls(node, blocks)
        const blocksFit = (scale: number) => {
          node.style.setProperty('--art-font-scale', String(scale))
          void node.offsetWidth
          const box = blocksRoot.getBoundingClientRect()
          const contentBounds = boundsFor(glyphs)
          return Boolean(
            contentBounds &&
              contentBounds.left >= box.left - 0.5 &&
              contentBounds.right <= box.right + 0.5 &&
              contentBounds.top >= box.top - 0.5 &&
              contentBounds.bottom <= box.bottom + 0.5,
          )
        }
        if (!blocksFit(1)) {
          let low = 0.55
          let high = 1
          let best = low
          blocksFit(low)
          for (let i = 0; i < 16; i += 1) {
            const mid = (low + high) / 2
            if (blocksFit(mid)) {
              best = mid
              low = mid
            } else {
              high = mid
            }
          }
          blocksFit(best)
        } else if (layer.phase === 'measuring') {
          // Caixa sobra: o fontVw estimado (Node, sem DOM) mira a área, mas o
          // quebra real do navegador pode render menos linhas que o previsto e
          // deixar a caixa alocada maior que o texto. Sem isto, "cobertura de
          // 90% da caixa" vira ~40% de tinta na tela — medido, não suposto.
          //
          // Cresce direto por conta (sem busca binária): --art-font-scale é
          // `transform: scale`, não font-size (propositalmente — preserva a
          // quebra flex entre herói e apoio), e transform escala em linha
          // reta a partir da medida em 1×. Uma conta basta; iterar aqui só
          // somaria reflow forçado no caminho da animação.
          //
          // Só em 'measuring' (oculto): a frase já mostrada não pode ganhar
          // tamanho de novo, senão o refit pós-entrada (fontes/resize) vira o
          // "trava, pula pro tamanho final" relatado — um segundo salto visível
          // depois do bloco já ter aparecido.
          const box = blocksRoot.getBoundingClientRect()
          const contentBounds = boundsFor(glyphs)
          const contentW = contentBounds ? contentBounds.right - contentBounds.left : 0
          const contentH = contentBounds ? contentBounds.bottom - contentBounds.top : 0
          if (contentW > 0 && contentH > 0) {
            // Teto alto de propósito: quem impede o transbordo é a razão
            // caixa/conteúdo abaixo (medida), não este número. Com 1.6 o
            // crescimento parava antes de encher a caixa quando a estimativa
            // do Node saía baixa — a letra ficava pequena com espaço sobrando.
            const ART_FILL_GROW_CAP = 3
            const grown = Math.min(
              ART_FILL_GROW_CAP,
              (box.right - box.left) / contentW,
              (box.bottom - box.top) / contentH,
            )
            if (grown > 1) blocksFit(grown)
          }
        }
        node.style.transform = transform
        void node.offsetWidth

        const isHero = Boolean(layer.artistic.target.hero)
        let allBounds = boundsFor([node, ...glyphs])
        if (!allBounds) {
          thawNodes()
          return false
        }

        if (isHero) {
          const maxBleedX = Math.max(
            1,
            allBounds.width * ARTISTIC_MAX_OVERFLOW_OF_TEXT,
          )
          const maxBleedY = Math.max(
            1,
            allBounds.height * ARTISTIC_MAX_OVERFLOW_OF_TEXT,
          )
          const availableWidth = Math.max(1, rootRect.width + maxBleedX * 2)
          const availableHeight = Math.max(1, rootRect.height + maxBleedY * 2)
          const boxScale = Math.min(
            1,
            availableWidth / Math.max(1, allBounds.width),
            availableHeight / Math.max(1, allBounds.height),
          )
          if (boxScale < 1) {
            node.style.setProperty('--art-box-scale', String(boxScale))
            void node.offsetWidth
            allBounds = boundsFor([node, ...glyphs])
            if (!allBounds) {
              thawNodes()
              return false
            }
          }

          let dx = 0
          let dy = 0
          const limX = Math.max(
            1,
            allBounds.width * ARTISTIC_MAX_OVERFLOW_OF_TEXT,
          )
          const limY = Math.max(
            1,
            allBounds.height * ARTISTIC_MAX_OVERFLOW_OF_TEXT,
          )
          if (allBounds.left < rootRect.left - limX) {
            dx += rootRect.left - limX - allBounds.left
          }
          if (allBounds.right + dx > rootRect.right + limX) {
            dx -= allBounds.right + dx - (rootRect.right + limX)
          }
          if (allBounds.top < rootRect.top - limY) {
            dy += rootRect.top - limY - allBounds.top
          }
          if (allBounds.bottom + dy > rootRect.bottom + limY) {
            dy -= allBounds.bottom + dy - (rootRect.bottom + limY)
          }
          node.style.setProperty('--art-fit-x', `${dx}px`)
          node.style.setProperty('--art-fit-y', `${dy}px`)
          void node.offsetWidth
        }
      }

      const measured = active.flatMap((layer) => {
        const node = layerNodeRefs.current.get(layer.id)
        if (!node) return []
        const locked = lockedIds.has(layer.id)
        // Locked (reflow/enter): usa AABB do DESTINO do plano — assim a frase
        // nova encaixa contra onde o apoio VAI parar, não contra o meio da animação.
        if (locked) {
          const bounds = destinationBoundsPx(layer.artistic.target)
          return [
            {
              layer,
              node,
              bounds,
              fontScale: 1,
              fitX: 0,
              fitY: 0,
              locked: true,
              virtual: true,
            },
          ]
        }
        const blocks = Array.from(
          node.querySelectorAll<HTMLElement>('.artistic-block'),
        )
        const glyphs = glyphEls(node, blocks)
        const bounds = boundsFor(glyphs.length ? glyphs : [node, ...blocks])
        if (!bounds) return []
        const fontScale = Number(
          node.style.getPropertyValue('--art-font-scale') || '1',
        )
        const fitX =
          Number.parseFloat(node.style.getPropertyValue('--art-fit-x') || '0') ||
          0
        const fitY =
          Number.parseFloat(node.style.getPropertyValue('--art-fit-y') || '0') ||
          0
        return [
          {
            layer,
            node,
            bounds,
            fontScale:
              Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1,
            fitX,
            fitY,
            locked: false,
            virtual: false,
          },
        ]
      })
      if (!measured.length) {
        thawNodes()
        return false
      }

      const gapPx = Math.max(8, rootRect.width * 0.014)
      const overlaps = (
        a: { left: number; top: number; right: number; bottom: number },
        b: { left: number; top: number; right: number; bottom: number },
      ) => {
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left) + gapPx
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + gapPx
        if (ox <= 0 || oy <= 0) return null
        return { ox, oy }
      }
      const refreshBounds = (item: (typeof measured)[number]) => {
        if (item.virtual) {
          item.bounds = destinationBoundsPx(item.layer.artistic.target)
          return
        }
        const blocks = Array.from(
          item.node.querySelectorAll<HTMLElement>('.artistic-block'),
        )
        const glyphs = glyphEls(item.node, blocks)
        const next = boundsFor(glyphs.length ? glyphs : [item.node, ...blocks])
        if (next) item.bounds = next
      }

      for (let iter = 0; iter < 28; iter += 1) {
        let hit = false
        for (let i = 0; i < measured.length; i += 1) {
          for (let j = i + 1; j < measured.length; j += 1) {
            const a = measured[i]
            const b = measured[j]
            const ov = overlaps(a.bounds, b.bounds)
            if (!ov) continue
            hit = true
            const aHero = a.layer.artistic.target.hero
            const bHero = b.layer.artistic.target.hero
            let aMass = aHero ? 12 : 1
            let bMass = bHero ? 12 : 1
            if (a.locked && !b.locked) {
              aMass = 100
              bMass = 1
            } else if (b.locked && !a.locked) {
              aMass = 1
              bMass = 100
            } else if (a.locked && b.locked) {
              continue
            }
            const total = aMass + bMass
            const aCx = (a.bounds.left + a.bounds.right) / 2
            const aCy = (a.bounds.top + a.bounds.bottom) / 2
            const bCx = (b.bounds.left + b.bounds.right) / 2
            const bCy = (b.bounds.top + b.bounds.bottom) / 2
            // Cap por iteração evita runaway se bounds estiverem stale.
            const maxPush = Math.max(24, rootRect.height * 0.08)
            if (ov.ox <= ov.oy) {
              const push = Math.min(ov.ox + 1, maxPush)
              if (aCx <= bCx) {
                if (!a.locked) a.fitX -= (push * bMass) / total
                if (!b.locked) b.fitX += (push * aMass) / total
              } else {
                if (!a.locked) a.fitX += (push * bMass) / total
                if (!b.locked) b.fitX -= (push * aMass) / total
              }
            } else {
              const push = Math.min(ov.oy + 1, maxPush)
              if (aCy <= bCy) {
                if (!a.locked) a.fitY -= (push * bMass) / total
                if (!b.locked) b.fitY += (push * aMass) / total
              } else {
                if (!a.locked) a.fitY += (push * bMass) / total
                if (!b.locked) b.fitY -= (push * aMass) / total
              }
            }
            if (!a.locked) {
              freezeNode(a.node)
              a.node.style.setProperty('--art-fit-x', `${a.fitX}px`)
              a.node.style.setProperty('--art-fit-y', `${a.fitY}px`)
              void a.node.offsetWidth
              refreshBounds(a)
            }
            if (!b.locked) {
              freezeNode(b.node)
              b.node.style.setProperty('--art-fit-x', `${b.fitX}px`)
              b.node.style.setProperty('--art-fit-y', `${b.fitY}px`)
              void b.node.offsetWidth
              refreshBounds(b)
            }
          }
        }
        if (!hit) break
        if (iter > 0 && iter % 4 === 0) {
          for (const item of measured) {
            if (item.locked || item.layer.artistic.target.hero) continue
            item.fontScale = Math.max(0.55, item.fontScale * 0.92)
            item.node.style.setProperty(
              '--art-font-scale',
              String(item.fontScale),
            )
            void item.node.offsetWidth
            refreshBounds(item)
          }
        }
      }

      for (const item of measured) {
        if (item.locked) continue
        freezeNode(item.node)
        if (item.layer.artistic.target.hero) {
          const limX = Math.max(
            1,
            item.bounds.width * ARTISTIC_MAX_OVERFLOW_OF_TEXT,
          )
          const limY = Math.max(
            1,
            item.bounds.height * ARTISTIC_MAX_OVERFLOW_OF_TEXT,
          )
          let hx = 0
          let hy = 0
          if (item.bounds.left < rootRect.left - limX) {
            hx += rootRect.left - limX - item.bounds.left
          }
          if (item.bounds.right > rootRect.right + limX) {
            hx -= item.bounds.right - (rootRect.right + limX)
          }
          if (item.bounds.top < rootRect.top - limY) {
            hy += rootRect.top - limY - item.bounds.top
          }
          if (item.bounds.bottom > rootRect.bottom + limY) {
            hy -= item.bounds.bottom - (rootRect.bottom + limY)
          }
          if (hx || hy) {
            item.fitX += hx
            item.fitY += hy
            item.node.style.setProperty('--art-fit-x', `${item.fitX}px`)
            item.node.style.setProperty('--art-fit-y', `${item.fitY}px`)
            void item.node.offsetWidth
            refreshBounds(item)
          }
        } else {
          for (let step = 0; step < 6; step += 1) {
            const w = Math.max(1, item.bounds.width)
            const h = Math.max(1, item.bounds.height)
            const visW = Math.max(
              0,
              Math.min(item.bounds.right, rootRect.right) -
                Math.max(item.bounds.left, rootRect.left),
            )
            const visH = Math.max(
              0,
              Math.min(item.bounds.bottom, rootRect.bottom) -
                Math.max(item.bounds.top, rootRect.top),
            )
            const visibleRatio = (visW * visH) / (w * h)
            if (visibleRatio >= ARTISTIC_SUPPORT_MIN_VISIBLE_RATIO) break
            const cx = (item.bounds.left + item.bounds.right) / 2
            const cy = (item.bounds.top + item.bounds.bottom) / 2
            const rootCx = rootRect.left + rootRect.width / 2
            const rootCy = rootRect.top + rootRect.height / 2
            item.fitX += (rootCx - cx) * 0.28
            item.fitY += (rootCy - cy) * 0.28
            item.node.style.setProperty('--art-fit-x', `${item.fitX}px`)
            item.node.style.setProperty('--art-fit-y', `${item.fitY}px`)
            void item.node.offsetWidth
            refreshBounds(item)
          }
        }
        keepIntersecting(item)
      }

      if (!reflowingIds.size && !softFit)
        for (let step = 0; step < 2; step += 1) {
          const prev = measured.map((item) => ({
            fontScale: item.fontScale,
            fitX: item.fitX,
            fitY: item.fitY,
          }))
          for (const item of measured) {
            if (item.locked) continue
            const bump = item.layer.artistic.target.hero ? 1.04 : 1.025
            item.fontScale = Math.min(1.18, item.fontScale * bump)
            item.node.style.setProperty(
              '--art-font-scale',
              String(item.fontScale),
            )
          }
          for (const item of measured) {
            void item.node.offsetWidth
            refreshBounds(item)
          }
          let collided = false
          for (let i = 0; i < measured.length && !collided; i += 1) {
            for (let j = i + 1; j < measured.length; j += 1) {
              if (overlaps(measured[i].bounds, measured[j].bounds)) {
                collided = true
                break
              }
            }
          }
          const heroOverflow = measured.some((item) => {
            if (!item.layer.artistic.target.hero) return false
            const limX = Math.max(
              1,
              item.bounds.width * ARTISTIC_MAX_OVERFLOW_OF_TEXT,
            )
            const limY = Math.max(
              1,
              item.bounds.height * ARTISTIC_MAX_OVERFLOW_OF_TEXT,
            )
            const left = Math.max(0, rootRect.left - item.bounds.left)
            const right = Math.max(0, item.bounds.right - rootRect.right)
            const top = Math.max(0, rootRect.top - item.bounds.top)
            const bottom = Math.max(0, item.bounds.bottom - rootRect.bottom)
            return (
              left > limX + 0.5 ||
              right > limX + 0.5 ||
              top > limY + 0.5 ||
              bottom > limY + 0.5
            )
          })
          if (collided || heroOverflow) {
            measured.forEach((item, index) => {
              item.fontScale = prev[index].fontScale
              item.fitX = prev[index].fitX
              item.fitY = prev[index].fitY
              item.node.style.setProperty(
                '--art-font-scale',
                String(item.fontScale),
              )
              item.node.style.setProperty('--art-fit-x', `${item.fitX}px`)
              item.node.style.setProperty('--art-fit-y', `${item.fitY}px`)
              void item.node.offsetWidth
              refreshBounds(item)
            })
            break
          }
        }

      thawNodes()
      return true
    }

    const runFit = (): boolean => {
      if (gen !== fitGen.current) return false
      if (stage.clientWidth < 8 || stage.clientHeight < 8) return false
      applyTitleSize()

      if (content.useSlots) {
        return renderArtistic ? fitArtistic() : false
      }

      // 1 linha: só layers em measuring (nunca toca nos que estão saindo)
      const measuring = layersRef.current.filter((l) => l.phase === 'measuring')
      if (!measuring.length) return true
      let ok = true
      for (const layer of measuring) {
        const box = layerNodeRefs.current.get(layer.id)
        if (!box) {
          ok = false
          continue
        }
        if (!layer.wantLyrics) continue
        const lineEls = Array.from(
          box.querySelectorAll<HTMLElement>('.lyric-stage-line'),
        )
        if (lineEls.length && !fitPhrase(lineEls, box, layer.theme)) ok = false
      }
      return ok
    }

    const revealSlotLayers = () => {
      const entering = slotLayersRef.current.filter(
        (layer) => layer.phase === 'measuring',
      )
      const enterIds = new Set(entering.map((layer) => layer.id))
      if (!enterIds.size) return
      setSlotLayers((prev) =>
        prev.map((l) =>
          enterIds.has(l.id) && l.phase === 'measuring'
            ? { ...l, phase: 'enter' as const }
            : l,
        ),
      )
      const revealMs = Math.max(
        ARTISTIC_MOTION_MS,
        ...entering.map((layer) => {
          const blinkTail = layer.artistic.phrase.landBlink
            ? Math.ceil(ARTISTIC_MOTION_MS * 0.82) + 320
            : 0
          return (
            layer.artistic.enterDelayMs +
            Math.max(ARTISTIC_MOTION_MS, blinkTail) +
            48
          )
        }),
      )
      window.setTimeout(() => {
        setSlotLayers((prev) =>
          prev.map((l) =>
            enterIds.has(l.id) && l.phase === 'enter'
              ? { ...l, phase: 'shown' as const }
              : l,
          ),
        )
      }, revealMs)
    }

    const revealLayers = () => {
      const measuringIds = new Set(
        layersRef.current
          .filter((l) => l.phase === 'measuring')
          .map((l) => l.id),
      )
      if (!measuringIds.size) return

      const incoming = layersRef.current.find((l) => measuringIds.has(l.id))
      const animMs = Math.max(
        220,
        Math.min(Number(incoming?.theme.animationMs ?? theme.animationMs) || 400, 700),
      )
      const intervalMs = Math.max(
        0,
        Math.min(
          Number(incoming?.theme.animationIntervalMs ?? theme.animationIntervalMs) || 0,
          800,
        ),
      )

      const snapshotSizes = (layer: PhraseLayer): string[] => {
        const box = layerNodeRefs.current.get(layer.id)
        if (!box) return layer.lineFontSizes || []
        return Array.from(
          box.querySelectorAll<HTMLElement>('.lyric-stage-line'),
        ).map((el) => el.style.fontSize || '')
      }

      const startExit = () => {
        setLayers((prev) =>
          prev.map((l) => {
            if (measuringIds.has(l.id)) return l
            if (l.phase === 'exit') return l
            if (l.phase === 'shown' || l.phase === 'enter') {
              return {
                ...l,
                phase: 'exit' as const,
                lineFontSizes: snapshotSizes(l),
              }
            }
            return l
          }),
        )
      }

      const startEnter = () => {
        setLayers((prev) =>
          prev.map((l) =>
            measuringIds.has(l.id) && l.phase === 'measuring'
              ? { ...l, phase: 'enter' as const }
              : l,
          ),
        )
        window.setTimeout(() => {
          setLayers((prev) =>
            prev.map((l) =>
              measuringIds.has(l.id) && l.phase === 'enter'
                ? { ...l, phase: 'shown' as const }
                : l,
            ),
          )
        }, animMs)
      }

      // Intervalo 0: saída e entrada juntas (máxima sobreposição)
      if (intervalMs <= 0) {
        startExit()
        startEnter()
        return
      }

      // Intervalo > 0: saída primeiro; entrada entra depois (ambas ainda se sobrepõem)
      startExit()
      window.setTimeout(startEnter, intervalMs)
    }

    let cancelled = false
    let retryTimer = 0
    let retryCount = 0
    const MAX_FIT_RETRIES = 24

    const refitActiveLayers = () => {
      if (cancelled || gen !== fitGen.current) return
      if (stage.clientWidth < 8 || stage.clientHeight < 8) return
      applyTitleSize()

      if (content.useSlots) {
        if (renderArtistic) fitArtistic()
        return
      }

      const active = layersRef.current.filter(
        (l) =>
          l.phase === 'shown' ||
          l.phase === 'enter' ||
          l.phase === 'measuring',
      )
      for (const layer of active) {
        const box = layerNodeRefs.current.get(layer.id)
        if (!box || !layer.wantLyrics) continue
        const lineEls = Array.from(
          box.querySelectorAll<HTMLElement>('.lyric-stage-line'),
        )
        fitPhrase(lineEls, box, layer.theme)
      }
    }

    const finish = (ok: boolean) => {
      if (cancelled || gen !== fitGen.current) return
      if (!ok) {
        retryCount += 1
        if (retryCount >= MAX_FIT_RETRIES) {
          if (content.useSlots) revealSlotLayers()
          else revealLayers()
          return
        }
        window.clearTimeout(retryTimer)
        retryTimer = window.setTimeout(() => {
          if (cancelled || gen !== fitGen.current) return
          finish(runFit())
        }, 32)
        return
      }
      retryCount = 0
      if (content.useSlots) revealSlotLayers()
      else revealLayers()
    }

    const start = () => {
      void stage.offsetHeight
      finish(runFit())
    }

    lastStageSize.current = { w: stage.clientWidth, h: stage.clientHeight }

    const measuringKey = content.useSlots
      ? measuringSlotsKey
      : measuringLayersKey
    const needsFit = Boolean(measuringKey)

    if (needsFit) {
      // Fit immediately with the available face; loadingdone refits custom fonts.
      start()
    } else if (!(renderArtistic && content.useSlots)) {
      // 1 linha: recalcula tamanho (lyricSizeVw, margens…)
      const startRefit = () => {
        void stage.offsetHeight
        refitActiveLayers()
      }
      startRefit()
    }
    // Artístico sem measuring: não refit no fim do reflow (travava o frame final).

    const onFontsDone = () => {
      if (cancelled || gen !== fitGen.current) return
      if (measuringKey) {
        if (!runFit()) return
        if (content.useSlots) revealSlotLayers()
        else revealLayers()
      } else if (!(renderArtistic && content.useSlots)) {
        refitActiveLayers()
      }
    }
    document.fonts?.addEventListener?.('loadingdone', onFontsDone)

    let resizeTimer = 0
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      const w = entry?.contentRect?.width ?? stage.clientWidth
      const h = entry?.contentRect?.height ?? stage.clientHeight
      if (
        Math.abs(w - lastStageSize.current.w) < 2 &&
        Math.abs(h - lastStageSize.current.h) < 2
      ) {
        return
      }
      lastStageSize.current = { w, h }
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        if (cancelled || gen !== fitGen.current) return
        refitActiveLayers()
      }, 80)
    })
    ro.observe(stage)

    return () => {
      cancelled = true
      window.clearTimeout(retryTimer)
      window.clearTimeout(resizeTimer)
      document.fonts?.removeEventListener?.('loadingdone', onFontsDone)
      ro.disconnect()
    }
  }, [
    content.copyKey,
    content.useSlots,
    content.artisticPlanKey,
    content.slots.length,
    content.wantLyrics,
    content.wantTitle,
    content.wantArtist,
    content.title,
    content.artist,
    measuringLayersKey,
    activeLayersFitKey,
    measuringSlotsKey,
    activeSlotsFitKey,
    artisticSettlingFitKey,
    stageThemeFitKey,
    theme.lyricSizeVw,
    theme.titleSizeVw,
    theme.rotationDeg,
    theme.fontFamily,
    theme.phraseFontFamily,
    theme.fontWeight,
    theme.offsetXPct,
    theme.offsetYPct,
    theme.titleOffsetXPct,
    theme.titleOffsetYPct,
    theme.letterSpacingEm,
    theme.uppercase,
    theme.lineHeight,
    theme.animationMs,
    theme.animationIntervalMs,
    safeArea?.top,
    safeArea?.right,
    safeArea?.bottom,
    safeArea?.left,
    wrapLines,
    contained,
    programOn,
    renderArtistic,
  ])

  const slotCount = slotLayers.filter((l) => l.phase !== 'exit').length

  return (
    <div
      ref={stageRef}
      className={`lyric-stage ${programOn ? '' : 'is-black'} ${contained ? 'is-contained' : ''} ${content.useSlots ? 'has-slots' : ''} ${renderArtistic ? 'is-artistic' : ''} ${safeArea ? 'has-safe' : ''} ${stageWraps ? 'wrap-lines' : ''} ${className}`.trim()}
      style={style}
      data-theme={theme.id}
      data-content-family={contentFamily}
    >
      {badge ? <div className="lyric-stage-badge">{badge}</div> : null}

      <div className={`lyric-stage-program ${programOn ? 'is-on' : 'is-off'}`}>
        {spectrumEffective?.enabled && spectrumEffective.placement === 'background' ? (
          <SpectrumLayer
            config={spectrumEffective}
            cameraDeviceId={cameraDeviceId}
            mediaLive={hasAvPlayer}
            hasCaption={Boolean(
              showCam && cameraForeground && cameraCaption?.trim(),
            )}
          />
        ) : null}
        {hasImage ? (
          <img
            key={`${mediaPath || ''}-${mediaPlayback.seekSeq || 0}`}
            className={`lyric-stage-media${
              isWebCaptureFrame ? ' is-nav-capture' : ''
            }`}
            src={mediaUrl!}
            alt=""
            draggable={false}
            style={isWebCaptureFrame ? undefined : { objectFit: mediaFit }}
          />
        ) : null}
        {hasAvPlayer ? (
          <MediaPlayer
            src={mediaPath}
            playback={mediaPlaybackEffective}
            forceMuted={mediaForceMuted || !visible}
            mediaFit={mediaFit}
            className={`lyric-stage-media-player${
              mediaKind === 'audio' ? ' is-audio-only' : ''
            }`}
            onTime={onMediaTime}
            ensureAudioGraph={Boolean(
              spectrumEffective?.enabled &&
                spectrumEffective.source === 'media' &&
                visible &&
                !mediaForceMuted,
            )}
          />
        ) : null}
        {hasWebEmbed && webEmbedSrc && isYoutubeEmbed ? (
          <iframe
            key={mediaPath || mediaUrl || 'web'}
            ref={webIframeRef}
            className={`lyric-stage-media lyric-stage-web-embed${
              mediaInteractive ? '' : ' is-mirror'
            }`}
            src={webEmbedSrc}
            title={title || 'Web'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              const win = webIframeRef.current?.contentWindow
              if (!win) return
              const volume = Math.round(
                Math.max(0, Math.min(1, mediaPlaybackEffective.volume ?? 1)) * 100,
              )
              youtubeCommand(win, webMuted ? 'mute' : 'unMute')
              youtubeCommand(win, 'setVolume', [volume])
              youtubeCommand(
                win,
                mediaPlaybackEffective.playing === false
                  ? 'pauseVideo'
                  : 'playVideo',
              )
            }}
          />
        ) : null}
        {hasDeckScroll ? (
          <DeckScrollCrop
            slidePaths={deckScrollPaths}
            scrollRatio={mediaScrollRatio}
            className="lyric-stage-deck-crop"
          />
        ) : hasDeck && mediaUrl ? (
          <img className="lyric-stage-media" src={mediaUrl} alt="" draggable={false} />
        ) : hasDeck ? (
          <div className="lyric-stage-deck">
            <strong>Apresentação</strong>
          </div>
        ) : null}

        {showThemeVideo ? (
          <video
            className="lyric-stage-media lyric-stage-theme-bg"
            src={themeVideoUrl!}
            autoPlay
            muted
            loop
            playsInline
            draggable={false}
          />
        ) : null}
        {showThemeImage ? (
          <img
            className="lyric-stage-media lyric-stage-theme-bg"
            src={themeImageUrl!}
            alt=""
            draggable={false}
          />
        ) : null}

        {showCam ? (
          <CameraFeed
            deviceId={cameraDeviceId}
            mirrored={mirroredCamera}
            audio={cameraAudio && visible}
            voiceIsolate={cameraVoiceIsolate}
            forceMuted={mediaForceMuted || !visible}
            className={`lyric-stage-camera${cameraForeground ? ' is-program-camera' : ''}`}
          />
        ) : showEmptyBg ? (
          <div className="lyric-stage-empty-bg" />
        ) : null}

        <div className="lyric-stage-content is-on">
          {/* Clip = margens da tela — fit/nudge com rotação */}
          <div ref={fitClipRef} className="lyric-fit-clip" aria-hidden />

          {(() => {
              const showMeta = content.wantTitle || content.wantArtist
              const v =
                theme.vertical === 'top' || theme.vertical === 'bottom'
                  ? theme.vertical
                  : 'center'
              const anchorClass = [
                'lyric-stage-anchor',
                showMeta ? 'has-title' : 'no-title',
                showMeta ? `v-${v}` : '',
              ]
                .filter(Boolean)
                .join(' ')
              const titleVars = {
                ...themeToCssVars(theme, unitMode),
              } as CSSProperties

              return (
                <>
                {/*
                 * O título/referência NÃO mora na caixa de texto do tema.
                 * Ele é posicionado na área liberada pela saída — a mesma
                 * referência que o editor de tema usa. A margem do tema
                 * delimita a LETRA; prender o título a ela fazia o mesmo
                 * número render posições diferentes no editor e na projeção.
                 */}
                {showMeta ? (
                  <div className="lyric-stage-title-area" style={titleVars}>
                    <div
                      ref={titleCellRef}
                      className={`lyric-stage-title-cell${
                        content.onCamera ? ' on-camera' : ''
                      }`}
                    >
                      {content.wantTitle ? (
                        <div className="lyric-stage-title">
                          {content.title}
                        </div>
                      ) : null}
                      {content.wantArtist ? (
                        <div className="lyric-stage-artist">
                          {content.artist}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="lyric-stage-phrase-area">
                <div className={anchorClass} style={titleVars}>
                  <div className="lyric-stage-lyrics-cell">
                    {content.useSlots && content.wantLyrics ? (
                      <div
                        ref={slotsRootRef}
                        className={`lyric-stage-slots ${content.onCamera ? 'on-camera' : ''}`}
                        data-count={slotCount}
                      >
                        {slotLayers.map((layer) => {
                          const exitAnim = animExitClass(layer.theme.animation)
                          const phaseClass =
                            layer.phase === 'measuring'
                              ? 'is-measuring'
                              : layer.phase === 'exit'
                                ? 'is-exiting'
                                : layer.phase === 'enter'
                                  ? 'is-entering'
                                  : 'is-shown'
                          const art = layer.artistic
                          const target = art.target
                          const isPivoting =
                            layer.reflow === 'shrinking' &&
                            (target.orientation === 'portrait-stack' ||
                              target.motionRecipeHint === 'pivot-canto')
                          const reflowClass = layer.reflow
                            ? isPivoting
                              ? 'is-pivoting is-shrinking'
                              : `is-${layer.reflow}`
                            : ''
                          const pivotOrigin =
                            target.anchor === 'tr'
                              ? '100% 0%'
                              : target.anchor === 'tl'
                                ? '0% 0%'
                                : target.anchor === 'br'
                                  ? '100% 100%'
                                  : target.anchor === 'bl'
                                    ? '0% 100%'
                                    : target.anchor === 'edge-right'
                                      ? '100% 50%'
                                      : target.anchor === 'edge-left'
                                        ? '0% 50%'
                                        : '50% 100%'
                          const motionAnim =
                            layer.reflow
                              ? ''
                              : layer.phase === 'exit' && layer.sequenceExit
                                ? ''
                              : layer.phase === 'enter'
                              ? [
                                  artisticEnterClass(art.phrase.enterEffect),
                                  art.phrase.landBlink ? 'has-land-blink' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')
                              : layer.phase === 'shown'
                                ? // Mantém classe de enter sem animar de novo (CSS zera animation).
                                  artisticEnterClass(art.phrase.enterEffect)
                              : layer.phase === 'exit' &&
                                  art.exitMode === 'block'
                                ? exitAnim
                                : ''
                          const artisticStyle = {
                            ...themeToCssVars(layer.theme, unitMode),
                            // Artístico: tempos próprios (ignora animationMs do tema).
                            '--art-motion-ms': `${ARTISTIC_MOTION_MS}ms`,
                            '--theme-anim-ms': `${ARTISTIC_MOTION_MS}ms`,
                            '--art-enter-delay': `${art.enterDelayMs}ms`,
                            '--art-enter-rotation': `${target.rotationDeg < 0 ? 2.5 : -2.5}deg`,
                            '--art-pivot-origin': pivotOrigin,
                            '--art-exit-from-opacity': String(
                              target.opacity ?? (target.hero ? 1 : 0.6),
                            ),
                            left: `${target.x}%`,
                            top: `${target.y}%`,
                            width: `${target.width}%`,
                            height: `${target.height}%`,
                            fontSize: `${target.fontVw}${contained ? 'cqw' : 'vw'}`,
                            opacity:
                              layer.sequenceExit
                                ? undefined
                                : target.opacity ?? (target.hero ? 1 : 0.6),
                            transform: `translate(var(--art-fit-x, 0px), var(--art-fit-y, 0px)) rotate(${target.rotationDeg}deg) scale(var(--art-box-scale, 1))`,
                            transformOrigin: isPivoting
                              ? 'var(--art-pivot-origin, 50% 100%)'
                              : 'center center',
                            textAlign: target.align,
                            '--art-justify':
                              target.align === 'left'
                                ? 'flex-start'
                                : target.align === 'right'
                                  ? 'flex-end'
                                  : 'center',
                            '--art-scale-origin':
                              target.align === 'left'
                                ? 'left center'
                                : target.align === 'right'
                                  ? 'right center'
                                  : 'center center',
                            zIndex: target.zIndex,
                          } as CSSProperties
                          return (
                            <div
                              key={layer.id}
                              ref={(el) => {
                                if (el) {
                                  layerNodeRefs.current.set(layer.id, el)
                                } else {
                                  layerNodeRefs.current.delete(layer.id)
                                }
                              }}
                              className={`artistic-phrase artistic-phrase-layer ${target.hero ? 'is-hero' : ''} ${target.stamp ? 'is-stamp' : ''} ${target.orientation === 'portrait-stack' ? 'is-portrait-stack' : ''} ${phaseClass} ${reflowClass} ${layer.settling ? 'is-settling' : ''} ${layer.sequenceExit ? 'is-sequence-exit' : ''}`.trim()}
                              data-content-id={layer.contentId}
                              data-phase={layer.phase}
                              data-reflow={layer.reflow || undefined}
                              data-variation={art.variationId}
                              style={artisticStyle}
                            >
                              <div
                                className={`artistic-phrase-motion ${motionAnim}`.trim()}
                              >
                                <div className="artistic-blocks">
                                  {art.phrase.blocks.map((block) => {
                                    const individualExit =
                                      layer.phase === 'exit' &&
                                      !layer.sequenceExit &&
                                      art.exitMode === 'individual'
                                    const blockStyle = {
                                      '--art-block-scale': String(block.scale),
                                      '--art-block-weight': String(block.weight),
                                      '--art-exit-delay': `${block.exitDelayMs}ms`,
                                      ...(block.keyword
                                        ? {
                                            '--art-keyword-color':
                                              'var(--theme-title-color, #ffe08a)',
                                          }
                                        : null),
                                      ...(block.color
                                        ? { '--art-block-color': block.color }
                                        : null),
                                      ...(block.fontFamily
                                        ? { '--art-block-font-family': block.fontFamily }
                                        : null),
                                    } as CSSProperties
                                    return (
                                      <Fragment key={block.id}>
                                        <span
                                          className={`artistic-block ${block.keyword ? 'is-keyword' : ''} ${
                                            block.fullLine ? 'is-line' : ''
                                          } ${
                                            individualExit
                                              ? `artistic-exit-${block.exitEffect}`
                                              : ''
                                          }`.trim()}
                                          style={blockStyle}
                                        >
                                          {block.words.map((word, wordIndex) => (
                                            <span
                                              key={`${block.id}-w-${wordIndex}`}
                                              className={`artistic-word ${word.keyword ? 'is-keyword' : ''}`.trim()}
                                            >
                                              {wordIndex > 0 ? ' ' : ''}
                                              {word.text}
                                            </span>
                                          ))}
                                        </span>
                                        {block.breakAfter ? (
                                          <span
                                            className="artistic-flex-break"
                                            aria-hidden
                                          />
                                        ) : null}
                                      </Fragment>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      layers.map((layer) => {
                        const rotated =
                          Math.abs(Number(layer.theme.rotationDeg) || 0) > 0.01
                        const enterAnim = animClass(layer.theme.animation)
                        const exitAnim = animExitClass(layer.theme.animation)
                        const layerStyle = {
                          ...themeToCssVars(layer.theme, unitMode),
                          '--theme-anim-ms': `${Math.max(220, Math.min(Number(layer.theme.animationMs) || 400, 700))}ms`,
                        } as CSSProperties
                        const phaseClass =
                          layer.phase === 'measuring'
                            ? 'is-measuring'
                            : layer.phase === 'exit'
                              ? 'is-exiting'
                              : layer.phase === 'enter'
                                ? 'is-entering'
                                : 'is-shown'
                        const innerAnim =
                          layer.phase === 'enter'
                            ? enterAnim
                            : layer.phase === 'exit'
                              ? exitAnim
                              : undefined
                        return (
                          <div
                            key={layer.id}
                            ref={(el) => {
                              if (el) layerNodeRefs.current.set(layer.id, el)
                              else layerNodeRefs.current.delete(layer.id)
                            }}
                            className={`lyric-stage-copy lyric-slide-layer ${layer.onCamera ? 'on-camera' : ''} ${rotated ? 'is-rotated' : ''} ${phaseClass}`.trim()}
                            style={layerStyle}
                            data-layer={layer.id}
                            data-phase={layer.phase}
                          >
                            <div className="lyric-stage-stack">
                              <div
                                className={`lyric-stage-lines-viewport${
                                  innerAnim ? ` ${innerAnim}` : ''
                                }`}
                              >
                                {layer.wantLyrics
                                  ? layer.lines.map((line, i) => (
                                      <p
                                        key={`${i}-${line.slice(0, 40)}`}
                                        className={`lyric-stage-line${
                                          wrapLines || layer.theme.wrapLines
                                            ? ' is-wrapping'
                                            : ''
                                        }`}
                                        style={
                                          layer.phase === 'exit' &&
                                          layer.lineFontSizes?.[i]
                                            ? {
                                                fontSize:
                                                  layer.lineFontSizes[i],
                                              }
                                            : undefined
                                        }
                                      >
                                        {line}
                                      </p>
                                    ))
                                  : null}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
                </div>
                </>
              )
            })()}
        </div>
        {showCam && cameraForeground && cameraCaption?.trim() ? (
          <div className="lyric-stage-camera-caption">
            {cameraCaption.trim()}
          </div>
        ) : null}
        {spectrumEffective?.enabled && spectrumEffective.placement === 'hud' ? (
          <SpectrumLayer
            config={spectrumEffective}
            cameraDeviceId={cameraDeviceId}
            mediaLive={hasAvPlayer}
            hasCaption={Boolean(
              showCam && cameraForeground && cameraCaption?.trim(),
            )}
          />
        ) : null}
      </div>
      <div
        key={familyFadeGen > 0 ? `family-fade-${familyFadeGen}` : 'family-fade-idle'}
        className={`lyric-stage-family-veil${familyFadeGen > 0 ? ' is-running' : ''}`}
        aria-hidden
      />
    </div>
  )
}
