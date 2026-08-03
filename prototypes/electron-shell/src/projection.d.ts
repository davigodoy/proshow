import type { ArtisticLayoutPlan } from './theme/artisticLayout'
import type { AutoAdvanceConfig } from './auto-advance/types'

export type LiveKind =
  | 'lyrics'
  | 'bible'
  | 'camera'
  | 'video'
  | 'audio'
  | 'image'
  | 'deck'
  | 'web'
  | 'file'

/** Item mínimo persistido nos slots rápidos (vídeo/imagem) do Show. */
export type QuickMediaItem = {
  id: string
  kind: string
  label: string
  title?: string | null
  lines: string[]
  mediaPath: string | null
  mediaKind?: string | null
  mediaFit?: 'contain' | 'cover' | 'fill' | null
  slidePaths?: Array<string | null> | null
}

/** Preferência de espectro na projeção (prefs + output-config). */
export type SpectrumConfig = {
  enabled: boolean
  style:
    | 'bars-neon'
    | 'bars-mirror'
    | 'wave-silk'
    | 'radial-pulse'
    | 'mesh-3d'
    | 'particles'
    | 'aurora'
    | 'horizon'
    | 'halo'
    | 'ember'
  placement: 'background' | 'hud'
  source: 'audio-device' | 'camera' | 'media'
  audioDeviceId: string | null
  channel: 'mix' | 'l' | 'r' | number
  opacity: number
  monitorAudio: boolean
}

export type ThemeVertical = 'top' | 'center' | 'bottom'
export type ThemeAlign = 'left' | 'center' | 'right'
export type ThemeTitlePlacement = 'above' | 'below'
export type ThemeAnimation =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'zoom-out'

export type PhraseStyle = {
  /** id de um tema da lista; omitido = herda o tema global */
  themeId?: string | null
  /** animação só desta frase; omitido = herda */
  animation?: ThemeAnimation | null
}

export type LiveState = {
  title: string
  artist?: string | null
  lines: string[]
  emphasis: string[]
  visible: boolean
  kind?: LiveKind
  cameraDeviceId?: string | null
  /** Legenda inferior exibida apenas quando a câmera principal está no ar. */
  cameraCaption?: string | null
  /** Item do plano que originou a câmera no ar (permite edição sincronizada). */
  cameraPlanItemId?: string | null
  mediaPath?: string | null
  mediaKind?: 'image' | 'video' | 'audio' | 'deck' | 'file' | 'web' | null
  /** Como a imagem preenche o quadro (só mediaKind==='image'). */
  mediaFit?: 'contain' | 'cover' | 'fill' | null
  /**
   * PDF/deck em modo scroll: todas as páginas. O ao vivo mostra o recorte
   * da viewport segundo `mediaScrollRatio` (0–1).
   */
  mediaSlidePaths?: Array<string | null> | null
  mediaScrollRatio?: number
  /** Controles do player (vídeo/áudio) */
  mediaPlaying?: boolean
  mediaMuted?: boolean
  mediaLoop?: boolean
  mediaVolume?: number
  mediaSeekTo?: number | null
  mediaSeekSeq?: number
  /** Isolar voz (RNNoise) no áudio de vídeo/áudio/câmera principal */
  mediaVoiceIsolate?: boolean
  /** Tema efetivo da frase atual (override) */
  themeOverride?: ProjectionTheme | null
  /**
   * Até 3 frases da composição artística.
   * Só é usado quando `stackArtistic` está ativo.
   */
  phraseSlots?: string[] | null
  /** Tema de cada frase artística (mesmo comprimento que phraseSlots) */
  slotThemes?: ProjectionTheme[] | null
  /** Composição artística em mosaico. */
  stackArtistic?: boolean
  /** Plano congelado compartilhado entre Preview, AO VIVO e Output. */
  artisticPlan?: ArtisticLayoutPlan | null
  /**
   * Camada de texto (título/artista/letra) na projeção.
   * Sempre ativa na prática (sem toggle na UI); false só por compatibilidade antiga.
   */
  showText?: boolean
  /**
   * Portões do bloco AO VIVO — AND com o tema (S+S=S; senão N).
   * omitido/true = permite; false = esconde mesmo se o tema pedir.
   */
  gateTitle?: boolean
  gateArtist?: boolean
  gateLyrics?: boolean
}

