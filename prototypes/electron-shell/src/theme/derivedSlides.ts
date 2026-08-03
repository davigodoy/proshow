/**
 * Slides derivados: o que o operador realmente navega.
 *
 * Mudança de premissa do projeto. Antes, cada linha escrita era exatamente um
 * slide. Com o modo fixo, uma linha que não cabe vira duas ou três partes —
 * então "slide" passa a ser algo calculado a partir do texto MAIS o tema.
 *
 * Cada parte é um slide de primeira classe: aparece na lista, aceita preview e
 * vai ao vivo como qualquer outra. Trocar o tema recalcula tudo.
 *
 * Guarda também de qual linha original cada parte veio, porque os estilos por
 * frase (`phraseStyles`) continuam indexados pelo texto que o operador
 * escreveu, não pelas partes que o tema gerou.
 */

import { splitTextToFit } from './splitText.ts'

export type DerivedSlides = {
  /** Texto de cada slide, já com as reticências da emenda. */
  lines: string[]
  /** Para cada slide, o índice da linha original que o gerou. */
  sourceIndex: number[]
  /** Posição da parte dentro da linha original (1-based) e o total. */
  part: number[]
  partTotal: number[]
}

/** Passagem direta: nenhuma linha é repartida. */
export function identityDerived(lines: readonly string[]): DerivedSlides {
  const out: DerivedSlides = { lines: [], sourceIndex: [], part: [], partTotal: [] }
  lines.forEach((line, i) => {
    out.lines.push(line)
    out.sourceIndex.push(i)
    out.part.push(1)
    out.partTotal.push(1)
  })
  return out
}

/**
 * Reparte as linhas que não cabem.
 *
 * `fits` mede uma linha candidata já como ela vai aparecer. Quando `enabled`
 * é falso (PREENCHER ligado ou tema legado), nada é repartido — esses modos
 * encolhem o texto, como sempre fizeram.
 */
export function deriveSlides(
  lines: readonly string[],
  fits: (candidate: string) => boolean,
  enabled: boolean,
): DerivedSlides {
  if (!enabled) return identityDerived(lines)

  const out: DerivedSlides = { lines: [], sourceIndex: [], part: [], partTotal: [] }
  lines.forEach((line, i) => {
    const parts = splitTextToFit(line, fits)
    // Linha vazia não some do plano: continua existindo como slide.
    const safe = parts.length ? parts : [line]
    safe.forEach((text, p) => {
      out.lines.push(text)
      out.sourceIndex.push(i)
      out.part.push(p + 1)
      out.partTotal.push(safe.length)
    })
  })
  return out
}

/** Rótulo de posição para a lista do operador ("parte 2 de 3"). */
export function partLabel(derived: DerivedSlides, index: number): string | null {
  const total = derived.partTotal[index]
  if (!total || total < 2) return null
  return `parte ${derived.part[index]} de ${total}`
}

/**
 * Primeiro slide derivado de uma linha original — usado para manter a posição
 * do operador quando o tema muda e a quantidade de partes muda junto.
 */
export function firstSlideOfSource(
  derived: DerivedSlides,
  sourceIndex: number,
): number {
  const found = derived.sourceIndex.indexOf(sourceIndex)
  return found >= 0 ? found : 0
}

/**
 * Reposiciona o operador após um recálculo: mantém a linha original e, quando
 * possível, a mesma parte dentro dela. Sem isso, trocar o tema jogaria o
 * cursor para um slide sem relação com o que estava selecionado.
 */
export function remapIndex(
  before: DerivedSlides,
  after: DerivedSlides,
  index: number,
): number {
  if (!before.lines.length || !after.lines.length) return 0
  const clamped = Math.min(Math.max(0, index), before.lines.length - 1)
  const source = before.sourceIndex[clamped] ?? 0
  const part = before.part[clamped] ?? 1

  const first = after.sourceIndex.indexOf(source)
  if (first < 0) return Math.min(clamped, after.lines.length - 1)

  const total = after.partTotal[first] ?? 1
  return first + Math.min(part, total) - 1
}
