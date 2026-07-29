/**
 * Decide se um texto cabe na área do tema, sem montar nada na tela.
 *
 * A lista do operador precisa saber ANTES de projetar em quantas partes uma
 * linha vai ficar. Medir isso montando cada candidato no palco causaria
 * recálculo de layout a cada tecla; `canvas.measureText` responde a mesma
 * pergunta sem tocar no DOM.
 *
 * Só serve ao modo fixo, onde o tamanho da fonte é conhecido de antemão
 * (vw da largura do quadro). Nos outros modos o texto encolhe para caber, e
 * portanto sempre "cabe".
 */

const canvas =
  typeof document !== 'undefined' ? document.createElement('canvas') : null
const ctx = canvas ? canvas.getContext('2d') : null

export type FitMetrics = {
  /** Tamanho da fonte já resolvido, em px. */
  fontPx: number
  fontFamily: string
  fontWeight: number
  letterSpacingEm: number
  lineHeight: number
  /** Área útil de texto, em px. */
  maxWidth: number
  maxHeight: number
  /**
   * Teto de linhas por slide escolhido no tema. `0` = ilimitado (só a altura
   * da área manda). `1` = uma linha, sem quebra.
   */
  maxLines: number
  uppercase: boolean
}

function applyCase(text: string, uppercase: boolean): string {
  return uppercase ? text.toLocaleUpperCase('pt-BR') : text
}

/**
 * Largura do texto. `letter-spacing` não existe no canvas em todos os
 * motores, então entra somado: um espaçamento por caractere.
 */
function textWidth(text: string, m: FitMetrics): number {
  if (!ctx) return 0
  ctx.font = `${m.fontWeight} ${m.fontPx}px ${m.fontFamily}`
  const base = ctx.measureText(text).width
  const tracking = m.letterSpacingEm * m.fontPx * text.length
  return base + tracking
}

/** Quebra gulosa, igual à do navegador para texto simples. */
function wrapCount(text: string, m: FitMetrics): number {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  let lines = 1
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (textWidth(candidate, m) <= m.maxWidth || !current) {
      current = candidate
    } else {
      lines += 1
      current = word
    }
  }
  return lines
}

/**
 * Cria o predicado usado pelo repartidor. Cada `\n` do texto é uma quebra
 * obrigatória — é assim que uma estrofe com várias linhas se comporta.
 */
export function createFitPredicate(m: FitMetrics): (text: string) => boolean {
  if (!ctx || m.maxWidth <= 0 || m.maxHeight <= 0) {
    // Sem como medir: não reparte nada, em vez de repartir errado.
    return () => true
  }
  const lineBoxPx = m.fontPx * (m.lineHeight || 1.2)
  // A altura da área é sempre um teto; o tema pode apertar mais que isso,
  // nunca afrouxar — texto além da área não seria lido de qualquer jeito.
  const fromArea = Math.max(1, Math.floor(m.maxHeight / lineBoxPx))
  const fromTheme = m.maxLines > 0 ? m.maxLines : Number.POSITIVE_INFINITY
  const maxLines = Math.min(fromArea, fromTheme)
  const wrap = m.maxLines !== 1

  return (raw: string) => {
    const text = applyCase(String(raw ?? ''), m.uppercase)
    const hardLines = text.split('\n')

    if (!wrap) {
      // Uma linha só: tem de caber na largura, sem quebrar.
      if (hardLines.length > 1) return false
      return textWidth(text, m) <= m.maxWidth
    }

    let total = 0
    for (const line of hardLines) {
      total += wrapCount(line, m)
      if (total > maxLines) return false
    }
    return true
  }
}

/** Tamanho fixo do tema convertido para px, dada a largura do quadro. */
export function fixedFontPx(stageWidth: number, lyricSizeVw: number): number {
  return (Math.max(1, stageWidth) * lyricSizeVw) / 100
}
