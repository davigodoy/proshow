/**
 * Reparte um texto que não cabe na área do tema em partes navegáveis,
 * marcando a emenda com reticências.
 *
 * Puro de propósito: quem chama decide o que "cabe" (`fits`). No programa
 * isso vem de medição real no DOM; nos testes, de uma regra simples. Assim a
 * regra de corte fica testável sem navegador.
 *
 * Usado tanto pela letra (PREENCHER desligado) quanto pelo versículo longo
 * da Bíblia — é o mesmo problema.
 */

export const ELLIPSIS = '…'

/** Marca visual de continuação no fim da parte anterior. */
export function withTrailingEllipsis(text: string): string {
  return `${text} ${ELLIPSIS}`
}

/** Marca visual de continuação no início da parte seguinte. */
export function withLeadingEllipsis(text: string): string {
  return `${ELLIPSIS} ${text}`
}

/**
 * Onde é aceitável cortar, do melhor para o pior. Quebra de linha vence
 * pontuação, que vence espaço — cortar no meio de uma oração lê pior do que
 * cortar onde o texto já respirava.
 */
const RANK_NEWLINE = 3
const RANK_SENTENCE = 2
const RANK_CLAUSE = 1
const RANK_SPACE = 0

/**
 * Um corte muito mais curto que o máximo desperdiça tela. Só trocamos o corte
 * máximo por um ponto melhor se ele ainda aproveitar esta fração da área.
 */
const MIN_FILL_RATIO = 0.6

type Boundary = { index: number; rank: number }

/** Posições onde o texto pode ser cortado, com a qualidade de cada uma. */
function collectBoundaries(text: string): Boundary[] {
  const out: Boundary[] = []
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\n') {
      out.push({ index: i, rank: RANK_NEWLINE })
      continue
    }
    if (ch !== ' ') continue
    // Olha o caractere anterior não-espaço para classificar a pausa.
    let j = i - 1
    while (j >= 0 && text[j] === ' ') j -= 1
    const prev = j >= 0 ? text[j] : ''
    if (prev === '.' || prev === '!' || prev === '?') {
      out.push({ index: i, rank: RANK_SENTENCE })
    } else if (prev === ',' || prev === ';' || prev === ':') {
      out.push({ index: i, rank: RANK_CLAUSE })
    } else {
      out.push({ index: i, rank: RANK_SPACE })
    }
  }
  return out
}

/** Maior corte que ainda cabe. Busca binária: `fits` pode ser caro (DOM). */
function largestFittingBoundary(
  boundaries: Boundary[],
  fitsCut: (cut: number) => boolean,
): number {
  let lo = 0
  let hi = boundaries.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (fitsCut(boundaries[mid].index)) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/**
 * Entre os cortes que cabem, prefere o de melhor pontuação — desde que não
 * jogue fora boa parte da área disponível.
 */
function chooseBoundary(boundaries: Boundary[], maxIdx: number): Boundary {
  const limit = boundaries[maxIdx]
  const minIndex = limit.index * MIN_FILL_RATIO
  let chosen = limit
  for (let i = maxIdx; i >= 0; i -= 1) {
    const b = boundaries[i]
    if (b.index < minIndex) break
    if (b.rank > chosen.rank) chosen = b
  }
  return chosen
}

/**
 * Reparte `text` em partes que cabem, já com as reticências aplicadas.
 *
 * `fits(candidate)` recebe o texto **como vai aparecer na tela** (com as
 * reticências), para que a marca de continuação não seja o que estoura a área.
 *
 * Devolve `[text]` quando cabe inteiro. Nunca devolve vazio, e nunca entra em
 * laço infinito: se nem o menor trecho couber, entrega o trecho mesmo assim
 * (melhor um slide apertado do que travar o culto).
 */
export function splitTextToFit(
  text: string,
  fits: (candidate: string) => boolean,
): string[] {
  const full = String(text ?? '').trim()
  if (!full) return []
  if (fits(full)) return [full]

  const parts: string[] = []
  let rest = full
  let guard = 0

  while (rest.length) {
    const isFirst = parts.length === 0
    const decorateLast = (s: string) => (isFirst ? s : withLeadingEllipsis(s))
    const decorateMiddle = (s: string) =>
      isFirst ? withTrailingEllipsis(s) : withLeadingEllipsis(withTrailingEllipsis(s))

    // O que sobrou já cabe como parte final? Então acabou.
    if (fits(decorateLast(rest))) {
      parts.push(decorateLast(rest))
      break
    }

    const boundaries = collectBoundaries(rest)
    if (!boundaries.length) {
      // Palavra única maior que a área: entrega assim mesmo.
      parts.push(decorateLast(rest))
      break
    }

    const maxIdx = largestFittingBoundary(boundaries, (cut) =>
      fits(decorateMiddle(rest.slice(0, cut).trimEnd())),
    )

    // Nem o primeiro corte cabe: usa o menor mesmo assim, para progredir.
    const boundary =
      maxIdx < 0 ? boundaries[0] : chooseBoundary(boundaries, maxIdx)

    const head = rest.slice(0, boundary.index).trimEnd()
    const tail = rest.slice(boundary.index).trimStart()

    if (!head || !tail) {
      parts.push(decorateLast(rest))
      break
    }

    parts.push(decorateMiddle(head))
    rest = tail

    guard += 1
    if (guard > 200) {
      // Rede de segurança: nunca deixar o operador preso num laço.
      parts.push(withLeadingEllipsis(rest))
      break
    }
  }

  return parts
}
