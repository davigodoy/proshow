import type { AutoAdvanceConfig } from './types'
import type { AutoAdvanceStatus } from './useAutoAdvance'

type Props = {
  value: AutoAdvanceConfig
  onChange: (next: AutoAdvanceConfig) => void
  status: AutoAdvanceStatus
  lastHeard?: string
  loadMsg?: string
}

/** Público: controle oculto até o Auto ser validado ao vivo. */
export function AutoAdvanceControls(_props: Props) {
  return null
}
