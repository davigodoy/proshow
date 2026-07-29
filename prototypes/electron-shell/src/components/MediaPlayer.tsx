import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor'
import { toMediaUrl } from '../mediaUrl'
import { toastInfo } from '../toast'
import { createVoiceIsolationNode } from './voiceIsolation'
import { setMediaSpectrumAnalyser } from '../spectrum/mediaTap'
import './media-player.css'

export type MediaPlayback = {
  playing: boolean
  muted: boolean
  loop: boolean
  volume: number
  seekTo: number | null
  seekSeq: number
  /** RNNoise — isola voz / reduz ruído de fundo */
  voiceIsolate?: boolean
}

export const DEFAULT_PLAYBACK: MediaPlayback = {
  playing: true,
  muted: false,
  loop: true,
  volume: 1,
  seekTo: null,
  seekSeq: 0,
  voiceIsolate: false,
}

type Props = {
  src: string | null | undefined
  playback: MediaPlayback
  /** Força mute (ex.: preview do operador) */
  forceMuted?: boolean
  className?: string
  /** Como o vídeo preenche o quadro. */
  mediaFit?: 'contain' | 'cover' | 'fill'
  onTime?: (current: number, duration: number) => void
  onEnded?: () => void
  onError?: (message: string) => void
  onReady?: (duration: number) => void
  /** Força grafo Web Audio mesmo sem Isolar voz (tap do espectro). */
  ensureAudioGraph?: boolean
}

