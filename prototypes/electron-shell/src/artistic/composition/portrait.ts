export type PortraitWord = { text: string; keyword: boolean }
export type PortraitConstraints = { maxLines: number; maxWordChars: number }

/**
 * Conectores curtos (pt-BR). Copiado de `theme/artisticLayout` de propósito:
 * portrait.ts é importado por artisticLayout, então importar de volta criaria
 * um ciclo. Mantidos em sincronia manualmente (lista pequena e estável).
 */
const SHORT_CONNECTORS = new Set([
  'a',
  'à',
  'ao',
  'aos',
  'às',
  'as',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'já',
  'lhe',
  'mas',
  'me',
  'meu',
  'na',
  'nas',
  'nem',
  'no',
  'nos',
  'num',
  'numa',
  'o',
  'os',
  'ou',
  'para',
  'pela',
  'pelas',
  'pelo',
  'pelos',
  'por',
  'pra',
  'que',
  'se',
  'sem',
  'seu',
  'só',
  'sua',
  'te',
  'teu',
  'tua',
  'um',
  'uma',
])

function normalizedToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function isShortConnector(text: string): boolean {
  return SHORT_CONNECTORS.has(normalizedToken(text))
}

/** Conta letras (ignora pontuação) após normalizar. */
function letterCount(text: string): number {
  const token = normalizedToken(text).normalize('NFC')
  return (token.match(/\p{L}/gu) || []).length
}

/**
 * Reagrupa palavras para uma COLUNA-RETRATO: uma palavra de conteúdo por linha,
 * legível na horizontal (NÃO gira glifos 90°). Conectores curtos ("de", "e",
 * "na"…) colam na palavra seguinte; conectores no fim colam na palavra anterior.
 */
export function regroupPortraitLines(words: PortraitWord[]): PortraitWord[][] {
  const lines: PortraitWord[][] = []
  let pendingConnectors: PortraitWord[] = []

  for (const word of words) {
    if (!word.keyword && isShortConnector(word.text)) {
      pendingConnectors.push(word)
      continue
    }
    lines.push([...pendingConnectors, word])
    pendingConnectors = []
  }

  if (pendingConnectors.length) {
    if (lines.length) {
      lines[lines.length - 1].push(...pendingConnectors)
    } else {
      lines.push(pendingConnectors)
    }
  }

  return lines
}

function splitPhraseWords(phrase: string): PortraitWord[] {
  return phrase
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, keyword: false }))
}

/**
 * Uma frase cabe na coluna-retrato? Rejeita palavras muito compridas (não cabem
 * na coluna estreita) e frases com mais linhas de conteúdo do que o permitido.
 */
export function portraitFeasible(
  phrase: string,
  constraints: PortraitConstraints,
): boolean {
  const words = splitPhraseWords(phrase)
  if (!words.length) return false

  const longestWord = Math.max(...words.map((word) => letterCount(word.text)))
  if (longestWord > constraints.maxWordChars) return false

  const lines = regroupPortraitLines(words)
  if (lines.length < 1 || lines.length > constraints.maxLines) return false

  return true
}

/**
 * Escala do bloco em modo retrato. Keyword tem teto ~1.3 (a coluna é estreita:
 * keywords gigantes estourariam a largura). Retorna determinístico dado `rng`.
 */
export function portraitBlockScale(
  keyword: boolean,
  rng: () => number,
): number {
  if (keyword) {
    return Math.round(Math.min(1.3, 1.12 + rng() * 0.2) * 100) / 100
  }
  return Math.round((0.82 + rng() * 0.1) * 100) / 100
}
