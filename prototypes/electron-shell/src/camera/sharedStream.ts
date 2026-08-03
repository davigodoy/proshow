type Entry = {
  stream: MediaStream
  refs: number
  pending?: Promise<MediaStream>
  stopTimer?: ReturnType<typeof setTimeout>
}

const byKey = new Map<string, Entry>()

function keyFor(deviceId?: string | null, withAudio = false) {
  return `${deviceId || '__default__'}:${withAudio ? 'av' : 'video'}`
}

async function openStream(
  deviceId?: string | null,
  withAudio = false,
): Promise<MediaStream> {
  const trials: MediaStreamConstraints[] = []
  const audio: MediaTrackConstraints | boolean = withAudio
    ? {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      }
    : false
  if (deviceId) {
    trials.push({ audio, video: { deviceId: { exact: deviceId } } })
    trials.push({ audio, video: { deviceId: { ideal: deviceId } } })
  }
  trials.push({ audio, video: true })

  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const constraints of trials) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints)
      } catch (err) {
        lastErr = err
      }
    }
    await new Promise<void>((r) => window.setTimeout(r, 180 + attempt * 120))
  }
  throw lastErr || new Error('Câmera indisponível')
}

function cancelStop(entry: Entry) {
  if (entry.stopTimer != null) {
    clearTimeout(entry.stopTimer)
    entry.stopTimer = undefined
  }
}

/** Um MediaStream por device — várias <video> no mesmo processo compartilham. */
export async function acquireCameraStream(
  deviceId?: string | null,
  withAudio = false,
): Promise<MediaStream> {
  const key = keyFor(deviceId, withAudio)
  const existing = byKey.get(key)
  if (existing) {
    cancelStop(existing)
    if (existing.stream && existing.stream.active) {
      existing.refs += 1
      return existing.stream
    }
    if (existing.pending) {
      const stream = await existing.pending
      const cur = byKey.get(key)
      if (cur) {
        cancelStop(cur)
        cur.refs += 1
      }
      return stream
    }
  }

  const entry: Entry = { stream: null as unknown as MediaStream, refs: 0 }
  const pending = openStream(deviceId, withAudio)
    .then((stream) => {
      entry.stream = stream
      entry.pending = undefined
      return stream
    })
    .catch((err) => {
      byKey.delete(key)
      throw err
    })
  entry.pending = pending
  byKey.set(key, entry)

  const stream = await pending
  entry.refs += 1
  return stream
}

export function releaseCameraStream(
  deviceId?: string | null,
  withAudio = false,
) {
  const key = keyFor(deviceId, withAudio)
  const entry = byKey.get(key)
  if (!entry) return
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs > 0 || entry.pending) return
  // Atrasa o stop: Preview→AO VIVO remonta no mesmo tick e reaproveita o stream
  cancelStop(entry)
  entry.stopTimer = setTimeout(() => {
    const cur = byKey.get(key)
    if (!cur || cur.refs > 0 || cur.pending) return
    cur.stream?.getTracks().forEach((t) => t.stop())
    byKey.delete(key)
  }, 250)
}

/** Para a saída poder abrir a câmera sem conflito com o operador. */
export function releaseAllCameraStreams() {
  for (const [, entry] of byKey) {
    cancelStop(entry)
    entry.refs = 0
    entry.stream?.getTracks().forEach((t) => t.stop())
  }
  byKey.clear()
}

export function sleep(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms))
}
