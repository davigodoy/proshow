import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  DisplayInfo,
  LiveKind,
  LiveState,
  PhraseStyle,
  ProjectionTheme,
  QuickMediaItem,
  ThemeAnimation,
} from '../projection'
import {
  ANIMATION_OPTIONS,
  BUILTIN_THEMES,
} from '../theme/presets'
import {
  phraseThemeOverride,
  resolvePhraseTheme,
  resolveThemesForIndices,
  nextArtisticStack,
  withSongUppercase,
} from '../theme/resolve'
import { resolveActiveTheme, hydrateThemeMedia, andThemeShowGates } from '../theme/activeTheme'
import { LyricStage } from '../components/LyricStage'
import { ThemeStudioPreview, ThemeEditor, ThemeStageExtras, type ThemeEditTarget } from '../components/ThemeEditor'
import { OutputSafeAreaEditor } from '../components/OutputSafeAreaEditor'
import { SongEditor } from '../components/SongEditor'
import { ConfirmModal } from '../components/ConfirmModal'
import {
  allowedSlideIndices,
  flattenSections,
  resolveSections,
  type LyricSection,
} from '../lyrics/songSections'
import {
  BiblePanel,
  type BibleItem,
  type BiblePanelHandle,
} from '../components/BiblePanel'
import {
  effectiveSafeArea,
  outputMaskClipPath,
  type ThemeSafeArea,
} from '../theme/safeArea'
import { resolveSizeMode, shouldSplitOverflow } from '../theme/sizeMode'
import { createFitPredicate, fixedFontPx } from '../theme/measureFit'
import {
  deriveSlides,
  identityDerived,
  partLabel,
  remapIndex,
  type DerivedSlides,
} from '../theme/derivedSlides'
import {
  normalizeArtisticKeywords,
} from '../theme/artisticLayout'
import {
  COMPOSITION_LAYOUT_VERSION,
  resolveCachedArtisticPlan,
  type CompositionCache,
} from '../artistic/composition'
import {
  releaseAllCameraStreams,
  sleep,
} from '../camera/sharedStream'
import {
  DEFAULT_PLAYBACK,
  MediaTransport,
  type MediaPlayback,
} from '../components/MediaPlayer'
import { toMediaUrl } from '../mediaUrl'
import { toastAlert, toastInfo } from '../toast'
import {
  WebBrowsePane,
  type WebBrowseHandle,
} from '../components/WebBrowsePane'
import {
  DEFAULT_SPECTRUM,
  normalizeSpectrum,
  SpectrumControls,
  type SpectrumConfig,
} from '../spectrum'
import {
  DEFAULT_AUTO_ADVANCE,
  normalizeAutoAdvance,
  AutoAdvanceControls,
  useAutoAdvance,
  priorForCandidate,
  type AutoAdvanceConfig,
  type AutoLineCandidate,
  type AutoGoLiveTarget,
} from '../auto-advance'
import '../components/lyric-stage.css'
import '../components/theme-editor.css'
import '../components/bible-panel.css'
import '../components/media-player.css'
import '../components/song-editor.css'
import './operator.css'

type PlanItem = {
  id: string
  /** id estável da biblioteca (para salvar estilos) */
  libraryId?: string
  kind: LiveKind
  label: string
  lines: string[]
  /** Seções da letra (verso/refrão/…); opcional — Auto infere se faltar. */
  sections?: LyricSection[] | null
  title?: string
  artist?: string
  source?: string
  cameraDeviceId?: string | null
  /** Nome da pessoa exibido no canto inferior da câmera principal. */
  cameraCaption?: string | null
  /** Áudio da câmera passa pelo isolamento de voz. */
  mediaVoiceIsolate?: boolean
  mediaPath?: string | null
  mediaKind?: 'image' | 'video' | 'audio' | 'deck' | 'file' | 'web' | null
  /** Como a imagem preenche o quadro (só kind==='image'). */
  mediaFit?: 'contain' | 'cover' | 'fill' | null
  /** Caminhos de imagem por slide (PPT/PDF) */
  slidePaths?: Array<string | null>
  /** URL de site / página (kind web) */
  webUrl?: string | null
  /** Observação livre do item, vinda da biblioteca. */
  note?: string
  phraseStyles?: Array<PhraseStyle | null>
  /** Tema nomeado padrão da música (todas as frases sem override) */
  themeId?: string | null
  /** null = herdar tema; true/false = forçar */
  uppercase?: boolean | null
  /** Mídia de fundo temporária desta música (sobrepõe o fundo do tema) */
  bgMediaPath?: string | null
  bgMediaKind?: 'image' | 'video' | null
}

type CameraEditDraft = {
  itemId: string | null
  editLive: boolean
  deviceId: string
  caption: string
  voiceIsolate: boolean
}

const FALLBACK_LIBRARY: PlanItem[] = [
  {
    id: 'l1',
    kind: 'lyrics',
    label: 'Grande é o Senhor',
    lines: ['Grande é o Senhor\ne mui digno de louvor', 'Na cidade do nosso Deus'],
  },
  {
    id: 'b1',
    kind: 'bible',
    label: 'Salmos 23:1–2',
    lines: ['O Senhor é o meu pastor;\nnada me faltará.', 'Deitar-me faz em verdes pastos…'],
  },
]

type Props = {
  live: LiveState
  theme: ProjectionTheme
  bibleTheme: ProjectionTheme
  bibleThemeId: string | null
  /** Limite externo da projeção; a margem do tema recorta dentro dele. */
  outputSafeArea: ThemeSafeArea
  onLiveChange: (next: Partial<LiveState>) => void
  onThemeChange: (theme: ProjectionTheme) => void
  onBibleThemeIdChange: (themeId: string | null) => void
  onBibleShowChange: (next: {
    bibleShowTitle?: boolean
    bibleShowLyrics?: boolean
  }) => void
}

/** Minúsculo e sem acentos, pra busca/comparação tolerante. */
function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function slideLines(slide: string | undefined): string[] {
  if (!slide) return []
  return String(slide)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function linesForItem(item: PlanItem, idx: number): string[] {
  if (item.kind === 'camera') return ['[ câmera ao vivo ]']
  return slideLines(item.lines[idx] ?? item.lines[0])
}

function songKey(item: PlanItem) {
  return item.libraryId || item.id.replace(/-\d{10,}$/, '') || item.id
}

function applyFontCss(css: string) {
  let el = document.getElementById('ible-imported-fonts') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'ible-imported-fonts'
    document.head.appendChild(el)
  }
  el.textContent = css || ''
}

const ARTISTIC_KEYWORDS_STORAGE = 'ible-projection:artistic-keywords'
const ARTISTIC_MODE_STORAGE = 'ible-projection:artistic-mode'
const ARTISTIC_MAX_STORAGE = 'ible-projection:artistic-mode-max'
const RECENT_BG_MEDIA_STORAGE = 'ible-projection:recent-bg-media'
const RECENT_BG_MEDIA_MAX = 8

type RecentBgMedia = { path: string; kind: 'image' | 'video' }

function loadRecentBgMedia(): RecentBgMedia[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_BG_MEDIA_STORAGE) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter(
      (v): v is RecentBgMedia =>
        v && typeof v.path === 'string' && (v.kind === 'image' || v.kind === 'video'),
    )
  } catch {
    return []
  }
}

function saveRecentBgMedia(list: RecentBgMedia[]) {
  try {
    localStorage.setItem(RECENT_BG_MEDIA_STORAGE, JSON.stringify(list))
  } catch {
    // ignore
  }
}

function loadArtisticKeywords(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(ARTISTIC_KEYWORDS_STORAGE) || '[]')
    return Array.isArray(value)
      ? normalizeArtisticKeywords(value.map((item) => String(item)))
      : []
  } catch {
    return []
  }
}

function saveArtisticKeywords(values: string[]): string[] {
  const normalized = normalizeArtisticKeywords(values)
  try {
    localStorage.setItem(ARTISTIC_KEYWORDS_STORAGE, JSON.stringify(normalized))
  } catch {
    // O plano continua funcionando sem persistência se o storage estiver indisponível.
  }
  return normalized
}

function loadStackArtistic(): boolean {
  try {
    return localStorage.getItem(ARTISTIC_MODE_STORAGE) === '1'
  } catch {
    return false
  }
}

function saveStackArtistic(on: boolean) {
  try {
    localStorage.setItem(ARTISTIC_MODE_STORAGE, on ? '1' : '0')
  } catch {
    // ignore
  }
  void window.projection?.setOutputConfig?.({ stackArtistic: on })
}

function loadStackArtisticMax(): boolean {
  try {
    return localStorage.getItem(ARTISTIC_MAX_STORAGE) === '1'
  } catch {
    return false
  }
}

function saveStackArtisticMax(on: boolean) {
  try {
    localStorage.setItem(ARTISTIC_MAX_STORAGE, on ? '1' : '0')
  } catch {
    // ignore
  }
  void window.projection?.setOutputConfig?.({ stackArtisticMax: on })
}

/**
 * Quadro de referência da medição. Nominal de propósito: como o tamanho é
 * proporcional (vw), medir contra 1920×1080 faz a lista do operador e a saída
 * concordarem sempre — medir contra o elemento de preview, que tem outro
 * tamanho em pixels, faria as duas discordarem.
 */
const NOMINAL_STAGE_W = 1920
const NOMINAL_STAGE_H = 1080

/**
 * Slides que o operador realmente navega, já repartidos conforme o tema.
 * Só o modo fixo reparte; preencher e tema legado encolhem, como antes.
 */
function deriveSlidesForTheme(
  lines: readonly string[],
  theme: ProjectionTheme,
  outputSafeArea: ThemeSafeArea | null,
): DerivedSlides {
  if (!shouldSplitOverflow(theme)) return identityDerived(lines)
  const mode = resolveSizeMode(theme)
  if (mode.kind !== 'fixed') return identityDerived(lines)

  // Base composta: a margem da saída também aperta o espaço, então a contagem
  // de partes muda com ela — é consequência do modelo, não defeito.
  const area = effectiveSafeArea(theme, outputSafeArea)
  const maxWidth =
    (NOMINAL_STAGE_W * (100 - (area?.left ?? 0) - (area?.right ?? 0))) / 100
  const maxHeight =
    (NOMINAL_STAGE_H * (100 - (area?.top ?? 0) - (area?.bottom ?? 0))) / 100

  const fits = createFitPredicate({
    fontPx: fixedFontPx(NOMINAL_STAGE_W, mode.vw),
    fontFamily: theme.phraseFontFamily || theme.fontFamily,
    fontWeight: Number(theme.fontWeight) || 400,
    letterSpacingEm: Number(theme.letterSpacingEm) || 0,
    lineHeight: Number(theme.lineHeight) || 1.2,
    maxWidth,
    maxHeight,
    maxLines: Number(theme.maxLines) || 0,
    uppercase: Boolean(theme.uppercase),
  })
  return deriveSlides(lines, fits, true)
}

/** Item com as linhas derivadas — o que vai ao ar, ao overlay e ao NDI. */
function withDerivedLines(item: PlanItem, derived: DerivedSlides): PlanItem {
  if (derived.lines.length === item.lines.length) return item
  return {
    ...item,
    lines: derived.lines,
    // phraseStyles continua indexado pela linha ESCRITA: reindexa para as partes.
    phraseStyles: item.phraseStyles
      ? derived.sourceIndex.map((i) => item.phraseStyles?.[i] ?? null)
      : item.phraseStyles,
  }
}

function displayLinesFor(
  item: PlanItem,
  idx: number,
  artisticStack: boolean,
  stackOrder?: number[],
): string[] {
  if (item.kind === 'camera') return ['[ câmera ao vivo ]']
  if (item.kind !== 'lyrics' || !artisticStack) return linesForItem(item, idx)
  const indices =
    stackOrder && stackOrder.length ? stackOrder : [idx]
  const out: string[] = []
  for (const i of indices) {
    out.push(...slideLines(item.lines[i] ?? ''))
  }
  return out
}

function displayPhraseSlots(
  item: PlanItem,
  stackOrder: number[],
  artisticStack: boolean,
): string[] | null {
  if (!artisticStack || item.kind !== 'lyrics') return null
  if (!stackOrder.length) return null
  return stackOrder.map((i) => item.lines[i] || '')
}

/** PDF/deck/imagem: coluna vira visualização rolável (desktop alto). */
function isYoutubeWebItem(item: PlanItem | null | undefined): boolean {
  if (!item || item.kind !== 'web') return false
  return /youtube\.com|youtu\.be/i.test(
    String(item.webUrl || item.mediaPath || ''),
  )
}

/** Site (não YouTube): navega na coluna de detalhe como o PDF. */
function isWebBrowseItem(item: PlanItem | null | undefined): boolean {
  return Boolean(item && item.kind === 'web' && !isYoutubeWebItem(item))
}

function isDocumentScrollItem(item: PlanItem | null | undefined): boolean {
  if (!item) return false
  if (item.kind === 'deck' || item.kind === 'file') return true
  if (item.kind === 'image') {
    return Boolean(item.mediaPath || item.slidePaths?.length)
  }
  return false
}

function documentSlidePaths(item: PlanItem | null | undefined): Array<string | null> | null {
  if (!item) return null
  if (item.slidePaths?.length) return item.slidePaths
  if (item.kind === 'image' && item.mediaPath) return [item.mediaPath]
  if (item.kind === 'web' && (item.webUrl || item.mediaPath)) {
    return [item.webUrl || item.mediaPath || null]
  }
  return null
}

function formatMediaDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function fileName(p: string): string {
  return p.split(/[/\\]/).pop() || p
}

function mediaFileExt(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return ''
  const clean = pathOrUrl.split('?')[0] || pathOrUrl
  const base = clean.split('/').pop() || clean
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot + 1).toUpperCase() : ''
}

function detailColumnHeading(
  item: PlanItem | null | undefined,
  biblePreviewActive: boolean,
): string {
  if (biblePreviewActive) return 'Bíblia'
  if (!item) return 'Detalhe'
  switch (item.kind) {
    case 'lyrics':
      return 'Música'
    case 'deck':
      return 'Apresentação'
    case 'camera':
      return 'Câmera'
    case 'video':
      return 'Vídeo'
    case 'audio':
      return 'Áudio'
    case 'image':
      return 'Imagem'
    case 'web':
      return 'Site'
    case 'file':
      return 'Arquivo'
    case 'bible':
      return 'Bíblia'
    default:
      return 'Detalhe'
  }
}

function buildSlotThemes(
  item: PlanItem,
  stackOrder: number[],
  base: ProjectionTheme,
  themes: ProjectionTheme[],
  stackOn: boolean,
): ProjectionTheme[] | null {
  if (!stackOn || item.kind !== 'lyrics') return null
  if (!stackOrder.length) return null
  return resolveThemesForIndices(
    base,
    themes,
    stackOrder,
    item.phraseStyles,
    item.themeId,
    item.uppercase,
  ).map((t) => hydrateThemeMedia(t, themes))
}

