import { useEffect, useRef, useState } from 'react'
import type { AutoAdvanceConfig } from './types'
import {
  grammarPhrasesFromCandidates,
  isLikelyHallucination,
  pickAutoTarget,
  type AutoGoLiveTarget,
  type AutoLineCandidate,
} from './match'
import {
  spectrumAudioConstraints,
  clampChannelToCount,
} from '../spectrum/probeChannels'
import {
  acceptAudioBuffer,
  createVoskSession,
  ensureVoskModel,
  type VoskSession,
} from './voskEngine'

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

const HOLD_MS = 40
const COOLDOWN_MS_BASE = 550
const MIN_RMS = 0.005
const IDLE_CLEAR_MS_BASE = 22000
/** Grammar só quando candidatos mudam — recrear Vosk com frequência derruba o processo. */
const GRAMMAR_REFRESH_MS = 2500
/** Junta pedaços entre pausas longas (música lenta / melisma). */
const STICKY_HEARD_MS_BASE = 5000
/** ~ticks de 800ms — pausa curta de culto lento ≠ silêncio de black. */
const SILENCE_TICKS_BEFORE_IDLE = 8

/** Cadência estimada entre avanços (música lenta → mais paciência). */
function timingFromCadence(cadenceMs: number | null) {
  const c = cadenceMs && cadenceMs > 800 ? cadenceMs : 4500
  return {
    cooldownMs: Math.min(2200, Math.max(COOLDOWN_MS_BASE, Math.round(c * 0.1))),
    idleClearMs: Math.min(45000, Math.max(IDLE_CLEAR_MS_BASE, Math.round(c * 2.8))),
    stickyHeardMs: Math.min(12000, Math.max(STICKY_HEARD_MS_BASE, Math.round(c * 0.9))),
  }
}

/**
 * Auto: Vosk com grammar fechada das aberturas (Preview-first) → AO VIVO.
 */
