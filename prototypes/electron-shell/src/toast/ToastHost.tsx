import { useEffect, useState } from 'react'
import {
  dismissToast,
  subscribeToasts,
  TOAST_ALERT_MS,
  TOAST_INFO_MS,
  type ToastItem,
} from './toast'
import './toast.css'

function ToastCard({ item }: { item: ToastItem }) {
  useEffect(() => {
    const ms = item.kind === 'info' ? TOAST_INFO_MS : TOAST_ALERT_MS
    const t = window.setTimeout(() => dismissToast(item.id), ms)
    return () => window.clearTimeout(t)
  }, [item.id, item.kind])

  return (
    <div
      className={`toast toast-${item.kind}`}
      role={item.kind === 'info' ? 'alertdialog' : 'status'}
      aria-live={item.kind === 'info' ? 'assertive' : 'polite'}
    >
      <p className="toast-message">{item.message}</p>
      <button
        type="button"
        className="toast-close"
        aria-label="Fechar"
        onClick={() => dismissToast(item.id)}
      >
        ×
      </button>
    </div>
  )
}

/** Host global de toasts (canto superior direito). */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => subscribeToasts(setItems), [])

  if (!items.length) return null

  return (
    <div className="toast-host" aria-label="Notificações">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  )
}
