/** Config e catálogo do espectro de áudio na projeção. */

export type SpectrumStyleId =
  | 'bars-neon'
  | 'bars-mirror'
  | 'wave-silk'
  | 'radial-pulse'
  | 'mesh-3d'
  | 'particles'

export type SpectrumPlacement = 'background' | 'hud'
export type SpectrumSource = 'audio-device' | 'camera' | 'media'
export type SpectrumChannel = 'mix' | 'l' | 'r' | number

export type SpectrumConfig = {
  enabled: boolean
  style: SpectrumStyleId
  placement: SpectrumPlacement
  source: SpectrumSource
  audioDeviceId: string | null
  channel: SpectrumChannel
  /** 0–1 — crítico no fundo */
  opacity: number
  /** Se true, áudio também vai aos speakers do Mac (loop perigoso com mesa). */
  monitorAudio: boolean
}

export const SPECTRUM_STYLES: Array<{
  id: SpectrumStyleId
  label: string
  hint: string
}> = [
  { id: 'bars-neon', label: 'Neon bars', hint: 'Barras com glow' },
  { id: 'bars-mirror', label: 'Mirror', hint: 'Barras espelhadas' },
  { id: 'wave-silk', label: 'Silk wave', hint: 'Onda suave' },
  { id: 'radial-pulse', label: 'Radial', hint: 'Anéis do centro' },
  { id: 'mesh-3d', label: 'Mesh 3D', hint: 'Grade em perspectiva' },
  { id: 'particles', label: 'Particles', hint: 'Partículas no bass' },
]

export const DEFAULT_SPECTRUM: SpectrumConfig = {
  enabled: false,
  style: 'bars-neon',
  placement: 'background',
  source: 'audio-device',
  audioDeviceId: null,
  channel: 'mix',
  opacity: 0.55,
  monitorAudio: false,
}

const STYLE_SET = new Set(SPECTRUM_STYLES.map((s) => s.id))

export function normalizeSpectrum(raw: unknown): SpectrumConfig {
  const r =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const style = STYLE_SET.has(r.style as SpectrumStyleId)
    ? (r.style as SpectrumStyleId)
    : DEFAULT_SPECTRUM.style
  const placement =
    r.placement === 'hud' ? 'hud' : 'background'
  const source =
    r.source === 'camera' || r.source === 'media' ? r.source : 'audio-device'
  let channel: SpectrumChannel = 'mix'
  if (r.channel === 'l' || r.channel === 'r') channel = r.channel
  else if (typeof r.channel === 'number' && Number.isFinite(r.channel)) {
    channel = Math.max(0, Math.floor(r.channel))
  } else if (typeof r.channel === 'string' && /^\d+$/.test(r.channel)) {
    channel = Math.max(0, parseInt(r.channel, 10))
  }
  const opacity = Math.min(
    1,
    Math.max(0.05, Number(r.opacity) || DEFAULT_SPECTRUM.opacity),
  )
  return {
    enabled: Boolean(r.enabled),
    style,
    placement,
    source,
    audioDeviceId:
      r.audioDeviceId == null || r.audioDeviceId === ''
        ? null
        : String(r.audioDeviceId),
    channel,
    opacity,
    monitorAudio: Boolean(r.monitorAudio),
  }
}

/**
 * Em câmera ao vivo (programa) ou mídia full-bleed, o espectro vira barra
 * inferior — sem gravar a preferência. Câmera de fundo (letra/bíblia com
 * cam atrás) mantém o placement escolhido (ex.: fundo).
 */
export function spectrumForContent(
  config: SpectrumConfig | null | undefined,
  contentKind: string | null | undefined,
): SpectrumConfig | null {
  if (!config) return null
  if (!config.enabled) return config
  if (
    contentKind === 'camera' ||
    contentKind === 'video' ||
    contentKind === 'audio' ||
    contentKind === 'image' ||
    contentKind === 'deck' ||
    contentKind === 'web' ||
    contentKind === 'file'
  ) {
    return config.placement === 'hud' ? config : { ...config, placement: 'hud' }
  }
  return config
}