export function Operator({
  live,
  theme,
  bibleTheme,
  bibleThemeId,
  outputSafeArea,
  onLiveChange,
  onThemeChange,
  onBibleThemeIdChange,
  onBibleShowChange,
}: Props) {
  const [tab, setTab] = useState<'show' | 'temas' | 'saidas'>('show')
  const [outputAreaDraft, setOutputAreaDraft] = useState<ThemeSafeArea | null>(
    null,
  )
  /**
   * Margem da saída em vigor no operador. Durante o arrasto vale o rascunho,
   * para preview, AO VIVO e estúdio de tema acompanharem o handle na hora;
   * ao soltar, o valor confirmado volta pelo main e o rascunho sai de cena.
   */
  const outputAreaValue = outputAreaDraft ?? outputSafeArea
  const [library, setLibrary] = useState<PlanItem[]>(FALLBACK_LIBRARY)
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [previewId, setPreviewId] = useState<string | undefined>()
  const [previewSlide, setPreviewSlide] = useState(0)
  /** Linha que está de fato projetada — o Preview pode estar à frente dela. */
  const [liveSlot, setLiveSlot] = useState<{
    itemId: string
    idx: number
  } | null>(null)
  /** Música sendo só navegada na lib (seta) — ainda não entrou no plano do culto. */
  const [browsingItem, setBrowsingItem] = useState<PlanItem | null>(null)
  /** Slots rápidos (Show → ao vivo): vídeo/imagem pré-selecionados pra ir ao ar num clique */
  const [quickVideoItem, setQuickVideoItem] = useState<PlanItem | null>(null)
  const [quickImageItem, setQuickImageItem] = useState<PlanItem | null>(null)
  const [biblePreview, setBiblePreview] = useState<BibleItem | null>(null)
  /**
   * Partes do intervalo bíblico no ar. A Bíblia projeta o intervalo inteiro
   * numa tela só; quando ele não cabe no tema, vira mais de uma parte, e o
   * Enter consome as partes antes de avançar para o próximo intervalo.
   */
  const biblePartsRef = useRef<DerivedSlides | null>(null)
  const biblePartIdxRef = useRef(0)
  /** Parte da Bíblia no ar — destaca na lista e permite voltar. */
  const [biblePartIdx, setBiblePartIdx] = useState(0)
  /** Parte armada no Preview (1 clique), como nas frases da música. */
  const [biblePreviewPart, setBiblePreviewPart] = useState(0)
  /** Id do intervalo que está no ar — o do Preview muda a cada verso clicado. */
  const [bibleLiveId, setBibleLiveId] = useState<string | null>(null)
  const bibleRef = useRef<BiblePanelHandle | null>(null)
  const phrasesRef = useRef<HTMLDivElement | null>(null)
  /** Painéis navegáveis por Tab: Biblioteca / Navegador (frases) / Programa do culto. */
  const libraryZoneRef = useRef<HTMLElement | null>(null)
  const planZoneRef = useRef<HTMLElement | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [overlayUrl, setOverlayUrl] = useState('http://127.0.0.1:8787/overlay')
  const [mode, setMode] = useState('single')
  const [displayId, setDisplayId] = useState<number | null>(null)
  /** Sem janela de apresentação — só Preview / AO VIVO */
  const [simulation, setSimulation] = useState(true)
  const [refreshingDisplays, setRefreshingDisplays] = useState(false)
  const [ndiEnabled, setNdiEnabled] = useState(false)
  const [ndiBusy, setNdiBusy] = useState(false)
  const [spectrum, setSpectrum] = useState<SpectrumConfig>(DEFAULT_SPECTRUM)
  const [autoAdvance, setAutoAdvance] =
    useState<AutoAdvanceConfig>(DEFAULT_AUTO_ADVANCE)
  const [autoSuppressUntil, setAutoSuppressUntil] = useState(0)
  const autoAdvanceCbRef = useRef<(target: AutoGoLiveTarget) => void>(() => {})
  const [ndiName, setNdiName] = useState('ProShow')
  const [ndiInfo, setNdiInfo] = useState<{
    connections: number
    error: string | null
    available: boolean
  }>({
    connections: 0,
    error: null,
    available: true,
  })
  const [query, setQuery] = useState('')
  const [, setImportStatus] = useState('Carregando Holyrics…')
  const [importing, setImporting] = useState(false)
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const importMenuRef = useRef<HTMLDivElement | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [showCameras, setShowCameras] = useState(false)
  const [cameraInsertMode, setCameraInsertMode] = useState<'plan' | 'live'>(
    'plan',
  )
  /** 1 clique seleciona; 2 cliques ou “Adicionar” confirma */
  const [cameraPickId, setCameraPickId] = useState<string | null>(null)
  const [cameraVoiceIsolate, setCameraVoiceIsolate] = useState(false)
  const [cameraCaption, setCameraCaption] = useState('')
  const [cameraListBusy, setCameraListBusy] = useState(false)
  const [cameraEditDraft, setCameraEditDraft] =
    useState<CameraEditDraft | null>(null)
  const [cameraEditBusy, setCameraEditBusy] = useState(false)
  /** Fundo de câmera “preso” — sobrevive às trocas de slide */
  const [bgCameraId, setBgCameraId] = useState<string | null>(null)
  /** Preferência ligada — independente da última câmera lembrada em bgCameraId */
  const [bgCameraEnabled, setBgCameraEnabled] = useState(false)
  /** Operador solta a câmera antes da janela de saída abrir o stream. */
  const [operatorCamOff, setOperatorCamOff] = useState(false)
  const [themes, setThemes] = useState<ProjectionTheme[]>(BUILTIN_THEMES)
  /** Incrementado ao mutar temas — força remount dos <select> */
  const [themesRev, setThemesRev] = useState(0)
  const [libTab, setLibTab] = useState<'letras' | 'biblia' | 'midia'>('letras')
  const [mediaLibrary, setMediaLibrary] = useState<PlanItem[]>([])
  const [bibleVersionCount, setBibleVersionCount] = useState(0)
  /** URL atual do site na coluna de detalhe (navegação). */
  const [webBrowseUrl, setWebBrowseUrl] = useState<string | null>(null)
  /** Item web que está no ar — ao navegar na coluna, atualiza o ao vivo. */
  const liveWebItemIdRef = useRef<string | null>(null)
  const webBrowseRef = useRef<WebBrowseHandle | null>(null)
  const webLiveCaptureBusyRef = useRef(false)
  const webLiveCaptureTimerRef = useRef(0)
  const [previewPlayback, setPreviewPlayback] = useState<MediaPlayback>({
    ...DEFAULT_PLAYBACK,
    muted: true,
  })
  const [mediaTime, setMediaTime] = useState({ current: 0, duration: 0 })
  /** Contador local: setLive é async e seekSeq do state fica stale ao arrastar a barra */
  const mediaSeekSeqRef = useRef(0)
  const mediaScrubbingRef = useRef(false)
  const mediaSeekLockRef = useRef<{ target: number; until: number } | null>(
    null,
  )
  /** Seek imediato no player do operador (não espera o IPC) */
  const [seekOverride, setSeekOverride] = useState<{
    to: number
    seq: number
  } | null>(null)
  const [, setMediaNote] = useState<string | null>(null)
  const [mediaUrlDraft, setMediaUrlDraft] = useState('')
  const [mediaUrlBusy, setMediaUrlBusy] = useState(false)
  const [showMediaUrl, setShowMediaUrl] = useState(false)
  const [confirmRemovePlanItem, setConfirmRemovePlanItem] = useState<PlanItem | null>(null)
  const [confirmDeleteMediaItem, setConfirmDeleteMediaItem] = useState<PlanItem | null>(null)
  const [quickFitMenuOpen, setQuickFitMenuOpen] = useState<'video' | 'image' | null>(null)
  const [recentBgMedia, setRecentBgMedia] = useState<RecentBgMedia[]>(() => loadRecentBgMedia())
  const [songBgMenuOpen, setSongBgMenuOpen] = useState(false)
  const songBgMenuRef = useRef<HTMLDivElement | null>(null)

  function addRecentBgMedia(path: string, kind: 'image' | 'video') {
    setRecentBgMedia((prev) => {
      const next = [{ path, kind }, ...prev.filter((m) => m.path !== path)].slice(
        0,
        RECENT_BG_MEDIA_MAX,
      )
      saveRecentBgMedia(next)
      return next
    })
  }
  const quickFitMenuRef = useRef<HTMLDivElement | null>(null)
  const librarySearchRef = useRef<HTMLInputElement | null>(null)
  const [mediaProbe, setMediaProbe] = useState<{
    width?: number
    height?: number
    duration?: number
    format?: string
    sizeLabel?: string
    bitrateLabel?: string
    fps?: string
    videoCodec?: string
    videoProfile?: string
    pixelFormat?: string
    colorSpace?: string
    audioCodec?: string
    audioBitrateLabel?: string
    sampleRate?: number
    channels?: number
    channelLayout?: string
    rotation?: number
    hasVideo?: boolean
    hasAudio?: boolean
    container?: string
    title?: string
    artist?: string
    source?: 'ffprobe' | 'browser'
    error?: string
    loading?: boolean
  } | null>(null)
  const [planDragOver, setPlanDragOver] = useState(false)
  const [planDragId, setPlanDragId] = useState<string | null>(null)
  const [planDropId, setPlanDropId] = useState<string | null>(null)
  /** Preferência persistente: só se aplica a letras de música. */
  const [stackArtistic, setStackArtistic] = useState(loadStackArtistic)
  const [stackArtisticMax, setStackArtisticMax] = useState(loadStackArtisticMax)
  const [showArtisticKeywords, setShowArtisticKeywords] = useState(false)
  const [artisticKeywords, setArtisticKeywords] = useState(loadArtisticKeywords)
  const [artisticKeywordDraft, setArtisticKeywordDraft] = useState('')
  /** Ordem dos cliques na composição artística */
  const [stackOrder, setStackOrder] = useState<number[]>([])
  /** Índice que iniciou a composição atual (seed estável ao promover) */
  const [stackOrigin, setStackOrigin] = useState(0)
  const stackOrderRef = useRef(stackOrder)
  const stackOriginRef = useRef(stackOrigin)
  stackOrderRef.current = stackOrder
  stackOriginRef.current = stackOrigin
  /** Cache do mosaico: um cálculo por fase; promote só remapeia assentos. */
  const compositionCacheRef = useRef<CompositionCache | null>(null)
  const docScrollRef = useRef<HTMLDivElement | null>(null)
  const docScrollRatioRef = useRef(0)
  const docScrollRafRef = useRef(0)
  const [docScrollRatio, setDocScrollRatio] = useState(0)
  /** Tema: aplicar mudanças ao vivo ou só ao salvar */
  const [themeLiveApply, setThemeLiveApply] = useState(true)
  /** Id do tema marcado como padrão (não muda só por editar ao vivo / trocar no select) */
  const [defaultThemeId, setDefaultThemeId] = useState(theme.id)
  const defaultThemeSynced = useRef(false)
  const [draftTheme, setDraftTheme] = useState<ProjectionTheme>(theme)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')
  const [themeBusy, setThemeBusy] = useState(false)
  const [themeEditTarget, setThemeEditTarget] =
    useState<ThemeEditTarget>('phrase')
  const [importedFonts, setImportedFonts] = useState<
    Array<{ id: string; label: string; value: string }>
  >([])
  const [fontCatalog, setFontCatalog] = useState<
    Array<{
      id: string
      family: string
      category: string
      imported?: boolean
      importedId?: string | null
    }>
  >([])
  const [fontQuery, setFontQuery] = useState('')
  const [fontBusy, setFontBusy] = useState(false)
  const [fontsInstalledOnly, setFontsInstalledOnly] = useState(false)
  const fontSearchSeq = useRef(0)
  const fontSearchTimer = useRef<number | null>(null)
  /** null = fechado; 'new' = criar; PlanItem = editar */
  const [songEditorTarget, setSongEditorTarget] = useState<PlanItem | 'new' | null>(null)
  const [themeQuery, setThemeQuery] = useState('')

  const previewItem = useMemo(() => {
    if (browsingItem) {
      const key = songKey(browsingItem)
      // Sempre preferir a cópia fresca da biblioteca (pós-salvar/editar)
      const fromLib = library.find(
        (s) => s.id === key || s.libraryId === key || s.id === browsingItem.id,
      )
      if (fromLib) return { ...fromLib, id: fromLib.id }
      const fromPlan = plan.find((p) => songKey(p) === key || p.id === browsingItem.id)
      if (fromPlan) return fromPlan
      return browsingItem
    }
    return plan.find((p) => p.id === previewId) ?? plan[0]
  }, [plan, previewId, browsingItem, library])

  /**
   * Artistas já usados na biblioteca — sugestão no editor de música pra
   * manter o nome consistente (evita "André Valadão" vs "Andre Valadao"
   * em duas músicas, o que também ajuda a busca online a acertar o slug).
   */
  const knownArtists = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of library) {
      const a = item.artist?.trim()
      if (!a || seen.has(a)) continue
      seen.add(a)
      out.push(a)
    }
    return out.sort((a, b) => a.localeCompare(b, 'pt'))
  }, [library])

  /** Artístico só em letras de música (preferência pode estar ligada o tempo todo). */
  const stackingEnabled =
    stackArtistic && previewItem?.kind === 'lyrics'

  const filteredLibrary = useMemo(() => {
    const q = normalizeSearch(query.trim())
    if (!q) return library
    return library.filter((item) => {
      const hay = normalizeSearch(
        `${item.label} ${item.title ?? ''} ${item.artist ?? ''} ${item.lines.join(' ')}`,
      )
      return hay.includes(q)
    })
  }, [library, query])

  /** Tema que vale para o item no Preview — decide como o texto é repartido. */
  const previewBaseTheme = useMemo(() => {
    const base = previewItem?.kind === 'bible' ? bibleTheme : theme
    const resolved = phraseThemeOverride(
      base,
      themes,
      undefined,
      previewItem?.themeId,
    )
    return hydrateThemeMedia(resolved || base, themes)
  }, [previewItem?.themeId, previewItem?.kind, theme, bibleTheme, themes])

  /**
   * Slides derivados do item no Preview. Recalcula quando o tema muda — a
   * lista mostra as partes novas na hora, mesmo que o que está no ar siga
   * com o tema anterior até o próximo envio.
   */
  const previewDerived = useMemo(() => {
    if (!previewItem) return identityDerived([])
    if (previewItem.kind !== 'lyrics' && previewItem.kind !== 'bible') {
      return identityDerived(previewItem.lines)
    }
    return deriveSlidesForTheme(previewItem.lines, previewBaseTheme, outputAreaValue)
  }, [previewItem, previewBaseTheme, outputAreaValue])

  /**
   * Trocou de intervalo: a parte armada volta ao começo. Sem isto, o verso
   * novo já abria com a parte adiantada do verso anterior.
   */
  useEffect(() => {
    // Se este intervalo é o que acabou de ir ao ar, o goLiveBible já armou a
    // parte seguinte — zerar aqui desfaria isso.
    if (biblePreview?.id && biblePreview.id === bibleLiveId) return
    setBiblePreviewPart(0)
  }, [biblePreview?.id, bibleLiveId])

  /**
   * Partes do intervalo bíblico no Preview. Mesmo cálculo do que vai ao ar,
   * para o operador ver antes e poder voltar a uma parte já passada.
   */
  const bibleDerived = useMemo(() => {
    if (!biblePreview) return identityDerived([])
    const verses = biblePreview.lines.length
      ? biblePreview.lines
      : [biblePreview.label]
    return deriveSlidesForTheme([verses.join('\n')], bibleTheme, outputAreaValue)
  }, [biblePreview, bibleTheme, outputAreaValue])

  /**
   * Marca "1a", "1b", "2a"… para as partes do intervalo bíblico.
   *
   * O intervalo é repartido como um bloco só, então uma parte pode começar no
   * meio de um verso. O número é o verso onde a parte COMEÇA, descoberto pela
   * ordem de aparição dos versos no texto repartido; a letra é a ordem da
   * parte dentro desse verso.
   */
  const biblePartTags = useMemo(() => {
    const verses = biblePreview?.lines ?? []
    if (bibleDerived.lines.length < 2 || !verses.length) return []
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    // Quanto texto de cada verso já foi consumido, em caracteres.
    const cuts: number[] = []
    let acc = 0
    for (const v of verses) {
      acc += v.length + 1 // +1 do \n usado ao juntar
      cuts.push(acc)
    }
    let consumed = 0
    let lastVerse = -1
    let letterIdx = 0
    return bibleDerived.lines.map((part) => {
      // Verso que contém o início desta parte.
      const vIdx = Math.min(
        cuts.findIndex((c) => consumed < c),
        verses.length - 1,
      )
      const verseNo = vIdx < 0 ? verses.length : vIdx + 1
      if (verseNo === lastVerse) letterIdx += 1
      else {
        lastVerse = verseNo
        letterIdx = 0
      }
      // Avança pelo texto sem as reticências que a emenda adiciona.
      consumed += part.replace(/…/g, '').trim().length + 1
      return `${verseNo}${letters[letterIdx] || ''}`
    })
  }, [biblePreview, bibleDerived])

  const biblePartTag = (idx: number) => biblePartTags[idx] ?? ''

  /** Item com as partes — usado para navegar, projetar e listar. */
  const previewDerivedItem = useMemo(
    () => (previewItem ? withDerivedLines(previewItem, previewDerived) : null),
    [previewItem, previewDerived],
  )

  // Manter o operador na mesma linha escrita quando a divisão muda.
  const lastDerivedRef = useRef(previewDerived)
  useEffect(() => {
    const before = lastDerivedRef.current
    lastDerivedRef.current = previewDerived
    if (before === previewDerived) return
    if (before.lines.length === previewDerived.lines.length) return
    setPreviewSlide((idx) => remapIndex(before, previewDerived, idx))
  }, [previewDerived])

  const previewLines = previewDerivedItem
    ? displayLinesFor(previewDerivedItem, previewSlide, stackingEnabled, stackOrder)
    : []

  /** Linhas candidatas = slides do item AO VIVO + outros lyrics/bible do plano. */
  const autoCandidates = useMemo((): AutoLineCandidate[] => {
    if (!liveSlot) return []
    const livePlanIdx = plan.findIndex((p) => p.id === liveSlot.itemId)
    const liveIdx = liveSlot.idx
    const prefIdx =
      previewItem && previewItem.id === liveSlot.itemId
        ? previewSlide
        : liveIdx + 1
    const out: AutoLineCandidate[] = []

    for (let pIdx = 0; pIdx < plan.length; pIdx++) {
      const item = plan[pIdx]
      if (item.kind !== 'lyrics' && item.kind !== 'bible') continue
      const sameItem = item.id === liveSlot.itemId
      let lines: string[]
      if (sameItem && previewItem?.id === item.id) {
        lines = previewDerived.lines
      } else {
        const base = item.kind === 'bible' ? bibleTheme : theme
        const resolved = phraseThemeOverride(
          base,
          themes,
          undefined,
          item.themeId,
        )
        const itemTheme = hydrateThemeMedia(resolved || base, themes)
        lines = deriveSlidesForTheme(
          item.lines,
          itemTheme,
          outputAreaValue,
        ).lines
      }
      const planDistance =
        livePlanIdx >= 0 ? Math.abs(pIdx - livePlanIdx) : 99

      // Mesma música: restringe candidatos pelo grafo verso→pré→coro/refrão…
      let sectionAllow: Set<number> | null = null
      if (sameItem && item.kind === 'lyrics') {
        const resolved = resolveSections(item.lines, item.sections)
        const flatLen = flattenSections(resolved).length
        const structure =
          flatLen === lines.length
            ? resolved
            : resolveSections(lines, null)
        sectionAllow = allowedSlideIndices({
          sections: structure,
          liveIndex: liveIdx,
          previewIndex: prefIdx,
        })
      }

      for (let i = 0; i < lines.length; i++) {
        if (sameItem && i === liveIdx) continue
        if (sectionAllow && !sectionAllow.has(i)) continue
        const neighborDist = sameItem ? Math.abs(i - liveIdx) : 99
        out.push({
          key: `${item.id}:${i}`,
          planItemId: item.id,
          slideIndex: i,
          line: lines[i] || '',
          prior: priorForCandidate({
            sameItem,
            slideIndex: i,
            liveIndex: liveIdx,
            previewIndex: prefIdx,
            planDistance,
          }),
          sameItem,
          neighborDist,
        })
      }
    }
    return out
  }, [
    liveSlot,
    plan,
    previewItem,
    previewSlide,
    previewDerived,
    theme,
    bibleTheme,
    themes,
    outputAreaValue,
  ])

  const autoLiveLine = useMemo(() => {
    if (!liveSlot) return ''
    const item = plan.find((p) => p.id === liveSlot.itemId)
    if (!item) return ''
    if (previewItem?.id === item.id) {
      return previewDerived.lines[liveSlot.idx] || ''
    }
    const base = item.kind === 'bible' ? bibleTheme : theme
    const resolved = phraseThemeOverride(base, themes, undefined, item.themeId)
    const itemTheme = hydrateThemeMedia(resolved || base, themes)
    return (
      deriveSlidesForTheme(item.lines, itemTheme, outputAreaValue).lines[
        liveSlot.idx
      ] || ''
    )
  }, [
    liveSlot,
    plan,
    previewItem,
    previewDerived,
    theme,
    bibleTheme,
    themes,
    outputAreaValue,
  ])

  const autoAdvanceActive =
    autoAdvance.enabled &&
    Boolean(liveSlot) &&
    (live.kind === 'lyrics' || live.kind === 'bible')

  const { status: autoStatus, lastHeard: autoLastHeard, loadMsg: autoLoadMsg } =
    useAutoAdvance({
      config: autoAdvance,
      candidates: autoCandidates,
      // Em BLACK não “segura” no verso antigo — facilita voltar no match
      liveLine: live.visible ? autoLiveLine : '',
      liveIndex: liveSlot?.idx ?? 0,
      active: autoAdvanceActive,
      programVisible: live.visible,
      suppressUntil: autoSuppressUntil,
      onGoLive: (target) => autoAdvanceCbRef.current(target),
      onClearLive: () => onLiveChange({ visible: false }),
    })

  const previewSlots = previewItem
    ? displayPhraseSlots(previewItem, stackOrder, stackingEnabled)
    : null
  const previewSlotsKey = previewSlots?.join('\u0000') || ''
  const previewArtisticPlan = useMemo(() => {
    const phrases = previewSlotsKey
      ? previewSlotsKey.split('\u0000')
      : []
    if (
      !previewItem ||
      previewItem.kind !== 'lyrics' ||
      !stackArtistic ||
      !phrases.length
    ) {
      compositionCacheRef.current = null
      return null
    }
    const resolved = resolveCachedArtisticPlan(
      compositionCacheRef.current,
      phrases,
      `${songKey(previewItem)}:${stackOrigin}`,
      artisticKeywords,
    )
    compositionCacheRef.current = resolved.cache
    return resolved.plan
  }, [
    previewItem,
    previewSlotsKey,
    stackArtistic,
    stackOrigin,
    artisticKeywords,
    COMPOSITION_LAYOUT_VERSION,
  ])

  const usingBiblePreview = libTab === 'biblia' && Boolean(biblePreview)
  const previewIsCamera =
    !usingBiblePreview && previewItem?.kind === 'camera'
  const previewTitle = usingBiblePreview
    ? biblePreview!.title || biblePreview!.label
    : previewItem?.title || previewItem?.label || '—'
  const previewArtist = usingBiblePreview ? null : previewItem?.artist || null
  const stagePreviewLines = usingBiblePreview
    ? // Intervalo repartido: o monitor mostra só a PARTE armada, senão o
      // operador veria o verso inteiro e não o que vai realmente ao ar.
      bibleDerived.lines.length > 1
      ? (bibleDerived.lines[Math.max(0, biblePreviewPart)] || '').split('\n')
      : biblePreview!.lines
    : previewLines

  const previewIsMedia =
    !usingBiblePreview &&
    (previewItem?.kind === 'image' ||
      previewItem?.kind === 'video' ||
      previewItem?.kind === 'audio' ||
      previewItem?.kind === 'deck' ||
      previewItem?.kind === 'web' ||
      previewItem?.kind === 'file')
  const previewIsDocumentScroll = isDocumentScrollItem(previewItem)
  const previewIsWebBrowse = isWebBrowseItem(previewItem)
  const previewIsYoutube = isYoutubeWebItem(previewItem)

  const liveIsAv =
    live.kind === 'video' ||
    live.kind === 'audio' ||
    live.kind === 'web' ||
    live.kind === 'camera' ||
    live.mediaKind === 'video' ||
    live.mediaKind === 'audio' ||
    live.mediaKind === 'web'

  const previewMediaPath = previewIsMedia
    ? previewItem?.kind === 'deck'
      ? previewItem.slidePaths?.[0] || previewItem.mediaPath || null
      : previewItem?.kind === 'web'
        ? webBrowseUrl ||
          previewItem.mediaPath ||
          previewItem.webUrl ||
          null
        : previewItem?.mediaPath || null
    : null
  const previewMediaKind = previewIsMedia
    ? previewItem?.mediaKind || (previewItem?.kind as PlanItem['mediaKind'])
    : null
  const previewDeckSlidePaths = documentSlidePaths(previewItem)
  const liveMediaPath = live.mediaPath || null
  const liveMediaKind = live.mediaKind || null
  const liveDeckSlidePaths = live.mediaSlidePaths || null
  const liveDeckScrollRatio = live.mediaScrollRatio ?? 0

  const documentSlideCount =
    previewIsDocumentScroll && previewItem
      ? documentSlidePaths(previewItem)?.length ||
        previewItem.lines.length ||
        (previewItem.kind === 'web' || previewItem.kind === 'image' ? 1 : 0)
      : 0

  const deckLiveOpen =
    live.visible &&
    Boolean(previewItem) &&
    (live.kind === 'deck' || live.kind === 'image') &&
    (previewItem?.kind === 'deck' || previewItem?.kind === 'image') &&
    (live.title || '') === (previewItem?.title || previewItem?.label || '')

  function reportDocScroll(el: HTMLDivElement) {
    const max = Math.max(1, el.scrollHeight - el.clientHeight)
    const ratio = Math.max(0, Math.min(1, el.scrollTop / max))
    docScrollRatioRef.current = ratio
    setDocScrollRatio(ratio)
    if (!deckLiveOpen || !previewItem) return
    const paths = documentSlidePaths(previewItem)
    onLiveChange({
      mediaScrollRatio: ratio,
      mediaSlidePaths: paths || live.mediaSlidePaths || null,
      mediaPath:
        paths?.[0] ||
        previewItem.mediaPath ||
        live.mediaPath ||
        null,
      mediaKind:
        previewItem.mediaKind ||
        (previewItem.kind as PlanItem['mediaKind']) ||
        'deck',
      visible: true,
    })
  }

  function onDocScroll() {
    const el = docScrollRef.current
    if (!el) return
    if (docScrollRafRef.current) cancelAnimationFrame(docScrollRafRef.current)
    docScrollRafRef.current = requestAnimationFrame(() => {
      docScrollRafRef.current = 0
      reportDocScroll(el)
    })
  }

  // Ao trocar o item do Preview: áudio volta mudo
  useEffect(() => {
    setPreviewPlayback((p) => ({
      ...p,
      muted: true,
      playing: true,
      seekTo: 0,
      seekSeq: (p.seekSeq || 0) + 1,
    }))
  }, [previewItem?.id])

  // Saiu da aba Letras: a navegação solta (não commitada) não faz mais sentido.
  useEffect(() => {
    if (libTab !== 'letras') setBrowsingItem(null)
  }, [libTab])

  useEffect(() => {
    if (!previewItem || previewItem.kind !== 'web') {
      setWebBrowseUrl(null)
      return
    }
    setWebBrowseUrl(
      previewItem.mediaPath || previewItem.webUrl || null,
    )
  }, [previewItem?.id, previewItem?.kind, previewItem?.mediaPath, previewItem?.webUrl])

  useEffect(() => {
    docScrollRatioRef.current = 0
    setDocScrollRatio(0)
    if (docScrollRef.current) docScrollRef.current.scrollTop = 0
    if (previewIsDocumentScroll) {
      requestAnimationFrame(() => {
        // Não rouba o foco se algo já foi focado deliberadamente nesse meio
        // tempo (ex.: Ctrl+Tab pulando pra lista da aba).
        const active = document.activeElement
        if (active && active !== document.body && active !== docScrollRef.current) {
          return
        }
        docScrollRef.current?.focus({ preventScroll: true })
      })
    }
  }, [previewItem?.id, previewIsDocumentScroll])

  async function captureWebLiveFrame(): Promise<string | null> {
    if (webLiveCaptureBusyRef.current) return null
    webLiveCaptureBusyRef.current = true
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const dataUrl = await webBrowseRef.current?.captureDataUrl()
        if (!dataUrl) {
          await new Promise((r) => setTimeout(r, 80 * (attempt + 1)))
          continue
        }
        const saved = await window.projection?.saveWebLiveFrame?.(dataUrl)
        if (saved?.ok && saved.path) return saved.path
      }
      return null
    } catch {
      return null
    } finally {
      webLiveCaptureBusyRef.current = false
    }
  }

  function pushWebLiveCapture() {
    if (
      !live.visible ||
      live.kind !== 'web' ||
      !previewItem?.id ||
      liveWebItemIdRef.current !== previewItem.id
    ) {
      return
    }
    if (webLiveCaptureTimerRef.current) {
      window.clearTimeout(webLiveCaptureTimerRef.current)
    }
    webLiveCaptureTimerRef.current = window.setTimeout(() => {
      webLiveCaptureTimerRef.current = 0
      void (async () => {
        const framePath = await captureWebLiveFrame()
        if (!framePath) return
        if (liveWebItemIdRef.current !== previewItem?.id) return
        onLiveChange({
          kind: 'web',
          mediaPath: framePath,
          mediaKind: 'image',
          mediaSlidePaths: null,
          mediaScrollRatio: 0,
          mediaSeekSeq: (live.mediaSeekSeq || 0) + 1,
          visible: true,
          showText: true,
        })
      })()
    }, 120)
  }

  function onWebBrowseUrl(url: string) {
    setWebBrowseUrl((prev) => (prev === url ? prev : url))
    // Clique / navegação no site → atualiza o frame ao vivo
    pushWebLiveCapture()
  }

  function onWebBrowseScroll(_ratio: number) {
    const next = Math.max(0, Math.min(1, _ratio))
    if (Math.abs(next - docScrollRatioRef.current) < 0.001) return
    docScrollRatioRef.current = next
    pushWebLiveCapture()
  }

  // Enquanto o site está ao vivo, espelha a navegação com frames periódicos
  useEffect(() => {
    const following =
      live.visible &&
      live.kind === 'web' &&
      previewIsWebBrowse &&
      Boolean(previewItem?.id) &&
      liveWebItemIdRef.current === previewItem?.id
    if (!following) return
    const tick = window.setInterval(() => {
      pushWebLiveCapture()
    }, 400)
    return () => window.clearInterval(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.visible, live.kind, previewIsWebBrowse, previewItem?.id])

  useEffect(() => {
    setMediaProbe(null)
    const item = previewItem
    if (!item) return
    if (item.kind !== 'image' && item.kind !== 'video' && item.kind !== 'audio') {
      return
    }
    const filePath = item.mediaPath
    if (!filePath) return
    let cancelled = false
    const formatFallback = mediaFileExt(filePath || item.label)
    setMediaProbe({ format: formatFallback, loading: true })

    void (async () => {
      const localPath =
        /^https?:\/\//i.test(filePath) || /^iblemedia:/i.test(filePath)
          ? null
          : filePath

      if (localPath && window.projection?.mediaProbe) {
        try {
          const result = await window.projection.mediaProbe(localPath)
          if (cancelled) return
          if (result?.ok && result.probe) {
            const p = result.probe
            setMediaProbe({
              width: p.width ?? undefined,
              height: p.height ?? undefined,
              duration: p.duration ?? undefined,
              format: p.format || formatFallback,
              container: p.container ?? undefined,
              sizeLabel: p.sizeLabel ?? undefined,
              bitrateLabel: p.bitrateLabel ?? undefined,
              fps: p.fps ?? undefined,
              videoCodec: p.videoCodec ?? undefined,
              videoProfile: p.videoProfile ?? undefined,
              pixelFormat: p.pixelFormat ?? undefined,
              colorSpace: p.colorSpace ?? undefined,
              audioCodec: p.audioCodec ?? undefined,
              audioBitrateLabel: p.audioBitrateLabel ?? undefined,
              sampleRate: p.sampleRate ?? undefined,
              channels: p.channels ?? undefined,
              channelLayout: p.channelLayout ?? undefined,
              rotation: p.rotation ?? undefined,
              hasVideo: p.hasVideo,
              hasAudio: p.hasAudio,
              title: p.title ?? undefined,
              artist: p.artist ?? undefined,
              source: 'ffprobe',
              loading: false,
            })
            return
          }
          if (!cancelled && result?.error) {
            setMediaProbe((prev) => ({
              ...(prev || {}),
              format: formatFallback,
              error: result.error,
              loading: false,
            }))
          }
        } catch (err) {
          if (!cancelled) {
            setMediaProbe((prev) => ({
              ...(prev || {}),
              format: formatFallback,
              error: String(err),
              loading: false,
            }))
          }
        }
      }

      const src = toMediaUrl(filePath)
      if (!src || cancelled) return

      if (item.kind === 'image') {
        const img = new Image()
        img.onload = () => {
          if (cancelled) return
          setMediaProbe((prev) => ({
            ...prev,
            width: img.naturalWidth,
            height: img.naturalHeight,
            format: prev?.format || formatFallback,
            source: prev?.source || 'browser',
            loading: false,
          }))
        }
        img.onerror = () => {
          if (!cancelled) {
            setMediaProbe((prev) => ({
              ...(prev || {}),
              format: formatFallback,
              loading: false,
            }))
          }
        }
        img.src = src
        return
      }

      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      const onMeta = () => {
        if (cancelled) return
        setMediaProbe((prev) => ({
          ...prev,
          width: video.videoWidth || prev?.width,
          height: video.videoHeight || prev?.height,
          duration: Number.isFinite(video.duration)
            ? video.duration
            : prev?.duration,
          format: prev?.format || formatFallback,
          source: prev?.source === 'ffprobe' ? 'ffprobe' : 'browser',
          loading: false,
        }))
      }
      video.addEventListener('loadedmetadata', onMeta)
      video.src = src
    })()

    return () => {
      cancelled = true
    }
  }, [previewItem?.id, previewItem?.kind, previewItem?.mediaPath, previewItem?.label])

  const livePlayback: MediaPlayback = {
    playing: live.mediaPlaying !== false,
    muted: Boolean(live.mediaMuted),
    loop: live.mediaLoop !== false,
    volume: live.mediaVolume ?? 1,
    seekTo: seekOverride?.to ?? live.mediaSeekTo ?? null,
    seekSeq: Math.max(live.mediaSeekSeq ?? 0, seekOverride?.seq ?? 0),
    voiceIsolate: Boolean(live.mediaVoiceIsolate),
  }

  useEffect(() => {
    mediaSeekSeqRef.current = Math.max(
      mediaSeekSeqRef.current,
      live.mediaSeekSeq || 0,
      previewPlayback.seekSeq,
    )
    if (seekOverride && (live.mediaSeekSeq || 0) >= seekOverride.seq) {
      setSeekOverride(null)
    }
  }, [live.mediaSeekSeq, previewPlayback.seekSeq, seekOverride])

  function reportMediaTime(current: number, duration: number) {
    const dur =
      Number.isFinite(duration) && duration > 0 ? duration : mediaTime.duration
    if (mediaScrubbingRef.current) {
      if (dur && dur !== mediaTime.duration) {
        setMediaTime((m) => ({ ...m, duration: dur }))
      }
      return
    }
    const lock = mediaSeekLockRef.current
    if (lock && Date.now() < lock.until) {
      if (Math.abs(current - lock.target) > 0.85) {
        // Ignora timeupdate obsoleto (ex.: outro <video> ainda em 0)
        setMediaTime((m) => ({ current: lock.target, duration: dur || m.duration }))
        return
      }
      if (Math.abs(current - lock.target) <= 0.4) {
        mediaSeekLockRef.current = null
      }
    }
    setMediaTime({ current, duration: dur || 0 })
  }

  const transportPlayback = liveIsAv ? livePlayback : previewPlayback
  const setTransportPlayback = (partial: Partial<MediaPlayback>) => {
    if (partial.seekTo !== undefined) {
      mediaSeekSeqRef.current =
        Math.max(
          mediaSeekSeqRef.current,
          live.mediaSeekSeq || 0,
          previewPlayback.seekSeq,
        ) + 1
      const seekSeq = mediaSeekSeqRef.current
      const seekTo = Number(partial.seekTo)
      mediaSeekLockRef.current = { target: seekTo, until: Date.now() + 1000 }
      setMediaTime((m) => ({
        ...m,
        current: Number.isFinite(seekTo) ? seekTo : m.current,
      }))

      const sameMedia =
        Boolean(previewMediaPath) && previewMediaPath === liveMediaPath

      if (liveIsAv) {
        setSeekOverride({ to: seekTo, seq: seekSeq })
        onLiveChange({
          mediaSeekTo: seekTo,
          mediaSeekSeq: seekSeq,
          mediaPlaying:
            partial.playing !== undefined ? partial.playing : true,
          ...(partial.muted !== undefined ? { mediaMuted: partial.muted } : null),
          ...(partial.loop !== undefined ? { mediaLoop: partial.loop } : null),
          ...(partial.volume !== undefined
            ? { mediaVolume: partial.volume }
            : null),
        })
        // Espelha no preview só se for o mesmo arquivo (evita 2 tempos brigando)
        if (sameMedia) {
          setPreviewPlayback((p) => ({
            ...p,
            seekTo,
            seekSeq,
            playing: partial.playing !== undefined ? partial.playing : true,
            muted: true, // preview nunca tem som
          }))
        }
        return
      }

      setPreviewPlayback((p) => ({
        ...p,
        seekTo,
        seekSeq,
        playing: partial.playing !== undefined ? partial.playing : true,
        muted: true,
      }))
      return
    }

    if (liveIsAv) {
      const patch: Partial<LiveState> = {}
      if (partial.playing !== undefined) patch.mediaPlaying = partial.playing
      if (partial.muted !== undefined) patch.mediaMuted = partial.muted
      if (partial.loop !== undefined) patch.mediaLoop = partial.loop
      if (partial.volume !== undefined) patch.mediaVolume = partial.volume
      if (partial.voiceIsolate !== undefined) {
        patch.mediaVoiceIsolate = partial.voiceIsolate
      }
      onLiveChange(patch)
      if (previewMediaPath === liveMediaPath) {
        // Espelha play/loop/isolate — mute do preview fica sempre ligado
        setPreviewPlayback((p) => ({ ...p, ...partial, muted: true }))
      }
    } else {
      // Controles no preview: play/seek/loop ok; áudio nunca
      setPreviewPlayback((p) => ({ ...p, ...partial, muted: true }))
    }
  }

  const activeCameraId =
    live.cameraDeviceId || (bgCameraEnabled ? bgCameraId : null) || null
  /**
   * Em simulação o Preview e o AO VIVO compartilham o mesmo stream.
   * Só suprime Preview quando há janela de saída real (outro processo).
   */
  const suppressPreviewCam = !simulation && (Boolean(live.cameraDeviceId) || operatorCamOff)

  const previewCameraId = suppressPreviewCam
    ? null
    : usingBiblePreview
      ? activeCameraId
      : previewIsMedia
        ? null
        : previewItem?.kind === 'camera'
          ? previewItem.cameraDeviceId || cameras[0]?.deviceId || null
          : activeCameraId

  // Painel AO VIVO: câmera do programa (device vivo ou fundo armado)
  const liveOperatorCameraId = liveMediaPath
    ? null
    : operatorCamOff
      ? null
      : live.cameraDeviceId ||
        (bgCameraEnabled ? bgCameraId : null) ||
        activeCameraId

  const basePreviewTheme =
    usingBiblePreview || previewItem?.kind === 'bible' ? bibleTheme : theme
  const liveStageTheme = (() => {
    let t = hydrateThemeMedia(
      resolveActiveTheme(live, theme, bibleTheme),
      themes,
    )
    if (live.cameraDeviceId || activeCameraId) {
      t = { ...t, backgroundImage: null, backgroundVideo: null }
    }
    // Tema AND portões AO VIVO
    t = andThemeShowGates(t, { ...live, showText: true })
    return t
  })()

  const previewStageTheme = (() => {
    let t: ProjectionTheme
    if (usingBiblePreview) {
      t = hydrateThemeMedia(bibleTheme, themes)
    } else {
      t = hydrateThemeMedia(
        withSongUppercase(
          resolvePhraseTheme(
            basePreviewTheme,
            themes,
            previewItem?.phraseStyles?.[previewSlide],
            previewItem?.themeId,
          ),
          previewItem?.uppercase,
        ),
        themes,
      )
      if (previewItem?.kind === 'lyrics' && previewItem.bgMediaPath) {
        t = {
          ...t,
          backgroundImage: previewItem.bgMediaKind === 'image' ? previewItem.bgMediaPath : null,
          backgroundVideo: previewItem.bgMediaKind === 'video' ? previewItem.bgMediaPath : null,
        }
      }
    }
    if (previewCameraId) {
      t = { ...t, backgroundImage: null, backgroundVideo: null }
    }
    // Preview reflete os portões AO VIVO — texto sempre ativo
    t = andThemeShowGates(t, {
      gateTitle: live.gateTitle,
      gateArtist: live.gateArtist,
      gateLyrics: live.gateLyrics,
      showText: !previewIsCamera,
    })
    return t
  })()

  const previewSafeArea = effectiveSafeArea(previewStageTheme, outputAreaValue)
  const liveSafeArea = effectiveSafeArea(liveStageTheme, outputAreaValue)
  const previewWrapLines =
    usingBiblePreview ||
    previewItem?.kind === 'bible' ||
    Boolean(previewStageTheme.wrapLines)
  const liveWrapLines =
    live.kind === 'bible' || Boolean(liveStageTheme.wrapLines)

  const previewSlotThemes =
    previewItem && previewSlots && !usingBiblePreview
      ? buildSlotThemes(
          previewItem,
          stackOrder,
          basePreviewTheme,
          themes,
          stackingEnabled,
        )
      : null

  const editingTheme = draftTheme

  function commitTheme(next: ProjectionTheme, alsoLive: boolean) {
    const hydrated = hydrateThemeMedia(next, themes)
    setDraftTheme(hydrated)
    if (alsoLive) {
      onThemeChange(hydrated)
      if (live.kind !== 'bible') onLiveChange({ themeOverride: null })
    }
  }

  const setEditingTheme = (next: ProjectionTheme) => {
    commitTheme(next, themeLiveApply)
  }

  const currentPhraseStyle = previewItem?.phraseStyles?.[previewSlide] || null

  useEffect(() => {
    if (!themeLiveApply) setDraftTheme(theme)
  }, [theme, themeLiveApply])

  useEffect(() => {
    if (defaultThemeSynced.current) return
    if (!theme?.id) return
    setDefaultThemeId(theme.id)
    defaultThemeSynced.current = true
  }, [theme.id])

  function markThemeAsDefault(next: ProjectionTheme) {
    setDefaultThemeId(next.id)
    commitTheme(next, true)
  }

  useEffect(() => {
    const api = window.projection
    if (!api) return
    api.listDisplays().then(setDisplays)
    api.getOutputConfig().then((c) => {
      setOverlayUrl(c.overlayUrl)
      setMode(c.mode)
      setDisplayId(c.displayId)
      if (c.displays?.length) setDisplays(c.displays)
      if (typeof c.simulation === 'boolean') setSimulation(c.simulation)
      // Modo criativo: disco + migração do localStorage da sessão anterior
      const artisticOn = Boolean(c.stackArtistic) || loadStackArtistic()
      setStackArtistic(artisticOn)
      saveStackArtistic(artisticOn)
      const artisticMaxOn = Boolean(c.stackArtisticMax) || loadStackArtisticMax()
      setStackArtisticMax(artisticMaxOn)
      saveStackArtisticMax(artisticMaxOn)
      if (c.quickVideoItem) setQuickVideoItem(c.quickVideoItem as unknown as PlanItem)
      if (c.quickImageItem) setQuickImageItem(c.quickImageItem as unknown as PlanItem)
      if (c.spectrum) setSpectrum(normalizeSpectrum(c.spectrum))
      if (c.autoAdvance) setAutoAdvance(normalizeAutoAdvance(c.autoAdvance))
    })
    void api.ndiStatus?.().then((st) => {
      if (!st) return
      setNdiEnabled(Boolean(st.enabled))
      if (st.name) setNdiName(st.name)
      setNdiInfo({
        connections: st.connections || 0,
        error: st.error,
        available: st.available !== false,
      })
    })
    const off = api.onDisplays?.((next) => setDisplays(next))
    const offSim = api.onSimulation?.((s) => {
      setSimulation(s.simulation)
    })
    const offOutCfg = api.onOutputConfig?.((cfg) => {
      if (typeof cfg.simulation === 'boolean') setSimulation(cfg.simulation)
      if (cfg.displayId !== undefined) setDisplayId(cfg.displayId)
      if (cfg.spectrum) setSpectrum(normalizeSpectrum(cfg.spectrum))
      if (cfg.autoAdvance) setAutoAdvance(normalizeAutoAdvance(cfg.autoAdvance))
    })
    void loadHolyricsAuto()
    void bootCameras()
    api.listThemes?.().then((list) => {
      if (list?.length) setThemes(list)
    })
    const offThemesList = api.onThemesList?.((list) => {
      if (Array.isArray(list) && list.length) {
        setThemes(list)
        setThemesRev((n) => n + 1)
      }
    })
    void api.bibleVersions?.().then((v) => {
      setBibleVersionCount(Array.isArray(v) ? v.length : 0)
    })
    void window.projection?.mediaList?.().then((items) => {
      const mapped = mapImportedMedia(items || [])
      setMediaLibrary(mapped)
      // Decks reparados no disco: atualiza plano/preview com slidePaths novos
      setPlan((prev) =>
        prev.map((p) => {
          if (p.kind !== 'deck') return p
          const fresh = mapped.find(
            (m) => m.id === p.id || songKey(m) === songKey(p),
          )
          if (!fresh?.slidePaths?.length) return p
          if (
            fresh.slidePaths.length === (p.slidePaths?.length || 0) &&
            fresh.slidePaths[0] === p.slidePaths?.[0]
          ) {
            return p
          }
          return {
            ...p,
            slidePaths: fresh.slidePaths,
            lines: fresh.lines?.length ? fresh.lines : p.lines,
            mediaPath: fresh.mediaPath || p.mediaPath,
            note: fresh.note,
          }
        }),
      )
    })
    void window.projection?.fontsList?.().then((data) => {
      if (data?.options) setImportedFonts(data.options)
      if (data?.css) applyFontCss(data.css)
    })
    void window.projection?.fontsCatalog?.('').then((list) => {
      if (list) setFontCatalog(list)
    })
    const offFonts = window.projection?.onFonts?.((data) => {
      if (data?.options) setImportedFonts(data.options)
      if (data?.css) applyFontCss(data.css)
    })
    return () => {
      off?.()
      offSim?.()
      offOutCfg?.()
      offFonts?.()
      offThemesList?.()
    }
  }, [])

  // Atualiza selects de tema ao abrir Show / Temas
  useEffect(() => {
    if (tab === 'show' || tab === 'temas') void refreshThemes()
  }, [tab])

  useEffect(() => {
    if (tab !== 'saidas') return
    let cancelled = false
    async function refreshDisplays() {
      try {
        const next = await window.projection?.listDisplays()
        if (!cancelled && next) setDisplays(next)
      } catch {
        /* ignore */
      }
    }
    void refreshDisplays()
    const id = window.setInterval(() => void refreshDisplays(), 1500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [tab])

  useEffect(() => {
    let cancelled = false
    const id = window.setInterval(async () => {
      if (cancelled) return
      try {
        const next = await window.projection?.listDisplays()
        if (!cancelled && next) setDisplays(next)
      } catch {
        /* ignore */
      }
    }, 4000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+Tab: alterna Letras/Bíblia/Mídia de qualquer lugar, já focando
      // o 1º conteúdo pronto pra navegar. Funciona mesmo digitando num campo.
      if (e.key === 'Tab' && e.ctrlKey && tab === 'show') {
        e.preventDefault()
        const order: Array<'letras' | 'biblia' | 'midia'> = ['letras', 'biblia', 'midia']
        const idx = order.indexOf(libTab)
        const delta = e.shiftKey ? -1 : 1
        const next = order[(idx + delta + order.length) % order.length]
        switchLibTab(next)
        return
      }
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      // Linhas de letra / versículo ficam com o foco: elas seguem navegáveis.
      const isPhraseNav = el?.dataset?.phraseNav === '1'
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (tag === 'BUTTON' && !isPhraseNav) ||
        tag === 'A' ||
        el?.isContentEditable
      ) {
        return
      }
      // Saídas: atalhos de conteúdo desligados (abrir saída é pelo monitor / AO VIVO)
      if (tab === 'saidas') return

      // Tab: alterna entre Biblioteca / Navegador / Programa do culto,
      // sempre pousando (e armando) o 1º item do painel.
      if (e.key === 'Tab') {
        e.preventDefault()
        tabToZone(e.shiftKey ? -1 : 1)
        return
      }

      const zone = getFocusZone()

      // Del/Backspace no Programa do culto: remove o item focado (com confirmação)
      if (zone === 'plano' && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        const item = focusedPlanItem()
        if (item) setConfirmRemovePlanItem(item)
        return
      }

      // Del/Backspace na biblioteca de mídia: apaga o arquivo (com confirmação)
      if (
        zone === 'library' &&
        libTab === 'midia' &&
        (e.key === 'Delete' || e.key === 'Backspace')
      ) {
        e.preventDefault()
        const item = focusedMediaItem()
        if (item) setConfirmDeleteMediaItem(item)
        return
      }

      // Biblioteca: digitar já busca (letras) ou abre a busca de livro (bíblia)
      if (
        zone === 'library' &&
        e.key.length === 1 &&
        e.key !== ' ' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        if (libTab === 'letras') {
          e.preventDefault()
          const typed = e.key
          setQuery((q) => q + typed)
          requestAnimationFrame(() => {
            const input = librarySearchRef.current
            if (!input) return
            input.focus()
            input.setSelectionRange(input.value.length, input.value.length)
          })
          return
        }
        if (libTab === 'biblia') {
          e.preventDefault()
          bibleRef.current?.startJump(e.key)
          return
        }
      }

      // Bíblia só navega assim quando o foco está na Biblioteca (ou nada
      // está focado ainda) — senão roubaria as setas do Plano/Navegador.
      const bibleNav =
        libTab === 'biblia' &&
        Boolean(biblePreview) &&
        (zone === 'library' || zone === null)

      if (bibleNav) {
        // Cima/baixo = parte do intervalo (quando repartido) e depois verso;
        // esquerda/direita = capítulo (stepChapter)
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const delta = e.key === 'ArrowDown' ? 1 : -1
          const total = bibleDerived.lines.length
          // No painel central: anda pelas PARTES. No painel de versos: troca
          // de verso. Cada painel navega o que ele mostra.
          if (focusIsBiblePart() && total > 1) {
            const from = biblePreviewPart < 0 ? total - 1 : biblePreviewPart
            const next = from + delta
            if (next >= 0 && next < total) {
              setBiblePreviewPart(next)
              focusBiblePart(next)
              return
            }
            return
          }
          bibleRef.current?.step(delta)
        } else if (e.key === 'ArrowRight') {
          // Painel de versos → painel central (partes), já armando no Preview.
          e.preventDefault()
          if (!focusIsBiblePart() && bibleDerived.lines.length > 1) {
            const idx = biblePreviewPart < 0 ? 0 : biblePreviewPart
            setBiblePreviewPart(idx)
            focusBiblePart(idx)
          }
        } else if (e.key === 'ArrowLeft') {
          // Painel central → volta para escolher o verso.
          e.preventDefault()
          if (focusIsBiblePart()) bibleRef.current?.focusCurrent()
        }
      } else if (zone === 'library' && libTab === 'letras') {
        // Lista de músicas: cima/baixo navega, direita entra, esquerda não faz nada
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          nudgeLibrarySongList(e.key === 'ArrowDown' ? 1 : -1)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          enterBrowsedSong()
        }
      } else if (zone === 'navegador') {
        // Dentro da música: cima/baixo troca de linha, esquerda volta pra lista
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          nudgePreview(e.key === 'ArrowDown' ? 1 : -1)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          exitToLibrarySong()
        }
      } else {
        // Setas andam sempre no mesmo sentido (frente/trás = cima/baixo)
        const delta =
          e.key === 'ArrowRight' || e.key === 'ArrowDown'
            ? 1
            : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
              ? -1
              : 0
        if (delta) {
          e.preventDefault()
          setAutoSuppressUntil(Date.now() + 4000)
          if (zone === 'library') nudgeLibrary(delta)
          else if (zone === 'plano') nudgePlano(delta)
          else nudgePreview(delta)
        }
      }
      // Espaço / Enter = ao vivo + arma a próxima linha
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setAutoSuppressUntil(Date.now() + 4000)
        if (bibleNav) {
          // Consome as partes do intervalo atual antes de pular pro próximo:
          // senão um versículo repartido perderia o final ao avançar.
          const parts = biblePartsRef.current
          const armed = biblePreviewPart
          const live = biblePartIdxRef.current
          if (biblePreview && parts && parts.lines.length > 1) {
            // Parte armada diferente da que está no ar: projeta a armada.
            // Senão segue em frente; só troca de intervalo no fim das partes.
            // armed < 0 = acabaram as partes deste intervalo.
            if (armed >= 0 && armed !== live) void goLiveBible(biblePreview, armed)
            else if (live + 1 < parts.lines.length)
              void goLiveBible(biblePreview, live + 1)
            else bibleRef.current?.liveAndAdvance()
          } else {
            bibleRef.current?.liveAndAdvance()
          }
        } else void takeLiveAndAdvance()
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        void toggleProgramLive()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (confirmRemovePlanItem) {
          setConfirmRemovePlanItem(null)
          return
        }
        if (confirmDeleteMediaItem) {
          setConfirmDeleteMediaItem(null)
          return
        }
        if (showArtisticKeywords) {
          setShowArtisticKeywords(false)
          return
        }
        if (saveAsOpen) {
          setSaveAsOpen(false)
          return
        }
        if (songEditorTarget) {
          setSongEditorTarget(null)
          return
        }
        if (cameraEditDraft) {
          setCameraEditDraft(null)
          return
        }
        if (showCameras) {
          setShowCameras(false)
          return
        }
        if (showMediaUrl) {
          setShowMediaUrl(false)
          return
        }
        // Fecha a exibição (black)
        onLiveChange({ visible: false })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!importMenuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (!importMenuRef.current?.contains(e.target as Node)) {
        setImportMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [importMenuOpen])

  useEffect(() => {
    if (!quickFitMenuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (!quickFitMenuRef.current?.contains(e.target as Node)) {
        setQuickFitMenuOpen(null)
      }
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [quickFitMenuOpen])

  useEffect(() => {
    if (!songBgMenuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (!songBgMenuRef.current?.contains(e.target as Node)) {
        setSongBgMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [songBgMenuOpen])

  async function refreshCameras(): Promise<MediaDeviceInfo[]> {
    try {
      await window.projection?.cameraEnsureAccess?.()
    } catch {
      /* ignore */
    }
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      })
      tmp.getTracks().forEach((t) => t.stop())
    } catch {
      /* permissão pendente */
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cams = devices.filter((d) => d.kind === 'videoinput')
      setCameras(cams)
      return cams
    } catch {
      setCameras([])
      return []
    }
  }

  /** Garante item de câmera no plano (Enter / takeLive). Não liga fundo. */
  function ensureDefaultCamera(cams: MediaDeviceInfo[]) {
    const first = cams[0]
    if (!first) return null
    const label = first.label || 'Câmera 1'
    const item: PlanItem = {
      id: 'cam-default',
      kind: 'camera',
      label,
      lines: ['[ câmera ao vivo ]'],
      cameraDeviceId: first.deviceId,
      source: 'camera',
    }
    setPlan((p) => {
      const rest = p.filter((x) => x.id !== 'cam-default' && x.kind !== 'camera')
      return [item, ...rest]
    })
    setPreviewId('cam-default')
    setPreviewSlide(0)
    return item
  }

  async function bootCameras() {
    const cams = await refreshCameras()
    const cfg = await window.projection?.getOutputConfig?.()
    if (!cams.length) return

    // Sempre restaura a última câmera no select (mesmo com fundo desligado)
    const remembered =
      (cfg?.bgCameraDeviceId &&
        cams.find((cam) => cam.deviceId === cfg.bgCameraDeviceId)?.deviceId) ||
      null
    if (remembered) setBgCameraId(remembered)

    if (!cfg?.bgCameraEnabled) {
      setBgCameraEnabled(false)
      return
    }

    const preferred = remembered || cams[0]?.deviceId || null
    if (!preferred) return
    setBgCameraId(preferred)
    setBgCameraEnabled(true)
    // Restaura fundo só se o programa ainda não tiver câmera própria
    if (live.kind !== 'camera' && !live.cameraDeviceId) {
      onLiveChange({
        cameraDeviceId: preferred,
        themeOverride: {
          ...(live.themeOverride || theme),
          backgroundImage: null,
          backgroundVideo: null,
        },
      })
    }
  }

  function persistBgCameraPref(enabled: boolean, deviceId: string | null) {
    // Mantém o deviceId no disco mesmo desligado — histórico da última usada
    void window.projection?.setOutputConfig?.({
      bgCameraEnabled: enabled,
      bgCameraDeviceId: deviceId,
    })
  }

  async function loadHolyricsAuto() {
    const api = window.projection
    if (!api?.holyricsImportAuto) {
      setImportStatus('API Holyrics indisponível')
      return
    }
    setImporting(true)
    try {
      const result = await api.holyricsImportAuto()
      if (result.library?.length) {
        applyImported(
          result.library as PlanItem[],
          result.meta?.path,
          result.meta?.count ?? result.library.length,
        )
      } else {
        setImportStatus('Nenhuma música — use + Música ou Importar Holyrics')
      }
    } catch (err) {
      setImportStatus(`Falha ao carregar letras: ${String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  async function importViaDialog() {
    const api = window.projection
    if (!api?.holyricsImportDialog) return
    setImporting(true)
    try {
      const result = await api.holyricsImportDialog()
      if (result.canceled) return
      if (result.library?.length) {
        applyImported(
          result.library as PlanItem[],
          result.meta?.path,
          result.meta?.count ?? result.library.length,
        )
      } else {
        setImportStatus('Arquivo sem músicas')
      }
    } catch (err) {
      setImportStatus(`Falha ao importar: ${String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  function applyImported(
    items: PlanItem[],
    filePath?: string | null,
    count?: number,
  ) {
    setLibrary(
      items.map((i) => ({
        ...i,
        kind: (i.kind || 'lyrics') as LiveKind,
        libraryId: i.libraryId || i.id,
        label: i.label || i.title || i.id,
        lines: i.lines || [],
      })),
    )
    const name = filePath ? String(filePath).split('/').pop() : null
    setImportStatus(
      `${count ?? items.length} músicas` + (name ? ` · ${name}` : ''),
    )
  }

  function toPlanSong(
    song: {
      id: string
      title: string
      artist: string | null
      label: string
      lines: string[]
      sections?: LyricSection[] | null
      kind: 'lyrics'
      themeId?: string | null
    },
    prev?: PlanItem | null,
  ): PlanItem {
    return {
      id: song.id,
      libraryId: song.id,
      kind: 'lyrics',
      label: song.label,
      title: song.title,
      artist: song.artist || undefined,
      lines: song.lines,
      sections: song.sections ?? prev?.sections ?? null,
      source: prev?.source || 'local',
      phraseStyles: prev?.phraseStyles,
      themeId:
        song.themeId !== undefined ? song.themeId : (prev?.themeId ?? null),
      uppercase: prev?.uppercase,
    }
  }

  async function saveSongFromEditor(song: {
    id: string
    title: string
    artist: string | null
    label: string
    lines: string[]
    sections?: LyricSection[]
    kind: 'lyrics'
    themeId?: string | null
  }) {
    const prev =
      songEditorTarget && songEditorTarget !== 'new' ? songEditorTarget : null
    const key = prev ? songKey(prev) : song.id
    const next = toPlanSong({ ...song, id: key }, prev)
    // Garante sections no payload do upsert (não perde no merge do disco)
    const upsertPayload = {
      ...next,
      id: key,
      libraryId: key,
      lines: song.lines,
      sections: Array.isArray(song.sections) ? song.sections : next.sections ?? null,
    }
    // trim phraseStyles to lines length
    if (
      upsertPayload.phraseStyles &&
      upsertPayload.phraseStyles.length > upsertPayload.lines.length
    ) {
      upsertPayload.phraseStyles = upsertPayload.phraseStyles.slice(
        0,
        upsertPayload.lines.length,
      )
    }
    const saved = await window.projection?.songUpsert?.(upsertPayload as never)
    if (!saved) {
      toastAlert('Não foi possível salvar a música.')
      return
    }
    const savedSections = (saved as { sections?: LyricSection[] | null })
      .sections
    const item = toPlanSong(
      {
        id: saved.id || key,
        title: saved.title || next.title || song.title,
        artist: (saved.artist ?? next.artist) || null,
        label: saved.label || next.label,
        lines: saved.lines?.length ? saved.lines : song.lines,
        sections: song.sections ?? savedSections ?? next.sections ?? null,
        kind: 'lyrics',
        themeId: song.themeId ?? next.themeId ?? null,
      },
      { ...next, ...saved, sections: song.sections ?? savedSections ?? next.sections },
    )
    await window.projection?.songSaveStyles?.({
      songId: item.id,
      phraseStyles: item.phraseStyles || [],
      themeId: item.themeId ?? null,
      uppercase: item.uppercase ?? null,
    })
    setLibrary((lib) => {
      const idx = lib.findIndex((s) => s.id === item.id || s.libraryId === item.id)
      if (idx >= 0) {
        const copy = [...lib]
        copy[idx] = { ...copy[idx], ...item }
        return copy
      }
      return [item, ...lib]
    })
    patchSongInLibraryAndPlan(item.id, {
      title: item.title,
      artist: item.artist,
      label: item.label,
      lines: item.lines,
      sections: item.sections,
      phraseStyles: item.phraseStyles,
      themeId: item.themeId ?? null,
    })
    // Atualiza itens do plano com o mesmo libraryId
    setPlan((p) =>
      p.map((x) =>
        songKey(x) === item.id
          ? {
              ...x,
              title: item.title,
              artist: item.artist,
              label: item.label,
              lines: item.lines,
              sections: item.sections,
              phraseStyles: item.phraseStyles,
              themeId: item.themeId ?? null,
            }
          : x,
      ),
    )
    if (previewItem && songKey(previewItem) === item.id) {
      setPreviewSlide((s) => Math.min(s, Math.max(0, item.lines.length - 1)))
    }
    // Se a música está no ar, recoloca o slide atual com o conteúdo novo
    const livePlanId = liveSlot?.itemId
    if (live.visible && live.kind === 'lyrics' && livePlanId) {
      const onAir =
        plan.find((p) => p.id === livePlanId) ||
        (previewItem?.id === livePlanId ? previewItem : null)
      if (onAir && songKey(onAir) === item.id) {
        void takeLive(
          {
            ...onAir,
            ...item,
            id: livePlanId,
            libraryId: item.id,
          },
          liveSlot?.idx ?? 0,
          { forceRestart: false },
        )
      }
    }
    setSongEditorTarget(null)
    setLibTab('letras')
    toastInfo('Música salva.')
  }

  async function removeLibrarySong(item: PlanItem) {
    if (item.kind !== 'lyrics') return
    const ok = window.confirm(`Remover “${item.label}” da biblioteca?`)
    if (!ok) return
    const key = songKey(item)
    const result = await window.projection?.songDelete?.(key)
    if (result?.songs) {
      applyImported(result.songs as PlanItem[], 'library/songs.json', result.songs.length)
    } else {
      setLibrary((lib) => lib.filter((s) => s.id !== key && s.libraryId !== key))
    }
    setPlan((p) => p.filter((x) => songKey(x) !== key))
    if (previewItem && songKey(previewItem) === key) {
      setPreviewId(undefined)
      setPreviewSlide(0)
    }
  }

  async function persistSlideLines(item: PlanItem, lines: string[]) {
    const next = { ...item, lines, libraryId: songKey(item) }
    await window.projection?.songUpsert?.(next as any)
    patchSongInLibraryAndPlan(songKey(item), { lines })
    setPlan((p) =>
      p.map((x) => (x.id === item.id || songKey(x) === songKey(item) ? { ...x, lines } : x)),
    )
  }

  function selectPreview(item: PlanItem, idx = 0) {
    // Só limpa a navegação solta se for um item DIFERENTE (senão perderia o
    // "ainda não commitado" ao só andar de linha dentro da mesma música).
    if (!(browsingItem && browsingItem.id === item.id)) {
      setBrowsingItem(null)
    }
    const songChanged = item.id !== previewId
    setPreviewId(item.id)
    setPreviewSlide(idx)
    if (stackArtistic && item.kind === 'lyrics') {
      // Lê ordem/origem atuais via refs para não perder clique com closure stale.
      const prevOrder = stackOrderRef.current
      const prevOrigin = stackOriginRef.current
      const next = nextArtisticStack(prevOrder, prevOrigin, idx, {
        songChanged,
        // Criativo sem Max é uma frase por vez. Sem este teto aqui o Preview
        // voltava ao padrão 3 — o takeLive capava, a navegação não.
        max: stackArtisticMax ? 3 : 1,
      })
      stackOrderRef.current = next.order
      stackOriginRef.current = next.origin
      setStackOrder(next.order)
      setStackOrigin(next.origin)
    } else {
      stackOrderRef.current = []
      setStackOrder([])
    }
  }

  /**
   * Clique no programa do culto: arma o item no Preview já no 1º slide.
   * Sai da prévia solta da aba Bíblia e reinicia o mosaico artístico.
   */
  function selectPlanItem(item: PlanItem) {
    setBiblePreview(null)
    setBrowsingItem(null)
    setPreviewId(item.id)
    setPreviewSlide(0)
    if (stackArtistic && item.kind === 'lyrics') {
      stackOrderRef.current = [0]
      stackOriginRef.current = 0
      setStackOrder([0])
      setStackOrigin(0)
    } else {
      stackOrderRef.current = []
      setStackOrder([])
    }
    if (isDocumentScrollItem(item)) {
      requestAnimationFrame(() => {
        const root = docScrollRef.current
        if (!root) return
        root.scrollTop = 0
        reportDocScroll(root)
      })
    }
  }

  /** PDF: posiciona a página no scroll (sem interromper o gesto de rolar). */
  function focusDocumentPage(item: PlanItem, idx: number) {
    selectPreview(item, idx)
    const root = docScrollRef.current
    const page = root?.querySelector<HTMLElement>(`[data-doc-page="${idx}"]`)
    if (!root || !page) return
    root.scrollTop = page.offsetTop
    reportDocScroll(root)
  }

  async function takeLive(
    item = previewItem,
    idx = previewSlide,
    opts?: { forceRestart?: boolean; plainImage?: boolean },
  ) {
    await ensureProgramOutput()
    // Sem item: bíblia, ou câmera padrão
    if (!item && libTab === 'biblia' && biblePreview) {
      goLiveBible(biblePreview)
      return
    }
    if (!item) {
      const cam =
        plan.find((p) => p.id === 'cam-default') ||
        plan.find((p) => p.kind === 'camera')
      if (cam) {
        await takeLive(cam, 0, opts)
        return
      }
      let cams = cameras
      if (!cams.length) cams = await refreshCameras()
      if (cams[0]) {
        const ready = ensureDefaultCamera(cams)
        if (ready) await takeLive(ready, 0, opts)
      }
      return
    }

    const forceRestart = Boolean(opts?.forceRestart)
    // Duplo clique no plano: o 1º click já armou o preview — forçar slide limpo
    if (forceRestart) {
      setBiblePreview(null)
      if (stackArtistic && item.kind === 'lyrics') {
        stackOrderRef.current = []
        stackOriginRef.current = idx
      } else {
        stackOrderRef.current = []
      }
    }

    setPreviewId(item.id)
    setPreviewSlide(idx)
    setLiveSlot(
      item.kind === 'lyrics' || item.kind === 'bible'
        ? { itemId: item.id, idx }
        : null,
    )

    if (item.kind === 'camera') {
      let deviceId = item.cameraDeviceId || cameras[0]?.deviceId || null
      if (!deviceId) {
        const cams = await refreshCameras()
        if (cams[0]) {
          const ready = ensureDefaultCamera(cams)
          if (ready) await takeLive(ready, 0)
        }
        return
      }
      deviceId = deviceId || cameras[0]?.deviceId || null
      if (!deviceId) return

      // Com saída real: libera webcam do operador; saída abre primeiro; AO VIVO remonta
      // Em simulação: mantém stream só no operador (não há janela de saída)
      if (!simulation) {
        setOperatorCamOff(true)
        releaseAllCameraStreams()
        await sleep(220)
      }

      // Câmera do plano / + Câmera = só vídeo (não herda letra anterior).
      // Câmera de fundo + letra fica no bloco AO VIVO (bgCameraId).
      liveWebItemIdRef.current = null
      await onLiveChange({
        kind: 'camera',
        title: item.label,
        artist: null,
        lines: ['[ câmera ao vivo ]'],
        phraseSlots: null,
        slotThemes: null,
        stackArtistic: false,
        artisticPlan: null,
        cameraDeviceId: deviceId,
        cameraCaption: item.cameraCaption || null,
        cameraPlanItemId: item.id,
        mediaPath: null,
        mediaKind: null,
        mediaSlidePaths: null,
        mediaScrollRatio: 0,
        mediaVoiceIsolate: Boolean(item.mediaVoiceIsolate),
        themeOverride: {
          ...(live.kind === 'bible' ? bibleTheme : theme),
          showTitle: false,
          showArtist: false,
          showLyrics: false,
          backgroundImage: null,
          backgroundVideo: null,
        },
        visible: true,
      })
      if (!simulation) {
        await sleep(350)
        setOperatorCamOff(false)
      }
      return
    }

    setOperatorCamOff(false)

    if (
      item.kind === 'image' ||
      item.kind === 'video' ||
      item.kind === 'audio' ||
      item.kind === 'deck' ||
      item.kind === 'web'
    ) {
      const isAv = item.kind === 'video' || item.kind === 'audio'
      const isWeb = item.kind === 'web'
      const isScrollDoc =
        !opts?.plainImage && (item.kind === 'deck' || item.kind === 'image')
      const deckPaths = isScrollDoc ? documentSlidePaths(item) : null
      let deckPath = isScrollDoc
        ? deckPaths?.[0] || item.mediaPath || null
        : isWeb
          ? (item.id === previewItem?.id ? webBrowseUrl : null) ||
            item.mediaPath ||
            item.webUrl ||
            null
          : item.mediaPath || null
      let mediaKindOut: PlanItem['mediaKind'] =
        item.mediaKind || (item.kind as PlanItem['mediaKind'])
      let slidePathsOut = deckPaths
      const scrollRatio =
        isScrollDoc || isWeb ? docScrollRatioRef.current : 0
      if (isWeb && !isYoutubeWebItem(item)) {
        // Espera o webview pintar antes de capturar o recorte
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        await new Promise((r) => setTimeout(r, 60))
        const framePath = await captureWebLiveFrame()
        if (!framePath) {
          toastInfo('Não foi possível capturar o recorte do site')
          return
        }
        deckPath = framePath
        mediaKindOut = 'image'
        slidePathsOut = null
      }
      liveWebItemIdRef.current = isWeb ? item.id : null
      onLiveChange({
        kind: item.kind,
        title: item.title || item.label,
        artist: item.artist || null,
        lines: isScrollDoc || isWeb ? [] : item.lines,
        phraseSlots: null,
        slotThemes: null,
        stackArtistic: false,
        artisticPlan: null,
        cameraDeviceId: bgCameraEnabled
          ? bgCameraId ||
            (live.kind !== 'camera' ? live.cameraDeviceId || null : null)
          : null,
        cameraCaption: null,
        cameraPlanItemId: null,
        mediaPath: deckPath,
        mediaKind: mediaKindOut,
        mediaFit:
          mediaKindOut === 'image' || mediaKindOut === 'video'
            ? item.mediaFit || 'contain'
            : null,
        mediaSlidePaths: slidePathsOut,
        mediaScrollRatio:
          isWeb && mediaKindOut === 'image' ? 0 : scrollRatio,
        mediaPlaying: isAv ? true : live.mediaPlaying,
        mediaMuted: false,
        mediaLoop: isAv ? true : live.mediaLoop,
        mediaVolume: 1,
        mediaSeekTo: 0,
        mediaSeekSeq: (live.mediaSeekSeq || 0) + 1,
        mediaVoiceIsolate: isAv
          ? Boolean(
              previewPlayback.voiceIsolate ||
                ((live.kind === 'video' || live.kind === 'audio') &&
                  live.mediaVoiceIsolate),
            )
          : false,
        themeOverride: null,
        visible: true,
        showText: true,
      })
      setPreviewPlayback({
        ...DEFAULT_PLAYBACK,
        muted: true,
        playing: true,
        seekTo: 0,
        seekSeq: 1,
        voiceIsolate: Boolean(previewPlayback.voiceIsolate),
      })
      setMediaTime({ current: 0, duration: 0 })
      return
    }

    liveWebItemIdRef.current = null

    const useArtistic = stackArtistic && item.kind === 'lyrics'
    const useArtisticMax = useArtistic && stackArtisticMax
    const useStack = useArtistic
    const songChanged =
      forceRestart || item.id !== previewId
    const stackNext =
      useStack
        ? forceRestart
          ? { order: [idx], origin: idx }
          : nextArtisticStack(
              stackOrderRef.current,
              stackOriginRef.current,
              idx,
              { songChanged, max: useArtisticMax ? 3 : 1 },
            )
        : { order: [] as number[], origin: stackOriginRef.current }
    const order = stackNext.order
    if (useStack) {
      stackOrderRef.current = order
      stackOriginRef.current = stackNext.origin
      setStackOrder(order)
      setStackOrigin(stackNext.origin)
    } else if (!useStack) {
      stackOrderRef.current = []
      setStackOrder([])
    }

    const lines = displayLinesFor(item, idx, useStack, order)
    const phraseSlots = displayPhraseSlots(item, order, useStack)
    const artisticPlan =
      useArtistic && phraseSlots?.length
        ? (() => {
            const resolved = resolveCachedArtisticPlan(
              compositionCacheRef.current,
              phraseSlots,
              `${songKey(item)}:${stackNext.origin}`,
              artisticKeywords,
            )
            compositionCacheRef.current = resolved.cache
            return resolved.plan
          })()
        : null
    // Câmera de fundo é independente da letra/versículo — só se a preferência estiver ligada
    const camId = bgCameraEnabled
      ? bgCameraId ||
        (live.kind !== 'camera' ? live.cameraDeviceId || null : null)
      : null
    if (camId) setBgCameraId(camId)

    const base =
      item.kind === 'bible' ? bibleTheme : theme
    const phraseOverride = phraseThemeOverride(
      base,
      themes,
      item.phraseStyles?.[idx],
      item.themeId,
    )
    // Sempre hidrata mídia da lista (imagem/vídeo do tema nomeado)
    const overrideBase = hydrateThemeMedia(phraseOverride || base, themes)
    let themeOverride =
      phraseOverride || item.uppercase != null
        ? withSongUppercase(overrideBase, item.uppercase)
        : null

    // Mídia de fundo própria da música (sobrepõe o fundo do tema)
    if (item.kind === 'lyrics' && item.bgMediaPath) {
      const t = themeOverride || overrideBase
      themeOverride = {
        ...t,
        backgroundImage: item.bgMediaKind === 'image' ? item.bgMediaPath : null,
        backgroundVideo: item.bgMediaKind === 'video' ? item.bgMediaPath : null,
      }
    }

    // Com câmera de fundo: não carregar vídeo/imagem do tema (libera decoders + prioridade visual)
    if (camId) {
      const t = themeOverride || overrideBase
      themeOverride = {
        ...t,
        backgroundImage: null,
        backgroundVideo: null,
      }
      if (!simulation) {
        setOperatorCamOff(true)
        releaseAllCameraStreams()
        await sleep(220)
      }
    } else {
      setOperatorCamOff(false)
    }

    liveWebItemIdRef.current = null
    await onLiveChange({
      kind: item.kind,
      title: item.title || item.label,
      artist: item.artist || null,
      lines: lines.length ? lines : [item.label],
      phraseSlots,
      slotThemes: buildSlotThemes(item, order, base, themes, useStack),
      stackArtistic: useArtistic,
      artisticPlan,
      cameraDeviceId: camId,
      cameraCaption: null,
      cameraPlanItemId: null,
      mediaPath: null,
      mediaKind: null,
      mediaSlidePaths: null,
      mediaScrollRatio: 0,
      mediaVoiceIsolate: false,
      themeOverride,
      visible: true,
      showText: true,
    })
    if (camId && !simulation) {
      await sleep(350)
      setOperatorCamOff(false)
    }
  }

  function clearCameraBackground() {
    // Não zera bgCameraId — o select continua na última usada
    setBgCameraEnabled(false)
    setOperatorCamOff(false)
    releaseAllCameraStreams()
    persistBgCameraPref(false, bgCameraId)
    if (live.kind !== 'camera') onLiveChange({ cameraDeviceId: null })
  }

  async function setCameraAsBackground(enabled: boolean, deviceId?: string | null) {
    if (!enabled) {
      clearCameraBackground()
      return
    }
    let cams = cameras
    if (!cams.length) cams = await refreshCameras()
    const id =
      deviceId ||
      bgCameraId ||
      live.cameraDeviceId ||
      cams[0]?.deviceId ||
      null
    if (!id) return
    setBgCameraId(id)
    setBgCameraEnabled(true)
    persistBgCameraPref(true, id)
    const keepKind = live.kind && live.kind !== 'camera'
    const baseTheme =
      live.themeOverride || (live.kind === 'bible' ? bibleTheme : theme)
    onLiveChange({
      cameraDeviceId: id,
      mediaPath: keepKind ? live.mediaPath : null,
      mediaKind: keepKind ? live.mediaKind : null,
      themeOverride: {
        ...baseTheme,
        backgroundImage: null,
        backgroundVideo: null,
      },
      visible: live.visible,
      showText: true,
    })
  }

  /** Move o foco de teclado para a linha do Preview e a traz à vista. */
  function focusPhrase(idx: number) {
    requestAnimationFrame(() => {
      const el = phrasesRef.current?.querySelector<HTMLElement>(
        `[data-phrase-idx="${idx}"]`,
      )
      if (!el) return
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'nearest' })
    })
  }

  /** Detecta em qual dos 3 painéis navegáveis o foco de teclado está. */
  /** Foco num dos botões de parte do intervalo bíblico (painel central). */
  function focusBiblePart(idx: number) {
    const el = document.querySelector<HTMLElement>(
      `[data-bible-part="${Math.max(0, idx)}"]`,
    )
    el?.focus()
  }

  /** O foco está numa parte do intervalo bíblico? */
  function focusIsBiblePart(): boolean {
    const el = document.activeElement as HTMLElement | null
    return Boolean(el?.dataset?.biblePart != null)
  }

  function getFocusZone(): 'library' | 'navegador' | 'plano' | null {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return null
    if (libraryZoneRef.current?.contains(el)) return 'library'
    if (phrasesRef.current?.contains(el)) return 'navegador'
    if (planZoneRef.current?.contains(el)) return 'plano'
    return null
  }

  /** Navegador só existe como painel próprio quando há frases de letra para percorrer. */
  function hasNavegadorZone(): boolean {
    return libTab === 'letras' && previewItem?.kind === 'lyrics'
  }

  function zoneOrder(): Array<'library' | 'navegador' | 'plano'> {
    return hasNavegadorZone() ? ['library', 'navegador', 'plano'] : ['library', 'plano']
  }

  /** Move o foco para o 1º item do painel e já o arma (pronto pra seta navegar). */
  function focusZoneFirst(zone: 'library' | 'navegador' | 'plano') {
    if (zone === 'navegador') {
      if (previewItem) selectPreview(previewItem, 0)
      focusPhrase(0)
      return
    }
    if (zone === 'plano') {
      const first = plan[0]
      if (first) selectPlanItem(first)
      requestAnimationFrame(() => {
        const el = planZoneRef.current?.querySelector<HTMLElement>('.plan-item')
        el?.focus({ preventScroll: true })
        el?.scrollIntoView({ block: 'nearest' })
      })
      return
    }
    focusLibraryContentFirst(libTab)
  }

  /** Foca o 1º conteúdo pronto pra navegar da sub-aba `t` (letras/bíblia/mídia). */
  function focusLibraryContentFirst(t: 'letras' | 'biblia' | 'midia') {
    if (t === 'biblia') {
      // Tira o foco de onde estava (ex.: item do plano) antes de tentar focar
      // o verso — se os versos ainda não carregaram, o foco velho não some
      // e as setas ficam "presas" nele até o BiblePanel focar de verdade.
      ;(document.activeElement as HTMLElement | null)?.blur()
      bibleRef.current?.focusCurrent()
      return
    }
    if (t === 'letras') {
      focusLibraryFirstSong()
      return
    }
    const first = mediaLibrary[0]
    if (first) previewLibraryItem(first)
    requestAnimationFrame(() => {
      const el = libraryZoneRef.current?.querySelector<HTMLElement>('.lib-item')
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest' })
    })
  }

  /** Clique/Ctrl+Tab na sub-aba: troca e já foca o conteúdo pra navegar. */
  function switchLibTab(t: 'letras' | 'biblia' | 'midia') {
    setLibTab(t)
    requestAnimationFrame(() => focusLibraryContentFirst(t))
  }

  /**
   * Foca a 1ª música da lista SEM adicionar ao plano — é só navegação.
   * Só entra pra valer no plano quando confirmado (Enter) ou explicitamente
   * aberta (seta direita).
   */
  function focusLibraryFirstSong() {
    const first = filteredLibrary[0]
    if (first) {
      setBrowsingItem(first)
      setPreviewSlide(0)
    }
    requestAnimationFrame(() => {
      const el = libraryZoneRef.current?.querySelector<HTMLElement>('.lib-item')
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest' })
    })
  }

  /** Setas cima/baixo na lista de músicas: só navega (não entra no plano). */
  function nudgeLibrarySongList(delta: number) {
    if (!filteredLibrary.length) return
    const buttons =
      libraryZoneRef.current?.querySelectorAll<HTMLElement>('.lib-item') ?? null
    const current = document.activeElement as HTMLElement | null
    const idx = current && buttons ? Array.from(buttons).indexOf(current) : -1
    const base = idx >= 0 ? idx : 0
    const next = idx >= 0 ? base + delta : base
    if (next < 0 || next >= filteredLibrary.length) return
    const item = filteredLibrary[next]
    setBrowsingItem(item)
    setPreviewSlide(0)
    requestAnimationFrame(() => {
      const el = libraryZoneRef.current?.querySelectorAll<HTMLElement>('.lib-item')[next]
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest' })
    })
  }

  /** Seta direita na lista de músicas: entra na música (1º slide), sem commitar. */
  function enterBrowsedSong() {
    const item = browsingItem ?? filteredLibrary[0]
    if (!item) return
    if (!browsingItem) setBrowsingItem(item)
    setPreviewSlide(0)
    focusPhrase(0)
  }

  /** Seta esquerda dentro da música: volta o foco pra lista de músicas. */
  function exitToLibrarySong() {
    const item = browsingItem ?? previewItem
    requestAnimationFrame(() => {
      const buttons =
        libraryZoneRef.current?.querySelectorAll<HTMLElement>('.lib-item')
      if (!buttons || !item) return
      const idx = filteredLibrary.findIndex((x) => x.id === item.id)
      const el = buttons[idx >= 0 ? idx : 0]
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest' })
    })
  }

  /** Tab: alterna entre os painéis, sempre pousando no 1º item navegável. */
  function tabToZone(delta: number) {
    const order = zoneOrder()
    const current = getFocusZone()
    const idx = current ? order.indexOf(current) : -1
    const nextIdx = idx < 0 ? 0 : (idx + delta + order.length) % order.length
    focusZoneFirst(order[nextIdx])
  }

  /** Setas dentro do painel Biblioteca (letras/mídia): percorre a lista plana. */
  function nudgeLibrary(delta: number) {
    const list = libTab === 'letras' ? filteredLibrary : mediaLibrary
    if (!list.length) return
    const buttons =
      libraryZoneRef.current?.querySelectorAll<HTMLElement>('.lib-item') ?? null
    const current = document.activeElement as HTMLElement | null
    const idx = current && buttons ? Array.from(buttons).indexOf(current) : -1
    const base = idx >= 0 ? idx : 0
    const next = idx >= 0 ? base + delta : base
    if (next < 0 || next >= list.length) return
    const item = list[next]
    previewLibraryItem(item)
    requestAnimationFrame(() => {
      const el = libraryZoneRef.current?.querySelectorAll<HTMLElement>('.lib-item')[next]
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest' })
    })
  }

  /** Setas dentro do painel Programa do culto: percorre a ordem do plano. */
  function nudgePlano(delta: number) {
    if (!plan.length) return
    const buttons =
      planZoneRef.current?.querySelectorAll<HTMLElement>('.plan-item') ?? null
    const current = document.activeElement as HTMLElement | null
    const idx = current && buttons ? Array.from(buttons).indexOf(current) : -1
    const base = idx >= 0 ? idx : 0
    const next = idx >= 0 ? base + delta : base
    if (next < 0 || next >= plan.length) return
    const item = plan[next]
    selectPlanItem(item)
    requestAnimationFrame(() => {
      const el = planZoneRef.current?.querySelectorAll<HTMLElement>('.plan-item')[next]
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest' })
    })
  }

  /** Item do plano com foco de teclado (ou o armado, se nada estiver focado). */
  function focusedPlanItem(): PlanItem | null {
    const buttons = planZoneRef.current?.querySelectorAll<HTMLElement>('.plan-item')
    const el = document.activeElement as HTMLElement | null
    const idx = buttons && el ? Array.from(buttons).indexOf(el) : -1
    if (idx >= 0) return plan[idx] ?? null
    return plan.find((p) => p.id === previewId) ?? null
  }

  function confirmRemoveFromPlan() {
    if (!confirmRemovePlanItem) return
    removeFromPlan(confirmRemovePlanItem.id)
    setConfirmRemovePlanItem(null)
  }

  /** Item de mídia com foco de teclado (ou o armado, se nada estiver focado). */
  function focusedMediaItem(): PlanItem | null {
    const buttons = libraryZoneRef.current?.querySelectorAll<HTMLElement>('.lib-item')
    const el = document.activeElement as HTMLElement | null
    const idx = buttons && el ? Array.from(buttons).indexOf(el) : -1
    if (idx >= 0) return mediaLibrary[idx] ?? null
    return browsingItem && browsingItem.kind !== 'lyrics' ? browsingItem : null
  }

  async function confirmDeleteMedia() {
    const item = confirmDeleteMediaItem
    if (!item) return
    const result = await window.projection?.mediaDelete?.({
      id: item.id,
      kind: item.kind,
    })
    if (!result?.ok) {
      toastInfo(result?.error || 'Falha ao remover mídia')
      setConfirmDeleteMediaItem(null)
      return
    }
    const idx = mediaLibrary.findIndex((x) => x.id === item.id)
    const nextList = mediaLibrary.filter((x) => x.id !== item.id)
    setMediaLibrary(nextList)
    setPlan((p) => p.filter((x) => (x.libraryId || x.id) !== item.id))
    setConfirmDeleteMediaItem(null)
    toastAlert(`Removido: ${item.label}`)

    // Move a seleção pro próximo item (ou o anterior, se era o último).
    if (nextList.length) {
      const nextIdx = Math.min(Math.max(idx, 0), nextList.length - 1)
      previewLibraryItem(nextList[nextIdx])
      requestAnimationFrame(() => {
        const el =
          libraryZoneRef.current?.querySelectorAll<HTMLElement>('.lib-item')[nextIdx]
        el?.focus({ preventScroll: true })
        el?.scrollIntoView({ block: 'nearest' })
      })
    } else if (browsingItem?.id === item.id) {
      setBrowsingItem(null)
    }
  }

  /** Setas: andam só no Preview. Quem manda ao ar é o Enter. */
  function nudgePreview(delta: number) {
    if (!previewItem) return
    if (previewItem.kind === 'camera') return
    // Fica na música: só a Bíblia pula pro próximo/anterior na borda.
    const next = previewSlide + delta
    // Páginas de PDF/imagem não são repartidas; letra e versículo caminham
    // pelas PARTES derivadas do tema.
    const total =
      previewItem.slidePaths?.length || previewDerived.lines.length
    if (next < 0 || next >= total) {
      return
    }
    if (previewItem.kind === 'deck') {
      focusDocumentPage(previewItem, next)
    } else {
      selectPreview(previewDerivedItem ?? previewItem, next)
      focusPhrase(next)
    }
  }

  /**
   * Arma a linha seguinte no Preview após um item ir ao ar — mesmo
   * comportamento do Enter, reaproveitado pelo duplo clique (plano,
   * biblioteca, lista de frases). Na última linha o foco fica onde está
   * (a seta é quem troca de item).
   */
  function armNextSlide(item: PlanItem, idx: number) {
    if (item.kind !== 'lyrics' && item.kind !== 'bible') return
    const next = idx + 1
    if (next >= item.lines.length) {
      focusPhrase(idx)
      return
    }
    selectPreview(item, next)
    focusPhrase(next)
  }

  /**
   * Enter: projeta a linha do Preview e já arma a seguinte.
   * Na última linha o foco fica onde está (a seta é quem troca de item).
   */
  async function takeLiveAndAdvance() {
    let item = previewItem
    if (!item) {
      await takeLive()
      return
    }
    // Só entra pra valer no plano quando confirmado (Enter/Espaço).
    if (browsingItem && browsingItem.id === item.id) {
      const committed = selectLibraryItem(browsingItem)
      setBrowsingItem(null)
      item = committed ?? item
    }
    const idx = previewSlide
    // Vai ao ar a PARTE selecionada, não a linha escrita inteira — assim o
    // overlay e o NDI recebem exatamente o que está na tela.
    const derived =
      item === previewItem && previewDerivedItem ? previewDerivedItem : item
    await takeLive(derived, idx)
    armNextSlide(derived, idx)
  }

  /**
   * Auto: linha detectada → AO VIVO (mesma música ou outro item do plano).
   * Preview arma a seguinte.
   */
  autoAdvanceCbRef.current = (target: AutoGoLiveTarget) => {
    const item = plan.find((p) => p.id === target.planItemId)
    if (!item || (item.kind !== 'lyrics' && item.kind !== 'bible')) {
      console.warn('[auto-advance] goLive item inválido', target.planItemId)
      return
    }
    const derived =
      previewItem?.id === item.id && previewDerivedItem
        ? previewDerivedItem
        : (() => {
            const base = item.kind === 'bible' ? bibleTheme : theme
            const resolved = phraseThemeOverride(
              base,
              themes,
              undefined,
              item.themeId,
            )
            const itemTheme = hydrateThemeMedia(resolved || base, themes)
            return withDerivedLines(
              item,
              deriveSlidesForTheme(item.lines, itemTheme, outputAreaValue),
            )
          })()
    const lines = derived.lines ?? []
    if (target.slideIndex < 0 || target.slideIndex >= lines.length) {
      console.warn(
        '[auto-advance] goLive índice fora',
        target.slideIndex,
        lines.length,
      )
      return
    }
    if (
      live.visible &&
      liveSlot &&
      liveSlot.itemId === target.planItemId &&
      target.slideIndex === liveSlot.idx
    ) {
      console.info('[auto-advance] goLive já no ar', target.slideIndex)
      return
    }
    console.info(
      '[auto-advance] takeLive',
      target.planItemId.slice(0, 10),
      target.slideIndex,
      (lines[target.slideIndex] || '').slice(0, 60),
    )
    void takeLive(derived, target.slideIndex, { forceRestart: false }).then(
      () => armNextSlide(derived, target.slideIndex),
    )
  }

  function addToPlan(item: PlanItem) {
    const copy = {
      ...item,
      libraryId: item.libraryId || item.id,
      id: `${item.id}-${Date.now()}`,
    }
    setPlan((p) => [...p, copy])
    if (!previewId) selectPreview(copy, 0)
    return copy
  }

  /** Duplo clique no plano: Preview no 1º slide + AO VIVO + arma a seguinte. */
  function takeLiveFromPlan(item: PlanItem) {
    selectPlanItem(item)
    void takeLive(item, 0, { forceRestart: true }).then(() => armNextSlide(item, 0))
  }

  /** 1 clique na biblioteca: abre no preview (e no plano se ainda não estiver) */
  /**
   * Clique/seta simples na biblioteca: só arma no Preview — não entra no
   * plano do culto. Só vira item de verdade com Enter, duplo clique, ou
   * arrastando pro plano (ação intencional).
   */
  function previewLibraryItem(item: PlanItem) {
    setBiblePreview(null)
    setBrowsingItem(item)
    setPreviewSlide(0)
  }

  function selectLibraryItem(item: PlanItem) {
    const key = songKey(item)
    const existing = plan.find((p) => songKey(p) === key && p.kind === item.kind)
    if (existing) {
      // Preferir metadados frescos da biblioteca (ex.: PDF re-rasterizado)
      const merged =
        item.kind === 'deck' && item.slidePaths?.length
          ? {
              ...existing,
              slidePaths: item.slidePaths,
              lines: item.lines?.length ? item.lines : existing.lines,
              mediaPath: item.mediaPath || existing.mediaPath,
            }
          : existing
      if (merged !== existing) {
        setPlan((p) => p.map((x) => (x.id === existing.id ? merged : x)))
      }
      selectPlanItem(merged)
      return merged
    }
    const copy = addToPlan(item)
    selectPlanItem(copy)
    return copy
  }

  /** 2 cliques: preview + envia para a apresentação + arma a seguinte */
  function takeLiveFromLibrary(item: PlanItem) {
    const target = selectLibraryItem(item)
    void takeLive(target, 0, { forceRestart: true }).then(() =>
      armNextSlide(target, 0),
    )
  }

  function patchSongInLibraryAndPlan(key: string, patch: Partial<PlanItem>) {
    setLibrary((lib) =>
      lib.map((s) => (s.id === key || s.libraryId === key ? { ...s, ...patch } : s)),
    )
    setPlan((p) =>
      p.map((s) =>
        songKey(s) === key || s.id === key ? { ...s, ...patch } : s,
      ),
    )
    setBrowsingItem((b) =>
      b && (songKey(b) === key || b.id === key || b.libraryId === key)
        ? { ...b, ...patch }
        : b,
    )
  }

  /** Tema / maiúsculas da música — atualiza biblioteca, plano e AO VIVO se for a mesma. */
  function applySongPresentation(
    item: PlanItem,
    patch: { themeId?: string | null; uppercase?: boolean | null },
  ) {
    if (item.kind !== 'lyrics') return
    patchSongInLibraryAndPlan(songKey(item), patch)
    setPlan((p) =>
      p.map((x) => (x.id === item.id ? { ...x, ...patch } : x)),
    )
    const nextItem = { ...item, ...patch }
    const liveTitle = live.title
    const songTitle = nextItem.title || nextItem.label
    if (
      live.visible &&
      live.kind === 'lyrics' &&
      liveTitle === songTitle
    ) {
      const base = theme
      const phraseOverride = phraseThemeOverride(
        base,
        themes,
        nextItem.phraseStyles?.[previewSlide],
        nextItem.themeId,
      )
      onLiveChange({
        slotThemes: buildSlotThemes(
          nextItem,
          stackOrder,
          base,
          themes,
          stackingEnabled,
        ),
        themeOverride:
          phraseOverride || nextItem.uppercase != null
            ? withSongUppercase(phraseOverride || base, nextItem.uppercase)
            : null,
      })
    }
  }

  /**
   * Mídia de fundo da música — temporária (só memória) até "Salvar".
   * Mesmo padrão de applySongPresentation.
   */
  /**
   * Mídia de fundo da música — só Preview (e memória: plano/biblioteca).
   * Não atualiza o AO VIVO mesmo se essa música já estiver no ar — só na
   * próxima vez que for enviada (Enter), igual troca de tema/maiúsculas
   * já deveria funcionar, mas aqui é proposital: o operador decide quando
   * a mudança visual vai ao ar.
   */
  function applySongBackground(
    item: PlanItem,
    patch: { bgMediaPath?: string | null; bgMediaKind?: 'image' | 'video' | null },
  ) {
    if (item.kind !== 'lyrics') return
    patchSongInLibraryAndPlan(songKey(item), patch)
    setPlan((p) => p.map((x) => (x.id === item.id ? { ...x, ...patch } : x)))
    if (patch.bgMediaPath) {
      addRecentBgMedia(patch.bgMediaPath, patch.bgMediaKind || 'image')
    }
  }

  async function pickSongBackground(item: PlanItem) {
    const result = await window.projection?.pickThemeBackground?.()
    if (!result || result.canceled || !result.path) return
    applySongBackground(item, {
      bgMediaPath: result.path,
      bgMediaKind: result.kind === 'video' ? 'video' : 'image',
    })
  }

  function addArtisticKeyword() {
    const additions = artisticKeywordDraft
      .split(/[,\n]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    if (!additions.length) return
    setArtisticKeywords((current) =>
      saveArtisticKeywords([...current, ...additions]),
    )
    setArtisticKeywordDraft('')
  }

  function removeArtisticKeyword(keyword: string) {
    setArtisticKeywords((current) =>
      saveArtisticKeywords(current.filter((item) => item !== keyword)),
    )
  }

  async function savePhraseStylesForSong(item: PlanItem) {
    const key = songKey(item)
    await window.projection?.songSaveStyles?.({
      songId: key,
      phraseStyles: item.phraseStyles || [],
      themeId: item.themeId ?? null,
      uppercase: item.uppercase ?? null,
      bgMediaPath: item.bgMediaPath ?? null,
      bgMediaKind: item.bgMediaKind ?? null,
    })
    toastAlert('Estilos salvos na música')
  }

  function setPhraseStyle(partial: PhraseStyle | null) {
    if (!previewItem || previewItem.kind !== 'lyrics') return
    const styles = [...(previewItem.phraseStyles || [])] as Array<PhraseStyle | null>
    while (styles.length <= previewSlide) styles.push(null)
    styles[previewSlide] = partial
    patchSongInLibraryAndPlan(songKey(previewItem), { phraseStyles: styles })
    const nextItem = { ...previewItem, phraseStyles: styles }
    const useStack = stackingEnabled
    const liveTitle = live.title
    const songTitle = nextItem.title || nextItem.label
    if (live.visible && live.kind === 'lyrics' && liveTitle === songTitle) {
      const base = theme
      const phraseOverride = phraseThemeOverride(
        base,
        themes,
        styles[previewSlide],
        nextItem.themeId,
      )
      onLiveChange({
        slotThemes: buildSlotThemes(nextItem, stackOrder, base, themes, useStack),
        themeOverride:
          phraseOverride || nextItem.uppercase != null
            ? withSongUppercase(phraseOverride || base, nextItem.uppercase)
            : null,
      })
    }
  }

  async function goLiveBible(item: BibleItem, partIdx = 0) {
    await ensureProgramOutput()
    setBiblePreview(item)

    // O intervalo inteiro é uma tela só. Se não couber no tema (modo fixo),
    // vira partes emendadas por reticências — mesmo mecanismo da letra.
    const verses = item.lines.length ? item.lines : [item.label]
    const derived = deriveSlidesForTheme(
      [verses.join('\n')],
      bibleTheme,
      outputAreaValue,
    )
    biblePartsRef.current = derived
    const idx = Math.max(0, Math.min(partIdx, derived.lines.length - 1))
    biblePartIdxRef.current = idx
    setBiblePartIdx(idx)
    setBibleLiveId(item.id)
    // Arma a PRÓXIMA parte, como o Enter faz nas frases da música.
    // Na última, NÃO arma nada: o que vem a seguir é o próximo intervalo, que
    // ainda nem está nesta lista. Armar a própria última faria ela aparecer
    // como no ar e como preview ao mesmo tempo.
    setBiblePreviewPart(idx + 1 < derived.lines.length ? idx + 1 : -1)
    const partLines = derived.lines[idx]
      ? derived.lines[idx].split('\n')
      : verses

    setLiveSlot({ itemId: item.id, idx })
    const camId = bgCameraEnabled
      ? bgCameraId || live.cameraDeviceId || null
      : null
    liveWebItemIdRef.current = null
    onLiveChange({
      kind: 'bible',
      title: item.title || item.label,
      artist: null,
      // Vai ao ar a PARTE corrente — overlay e NDI recebem o que está na tela.
      lines: partLines,
      phraseSlots: null,
      slotThemes: null,
      stackArtistic: false,
      artisticPlan: null,
      cameraDeviceId: camId,
      cameraCaption: null,
      cameraPlanItemId: null,
      mediaPath: null,
      mediaKind: null,
      mediaSlidePaths: null,
      mediaScrollRatio: 0,
      mediaVoiceIsolate: false,
      themeOverride: null,
      visible: true,
      showText: true,
    })
  }

  function removeFromPlan(id: string) {
    setPlan((p) => p.filter((x) => x.id !== id))
    if (previewId === id) {
      setPreviewId(undefined)
      setPreviewSlide(0)
    }
  }

  function reorderPlan(fromId: string, toId: string) {
    if (!fromId || !toId || fromId === toId) return
    setPlan((p) => {
      const from = p.findIndex((x) => x.id === fromId)
      const to = p.findIndex((x) => x.id === toId)
      if (from < 0 || to < 0 || from === to) return p
      const next = [...p]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  async function addCameraToPlan(
    device: MediaDeviceInfo,
    options: { goLive: boolean; voiceIsolate: boolean; caption: string },
  ) {
    const label = device.label || `Câmera ${device.deviceId.slice(0, 6)}`
    const item: PlanItem = {
      id: `cam-${device.deviceId || 'default'}-${Date.now()}`,
      kind: 'camera',
      label,
      lines: ['[ câmera ao vivo ]'],
      cameraDeviceId: device.deviceId,
      cameraCaption: options.caption.trim() || null,
      mediaVoiceIsolate: options.voiceIsolate,
      source: 'camera',
    }
    setPlan((p) => [...p, item])
    selectPreview(item, 0)
    setShowCameras(false)
    setCameraPickId(null)
    if (options.goLive) await takeLive(item, 0)
  }

  async function openCameraEditor(item: PlanItem | null, editLive: boolean) {
    const itemId = item?.id || (editLive ? live.cameraPlanItemId || null : null)
    setCameraEditDraft({
      itemId,
      editLive,
      deviceId:
        item?.cameraDeviceId ||
        (editLive ? live.cameraDeviceId : null) ||
        cameras[0]?.deviceId ||
        '',
      caption: item
        ? item.cameraCaption || ''
        : (editLive ? live.cameraCaption : null) || '',
      voiceIsolate: item
        ? Boolean(item.mediaVoiceIsolate)
        : Boolean(editLive && live.mediaVoiceIsolate),
    })
    setCameraEditBusy(true)
    try {
      await refreshCameras()
    } finally {
      setCameraEditBusy(false)
    }
  }

  async function saveCameraEdit() {
    if (!cameraEditDraft?.deviceId) return
    const draft = cameraEditDraft
    const target = draft.itemId
      ? plan.find((item) => item.id === draft.itemId) || null
      : null
    const selectedDeviceIndex = cameras.findIndex(
      (camera) => camera.deviceId === draft.deviceId,
    )
    const selectedDevice = cameras[selectedDeviceIndex]
    const label =
      (selectedDevice
        ? selectedDevice.label || `Câmera ${selectedDeviceIndex + 1}`
        : '') ||
      target?.label ||
      (draft.editLive ? live.title : '') ||
      'Câmera'
    const caption = draft.caption.trim()
    const patch: Partial<PlanItem> = {
      label,
      cameraDeviceId: draft.deviceId,
      cameraCaption: caption || null,
      mediaVoiceIsolate: draft.voiceIsolate,
    }

    if (draft.itemId) {
      setPlan((items) =>
        items.map((item) =>
          item.id === draft.itemId ? { ...item, ...patch } : item,
        ),
      )
    }

    const updateLive =
      live.kind === 'camera' &&
      (draft.itemId
        ? live.cameraPlanItemId === draft.itemId
        : draft.editLive && !live.cameraPlanItemId)
    setCameraEditDraft(null)
    if (updateLive) {
      await onLiveChange({
        title: label,
        cameraDeviceId: draft.deviceId,
        cameraCaption: caption || null,
        mediaVoiceIsolate: draft.voiceIsolate,
      })
    }
  }

  async function insertCameraNow(mode: 'plan' | 'live') {
    setCameraInsertMode(mode)
    setCameraVoiceIsolate(false)
    setCameraCaption('')
    setCameraPickId(null)
    setShowCameras(true)
    setCameraListBusy(true)
    try {
      await refreshCameras()
    } finally {
      setCameraListBusy(false)
    }
  }

  async function confirmCameraPick(deviceId?: string | null) {
    const id = deviceId || cameraPickId
    const cam = cameras.find((c) => c.deviceId === id)
    if (!cam) return
    await addCameraToPlan(cam, {
      goLive: cameraInsertMode === 'live',
      voiceIsolate: cameraVoiceIsolate,
      caption: cameraCaption,
    })
  }

  function mapImportedToCatalog(
    fonts: Array<{ id: string; label: string; value: string }>,
    query: string,
  ) {
    const q = query.trim().toLowerCase()
    return fonts
      .map((f) => {
        const family = f.label.replace(/\s*\(importada\)\s*$/i, '').trim()
        return {
          id: f.id,
          family,
          category: 'imported',
          imported: true as const,
          importedId: f.id,
        }
      })
      .filter((f) => !q || f.family.toLowerCase().includes(q))
  }

  async function importGoogleFont(family: string) {
    if (!family.trim()) return
    setFontBusy(true)
    const result = await window.projection?.fontsImport?.(family.trim())
    setFontBusy(false)
    if (!result?.ok) {
      toastInfo(result?.error || 'Falha ao importar fonte')
      return
    }
    toastAlert(`Fonte ${result.font?.family || family} importada`)
    if (result.css) applyFontCss(result.css)
    const list = await window.projection?.fontsList?.()
    if (list?.options) setImportedFonts(list.options)
    if (fontsInstalledOnly) {
      setFontCatalog(mapImportedToCatalog(list?.options || [], fontQuery))
    } else {
      const catalog = await window.projection?.fontsCatalog?.(fontQuery)
      if (catalog) setFontCatalog(catalog)
    }
  }

  async function removeGoogleFont(importedId: string, family: string) {
    if (!importedId) return
    setFontBusy(true)
    const result = await window.projection?.fontsRemove?.(importedId)
    setFontBusy(false)
    if (!result?.ok) {
      toastInfo(result?.error || 'Falha ao remover fonte')
      return
    }
    toastAlert(`Fonte ${family} removida`)
    const list = await window.projection?.fontsList?.()
    if (list?.options) setImportedFonts(list.options)
    if (list?.css != null) applyFontCss(list.css)
    if (fontsInstalledOnly) {
      setFontCatalog(mapImportedToCatalog(list?.options || [], fontQuery))
    } else {
      const catalog = await window.projection?.fontsCatalog?.(fontQuery)
      if (catalog) setFontCatalog(catalog)
    }
  }

  async function searchFontCatalog(
    q: string,
    installedOnly = fontsInstalledOnly,
  ) {
    setFontQuery(q)
    if (fontSearchTimer.current != null) {
      window.clearTimeout(fontSearchTimer.current)
    }
    const seq = ++fontSearchSeq.current

    if (installedOnly) {
      fontSearchTimer.current = window.setTimeout(() => {
        if (seq !== fontSearchSeq.current) return
        setFontCatalog(mapImportedToCatalog(importedFonts, q))
      }, q.trim() ? 80 : 0)
      return
    }

    fontSearchTimer.current = window.setTimeout(async () => {
      const catalog = await window.projection?.fontsCatalog?.(q)
      if (seq !== fontSearchSeq.current) return
      if (catalog) setFontCatalog(catalog)
    }, q.trim() ? 180 : 0)
  }

  /** Carrega preview tipográfico das fontes listadas (nome na própria face) */
  useEffect(() => {
    if (!fontCatalog.length) return
    const families = fontCatalog.map((f) => f.family).filter(Boolean).slice(0, 24)
    if (!families.length) return
    const familyParams = families
      .map((family) => {
        const fam = encodeURIComponent(family).replace(/%20/g, '+')
        return `family=${fam}:wght@400;600`
      })
      .join('&')
    // Subset só com caracteres dos nomes → CSS leve
    const sample = [...new Set(families.join(''))].join('')
    const href = `https://fonts.googleapis.com/css2?${familyParams}&text=${encodeURIComponent(sample)}&display=swap`
    let link = document.getElementById('ible-font-preview') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = 'ible-font-preview'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    link.href = href
  }, [fontCatalog])

  async function refreshThemes(prefer?: ProjectionTheme[] | null) {
    let next: ProjectionTheme[] | null = null
    if (prefer?.length) {
      next = prefer
    } else {
      try {
        const list = await window.projection?.listThemes?.()
        if (Array.isArray(list) && list.length) next = list
      } catch {
        /* ignore */
      }
    }
    if (next?.length) {
      setThemes(next)
      setThemesRev((n) => n + 1)
    }
    return next || []
  }

  /** Garante que o tema salvo aparece nos selects imediatamente */
  function upsertThemeLocal(saved: ProjectionTheme, fullList?: ProjectionTheme[] | null) {
    if (fullList?.length) {
      setThemes(fullList)
    } else {
      setThemes((prev) => {
        const i = prev.findIndex((t) => t.id === saved.id)
        if (i >= 0) {
          const copy = [...prev]
          copy[i] = saved
          return copy
        }
        return [...prev, saved]
      })
    }
    setThemesRev((n) => n + 1)
  }

  function applyThemesResult(
    result?: { theme?: ProjectionTheme; themes?: ProjectionTheme[] } | null,
  ) {
    const saved = result?.theme
    if (saved) upsertThemeLocal(saved, result?.themes)
    else void refreshThemes(result?.themes)
    return saved
  }

  async function importTheme() {
    const api = window.projection
    if (!api?.importThemeDialog) return
    const result = await api.importThemeDialog()
    if (result.canceled || !result.theme) return
    applyThemesResult(result)
    await refreshThemes(result.themes)
    setThemeQuery('')
    setEditingTheme(result.theme)
    commitTheme(result.theme, true)
    toastAlert(`Tema “${result.theme.name}” importado`)
  }

  async function syncThemesFromDisk(prefer?: ProjectionTheme[] | null) {
    const list = await refreshThemes(prefer)
    return list
  }

  async function persistNamedTheme(
    mode: 'save' | 'save-as' | 'apply',
    saveAsNameArg?: string,
  ) {
    const draft = { ...editingTheme }
    if (!draft.name.trim() && mode !== 'save-as') {
      toastInfo('Dê um nome ao tema')
      return
    }
    try {
      if (mode === 'save-as') {
        const name = String(saveAsNameArg || '').trim()
        if (!name) {
          toastInfo('Informe o nome do novo tema')
          return
        }
        setThemeBusy(true)
        const result = await window.projection?.saveThemeAs?.(draft, name)
        if (!result?.theme) {
          toastInfo('Falha ao criar tema — API indisponível')
          await syncThemesFromDisk()
          return
        }
        setThemeQuery('')
        setSaveAsOpen(false)
        setSaveAsName('')
        // Lista completa do main (fonte da verdade) + fallback local
        const list =
          (result.themes?.length
            ? result.themes
            : await window.projection?.listThemes?.()) || []
        if (list.length) {
          setThemes(list)
          setThemesRev((n) => n + 1)
        } else {
          upsertThemeLocal(result.theme)
        }
        commitTheme(result.theme, true)
        setDefaultThemeId(result.theme.id)
        await syncThemesFromDisk(list.length ? list : null)
        toastAlert(
          `Tema “${result.theme.name}” criado — ${list.length || '?'} na lista`,
        )
      } else if (mode === 'save') {
        setThemeBusy(true)
        const result = await window.projection?.saveTheme?.(draft)
        if (!result?.theme) {
          upsertThemeLocal(draft)
          await syncThemesFromDisk()
          toastAlert(`Tema “${draft.name}” salvo`)
        } else {
          const list = result.themes?.length
            ? result.themes
            : await window.projection?.listThemes?.()
          if (list?.length) {
            setThemes(list)
            setThemesRev((n) => n + 1)
          } else {
            upsertThemeLocal(result.theme)
          }
          commitTheme(result.theme, true)
          await syncThemesFromDisk(list || null)
          toastAlert(`Tema “${result.theme.name}” salvo`)
        }
      } else {
        // Aplicar = só envia o tema para a saída (não marca como "Padrão")
        commitTheme(draft, true)
        toastAlert('Tema aplicado na saída')
      }
    } catch (err) {
      toastInfo(`Falha: ${String(err)}`)
      await syncThemesFromDisk()
    } finally {
      setThemeBusy(false)
    }
  }

  function openSaveAsModal() {
    setSaveAsName(`${editingTheme.name || 'Tema'} (cópia)`)
    setSaveAsOpen(true)
  }

  /** Sempre a lista completa (ordenada) — selects nunca ficam filtrados/desatualizados */
  const themeOptionsSorted = useMemo(
    () =>
      [...themes].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }),
      ),
    [themes],
  )

  /** Select do studio: lista completa + tema em edição se ainda não estiver na lista */
  const themeSelectOptions = useMemo(() => {
    const list = themeOptionsSorted
    if (editingTheme?.id && !list.some((t) => t.id === editingTheme.id)) {
      return [editingTheme, ...list]
    }
    return list
  }, [themeOptionsSorted, editingTheme])

  function mapImportedMedia(
    items: Array<{
      id: string
      kind: string
      label?: string
      title?: string
      path: string | null
      lines: string[]
      note?: string
      slides?: Array<{ index: number; path: string | null; text: string }>
      slidePaths?: Array<string | null>
      sourceUrl?: string
      mime?: string
    }>,
  ): PlanItem[] {
    return items.map((m) => {
      const slidePaths =
        m.slidePaths ||
        m.slides?.map((s) => s.path) ||
        (m.kind === 'image' && m.path
          ? [m.path]
          : m.kind === 'deck' && m.path
            ? [m.path]
            : undefined)
      return {
        id: m.id,
        kind: m.kind as LiveKind,
        label: m.label || m.title || m.id,
        title: m.title || m.label,
        lines: m.lines?.length
          ? m.lines
          : m.slides?.map((s) => s.text) || ['[ mídia ]'],
        mediaPath: m.path,
        mediaKind: m.kind as PlanItem['mediaKind'],
        slidePaths,
        webUrl: m.sourceUrl || (m.kind === 'web' ? m.path : null),
        source: m.sourceUrl || m.kind === 'web' ? 'url' : 'media',
      }
    })
  }

  async function importMedia() {
    const result = await window.projection?.mediaImportDialog?.()
    if (!result || result.canceled) return
    const mapped = mapImportedMedia(result.items || [])
    setMediaLibrary((prev) => [...mapped, ...prev])
    setLibTab('midia')
    if (mapped[0]) previewLibraryItem(mapped[0])
    const notes = [
      result.note,
      ...(result.items || []).map((m) => m.note).filter(Boolean),
    ].filter(Boolean)
    if (notes.length) setMediaNote(String(notes[0]))
    else if (result.ffmpeg === false) {
      setMediaNote('Sem ffmpeg: MP4/MOV/WebM ok; MKV/AVI podem falhar')
    } else {
      setMediaNote(null)
    }
  }

  /** Escolhe o arquivo do slot rápido (vídeo ou imagem) e persiste. */
  async function pickQuickMedia(slot: 'video' | 'image') {
    const result = await window.projection?.mediaImportDialog?.({ kind: slot })
    if (!result || result.canceled) return
    const mapped = mapImportedMedia(result.items || [])
    const item = mapped.find((m) => m.kind === slot) || mapped[0]
    if (!item) return
    if (item.kind !== slot) {
      toastInfo(
        slot === 'video' ? 'Escolha um arquivo de vídeo' : 'Escolha um arquivo de imagem',
      )
      return
    }
    if (slot === 'video') setQuickVideoItem(item)
    else setQuickImageItem(item)
    void window.projection?.setOutputConfig?.(
      slot === 'video'
        ? { quickVideoItem: item as unknown as QuickMediaItem }
        : { quickImageItem: item as unknown as QuickMediaItem },
    )
  }

  function clearQuickMedia(slot: 'video' | 'image') {
    if (slot === 'video') setQuickVideoItem(null)
    else setQuickImageItem(null)
    void window.projection?.setOutputConfig?.(
      slot === 'video' ? { quickVideoItem: null } : { quickImageItem: null },
    )
  }

  /** Clique na miniatura do slot rápido: vai direto ao vivo. */
  function takeQuickMediaLive(item: PlanItem) {
    // Imagem do slot rápido é sempre 1 quadro só — não entra no modo
    // "documento com scroll" (senão o ajuste caber/cobrir/esticar não se
    // aplica, pois esse modo ignora object-fit).
    void takeLive(item, 0, { forceRestart: true, plainImage: item.kind === 'image' })
  }

  /** Ajuste (caber/cobrir/esticar) da imagem do slot rápido — persiste e atualiza o ar. */
  function setQuickMediaFit(slot: 'video' | 'image', fit: 'contain' | 'cover' | 'fill') {
    const setItem = slot === 'video' ? setQuickVideoItem : setQuickImageItem
    setItem((prev) => {
      if (!prev) return prev
      const next = { ...prev, mediaFit: fit }
      void window.projection?.setOutputConfig?.(
        slot === 'video'
          ? { quickVideoItem: next as unknown as QuickMediaItem }
          : { quickImageItem: next as unknown as QuickMediaItem },
      )
      if (live.kind === slot && live.mediaPath === prev.mediaPath) {
        void onLiveChange({ mediaFit: fit })
      }
      return next
    })
  }

  async function importMediaFromUrl() {
    const url = mediaUrlDraft.trim()
    if (!url) {
      toastInfo('Cole uma URL (página, YouTube ou mídia)')
      return
    }
    setMediaUrlBusy(true)
    try {
      const result = await window.projection?.mediaImportUrl?.(url)
      if (!result?.ok || !result.items?.length) {
        toastInfo(result?.error || 'Falha ao importar URL')
        return
      }
      const mapped = mapImportedMedia(result.items)
      setMediaLibrary((prev) => [...mapped, ...prev])
      setLibTab('midia')
      setMediaUrlDraft('')
      setShowMediaUrl(false)
      if (mapped[0]) previewLibraryItem(mapped[0])
      if (result.note) setMediaNote(result.note)
      toastAlert(`Mídia importada: ${mapped[0]?.label || 'URL'}`)
    } catch (err) {
      toastInfo(`Falha: ${String(err)}`)
    } finally {
      setMediaUrlBusy(false)
    }
  }

  // Ao abrir Saídas: marca o 1º monitor (sem abrir projeção)
  useEffect(() => {
    if (tab !== 'saidas' || !displays.length) return
    const exists = displayId != null && displays.some((d) => d.id === displayId)
    if (!exists) {
      void selectMonitor(displays[0].id)
    }
  }, [tab, displays])

  async function ensureProgramOutput() {
    if (simulation) return
    setSimulation(false)
    const result = await window.projection?.openProgramOutput?.()
    if (typeof result?.simulation === 'boolean') setSimulation(result.simulation)
  }

  async function selectMonitor(nextDisplay: number) {
    setMode('single')
    setDisplayId(nextDisplay)
    const result = await window.projection?.setOutputConfig({
      mode: 'single',
      displayId: nextDisplay,
    })
    if (result?.displays) setDisplays(result.displays)
    if (result?.displayId != null) setDisplayId(result.displayId)
  }

  async function toggleSimulation() {
    const next = !simulation
    setSimulation(next)
    const result = await window.projection?.setSimulation?.(next)
    if (typeof result?.simulation === 'boolean') setSimulation(result.simulation)
  }

  function applyNdiStatus(st: {
    enabled?: boolean
    name?: string
    connections?: number
    error?: string | null
    available?: boolean
  } | null | undefined) {
    if (!st) return
    if (typeof st.enabled === 'boolean') setNdiEnabled(st.enabled)
    if (st.name) setNdiName(st.name)
    setNdiInfo({
      connections: st.connections || 0,
      error: st.error ?? null,
      available: st.available !== false,
    })
  }

  async function toggleNdi() {
    if (ndiBusy || !ndiInfo.available) return
    const next = !ndiEnabled
    setNdiBusy(true)
    setNdiEnabled(next)
    try {
      const st = await window.projection?.ndiSetEnabled(next, ndiName)
      applyNdiStatus(st)
    } catch (err: unknown) {
      setNdiEnabled(false)
      setNdiInfo((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : String(err),
      }))
    } finally {
      setNdiBusy(false)
    }
  }

  async function commitNdiName() {
    const trimmed = ndiName.trim() || 'ProShow'
    if (trimmed !== ndiName) setNdiName(trimmed)
    if (!ndiEnabled) return
    setNdiBusy(true)
    try {
      const st = await window.projection?.ndiSetName(trimmed)
      applyNdiStatus(st)
    } catch (err: unknown) {
      setNdiInfo((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : String(err),
      }))
    } finally {
      setNdiBusy(false)
    }
  }

  /** Liga/desliga a exibição (black). Duplo clique envia o conteúdo; isto só corta/mostra. */
  async function toggleProgramLive() {
    const next = !live.visible
    if (next) await ensureProgramOutput()
    onLiveChange({ visible: next })
  }

  const selectedDisplay = displays.find((d) => d.id === displayId)
  const outputAspect = (() => {
    if (mode === 'span' && displays.length >= 2) {
      const pair = [...displays]
        .sort((a, b) => a.bounds.x - b.bounds.x)
        .slice(0, 2)
      const x0 = Math.min(...pair.map((d) => d.bounds.x))
      const y0 = Math.min(...pair.map((d) => d.bounds.y))
      const x1 = Math.max(...pair.map((d) => d.bounds.x + d.bounds.width))
      const y1 = Math.max(...pair.map((d) => d.bounds.y + d.bounds.height))
      const h = y1 - y0
      return h > 0 ? (x1 - x0) / h : 16 / 9
    }
    return selectedDisplay && selectedDisplay.bounds.height > 0
      ? selectedDisplay.bounds.width / selectedDisplay.bounds.height
      : 16 / 9
  })()
  const stageFrameStyle = {
    ['--stage-ar' as string]: `${outputAspect}`,
    aspectRatio: `${outputAspect}`,
  }
  /**
   * Preview e AO VIVO recortados pela mesma máscara da saída — sem isto o
   * operador aprova um enquadramento que a projeção corta. O estúdio de tema
   * fica de fora de propósito: lá o quadro inteiro precisa continuar visível.
   */
  const stageMaskedFrameStyle = {
    ...stageFrameStyle,
    ['--out-mask' as string]: outputMaskClipPath(outputAreaValue),
  }

  async function dropFilesOnPlan(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    const paths: string[] = []
    for (const file of files) {
      const p = window.projection?.getPathForFile?.(file)
      if (p) paths.push(p)
    }
    if (!paths.length) {
      setMediaNote('Não foi possível ler os arquivos soltos')
      return
    }
    const result = await window.projection?.mediaImportPaths?.(paths)
    const mapped = mapImportedMedia(result?.items || [])
    setMediaLibrary((prev) => [...mapped, ...prev])
    for (const item of mapped) addToPlan(item)
    const note = result?.items?.find((i) => i.note)?.note
    if (note) setMediaNote(note)
  }

  return (
    <div className={`op${live.visible ? ' is-program-live' : ' is-program-black'}`}>
      <header className="op-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span className="brand-copy">
            <strong>ProShow</strong>
            <small>Console do operador</small>
          </span>
        </div>
        <nav className="tabs" aria-label="Modos do aplicativo">
          <button
            className={tab === 'show' ? 'on' : ''}
            onClick={() => setTab('show')}
            type="button"
          >
            Show
          </button>
          <button
            className={tab === 'temas' ? 'on' : ''}
            onClick={() => setTab('temas')}
            type="button"
          >
            Temas
          </button>
          <button
            className={tab === 'saidas' ? 'on' : ''}
            onClick={() => setTab('saidas')}
            type="button"
          >
            Saídas
          </button>
        </nav>
        <div
          className={`global-live-status${live.visible ? ' is-live' : ' is-black'}`}
          role="status"
          aria-live="polite"
        >
          <span className="global-live-dot" aria-hidden="true" />
          <span>
            <small>PROGRAMA</small>
            <strong>{live.visible ? 'NO AR' : 'BLACK'}</strong>
          </span>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => void insertCameraNow('live')}
          >
            + Câmera ao vivo
          </button>
          <div
            className={`import-menu${importMenuOpen ? ' open' : ''}`}
            ref={importMenuRef}
            onMouseEnter={() => setImportMenuOpen(true)}
            onMouseLeave={() => setImportMenuOpen(false)}
          >
            <button
              type="button"
              className="ghost"
              aria-haspopup="true"
              aria-expanded={importMenuOpen}
              onClick={() => setImportMenuOpen((o) => !o)}
            >
              + Importar
            </button>
            {importMenuOpen ? (
              <div className="import-menu-list" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setImportMenuOpen(false)
                    void importMedia()
                  }}
                >
                  Mídia
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setImportMenuOpen(false)
                    setMediaUrlDraft('')
                    setShowMediaUrl(true)
                  }}
                >
                  URL
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={importing}
                  onClick={() => {
                    setImportMenuOpen(false)
                    void importViaDialog()
                  }}
                >
                  Holyrics
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {tab === 'show' ? (
        <div className="op-grid">
          <section className="panel library" ref={libraryZoneRef}>
            <div className="operator-panel-heading">
              <div>
                <span className="panel-kicker">Conteúdo</span>
                <h2>Biblioteca</h2>
              </div>
              <div className="panel-heading-tools">
                <span className="panel-count">
                  {libTab === 'letras'
                    ? filteredLibrary.length
                    : libTab === 'midia'
                      ? mediaLibrary.length
                      : bibleVersionCount}
                </span>
                {libTab === 'letras' ? (
                  <button
                    type="button"
                    className="btn-icon-round"
                    title="Nova música"
                    aria-label="Nova música"
                    onClick={() => setSongEditorTarget('new')}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        d="M12 5v14M5 12h14"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
            <div className="lib-tabs">
              <button
                type="button"
                className={libTab === 'letras' ? 'on' : ''}
                onClick={() => switchLibTab('letras')}
              >
                Letras
              </button>
              <button
                type="button"
                className={libTab === 'biblia' ? 'on' : ''}
                onClick={() => switchLibTab('biblia')}
              >
                Bíblia
              </button>
              <button
                type="button"
                className={libTab === 'midia' ? 'on' : ''}
                onClick={() => switchLibTab('midia')}
              >
                Mídia
              </button>
            </div>

            {libTab === 'letras' ? (
              <>
                <input
                  ref={librarySearchRef}
                  className="lib-search"
                  type="search"
                  placeholder="Buscar título, artista ou letra…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      focusLibraryFirstSong()
                    }
                  }}
                />
                <ul className="lib">
                  {filteredLibrary.slice(0, 200).map((item) => {
                    const selected =
                      previewItem &&
                      item.kind === 'lyrics' &&
                      songKey(item) === songKey(previewItem)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          data-phrase-nav="1"
                          className={selected ? 'lib-item on' : 'lib-item'}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              'application/x-ible-plan',
                              JSON.stringify(item),
                            )
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                          onClick={() => previewLibraryItem(item)}
                          onDoubleClick={() => takeLiveFromLibrary(item)}
                        >
                          <span>{kindIcon(item.kind)}</span>
                          <span className="lib-copy">
                            <span className="lib-label">{item.label}</span>
                            {item.artist ? (
                              <span className="lib-meta">{item.artist}</span>
                            ) : null}
                          </span>
                          <span className="add" aria-hidden />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}

            {libTab === 'biblia' ? (
              <BiblePanel
                ref={bibleRef}
                onGoLive={goLiveBible}
                onPreview={setBiblePreview}
                onAddToPlan={(item) => addToPlan(item)}
                onVersionsLoaded={setBibleVersionCount}
              />
            ) : null}

            {libTab === 'midia' ? (
              <>
                <div className="lib-actions media-import-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void importMedia()}
                  >
                    + Mídia
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setMediaUrlDraft('')
                      setShowMediaUrl(true)
                    }}
                  >
                    + URL
                  </button>
                </div>
                <ul className="lib">
                  {mediaLibrary.map((item) => (
                    <li key={item.id} className="lib-media-row">
                      <button
                        type="button"
                        data-phrase-nav="1"
                        className="lib-item"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/x-ible-plan',
                            JSON.stringify(item),
                          )
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        onClick={() => previewLibraryItem(item)}
                        onDoubleClick={() => takeLiveFromLibrary(item)}
                      >
                        <span>{kindIcon(item.kind)}</span>
                        <span className="lib-copy">
                          <span className="lib-label">{item.label}</span>
                          <span className="lib-meta">
                            {detailColumnHeading(item, false)}
                            {item.source === 'url' ? ' · URL' : ''}
                            {item.kind === 'deck' && item.slidePaths?.length
                              ? ` · ${item.slidePaths.length} slides`
                              : ''}
                          </span>
                        </span>
                        <span className="add">arraste →</span>
                      </button>
                      <button
                        type="button"
                        className="lib-item-remove"
                        title="Remover mídia"
                        aria-label={`Remover ${item.label}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteMediaItem(item)
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {showArtisticKeywords && stackArtistic ? (
              <div
                className="library-area-overlay"
                role="presentation"
                onClick={() => setShowArtisticKeywords(false)}
              >
                <div
                  className="artistic-keywords"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="artistic-keywords-title"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="artistic-keywords-head">
                    <span id="artistic-keywords-title">Palavras-chave</span>
                    <button
                      type="button"
                      className="artistic-keywords-close"
                      aria-label="Fechar palavras-chave"
                      onClick={() => setShowArtisticKeywords(false)}
                    >
                      ×
                    </button>
                  </div>
                  <p>
                    Palavras destacadas nas composições artísticas. A lista fica
                    salva neste computador ao fechar o app.
                  </p>
                  <div className="artistic-keyword-entry">
                    <input
                      autoFocus
                      value={artisticKeywordDraft}
                      onChange={(e) => setArtisticKeywordDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addArtisticKeyword()
                          return
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setShowArtisticKeywords(false)
                        }
                      }}
                      placeholder="Adicionar palavra"
                      aria-label="Adicionar palavra-chave artística"
                    />
                    <button
                      type="button"
                      onClick={addArtisticKeyword}
                      disabled={!artisticKeywordDraft.trim()}
                    >
                      Adicionar
                    </button>
                  </div>
                  {artisticKeywords.length ? (
                    <div className="artistic-keyword-list">
                      {artisticKeywords.map((keyword) => (
                        <button
                          type="button"
                          key={keyword}
                          onClick={() => removeArtisticKeyword(keyword)}
                          title={`Remover ${keyword}`}
                        >
                          {keyword} ×
                        </button>
                      ))}
                    </div>
                  ) : (
                    <small>Nenhuma palavra destacada.</small>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel song-detail operator-detail">
            {usingBiblePreview && biblePreview ? (
              <>
                <div className="song-detail-head">
                  <h2>Bíblia</h2>
                </div>
                <p className="song-detail-title">{previewTitle}</p>
                <div className="song-detail-toolbar">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void goLiveBible(biblePreview)}
                  >
                    Enviar ao vivo
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => addToPlan(biblePreview)}
                  >
                    + Plano
                  </button>
                </div>
                <label className="theme-picker-label bible-theme-picker">
                  Tema
                  <select
                    value={
                      themes.some((t) => t.id === (bibleThemeId || bibleTheme.id))
                        ? bibleThemeId || bibleTheme.id
                        : themes[0]?.id || ''
                    }
                    onChange={(e) =>
                      onBibleThemeIdChange(e.target.value || null)
                    }
                  >
                    {themes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="bible-detail-toggles">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={bibleTheme.showTitle !== false}
                      onChange={(e) =>
                        onBibleShowChange({ bibleShowTitle: e.target.checked })
                      }
                    />
                    Referência
                  </label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={bibleTheme.showLyrics !== false}
                      onChange={(e) =>
                        onBibleShowChange({ bibleShowLyrics: e.target.checked })
                      }
                    />
                    Versículo
                  </label>
                </div>
                <div className="phrases bible-verse-list">
                  <ul>
                    {bibleDerived.lines.length > 1
                      ? // Intervalo repartido pelo tema: cada parte é clicável,
                        // para o operador voltar a uma já projetada.
                        bibleDerived.lines.map((part, idx) => {
                          // Ao vivo: só quando ESTE intervalo é o que está no
                          // ar. Trocar de verso cria outro intervalo, e o
                          // marcador tem de sair junto.
                          const isLive =
                            bibleLiveId === biblePreview.id && biblePartIdx === idx
                          const isPreview = biblePreviewPart === idx
                          return (
                            <li key={`bible-part-${idx}`}>
                              <button
                                type="button"
                                // Sem isto o handler global de teclado ignora
                                // o Enter enquanto o foco está no botão —
                                // clicar numa parte matava o atalho.
                                data-phrase-nav="1"
                                data-bible-part={idx}
                                className={`phrase bible-verse-row${
                                  isLive ? ' is-live' : ''
                                }${isPreview ? ' on' : ''}`}
                                onClick={() => setBiblePreviewPart(idx)}
                                onDoubleClick={() =>
                                  void goLiveBible(biblePreview, idx)
                                }
                                title={`Parte ${idx + 1} de ${bibleDerived.lines.length} — 1 clique arma, 2 cliques projetam`}
                              >
                                <span className="phrase-num">{idx + 1}</span>
                                <span className="phrase-text">
                                  {part.split('\n').join(' / ')}
                                </span>
                                <span className="phrase-part">
                                  {biblePartTag(idx)}
                                </span>
                              </button>
                            </li>
                          )
                        })
                      : biblePreview.lines.map((line, idx) => (
                          <li key={`bible-v-${idx}`}>
                            <div className="phrase bible-verse-row">
                              <span className="phrase-num">{idx + 1}</span>
                              <span className="phrase-text">{line}</span>
                            </div>
                          </li>
                        ))}
                  </ul>
                </div>
              </>
            ) : (
              <>
            {!previewIsWebBrowse ? (
              <>
                <div className="song-detail-head">
                  <h2>{detailColumnHeading(previewItem, false)}</h2>
                  {previewItem?.kind === 'lyrics' ? (
                    <div className="phrase-mode-toggles">
                      <label
                        className="toggle-row phrase-stack-toggle artistic-toggle"
                        title="Uma frase por vez, variando de posição"
                      >
                        <input
                          type="checkbox"
                          checked={stackArtistic}
                          onChange={(e) => {
                            const on = e.target.checked
                            setStackArtistic(on)
                            saveStackArtistic(on)
                            setStackOrder(on ? [previewSlide] : [])
                            setStackOrigin(previewSlide)
                            if (!on) setShowArtisticKeywords(false)
                          }}
                        />
                        Criativo
                      </label>
                      <label
                        className="toggle-row phrase-stack-toggle artistic-max-toggle"
                        title="Empilha até 3 frases com mosaico e animação"
                      >
                        <input
                          type="checkbox"
                          checked={stackArtisticMax}
                          disabled={!stackArtistic}
                          onChange={(e) => {
                            const on = e.target.checked
                            setStackArtisticMax(on)
                            saveStackArtisticMax(on)
                          }}
                        />
                        Max
                      </label>
                      <button
                        type="button"
                        className="artistic-keywords-button"
                        disabled={!stackArtistic}
                        onClick={() => setShowArtisticKeywords(true)}
                      >
                        Palavras-chave
                        {artisticKeywords.length
                          ? ` (${artisticKeywords.length})`
                          : ''}
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="song-detail-title">
                  {previewItem?.label ||
                    'Selecione um item na biblioteca ou no plano'}
                </p>
                {previewItem?.kind === 'lyrics' && previewItem.artist ? (
                  <p className="song-detail-artist">{previewItem.artist}</p>
                ) : null}
              </>
            ) : null}

            {previewItem?.kind === 'lyrics' ? (
              <div className="song-detail-toolbar">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (!previewItem) return
                    const lines = [...previewItem.lines, 'Nova frase']
                    void persistSlideLines(previewItem, lines)
                    // A frase nova é curta e não reparte: entra como um slide
                    // ao fim, logo depois dos derivados que já existem.
                    setPreviewSlide(previewDerived.lines.length)
                  }}
                >
                  + Slide
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!previewItem.lines.length || previewItem.lines.length <= 1}
                  onClick={() => {
                    if (!previewItem || previewItem.lines.length <= 1) return
                    // previewSlide indexa as PARTES; remover apaga a linha
                    // ESCRITA de onde a parte veio. Sem este mapeamento,
                    // apagaria a linha errada.
                    const srcIdx =
                      previewDerived.sourceIndex[previewSlide] ?? previewSlide
                    const lines = previewItem.lines.filter((_, i) => i !== srcIdx)
                    void persistSlideLines(previewItem, lines)
                    setPreviewSlide((s) => Math.max(0, Math.min(s, lines.length - 1)))
                  }}
                >
                  − Slide
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setSongEditorTarget(previewItem)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => void removeLibrarySong(previewItem)}
                >
                  Excluir
                </button>
              </div>
            ) : null}

            <div
              className={`song-detail-scroll${
                previewIsDocumentScroll || previewIsWebBrowse
                  ? ' is-document'
                  : ''
              }`}
            >
            {previewItem &&
            (previewItem.kind === 'image' ||
              previewItem.kind === 'video' ||
              previewItem.kind === 'audio') ? (
              <div className="media-detail-card" aria-label="Detalhes da mídia">
                <dl className="media-detail-grid">
                  <div>
                    <dt>Tipo</dt>
                    <dd>{detailColumnHeading(previewItem, false)}</dd>
                  </div>
                  <div>
                    <dt>Arquivo</dt>
                    <dd title={previewItem.label}>{previewItem.label}</dd>
                  </div>
                  <div>
                    <dt>Formato</dt>
                    <dd>
                      {mediaProbe?.format ||
                        mediaFileExt(previewItem.mediaPath) ||
                        '—'}
                    </dd>
                  </div>
                  {mediaProbe?.sizeLabel ? (
                    <div>
                      <dt>Tamanho</dt>
                      <dd>{mediaProbe.sizeLabel}</dd>
                    </div>
                  ) : null}
                  {previewItem.kind !== 'audio' ? (
                    <div>
                      <dt>Resolução</dt>
                      <dd>
                        {mediaProbe?.width && mediaProbe?.height
                          ? `${mediaProbe.width} × ${mediaProbe.height}`
                          : '…'}
                      </dd>
                    </div>
                  ) : null}
                  {mediaProbe?.fps ? (
                    <div>
                      <dt>FPS</dt>
                      <dd>{mediaProbe.fps}</dd>
                    </div>
                  ) : null}
                  {previewItem.kind === 'video' ||
                  previewItem.kind === 'audio' ? (
                    <div>
                      <dt>Duração</dt>
                      <dd>
                        {formatMediaDuration(
                          mediaProbe?.duration ??
                            (previewMediaPath === previewItem.mediaPath
                              ? mediaTime.duration
                              : 0),
                        )}
                      </dd>
                    </div>
                  ) : null}
                  {mediaProbe?.bitrateLabel ? (
                    <div>
                      <dt>Bitrate</dt>
                      <dd>{mediaProbe.bitrateLabel}</dd>
                    </div>
                  ) : null}
                  {mediaProbe?.videoCodec ? (
                    <div>
                      <dt>Codec vídeo</dt>
                      <dd title={mediaProbe.videoProfile || undefined}>
                        {mediaProbe.videoCodec}
                        {mediaProbe.videoProfile
                          ? ` · ${mediaProbe.videoProfile}`
                          : ''}
                      </dd>
                    </div>
                  ) : null}
                  {mediaProbe?.pixelFormat ? (
                    <div>
                      <dt>Pixel</dt>
                      <dd>
                        {mediaProbe.pixelFormat}
                        {mediaProbe.colorSpace
                          ? ` · ${mediaProbe.colorSpace}`
                          : ''}
                      </dd>
                    </div>
                  ) : null}
                  {mediaProbe?.audioCodec ? (
                    <div>
                      <dt>Codec áudio</dt>
                      <dd>{mediaProbe.audioCodec}</dd>
                    </div>
                  ) : null}
                  {mediaProbe?.channelLayout || mediaProbe?.channels ? (
                    <div>
                      <dt>Áudio</dt>
                      <dd>
                        {mediaProbe.channelLayout ||
                          `${mediaProbe.channels} canais`}
                        {mediaProbe.sampleRate
                          ? ` · ${(mediaProbe.sampleRate / 1000).toFixed(1)} kHz`
                          : ''}
                        {mediaProbe.audioBitrateLabel
                          ? ` · ${mediaProbe.audioBitrateLabel}`
                          : ''}
                      </dd>
                    </div>
                  ) : null}
                  {mediaProbe?.rotation ? (
                    <div>
                      <dt>Rotação</dt>
                      <dd>{mediaProbe.rotation}°</dd>
                    </div>
                  ) : null}
                  {mediaProbe?.loading ? (
                    <div className="media-detail-wide">
                      <dt>Metadados</dt>
                      <dd>Lendo com ffprobe…</dd>
                    </div>
                  ) : null}
                  {mediaProbe?.error && !mediaProbe.videoCodec ? (
                    <div className="media-detail-wide">
                      <dt>Probe</dt>
                      <dd title={mediaProbe.error}>{mediaProbe.error}</dd>
                    </div>
                  ) : null}
                  {previewItem.source === 'url' &&
                  (previewItem.webUrl || previewItem.mediaPath) ? (
                    <div className="media-detail-wide">
                      <dt>URL</dt>
                      <dd
                        className="allow-select"
                        title={
                          previewItem.webUrl || previewItem.mediaPath || ''
                        }
                      >
                        {previewItem.webUrl || previewItem.mediaPath}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}

            {previewItem?.kind === 'deck' &&
            (previewItem.slidePaths?.length || 0) > 0 ? (
              <div
                className="deck-thumb-strip"
                aria-label="Miniaturas dos slides"
                style={{
                  ['--stage-ar' as string]: String(outputAspect),
                }}
              >
                {previewItem.slidePaths!.map((thumbPath, idx) => {
                  const thumbUrl = thumbPath ? toMediaUrl(thumbPath) : null
                  return (
                    <button
                      key={`${previewItem.id}-thumb-${idx}`}
                      type="button"
                      className={
                        idx === previewSlide
                          ? 'deck-thumb on'
                          : 'deck-thumb'
                      }
                      onClick={() => focusDocumentPage(previewItem, idx)}
                      onDoubleClick={() => {
                        focusDocumentPage(previewItem, idx)
                        void takeLive(previewItem, idx)
                      }}
                      title={`Slide ${idx + 1} · duplo clique: ao vivo`}
                    >
                      <span className="deck-thumb-num">{idx + 1}</span>
                      {thumbUrl ? (
                        <img src={thumbUrl} alt="" draggable={false} />
                      ) : (
                        <span className="deck-thumb-fallback">
                          {idx + 1}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : null}

            {previewIsWebBrowse && previewItem ? (
              <WebBrowsePane
                ref={webBrowseRef}
                itemId={previewItem.id}
                aspectRatio={outputAspect}
                src={
                  previewItem.mediaPath ||
                  previewItem.webUrl ||
                  'about:blank'
                }
                onUrlChange={onWebBrowseUrl}
                onScrollRatio={onWebBrowseScroll}
                onTakeLive={() => void takeLive(previewItem)}
              />
            ) : previewIsDocumentScroll && previewItem ? (
              <>
                <p className="song-detail-live-hint">
                  {previewItem.kind === 'image'
                    ? deckLiveOpen
                      ? 'Role a imagem — o ao vivo mostra o recorte desta viewport.'
                      : 'Role a imagem aqui. Duplo clique envia o recorte ao vivo.'
                    : deckLiveOpen
                      ? 'Role a apresentação — o ao vivo mostra o recorte desta viewport.'
                      : 'Role as páginas aqui. Duplo clique envia o recorte ao vivo.'}
                </p>
                <div
                  className="doc-scroll"
                  ref={docScrollRef}
                  tabIndex={0}
                  onScroll={onDocScroll}
                  onDoubleClick={() => void takeLive(previewItem)}
                  title="Role para navegar · duplo clique: ao vivo"
                >
                  {Array.from({ length: documentSlideCount }, (_, idx) => {
                    const paths = documentSlidePaths(previewItem)
                    const thumbPath = paths?.[idx] || null
                    const thumbUrl = thumbPath ? toMediaUrl(thumbPath) : null
                    const label =
                      previewItem.lines[idx] ||
                      (previewItem.kind === 'image'
                        ? previewItem.label
                        : `Página ${idx + 1}`)
                    return (
                      <div
                        key={`${previewItem.id}-doc-${idx}`}
                        data-doc-page={idx}
                        className="doc-page"
                      >
                        <span className="doc-page-num">{idx + 1}</span>
                        {thumbUrl ? (
                          <img
                            className="doc-page-image"
                            src={thumbUrl}
                            alt=""
                            draggable={false}
                          />
                        ) : (
                          <span className="doc-page-fallback">{label}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : previewItem?.kind === 'video' ||
              previewItem?.kind === 'audio' ||
              previewIsYoutube ? (
              <p className="song-detail-live-hint">
                {previewIsYoutube
                  ? 'YouTube no Preview à direita. Use Som/Vol no transporte.'
                  : 'O Preview no monitor à direita. Duplo clique (ou Enviar) manda ao vivo.'}
              </p>
            ) : (
            <div className="phrases" ref={phrasesRef}>
              {previewItem?.kind === 'camera' || previewIsMedia ? null : (
                <>
                  <ul>
                    {previewDerived.lines.map((slide, idx) => {
                      const isPreview = idx === previewSlide
                      const isLive = liveSlot?.itemId === previewItem?.id && liveSlot?.idx === idx
                      // Estilo por frase segue a linha ESCRITA, não a parte.
                      const srcIdx = previewDerived.sourceIndex[idx] ?? idx
                      const srcStyle = previewItem?.phraseStyles?.[srcIdx]
                      const hasOwnStyle = Boolean(
                        srcStyle?.themeId || srcStyle?.animation,
                      )
                      const part = partLabel(previewDerived, idx)
                      return (
                      <li key={`${previewItem?.id}-${idx}`}>
                        <button
                          type="button"
                          data-phrase-nav="1"
                          data-phrase-idx={idx}
                          className={`phrase${isLive ? ' is-live' : ''}${isPreview ? ' on' : ''}`}
                          onClick={() => selectPreview(previewDerivedItem!, idx)}
                          onDoubleClick={() => {
                            if (!previewDerivedItem) return
                            void takeLive(previewDerivedItem, idx).then(() =>
                              armNextSlide(previewDerivedItem, idx),
                            )
                          }}
                          title={
                            part
                              ? `${part} — o tema reparte esta linha`
                              : '1 clique: preview · setas: navega · Enter/duplo clique: ao vivo e avança'
                          }
                        >
                          <span className="phrase-num">{idx + 1}</span>
                          <span className="phrase-text">
                            {slideLines(slide).join(' / ') || slide}
                          </span>
                          {part ? (
                            <span className="phrase-part" title={part}>
                              {previewDerived.part[idx]}/
                              {previewDerived.partTotal[idx]}
                            </span>
                          ) : null}
                          <span
                            className={
                              hasOwnStyle
                                ? 'phrase-style-dot'
                                : 'phrase-style-dot is-empty'
                            }
                            title={hasOwnStyle ? 'Tema próprio' : undefined}
                            aria-hidden={!hasOwnStyle}
                          >
                            ●
                          </span>
                        </button>
                      </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
            )}
            </div>
              </>
            )}
          </section>

          <section className="panel stages broadcast-console">
            <div className="broadcast-console-heading">
              <div>
                <span className="panel-kicker">Central de transmissão</span>
                <h2>Preview &amp; Programa</h2>
              </div>
              <span className={`broadcast-status${live.visible ? ' is-live' : ''}`}>
                <span aria-hidden="true" />
                {live.visible ? 'SAÍDA ATIVA' : 'SAÍDA EM BLACK'}
              </span>
            </div>
            <div className="stage-row stage-row-stacked">
              <div className="stage-column stage-preview-column">
                <div className="stage-block stage-preview">
                  <div className="monitor-heading">
                    <div className="monitor-heading-copy">
                      <span className="monitor-label">Preview</span>
                      <strong>
                        {previewItem || usingBiblePreview
                          ? previewTitle
                          : 'Nada selecionado'}
                      </strong>
                    </div>
                    <span className="monitor-state is-preview">ARMADO</span>
                  </div>
                  <div
                    className={`stage-frame${previewIsCamera ? ' camera-edit-host' : ''}`}
                    style={stageMaskedFrameStyle}
                    title="Duplo clique: enviar para a apresentação"
                    onDoubleClick={() => {
                      if (libTab === 'biblia' && biblePreview) {
                        void goLiveBible(biblePreview)
                        return
                      }
                      const item = previewItem
                      const idx = previewSlide
                      void takeLive(item, idx).then(() => {
                        if (item) armNextSlide(item, idx)
                      })
                    }}
                  >
                    <LyricStage
                      title={previewTitle}
                      artist={previewArtist}
                      lines={stagePreviewLines}
                      phraseSlots={usingBiblePreview ? null : previewSlots}
                      slotThemes={usingBiblePreview ? null : previewSlotThemes}
                      artistic={
                        !usingBiblePreview &&
                        stackArtistic &&
                        previewItem?.kind === 'lyrics'
                      }
                      artisticPlan={
                        usingBiblePreview || previewItem?.kind !== 'lyrics'
                          ? null
                          : previewArtisticPlan
                      }
                      cameraDeviceId={previewCameraId}
                      cameraAudio={false}
                      cameraVoiceIsolate={false}
                      cameraForeground={previewIsCamera}
                      cameraCaption={
                        previewIsCamera ? previewItem?.cameraCaption : null
                      }
                      mediaPath={previewIsWebBrowse ? null : previewMediaPath}
                      mediaKind={previewIsWebBrowse ? null : previewMediaKind}
                      mediaFit={previewItem?.mediaFit || 'contain'}
                      mediaSlidePaths={
                        previewIsWebBrowse ? null : previewDeckSlidePaths
                      }
                      mediaScrollRatio={
                        previewIsWebBrowse ? 0 : docScrollRatio
                      }
                      mediaPlayback={
                        liveIsAv &&
                        previewMediaPath &&
                        previewMediaPath === liveMediaPath
                          ? {
                              ...livePlayback,
                              muted: true,
                              volume: 0,
                              voiceIsolate: false,
                            }
                          : { ...previewPlayback, voiceIsolate: false }
                      }
                      mediaForceMuted
                      mediaInteractive={!previewIsWebBrowse}
                      contained
                      contentKind={
                        usingBiblePreview
                          ? 'bible'
                          : previewItem?.kind || null
                      }
                      onMediaTime={
                        liveIsAv
                          ? undefined
                          : (current, duration) => reportMediaTime(current, duration)
                      }
                      showCamera
                      theme={previewStageTheme}
                      visible={Boolean(previewItem) || usingBiblePreview}
                      mirroredCamera={false}
                      safeArea={previewSafeArea}
                      outputSafeArea={outputAreaValue}
                      wrapLines={previewWrapLines}
                    />
                    {previewIsCamera && previewItem ? (
                      <button
                        type="button"
                        className="camera-edit-button"
                        title="Editar câmera"
                        aria-label="Editar câmera do preview"
                        onClick={(e) => {
                          e.stopPropagation()
                          void openCameraEditor(
                            previewItem,
                            live.kind === 'camera' &&
                              live.cameraPlanItemId === previewItem.id,
                          )
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        ✎
                      </button>
                    ) : null}
                  </div>

                  {previewItem?.kind === 'lyrics' ? (
                    <div className="preview-style-bar">
                      <label className="preview-style-field">
                        <span>Tema música</span>
                        <select
                          key={`song-theme-${themesRev}`}
                          value={previewItem.themeId || ''}
                          onChange={(e) =>
                            applySongPresentation(previewItem, {
                              themeId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">Global</option>
                          {themeOptionsSorted.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="preview-style-field">
                        <span>Tema frase</span>
                        <select
                          key={`phrase-theme-${themesRev}-${previewSlide}`}
                          value={currentPhraseStyle?.themeId || ''}
                          onChange={(e) => {
                            const themeId = e.target.value || null
                            setPhraseStyle({
                              ...(currentPhraseStyle || {}),
                              themeId,
                            })
                          }}
                        >
                          <option value="">Herdar</option>
                          {themeOptionsSorted.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="preview-style-field">
                        <span>Animação</span>
                        <select
                          value={currentPhraseStyle?.animation || ''}
                          onChange={(e) => {
                            const animation = (e.target.value ||
                              null) as ThemeAnimation | null
                            setPhraseStyle({
                              ...(currentPhraseStyle || {}),
                              animation,
                            })
                          }}
                        >
                          <option value="">Herdar</option>
                          {ANIMATION_OPTIONS.filter((a) => a.id !== 'none').map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                          <option value="none">Nenhuma</option>
                        </select>
                      </label>
                      <div className="song-uppercase-row">
                        <label
                          className="toggle-row song-uppercase-toggle"
                          title="Forçar maiúsculas nesta música"
                        >
                          <input
                            type="checkbox"
                            checked={previewItem.uppercase === true}
                            onChange={(e) =>
                              applySongPresentation(previewItem, {
                                uppercase: e.target.checked ? true : null,
                              })
                            }
                          />
                          MAIÚSC.
                        </label>
                        <div className="song-bg-media-group">
                          <button
                            type="button"
                            className="song-bg-btn song-bg-btn-add"
                            title="Adicionar imagem ou vídeo de fundo"
                            onClick={() => void pickSongBackground(previewItem)}
                          >
                            + Mídia de fundo
                          </button>
                          <button
                            type="button"
                            className="song-bg-btn"
                            title="Remover mídia de fundo"
                            aria-label="Remover mídia de fundo"
                            disabled={!previewItem.bgMediaPath}
                            onClick={() =>
                              applySongBackground(previewItem, {
                                bgMediaPath: null,
                                bgMediaKind: null,
                              })
                            }
                          >
                            −
                          </button>
                          <div
                            className={`song-bg-menu${songBgMenuOpen ? ' open' : ''}`}
                            ref={songBgMenuOpen ? songBgMenuRef : undefined}
                          >
                            <button
                              type="button"
                              className="song-bg-btn"
                              disabled={!recentBgMedia.length}
                              title="Mídias usadas recentemente"
                              aria-label="Mídias usadas recentemente"
                              aria-haspopup="true"
                              aria-expanded={songBgMenuOpen}
                              onClick={() => setSongBgMenuOpen((o) => !o)}
                            >
                              ▾
                            </button>
                            {songBgMenuOpen ? (
                              <div className="song-bg-menu-list" role="menu">
                                {recentBgMedia.map((m) => (
                                  <button
                                    key={m.path}
                                    type="button"
                                    role="menuitem"
                                    className="song-bg-menu-item"
                                    title={m.path}
                                    onClick={() => {
                                      applySongBackground(previewItem, {
                                        bgMediaPath: m.path,
                                        bgMediaKind: m.kind,
                                      })
                                      setSongBgMenuOpen(false)
                                    }}
                                  >
                                    {m.kind === 'image' ? (
                                      <img
                                        className="song-bg-menu-thumb"
                                        src={toMediaUrl(m.path) ?? undefined}
                                        alt=""
                                      />
                                    ) : (
                                      <span
                                        className="song-bg-menu-thumb song-bg-menu-thumb-icon"
                                        aria-hidden="true"
                                      >
                                        ▶
                                      </span>
                                    )}
                                    <span className="song-bg-menu-name">
                                      {fileName(m.path)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                        <div className="preview-style-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setPhraseStyle(null)}
                          title="Limpar estilo desta frase"
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void savePhraseStylesForSong(previewItem)}
                          title="Salvar estilos de frase na música"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <aside className="preview-control-stack" aria-label="Controles de transmissão">
                  <section className="control-section">
                    <button
                      type="button"
                      className="take-live-button"
                      onClick={() => {
                        if (libTab === 'biblia' && biblePreview) {
                          void goLiveBible(biblePreview)
                        } else {
                          void takeLive()
                        }
                      }}
                      title="Enviar o Preview ao Programa (Espaço / Enter)"
                    >
                      <span className="take-live-arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="take-live-copy">
                        <strong>ENVIAR AO VIVO</strong>
                        <small>Preview → Programa</small>
                      </span>
                    </button>
                  </section>

                  <section className="control-section">
                    <div className="stage-program-toggles">
                      <button
                        type="button"
                        className={`transport-live-toggle ${live.visible ? 'is-on' : 'is-off'}`}
                        onClick={() => void toggleProgramLive()}
                        title={
                          live.visible
                            ? 'Desligar AO VIVO (black / B)'
                            : 'Ligar AO VIVO (mostrar na saída)'
                        }
                      >
                        <span className="live-toggle-copy">
                          <small>SAÍDA</small>
                          <span className="live-toggle-label">
                            {live.visible ? 'BLACK' : 'AO VIVO'}
                          </span>
                        </span>
                        <span className="live-toggle-state">
                          {live.visible ? 'NO AR' : 'OFF'}
                        </span>
                      </button>
                    </div>
                  </section>

                  <section className="control-section">
                    <h3 className="control-section-title">Gates</h3>
                    <div className="show-toggles" aria-label="Gates do programa">
                      <label className="toggle-chip" title="AND com o tema: só aparece se o tema também exibir">
                        <input
                          type="checkbox"
                          checked={live.gateTitle !== false}
                          onChange={(e) =>
                            onLiveChange({ gateTitle: e.target.checked })
                          }
                        />
                        Título
                      </label>
                      <label className="toggle-chip" title="AND com o tema: só aparece se o tema também exibir">
                        <input
                          type="checkbox"
                          checked={live.gateArtist !== false}
                          onChange={(e) =>
                            onLiveChange({ gateArtist: e.target.checked })
                          }
                        />
                        Artista
                      </label>
                      <label className="toggle-chip" title="AND com o tema: só aparece se o tema também exibir">
                        <input
                          type="checkbox"
                          checked={live.gateLyrics !== false}
                          onChange={(e) =>
                            onLiveChange({ gateLyrics: e.target.checked })
                          }
                        />
                        Letra
                      </label>
                    </div>
                  </section>
                </aside>
              </div>

              <div className="stage-column stage-program-column">
              <div className="stage-block stage-program">
                <div className="monitor-heading">
                  <div className="monitor-heading-copy">
                    <span className="monitor-label">Programa</span>
                    <strong>{live.title || 'Nenhum conteúdo'}</strong>
                  </div>
                  <span
                    className={`monitor-state${live.visible ? ' is-live' : ' is-black'}`}
                  >
                    {live.visible ? '● AO VIVO' : 'BLACK'}
                  </span>
                </div>
                <div
                  className={`stage-frame${live.kind === 'camera' ? ' camera-edit-host' : ''}`}
                  style={stageMaskedFrameStyle}
                >
                  <LyricStage
                    title={live.title}
                    artist={live.artist}
                    lines={live.lines}
                    phraseSlots={live.phraseSlots}
                    slotThemes={live.slotThemes}
                    artistic={Boolean(live.stackArtistic)}
                    artisticPlan={live.artisticPlan}
                    cameraDeviceId={liveOperatorCameraId}
                    cameraAudio={live.kind === 'camera'}
                    cameraVoiceIsolate={Boolean(
                      live.kind === 'camera' && live.mediaVoiceIsolate,
                    )}
                    cameraForeground={live.kind === 'camera'}
                    cameraCaption={
                      live.kind === 'camera' ? live.cameraCaption : null
                    }
                    mediaPath={liveMediaPath}
                    mediaKind={liveMediaKind}
                    mediaFit={live.mediaFit || 'contain'}
                    mediaSlidePaths={liveDeckSlidePaths}
                    mediaScrollRatio={liveDeckScrollRatio}
                    mediaPlayback={livePlayback}
                    mediaForceMuted={!simulation || Boolean(live.mediaMuted)}
                    contained
                    contentKind={live.kind || null}
                    onMediaTime={(current, duration) =>
                      reportMediaTime(current, duration)
                    }
                    showCamera
                    theme={liveStageTheme}
                    visible={live.visible}
                    mirroredCamera={false}
                    safeArea={liveSafeArea}
                    outputSafeArea={outputAreaValue}
                    wrapLines={liveWrapLines}
                    spectrum={spectrum}
                  />
                  {live.kind === 'camera' ? (
                    <button
                      type="button"
                      className="camera-edit-button"
                      title="Editar câmera no ar"
                      aria-label="Editar câmera no ar"
                      onClick={() => {
                        const item =
                          plan.find(
                            (candidate) =>
                              candidate.id === live.cameraPlanItemId,
                          ) || null
                        void openCameraEditor(item, true)
                      }}
                    >
                      ✎
                    </button>
                  ) : null}
                </div>
                {(liveIsAv ||
                  previewItem?.kind === 'video' ||
                  previewItem?.kind === 'audio' ||
                  previewItem?.kind === 'camera' ||
                  previewIsYoutube ||
                  (live.kind === 'web' &&
                    /youtube\.com|youtu\.be/i.test(
                      String(live.mediaPath || ''),
                    ))) && (
                  <MediaTransport
                    variant={
                      (liveIsAv
                        ? live.kind === 'web' || live.kind === 'camera'
                        : previewIsYoutube || previewItem?.kind === 'camera')
                        ? 'audio'
                        : 'full'
                    }
                    playback={transportPlayback}
                    currentTime={mediaTime.current}
                    duration={mediaTime.duration}
                    onScrubbingChange={(s) => {
                      mediaScrubbingRef.current = s
                    }}
                    onChange={(partial) => {
                      setTransportPlayback(partial)
                    }}
                  />
                )}
                <div className="cam-controls">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={bgCameraEnabled}
                      onChange={(e) => void setCameraAsBackground(e.target.checked)}
                    />
                    Câmera de fundo
                  </label>
                  <select
                    className="cam-bg-select"
                    value={
                      bgCameraId ||
                      live.cameraDeviceId ||
                      cameras[0]?.deviceId ||
                      ''
                    }
                    disabled={!cameras.length}
                    onChange={(e) => {
                      const id = e.target.value
                      setBgCameraId(id || null)
                      if (bgCameraEnabled) {
                        void setCameraAsBackground(true, id)
                      } else {
                        // Só memoriza a escolha — não liga o fundo
                        persistBgCameraPref(false, id || null)
                      }
                    }}
                    title="Escolher câmera de fundo"
                  >
                    {!cameras.length ? (
                      <option value="">Nenhuma câmera</option>
                    ) : null}
                    {cameras.map((cam, i) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `Câmera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="quick-slots">
                  {(
                    [
                      { slot: 'video' as const, item: quickVideoItem, label: 'Vídeo' },
                      { slot: 'image' as const, item: quickImageItem, label: 'Imagem' },
                    ]
                  ).map(({ slot, item, label }) => (
                    <div className="quick-slot" key={slot}>
                      <div className="quick-slot-thumb-wrap">
                        <button
                          type="button"
                          className="quick-slot-thumb"
                          title={
                            item
                              ? `Ao vivo: ${item.label}`
                              : `Escolher ${label.toLowerCase()}…`
                          }
                          onClick={() =>
                            item ? takeQuickMediaLive(item) : void pickQuickMedia(slot)
                          }
                        >
                          {item ? (
                            slot === 'image' && item.mediaPath ? (
                              <img src={toMediaUrl(item.mediaPath) ?? undefined} alt={item.label} />
                            ) : (
                              <span className="quick-slot-icon" aria-hidden="true">
                                {slot === 'video' ? '▶' : '🖼'}
                              </span>
                            )
                          ) : (
                            <span className="quick-slot-icon empty" aria-hidden="true">
                              {slot === 'video' ? '▶' : '🖼'}
                            </span>
                          )}
                          <span className="quick-slot-label">{item ? item.label : label}</span>
                        </button>
                        {item ? (
                          <button
                            type="button"
                            className="quick-slot-clear"
                            title={`Remover ${label.toLowerCase()}`}
                            aria-label={`Remover ${label.toLowerCase()}`}
                            onClick={() => clearQuickMedia(slot)}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                      {item ? (
                        <div
                          className={`quick-slot-fit-menu${quickFitMenuOpen === slot ? ' open' : ''}`}
                          ref={quickFitMenuOpen === slot ? quickFitMenuRef : undefined}
                        >
                          <button
                            type="button"
                            className="quick-slot-fit-toggle"
                            title={`Como o(a) ${label.toLowerCase()} preenche a tela`}
                            aria-label={`Como o(a) ${label.toLowerCase()} preenche a tela`}
                            aria-haspopup="true"
                            aria-expanded={quickFitMenuOpen === slot}
                            onClick={() =>
                              setQuickFitMenuOpen((o) => (o === slot ? null : slot))
                            }
                          >
                            ▾
                          </button>
                          {quickFitMenuOpen === slot ? (
                            <div className="quick-slot-fit-list" role="menu">
                              {(
                                [
                                  { value: 'contain' as const, label: 'Caber' },
                                  { value: 'cover' as const, label: 'Cobrir' },
                                  { value: 'fill' as const, label: 'Esticar' },
                                ]
                              ).map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={(item.mediaFit || 'contain') === opt.value}
                                  className={
                                    (item.mediaFit || 'contain') === opt.value ? 'on' : ''
                                  }
                                  onClick={() => {
                                    setQuickMediaFit(slot, opt.value)
                                    setQuickFitMenuOpen(null)
                                  }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="spectrum-live-controls">
                  <SpectrumControls
                    value={spectrum}
                    cameraDeviceId={live.cameraDeviceId || bgCameraId}
                    mediaLive={
                      live.kind === 'video' ||
                      live.kind === 'audio' ||
                      live.mediaKind === 'video' ||
                      live.mediaKind === 'audio'
                    }
                    onChange={(next) => {
                      setSpectrum(next)
                      void window.projection?.setOutputConfig({ spectrum: next })
                    }}
                  />
                </div>
              </div>
              </div>
            </div>
          </section>

          <section
            className={`panel plan cuelist ${planDragOver ? 'drop-target' : ''}`}
            ref={planZoneRef}
            onDragOver={(e) => {
              e.preventDefault()
              if (!planDragId) setPlanDragOver(true)
            }}
            onDragLeave={() => setPlanDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setPlanDragOver(false)
              setPlanDragId(null)
              setPlanDropId(null)
              const reorderId = e.dataTransfer.getData(
                'application/x-ible-plan-reorder',
              )
              if (reorderId) return
              const raw = e.dataTransfer.getData('application/x-ible-plan')
              if (raw) {
                try {
                  addToPlan(JSON.parse(raw) as PlanItem)
                } catch {
                  /* ignore */
                }
                return
              }
              if (e.dataTransfer.files?.length) {
                void dropFilesOnPlan(e.dataTransfer.files)
              }
            }}
          >
            <div className="operator-panel-heading plan-heading">
              <div>
                <span className="panel-kicker">Ordem do culto</span>
                <h2>Plano do show</h2>
              </div>
              <AutoAdvanceControls
                value={autoAdvance}
                status={autoStatus}
                lastHeard={autoLastHeard}
                loadMsg={autoLoadMsg}
                onChange={(next) => {
                  setAutoAdvance(next)
                  void window.projection?.setOutputConfig({ autoAdvance: next })
                }}
              />
              <span className="panel-count">{plan.length} itens</span>
            </div>
            <ul>
              {plan.map((item, index) => {
                const isArmed = !browsingItem && item.id === previewId
                const isOnAir = Boolean(
                  live.visible &&
                    live.kind === item.kind &&
                    ((item.kind === 'camera' &&
                      live.cameraPlanItemId === item.id) ||
                      live.title === (item.title || item.label)),
                )
                return (
                <li
                  key={item.id}
                  className={[
                    'plan-row',
                    planDragId === item.id ? 'is-dragging' : '',
                    planDropId === item.id && planDragId !== item.id
                      ? 'is-drop-target'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'move'
                    if (planDragId && planDragId !== item.id) {
                      setPlanDropId(item.id)
                    }
                  }}
                  onDragLeave={() => {
                    setPlanDropId((cur) => (cur === item.id ? null : cur))
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const fromId = e.dataTransfer.getData(
                      'application/x-ible-plan-reorder',
                    )
                    if (fromId) reorderPlan(fromId, item.id)
                    setPlanDragId(null)
                    setPlanDropId(null)
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    data-phrase-nav="1"
                    className={[
                      'plan-item',
                      isArmed ? 'armed' : '',
                      isOnAir ? 'on-air' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    draggable
                    onDragStart={(e) => {
                      setPlanDragId(item.id)
                      e.dataTransfer.setData(
                        'application/x-ible-plan-reorder',
                        item.id,
                      )
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      setPlanDragId(null)
                      setPlanDropId(null)
                    }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('.plan-item-actions')) {
                        return
                      }
                      // detail: 1 = armar preview; 2+ = AO VIVO no 1º slide
                      if (e.detail >= 2) takeLiveFromPlan(item)
                      else selectPlanItem(item)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectPlanItem(item)
                      }
                    }}
                    title="1 clique: preview no 1º slide · 2 cliques: AO VIVO no 1º slide · arraste para reordenar"
                  >
                    <span className="cue-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="kind">{kindIcon(item.kind)}</span>
                    <span className="cue-copy">
                      <span className="label">{item.label}</span>
                      <span className="cue-kind">
                        {detailColumnHeading(item, false)}
                      </span>
                    </span>
                    <span className="cue-end">
                      {isOnAir || isArmed ? (
                        <span
                          className={`cue-status${isOnAir ? ' is-live' : ''}`}
                        >
                          {isOnAir ? 'NO AR' : 'PREVIEW'}
                        </span>
                      ) : (
                        <span
                          className="cue-status cue-status-spacer"
                          aria-hidden="true"
                        />
                      )}
                      <span className="plan-item-actions">
                        {item.kind === 'camera' ? (
                          <button
                            type="button"
                            className="plan-camera-edit"
                            title="Editar câmera"
                            aria-label={`Editar ${item.label}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              void openCameraEditor(
                                item,
                                live.kind === 'camera' &&
                                  live.cameraPlanItemId === item.id,
                              )
                            }}
                          >
                            ✎
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="plan-remove"
                          title="Remover"
                          aria-label="Remover do plano"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmRemovePlanItem(item)
                          }}
                        >
                          ×
                        </button>
                      </span>
                    </span>
                  </div>
                </li>
                )
              })}
            </ul>
            {!plan.length ? (
              <div className="plan-empty">
                <span aria-hidden="true">＋</span>
                <p>Arraste itens da biblioteca para montar o plano.</p>
              </div>
            ) : null}
          </section>
        </div>
      ) : tab === 'temas' ? (
        <div className="theme-studio">
          <section className="panel theme-studio-controls-panel">
            <h2>Ajustes</h2>
            <ThemeEditor
              theme={editingTheme}
              onChange={setEditingTheme}
              extraFonts={importedFonts}
              editTarget={themeEditTarget}
            />
          </section>

          <section className="panel theme-studio-canvas-panel">
            <div className="theme-canvas-toolbar">
              <h2>Canvas</h2>
            </div>
            <div className="theme-canvas-shell">
              <div className="theme-canvas" style={stageFrameStyle}>
                <ThemeStudioPreview
                  theme={editingTheme}
                  onChange={setEditingTheme}
                  editTarget={themeEditTarget}
                  onSelectTarget={setThemeEditTarget}
                  outputSafeArea={outputAreaValue}
                />
              </div>
            </div>
            <ThemeStageExtras
              theme={editingTheme}
              onChange={setEditingTheme}
            />
          </section>

          <aside className="theme-studio-rail panel">
            <h2>Temas</h2>

            <div className="theme-picker-stack">
              <input
                className="lib-search"
                type="search"
                placeholder="Digite para filtrar…"
                value={themeQuery}
                onChange={(e) => {
                  const q = e.target.value
                  setThemeQuery(q)
                  const qq = q.trim().toLowerCase()
                  if (!qq) return
                  const hit = themes.find(
                    (t) => t.name.toLowerCase() === qq || t.id === q.trim(),
                  )
                  if (hit) setEditingTheme({ ...hit })
                }}
              />
              <select
                key={`theme-picker-${themesRev}-${themeSelectOptions.length}`}
                className="theme-picker-select"
                value={
                  themeSelectOptions.some((t) => t.id === editingTheme.id)
                    ? editingTheme.id
                    : themeSelectOptions[0]?.id || ''
                }
                onChange={(e) => {
                  const t = themes.find((x) => x.id === e.target.value)
                  if (t) setEditingTheme({ ...t })
                }}
              >
                {themeSelectOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="theme-rail-toggles">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={themeLiveApply}
                  onChange={(e) => {
                    setThemeLiveApply(e.target.checked)
                    if (e.target.checked) commitTheme(editingTheme, true)
                  }}
                />
                Editar ao vivo
              </label>
              <label
                className="toggle-row"
                title="Tema padrão da saída (marcado aqui)"
              >
                <input
                  type="checkbox"
                  checked={editingTheme.id === defaultThemeId}
                  onChange={(e) => {
                    if (e.target.checked) markThemeAsDefault(editingTheme)
                  }}
                />
                Padrão
              </label>
            </div>

            <div className="theme-actions">
              <button
                type="button"
                className="primary"
                disabled={themeBusy}
                onClick={() => void persistNamedTheme('save')}
              >
                Salvar
              </button>
              <button
                type="button"
                className="ghost"
                disabled={themeBusy}
                onClick={openSaveAsModal}
              >
                Salvar como
              </button>
              <button
                type="button"
                className="ghost"
                disabled={themeBusy}
                onClick={() => void persistNamedTheme('apply')}
              >
                Aplicar
              </button>
            </div>
            <div className="theme-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => void importTheme()}
              >
                Importar JSON…
              </button>
            </div>

            <div className="theme-studio-fonts">
              <div className="theme-studio-fonts-head">
                <h3>Fontes Google</h3>
                <label className="fonts-installed-check">
                  <input
                    type="checkbox"
                    checked={fontsInstalledOnly}
                    onChange={(e) => {
                      const next = e.target.checked
                      setFontsInstalledOnly(next)
                      void searchFontCatalog(fontQuery, next)
                    }}
                  />
                  Instaladas
                  {importedFonts.length ? ` (${importedFonts.length})` : ''}
                </label>
              </div>
              <div className="fonts-import-row">
                <input
                  type="search"
                  className="lib-search"
                  placeholder={
                    fontsInstalledOnly
                      ? 'Filtrar instaladas…'
                      : 'Montserrat, Oswald…'
                  }
                  value={fontQuery}
                  onChange={(e) => void searchFontCatalog(e.target.value)}
                />
                {!fontsInstalledOnly ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={fontBusy || !fontQuery.trim()}
                    onClick={() => void importGoogleFont(fontQuery)}
                  >
                    {fontBusy ? '…' : 'Importar'}
                  </button>
                ) : null}
              </div>
              <div className="font-catalog">
                {fontCatalog.map((f) => (
                  <div
                    key={f.id}
                    className={`font-chip-wrap${f.imported ? ' is-installed' : ''}`}
                  >
                    <button
                      type="button"
                      className={`font-chip${f.imported ? ' is-installed' : ''}`}
                      style={{ fontFamily: `"${f.family}", sans-serif` }}
                      disabled={fontBusy || Boolean(f.imported)}
                      onClick={() => {
                        if (!f.imported) void importGoogleFont(f.family)
                      }}
                      title={
                        f.imported
                          ? 'Já instalada — use × para remover'
                          : 'Importar fonte'
                      }
                    >
                      <span className="font-chip-name">{f.family}</span>
                      {f.imported ? (
                        <span className="font-chip-badge">Instalada</span>
                      ) : null}
                    </button>
                    {f.imported ? (
                      <button
                        type="button"
                        className="font-chip-remove"
                        title="Remover fonte"
                        aria-label={`Remover ${f.family}`}
                        disabled={fontBusy}
                        onClick={(e) => {
                          e.stopPropagation()
                          void removeGoogleFont(
                            f.importedId || f.id,
                            f.family,
                          )
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
                {fontQuery.trim() && !fontCatalog.length ? (
                  <span className="hint">
                    Nenhuma fonte com “{fontQuery.trim()}”
                  </span>
                ) : null}
                {!fontQuery.trim() && !fontCatalog.length ? (
                  <span className="hint">
                    {fontsInstalledOnly
                      ? 'Nenhuma fonte instalada'
                      : 'Digite para buscar no Google Fonts'}
                  </span>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="op-saidas">
          <div className="saidas-left-col">
          <section className="panel">
            <div className="panel-head-row">
              <h2>Monitores</h2>
              <button
                type="button"
                className={`btn-refresh-monitors${refreshingDisplays ? ' is-spinning' : ''}`}
                title="Atualizar monitores"
                aria-label="Atualizar monitores"
                disabled={refreshingDisplays}
                onClick={() => {
                  setRefreshingDisplays(true)
                  void window.projection
                    ?.listDisplays()
                    .then((next) => {
                      if (next) setDisplays(next)
                    })
                    .finally(() => {
                      window.setTimeout(() => setRefreshingDisplays(false), 450)
                    })
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                  />
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3v5h5"
                  />
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
                  />
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 16h5v5"
                  />
                </svg>
              </button>
            </div>
            <div className="display-list">
              {displays.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={displayId === d.id && mode === 'single' ? 'display on' : 'display'}
                  onClick={() => void selectMonitor(d.id)}
                >
                  <strong>{d.label || `Display ${d.id}`}</strong>
                  <span>
                    {d.bounds.width}×{d.bounds.height}
                    {d.primary ? ' · principal' : ' · secundário'}
                    {displayId === d.id && mode === 'single' ? ' · selecionado' : ''}
                  </span>
                </button>
              ))}
              {!displays.length && (
                <p className="hint">Nenhum monitor detectado.</p>
              )}
            </div>
            <button
              type="button"
              className={mode === 'span' ? 'display on span' : 'display span'}
              onClick={() => {
                setMode('span')
                void window.projection?.setOutputConfig({
                  mode: 'span',
                  displayId: null,
                })
              }}
              disabled={displays.length < 2}
            >
              <strong>Span — juntar 2 projetores</strong>
              <span>
                {displays.length < 2
                  ? 'Conecte 2 displays para habilitar'
                  : 'Proporção combinada para margens'}
              </span>
            </button>
          </section>

          <section className="panel saidas-avancado-panel">
            <h2>Avançado</h2>
            <div className="avancado-item">
              <div className="panel-head-row">
                <h3>Simulação</h3>
                <label
                  className="toggle-row"
                  title={
                    simulation
                      ? 'Simulação ligada: só Preview e Exibição (sem tela de apresentação)'
                      : 'Desligar simulação e usar tela de apresentação'
                  }
                >
                  <input
                    type="checkbox"
                    checked={simulation}
                    onChange={() => void toggleSimulation()}
                  />
                </label>
              </div>
              <p className="hint">
                Com simulação, a saída fica só nos monitores do operador — sem
                janela fullscreen no projetor.
              </p>
            </div>
            <div className="avancado-item">
              <h3>Overlay transmissão (OBS)</h3>
              <code className="url allow-select">{overlayUrl}</code>
            </div>
            <div className="avancado-item">
              <div className="panel-head-row">
                <h3>Saída NDI</h3>
                <label
                  className="toggle-row ndi-toggle-row"
                  title="Enviar projeção na rede via NDI"
                >
                  <input
                    type="checkbox"
                    checked={ndiEnabled}
                    disabled={ndiBusy || !ndiInfo.available}
                    onChange={() => void toggleNdi()}
                  />
                </label>
              </div>
              <input
                className="ndi-name-input"
                value={ndiName}
                disabled={!ndiEnabled || ndiBusy}
                placeholder="ProShow"
                spellCheck={false}
                onChange={(e) => setNdiName(e.target.value)}
                onBlur={() => void commitNdiName()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
              />
              {ndiInfo.error ? (
                <p className="hint ndi-error">{ndiInfo.error}</p>
              ) : null}
            </div>
          </section>
          </div>

          <div className="saidas-right-col">
          <section className="panel saidas-margin-panel">
            <h2>Margem da saída</h2>
            <OutputSafeAreaEditor
              aspect={outputAspect}
              value={outputAreaValue}
              label="Limite externo de tudo o que é projetado — letra, título, Bíblia, mídia e câmera. As margens dos temas recortam dentro dela, nunca para fora. Arraste as bordas para ajustar."
              onChange={setOutputAreaDraft}
              onCommit={(next) => {
                void window.projection
                  ?.setOutputConfig({ safeArea: next })
                  .then(() => setOutputAreaDraft(null))
              }}
            />
          </section>
          </div>
        </div>
      )}

      {confirmRemovePlanItem ? (
        <ConfirmModal
          title="Remover do plano"
          message={`Remover “${confirmRemovePlanItem.label}” do plano do culto?`}
          confirmLabel="Remover"
          danger
          onCancel={() => setConfirmRemovePlanItem(null)}
          onConfirm={confirmRemoveFromPlan}
        />
      ) : null}

      {confirmDeleteMediaItem ? (
        <ConfirmModal
          title="Remover mídia"
          message={`Apagar “${confirmDeleteMediaItem.label}” do arquivo? Essa ação não pode ser desfeita.`}
          confirmLabel="Remover"
          danger
          onCancel={() => setConfirmDeleteMediaItem(null)}
          onConfirm={() => void confirmDeleteMedia()}
        />
      ) : null}

      {saveAsOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !themeBusy && setSaveAsOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Salvar como novo tema</h2>
            <label className="theme-picker-label">
              Nome do novo tema
              <input
                autoFocus
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void persistNamedTheme('save-as', saveAsName)
                  }
                }}
                placeholder="Ex.: Louvor grande"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                disabled={themeBusy}
                onClick={() => setSaveAsOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                disabled={themeBusy || !saveAsName.trim()}
                onClick={() => void persistNamedTheme('save-as', saveAsName)}
              >
                {themeBusy ? 'Salvando…' : 'Criar tema'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCameras && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowCameras(false)
            setCameraPickId(null)
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {cameraInsertMode === 'live'
                ? 'Inserir câmera ao vivo'
                : 'Adicionar câmera ao plano'}
            </h2>
            <p className="camera-overlay-hint">
              1 clique seleciona · 2 cliques ou Adicionar confirma. A câmera de
              fundo continua no bloco AO VIVO.
            </p>
            <label className="camera-caption-field">
              Legenda
              <input
                value={cameraCaption}
                onChange={(e) => setCameraCaption(e.target.value)}
                placeholder="Nome da pessoa na câmera"
              />
              <small>Aparece no canto inferior esquerdo da projeção.</small>
            </label>
            <label className="toggle-row camera-isolate-option">
              <input
                type="checkbox"
                checked={cameraVoiceIsolate}
                onChange={(e) => setCameraVoiceIsolate(e.target.checked)}
              />
              Isolar voz (áudio desta câmera)
            </label>
            <ul className="camera-list">
              {cameras.map((cam) => (
                <li key={cam.deviceId}>
                  <button
                    type="button"
                    className={
                      cameraPickId === cam.deviceId ? 'camera-pick on' : 'camera-pick'
                    }
                    disabled={cameraListBusy}
                    onClick={() => setCameraPickId(cam.deviceId)}
                    onDoubleClick={() => void confirmCameraPick(cam.deviceId)}
                  >
                    {cam.label || `Câmera ${cam.deviceId.slice(0, 8)}`}
                  </button>
                </li>
              ))}
              {!cameras.length && !cameraListBusy && (
                <li className="hint">Nenhuma câmera encontrada.</li>
              )}
              {cameraListBusy ? <li className="hint">Buscando câmeras…</li> : null}
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                disabled={cameraListBusy}
                onClick={() => {
                  setCameraListBusy(true)
                  void refreshCameras().finally(() => setCameraListBusy(false))
                }}
              >
                {cameraListBusy ? 'Atualizando…' : 'Atualizar lista'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setShowCameras(false)
                  setCameraPickId(null)
                }}
              >
                Fechar
              </button>
              <button
                type="button"
                className="primary"
                disabled={!cameraPickId || cameraListBusy}
                onClick={() => void confirmCameraPick()}
              >
                {cameraInsertMode === 'live' ? 'Adicionar ao vivo' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showMediaUrl && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (mediaUrlBusy) return
            setShowMediaUrl(false)
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Adicionar por URL</h2>
            <p className="camera-overlay-hint">
              Qualquer página web, YouTube, ou link direto de imagem/vídeo/áudio.
            </p>
            <label className="camera-caption-field">
              URL
              <input
                autoFocus
                type="url"
                value={mediaUrlDraft}
                onChange={(e) => setMediaUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  void importMediaFromUrl()
                }}
                placeholder="https://…"
                disabled={mediaUrlBusy}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                disabled={mediaUrlBusy}
                onClick={() => setShowMediaUrl(false)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="primary"
                disabled={mediaUrlBusy || !mediaUrlDraft.trim()}
                onClick={() => void importMediaFromUrl()}
              >
                {mediaUrlBusy ? 'Importando…' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {cameraEditDraft ? (
        <div
          className="modal-backdrop"
          onClick={() => setCameraEditDraft(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Editar câmera</h2>
            <p className="camera-overlay-hint">
              As alterações também são aplicadas à câmera no ar quando este é
              o item em exibição.
            </p>
            <label className="camera-caption-field">
              Câmera
              <select
                value={cameraEditDraft.deviceId}
                onChange={(e) =>
                  setCameraEditDraft((draft) =>
                    draft
                      ? { ...draft, deviceId: e.target.value }
                      : draft,
                  )
                }
              >
                {cameraEditDraft.deviceId &&
                !cameras.some(
                  (camera) =>
                    camera.deviceId === cameraEditDraft.deviceId,
                ) ? (
                  <option value={cameraEditDraft.deviceId}>
                    Câmera atual (indisponível)
                  </option>
                ) : null}
                {!cameraEditDraft.deviceId ? (
                  <option value="">Selecione uma câmera</option>
                ) : null}
                {cameras.map((camera, index) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `Câmera ${index + 1}`}
                  </option>
                ))}
              </select>
              {cameraEditBusy ? <small>Atualizando câmeras…</small> : null}
            </label>
            <label className="camera-caption-field">
              Legenda
              <input
                autoFocus
                value={cameraEditDraft.caption}
                onChange={(e) =>
                  setCameraEditDraft((draft) =>
                    draft
                      ? { ...draft, caption: e.target.value }
                      : draft,
                  )
                }
                placeholder="Nome da pessoa na câmera"
              />
              <small>Aparece no canto inferior esquerdo da projeção.</small>
            </label>
            <label className="toggle-row camera-isolate-option">
              <input
                type="checkbox"
                checked={cameraEditDraft.voiceIsolate}
                onChange={(e) =>
                  setCameraEditDraft((draft) =>
                    draft
                      ? { ...draft, voiceIsolate: e.target.checked }
                      : draft,
                  )
                }
              />
              Isolar voz (áudio desta câmera)
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setCameraEditDraft(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                disabled={!cameraEditDraft.deviceId}
                onClick={() => void saveCameraEdit()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {songEditorTarget ? (
        <SongEditor
          initial={
            songEditorTarget === 'new'
              ? null
              : {
                  id: songKey(songEditorTarget),
                  title: songEditorTarget.title || songEditorTarget.label,
                  artist: songEditorTarget.artist,
                  lines: songEditorTarget.lines,
                  sections: songEditorTarget.sections,
                  themeId: songEditorTarget.themeId ?? null,
                }
          }
          themes={themes}
          knownArtists={knownArtists}
          librarySongs={library.filter((s) => s.kind === 'lyrics')}
          onCancel={() => setSongEditorTarget(null)}
          onSave={(song) => void saveSongFromEditor(song)}
        />
      ) : null}
    </div>
  )
}

function kindIcon(kind: PlanItem['kind']) {
  switch (kind) {
    case 'lyrics':
      return '♪'
    case 'bible':
      return '†'
    case 'video':
      return '▶'
    case 'audio':
      return '♫'
    case 'image':
      return '▣'
    case 'deck':
      return '▦'
    case 'file':
      return '▤'
    case 'web':
      return '◎'
    case 'camera':
      return '◉'
    default:
      return '·'
  }
}
