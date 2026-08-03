import { useEffect, useRef, useState } from 'react'
import type { SpectrumChannel, SpectrumConfig, SpectrumSource } from './types'
import {
  getMediaSpectrumAnalyser,
  onMediaSpectrumAnalyser,
} from './mediaTap'
import { spectrumAudioConstraints } from './probeChannels'

export type SpectrumAnalyserHandle = {
  analyser: AnalyserNode | null
  error: string | null
}

type Opts = {
  config: SpectrumConfig
  /** deviceId da câmera no ar — usado quando source=camera */
  cameraDeviceId?: string | null
  /** true se há mídia com áudio no ar */
  mediaLive?: boolean
}

/**
 * Abre captura de áudio (device/câmera) ou usa tap da mídia.
 * Por padrão não conecta em destination (só analisa).
 */
export function useSpectrumAnalyser({
  config,
  cameraDeviceId,
  mediaLive,
}: Opts): SpectrumAnalyserHandle {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setAnalyser(null)
    setError(null)

    if (!config.enabled) return

    let cancelled = false

    async function startDevice(source: SpectrumSource) {
      if (source === 'media') return
      const constraints = spectrumAudioConstraints(
        source,
        config.audioDeviceId,
        cameraDeviceId,
      )
      if (!constraints) {
        setError('Nenhuma fonte de áudio selecionada')
        return
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (err) {
        console.error('[spectrum]', err)
        setError('Não foi possível abrir o dispositivo de áudio')
        return
      }
      if (source === 'camera') {
        stream.getVideoTracks().forEach((t) => t.stop())
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      const track = stream.getAudioTracks()[0]
      const settingsCount = Number(track?.getSettings?.().channelCount) || 0

      const ctx = new AudioContext()
      const sourceNode = ctx.createMediaStreamSource(stream)
      const liveCount = Math.max(
        1,
        settingsCount,
        Number(sourceNode.channelCount) || 0,
        1,
      )
      const { analyser: an, disconnectChannel } = wireChannel(
        ctx,
        sourceNode,
        config.channel,
        liveCount,
      )
      an.fftSize = 256
      an.smoothingTimeConstant = 0.75

      if (config.monitorAudio) {
        an.connect(ctx.destination)
      }

      if (ctx.state === 'suspended') await ctx.resume()
      if (cancelled) {
        disconnectChannel()
        sourceNode.disconnect()
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
        return
      }

      setAnalyser(an)
      cleanupRef.current = () => {
        try {
          disconnectChannel()
          sourceNode.disconnect()
        } catch {
          /* ignore */
        }
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
      }
    }

    if (config.source === 'media') {
      if (!mediaLive) {
        setError(null)
        setAnalyser(null)
        const off = onMediaSpectrumAnalyser((node) => {
          if (!cancelled) setAnalyser(node)
        })
        cleanupRef.current = off
        return
      }
      const existing = getMediaSpectrumAnalyser()
      if (existing) {
        setAnalyser(existing)
      }
      const off = onMediaSpectrumAnalyser((node) => {
        if (!cancelled) setAnalyser(node)
      })
      cleanupRef.current = off
      return
    }

    void startDevice(config.source)

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [
    config.enabled,
    config.source,
    config.audioDeviceId,
    config.channel,
    config.monitorAudio,
    cameraDeviceId,
    mediaLive,
  ])

  return { analyser, error }
}

function wireChannel(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  channel: SpectrumChannel,
  channelCount: number,
): { analyser: AnalyserNode; disconnectChannel: () => void } {
  const analyser = ctx.createAnalyser()
  const n = Math.max(1, Math.min(32, Math.floor(channelCount) || 1))

  if (channel === 'mix') {
    source.connect(analyser)
    return {
      analyser,
      disconnectChannel: () => {
        try {
          source.disconnect(analyser)
        } catch {
          /* ignore */
        }
      },
    }
  }

  const splitter = ctx.createChannelSplitter(n)
  source.connect(splitter)
  let idx =
    channel === 'l' ? 0 : channel === 'r' ? 1 : Math.floor(Number(channel) || 0)
  if (idx < 0 || idx >= n) idx = 0
  splitter.connect(analyser, idx)
  return {
    analyser,
    disconnectChannel: () => {
      try {
        splitter.disconnect()
        source.disconnect(splitter)
      } catch {
        /* ignore */
      }
    },
  }
}
