import type { PhraseStyle, ProjectionTheme, ThemeAnimation } from '../projection'

export function resolvePhraseTheme(
  base: ProjectionTheme,
  themes: ProjectionTheme[],
  style?: PhraseStyle | null,
  songThemeId?: string | null,
): ProjectionTheme {
  const themeId = style?.themeId || songThemeId || null
  if (!themeId && !style?.animation) return base
  const fromList = themeId ? themes.find((t) => t.id === themeId) : null
  const merged: ProjectionTheme = { ...(fromList || base) }
  if (style?.animation) {
    merged.animation = style.animation as ThemeAnimation
  }
  // Se veio da lista, fundo já está; se misturou com base, não perde mídia da lista
  if (fromList) {
    merged.backgroundImage =
      fromList.backgroundImage || merged.backgroundImage || null
    merged.backgroundVideo =
      fromList.backgroundVideo || merged.backgroundVideo || null
  }
  return merged
}

/** Aplica override de maiúsculas da música (null/undefined = herdar tema) */
export function withSongUppercase(
  theme: ProjectionTheme,
  songUppercase?: boolean | null,
): ProjectionTheme {
  if (songUppercase == null) return theme
  return { ...theme, uppercase: songUppercase }
}

/** Override ao vivo: frase própria ou tema nomeado da música */
export function phraseThemeOverride(
  base: ProjectionTheme,
  themes: ProjectionTheme[],
  style?: PhraseStyle | null,
  songThemeId?: string | null,
): ProjectionTheme | null {
  if (!style?.themeId && !style?.animation && !songThemeId) return null
  return resolvePhraseTheme(base, themes, style, songThemeId)
}

/**
 * Tema por índice de slide (ordem da composição artística / cliques).
 */
export function resolveThemesForIndices(
  base: ProjectionTheme,
  themes: ProjectionTheme[],
  indices: number[],
  phraseStyles?: Array<PhraseStyle | null> | null,
  songThemeId?: string | null,
  songUppercase?: boolean | null,
): ProjectionTheme[] {
  return indices.map((slideIdx) =>
    withSongUppercase(
      resolvePhraseTheme(
        base,
        themes,
        phraseStyles?.[slideIdx],
        songThemeId,
      ),
      songUppercase,
    ),
  )
}

/**
 * Acumula índices na ordem dos cliques.
 * Com 3 na tela, o próximo clique inicia outra composição.
 * Reclicar em frase já na tela promove (move para o fim = herói).
 */
export function pushStackOrder(
  prev: number[],
  idx: number,
  max = 3,
): number[] {
  const safe = Math.max(0, Math.floor(Number(idx) || 0))
  if (prev.includes(safe)) {
    return [...prev.filter((item) => item !== safe), safe]
  }
  if (prev.length >= max) return [safe]
  return [...prev, safe]
}

/**
 * Avança a pilha artística mantendo a origem da composição.
 * A origem (seed) só muda ao iniciar uma composição nova — assim promover
 * uma frase reduzida inverte o caminho no mesmo mosaico, em vez de trocar
 * a variação.
 */
export function nextArtisticStack(
  prevOrder: number[],
  prevOrigin: number,
  idx: number,
  options?: { songChanged?: boolean; max?: number },
): { order: number[]; origin: number } {
  const safe = Math.max(0, Math.floor(Number(idx) || 0))
  const max = options?.max ?? 3
  if (options?.songChanged || !prevOrder.length) {
    return { order: [safe], origin: safe }
  }
  if (prevOrder.includes(safe)) {
    return {
      order: pushStackOrder(prevOrder, safe, max),
      origin: prevOrigin,
    }
  }
  if (prevOrder.length >= max) {
    return { order: [safe], origin: safe }
  }
  return { order: [...prevOrder, safe], origin: prevOrigin }
}