export function MediaPlayer({
  src,
  playback,
  forceMuted = false,
  className = '',
  mediaFit = 'contain',
  onTime,
  onEnded,
  onError,
  onReady,
  ensureAudioGraph = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastSeekSeq = useRef(0)
  const onTimeRef = useRef(onTime)
  onTimeRef.current = onTime
  const seekGuardRef = useRef<{ target: number; until: number } | null>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const rnnoiseNodeRef = useRef<RnnoiseWorkletNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const analyserNodeRef = useRef<AnalyserNode | null>(null)
  const graphActiveRef = useRef(false)
  const wireSeqRef = useRef(0)
  const wireChainRef = useRef(Promise.resolve())
  const lastIsolateToastAtRef = useRef(0)
  const forceMutedRef = useRef(forceMuted)
  forceMutedRef.current = forceMuted
  const playbackRef = useRef(playback)
  playbackRef.current = playback

  const [error, setError] = useState<string | null>(null)
  const [isolateBusy, setIsolateBusy] = useState(false)
  const url = toMediaUrl(src)

  useEffect(() => {
    setError(null)
    lastSeekSeq.current = 0
    seekGuardRef.current = null
  }, [url])

  // Tear down Web Audio when src changes / unmount
  useEffect(() => {
    return () => {
      wireSeqRef.current += 1
      setMediaSpectrumAnalyser(null)
      try {
        rnnoiseNodeRef.current?.destroy()
      } catch {
        /* ignore */
      }
      rnnoiseNodeRef.current = null
      try {
        analyserNodeRef.current?.disconnect()
      } catch {
        /* ignore */
      }
      analyserNodeRef.current = null
      try {
        sourceNodeRef.current?.disconnect()
      } catch {
        /* ignore */
      }
      sourceNodeRef.current = null
      gainNodeRef.current = null
      graphActiveRef.current = false
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      if (ctx && ctx.state !== 'closed') void ctx.close()
    }
  }, [url])

  function emitTime(current: number, duration: number) {
    const guard = seekGuardRef.current
    if (guard && Date.now() < guard.until) {
      if (Math.abs(current - guard.target) > 0.85) {
        onTimeRef.current?.(guard.target, duration)
        return
      }
      if (Math.abs(current - guard.target) <= 0.35) {
        seekGuardRef.current = null
      }
    }
    onTimeRef.current?.(current, duration)
  }

  function applyGain() {
    const gain = gainNodeRef.current
    if (!gain) return
    const pb = playbackRef.current
    const silent = forceMutedRef.current || pb.muted
    gain.gain.value = silent ? 0 : Math.max(0, Math.min(1, pb.volume))
  }

  /** Garante source→gain (nunca deixar o elemento sem rota de áudio). */
  function reconnectPlain(el: HTMLVideoElement) {
    const source = sourceNodeRef.current
    const gain = gainNodeRef.current
    if (!source || !gain) return
    try {
      source.disconnect()
    } catch {
      /* ignore */
    }
    try {
      rnnoiseNodeRef.current?.disconnect()
      rnnoiseNodeRef.current?.destroy()
    } catch {
      /* ignore */
    }
    rnnoiseNodeRef.current = null
    try {
      source.connect(gain)
    } catch {
      /* ignore */
    }
    el.muted = false
    el.volume = 1
    applyGain()
  }

  async function wireAudioGraphOnce(isolate: boolean) {
    const el = videoRef.current
    if (!el || !url) return
    const doIsolate = Boolean(isolate) && !forceMutedRef.current
    const seq = ++wireSeqRef.current

    if (doIsolate) setIsolateBusy(true)
    try {
      let ctx = audioCtxRef.current
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContext({ sampleRate: 48000 })
        audioCtxRef.current = ctx
      }
      if (ctx.state === 'suspended') await ctx.resume()
      if (seq !== wireSeqRef.current) {
        reconnectPlain(el)
        return
      }

      if (!sourceNodeRef.current) {
        sourceNodeRef.current = ctx.createMediaElementSource(el)
        graphActiveRef.current = true
      }
      if (!gainNodeRef.current) {
        gainNodeRef.current = ctx.createGain()
        gainNodeRef.current.connect(ctx.destination)
      }

      const source = sourceNodeRef.current
      const gain = gainNodeRef.current

      try {
        source.disconnect()
      } catch {
        /* ignore */
      }
      try {
        rnnoiseNodeRef.current?.disconnect()
        rnnoiseNodeRef.current?.destroy()
      } catch {
        /* ignore */
      }
      rnnoiseNodeRef.current = null

      if (doIsolate) {
        const rn = await createVoiceIsolationNode(ctx)
        if (seq !== wireSeqRef.current) {
          try {
            rn.destroy()
          } catch {
            /* ignore */
          }
          reconnectPlain(el)
          return
        }
        rnnoiseNodeRef.current = rn
        source.connect(rn)
        rn.connect(gain)
      } else {
        source.connect(gain)
      }

      try {
        analyserNodeRef.current?.disconnect()
      } catch {
        /* ignore */
      }
      const spectrumAnalyser = ctx.createAnalyser()
      spectrumAnalyser.fftSize = 256
      spectrumAnalyser.smoothingTimeConstant = 0.75
      gain.connect(spectrumAnalyser)
      analyserNodeRef.current = spectrumAnalyser
      setMediaSpectrumAnalyser(spectrumAnalyser)

      el.muted = false
      el.volume = 1
      applyGain()
      if (doIsolate) setError(null)

      if (playbackRef.current.playing) {
        void el.play().catch(() => {
          /* autoplay / abort — o effect de play tenta de novo */
        })
      }
    } catch (err) {
      if (seq !== wireSeqRef.current) {
        if (videoRef.current) reconnectPlain(videoRef.current)
        return
      }
      console.error('[Isolar voz]', err)
      if (doIsolate) {
        setError('Não foi possível ativar Isolar voz neste áudio.')
        const now = Date.now()
        if (now - lastIsolateToastAtRef.current > 2500) {
          lastIsolateToastAtRef.current = now
          toastInfo('Não foi possível ativar Isolar voz neste áudio.')
        }
      }
      setMediaSpectrumAnalyser(null)
      try {
        rnnoiseNodeRef.current?.destroy()
      } catch {
        /* ignore */
      }
      rnnoiseNodeRef.current = null
      if (sourceNodeRef.current && gainNodeRef.current) {
        reconnectPlain(el)
      } else {
        // createMediaElementSource falhou — volta ao áudio nativo do <video>
        graphActiveRef.current = false
        el.muted = forceMutedRef.current || playbackRef.current.muted
        el.volume = Math.max(0, Math.min(1, playbackRef.current.volume))
      }
      if (playbackRef.current.playing) {
        void el.play().catch(() => {})
      }
    } finally {
      if (seq === wireSeqRef.current) setIsolateBusy(false)
    }
  }

  function enqueueWire(isolate: boolean) {
    const next = wireChainRef.current
      .catch(() => {})
      .then(() => wireAudioGraphOnce(isolate))
    wireChainRef.current = next
    return next
  }

  // Play primeiro (gesto do duplo clique); Isolar voz sobe o grafo depois.
  useEffect(() => {
    if (!url) return
    const el = videoRef.current
    if (!el) return

    const wantIsolate = Boolean(playback.voiceIsolate) && !forceMuted
    const wantGraph = wantIsolate || ensureAudioGraph
    if (!wantGraph && !graphActiveRef.current) return

    let cancelled = false
    let timer = 0

    const start = () => {
      if (cancelled) return
      // Isolar: espera um tick após canplay p/ o play() do gesto não perder a corrida
      const delay = wantIsolate && !graphActiveRef.current ? 80 : 0
      timer = window.setTimeout(() => {
        if (cancelled) return
        void enqueueWire(wantIsolate)
      }, delay)
    }

    if (el.readyState >= 2) {
      start()
    } else {
      el.addEventListener('canplay', start, { once: true })
    }

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      el.removeEventListener('canplay', start)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, playback.voiceIsolate, ensureAudioGraph, forceMuted])

  useLayoutEffect(() => {
    const el = videoRef.current
    if (!el || !url) return
    if (playback.seekTo == null) return
    if (playback.seekSeq <= lastSeekSeq.current) return

    const target = Number(playback.seekTo)
    if (!Number.isFinite(target) || target < 0) return

    const seq = playback.seekSeq
    lastSeekSeq.current = seq
    seekGuardRef.current = { target, until: Date.now() + 900 }

    const apply = () => {
      try {
        el.currentTime = target
        emitTime(target, el.duration || 0)
      } catch {
        /* metadata pending */
      }
    }

    if (el.readyState >= 1) {
      apply()
      return
    }

    const onMeta = () => {
      apply()
      el.removeEventListener('loadedmetadata', onMeta)
    }
    el.addEventListener('loadedmetadata', onMeta)
    return () => el.removeEventListener('loadedmetadata', onMeta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.seekSeq, playback.seekTo, url])

  useEffect(() => {
    const el = videoRef.current
    if (!el || !url) return
    el.loop = playback.loop

    if (graphActiveRef.current) {
      el.muted = false
      el.volume = 1
      applyGain()
    } else {
      el.muted = forceMuted || playback.muted
      el.volume = Math.max(0, Math.min(1, playback.volume))
    }

    if (playback.playing) {
      void el.play().catch((err) => {
        const name = String((err as { name?: string })?.name || '')
        if (name === 'AbortError') return
        const msg = String((err as Error)?.message || err)
        setError(msg)
        toastInfo(msg)
        onError?.(msg)
      })
    } else {
      el.pause()
    }
  }, [
    playback.playing,
    playback.muted,
    playback.loop,
    playback.volume,
    forceMuted,
    url,
    onError,
  ])

  if (!url) return null

  return (
    <div className={`media-player ${className}`.trim()}>
      <video
        // Remonta a cada fonte: um <video> só pode ser ligado a UM
        // MediaElementSourceNode em toda a sua vida. Sem isto, trocar de
        // vídeo com Isolar voz ligado estoura InvalidStateError e o segundo
        // vídeo fica sem o filtro (e sem áudio).
        key={url}
        ref={videoRef}
        className="media-player-video"
        // Sem isto o Isolar voz emudece o vídeo: a página roda em file:// e a
        // mídia vem de iblemedia://, então `createMediaElementSource` trata o
        // elemento como cross-origin e passa a emitir silêncio. Só marcamos o
        // nosso próprio protocolo — pôr em URL remota exigiria CORS do
        // servidor e quebraria mídia que hoje carrega sem ele.
        crossOrigin={url.startsWith('iblemedia:') ? 'anonymous' : undefined}
        src={url}
        playsInline
        preload="auto"
        muted={forceMuted || playback.muted}
        style={{ objectFit: mediaFit }}
        onLoadedMetadata={() => {
          const el = videoRef.current
          if (!el) return
          const d = el.duration || 0
          onReady?.(d)
          emitTime(el.currentTime, d)
        }}
        onDurationChange={() => {
          const el = videoRef.current
          if (!el) return
          emitTime(el.currentTime, el.duration || 0)
        }}
        onTimeUpdate={() => {
          const el = videoRef.current
          if (!el) return
          emitTime(el.currentTime, el.duration || 0)
        }}
        onSeeked={() => {
          const el = videoRef.current
          if (!el) return
          seekGuardRef.current = null
          emitTime(el.currentTime, el.duration || 0)
        }}
        onEnded={() => onEnded?.()}
        onError={() => {
          const msg =
            'Formato não suportado pelo Chromium (tente MP4/MOV H.264, ou importe de novo com ffmpeg para converter).'
          setError(msg)
          toastInfo(msg)
          onError?.(msg)
        }}
      />
      {error ? <div className="media-player-error">{error}</div> : null}
      {isolateBusy ? (
        <div className="media-player-isolate-hint">Isolar voz…</div>
      ) : null}
    </div>
  )
}

type TransportProps = {
  playback: MediaPlayback
  currentTime?: number
  duration?: number
  onChange: (next: Partial<MediaPlayback>) => void
  onScrubbingChange?: (scrubbing: boolean) => void
  label?: string
  /** full = vídeo/áudio · audio = mute/volume (URL / YouTube) */
  variant?: 'full' | 'audio'
}

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function MediaTransport({
  playback,
  currentTime = 0,
  duration = 0,
  onChange,
  onScrubbingChange,
  label,
  variant = 'full',
}: TransportProps) {
  const [scrub, setScrub] = useState<number | null>(null)
  const scrubbing = scrub != null
  const audioOnly = variant === 'audio'
  const safeDuration =
    Number.isFinite(duration) && duration > 0 && duration !== Infinity
      ? duration
      : 0

  useEffect(() => {
    if (scrub == null) return
    if (Math.abs(currentTime - scrub) < 0.4) {
      setScrub(null)
      onScrubbingChange?.(false)
    }
  }, [currentTime, scrub, onScrubbingChange])

  const displayTime = scrubbing
    ? (scrub as number)
    : Math.min(Math.max(0, currentTime), safeDuration || currentTime || 0)

  function commitSeek(t: number) {
    const next =
      safeDuration > 0 ? Math.max(0, Math.min(t, safeDuration)) : Math.max(0, t)
    setScrub(next)
    onScrubbingChange?.(true)
    onChange({
      seekTo: next,
      playing: true,
    })
  }

  function endScrubSoon() {
    window.setTimeout(() => {
      setScrub(null)
      onScrubbingChange?.(false)
    }, 450)
  }

  if (audioOnly) {
    return (
      <div className="media-transport is-audio-only">
        <div className="media-transport-audio-row">
          <label className="media-vol">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={playback.muted ? 0 : playback.volume}
              onChange={(e) => {
                const volume = Number(e.target.value)
                onChange({ volume, muted: volume <= 0 })
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => onChange({ muted: !playback.muted })}
          >
            {playback.muted ? 'Som' : 'Mudo'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="media-transport">
      <div className="media-transport-top">
        {label ? <span className="media-transport-label">{label}</span> : null}
        <div className="media-transport-btns">
          <button
            type="button"
            onClick={() => {
              setScrub(0)
              onScrubbingChange?.(true)
              onChange({ seekTo: 0, playing: true })
              endScrubSoon()
            }}
          >
            ⟲
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onChange({ playing: !playback.playing })}
          >
            {playback.playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => onChange({ muted: !playback.muted })}
          >
            {playback.muted ? 'Som' : 'Mudo'}
          </button>
          <label
            className={`media-loop ${playback.voiceIsolate ? 'is-on' : ''}`}
            title="Reduz ruído de fundo e prioriza a voz (RNNoise)"
          >
            <input
              type="checkbox"
              checked={Boolean(playback.voiceIsolate)}
              onChange={(e) => onChange({ voiceIsolate: e.target.checked })}
            />
            Isolar voz
          </label>
        </div>
      </div>
      <input
        className="media-seek"
        type="range"
        min={0}
        max={Math.max(0.1, safeDuration || 0.1)}
        step="any"
        value={Number.isFinite(displayTime) ? displayTime : 0}
        onPointerDown={(e) => {
          const el = e.currentTarget
          const rect = el.getBoundingClientRect()
          const ratio = Math.max(
            0,
            Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)),
          )
          const max = Number(el.max) || 0
          commitSeek(ratio * max)
        }}
        onChange={(e) => commitSeek(Number(e.target.value))}
        onInput={(e) =>
          commitSeek(Number((e.target as HTMLInputElement).value))
        }
        onPointerUp={() => endScrubSoon()}
        onPointerCancel={() => endScrubSoon()}
        onBlur={() => endScrubSoon()}
      />
      <div className="media-transport-meta">
        <label className="media-loop">
          <input
            type="checkbox"
            checked={playback.loop}
            onChange={(e) => onChange({ loop: e.target.checked })}
          />
          Loop
        </label>
        <span className="media-time">
          {fmt(displayTime)} / {fmt(safeDuration)}
        </span>
        <label className="media-vol">
          Vol
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={playback.muted ? 0 : playback.volume}
            onChange={(e) => {
              const volume = Number(e.target.value)
              onChange({
                volume,
                muted: volume <= 0 ? true : false,
              })
            }}
          />
        </label>
      </div>
    </div>
  )
}
