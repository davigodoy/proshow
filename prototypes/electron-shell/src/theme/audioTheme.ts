import type { ProjectionTheme } from './types'
import { hydrateThemeMedia } from './activeTheme.ts'
import { resolvePhraseTheme } from './resolve.ts'

type AudioThemeItem = {
  themeId?: string | null
  bgMediaPath?: string | null
  bgMediaKind?: 'image' | 'video' | null
}

export function themeHasBackgroundArt(
  t: ProjectionTheme | null | undefined,
): boolean {
  return Boolean(t?.backgroundImage || t?.backgroundVideo)
}

/**
 * Tema de projeção p/ áudio: arte do tema + mídia de fundo explícita.
 * Não apaga o fundo por causa da câmera — prioridade visual fica no LyricStage.
 */
export function audioPresentationTheme(
  item: AudioThemeItem,
  baseTheme: ProjectionTheme,
  themes: ProjectionTheme[],
): ProjectionTheme {
  const themeId = item.themeId || null
  const fromList = themeId ? themes.find((t) => t.id === themeId) : null
  // Mesmo id do tema global: preferir o objeto vivo (arte acabou de aplicar no editor)
  const seed =
    !themeId
      ? baseTheme
      : baseTheme.id === themeId
        ? baseTheme
        : fromList || baseTheme
  const resolved = hydrateThemeMedia(
    themeId ? resolvePhraseTheme(seed, themes, undefined, themeId) : seed,
    themes,
  )
  // Fonte da verdade da arte: lista salva → seed/global
  const listImg = fromList?.backgroundImage || null
  const listVid = fromList?.backgroundVideo || null
  const seedImg =
    seed.backgroundImage ||
    (baseTheme.id === (themeId || baseTheme.id)
      ? baseTheme.backgroundImage
      : null) ||
    null
  const seedVid =
    seed.backgroundVideo ||
    (baseTheme.id === (themeId || baseTheme.id)
      ? baseTheme.backgroundVideo
      : null) ||
    null
  let t: ProjectionTheme = {
    ...resolved,
    showTitle: false,
    showArtist: false,
    showLyrics: false,
    backgroundImage: listImg || seedImg || resolved.backgroundImage || null,
    backgroundVideo: listVid || seedVid || resolved.backgroundVideo || null,
  }
  if (item.bgMediaPath) {
    t = {
      ...t,
      backgroundImage: item.bgMediaKind === 'image' ? item.bgMediaPath : null,
      backgroundVideo: item.bgMediaKind === 'video' ? item.bgMediaPath : null,
    }
  }
  return t
}
