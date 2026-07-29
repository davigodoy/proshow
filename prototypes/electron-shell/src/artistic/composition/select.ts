import { COMPOSITION_TEMPLATES } from './templates.ts'
import { portraitFeasible } from './portrait.ts'
import type { CompositionTemplate } from './types.ts'

const DEFAULT_PORTRAIT_CONSTRAINTS = { maxLines: 6, maxWordChars: 12 }

/** Conectores curtos (pt-BR) — usados só para contar palavras de conteúdo. */
const SHORT_CONNECTORS = new Set([
  'a', 'à', 'ao', 'aos', 'às', 'as', 'com', 'da', 'das', 'de', 'do', 'dos',
  'e', 'em', 'já', 'lhe', 'mas', 'me', 'meu', 'na', 'nas', 'nem', 'no', 'nos',
  'num', 'numa', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos',
  'por', 'pra', 'que', 'se', 'sem', 'seu', 'só', 'sua', 'te', 'teu', 'tua',
  'um', 'uma',
])

function normalizedToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

/** Palavras de conteúdo (ignora conectores curtos). */
function contentWordCount(phrase: string): number {
  return phrase
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !SHORT_CONNECTORS.has(normalizedToken(word))).length
}

/**
 * Uma frase é "curta" o bastante para coluna-retrato: poucas palavras de
 * conteúdo E viável (nenhuma palavra longa demais). Manter isto restrito
 * preserva as ARTISTIC_VARIATIONS como fonte da verdade da maioria dos
 * layouts — os templates de composição são aditivos.
 */
export function isShortSupport(phrase: string): boolean {
  if (!phrase) return false
  if (contentWordCount(phrase) > 2) return false
  return portraitFeasible(phrase, DEFAULT_PORTRAIT_CONSTRAINTS)
}

/**
 * Escolhe um template de composição (corner yield) de forma determinística pela
 * seed, ou retorna null para que o chamador use a grammar legada.
 *
 * Regra: só tenta corner templates quando `preferCornerYield` OU (fase ≥ 2 e
 * alguma frase do mosaico é curta). O gate olha o conjunto inteiro — assim o
 * promote (frase curta vira herói) mantém o mesmo template e o herói volta à
 * região original. A viabilidade da coluna ainda valida `phrases[0]` (apoio).
 */
export function selectCompositionTemplate(input: {
  seed: number
  phase: number
  phrases: string[]
  preferCornerYield?: boolean
}): CompositionTemplate | null {
  const { seed, phase, phrases, preferCornerYield } = input
  const supportPhrase = phrases[0] || ''

  const anyShort = phrases.some((phrase) => isShortSupport(phrase))
  const gate = preferCornerYield || (phase >= 2 && anyShort)
  if (!gate) return null

  // A frase de apoio precisa caber na coluna-retrato do template escolhido.
  const count = COMPOSITION_TEMPLATES.length
  const start = (seed >>> 0) % count
  for (let i = 0; i < count; i += 1) {
    const template = COMPOSITION_TEMPLATES[(start + i) % count]
    const constraints =
      template.portraitConstraints ?? DEFAULT_PORTRAIT_CONSTRAINTS
    if (portraitFeasible(supportPhrase, constraints)) {
      return template
    }
  }

  return null
}
