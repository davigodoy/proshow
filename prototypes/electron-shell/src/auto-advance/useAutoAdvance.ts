import { useState } from 'react'
import type { AutoAdvanceConfig } from './types'
import type { AutoGoLiveTarget, AutoLineCandidate } from './match'

export type AutoAdvanceStatus =
  | 'off'
  | 'waiting'
  | 'loading'
  | 'listening'
  | 'heard'
  | 'advancing'
  | 'cleared'
  | 'suppressed'
  | 'error'

type Opts = {
  config: AutoAdvanceConfig
  candidates: AutoLineCandidate[]
  liveLine: string
  liveIndex: number
  active: boolean
  programVisible: boolean
  suppressUntil: number
  onGoLive: (target: AutoGoLiveTarget) => void
  onClearLive: () => void
}

/** Público: Auto ainda não publicado — hook inerte. */
export function useAutoAdvance(_opts: Opts) {
  const [status] = useState<AutoAdvanceStatus>('off')
  const [lastHeard] = useState('')
  const [loadMsg] = useState('')
  return { status, lastHeard, loadMsg }
}
