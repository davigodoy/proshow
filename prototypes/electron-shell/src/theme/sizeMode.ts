/**
 * Os três estados do tamanho da letra.
 *
 * Antes, `lyricSizeVw` carregava dois sentidos decididos por um número mágico
 * (≤20 = vw; >20 = % do que cabe), então um tema legítimo de 25vw seria lido
 * como "preencher 25%". `fillMode` separa isso de forma explícita — mas só
 * para os temas que o operador decidir migrar: tema legado continua com o
 * comportamento de hoje até ser tocado.
 */

import type { ProjectionTheme } from './types'

/** Limiar do modelo antigo. Mantido só para interpretar tema legado. */
export const LEGACY_FILL_THRESHOLD = 20

/** Padrões usados ao converter um tema legado em explícito. */
export const DEFAULT_FILL_PCT = 100
export const DEFAULT_LYRIC_SIZE_VW = 5

export type SizeMode =
  /** Tema legado: comportamento de hoje, incluindo encolher em vez de repartir. */
  | { kind: 'legacy'; lyricSizeVw: number; effectiveFill: boolean }
  /** PREENCHER: cresce até `pct`% do maior tamanho que cabe. */
  | { kind: 'fill'; pct: number }
  /** Fixo: `vw` manda; o que não couber vira slide novo. */
  | { kind: 'fixed'; vw: number }

type SizeFields = Pick<ProjectionTheme, 'lyricSizeVw' | 'fillMode' | 'fillPct'>

function num(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Como um tema legado se comporta hoje — usado só para exibir o checkbox. */
export function legacyReadsAsFill(lyricSizeVw: unknown): boolean {
  return num(lyricSizeVw, DEFAULT_LYRIC_SIZE_VW) > LEGACY_FILL_THRESHOLD
}

/** Lê o modo efetivo do tema, sem alterá-lo. */
export function resolveSizeMode(theme: SizeFields): SizeMode {
  const raw = num(theme.lyricSizeVw, DEFAULT_LYRIC_SIZE_VW)
  if (theme.fillMode === true) {
    return { kind: 'fill', pct: clampPct(num(theme.fillPct, DEFAULT_FILL_PCT)) }
  }
  if (theme.fillMode === false) {
    return { kind: 'fixed', vw: clampVw(raw) }
  }
  return {
    kind: 'legacy',
    lyricSizeVw: raw,
    effectiveFill: legacyReadsAsFill(raw),
  }
}

export function clampPct(pct: number): number {
  return Math.min(100, Math.max(2, pct))
}

export function clampVw(vw: number): number {
  return Math.min(LEGACY_FILL_THRESHOLD, Math.max(0.4, vw))
}

/**
 * Converte um tema legado em explícito, preservando o que ele já fazia.
 *
 * O ponto delicado: um legado de 45 significa "preencher 45%", não "45vw".
 * Copiar o número cru para `lyricSizeVw` produziria uma letra gigante no
 * primeiro clique do operador — é a própria ambiguidade que estamos
 * consertando. Por isso cada sentido vai para o seu campo, e o outro recebe
 * um padrão sensato.
 */
export function toExplicitSizeFields(theme: SizeFields): {
  fillMode: boolean
  fillPct: number
  lyricSizeVw: number
} {
  const mode = resolveSizeMode(theme)

  if (mode.kind === 'fill') {
    return {
      fillMode: true,
      fillPct: mode.pct,
      lyricSizeVw: clampVw(num(theme.lyricSizeVw, DEFAULT_LYRIC_SIZE_VW)),
    }
  }
  if (mode.kind === 'fixed') {
    return {
      fillMode: false,
      fillPct: clampPct(num(theme.fillPct, DEFAULT_FILL_PCT)),
      lyricSizeVw: mode.vw,
    }
  }

  // Legado → explícito, cada sentido no seu campo.
  return mode.effectiveFill
    ? {
        fillMode: true,
        fillPct: clampPct(mode.lyricSizeVw),
        lyricSizeVw: DEFAULT_LYRIC_SIZE_VW,
      }
    : {
        fillMode: false,
        fillPct: DEFAULT_FILL_PCT,
        lyricSizeVw: clampVw(mode.lyricSizeVw),
      }
}

/** Só o modo fixo reparte; preencher e legado encolhem, como sempre fizeram. */
export function shouldSplitOverflow(theme: SizeFields): boolean {
  return resolveSizeMode(theme).kind === 'fixed'
}
