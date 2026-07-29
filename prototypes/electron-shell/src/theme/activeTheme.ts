import type { LiveState, ProjectionTheme } from '../projection'

/**
 * Tema efetivo na saída:
 * - sem override → tema global
 * - override de outro id → override completo
 * - mesmo id → tipografia ao vivo do global; animação/maiúsculas da frase;
 *   mídia: null explícito no override ganha (ex.: câmera limpa o fundo do tema)
 */
export function resolveActiveTheme(
  live: LiveState,
  theme: ProjectionTheme,
  bibleTheme: ProjectionTheme,
): ProjectionTheme {
  const base = live.kind === 'bible' ? bibleTheme : theme
  const o = live.themeOverride
  if (!o) return base
  if (o.id !== base.id) return o

  const image =
    o.backgroundImage === null
      ? null
      : o.backgroundImage || base.backgroundImage || null
  const video =
    o.backgroundVideo === null
      ? null
      : o.backgroundVideo || base.backgroundVideo || null

  return {
    ...base,
    animation: o.animation ?? base.animation,
    animationMs: o.animationMs ?? base.animationMs,
    animationIntervalMs: o.animationIntervalMs ?? base.animationIntervalMs,
    uppercase: o.uppercase !== undefined ? o.uppercase : base.uppercase,
    wrapLines: o.wrapLines !== undefined ? o.wrapLines : base.wrapLines,
    backgroundImage: image,
    backgroundVideo: video,
  }
}

/**
 * Exibição final = tema AND portões do bloco AO VIVO (e showText).
 * S+S=S; qualquer N → N. O tema não sobrescreve o bloco e vice-versa.
 */
export function andThemeShowGates(
  theme: ProjectionTheme,
  gates: {
    gateTitle?: boolean
    gateArtist?: boolean
    gateLyrics?: boolean
    showText?: boolean
  },
): ProjectionTheme {
  const textOn = gates.showText !== false
  return {
    ...theme,
    showTitle:
      Boolean(theme.showTitle) && gates.gateTitle !== false && textOn,
    showArtist:
      Boolean(theme.showArtist) && gates.gateArtist !== false && textOn,
    showLyrics:
      theme.showLyrics !== false && gates.gateLyrics !== false && textOn,
  }
}

/** Completa mídia ausente a partir da lista — não sobrescreve null explícito */
export function hydrateThemeMedia(
  theme: ProjectionTheme,
  themes: ProjectionTheme[],
): ProjectionTheme {
  const fromList = themes.find((t) => t.id === theme.id)
  if (!fromList) return theme
  return {
    ...theme,
    backgroundImage:
      theme.backgroundImage === null
        ? null
        : theme.backgroundImage || fromList.backgroundImage || null,
    backgroundVideo:
      theme.backgroundVideo === null
        ? null
        : theme.backgroundVideo || fromList.backgroundVideo || null,
  }
}
