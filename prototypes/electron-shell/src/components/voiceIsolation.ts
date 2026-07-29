import {
  loadRnnoise,
  RnnoiseWorkletNode,
} from '@sapphi-red/web-noise-suppressor'
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseSimdWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'

let rnnoiseWasmCache: Promise<ArrayBuffer> | null = null
const workletLoads = new WeakMap<AudioContext, Promise<void>>()

function getRnnoiseWasm() {
  if (!rnnoiseWasmCache) {
    rnnoiseWasmCache = loadRnnoise({
      url: rnnoiseWasmPath,
      simdUrl: rnnoiseSimdWasmPath,
    })
  }
  return rnnoiseWasmCache
}

async function ensureWorklet(context: AudioContext) {
  let pending = workletLoads.get(context)
  if (!pending) {
    pending = context.audioWorklet.addModule(rnnoiseWorkletPath)
    workletLoads.set(context, pending)
  }
  await pending
}

export async function createVoiceIsolationNode(
  context: AudioContext,
  maxChannels = 2,
): Promise<RnnoiseWorkletNode> {
  const [wasmBinary] = await Promise.all([
    getRnnoiseWasm(),
    ensureWorklet(context),
  ])
  return new RnnoiseWorkletNode(context, {
    maxChannels,
    wasmBinary,
  })
}
