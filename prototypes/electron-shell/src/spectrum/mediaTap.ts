/**
 * Tap opcional do grafo de mídia (vídeo/áudio) para o espectro.
 * A Output e o MediaPlayer vivem no mesmo processo renderer.
 */

let mediaAnalyser: AnalyserNode | null = null
const listeners = new Set<(node: AnalyserNode | null) => void>()

export function setMediaSpectrumAnalyser(node: AnalyserNode | null) {
  mediaAnalyser = node
  for (const cb of listeners) cb(node)
}

export function getMediaSpectrumAnalyser() {
  return mediaAnalyser
}

export function onMediaSpectrumAnalyser(
  cb: (node: AnalyserNode | null) => void,
) {
  listeners.add(cb)
  cb(mediaAnalyser)
  return () => {
    listeners.delete(cb)
  }
}
