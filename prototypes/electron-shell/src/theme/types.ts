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

/** Tema visual reutilizável — aplica em qualquer música / bíblia / mídia */
export type ProjectionTheme = {
  id: string
  name: string
  fontFamily: string
  titleFontFamily?: string
  /** Fonte opcional só para o corpo da letra (frase) */
  phraseFontFamily?: string
  /**
   * Tamanho fixo da letra, em vw. Só manda quando `fillMode === false`.
   *
   * Em tema legado (`fillMode` ausente) este campo ainda carrega os dois
   * sentidos antigos decididos pelo limiar 20 — ver `resolveSizeMode`.
   */
  lyricSizeVw: number
  /**
   * PREENCHER. Ausente = tema legado, comportamento de hoje intacto.
   * `true` = cresce até `fillPct`% da área. `false` = fixo em `lyricSizeVw`,
   * e o que não couber vira slide novo.
   */
  fillMode?: boolean
  /** % da área usada quando `fillMode === true`. */
  fillPct?: number
  titleSizeVw: number
  lyricColor: string
  titleColor: string
  titleOpacity: number
  fontWeight: number
  letterSpacingEm: number
  lineHeight: number
  textAlign: ThemeAlign
  vertical: ThemeVertical
  /** Offset fino da letra (−50..50) em relação à âncora */
  offsetXPct: number
  offsetYPct: number
  /** Offset fino do título (−50..50), independente da letra */
  titleOffsetXPct?: number
  titleOffsetYPct?: number
  /** Rotação da letra em graus (origem no centro) */
  rotationDeg?: number
  /** Rotação do título em graus (independente da letra) */
  titleRotationDeg?: number
  padXVw: number
  padYVh: number
  /**
   * Área de texto (% de margem do quadro).
   * Título pode sair dela; a letra cabe dentro.
   */
  safeArea?: {
    top: number
    right: number
    bottom: number
    left: number
  }
  textShadow: string
  overlayGradient: string
  backgroundColor: string
  /** Fundo do tema: imagem estática (caminho absoluto) */
  backgroundImage?: string | null
  /** Fundo do tema: vídeo em loop (caminho absoluto) */
  backgroundVideo?: string | null
  /** O que aparece na projeção */
  showTitle: boolean
  showArtist: boolean
  showLyrics: boolean
  /** Título/artista acima ou abaixo da frase */
  titlePlacement?: ThemeTitlePlacement
  /** Força título, artista e letra em MAIÚSCULAS */
  uppercase?: boolean
  /**
   * Permite quebra de linha na letra (senão cada slide é uma linha).
   * Derivado de `maxLines`: fica falso apenas quando `maxLines === 1`.
   * Mantido porque o render e a saída já leem este campo.
   */
  wrapLines?: boolean
  /**
   * Máximo de linhas por slide. `0` (ou ausente) = ilimitado: usa toda a
   * altura da área de texto. `1` = uma linha só, sem quebra. O que passar
   * disso vira slide novo (no modo fixo).
   */
  maxLines?: number
  animation: ThemeAnimation
  animationMs: number
  /**
   * Modo 1 linha: atraso (ms) da entrada após o início da saída.
   * 0 = saída e entrada juntas (máxima sobreposição).
   */
  animationIntervalMs?: number
}

export type ThemeCssVars = Record<string, string>

export type ThemeUnitMode = 'viewport' | 'container'

export function themeToCssVars(
  theme: ProjectionTheme,
  mode: ThemeUnitMode = 'viewport',
): ThemeCssVars {
  const justify =
    theme.vertical === 'top'
      ? 'flex-start'
      : theme.vertical === 'bottom'
        ? 'flex-end'
        : 'center'

  const wu = mode === 'container' ? 'cqw' : 'vw'
  // Com container-type: inline-size só cqw é confiável
  const hu = mode === 'container' ? 'cqw' : 'vh'
  // Tamanho alvo do tema (o LyricStage encaixa no quadro se precisar)
  const lyric = Number(theme.lyricSizeVw)
  const title = Number(theme.titleSizeVw)
  // Posição ABSOLUTA na caixa de referência de cada bloco: 0 = centro,
  // ±50 = borda. Sem base somada por trás — o número guardado no tema É a
  // posição, então o mesmo tema rende o mesmo lugar em qualquer saída.
  // Referência: título = área da saída; letra = caixa de texto do tema.
  const titleX = Number(theme.titleOffsetXPct) || 0
  const titleY = Number(theme.titleOffsetYPct) || 0
  const phraseX = Number(theme.offsetXPct) || 0
  const phraseY = Number(theme.offsetYPct) || 0

  return {
    '--theme-font': theme.fontFamily,
    '--theme-title-font': theme.titleFontFamily || theme.fontFamily,
    '--theme-phrase-font': theme.phraseFontFamily || theme.fontFamily,
    '--theme-lyric-size': `${lyric}${wu}`,
    '--theme-title-size': `${title}${wu}`,
    '--theme-lyric-color': theme.lyricColor,
    '--theme-title-color': theme.titleColor,
    '--theme-title-opacity': String(theme.titleOpacity),
    '--theme-weight': String(theme.fontWeight),
    '--theme-tracking': `${theme.letterSpacingEm}em`,
    '--theme-leading': String(theme.lineHeight),
    '--theme-align': theme.textAlign,
    '--theme-justify': justify,
    '--theme-offset-x': `${theme.offsetXPct ?? 0}%`,
    '--theme-offset-y': `${theme.offsetYPct ?? 0}%`,
    '--theme-title-x': `${titleX}%`,
    '--theme-title-y': `${titleY}%`,
    '--theme-phrase-x': `${phraseX}%`,
    '--theme-phrase-y': `${phraseY}%`,
    '--theme-rotate': `${Number(theme.rotationDeg) || 0}deg`,
    '--theme-title-rotate': `${Number(theme.titleRotationDeg) || 0}deg`,
    '--theme-pad-x': `${theme.padXVw}${wu}`,
    '--theme-pad-y': `${theme.padYVh}${hu}`,
    '--theme-shadow': theme.textShadow,
    '--theme-overlay': theme.overlayGradient,
    '--theme-bg': theme.backgroundColor,
    '--theme-anim-ms': `${theme.animationMs ?? 350}ms`,
    '--theme-text-transform': theme.uppercase ? 'uppercase' : 'none',
  }
}