export function useAutoAdvance({
  config,
  candidates,
  liveLine,
  liveIndex,
  active,
  programVisible,
  suppressUntil,
  onGoLive,
  onClearLive,
}: Opts) {
  const [status, setStatus] = useState<AutoAdvanceStatus>('off')
  const [lastHeard, setLastHeard] = useState('')
  const [loadMsg, setLoadMsg] = useState('')
  const [modelReady, setModelReady] = useState(false)

  const onGoLiveRef = useRef(onGoLive)
  onGoLiveRef.current = onGoLive
  const onClearLiveRef = useRef(onClearLive)
  onClearLiveRef.current = onClearLive
  const candidatesRef = useRef(candidates)
  candidatesRef.current = candidates
  const liveLineRef = useRef(liveLine)
  liveLineRef.current = liveLine
  const liveIndexRef = useRef(liveIndex)
  liveIndexRef.current = liveIndex
  const suppressRef = useRef(suppressUntil)
  suppressRef.current = suppressUntil
  const programVisibleRef = useRef(programVisible)
  programVisibleRef.current = programVisible
  const holdRef = useRef<{
    since: number
    key: string
    target: AutoGoLiveTarget
    hits: number
    score: number
  } | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const cooldownUntilRef = useRef(0)
  const idleSinceRef = useRef<number | null>(null)
  const lastClearRef = useRef(0)
  const sessionRef = useRef<VoskSession | null>(null)
  const grammarTimerRef = useRef<number | null>(null)
  /** EMA do intervalo entre avanços — música lenta alonga sticky/black. */
  const cadenceMsRef = useRef<number | null>(null)
  const lastAdvanceAtRef = useRef(0)

  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  function noteIdle(kind: 'silence' | 'nomatch') {
    if (!programVisibleRef.current) {
      if (idleSinceRef.current == null) idleSinceRef.current = Date.now()
      setStatus('cleared')
      return
    }
    const { idleClearMs } = timingFromCadence(cadenceMsRef.current)
    const now = Date.now()
    if (idleSinceRef.current == null) idleSinceRef.current = now
    if (now - idleSinceRef.current < idleClearMs) return
    if (now - lastClearRef.current < idleClearMs) return
    lastClearRef.current = now
    idleSinceRef.current = now
    holdRef.current = null
    clearHoldTimer()
    setStatus('cleared')
    setLastHeard('(black · ouvindo retorno)')
    console.info('[auto-advance] clearLive', kind, 'idle', idleClearMs)
    onClearLiveRef.current()
  }

  function noteActivity() {
    idleSinceRef.current = null
  }

  useEffect(() => {
    if (!config.enabled) {
      setStatus('off')
      setLastHeard('')
      setLoadMsg('')
      setModelReady(false)
      holdRef.current = null
      idleSinceRef.current = null
      clearHoldTimer()
      return
    }
    let cancelled = false
    setModelReady(false)
    setStatus('loading')
    void ensureVoskModel((msg, pct) => {
      if (cancelled) return
      setLoadMsg(pct != null ? `${msg} ${pct}%` : msg)
    })
      .then(() => {
        if (cancelled) return
        setLoadMsg('')
        setModelReady(true)
        setStatus(active ? 'listening' : 'waiting')
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[auto-advance] vosk modelo', err)
        setModelReady(false)
        setStatus('error')
        setLoadMsg(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
      clearHoldTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.enabled])

  useEffect(() => {
    if (!config.enabled || !modelReady) return
    setStatus((s) => {
      if (s === 'error' || s === 'heard' || s === 'advancing') return s
      if (!active) return 'waiting'
      if (!programVisible) return 'cleared'
      return 'listening'
    })
    if (!active) idleSinceRef.current = null
  }, [active, programVisible, config.enabled, modelReady])

  useEffect(() => {
    if (!config.enabled || !active || !modelReady) return

    let cancelled = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let processor: ScriptProcessorNode | null = null
    let energyTimer: number | null = null
    let lastEnergy = 0
    let silenceTicks = 0

    let sampleRate = 48000
    let rebuilding = false
    let pendingRebuild = false
    /** Transcript colado entre pausas (Vosk finaliza cedo em música lenta). */
    let stickyHeard = ''
    let stickyUntil = 0

    idleSinceRef.current = Date.now()

    function stickyWindowMs() {
      return timingFromCadence(cadenceMsRef.current).stickyHeardMs
    }

    function mergeSticky(chunk: string): string {
      const now = Date.now()
      if (now > stickyUntil) stickyHeard = ''
      const a = stickyHeard.trim()
      const b = chunk.trim()
      if (!b) return a
      if (!a) {
        stickyHeard = b
        stickyUntil = now + stickyWindowMs()
        return b
      }
      // Novo partial/final já contém o sticky → usa o maior
      if (b.includes(a) || normalizeLoose(b).includes(normalizeLoose(a))) {
        stickyHeard = b
        stickyUntil = now + stickyWindowMs()
        return b
      }
      // Sticky já contém o novo (eco) → mantém
      if (a.includes(b) || normalizeLoose(a).includes(normalizeLoose(b))) {
        stickyUntil = now + stickyWindowMs()
        return a
      }
      // Concatena palavras novas do fim
      const aw = a.split(/\s+/).filter(Boolean)
      const bw = b.split(/\s+/).filter(Boolean)
      let overlap = 0
      for (let k = Math.min(aw.length, bw.length); k >= 1; k--) {
        if (aw.slice(-k).join(' ') === bw.slice(0, k).join(' ')) {
          overlap = k
          break
        }
      }
      stickyHeard = [...aw, ...bw.slice(overlap)].join(' ').trim()
      // Janela curta — só as últimas ~10 palavras importam pra abertura
      const words = stickyHeard.split(/\s+/).filter(Boolean)
      if (words.length > 10) stickyHeard = words.slice(-10).join(' ')
      stickyUntil = now + stickyWindowMs()
      return stickyHeard
    }

    function normalizeLoose(s: string): string {
      return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
    }

    function considerText(text: string, source: 'partial' | 'final') {
      const cleaned = text
        .trim()
        .replace(/^\[unk\]\s*/gi, '')
        .replace(/\s*\[unk\]\s*/gi, ' ')
        .trim()
      if (!cleaned || isLikelyHallucination(cleaned)) {
        // Em música lenta [unk]/final vazio entre sílabas é comum — não mata sticky
        if (source === 'final' && !stickyHeard) {
          setLastHeard(cleaned ? `(ignora: ${cleaned.slice(0, 18)})` : '(silêncio)')
        }
        return
      }

      const merged = mergeSticky(cleaned)
      setLastHeard(merged)

      if (Date.now() < suppressRef.current) {
        setStatus('suppressed')
        holdRef.current = null
        clearHoldTimer()
        noteActivity()
        return
      }
      if (Date.now() < cooldownUntilRef.current) {
        noteActivity()
        return
      }

      const pick = pickAutoTarget({
        transcript: merged,
        candidates: candidatesRef.current,
        liveLine: liveLineRef.current,
        liveIndex: liveIndexRef.current,
        minNeighborScore: 0.28,
        minBehindScore: 0.3,
        minFarScore: 0.42,
        minOtherItemScore: 0.5,
        marginOverLive: 0.015,
      })

      console.info(
        '[auto-advance:vosk]',
        source,
        JSON.stringify(merged.slice(0, 55)),
        'L',
        pick.liveScore.toFixed(2),
        '→',
        pick.target
          ? `${pick.target.planItemId.slice(0, 8)}:${pick.target.slideIndex}`
          : null,
        pick.best
          ? `@${pick.best.score.toFixed(2)} d${pick.best.neighborDist}`
          : '',
      )

      if (!pick.target) {
        // Não zera hold/idle a cada final curto — culto lento fragmenta a frase
        if (source === 'final' && merged.split(/\s+/).length >= 5) {
          setStatus(programVisibleRef.current ? 'listening' : 'cleared')
          noteIdle('nomatch')
        }
        return
      }

      noteActivity()
      stickyUntil = Date.now() + stickyWindowMs()
      const target = pick.target
      const key = `${target.planItemId}:${target.slideIndex}`
      const score = pick.best?.score ?? 0
      const isNextish =
        (pick.preferred &&
          pick.preferred.planItemId === target.planItemId &&
          pick.preferred.slideIndex === target.slideIndex) ||
        (pick.best?.sameItem && (pick.best.neighborDist ?? 99) <= 1) ||
        (liveIndexRef.current >= 0 &&
          target.slideIndex < liveIndexRef.current) ||
        score >= 0.45
      const needHits = isNextish || source === 'final' ? 1 : 2

      if (holdRef.current?.key === key) {
        holdRef.current.hits += 1
        holdRef.current.score = Math.max(holdRef.current.score, score)
      } else {
        holdRef.current = {
          since: Date.now(),
          key,
          target,
          hits: 1,
          score,
        }
        clearHoldTimer()
      }

      setStatus('heard')
      if (holdRef.current.hits < needHits) return
      if (holdTimerRef.current != null) return

      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null
        if (holdRef.current?.key !== key) return
        if ((holdRef.current?.hits ?? 0) < needHits) return
        if (Date.now() < suppressRef.current) {
          setStatus('suppressed')
          holdRef.current = null
          return
        }
        const now = Date.now()
        if (lastAdvanceAtRef.current > 0) {
          const gap = now - lastAdvanceAtRef.current
          if (gap > 1200 && gap < 90000) {
            cadenceMsRef.current =
              cadenceMsRef.current == null
                ? gap
                : Math.round(cadenceMsRef.current * 0.65 + gap * 0.35)
          }
        }
        lastAdvanceAtRef.current = now
        const { cooldownMs } = timingFromCadence(cadenceMsRef.current)
        setStatus('advancing')
        holdRef.current = null
        stickyHeard = ''
        stickyUntil = 0
        cooldownUntilRef.current = now + cooldownMs
        noteActivity()
        console.info(
          '[auto-advance] goLive',
          key,
          programVisibleRef.current ? 'on-air' : 'return-from-black',
          `cadence=${cadenceMsRef.current ?? '-'}`,
          merged.slice(0, 60),
        )
        onGoLiveRef.current(target)
      }, HOLD_MS)
    }

    function bindRecognizerEvents(session: VoskSession) {
      const rec = session.recognizer as VoskSession['recognizer'] & {
        on: (ev: string, cb: (msg: unknown) => void) => void
      }
      rec.on('partialresult', (message: unknown) => {
        if (cancelled) return
        const partial =
          message && typeof message === 'object' && 'result' in message
            ? (message as { result?: { partial?: unknown } }).result?.partial
            : undefined
        if (typeof partial === 'string' && partial) {
          considerText(partial, 'partial')
        }
      })
      rec.on('result', (message: unknown) => {
        if (cancelled) return
        const text =
          message && typeof message === 'object' && 'result' in message
            ? (message as { result?: { text?: unknown } }).result?.text
            : undefined
        if (typeof text === 'string' && text) {
          considerText(text, 'final')
        }
      })
    }

    async function rebuildSession(sr: number) {
      if (cancelled) return
      if (rebuilding) {
        pendingRebuild = true
        return
      }
      const phrases = grammarPhrasesFromCandidates(
        candidatesRef.current,
        14,
        liveIndexRef.current,
      )
      const nextKey = JSON.stringify(['[unk]', ...phrases])
      if (sessionRef.current?.grammarKey === nextKey) return

      rebuilding = true
      try {
        const model = await ensureVoskModel()
        if (cancelled) return
        sessionRef.current?.dispose()
        sessionRef.current = null
        if (!phrases.length) {
          console.warn('[auto-advance] sem frases na grammar')
          return
        }
        const session = createVoskSession(model, sr, phrases)
        if (cancelled) {
          session.dispose()
          return
        }
        sessionRef.current = session
        bindRecognizerEvents(session)
        console.info(
          '[auto-advance] grammar',
          phrases.length,
          phrases.slice(0, 4),
        )
      } catch (err) {
        console.warn('[auto-advance] rebuild grammar', err)
      } finally {
        rebuilding = false
        if (pendingRebuild && !cancelled) {
          pendingRebuild = false
          void rebuildSession(sr)
        }
      }
    }

    async function start() {
      const constraints = spectrumAudioConstraints(
        'audio-device',
        config.audioDeviceId,
      )
      if (!constraints) {
        setStatus('error')
        setLoadMsg('Sem entrada de áudio')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (err) {
        console.warn('[auto-advance] mic', err)
        setStatus('error')
        setLoadMsg('Mic recusado')
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      ctx = new AudioContext()
      sampleRate = ctx.sampleRate
      const source = ctx.createMediaStreamSource(stream)
      const channel = clampChannelToCount(
        config.channel,
        Math.max(1, source.channelCount || 2),
      )

      const merger = ctx.createChannelMerger(1)
      if (channel === 'mix') {
        const n = Math.max(1, source.channelCount || 2)
        if (n === 1) {
          source.connect(merger, 0, 0)
        } else {
          const splitter = ctx.createChannelSplitter(n)
          const g0 = ctx.createGain()
          const g1 = ctx.createGain()
          g0.gain.value = 0.5
          g1.gain.value = 0.5
          source.connect(splitter)
          splitter.connect(g0, 0)
          splitter.connect(g1, Math.min(1, n - 1))
          g0.connect(merger, 0, 0)
          g1.connect(merger, 0, 0)
        }
      } else {
        const n = Math.max(2, source.channelCount || 2)
        const splitter = ctx.createChannelSplitter(n)
        source.connect(splitter)
        const idx =
          channel === 'l' ? 0 : channel === 'r' ? 1 : Number(channel) || 0
        splitter.connect(merger, Math.min(n - 1, idx), 0)
      }

      await rebuildSession(sampleRate)
      if (cancelled) return

      processor = ctx.createScriptProcessor(4096, 1, 1)
      const silent = ctx.createGain()
      silent.gain.value = 0.00001
      merger.connect(processor)
      processor.connect(silent)
      silent.connect(ctx.destination)

      processor.onaudioprocess = (ev) => {
        if (cancelled || rebuilding) return
        const input = ev.inputBuffer.getChannelData(0)
        let s = 0
        for (let i = 0; i < input.length; i++) s += input[i] * input[i]
        lastEnergy = Math.sqrt(s / input.length)
        // Sempre manda pro Vosk (inclui silêncio) — música lenta precisa do gap
        const session = sessionRef.current
        if (session) acceptAudioBuffer(session, ev.inputBuffer)
      }

      if (ctx.state === 'suspended') await ctx.resume()

      energyTimer = window.setInterval(() => {
        if (lastEnergy < MIN_RMS) {
          silenceTicks += 1
          if (silenceTicks >= SILENCE_TICKS_BEFORE_IDLE) {
            setLastHeard((h) =>
              h.startsWith('(black') ? h : '(silêncio)',
            )
            noteIdle('silence')
          }
        } else {
          silenceTicks = 0
        }
      }, 800)

      // Candidatos mudam (slide) → refresh grammar
      grammarTimerRef.current = window.setInterval(() => {
        if (cancelled || !ctx) return
        void rebuildSession(sampleRate)
      }, GRAMMAR_REFRESH_MS)

      if (!cancelled) {
        setStatus(programVisibleRef.current ? 'listening' : 'cleared')
      }
      console.info(
        '[auto-advance] vosk captura ok',
        'sr',
        sampleRate,
        'ch',
        channel,
        'cands',
        candidatesRef.current.length,
      )
    }

    void start()
    return () => {
      cancelled = true
      clearHoldTimer()
      if (energyTimer != null) window.clearInterval(energyTimer)
      if (grammarTimerRef.current != null) {
        window.clearInterval(grammarTimerRef.current)
        grammarTimerRef.current = null
      }
      sessionRef.current?.dispose()
      sessionRef.current = null
      try {
        processor?.disconnect()
      } catch {
        /* ignore */
      }
      processor = null
      stream?.getTracks().forEach((t) => t.stop())
      if (ctx && ctx.state !== 'closed') void ctx.close()
    }
  }, [
    config.enabled,
    config.audioDeviceId,
    config.channel,
    active,
    modelReady,
  ])

  return { status, lastHeard, loadMsg }
}
