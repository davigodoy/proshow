import type { CompositionSlot, CompositionTemplate } from './types.ts'

const region = (
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number, number, number] => [x, y, width, height]

const slot = (
  role: CompositionSlot['role'],
  region: CompositionSlot['region'],
  orientation: CompositionSlot['orientation'],
  input: {
    align: CompositionSlot['align']
    scale: number
    opacity: number
    anchor: CompositionSlot['anchor']
    motionRecipeHint?: string
  },
): CompositionSlot => ({
  role,
  region,
  orientation,
  align: input.align,
  scale: input.scale,
  opacity: input.opacity,
  anchor: input.anchor,
  ...(input.motionRecipeHint ? { motionRecipeHint: input.motionRecipeHint } : null),
})

/**
 * Constraint padrão da coluna-retrato: coluna estreita de PALAVRAS legíveis na
 * horizontal (uma palavra de conteúdo por linha). Não gira glifos 90°.
 */
const PORTRAIT_CONSTRAINTS = { maxLines: 6, maxWordChars: 12 } as const

/**
 * Grammar legada usada como fallback quando a frase de apoio não cabe na coluna
 * retrato. As ARTISTIC_VARIATIONS continuam a fonte da verdade para a maioria
 * dos layouts; estes templates de composição são ADITIVOS.
 */
const CORNER_FALLBACK_ID = 'no-stamp-safe-grid'

/**
 * corner-column-left-yield — apoio cede uma coluna retrato à esquerda; o herói
 * ocupa o grosso da safe area. Fase 3 carimba o herói.
 */
const cornerColumnLeftYield: CompositionTemplate = {
  id: 'corner-column-left-yield',
  flow: 'horizontal',
  stampFinal: true,
  phases: {
    1: [
      slot('hero', region(2, 4, 96, 90), 'landscape', {
        align: 'left',
        scale: 1.1,
        opacity: 1,
        anchor: 'none',
      }),
    ],
    2: [
      slot('support-1', region(2, 8, 20, 80), 'portrait-stack', {
        align: 'left',
        scale: 0.72,
        opacity: 0.58,
        anchor: 'edge-left',
        motionRecipeHint: 'pivot-canto',
      }),
      slot('hero', region(26, 4, 72, 92), 'landscape', {
        align: 'left',
        scale: 1.14,
        opacity: 1,
        anchor: 'none',
      }),
    ],
    3: [
      slot('support-2', region(0, 26, 16, 64), 'portrait-stack', {
        align: 'left',
        scale: 0.58,
        opacity: 0.5,
        anchor: 'edge-left',
        motionRecipeHint: 'pivot-canto',
      }),
      slot('support-1', region(22, 2, 76, 24), 'landscape', {
        align: 'left',
        scale: 0.74,
        opacity: 0.62,
        anchor: 'none',
      }),
      slot('hero', region(22, 30, 76, 66), 'landscape', {
        align: 'left',
        scale: 1.16,
        opacity: 1,
        anchor: 'none',
      }),
    ],
  },
  portraitConstraints: { ...PORTRAIT_CONSTRAINTS },
  fallbackId: CORNER_FALLBACK_ID,
}

/**
 * corner-column-right-yield — espelho horizontal do left-yield (x' = 100 - x - w,
 * align e anchor invertidos).
 */
const cornerColumnRightYield: CompositionTemplate = {
  id: 'corner-column-right-yield',
  flow: 'horizontal',
  stampFinal: true,
  phases: {
    1: [
      slot('hero', region(2, 4, 96, 90), 'landscape', {
        align: 'right',
        scale: 1.1,
        opacity: 1,
        anchor: 'none',
      }),
    ],
    2: [
      slot('support-1', region(78, 8, 20, 80), 'portrait-stack', {
        align: 'right',
        scale: 0.72,
        opacity: 0.58,
        anchor: 'edge-right',
        motionRecipeHint: 'pivot-canto',
      }),
      slot('hero', region(2, 4, 72, 92), 'landscape', {
        align: 'right',
        scale: 1.14,
        opacity: 1,
        anchor: 'none',
      }),
    ],
    3: [
      slot('support-2', region(84, 26, 16, 64), 'portrait-stack', {
        align: 'right',
        scale: 0.58,
        opacity: 0.5,
        anchor: 'edge-right',
        motionRecipeHint: 'pivot-canto',
      }),
      slot('support-1', region(2, 2, 76, 24), 'landscape', {
        align: 'right',
        scale: 0.74,
        opacity: 0.62,
        anchor: 'none',
      }),
      slot('hero', region(2, 30, 76, 66), 'landscape', {
        align: 'right',
        scale: 1.16,
        opacity: 1,
        anchor: 'none',
      }),
    ],
  },
  portraitConstraints: { ...PORTRAIT_CONSTRAINTS },
  fallbackId: CORNER_FALLBACK_ID,
}

/**
 * corner-column-br-stamp — apoio em faixa superior (landscape); herói em laje
 * inferior. Fase 3 acrescenta a coluna retrato no canto inferior direito e
 * carimba o herói.
 */
const cornerColumnBrStamp: CompositionTemplate = {
  id: 'corner-column-br-stamp',
  flow: 'vertical',
  stampFinal: true,
  phases: {
    1: [
      slot('hero', region(2, 4, 96, 90), 'landscape', {
        align: 'center',
        scale: 1.1,
        opacity: 1,
        anchor: 'none',
      }),
    ],
    2: [
      slot('support-1', region(2, 2, 96, 24), 'landscape', {
        align: 'center',
        scale: 0.72,
        opacity: 0.58,
        anchor: 'none',
      }),
      slot('hero', region(2, 30, 96, 66), 'landscape', {
        align: 'left',
        scale: 1.14,
        opacity: 1,
        anchor: 'none',
      }),
    ],
    3: [
      slot('support-2', region(80, 44, 18, 54), 'portrait-stack', {
        align: 'right',
        scale: 0.58,
        opacity: 0.5,
        anchor: 'br',
        motionRecipeHint: 'pivot-canto',
      }),
      slot('support-1', region(2, 2, 96, 22), 'landscape', {
        align: 'left',
        scale: 0.74,
        opacity: 0.62,
        anchor: 'none',
      }),
      slot('hero', region(2, 26, 74, 72), 'landscape', {
        align: 'left',
        scale: 1.16,
        opacity: 1,
        anchor: 'none',
      }),
    ],
  },
  portraitConstraints: { ...PORTRAIT_CONSTRAINTS },
  fallbackId: CORNER_FALLBACK_ID,
}

export const COMPOSITION_TEMPLATES = [
  cornerColumnLeftYield,
  cornerColumnRightYield,
  cornerColumnBrStamp,
] as const satisfies readonly CompositionTemplate[]

export const CORNER_YIELD_TEMPLATES = COMPOSITION_TEMPLATES

export type CompositionTemplateId = (typeof COMPOSITION_TEMPLATES)[number]['id']

/**
 * Adaptador legado: os templates de composição são ADITIVOS. As
 * ARTISTIC_VARIATIONS de `theme/artisticLayout` continuam a fonte da verdade
 * para a maioria dos layouts; estes ids são apenas os grammars legados usados
 * como fallback quando a frase de apoio não cabe na coluna retrato.
 */
export const LEGACY_TEMPLATE_IDS = [CORNER_FALLBACK_ID] as const

export function getCompositionTemplate(
  id: string,
): CompositionTemplate | undefined {
  return COMPOSITION_TEMPLATES.find((template) => template.id === id)
}
