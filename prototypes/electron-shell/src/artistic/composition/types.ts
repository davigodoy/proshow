export type SlotOrientation = 'landscape' | 'portrait-stack'
export type SlotRole = 'hero' | 'support-1' | 'support-2'
export type CornerAnchor =
  | 'tl'
  | 'tr'
  | 'bl'
  | 'br'
  | 'edge-left'
  | 'edge-right'
  | 'none'

export type CompositionSlot = {
  role: SlotRole
  region: [x: number, y: number, width: number, height: number]
  orientation: SlotOrientation
  align: 'left' | 'center' | 'right'
  scale: number
  opacity: number
  anchor: CornerAnchor
  /** e.g. 'pivot-canto' for portrait support. Consumed by the motion bank. */
  motionRecipeHint?: string
}

export type CompositionTemplate = {
  id: string
  flow: 'horizontal' | 'vertical' | 'diagonal' | 'radial'
  stampFinal: boolean
  phases: {
    1: [CompositionSlot]
    2: [CompositionSlot, CompositionSlot]
    3: [CompositionSlot, CompositionSlot, CompositionSlot]
  }
  portraitConstraints?: { maxLines: number; maxWordChars: number }
  fallbackId?: string
}
