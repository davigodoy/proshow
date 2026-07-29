import { useEffect, useRef, useState } from 'react'
import {
  SPECTRUM_STYLES,
  type SpectrumConfig,
  type SpectrumStyleId,
  type SpectrumPlacement,
  type SpectrumSource,
  type SpectrumChannel,
} from './types'
import {
  channelOptionsForCount,
  clampChannelToCount,
  invalidateChannelProbeCache,
  probeDeviceChannelCount,
} from './probeChannels'
import './spectrum-controls.css'

type Props = {
  value: SpectrumConfig
  onChange: (next: SpectrumConfig) => void
  cameraDeviceId?: string | null
  mediaLive?: boolean
}

type AudioDev = { deviceId: string; label: string }

const MONITOR_SECONDS = 10

export function SpectrumControls({
  value,
  onChange,
  cameraDeviceId,
  mediaLive,
}: Props) {
  const [devices, setDevices] = useState<AudioDev[]>([])
  const [channelCount, setChannelCount] = useState<number | null>(null)
  const [probeBusy, setProbeBusy] = useState(false)
  const [channelMenuOpen, setChannelMenuOpen] = useState(false)
  const [monitorLeft, setMonitorLeft] = useState<number | null>(null)
  const channelMenuRef = useRef<HTMLDivElement>(null)
  const monitorTimerRef = useRef<number | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  valueRef.current = value
  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((s) => {
            s.getTracks().forEach((t) => t.stop())
          })
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
    const onChangeDev = () => {
      invalidateChannelProbeCache()
      void load()
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', onChangeDev)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChangeDev)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function probe() {
      if (!value.enabled) {
        setChannelCount(null)
        return
      }
      if (value.source === 'media') {
        setChannelCount(2)
        return
      }
      if (value.source === 'camera' && !cameraDeviceId) {
        setChannelCount(null)
        return
      }
      setProbeBusy(true)
      try {
        const result = await probeDeviceChannelCount({
          source: value.source === 'camera' ? 'camera' : 'audio-device',
          audioDeviceId: value.audioDeviceId,
          cameraDeviceId,
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
  }, [value.enabled, value.source, value.audioDeviceId, cameraDeviceId])

  // Fecha menu de canais ao clicar fora
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

  // Countdown "Monitorar áudio"
  useEffect(() => {
    if (monitorTimerRef.current != null) {
      window.clearInterval(monitorTimerRef.current)
      monitorTimerRef.current = null
    }
    if (!value.monitorAudio) {
      setMonitorLeft(null)
      return
    }
    setMonitorLeft(MONITOR_SECONDS)
    monitorTimerRef.current = window.setInterval(() => {
      setMonitorLeft((prev) => {
        if (prev == null) return null
        if (prev <= 1) {
          if (monitorTimerRef.current != null) {
            window.clearInterval(monitorTimerRef.current)
            monitorTimerRef.current = null
          }
          onChangeRef.current({
            ...valueRef.current,
            monitorAudio: false,
          })
          return null
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (monitorTimerRef.current != null) {
        window.clearInterval(monitorTimerRef.current)
        monitorTimerRef.current = null
      }
    }
  }, [value.monitorAudio])

  function patch(partial: Partial<SpectrumConfig>) {
    onChange({ ...value, ...partial })
  }

  const channelOpts = channelOptionsForCount(channelCount ?? 2)
  const channelLabel =
    channelOpts.find((o) =>
      typeof value.channel === 'number'
        ? o.value === String(value.channel)
        : o.value === value.channel,
    )?.label || 'Mix'

  const deviceLabel =
    value.source === 'camera'
      ? cameraDeviceId
        ? 'Câmera no ar'
        : 'Sem câmera'
      : value.source === 'media'
        ? mediaLive
          ? 'Mídia no ar'
          : 'Sem mídia'
        : devices.find((d) => d.deviceId === value.audioDeviceId)?.label ||
          (value.audioDeviceId ? 'Dispositivo' : 'Padrão do sistema')

  return (
    <div className={`spectrum-controls${value.enabled ? ' is-on' : ''}`}>
      {/* Linha 1: check · posição · tipo */}
      <div className="spectrum-row spectrum-row-main">
        <label className="spectrum-toggle">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          <strong>Espectro</strong>
        </label>
        <select
          className="spectrum-select spectrum-grow"
          value={value.placement}
          disabled={!value.enabled}
          title="Posição"
          onChange={(e) =>
            patch({ placement: e.target.value as SpectrumPlacement })
          }
        >
          <option value="background">Fundo</option>
          <option value="hud">Barra inferior</option>
        </select>
        <select
          className="spectrum-select spectrum-grow"
          value={value.style}
          disabled={!value.enabled}
          title="Tipo"
          onChange={(e) =>
            patch({ style: e.target.value as SpectrumStyleId })
          }
        >
          {SPECTRUM_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Linha 2: opacidade full */}
      <label
        className={`spectrum-opacity-row${!value.enabled ? ' is-disabled' : ''}`}
      >
        <span>Opacidade {Math.round(value.opacity * 100)}%</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          disabled={!value.enabled}
          value={value.opacity}
          onChange={(e) => patch({ opacity: Number(e.target.value) })}
        />
      </label>

      {/* Linha 3: fonte + device + seta de canais */}
      <div
        className={`spectrum-device-row${!value.enabled ? ' is-disabled' : ''}`}
      >
        <select
          className="spectrum-select spectrum-source"
          value={value.source}
          disabled={!value.enabled}
          title="Fonte de áudio"
          onChange={(e) => {
            invalidateChannelProbeCache()
            patch({
              source: e.target.value as SpectrumSource,
              channel: 'mix',
            })
          }}
        >
          <option value="audio-device">Entrada</option>
          <option value="camera">Câmera</option>
          <option value="media">Mídia</option>
        </select>

        {value.source === 'audio-device' ? (
          <select
            className="spectrum-select spectrum-grow"
            value={value.audioDeviceId || ''}
            disabled={!value.enabled}
            title="Dispositivo de entrada"
            onChange={(e) => {
              invalidateChannelProbeCache()
              setChannelMenuOpen(false)
              patch({
                audioDeviceId: e.target.value || null,
                channel: 'mix',
              })
            }}
          >
            <option value="">Padrão do sistema</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="spectrum-device-label spectrum-grow" title={deviceLabel}>
            {deviceLabel}
          </span>
        )}

        <div
          className={`spectrum-channel-menu${channelMenuOpen ? ' open' : ''}`}
          ref={channelMenuRef}
        >
          <button
            type="button"
            className="spectrum-channel-toggle"
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
            <div className="spectrum-channel-list" role="menu">
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
                      let channel: SpectrumChannel = 'mix'
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

      {/* Monitorar áudio — auto-off 10s */}
      <label
        className={`spectrum-monitor${!value.enabled ? ' is-disabled' : ''}`}
        title="Desliga sozinho em 10s para evitar loop com a mesa"
      >
        <input
          type="checkbox"
          checked={value.monitorAudio}
          disabled={!value.enabled}
          onChange={(e) => patch({ monitorAudio: e.target.checked })}
        />
        <span>
          Monitorar áudio
          {monitorLeft != null ? (
            <em className="spectrum-countdown"> · {monitorLeft}s</em>
          ) : (
            <em className="spectrum-countdown-hint"> · auto 10s</em>
          )}
        </span>
      </label>
    </div>
  )
}
