import { useEffect, useRef, useState } from 'react'
import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor'
import {
  acquireCameraStream,
  releaseCameraStream,
} from '../camera/sharedStream'
import { createVoiceIsolationNode } from './voiceIsolation'

type Props = {
  deviceId?: string | null
  mirrored?: boolean
  className?: string
  audio?: boolean
  voiceIsolate?: boolean
  forceMuted?: boolean
}

/**
 * Usa stream compartilhado no mesmo processo (preview + AO VIVO).
 * A janela de saída é outro processo — o operador libera antes no modo real.
 */
export function CameraFeed({
  deviceId,
  mirrored = true,
  className,
  audio = false,
  voiceIsolate = false,
  forceMuted = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const id = deviceId ?? null
    const withAudio = Boolean(audio)
    let audioContext: AudioContext | null = null
    let sourceNode: MediaStreamAudioSourceNode | null = null
    let isolateNode: RnnoiseWorkletNode | null = null
    let attachedElement: HTMLVideoElement | null = null
    let freezeTimer = 0
    let lastFrameAt = Date.now()
    let restarting = false

    async function attachStream(stream: MediaStream) {
      const el = videoRef.current
      if (!el) {
        releaseCameraStream(id, withAudio)
        return null
      }
      attachedElement = el
      el.srcObject = stream
      el.muted = true
      el.playsInline = true
      try {
        await el.play()
      } catch {
        /* autoplay */
      }
      return el
    }

    async function wireAudio(stream: MediaStream) {
      if (!(withAudio && !forceMuted && stream.getAudioTracks().length)) return
      try {
        audioContext = new AudioContext({ sampleRate: 48000 })
        if (audioContext.state === 'suspended') await audioContext.resume()
        sourceNode = audioContext.createMediaStreamSource(stream)
        if (voiceIsolate) {
          isolateNode = await createVoiceIsolationNode(audioContext)
          if (cancelled) return
          sourceNode.connect(isolateNode)
          isolateNode.connect(audioContext.destination)
        } else {
          sourceNode.connect(audioContext.destination)
        }
      } catch (audioError) {
        console.error('[Áudio da câmera]', audioError)
        try {
          isolateNode?.destroy()
        } catch {
          /* ignore */
        }
        isolateNode = null
        sourceNode?.disconnect()
        sourceNode = null
        if (audioContext && audioContext.state !== 'closed') {
          void audioContext.close()
        }
        audioContext = null
      }
    }

    function clearAudioGraph() {
      try {
        sourceNode?.disconnect()
        isolateNode?.disconnect()
        isolateNode?.destroy()
      } catch {
        /* ignore */
      }
      isolateNode = null
      sourceNode = null
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close()
      }
      audioContext = null
    }

    /** NDI Virtual Input às vezes congela o track — remonta o stream. */
    async function restartFrozenStream() {
      if (cancelled || restarting) return
      restarting = true
      try {
        clearAudioGraph()
        releaseCameraStream(id, withAudio)
        const again = await acquireCameraStream(id, withAudio)
        if (cancelled) {
          releaseCameraStream(id, withAudio)
          return
        }
        await attachStream(again)
        await wireAudio(again)
        lastFrameAt = Date.now()
      } catch (err) {
        if (!cancelled) setError(String(err || 'Câmera indisponível'))
      } finally {
        restarting = false
      }
    }

    function watchFrames(el: HTMLVideoElement) {
      lastFrameAt = Date.now()
      const onFrame = () => {
        lastFrameAt = Date.now()
        if ('requestVideoFrameCallback' in el) {
          try {
            ;(
              el as HTMLVideoElement & {
                requestVideoFrameCallback: (cb: () => void) => number
              }
            ).requestVideoFrameCallback(onFrame)
          } catch {
            /* ignore */
          }
        }
      }
      if ('requestVideoFrameCallback' in el) {
        try {
          ;(
            el as HTMLVideoElement & {
              requestVideoFrameCallback: (cb: () => void) => number
            }
          ).requestVideoFrameCallback(onFrame)
        } catch {
          /* ignore */
        }
      }
      freezeTimer = window.setInterval(() => {
        if (cancelled || document.hidden) return
        const track = (el.srcObject as MediaStream | null)?.getVideoTracks?.()[0]
        if (!track || track.readyState !== 'live') return
        // Sem frame novo ~1,8s: típico do Virtual Input com janela coberta
        if (Date.now() - lastFrameAt > 1800) {
          lastFrameAt = Date.now()
          void restartFrozenStream()
        }
      }, 700)
    }

    async function start() {
      setError(null)
      try {
        let stream = await acquireCameraStream(id, withAudio)
        if (cancelled) {
          releaseCameraStream(id, withAudio)
          return
        }
        const el = await attachStream(stream)
        if (!el) return

        // Se o track morreu no handoff Preview→AO VIVO, tenta de novo
        const track = stream.getVideoTracks()[0]
        if (track && track.readyState !== 'live' && !cancelled) {
          releaseCameraStream(id, withAudio)
          const again = await acquireCameraStream(id, withAudio)
          if (cancelled) {
            releaseCameraStream(id, withAudio)
            return
          }
          stream = again
          await attachStream(again)
        }

        await wireAudio(stream)
        watchFrames(el)
      } catch (err) {
        if (!cancelled) setError(String(err || 'Câmera indisponível'))
      }
    }

    void start()

    return () => {
      cancelled = true
      if (freezeTimer) window.clearInterval(freezeTimer)
      if (attachedElement) attachedElement.srcObject = null
      clearAudioGraph()
      releaseCameraStream(id, withAudio)
    }
  }, [deviceId, audio, voiceIsolate, forceMuted])

  if (error) {
    return (
      <div className={className ? `${className} camera-error` : 'camera-error'}>
        Sem câmera · {error}
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      playsInline
      muted
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    />
  )
}
