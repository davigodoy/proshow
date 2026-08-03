export type MotionWhen = 'enter' | 'reflow' | 'exit' | 'sequence'
export type MotionRole = 'hero' | 'support' | 'any'
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'edge-left' | 'edge-right'
export type GeometryHint = {
  corner?: Corner
  /** Portrait column (readable words stacked) — NOT glyph 90° rotation */
  portraitStack?: boolean
  uprightRotationDeg?: number // reserved; prefer portraitStack
  yield?: 'horizontal' | 'vertical' | 'none'
  maxFootprint?: number
}
export type MotionContract = {
  target: 'phrase' | 'motion' | 'block'
  className: string
  vars?: Record<string, string>
}
export type MotionConstraints = {
  phases?: (1 | 2 | 3)[]
  minLetters?: number
  maxLetters?: number
  maxBlocks?: number
  requiresReverse?: boolean
  reducedMotionSafe?: boolean
}
export type MotionRecipe = {
  id: string
  label: string
  roles: MotionRole[]
  when: MotionWhen[]
  contract: MotionContract
  geometry?: GeometryHint
  constraints?: MotionConstraints
  weight?: number
  /** Maps to legacy ArtisticEnterEffect / exit when applicable */
  legacyEnter?: string
  legacyExit?: string
}
export type MotionAssignment = {
  enterRecipeId: string
  reflowRecipeId?: string
  exitRecipeId: string
  geometry?: GeometryHint
}
