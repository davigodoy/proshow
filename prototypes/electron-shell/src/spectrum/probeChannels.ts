/**
 * Descobre quantos canais o device realmente entrega.
 * `enumerateDevices` não traz isso — só abrindo o stream.
 */

export type ProbeChannelsResult = {
  channelCount: number
  /** true se veio de getSettings / AudioContext; false = fallback */
  measured: boolean
}

const probeCache = new Map<string, ProbeChannelsResult>()

function cacheKey(
  source: 'audio-device' | 'camera',
  deviceId: string | null | undefined,
): string {
  return `${source}:${deviceId || 'default'}`
}

/** Constraints sem forçar stereo — senão mesa multicanal vira L/R. */
export function spectrumAudioConstraints(
  source: 'audio-device' | 'camera',
  audioDeviceId: string | null,
  cameraDeviceId?: string | null,
): MediaStreamConstraints | null {
  const audioBase: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  }

  if (source === 'audio-device') {
    if (audioDeviceId) {
      return {
        audio: { ...audioBase, deviceId: { exact: audioDeviceId } },
        video: false,
      }
    }
    return { audio: audioBase, video: false }
  }

  if (source === 'camera') {
    if (cameraDeviceId) {
      return {
        audio: audioBase,
        video: { deviceId: { exact: cameraDeviceId } },
      }
    }
    return { audio: audioBase, video: false }
  }

  return null
}

/**
 * Abre o device por um instante, lê channelCount e fecha.
 * Usa getSettings + MediaStreamSource.channelCount (o mais confiável).
 */
export async function probeDeviceChannelCount(opts: {
  source: 'audio-device' | 'camera'
  audioDeviceId?: string | null
  cameraDeviceId?: string | null
  /** ignora cache (troca de device / refresh) */
  force?: boolean
}): Promise<ProbeChannelsResult> {
  const key = cacheKey(
    opts.source,
    opts.source === 'camera' ? opts.cameraDeviceId : opts.audioDeviceId,
  )
  if (!opts.force && probeCache.has(key)) {
    return probeCache.get(key)!
  }

  const constraints = spectrumAudioConstraints(
    opts.source,
    opts.audioDeviceId ?? null,
    opts.cameraDeviceId,
  )
  if (!constraints) {
    const fallback = { channelCount: 2, measured: false }
    probeCache.set(key, fallback)
    return fallback
  }

  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints)
    if (opts.source === 'camera') {
      stream.getVideoTracks().forEach((t) => t.stop())
    }
    const track = stream.getAudioTracks()[0]
    const settingsCount = Number(track?.getSettings?.().channelCount) || 0

    ctx = new AudioContext()
    const src = ctx.createMediaStreamSource(stream)
    const ctxCount = Number(src.channelCount) || 0

    // Preferir o maior valor medido (settings às vezes reporta 2 com interface 8ch
    // se o SO já tiver downmixado — o channelCount do source costuma refletir o stream).
    let count = Math.max(settingsCount, ctxCount)
    if (!Number.isFinite(count) || count < 1) count = 2

    const result = { channelCount: Math.min(32, Math.floor(count)), measured: true }
    probeCache.set(key, result)
    return result
  } catch (err) {
    console.warn('[spectrum] probe channels failed', err)
    const fallback = { channelCount: 2, measured: false }
    probeCache.set(key, fallback)
    return fallback
  } finally {
    try {
      stream?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    if (ctx && ctx.state !== 'closed') void ctx.close()
  }
}

export function invalidateChannelProbeCache() {
  probeCache.clear()
}

export type ChannelOption = { value: string; label: string }

/** Opções de UI a partir do channelCount real do device. */
export function channelOptionsForCount(count: number): ChannelOption[] {
  const n = Math.max(1, Math.floor(count) || 1)
  const opts: ChannelOption[] = [{ value: 'mix', label: `Mix (${n} canais)` }]
  if (n === 1) {
    opts.push({ value: '0', label: 'Canal 1' })
    return opts
  }
  opts.push({ value: 'l', label: 'L · canal 1' })
  opts.push({ value: 'r', label: 'R · canal 2' })
  for (let i = 2; i < n; i++) {
    opts.push({ value: String(i), label: `Canal ${i + 1}` })
  }
  return opts
}

/** Se o canal salvo não existe no device, volta para mix. */
export function clampChannelToCount(
  channel: string | number,
  count: number,
): 'mix' | 'l' | 'r' | number {
  if (channel === 'mix') return 'mix'
  const n = Math.max(1, Math.floor(count) || 1)
  if (channel === 'l') return n >= 1 ? 'l' : 'mix'
  if (channel === 'r') return n >= 2 ? 'r' : 'mix'
  const idx =
    typeof channel === 'number' ? channel : parseInt(String(channel), 10)
  if (!Number.isFinite(idx) || idx < 0 || idx >= n) return 'mix'
  if (idx === 0) return 'l'
  if (idx === 1) return 'r'
  return idx
}
