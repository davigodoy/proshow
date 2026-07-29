import type { ProjectionTheme } from './types'

export type ThemeSafeArea = {
  top: number
  right: number
  bottom: number
  left: number
}

export const DEFAULT_THEME_SAFE_AREA: ThemeSafeArea = {
  top: 6,
  right: 6,
  bottom: 6,
  left: 6,
}

/** Saída sem recorte: a área liberada é o quadro inteiro. */
export const FULL_FRAME_SAFE_AREA: ThemeSafeArea = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function normalizeThemeSafeArea(v: ThemeSafeArea): ThemeSafeArea {
  const top = clamp(Number(v.top) || 0, 0, 40)
  const bottom = clamp(Number(v.bottom) || 0, 0, 40)
  const left = clamp(Number(v.left) || 0, 0, 40)
  const right = clamp(Number(v.right) || 0, 0, 40)
  const maxTB = Math.max(0, 80 - top)
  const maxLR = Math.max(0, 80 - left)
  return {
    top,
    bottom: clamp(bottom, 0, maxTB),
    left,
    right: clamp(right, 0, maxLR),
  }
}

/**
 * Margem da SAÍDA (%) — o limite externo único da aplicação.
 * Ausente ou inválida vira quadro inteiro: nada é recortado sem decisão.
 */
export function normalizeOutputSafeArea(
  v: Partial<ThemeSafeArea> | null | undefined,
): ThemeSafeArea {
  if (!v || typeof v !== 'object') return { ...FULL_FRAME_SAFE_AREA }
  return normalizeThemeSafeArea({
    top: Number(v.top) || 0,
    right: Number(v.right) || 0,
    bottom: Number(v.bottom) || 0,
    left: Number(v.left) || 0,
  })
}

/**
 * Compõe as duas margens: a do tema vale DENTRO da área liberada pela saída,
 * não sobre o quadro. Ambas em % do quadro; o resultado também, para que os
 * consumidores continuem falando a mesma unidade.
 *
 * A margem do tema é normalizada ANTES da composição — o teto de 80% passa a
 * valer sobre a área livre, garantindo sobra útil qualquer que seja a saída.
 * O resultado não é normalizado de novo: reaplicar o teto de 40% sobre o valor
 * composto deixaria o tema escapar da saída, que é justamente o que o modelo
 * proíbe.
 */
export function composeSafeArea(
  output: ThemeSafeArea,
  theme: ThemeSafeArea,
): ThemeSafeArea {
  const inner = normalizeThemeSafeArea(theme)
  const freeW = Math.max(0, 100 - output.left - output.right)
  const freeH = Math.max(0, 100 - output.top - output.bottom)
  return {
    top: output.top + (inner.top * freeH) / 100,
    right: output.right + (inner.right * freeW) / 100,
    bottom: output.bottom + (inner.bottom * freeH) / 100,
    left: output.left + (inner.left * freeW) / 100,
  }
}

/**
 * Geometria da máscara da saída, como `clip-path`.
 *
 * Hoje só o retângulo das margens. É de propósito que o retorno seja um
 * `clip-path` e não uma caixa: polígono, elipse e recortes de projeção mapeada
 * entram aqui como outro formato, sem que nenhum consumidor mude.
 */
export function outputMaskClipPath(
  output: Partial<ThemeSafeArea> | null | undefined,
): string {
  const a = normalizeOutputSafeArea(output)
  if (!a.top && !a.right && !a.bottom && !a.left) return 'none'
  return `inset(${a.top}% ${a.right}% ${a.bottom}% ${a.left}%)`
}

/**
 * Área efetiva do tema, já recortada pela margem da saída.
 * É esta função — não `themeSafeArea` — que os consumidores devem usar.
 */
export function effectiveSafeArea(
  theme: ProjectionTheme,
  output: Partial<ThemeSafeArea> | null | undefined,
): ThemeSafeArea {
  return composeSafeArea(normalizeOutputSafeArea(output), themeSafeArea(theme))
}

/** Área de texto do tema (%), relativa à área liberada pela saída. */
export function themeSafeArea(theme: ProjectionTheme): ThemeSafeArea {
  const raw = theme.safeArea
  if (raw && typeof raw === 'object') {
    return normalizeThemeSafeArea({
      top: Number(raw.top) || 0,
      right: Number(raw.right) || 0,
      bottom: Number(raw.bottom) || 0,
      left: Number(raw.left) || 0,
    })
  }
  const x = clamp(Number(theme.padXVw) || 6, 0, 40)
  const y = clamp(Number(theme.padYVh) || 6, 0, 40)
  return normalizeThemeSafeArea({ top: y, right: x, bottom: y, left: x })
}
