/**
 * Motor Vosk (vocabulário fechado): carrega modelo PT + reconhecedor com grammar.
 */

// UMD — Vite não expõe named ESM limpo
import * as VoskNS from 'vosk-browser'
import type { Model, KaldiRecognizer } from 'vosk-browser'

type VoskApi = {
  createModel: (url: string, logLevel?: number) => Promise<Model>
  Model: unknown
}

const Vosk = (
  (VoskNS as { default?: VoskApi }).default ??
  (VoskNS as unknown as VoskApi)
)

/** Modelo pequeno PT já empacotado pro vosk-browser (CORS ok). */
export const VOSK_PT_MODEL_URL =
  'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-pt-0.3.tar.gz'

export type VoskLoadProgress = (msg: string, pct: number | null) => void

let modelPromise: Promise<Model> | null = null
let modelInstance: Model | null = null
let lastError: string | null = null

export function getVoskLoadError(): string | null {
  return lastError
}

export function ensureVoskModel(
  onProgress?: VoskLoadProgress,
): Promise<Model> {
  if (modelInstance?.ready) return Promise.resolve(modelInstance)
  if (modelPromise) return modelPromise

  lastError = null
  onProgress?.('Baixando Vosk PT…', 5)
  modelPromise = (async () => {
    try {
      if (typeof Vosk.createModel !== 'function') {
        throw new Error('vosk-browser: createModel indisponível (import UMD)')
      }
      onProgress?.('Carregando Vosk (WASM)…', 40)
      const model = await Vosk.createModel(VOSK_PT_MODEL_URL)
      modelInstance = model
      onProgress?.('Vosk pronto', 100)
      return model
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      modelPromise = null
      modelInstance = null
      throw err
    }
  })()
  return modelPromise
}

export type VoskSession = {
  recognizer: KaldiRecognizer
  sampleRate: number
  grammarKey: string
  dispose: () => void
}

/**
 * Cria reconhecedor com grammar JSON (lista de frases + [unk]).
 * Recriar quando a grammar mudar (novos candidatos).
 */
export function createVoskSession(
  model: Model,
  sampleRate: number,
  phrases: string[],
): VoskSession {
  const cleaned = [
    '[unk]',
    ...phrases
      .map((p) => String(p || '').trim().toLowerCase())
      .filter((p) => p.length >= 3 && p !== '[unk]'),
  ]
  // Unique
  const uniq = [...new Set(cleaned)]
  const grammar = JSON.stringify(uniq)
  const recognizer = new model.KaldiRecognizer(sampleRate, grammar)
  try {
    recognizer.setWords(true)
  } catch {
    /* opcional */
  }

  return {
    recognizer,
    sampleRate,
    grammarKey: grammar,
    dispose: () => {
      try {
        recognizer.remove()
      } catch {
        /* ignore */
      }
    },
  }
}

export function acceptAudioBuffer(
  session: VoskSession,
  buffer: AudioBuffer,
): void {
  try {
    session.recognizer.acceptWaveform(buffer)
  } catch (err) {
    console.warn('[auto-advance] vosk acceptWaveform', err)
  }
}
