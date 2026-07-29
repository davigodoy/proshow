/** URL segura para o protocolo iblemedia:// (path absoluto no pathname, não no host) */
export function toMediaUrl(filePath?: string | null): string | null {
  if (!filePath) return null
  if (/^(iblemedia|https?|file|blob):/i.test(filePath)) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  const abs = normalized.startsWith('/') ? normalized : `/${normalized}`
  const encoded = abs
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(seg) : ''))
    .join('/')
  return `iblemedia://local${encoded}`
}
