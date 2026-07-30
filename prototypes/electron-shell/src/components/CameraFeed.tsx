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

    async function start() {
      setError(null)
      try {
        let stream = await acquireCameraStream(id, withAudio)
        if (cancelled) {
          releaseCameraStream(id, withAudio)
          return
        }
        const el = videoRef.current
        if (!el) {
          releaseCameraStream(id, withAudio)
          return
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
          el.srcObject = again
          try {
            await el.play()
          } catch {
            /* autoplay */
          }
        }

        if (withAudio && !forceMuted && stream.getAudioTracks().length) {
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
      } catch (err) {
        if (!cancelled) setError(String(err || 'Câmera indisponível'))
      }
    }

    void start()

    return () => {
      cancelled = true
      if (attachedElement) attachedElement.srcObject = null
      try {
        sourceNode?.disconnect()
        isolateNode?.disconnect()
        isolateNode?.destroy()
      } catch {
        /* ignore */
      }
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close()
      }
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
