/** Preferência do auto-avanço — entrada independente do espectro. */

export type AutoAdvanceChannel = 'mix' | 'l' | 'r' | number

export type AutoAdvanceConfig = {
  enabled: boolean
  audioDeviceId: string | null
  channel: AutoAdvanceChannel
}

export const DEFAULT_AUTO_ADVANCE: AutoAdvanceConfig = {
  enabled: false,
  audioDeviceId: null,
  channel: 'mix',
}

export function normalizeAutoAdvance(raw: unknown): AutoAdvanceConfig {
  const r =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  let channel: AutoAdvanceChannel = 'mix'
  if (r.channel === 'l' || r.channel === 'r') channel = r.channel
  else if (typeof r.channel === 'number' && Number.isFinite(r.channel)) {
    channel = Math.max(0, Math.floor(r.channel))
  } else if (typeof r.channel === 'string' && /^\d+$/.test(r.channel)) {
    channel = Math.max(0, parseInt(r.channel, 10))
  }
  return {
    enabled: Boolean(r.enabled),
    audioDeviceId:
      r.audioDeviceId == null || r.audioDeviceId === ''
        ? null
        : String(r.audioDeviceId),
    channel,
  }
}
