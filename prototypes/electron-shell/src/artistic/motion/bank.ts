import type { MotionRecipe } from './types.ts'

/**
 * MOTION BANK — vocabulário artístico de movimento do ProShow.
 *
 * Cada receita descreve um "quando" (enter/reflow/exit/sequence), um papel
 * (hero/support/any) e um contrato de classe CSS que o LyricStage aplica.
 * `legacyEnter` / `legacyExit` mapeiam para os efeitos históricos de
 * `artisticLayout.ts` (ArtisticEnterEffect / ArtisticExitEffect), garantindo
 * paridade visual durante a migração.
 */
export const MOTION_BANK: readonly MotionRecipe[] = [
  // ── ENTER ──────────────────────────────────────────────────────────────
  {
    id: 'carimbo',
    label: 'Carimbo',
    roles: ['any'],
    when: ['enter'],
    contract: { target: 'motion', className: 'artistic-enter-stamp' },
    weight: 2,
    legacyEnter: 'stamp',
  },
  {
    id: 'impacto',
    label: 'Impacto',
    roles: ['any'],
    when: ['enter'],
    contract: { target: 'motion', className: 'artistic-enter-slam' },
    weight: 1,
    legacyEnter: 'slam',
  },
  {
    id: 'soco',
    label: 'Soco',
    roles: ['any'],
    when: ['enter'],
    contract: { target: 'motion', className: 'artistic-enter-punch' },
    weight: 1,
    legacyEnter: 'punch',
  },
  {
    id: 'surgir',
    label: 'Surgir',
    roles: ['any'],
    when: ['enter'],
    contract: { target: 'motion', className: 'artistic-enter-fade' },
    constraints: { reducedMotionSafe: true },
    weight: 1,
    legacyEnter: 'fade',
  },
  {
    id: 'subida-suave',
    label: 'Subida suave',
    roles: ['any'],
    when: ['enter'],
    contract: { target: 'motion', className: 'artistic-enter-soft-rise' },
    constraints: { reducedMotionSafe: true },
    weight: 3,
    legacyEnter: 'soft-rise',
  },
  {
    id: 'deslize-up',
    label: 'Deslize (cima)',
    roles: ['any'],
    when: ['enter'],
    contract: { target: 'motion', className: 'artistic-enter-slide-up' },
    weight: 1,
    legacyEnter: 'slide-up',
  },
  {
    id: 'deslize-left',
    label: 'Deslize (esquerda)',
    roles: ['any'],
    when: ['enter'],
    contract: { target: 'motion', className: 'artistic-enter-slide-left' },
    weight: 1,
    legacyEnter: 'slide-left',
  },
  {
    id: 'deslize-right',
    label: 'Deslize (direita)',
    roles: ['any'],
    when: ['enter'],
    contract: { target: 'motion', className: 'artistic-enter-slide-right' },
    weight: 1,
    legacyEnter: 'slide-right',
  },
  {
    id: 'aproximar',
    label: 'Aproximar',
    roles: ['any'],
    when: ['enter'],
    contract: { target: 'motion', className: 'artistic-enter-zoom-in' },
    weight: 1,
    legacyEnter: 'zoom-in',
  },

  // ── REFLOW ─────────────────────────────────────────────────────────────
  {
    id: 'crescer-heroi',
    label: 'Crescer (herói)',
    roles: ['hero'],
    when: ['reflow'],
    contract: { target: 'phrase', className: 'is-growing' },
    weight: 1,
  },
  {
    id: 'ceder-encolhendo',
    label: 'Ceder (encolhendo)',
    roles: ['support'],
    when: ['reflow'],
    contract: { target: 'phrase', className: 'is-shrinking' },
    weight: 1,
  },
  {
    id: 'pivot-canto',
    label: 'Pivotar para o canto',
    roles: ['support'],
    when: ['reflow'],
    contract: { target: 'phrase', className: 'is-pivoting is-shrinking' },
    geometry: { portraitStack: true, yield: 'horizontal', maxFootprint: 0.18 },
    constraints: { maxLetters: 18, maxBlocks: 3, phases: [2, 3] },
    weight: 6,
  },

  // ── EXIT (block) ───────────────────────────────────────────────────────
  {
    id: 'dispersar-fade',
    label: 'Dispersar (fade)',
    roles: ['any'],
    when: ['exit'],
    contract: { target: 'block', className: 'artistic-exit-fade' },
    weight: 2,
    legacyExit: 'fade',
  },
  {
    id: 'dispersar-left',
    label: 'Dispersar (esquerda)',
    roles: ['any'],
    when: ['exit'],
    contract: { target: 'block', className: 'artistic-exit-left' },
    weight: 1,
    legacyExit: 'left',
  },
  {
    id: 'dispersar-right',
    label: 'Dispersar (direita)',
    roles: ['any'],
    when: ['exit'],
    contract: { target: 'block', className: 'artistic-exit-right' },
    weight: 1,
    legacyExit: 'right',
  },
  {
    id: 'dispersar-up',
    label: 'Dispersar (cima)',
    roles: ['any'],
    when: ['exit'],
    contract: { target: 'block', className: 'artistic-exit-up' },
    weight: 1,
    legacyExit: 'up',
  },
  {
    id: 'dispersar-down',
    label: 'Dispersar (baixo)',
    roles: ['any'],
    when: ['exit'],
    contract: { target: 'block', className: 'artistic-exit-down' },
    weight: 1,
    legacyExit: 'down',
  },
  {
    id: 'dispersar-zoom',
    label: 'Dispersar (zoom)',
    roles: ['any'],
    when: ['exit'],
    contract: { target: 'block', className: 'artistic-exit-zoom' },
    weight: 1,
    legacyExit: 'zoom',
  },

  // ── SEQUENCE ───────────────────────────────────────────────────────────
  {
    id: 'troca-de-trio',
    label: 'Troca de trio',
    roles: ['any'],
    when: ['sequence', 'exit'],
    contract: { target: 'phrase', className: 'is-sequence-exit' },
    weight: 1,
  },
]
