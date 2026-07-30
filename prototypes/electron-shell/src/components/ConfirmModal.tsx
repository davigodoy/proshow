import { useEffect, useRef } from 'react'

type Props = {
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Botão de confirmação em vermelho (ação destrutiva). */
  danger?: boolean
  /** Classes extras no backdrop (ex.: z-index acima de outro modal). */
  backdropClassName?: string
  onConfirm: () => void
  onCancel: () => void
}

function trapTabWithin(e: React.KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== 'Tab' || !container) return
  const focusables = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  if (!focusables.length) return
  e.preventDefault()
  const list = Array.from(focusables)
  const idx = list.indexOf(document.activeElement as HTMLElement)
  const next = e.shiftKey
    ? idx <= 0
      ? list.length - 1
      : idx - 1
    : idx === -1 || idx === list.length - 1
      ? 0
      : idx + 1
  list[next]?.focus()
}

/**
 * Mesma tela de confirmação do operador (ex.: remover do plano do culto):
 * `.modal-backdrop` + `.modal` + `.modal-actions`.
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  backdropClassName,
  onConfirm,
  onCancel,
}: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    return () => {
      prev?.focus?.()
    }
  }, [])

  return (
    <div
      className={['modal-backdrop', backdropClassName].filter(Boolean).join(' ')}
      role="presentation"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
          return
        }
        trapTabWithin(e, modalRef.current)
      }}
    >
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title">{title}</h2>
        <p id="confirm-modal-desc">{message}</p>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'primary danger' : 'primary'}
            autoFocus
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
