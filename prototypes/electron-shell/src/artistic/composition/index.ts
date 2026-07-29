export type {
  SlotOrientation,
  SlotRole,
  CornerAnchor,
  CompositionSlot,
  CompositionTemplate,
} from './types.ts'
export {
  COMPOSITION_TEMPLATES,
  CORNER_YIELD_TEMPLATES,
  LEGACY_TEMPLATE_IDS,
  getCompositionTemplate,
} from './templates.ts'
export type { CompositionTemplateId } from './templates.ts'
export {
  regroupPortraitLines,
  portraitFeasible,
  portraitBlockScale,
} from './portrait.ts'
export type { PortraitWord, PortraitConstraints } from './portrait.ts'
export { selectCompositionTemplate, isShortSupport } from './select.ts'
export {
  getOrCreateArtisticComposition,
  resolveArtisticPlanForOrder,
  resolveCachedArtisticPlan,
  adaptSeatTargetForPhrase,
  compositionSessionKey,
  COMPOSITION_LAYOUT_VERSION,
} from './cache.ts'
export type {
  CompositionCache,
  CompositionSeat,
  CompositionSeatTable,
  CompositionEntry,
  FrozenPhrasePlan,
  CompositionSessionKey,
} from './cache.ts'