export type ProjectionTheme = {
  id: string
  name: string
  fontFamily: string
  titleFontFamily?: string
  phraseFontFamily?: string
  lyricSizeVw: number
  /** PREENCHER — ver `theme/sizeMode.ts`. Ausente = tema legado. */
  fillMode?: boolean
  /** % da área usada quando `fillMode === true`. */
  fillPct?: number
  /** Teto de linhas por slide. `0`/ausente = ilimitado; `1` = sem quebra. */
  maxLines?: number
  titleSizeVw: number
  lyricColor: string
  titleColor: string
  titleOpacity: number
  fontWeight: number
  letterSpacingEm: number
  lineHeight: number
  textAlign: ThemeAlign
  vertical: ThemeVertical
  offsetXPct: number
  offsetYPct: number
  titleOffsetXPct?: number
  titleOffsetYPct?: number
  /** Rotação da letra em graus (origem no centro) */
  rotationDeg?: number
  /** Rotação do título em graus (independente) */
  titleRotationDeg?: number
  padXVw: number
  padYVh: number
  /** Área de texto (% de margem) — parte do tema */
  safeArea?: {
    top: number
    right: number
    bottom: number
    left: number
  }
  textShadow: string
  overlayGradient: string
  backgroundColor: string
  backgroundImage?: string | null
  backgroundVideo?: string | null
  showTitle: boolean
  showArtist: boolean
  showLyrics: boolean
  /** Título/artista acima ou abaixo da frase */
  titlePlacement?: ThemeTitlePlacement
  /** Força texto em MAIÚSCULAS na projeção */
  uppercase?: boolean
  /** Permite quebra de linha na letra */
  wrapLines?: boolean
  animation: ThemeAnimation
  animationMs: number
  /** Modo 1 linha: atraso da entrada após a saída (0 = juntas) */
  animationIntervalMs?: number
}

export type DisplayInfo = {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
}

export type HolyricsLibraryItem = {
  id: string
  kind: 'lyrics'
  label: string
  title?: string
  artist?: string
  author?: string
  lines: string[]
  slides?: string[]
  source?: string
  /** Seções da letra (verso/refrão/…); opcional. */
  sections?: Array<{
    id: string
    kind: string
    variant: number
    lines: string[]
  }> | null
  phraseStyles?: PhraseStyle[]
  themeId?: string | null
  uppercase?: boolean | null
}

/** Item do plano do show (ordem do culto) — persiste em disco. */
export type ShowPlanItem = {
  id: string
  libraryId?: string
  kind: LiveKind
  label: string
  lines: string[]
  sections?: HolyricsLibraryItem['sections']
  title?: string
  artist?: string
  source?: string
  cameraDeviceId?: string | null
  cameraCaption?: string | null
  mediaVoiceIsolate?: boolean
  mediaPath?: string | null
  mediaKind?: 'image' | 'video' | 'audio' | 'deck' | 'file' | 'web' | null
  mediaFit?: 'contain' | 'cover' | 'fill' | null
  slidePaths?: Array<string | null>
  webUrl?: string | null
  note?: string
  phraseStyles?: Array<PhraseStyle | null>
  themeId?: string | null
  uppercase?: boolean | null
  bgMediaPath?: string | null
  bgMediaKind?: 'image' | 'video' | null
}

export type HolyricsImportResult = {
  canceled?: boolean
  found?: boolean
  library: HolyricsLibraryItem[]
  meta?: {
    source?: string
    ok?: number
    fail?: number
    count?: number
    path?: string | null
  }
}

