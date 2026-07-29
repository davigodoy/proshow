import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './output-safe-area.css'

export type SafeAreaInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

export const DEFAULT_SAFE_AREA: SafeAreaInsets = {
  top: 6,
  right: 6,
  bottom: 6,
  left: 6,
}

type Props = {
  aspect: number
  value: SafeAreaInsets
  onChange: (next: SafeAreaInsets) => void
  /** Persistência ao soltar o handle */
  onCommit?: (next: SafeAreaInsets) => void
  label?: string
  /** Nome da região interna — a margem da saída delimita a projeção, não o texto. */
  innerLabel?: string
}

type Edge = 'n' | 's' | 'e' | 'w'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function normalize(v: SafeAreaInsets): SafeAreaInsets {
  const top = clamp(v.top, 0, 40)
  const bottom = clamp(v.bottom, 0, 40)
  const left = clamp(v.left, 0, 40)
  const right = clamp(v.right, 0, 40)
  // Garante área útil mínima (~20%)
  const maxTB = Math.max(0, 80 - top)
  const maxLR = Math.max(0, 80 - left)
  return {
    top,
    bottom: clamp(bottom, 0, maxTB),
    left,
    right: clamp(right, 0, maxLR),
  }
}

/** Quadro com proporção do monitor + área interna arrastável (margens %). */
export function OutputSafeAreaEditor({
  aspect,
  value,
  onChange,
  onCommit,
  label,
  innerLabel = 'Área da projeção',
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value
  const [dragging, setDragging] = useState<Edge | null>(null)

  const startDrag = useCallback(
    (edge: Edge, e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const frame = frameRef.current
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      setDragging(edge)
      let latest = valueRef.current

      const onMove = (ev: PointerEvent) => {
        const cur = valueRef.current
        const x = ((ev.clientX - rect.left) / rect.width) * 100
        const y = ((ev.clientY - rect.top) / rect.height) * 100
        latest = normalize({
          ...cur,
          top: edge === 'n' ? y : cur.top,
          bottom: edge === 's' ? 100 - y : cur.bottom,
          left: edge === 'w' ? x : cur.left,
          right: edge === 'e' ? 100 - x : cur.right,
        })
        onChange(latest)
      }
      const onUp = () => {
        setDragging(null)
        onCommit?.(latest)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onChange, onCommit],
  )

  const innerStyle = {
    top: `${value.top}%`,
    right: `${value.right}%`,
    bottom: `${value.bottom}%`,
    left: `${value.left}%`,
  }

  return (
    <div className="safe-area-editor">
      {label ? <p className="hint">{label}</p> : null}
      <div
        ref={frameRef}
        className={`safe-area-frame ${dragging ? 'is-dragging' : ''}`}
        style={{ aspectRatio: `${aspect}` }}
      >
        <div className="safe-area-screen-label">Monitor</div>
        <div className="safe-area-inner" style={innerStyle}>
          <span className="safe-area-inner-label">{innerLabel}</span>
          <button
            type="button"
            className="safe-area-handle n"
            aria-label="Margem superior"
            onPointerDown={(e) => startDrag('n', e)}
          />
          <button
            type="button"
            className="safe-area-handle s"
            aria-label="Margem inferior"
            onPointerDown={(e) => startDrag('s', e)}
          />
          <button
            type="button"
            className="safe-area-handle e"
            aria-label="Margem direita"
            onPointerDown={(e) => startDrag('e', e)}
          />
          <button
            type="button"
            className="safe-area-handle w"
            aria-label="Margem esquerda"
            onPointerDown={(e) => startDrag('w', e)}
          />
        </div>
      </div>
      <div className="safe-area-readout">
        <span>↑ {value.top.toFixed(0)}%</span>
        <span>→ {value.right.toFixed(0)}%</span>
        <span>↓ {value.bottom.toFixed(0)}%</span>
        <span>← {value.left.toFixed(0)}%</span>
      </div>
    </div>
  )
}
