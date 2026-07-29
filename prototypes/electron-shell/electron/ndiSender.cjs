/**
 * Envia o frame da projeção como fonte NDI na rede.
 * Usa grandi (NDI SDK) no processo main — captura via capturePage.
 */

const DEFAULT_NAME = "ProShow";
const TARGET_FPS = 24;
const MAX_WIDTH = 1920;

/** @type {import('grandi').default | null} */
let grandi = null;
/** @type {Awaited<ReturnType<import('grandi').default['send']>> | null} */
let sender = null;
let enabled = false;
let running = false;
let loopPromise = null;
let lastError = null;
let loadFailed = false;
let configuredName = DEFAULT_NAME;
/** Nome com o qual o sender atual foi criado */
let activeSendName = null;
/** @type {(() => import('electron').BrowserWindow | null) | null} */
let getCaptureWindow = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(name) {
  const n = String(name ?? "").trim();
  return n || DEFAULT_NAME;
}

async function ensureGrandi() {
  if (grandi) return grandi;
  try {
    const mod = await import("grandi");
    grandi = mod.default || mod;
    if (typeof grandi.initialize === "function") {
      const ok = grandi.initialize();
      if (!ok) {
        throw new Error("NDI não suportado nesta CPU");
      }
    }
    loadFailed = false;
    return grandi;
  } catch (err) {
    loadFailed = true;
    lastError = err?.message || String(err);
    grandi = null;
    throw err;
  }
}

function status() {
  return {
    enabled,
    available: !loadFailed,
    running: Boolean(sender && enabled),
    name: configuredName,
    sourceName:
      sender && typeof sender.sourceName === "function"
        ? sender.sourceName()
        : configuredName,
    connections:
      sender && typeof sender.connections === "function"
        ? sender.connections()
        : 0,
    error: lastError,
  };
}

/**
 * @param {() => import('electron').BrowserWindow | null} getter
 */
function setCaptureWindowGetter(getter) {
  getCaptureWindow = getter;
}

async function destroySender() {
  enabled = false;
  running = false;
  if (loopPromise) {
    try {
      await Promise.race([loopPromise, sleep(500)]);
    } catch {
      /* ignore */
    }
    loopPromise = null;
  }
  if (sender) {
    try {
      sender.destroy();
    } catch {
      /* ignore */
    }
    sender = null;
  }
  activeSendName = null;
}

async function start(name) {
  lastError = null;
  if (name != null) configuredName = normalizeName(name);
  await ensureGrandi();

  if (sender && activeSendName === configuredName) {
    enabled = true;
    if (!running) loopPromise = runLoop();
    return status();
  }

  if (sender) await destroySender();

  sender = await grandi.send({
    name: configuredName,
    clockVideo: true,
    clockAudio: false,
  });
  activeSendName = configuredName;
  enabled = true;
  if (!running) loopPromise = runLoop();
  return status();
}

async function stop() {
  await destroySender();
  return status();
}

async function setEnabled(next, name) {
  if (name != null) configuredName = normalizeName(name);
  if (next) return start();
  return stop();
}

async function setName(name) {
  const next = normalizeName(name);
  if (next === configuredName && (!enabled || activeSendName === next)) {
    configuredName = next;
    return status();
  }
  configuredName = next;
  if (enabled) return start();
  return status();
}

/**
 * @param {import('electron').NativeImage} img
 */
function prepareFrame(img) {
  let size = img.getSize();
  let frame = img;
  if (size.width > MAX_WIDTH && size.width > 0) {
    const h = Math.max(1, Math.round((size.height * MAX_WIDTH) / size.width));
    frame = img.resize({ width: MAX_WIDTH, height: h, quality: "better" });
    size = frame.getSize();
  }
  const data = frame.toBitmap();
  return {
    width: size.width,
    height: size.height,
    data,
  };
}

async function runLoop() {
  if (running) return;
  running = true;
  const minInterval = Math.floor(1000 / TARGET_FPS);

  while (enabled && sender) {
    const t0 = Date.now();
    try {
      const win = getCaptureWindow ? getCaptureWindow() : null;
      if (!win || win.isDestroyed()) {
        await sleep(80);
        continue;
      }
      const wc = win.webContents;
      if (!wc || wc.isDestroyed() || wc.isLoading()) {
        await sleep(40);
        continue;
      }

      const img = await wc.capturePage();
      if (!enabled || !sender) break;
      const { width, height, data } = prepareFrame(img);
      if (width < 2 || height < 2 || !data?.length) {
        await sleep(40);
        continue;
      }

      await sender.video({
        xres: width,
        yres: height,
        frameRateN: TARGET_FPS,
        frameRateD: 1,
        pictureAspectRatio: width / height,
        fourCC: grandi.FourCC.BGRA,
        frameFormatType: grandi.FrameType.Progressive,
        lineStrideBytes: width * 4,
        data,
        timecode: grandi.TIMECODE_SYNTHESIZE,
      });
    } catch (err) {
      lastError = err?.message || String(err);
      await sleep(100);
    }

    const elapsed = Date.now() - t0;
    if (elapsed < minInterval) {
      await sleep(minInterval - elapsed);
    }
  }

  running = false;
}

function destroyAll() {
  enabled = false;
  running = false;
  if (sender) {
    try {
      sender.destroy();
    } catch {
      /* ignore */
    }
    sender = null;
  }
  activeSendName = null;
  if (grandi && typeof grandi.destroy === "function") {
    try {
      grandi.destroy();
    } catch {
      /* ignore */
    }
  }
  grandi = null;
}

module.exports = {
  DEFAULT_NAME,
  setCaptureWindowGetter,
  setEnabled,
  setName,
  start,
  stop,
  status,
  destroyAll,
  ensureGrandi,
};
