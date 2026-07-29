/**
 * STT local via Whisper (Transformers.js) — sem nuvem.
 * Primeira carga baixa o modelo e cacheia no browser; depois offline.
 */

import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true
/** Não usa CDN remoto em runtime depois do cache — se faltar modelo, falha explícito. */
env.remoteHost = 'https://huggingface.co'
env.remotePathTemplate = '{model}/resolve/{revision}/'

export const LOCAL_WHISPER_MODEL = 'Xenova/whisper-tiny'

export type LocalSttLoadState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'

type ProgressCb = (msg: string, pct: number | null) => void

let pipePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null
let loadState: LocalSttLoadState = 'idle'
let lastError: string | null = null

export function getLocalSttState(): {
  state: LocalSttLoadState
  error: string | null
} {
  return { state: loadState, error: lastError }
}

async function pickDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const gpu = (
      navigator as Navigator & {
        gpu?: { requestAdapter: () => Promise<unknown> }
      }
    ).gpu
    if (gpu) {
      const adapter = await gpu.requestAdapter()
      if (adapter) return 'webgpu'
    }
  } catch {
    /* wasm */
  }
  return 'wasm'
}

export function ensureLocalTranscriber(
  onProgress?: ProgressCb,
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (pipePromise) return pipePromise

  loadState = 'loading'
  lastError = null
  onProgress?.('Carregando Whisper local…', 0)

  pipePromise = (async () => {
    const device = await pickDevice()
    onProgress?.(
      device === 'webgpu' ? 'Whisper (WebGPU)…' : 'Whisper (WASM)…',
      5,
    )
    try {
      const pipe = await pipeline(
        'automatic-speech-recognition',
        LOCAL_WHISPER_MODEL,
        {
          device,
          dtype: device === 'webgpu' ? 'fp32' : 'q8',
          progress_callback: (p: {
            status?: string
            progress?: number
            file?: string
          }) => {
            if (p?.status === 'progress' && typeof p.progress === 'number') {
              onProgress?.(
                p.file ? `Baixando ${p.file}` : 'Baixando modelo…',
                Math.round(p.progress),
              )
            } else if (p?.status === 'done') {
              onProgress?.('Modelo pronto', 100)
            }
          },
        },
      )
      loadState = 'ready'
      onProgress?.('Pronto', 100)
      return pipe as AutomaticSpeechRecognitionPipeline
    } catch (err) {
      loadState = 'error'
      lastError = err instanceof Error ? err.message : String(err)
      pipePromise = null
      throw err
    }
  })()

  return pipePromise
}

/** PCM mono float32 @ 16 kHz → texto (pt). */
export async function transcribeLocalPcm16k(
  pcm: Float32Array,
  opts?: {
    onProgress?: ProgressCb
    /** Vocabulário fechado: linhas próximas do programa */
    initialPrompt?: string
  },
): Promise<string> {
  if (pcm.length < 16000 * 0.35) return ''
  const pipe = await ensureLocalTranscriber(opts?.onProgress)
  const result = await pipe(pcm, {
    language: 'portuguese',
    task: 'transcribe',
    // Janela curta: queremos as primeiras palavras, não o verso inteiro
    chunk_length_s: 4,
    stride_length_s: 1,
    ...(opts?.initialPrompt
      ? { initial_prompt: opts.initialPrompt.slice(0, 180) }
      : {}),
  })
  const text =
    result && typeof result === 'object' && 'text' in result
      ? String((result as { text: string }).text || '')
      : String(result || '')
  return text.trim()
}

/** Downsample / mix para Whisper (16 kHz mono). */
export function toPcm16kMono(
  input: Float32Array,
  sampleRate: number,
): Float32Array {
  if (sampleRate === 16000) return input
  const ratio = sampleRate / 16000
  const outLen = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(input.length - 1, i0 + 1)
    const t = src - i0
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}
