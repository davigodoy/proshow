export type ToastKind = 'info' | 'alert'

export type ToastItem = {
  id: string
  kind: ToastKind
  message: string
}

type Listener = (items: ToastItem[]) => void

let items: ToastItem[] = []
const listeners = new Set<Listener>()
let seq = 0

function emit() {
  const snap = items.slice()
  listeners.forEach((fn) => fn(snap))
}

function push(kind: ToastKind, message: string): string {
  const msg = String(message || '').trim()
  if (!msg) return ''
  const id = `t-${Date.now()}-${++seq}`
  items = [...items, { id, kind, message: msg }]
  emit()
  return id
}

/** Aviso / erro — some sozinho (um pouco mais tempo). */
export function toastInfo(message: string): string {
  return push('info', message)
}

/** Feedback rápido (sucesso) — some sozinho. */
export function toastAlert(message: string): string {
  return push('alert', message)
}

export function dismissToast(id: string) {
  const next = items.filter((t) => t.id !== id)
  if (next.length === items.length) return
  items = next
  emit()
}

export function clearToasts() {
  if (!items.length) return
  items = []
  emit()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener(items.slice())
  return () => {
    listeners.delete(listener)
  }
}

/** Sucesso / feedback (ms). */
export const TOAST_ALERT_MS = 3500
/** Aviso / erro (ms). */
export const TOAST_INFO_MS = 5200
