import { useEffect, useRef, useState } from 'react'
import type { AutoAdvanceConfig, AutoAdvanceChannel } from './types'
import type { AutoAdvanceStatus } from './useAutoAdvance'
import {
  channelOptionsForCount,
  clampChannelToCount,
  invalidateChannelProbeCache,
  probeDeviceChannelCount,
} from '../spectrum/probeChannels'
import './auto-advance.css'

type Props = {
  value: AutoAdvanceConfig
  onChange: (next: AutoAdvanceConfig) => void
  status: AutoAdvanceStatus
  lastHeard?: string
  loadMsg?: string
}

type AudioDev = { deviceId: string; label: string }

export function AutoAdvanceControls({
  value,
  onChange,
  status,
  lastHeard = '',
  loadMsg = '',
}: Props) {
  const [devices, setDevices] = useState<AudioDev[]>([])
  const [channelCount, setChannelCount] = useState<number | null>(null)
  const [probeBusy, setProbeBusy] = useState(false)
  const [channelMenuOpen, setChannelMenuOpen] = useState(false)
  const channelMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!value.enabled) {
      setDevices([])
      return
    }
    let cancelled = false
    async function load() {
      try {
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((s) => s.getTracks().forEach((t) => t.stop()))
          .catch(() => undefined)
        const list = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setDevices(
          list
            .filter((d) => d.kind === 'audioinput')
            .map((d) => ({
              deviceId: d.deviceId,
              label: d.label || `Áudio ${d.deviceId.slice(0, 6)}`,
            })),
        )
      } catch {
        if (!cancelled) setDevices([])
      }
    }
    void load()
    const onDev = () => {
      invalidateChannelProbeCache()
      void load()
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', onDev)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDev)
    }
  }, [value.enabled])

  useEffect(() => {
    let cancelled = false
    async function probe() {
      setProbeBusy(true)
      try {
        const result = await probeDeviceChannelCount({
          source: 'audio-device',
          audioDeviceId: value.audioDeviceId,
        })
        if (cancelled) return
        setChannelCount(result.channelCount)
        const clamped = clampChannelToCount(value.channel, result.channelCount)
        if (clamped !== value.channel) {
          onChange({ ...value, channel: clamped })
        }
      } finally {
        if (!cancelled) setProbeBusy(false)
      }
    }
    void probe()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.audioDeviceId, value.enabled])

  useEffect(() => {
    if (!channelMenuOpen) return
    function onDoc(e: MouseEvent) {
      if (!channelMenuRef.current?.contains(e.target as Node)) {
        setChannelMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [channelMenuOpen])

  function patch(partial: Partial<AutoAdvanceConfig>) {
    onChange({ ...value, ...partial })
  }

  const channelOpts = channelOptionsForCount(channelCount ?? 2)
  const channelLabel =
    channelOpts.find((o) =>
      typeof value.channel === 'number'
        ? o.value === String(value.channel)
        : o.value === value.channel,
    )?.label || 'Mix'

  const heardSnippet =
    lastHeard && lastHeard !== '(silêncio)'
      ? lastHeard.length > 42
        ? `${lastHeard.slice(0, 40)}…`
        : lastHeard
      : ''
  const statusHint =
    status === 'loading'
      ? loadMsg || 'vosk…'
      : status === 'waiting'
        ? 'aguardando ao vivo…'
        : status === 'listening'
          ? heardSnippet
            ? heardSnippet
            : lastHeard === '(silêncio)'
              ? 'silêncio'
              : 'ouvindo…'
          : status === 'heard'
            ? heardSnippet
              ? `match · ${heardSnippet}`
              : 'próxima…'
            : status === 'advancing'
              ? 'avançando…'
              : status === 'cleared'
                ? heardSnippet
                  ? `retorno · ${heardSnippet}`
                  : 'black · ouvindo'
                : status === 'suppressed'
                  ? 'pausa (tecla)'
                  : status === 'error'
                    ? loadMsg || 'erro'
                    : ''
  const statusBad = status === 'error' || status === 'cleared'

  const tip = lastHeard
    ? `Ouviu (Vosk): ${lastHeard}`
    : loadMsg
      ? loadMsg
      : status === 'loading'
        ? 'Baixando/carregando Vosk PT (1ª vez ~30MB). Depois usa cache do browser.'
        : status === 'waiting'
          ? 'Manda uma letra/bíblia ao ar pra começar a ouvir.'
          : status === 'cleared'
            ? 'BLACK (solo/silêncio) — continua ouvindo pra voltar ao ar no próximo match.'
            : status === 'error'
              ? loadMsg || 'Falha no Vosk / mic'
              : 'Auto: Vosk (grammar das aberturas) × próximas linhas do plano'

  return (
    <div
      className={`auto-advance-controls${value.enabled ? ' is-on' : ''}`}
      title={tip}
    >
      <div className="auto-advance-row">
        <label className="auto-advance-toggle">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          <strong>Auto</strong>
        </label>

        <select
          className="auto-advance-select"
          value={value.audioDeviceId || ''}
          disabled={!value.enabled}
          title={
            devices.find((d) => d.deviceId === value.audioDeviceId)?.label ||
            'Entrada de áudio do Auto (Whisper local)'
          }
          onChange={(e) => {
            invalidateChannelProbeCache()
            setChannelMenuOpen(false)
            patch({
              audioDeviceId: e.target.value || null,
              channel: 'mix',
            })
          }}
        >
          <option value="">Mic sistema</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>

        <div
          className={`auto-advance-channel-menu${channelMenuOpen ? ' open' : ''}`}
          ref={channelMenuRef}
        >
          <button
            type="button"
            className="auto-advance-channel-toggle"
            disabled={!value.enabled || probeBusy || channelCount == null}
            title={`Canal: ${channelLabel}`}
            aria-label={`Canal: ${channelLabel}`}
            aria-haspopup="true"
            aria-expanded={channelMenuOpen}
            onClick={() => setChannelMenuOpen((o) => !o)}
          >
            ▾
          </button>
          {channelMenuOpen ? (
            <div className="auto-advance-channel-list" role="menu">
              {channelOpts.map((o) => {
                const selected =
                  typeof value.channel === 'number'
                    ? o.value === String(value.channel)
                    : o.value === value.channel
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={selected ? 'on' : ''}
                    onClick={() => {
                      const v = o.value
                      let channel: AutoAdvanceChannel = 'mix'
                      if (v === 'l' || v === 'r' || v === 'mix') channel = v
                      else channel = parseInt(v, 10)
                      patch({ channel })
                      setChannelMenuOpen(false)
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      {value.enabled && statusHint ? (
        <span
          className={`auto-advance-status${statusBad ? ' is-bad' : ''}`}
        >
          {statusHint}
        </span>
      ) : null}
    </div>
  )
}