export type ProjectionAPI = {
  getLive: () => Promise<LiveState>
  setLive: (next: Partial<LiveState>) => Promise<LiveState>
  onLive: (cb: (live: LiveState) => void) => () => void
  listDisplays: () => Promise<DisplayInfo[]>
  getOutputConfig: () => Promise<{
    mode: string
    displayId: number | null
    overlayUrl: string
    displays?: DisplayInfo[]
    simulation?: boolean
    outputOpen?: boolean
    safeArea?: {
      top: number
      right: number
      bottom: number
      left: number
    }
    bibleSafeArea?: {
      top: number
      right: number
      bottom: number
      left: number
    }
    bibleThemeId?: string | null
    bibleShowTitle?: boolean
    bibleShowLyrics?: boolean
    bgCameraEnabled?: boolean
    bgCameraDeviceId?: string | null
    showText?: boolean
    gateTitle?: boolean
    gateArtist?: boolean
    gateLyrics?: boolean
    /** Modo criativo (só letras) — restaurado da última sessão */
    stackArtistic?: boolean
    /** Sub-modo Max do criativo (empilha até 3 frases) — restaurado da última sessão */
    stackArtisticMax?: boolean
    /** Slots rápidos do Show: vídeo/imagem pré-selecionados */
    quickVideoItem?: QuickMediaItem | null
    quickImageItem?: QuickMediaItem | null
    spectrum?: SpectrumConfig | null
    autoAdvance?: AutoAdvanceConfig | null
  }>
  setOutputConfig: (cfg: {
    mode?: string
    displayId?: number | null
    simulation?: boolean
    safeArea?: {
      top: number
      right: number
      bottom: number
      left: number
    }
    bibleSafeArea?: {
      top: number
      right: number
      bottom: number
      left: number
    }
    bibleThemeId?: string | null
    bibleShowTitle?: boolean
    bibleShowLyrics?: boolean
    bgCameraEnabled?: boolean
    bgCameraDeviceId?: string | null
    stackArtistic?: boolean
    stackArtisticMax?: boolean
    quickVideoItem?: QuickMediaItem | null
    quickImageItem?: QuickMediaItem | null
    spectrum?: SpectrumConfig | null
    autoAdvance?: AutoAdvanceConfig | null
  }) => Promise<{
    mode: string
    displayId: number | null
    bounds?: unknown
    displays?: DisplayInfo[]
    simulation?: boolean
    outputOpen?: boolean
    safeArea?: {
      top: number
      right: number
      bottom: number
      left: number
    }
    bibleSafeArea?: {
      top: number
      right: number
      bottom: number
      left: number
    }
    bibleThemeId?: string | null
    bibleShowTitle?: boolean
    bibleShowLyrics?: boolean
    spectrum?: SpectrumConfig | null
    autoAdvance?: AutoAdvanceConfig | null
  }>
  /** Abre a janela de projeção — só usar no AO VIVO */
  openProgramOutput: () => Promise<{
    mode: string
    displayId: number | null
    simulation?: boolean
    outputOpen?: boolean
    safeArea?: {
      top: number
      right: number
      bottom: number
      left: number
    }
  }>
  setSimulation: (enabled: boolean) => Promise<{
    simulation: boolean
    outputOpen: boolean
  }>
  closeOutput: () => Promise<{ simulation: boolean; outputOpen: boolean }>
  reassertOutput: () => Promise<boolean>
  onSimulation: (
    cb: (state: { simulation: boolean; outputOpen: boolean }) => void,
  ) => () => void
  onOutputConfig: (
    cb: (cfg: {
      mode?: string
      displayId?: number | null
      simulation?: boolean
      outputOpen?: boolean
      safeArea?: {
        top: number
        right: number
        bottom: number
        left: number
      }
      bibleSafeArea?: {
        top: number
        right: number
        bottom: number
        left: number
      }
      bibleThemeId?: string | null
      bibleShowTitle?: boolean
      bibleShowLyrics?: boolean
      spectrum?: SpectrumConfig | null
    autoAdvance?: AutoAdvanceConfig | null
    }) => void,
  ) => () => void
  onDisplays: (cb: (displays: DisplayInfo[]) => void) => () => void
  holyricsFindDefault: () => Promise<string | null>
  holyricsImportPath: (filePath: string) => Promise<HolyricsImportResult>
  holyricsImportDialog: () => Promise<HolyricsImportResult>
  holyricsImportAuto: () => Promise<HolyricsImportResult>
  listThemes: () => Promise<ProjectionTheme[]>
  getTheme: () => Promise<ProjectionTheme>
  setTheme: (theme: ProjectionTheme | Partial<ProjectionTheme>) => Promise<ProjectionTheme>
  getBibleTheme: () => Promise<ProjectionTheme>
  setBibleTheme: (theme: ProjectionTheme | Partial<ProjectionTheme>) => Promise<ProjectionTheme>
  saveTheme: (theme: ProjectionTheme) => Promise<{
    theme: ProjectionTheme
    themes: ProjectionTheme[]
  }>
  saveThemeAs: (
    theme: ProjectionTheme,
    name: string,
  ) => Promise<{ theme: ProjectionTheme; themes: ProjectionTheme[] }>
  deleteTheme: (themeId: string) => Promise<{
    ok: boolean
    error?: string
    themes?: ProjectionTheme[]
  }>
  pickThemeBackground: (kind?: 'image' | 'video') => Promise<{
    canceled?: boolean
    path?: string
    kind?: 'image' | 'video'
  }>
  importThemeDialog: () => Promise<{
    canceled?: boolean
    theme?: ProjectionTheme
    themes?: ProjectionTheme[]
  }>
  onTheme: (cb: (theme: ProjectionTheme) => void) => () => void
  onThemesList: (cb: (themes: ProjectionTheme[]) => void) => () => void
  onBibleTheme: (cb: (theme: ProjectionTheme) => void) => () => void
  bibleVersions: () => Promise<Array<{ id: string; label: string }>>
  bibleBooks: (versionId: string) => Promise<
    Array<{ index: number; abbrev: string; name: string; chapters: number }>
  >
  bibleChapter: (payload: {
    versionId: string
    bookIndex: number
    chapterIndex: number
  }) => Promise<{
    verses: Array<{ n: number; text: string }>
    book: { name: string; abbrev: string; index: number }
    chapter: number
  }>
  bibleRange: (payload: {
    versionId: string
    bookIndex: number
    chapterIndex: number
    from: number
    to: number
  }) => Promise<{
    ref: string
    lines: string[]
    slides: string[]
    verses?: Array<{ n: number; text: string }>
    chapter?: number
  }>
  mediaList: () => Promise<
    Array<{
      id: string
      kind: string
      label: string
      path: string
      mime?: string
      lines: string[]
      slides?: Array<{ index: number; path: string | null; text: string }>
      slidePaths?: Array<string | null>
      note?: string
    }>
  >
  mediaDelete: (item: {
    id: string
    kind: string
  }) => Promise<{ ok: boolean; error?: string }>
  mediaImportDialog: (opts?: { kind?: 'video' | 'image' }) => Promise<{
    canceled?: boolean
    ffmpeg?: boolean
    note?: string
    items: Array<{
      id: string
      kind: string
      label: string
      path: string
      mime?: string
      note?: string
      lines: string[]
      slides?: Array<{ index: number; path: string | null; text: string }>
      slidePaths?: Array<string | null>
    }>
  }>
  mediaImportPaths: (paths: string[]) => Promise<{
    items: Array<{
      id: string
      kind: string
      label: string
      path: string
      mime?: string
      note?: string
      lines: string[]
      slides?: Array<{ index: number; path: string | null; text: string }>
      slidePaths?: Array<string | null>
    }>
    note?: string
  }>
  mediaImportUrl: (url: string) => Promise<{
    ok?: boolean
    error?: string
    note?: string
    ffmpeg?: boolean
    items: Array<{
      id: string
      kind: string
      label: string
      path: string
      mime?: string
      note?: string
      lines: string[]
      slidePaths?: Array<string | null>
      sourceUrl?: string
    }>
  }>
  saveWebLiveFrame: (
    dataUrl: string,
  ) => Promise<{ ok?: boolean; path?: string; error?: string }>
  mediaProbe: (filePath: string) => Promise<{
    ok?: boolean
    error?: string
    probe?: {
      format?: string | null
      container?: string | null
      width?: number | null
      height?: number | null
      duration?: number | null
      sizeBytes?: number | null
      sizeLabel?: string | null
      bitrate?: number | null
      bitrateLabel?: string | null
      fps?: string | null
      videoCodec?: string | null
      videoCodecLong?: string | null
      videoProfile?: string | null
      pixelFormat?: string | null
      colorSpace?: string | null
      audioCodec?: string | null
      audioCodecLong?: string | null
      audioBitrate?: number | null
      audioBitrateLabel?: string | null
      sampleRate?: number | null
      channels?: number | null
      channelLayout?: string | null
      rotation?: number | null
      hasVideo?: boolean
      hasAudio?: boolean
      streamCount?: number
      title?: string | null
      artist?: string | null
    }
  }>
  cameraEnsureAccess: () => Promise<{
    granted: boolean
    status: string
    error?: string
  }>
  fontsCatalog: (query?: string) => Promise<
    Array<{
      id: string
      family: string
      category: string
      imported?: boolean
      importedId?: string | null
    }>
  >
  fontsList: () => Promise<{
    imported: Array<{ id: string; family: string; value: string }>
    options: Array<{ id: string; label: string; value: string }>
    css: string
  }>
  fontsImport: (family: string) => Promise<{
    ok: boolean
    error?: string
    font?: { id: string; family: string; value: string }
    css?: string
  }>
  fontsRemove: (id: string) => Promise<{ ok: boolean; error?: string }>
  onFonts: (
    cb: (data: {
      imported: Array<{ id: string; family: string; value: string }>
      options: Array<{ id: string; label: string; value: string }>
      css: string
    }) => void,
  ) => () => void
  songSaveStyles: (payload: {
    songId: string
    phraseStyles?: Array<PhraseStyle | null>
    themeId?: string | null
    uppercase?: boolean | null
    bgMediaPath?: string | null
    bgMediaKind?: 'image' | 'video' | null
  }) => Promise<unknown>
  songLoadStyles: () => Promise<
    Record<
      string,
      {
        phraseStyles?: Array<PhraseStyle | null>
        themeId?: string | null
        uppercase?: boolean | null
      }
    >
  >
  songList: () => Promise<HolyricsLibraryItem[]>
  songUpsert: (song: Partial<HolyricsLibraryItem> & { lines: string[] }) => Promise<HolyricsLibraryItem>
  songDelete: (songId: string) => Promise<{
    ok: boolean
    removed?: boolean
    songs: HolyricsLibraryItem[]
  }>
  songSaveLibrary: (songs: HolyricsLibraryItem[]) => Promise<HolyricsLibraryItem[]>
  /** Plano do show — ordem do culto entre sessões */
  planLoad: () => Promise<ShowPlanItem[]>
  planSave: (items: ShowPlanItem[]) => Promise<ShowPlanItem[]>
  lyricsSearch: (payload: { title: string; artist?: string | null }) => Promise<
    | {
        ok: true
        title: string
        artist: string
        lines: string[]
        sourceUrl: string | null
        source: 'vagalume' | 'letras-mus-br'
      }
    | {
        ok: false
        reason: 'empty-query' | 'missing-key' | 'not-found' | 'network' | 'bad-response'
        detail?: string
      }
  >
  lyricsSuggest: (payload: {
    query: string
    limit?: number
  }) => Promise<
    | {
        ok: true
        items: Array<{
          title: string
          artist: string
          id: string | null
          url: string | null
        }>
        reason?: 'missing-key'
      }
    | {
        ok: false
        reason: 'network' | 'bad-response'
        detail?: string
      }
  >
  lyricsGetApiKey: () => Promise<string | null>
  lyricsSetApiKey: (key: string) => Promise<string | null>
  getPathForFile: (file: File) => string | null
  ndiStatus: () => Promise<{
    enabled: boolean
    available: boolean
    running: boolean
    name: string
    sourceName: string
    connections: number
    error: string | null
  }>
  ndiSetEnabled: (
    enabled: boolean,
    name?: string,
  ) => Promise<{
    enabled: boolean
    available: boolean
    running: boolean
    name: string
    sourceName: string
    connections: number
    error: string | null
  }>
  ndiSetName: (name: string) => Promise<{
    enabled: boolean
    available: boolean
    running: boolean
    name: string
    sourceName: string
    connections: number
    error: string | null
  }>
}

declare global {
  interface Window {
    projection?: ProjectionAPI
  }
}

export {}
