export {
  DEFAULT_AUTO_ADVANCE,
  normalizeAutoAdvance,
  type AutoAdvanceConfig,
  type AutoAdvanceChannel,
} from './types'
export { AutoAdvanceControls } from './AutoAdvanceControls'
export { useAutoAdvance, type AutoAdvanceStatus } from './useAutoAdvance'
export {
  normalizeLyricText,
  scoreTranscriptAgainstLine,
  scoreCandidates,
  scoreProgramCandidates,
  shouldAdvanceToNext,
  pickLiveTarget,
  pickAutoTarget,
  priorForCandidate,
  grammarPhrasesFromCandidates,
  lineOpening,
  lineOpeningRaw,
  type AutoLineCandidate,
  type AutoGoLiveTarget,
} from './match'
