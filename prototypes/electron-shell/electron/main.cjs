const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  dialog,
  session,
  protocol,
  net,
  systemPreferences,
  shell,
} = require("electron");
const path = require("path");
const http = require("http");
const { pathToFileURL } = require("url");
const {
  importFromFile,
  findDefaultExport,
} = require("./holyricsImport.cjs");
const {
  listAllThemes,
  importThemeFile,
  saveTheme,
  saveThemeAs,
  deleteTheme,
  defaultTheme,
  defaultBibleTheme,
} = require("./themes.cjs");
const bible = require("./bible.cjs");
const mediaImport = require("./mediaImport.cjs");
const deckImport = require("./deckImport.cjs");
const fonts = require("./fonts.cjs");
const songLibrary = require("./songLibrary.cjs");
const showPlan = require("./showPlan.cjs");
const lyricsSearch = require("./lyricsSearch.cjs");
const ndiSender = require("./ndiSender.cjs");
const prefsStore = require("./prefs.cjs");
const fs = require("fs");
const os = require("os");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "iblemedia",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

const DEV_URL = process.env.VITE_DEV_SERVER_URL || "";
const OVERLAY_PORT = 8787;

/** @type {BrowserWindow | null} */
let operatorWin = null;
/** @type {BrowserWindow | null} */
let outputWin = null;
/** Janela oculta #/output para captura NDI quando não há saída física */
/** @type {BrowserWindow | null} */
let ndiCaptureWin = null;
let ndiWanted = false;

/** Preferências persistidas (AO VIVO, simulação, NDI, monitor) */
let prefs = prefsStore.loadPrefs();

/** Estado ao vivo — espelhado nas janelas e no /overlay */
let live = {
  title: "",
  artist: null,
  lines: [],
  emphasis: [],
  visible: false,
  kind: "lyrics",
  cameraDeviceId: null,
  cameraCaption: null,
  cameraPlanItemId: null,
  mediaPath: null,
  mediaKind: null,
  mediaPlaying: true,
  mediaMuted: false,
  mediaLoop: true,
  mediaVolume: 1,
  mediaSeekTo: null,
  mediaSeekSeq: 0,
  mediaVoiceIsolate: false,
  themeOverride: null,
  phraseSlots: null,
  slotThemes: null,
  stackArtistic: false,
  artisticPlan: null,
  showText: true,
  gateTitle: prefs.gateTitle,
  gateArtist: prefs.gateArtist,
  gateLyrics: prefs.gateLyrics,
};

/** Tema ativo — aplica em qualquer música */
let theme = defaultTheme();
/** Tema do texto bíblico (independente) */
let bibleTheme = defaultBibleTheme();

/** single | span — só usado quando a saída real está aberta */
let outputMode = prefs.outputMode === "span" ? "span" : "single";
/** @type {number | null} */
let outputDisplayId = prefs.outputDisplayId;
/**
 * Simulação: Preview + AO VIVO no operador, sem janela de apresentação.
 * Padrão ligado — nunca abre a saída no boot.
 */
let simulationMode = prefs.simulation !== false;

const SAFE_AREA_PATH = path.join(
  os.homedir(),
  "ible-projection",
  "output-safe-area.json",
);
const BIBLE_SAFE_AREA_PATH = path.join(
  os.homedir(),
  "ible-projection",
  "bible-safe-area.json",
);

function defaultSafeArea() {
  return { top: 6, right: 6, bottom: 6, left: 6 };
}

/**
 * A margem da SAÍDA é o limite externo de tudo (SDD §7, plano item 9).
 * Nasce em zero de propósito: sem decisão do operador, nada é recortado.
 */
function defaultOutputSafeArea() {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function clampSafeArea(raw) {
  return {
    top: Math.max(0, Math.min(40, Number(raw?.top) || 0)),
    right: Math.max(0, Math.min(40, Number(raw?.right) || 0)),
    bottom: Math.max(0, Math.min(40, Number(raw?.bottom) || 0)),
    left: Math.max(0, Math.min(40, Number(raw?.left) || 0)),
  };
}

function loadSafeAreaFrom(filePath, fallback = defaultSafeArea) {
  try {
    if (!fs.existsSync(filePath)) return fallback();
    return clampSafeArea(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return fallback();
  }
}

function saveSafeAreaTo(filePath, next) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    console.error("[safe-area] save failed", err);
  }
}

function loadSafeArea() {
  return loadSafeAreaFrom(SAFE_AREA_PATH, defaultOutputSafeArea);
}

function saveSafeArea(next) {
  saveSafeAreaTo(SAFE_AREA_PATH, next);
}

function loadBibleSafeArea() {
  return loadSafeAreaFrom(BIBLE_SAFE_AREA_PATH);
}

function saveBibleSafeArea(next) {
  saveSafeAreaTo(BIBLE_SAFE_AREA_PATH, next);
}

/** @type {{ top: number, right: number, bottom: number, left: number }} */
let outputSafeArea = loadSafeArea();
/** @type {{ top: number, right: number, bottom: number, left: number }} */
let bibleSafeArea = loadBibleSafeArea();

function injectFontsInto(win) {
  if (!win || win.isDestroyed()) return;
  const css = fonts.buildInjectCss();
  if (!css) return;
  win.webContents.insertCSS(css).catch(() => {});
}

function broadcastFonts() {
  const payload = {
    imported: fonts.listImported(),
    options: fonts.fontOptions(),
    css: fonts.buildInjectCss(),
  };
  for (const win of projectionWindows()) {
    if (win && !win.isDestroyed()) {
      injectFontsInto(win);
      win.webContents.send("fonts:update", payload);
    }
  }
}

function createOperator() {
  operatorWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: "ProShow — Operador",
    backgroundColor: "#0e1116",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  const url = DEV_URL
    ? `${DEV_URL}#/operator`
    : `file://${path.join(__dirname, "../dist/index.html")}#/operator`;
  operatorWin.loadURL(url);

  operatorWin.webContents.on("did-finish-load", () => injectFontsInto(operatorWin));
  operatorWin.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  operatorWin.webContents.on("did-fail-load", (_e, code, desc, urlFailed) => {
    console.error(`[operator fail-load] ${code} ${desc} ${urlFailed}`);
  });
  operatorWin.webContents.on("render-process-gone", (_e, details) => {
    console.error(`[operator gone]`, details);
  });

  operatorWin.on("closed", () => {
    operatorWin = null;
    if (outputWin && !outputWin.isDestroyed()) outputWin.close();
  });
}

function pickOutputBounds(mode, displayId) {
  const displays = screen.getAllDisplays();
  if (mode === "span" && displays.length >= 2) {
    // Unir todos os displays (ou os dois primeiros)
    const sorted = [...displays].sort((a, b) => a.bounds.x - b.bounds.x);
    const pair = sorted.slice(0, 2);
    const x = Math.min(...pair.map((d) => d.bounds.x));
    const y = Math.min(...pair.map((d) => d.bounds.y));
    const right = Math.max(...pair.map((d) => d.bounds.x + d.bounds.width));
    const bottom = Math.max(...pair.map((d) => d.bounds.y + d.bounds.height));
    return { x, y, width: right - x, height: bottom - y, displayIds: pair.map((d) => d.id) };
  }

  const target =
    displays.find((d) => d.id === displayId) ||
    displays.find((d) => d.id !== screen.getPrimaryDisplay().id) ||
    screen.getPrimaryDisplay();

  return {
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    displayIds: [target.id],
  };
}

function placeOutputWindow(win, bounds) {
  // A saída NUNCA recebe foco: o operador digita na janela dele o tempo todo
  // e cada AO VIVO chama isto de novo (roubaria o foco a cada Enter).
  // Não usar fullscreen nativo do macOS (Spaces) — ele ignora o monitor escolhido.
  // Posiciona pelos bounds do display e cobre a tela toda.
  try {
    if (win.isFullScreen()) win.setFullScreen(false);
  } catch {
    /* ignore */
  }
  try {
    if (typeof win.isSimpleFullScreen === "function" && win.isSimpleFullScreen()) {
      win.setSimpleFullScreen(false);
    }
  } catch {
    /* ignore */
  }

  win.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
  win.setAlwaysOnTop(true, "screen-saver");
  if (!win.isVisible()) {
    if (typeof win.showInactive === "function") win.showInactive();
    else win.show();
  }

  // Reforça após o compositor do macOS acomodar a janela
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    win.setAlwaysOnTop(true, "screen-saver");
  }, 80);
}

function closeOutput() {
  if (outputWin && !outputWin.isDestroyed()) {
    outputWin.close();
  }
  outputWin = null;
  // Sem saída física: mantém captura NDI se estiver ligada
  if (ndiWanted) ensureNdiCaptureWindow();
}

function outputUrl() {
  return DEV_URL
    ? `${DEV_URL}#/output`
    : `file://${path.join(__dirname, "../dist/index.html")}#/output`;
}

function projectionWindows() {
  return [operatorWin, outputWin, ndiCaptureWin];
}

function closeNdiCaptureWindow() {
  if (ndiCaptureWin && !ndiCaptureWin.isDestroyed()) {
    ndiCaptureWin.close();
  }
  ndiCaptureWin = null;
}

function ensureNdiCaptureWindow() {
  // Preferir a janela de apresentação real quando aberta
  if (outputWin && !outputWin.isDestroyed()) {
    closeNdiCaptureWindow();
    return outputWin;
  }

  if (ndiCaptureWin && !ndiCaptureWin.isDestroyed()) {
    return ndiCaptureWin;
  }

  const bounds = pickOutputBounds(outputMode, outputDisplayId);
  const width = Math.min(1920, Math.max(1280, bounds.width || 1920));
  const height = Math.min(1080, Math.max(720, bounds.height || 1080));

  ndiCaptureWin = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    skipTaskbar: true,
    backgroundColor: "#000000",
    title: "ProShow — NDI",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
    },
  });

  ndiCaptureWin.loadURL(outputUrl());
  ndiCaptureWin.webContents.on("did-finish-load", () => {
    injectFontsInto(ndiCaptureWin);
    if (ndiCaptureWin && !ndiCaptureWin.isDestroyed()) {
      ndiCaptureWin.webContents.send("live:update", live);
      ndiCaptureWin.webContents.send("theme:update", theme);
      ndiCaptureWin.webContents.send("bible-theme:update", bibleTheme);
      ndiCaptureWin.webContents.send("output-config:update", {
        mode: outputMode,
        displayId: outputDisplayId,
        simulation: simulationMode,
        outputOpen: Boolean(outputWin && !outputWin.isDestroyed()),
        safeArea: { ...outputSafeArea },
        bibleSafeArea: { ...bibleSafeArea },
      });
    }
  });
  ndiCaptureWin.on("closed", () => {
    ndiCaptureWin = null;
  });

  return ndiCaptureWin;
}

function getNdiCaptureTarget() {
  if (outputWin && !outputWin.isDestroyed()) return outputWin;
  if (ndiWanted) return ensureNdiCaptureWindow();
  if (ndiCaptureWin && !ndiCaptureWin.isDestroyed()) return ndiCaptureWin;
  return null;
}

async function setNdiEnabled(enabled, name) {
  ndiWanted = Boolean(enabled);
  if (ndiWanted) {
    ensureNdiCaptureWindow();
    try {
      const st = await ndiSender.setEnabled(true, name);
      prefs = prefsStore.savePrefs({
        ndiEnabled: true,
        ndiName: st.name || name || prefs.ndiName,
      });
      return st;
    } catch (err) {
      ndiWanted = false;
      closeNdiCaptureWindow();
      prefs = prefsStore.savePrefs({ ndiEnabled: false });
      return {
        ...ndiSender.status(),
        enabled: false,
        error: err?.message || String(err),
      };
    }
  }
  const st = await ndiSender.setEnabled(false, name);
  prefs = prefsStore.savePrefs({
    ndiEnabled: false,
    ...(name != null ? { ndiName: st.name || name } : null),
  });
  // Só fecha a janela oculta se a saída física não estiver aberta
  if (!outputWin || outputWin.isDestroyed()) {
    closeNdiCaptureWindow();
  }
  return st;
}

function persistLiveGates(state) {
  prefs = prefsStore.savePrefs({
    gateTitle: state.gateTitle !== false,
    gateArtist: state.gateArtist !== false,
    gateLyrics: state.gateLyrics !== false,
    showText: state.showText !== false,
  });
}

function persistBgCamera(enabled, deviceId) {
  prefs = prefsStore.savePrefs({
    bgCameraEnabled: Boolean(enabled),
    // Mantém o último device mesmo desligado (histórico do select)
    bgCameraDeviceId: deviceId ? String(deviceId) : null,
  });
}

function createOutput() {
  if (simulationMode) {
    closeOutput();
    return null;
  }

  const bounds = pickOutputBounds(outputMode, outputDisplayId);
  // Guarda o display efetivo (pode ter caído no fallback)
  if (bounds.displayIds?.[0] != null && outputMode === "single") {
    outputDisplayId = bounds.displayIds[0];
  }

  if (outputWin && !outputWin.isDestroyed()) {
    placeOutputWindow(outputWin, bounds);
    closeNdiCaptureWindow();
    return outputWin;
  }

  outputWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    fullscreen: false,
    simpleFullscreen: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // Projetor só exibe — nunca vira janela ativa (senão rouba o teclado do operador)
    focusable: false,
    acceptFirstMouse: false,
    backgroundColor: "#000000",
    title: "ProShow — Saída",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  placeOutputWindow(outputWin, bounds);

  outputWin.loadURL(outputUrl());

  outputWin.webContents.on("did-finish-load", () => injectFontsInto(outputWin));

  outputWin.on("closed", () => {
    outputWin = null;
    if (ndiWanted) ensureNdiCaptureWindow();
  });

  // Saída física disponível — encerra a captura offscreen
  closeNdiCaptureWindow();

  return outputWin;
}

function broadcastSimulation() {
  if (operatorWin && !operatorWin.isDestroyed()) {
    operatorWin.webContents.send("simulation:update", {
      simulation: simulationMode,
      outputOpen: Boolean(outputWin && !outputWin.isDestroyed()),
    });
  }
}

function broadcastOutputConfig() {
  const payload = {
    mode: outputMode,
    displayId: outputDisplayId,
    simulation: simulationMode,
    outputOpen: Boolean(outputWin && !outputWin.isDestroyed()),
    safeArea: { ...outputSafeArea },
    bibleSafeArea: { ...bibleSafeArea },
    bibleThemeId: prefs.bibleThemeId,
    bibleShowTitle: prefs.bibleShowTitle !== false,
    bibleShowLyrics: prefs.bibleShowLyrics !== false,
    spectrum: prefs.spectrum || null,
    autoAdvance: prefs.autoAdvance || null,
  };
  for (const win of projectionWindows()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("output-config:update", payload);
    }
  }
}

function broadcastLive() {
  for (const win of projectionWindows()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("live:update", live);
    }
  }
}

function broadcastTheme() {
  for (const win of projectionWindows()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("theme:update", theme);
      win.webContents.send("bible-theme:update", bibleTheme);
    }
  }
}

function broadcastThemesList() {
  const list = JSON.parse(JSON.stringify(listAllThemes()));
  for (const win of projectionWindows()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("themes:list", list);
    }
  }
  return list;
}

function broadcastBibleTheme() {
  for (const win of projectionWindows()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("bible-theme:update", bibleTheme);
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Overlay OBS textual: na composição artística, usa a frase mais recente. */
function overlayDisplayLines(state) {
  const slots = state?.phraseSlots;
  if (state?.stackArtistic && Array.isArray(slots) && slots.length) {
    const last = slots[slots.length - 1] || "";
    return String(last)
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return Array.isArray(state?.lines) ? state.lines : [];
}

function startOverlayServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${OVERLAY_PORT}`);

    if (url.pathname === "/live.json") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(live));
      return;
    }

    if (url.pathname === "/overlay" || url.pathname === "/") {
      const lines = overlayDisplayLines(live)
        .map((l) => `<div class="line">${escapeHtml(l)}</div>`)
        .join("");
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Overlay ProShow</title>
<style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;
    font-family: "Avenir Next", "Helvetica Neue", system-ui, sans-serif;}
  .wrap{display:flex;align-items:flex-end;justify-content:center;height:100%;
    padding:6vh 8vw;box-sizing:border-box;}
  .card{text-align:center;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.75);
    max-width:92vw;}
  .line{font-size:clamp(28px,5vw,64px);font-weight:600;line-height:1.25;margin:.12em 0;}
  .title{opacity:.55;font-size:clamp(14px,1.6vw,22px);margin-bottom:1em;letter-spacing:.04em;}
  body.hide .card{opacity:0}
</style></head>
<body class="${live.visible ? "" : "hide"}">
  <div class="wrap"><div class="card">
    <div class="title">${escapeHtml(
      live.stackArtistic ||
        live.kind === "image" ||
        live.kind === "video" ||
        live.kind === "audio" ||
        live.kind === "camera" ||
        live.kind === "file" ||
        live.kind === "deck" ||
        live.kind === "web"
        ? ""
        : live.title || "",
    )}</div>
    ${lines}
  </div></div>
  <script>
    function esc(s){
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function overlayLines(j){
      const slots=j.phraseSlots;
      if(Array.isArray(slots)&&slots.length){
        return String(slots[slots.length-1]||'').split(/\\n/)
          .map(s=>s.trim()).filter(Boolean);
      }
      return j.lines||[];
    }
    async function tick(){
      try{
        const r=await fetch('/live.json'); const j=await r.json();
        document.body.classList.toggle('hide', !j.visible);
        document.querySelector('.card').innerHTML=
          '<div class="title">'+esc(j.stackArtistic||j.kind==='image'||j.kind==='video'||j.kind==='audio'||j.kind==='camera'||j.kind==='file'||j.kind==='deck'||j.kind==='web'?'':(j.title||''))+'</div>'+
          overlayLines(j).map(l=>'<div class="line">'+esc(l)+'</div>').join('');
      }catch(e){}
    }
    setInterval(tick, 400);
  </script>
</body></html>`;
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  server.listen(OVERLAY_PORT, "0.0.0.0", () => {
    console.log(`[overlay] http://127.0.0.1:${OVERLAY_PORT}/overlay`);
  });
}

function listDisplays() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: d.label || `Display ${d.id}`,
    bounds: d.bounds,
    primary: d.id === primary,
  }));
}

app.whenReady().then(() => {
  function mimeForMediaPath(filePath) {
    switch (path.extname(filePath).toLowerCase()) {
      case ".mp4":
      case ".m4v":
        return "video/mp4";
      case ".mov":
        return "video/quicktime";
      case ".webm":
        return "video/webm";
      case ".ogv":
        return "video/ogg";
      case ".mp3":
        return "audio/mpeg";
      case ".m4a":
      case ".aac":
        return "audio/mp4";
      case ".wav":
        return "audio/wav";
      case ".ogg":
      case ".oga":
        return "audio/ogg";
      case ".flac":
        return "audio/flac";
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".gif":
        return "image/gif";
      case ".webp":
        return "image/webp";
      default:
        return "application/octet-stream";
    }
  }

  /**
   * Serve arquivos com Accept-Ranges / 206 — sem isso o <video> não consegue seek.
   */
  protocol.handle("iblemedia", async (request) => {
    try {
      const u = new URL(request.url);
      let filePath = decodeURIComponent(u.pathname || "");
      // Windows: /C:/Users/... → C:/Users/...
      if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.slice(1);
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response("not found", { status: 404 });
      }

      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        return new Response("not found", { status: 404 });
      }

      const size = stat.size;
      const mime = mimeForMediaPath(filePath);
      const rangeHeader =
        request.headers.get("Range") || request.headers.get("range") || "";
      const rangeMatch = /bytes=(\d*)-(\d*)/.exec(rangeHeader);

      const toWebStream = (nodeStream) => {
        const { Readable } = require("stream");
        return Readable.toWeb(nodeStream);
      };

      if (rangeMatch) {
        let start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0;
        let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : size - 1;
        if (Number.isNaN(start)) start = 0;
        if (Number.isNaN(end) || end >= size) end = size - 1;
        if (start < 0) start = 0;
        if (start > end || start >= size) {
          return new Response(null, {
            status: 416,
            headers: {
              "Content-Range": `bytes */${size}`,
              "Accept-Ranges": "bytes",
            },
          });
        }
        const chunkSize = end - start + 1;
        const nodeStream = fs.createReadStream(filePath, { start, end });
        return new Response(toWebStream(nodeStream), {
          status: 206,
          headers: {
            "Content-Type": mime,
            "Content-Length": String(chunkSize),
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
          },
        });
      }

      const nodeStream = fs.createReadStream(filePath);
      return new Response(toWebStream(nodeStream), {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-cache",
        },
      });
    } catch (err) {
      console.error("[iblemedia]", err);
      return new Response("not found", { status: 404 });
    }
  });

  // Câmera / microfone no macOS
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow = [
      "media",
      "mediaKeySystem",
      "display-capture",
    ].includes(permission);
    callback(allow);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === "media" || permission === "display-capture";
  });

  // Páginas web no Preview/AO VIVO (iframe): remove bloqueios de frame
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== "subFrame") {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const headers = { ...(details.responseHeaders || {}) };
    const drop = new Set([
      "x-frame-options",
      "content-security-policy",
      "content-security-policy-report-only",
    ]);
    for (const key of Object.keys(headers)) {
      if (drop.has(key.toLowerCase())) delete headers[key];
    }
    callback({ responseHeaders: headers });
  });

  // Pedido de câmera fica no IPC (depois da janela ter foco) —
  // askForMediaAccess no boot via SSH devolve false sem diálogo.

  startOverlayServer();
  createOperator();
  // Não abre janela de apresentação no boot — só em modo real (Saídas)

  ndiSender.setCaptureWindowGetter(getNdiCaptureTarget);
  void ndiSender.ensureGrandi().catch(() => {
    /* NDI opcional — falha fica em status().error */
  });
  if (prefs.ndiEnabled) {
    void setNdiEnabled(true, prefs.ndiName).catch(() => {});
  }

  ipcMain.handle("ndi:status", () => ndiSender.status());
  ipcMain.handle("ndi:set-enabled", async (_e, payload) => {
    if (payload && typeof payload === "object") {
      return setNdiEnabled(payload.enabled, payload.name);
    }
    return setNdiEnabled(payload);
  });
  ipcMain.handle("ndi:set-name", async (_e, name) => {
    try {
      const st = await ndiSender.setName(name);
      prefs = prefsStore.savePrefs({ ndiName: st.name || name });
      return st;
    } catch (err) {
      return {
        ...ndiSender.status(),
        error: err?.message || String(err),
      };
    }
  });

  ipcMain.handle("get-live", () => live);
  ipcMain.handle("set-live", (_e, next) => {
    if (!next || typeof next !== "object") return live;
    // Seek: ignora patches mais antigos (IPC fora de ordem → barra volta pra 0)
    if (
      typeof next.mediaSeekSeq === "number" &&
      typeof live.mediaSeekSeq === "number" &&
      next.mediaSeekSeq < live.mediaSeekSeq
    ) {
      const rest = { ...next };
      delete rest.mediaSeekSeq;
      delete rest.mediaSeekTo;
      live = { ...live, ...rest };
    } else {
      live = { ...live, ...next };
    }
    // Texto (letra/versículo) fica sempre ativo — sem toggle de desligar
    live.showText = true;
    if (
      Object.prototype.hasOwnProperty.call(next, "gateTitle") ||
      Object.prototype.hasOwnProperty.call(next, "gateArtist") ||
      Object.prototype.hasOwnProperty.call(next, "gateLyrics") ||
      Object.prototype.hasOwnProperty.call(next, "showText")
    ) {
      persistLiveGates(live);
    }
    broadcastLive();
    return live;
  });

  /** macOS: pede câmera com janela já aberta; se negado, abre Ajustes. */
  ipcMain.handle("camera:ensure-access", async () => {
    if (process.platform !== "darwin") {
      return { granted: true, status: "granted" };
    }
    try {
      let status = systemPreferences.getMediaAccessStatus("camera");
      if (status === "granted") return { granted: true, status };
      if (status === "not-determined") {
        const ok = await systemPreferences.askForMediaAccess("camera");
        status = systemPreferences.getMediaAccessStatus("camera");
        console.log(`[camera] askForMediaAccess → ${ok} (now ${status})`);
        return { granted: Boolean(ok) || status === "granted", status };
      }
      // denied / restricted — orientar o usuário
      console.log(`[camera] status=${status}, opening Privacy_Camera`);
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
      );
      return { granted: false, status };
    } catch (err) {
      console.error("[camera] ensure-access failed", err);
      return { granted: false, status: "error", error: String(err) };
    }
  });

  ipcMain.handle("theme:list", () =>
    JSON.parse(JSON.stringify(listAllThemes())),
  );
  ipcMain.handle("theme:get", () => theme);
  ipcMain.handle("theme:set", (_e, next) => {
    if (!next || typeof next !== "object") throw new Error("Tema inválido");
    theme = { ...theme, ...next, id: next.id || theme.id, name: next.name || theme.name };
    broadcastTheme();
    return theme;
  });
  ipcMain.handle("bible-theme:get", () => bibleTheme);
  ipcMain.handle("bible-theme:set", (_e, next) => {
    if (!next || typeof next !== "object") throw new Error("Tema bíblico inválido");
    bibleTheme = {
      ...bibleTheme,
      ...next,
      id: next.id || bibleTheme.id,
      name: next.name || bibleTheme.name,
    };
    broadcastBibleTheme();
    return bibleTheme;
  });
  ipcMain.handle("theme:save", (_e, next) => {
    const saved = saveTheme(next);
    if (theme.id === saved.id) {
      theme = { ...theme, ...saved };
      broadcastTheme();
    }
    if (bibleTheme.id === saved.id) {
      bibleTheme = { ...bibleTheme, ...saved };
      broadcastBibleTheme();
    }
    const themes = broadcastThemesList();
    return { theme: saved, themes };
  });
  ipcMain.handle("theme:save-as", (_e, payload) => {
    const saved = saveThemeAs(payload?.theme || payload, payload?.name);
    const themes = broadcastThemesList();
    return { theme: saved, themes };
  });
  ipcMain.handle("theme:delete", (_e, themeId) => {
    const result = deleteTheme(themeId);
    const themes = broadcastThemesList();
    return { ...result, themes };
  });
  ipcMain.handle("theme:pick-background", async (_e, kind) => {
    const parent = operatorWin && !operatorWin.isDestroyed() ? operatorWin : undefined;
    const isVideo = kind === "video";
    const isImage = kind === "image";
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
    const videoExts = ["mp4", "mov", "m4v", "webm", "mkv", "avi"];
    const filters = isVideo
      ? [{ name: "Vídeo", extensions: videoExts }]
      : isImage
        ? [{ name: "Imagem", extensions: imageExts }]
        : [
            { name: "Imagem ou vídeo", extensions: [...imageExts, ...videoExts] },
            { name: "Imagem", extensions: imageExts },
            { name: "Vídeo", extensions: videoExts },
          ];
    const result = await dialog.showOpenDialog(parent, {
      title: isVideo
        ? "Fundo do tema — vídeo"
        : isImage
          ? "Fundo do tema — imagem"
          : "Fundo do tema — imagem ou vídeo",
      filters,
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true };
    }
    const path = result.filePaths[0];
    const ext = (path.split(".").pop() || "").toLowerCase();
    const resolvedKind = isVideo || isImage ? kind : videoExts.includes(ext) ? "video" : "image";
    return {
      canceled: false,
      path,
      kind: resolvedKind,
    };
  });
  ipcMain.handle("theme:import-dialog", async () => {
    const parent = operatorWin && !operatorWin.isDestroyed() ? operatorWin : undefined;
    const result = await dialog.showOpenDialog(parent, {
      title: "Importar tema de projeção",
      filters: [
        { name: "Tema JSON", extensions: ["json"] },
        { name: "Todos", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true };
    }
    const imported = importThemeFile(result.filePaths[0]);
    theme = imported;
    broadcastTheme();
    const themes = broadcastThemesList();
    return { canceled: false, theme, themes };
  });

  ipcMain.handle("bible:versions", () => bible.listVersions());
  ipcMain.handle("bible:books", (_e, versionId) => bible.listBooks(versionId));
  ipcMain.handle("bible:chapter", (_e, payload) =>
    bible.getChapter(payload.versionId, payload.bookIndex, payload.chapterIndex),
  );
  ipcMain.handle("bible:range", (_e, payload) =>
    bible.getVerseRange(
      payload.versionId,
      payload.bookIndex,
      payload.chapterIndex,
      payload.from,
      payload.to,
    ),
  );

  ipcMain.handle("media:list", async () => {
    try {
      await deckImport.repairThinDecks();
    } catch {
      /* ignore */
    }
    const media = mediaImport.listMedia();
    const decks = deckImport.listDecks();
    return [...decks, ...media];
  });

  /** Apaga o arquivo (ou pasta do deck) da biblioteca de mídia. */
  ipcMain.handle("media:delete", (_e, item) => {
    try {
      if (!item || typeof item !== "object") return { ok: false };
      if (item.kind === "deck") {
        const folderId = String(item.id || "").replace(/^deck-/, "");
        if (!folderId) return { ok: false, error: "id inválido" };
        const dir = deckImport.deckDir(folderId);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        return { ok: true };
      }
      const name = String(item.id || "").replace(/^media-/, "");
      if (!name) return { ok: false, error: "id inválido" };
      const root = mediaImport.mediaRoot();
      const full = path.join(root, name);
      if (fs.existsSync(full)) fs.unlinkSync(full);
      // Remux associado (mesmo hash no nome) — listMedia() casa do mesmo jeito.
      const idMatch = name.match(/^\d+-([a-f0-9]+)-/);
      if (idMatch) {
        const remuxRe = new RegExp(`^\\d+-${idMatch[1]}-remux\\.mp4$`);
        for (const f of fs.readdirSync(root)) {
          if (remuxRe.test(f)) fs.unlinkSync(path.join(root, f));
        }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp"];
  const VIDEO_EXTS = [
    "mp4", "mov", "m4v", "webm", "mkv", "avi", "mpeg", "mpg", "m2ts", "mts", "3gp", "ogv", "wmv", "flv",
  ];
  const AUDIO_EXTS = ["mp3", "wav", "aac", "m4a", "ogg", "flac"];
  const DECK_EXTS = ["pdf", "ppt", "pptx", "key"];

  ipcMain.handle("media:import-dialog", async (_e, opts) => {
    const kind = opts && typeof opts === "object" ? opts.kind : null;
    const parent = operatorWin && !operatorWin.isDestroyed() ? operatorWin : undefined;
    // Slot rápido (kind definido): só o tipo pedido — sem outros filtros pra
    // não abrir já mostrando tudo (macOS combina o 1º filtro só se for único).
    const filters =
      kind === "video"
        ? [{ name: "Vídeo", extensions: VIDEO_EXTS }]
        : kind === "image"
          ? [{ name: "Imagem", extensions: IMAGE_EXTS }]
          : [
              {
                name: "Mídia",
                extensions: [...IMAGE_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS, ...DECK_EXTS],
              },
              { name: "Apresentações", extensions: DECK_EXTS },
              { name: "Vídeo", extensions: VIDEO_EXTS },
              { name: "Áudio", extensions: AUDIO_EXTS },
              { name: "Todos", extensions: ["*"] },
            ];
    const result = await dialog.showOpenDialog(parent, {
      title:
        kind === "video" ? "Importar vídeo" : kind === "image" ? "Importar imagem" : "Importar mídia",
      filters,
      properties: kind ? ["openFile"] : ["openFile", "multiSelections"],
    });
    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true, items: [] };
    }
    const { items: mediaItems, deckPaths } = mediaImport.importMediaFiles(result.filePaths);
    const deckResult = deckPaths.length
      ? await deckImport.importDeckPaths(deckPaths)
      : { items: [], note: undefined };
    const items = [...deckResult.items, ...mediaItems];
    const notes = [
      deckResult.note,
      ...items.map((m) => m.note).filter(Boolean),
    ].filter(Boolean);
    return {
      canceled: false,
      items,
      note: notes[0],
      ffmpeg: Boolean(mediaImport.findFfmpeg()),
    };
  });

  ipcMain.handle("media:import-paths", async (_e, paths) => {
    const list = Array.isArray(paths) ? paths.filter(Boolean) : [];
    const { items: mediaItems, deckPaths } = mediaImport.importMediaFiles(list);
    const deckResult = deckPaths.length
      ? await deckImport.importDeckPaths(deckPaths)
      : { items: [], note: undefined };
    const items = [...deckResult.items, ...mediaItems];
    return {
      items,
      note: deckResult.note || items.find((i) => i.note)?.note,
      ffmpeg: Boolean(mediaImport.findFfmpeg()),
    };
  });

  ipcMain.handle("media:import-url", async (_e, url) => {
    try {
      const result = await mediaImport.importMediaUrl(url);
      if (!result?.ok) {
        return {
          ok: false,
          error: result?.error || "Falha ao importar URL",
          items: [],
        };
      }
      return {
        ok: true,
        items: result.items || [],
        note: result.items?.[0]?.note,
        ffmpeg: Boolean(mediaImport.findFfmpeg()),
      };
    } catch (err) {
      return {
        ok: false,
        error: err?.message || String(err),
        items: [],
      };
    }
  });

  ipcMain.handle("media:probe", async (_e, filePath) => {
    try {
      return mediaImport.probeMediaFile(filePath);
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  // Frame do site (captura do webview da coluna) → PNG temp p/ AO VIVO
  ipcMain.handle("media:save-web-live-frame", async (_e, dataUrl) => {
    try {
      const raw = String(dataUrl || "");
      const m = raw.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
      if (!m) return { ok: false, error: "Frame inválido" };
      const ext = m[1].toLowerCase().startsWith("jp") ? "jpg" : m[1].toLowerCase();
      const dir = path.join(app.getPath("temp"), "proshow-web-live");
      fs.mkdirSync(dir, { recursive: true });
      // Nome único — evita cache do iblemedia:// no renderer
      const dest = path.join(dir, `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
      fs.writeFileSync(dest, Buffer.from(m[2], "base64"));
      // Limpa frames antigos (mantém os 8 mais recentes)
      try {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.startsWith("live-"))
          .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
          .sort((a, b) => b.t - a.t);
        for (const old of files.slice(8)) {
          fs.unlinkSync(path.join(dir, old.f));
        }
      } catch {
        /* ignore cleanup */
      }
      return { ok: true, path: dest };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("fonts:catalog", (_e, query) => fonts.listCatalog(query));
  // Pré-carrega catálogo Google em background (busca fica instantânea)
  void fonts.loadRemoteCatalog?.().catch(() => {});
  ipcMain.handle("fonts:list", () => ({
    imported: fonts.listImported(),
    options: fonts.fontOptions(),
    css: fonts.buildInjectCss(),
  }));
  ipcMain.handle("fonts:import", async (_e, family) => {
    const result = await fonts.importGoogleFont(family);
    if (result.ok) broadcastFonts();
    return result;
  });
  ipcMain.handle("fonts:remove", (_e, id) => {
    const result = fonts.removeFont(id);
    if (result.ok) broadcastFonts();
    return result;
  });

  ipcMain.handle("list-displays", () => listDisplays());
  ipcMain.handle("get-output-config", () => ({
    mode: outputMode,
    displayId: outputDisplayId,
    overlayUrl: `http://127.0.0.1:${OVERLAY_PORT}/overlay`,
    displays: listDisplays(),
    simulation: simulationMode,
    outputOpen: Boolean(outputWin && !outputWin.isDestroyed()),
    safeArea: { ...outputSafeArea },
    bibleSafeArea: { ...bibleSafeArea },
    bibleThemeId: prefs.bibleThemeId,
    bibleShowTitle: prefs.bibleShowTitle !== false,
    bibleShowLyrics: prefs.bibleShowLyrics !== false,
    bgCameraEnabled: Boolean(prefs.bgCameraEnabled),
    bgCameraDeviceId: prefs.bgCameraDeviceId || null,
    showText: prefs.showText !== false,
    gateTitle: prefs.gateTitle !== false,
    gateArtist: prefs.gateArtist !== false,
    gateLyrics: prefs.gateLyrics !== false,
    stackArtistic: Boolean(prefs.stackArtistic),
    stackArtisticMax: Boolean(prefs.stackArtisticMax),
    quickVideoItem: prefs.quickVideoItem || null,
    quickImageItem: prefs.quickImageItem || null,
    spectrum: prefs.spectrum || null,
    autoAdvance: prefs.autoAdvance || null,
  }));
  ipcMain.handle("set-simulation", (_e, enabled) => {
    simulationMode = Boolean(enabled);
    if (simulationMode) {
      closeOutput();
    }
    prefs = prefsStore.savePrefs({ simulation: simulationMode });
    broadcastSimulation();
    return {
      simulation: simulationMode,
      outputOpen: Boolean(outputWin && !outputWin.isDestroyed()),
    };
  });
  ipcMain.handle("set-output-config", (_e, cfg) => {
    if (cfg.mode) outputMode = cfg.mode;
    if (Object.prototype.hasOwnProperty.call(cfg, "displayId")) {
      outputDisplayId = cfg.displayId;
    }
    if (cfg.safeArea && typeof cfg.safeArea === "object") {
      outputSafeArea = clampSafeArea(cfg.safeArea);
      saveSafeArea(outputSafeArea);
    }
    if (cfg.bibleSafeArea && typeof cfg.bibleSafeArea === "object") {
      bibleSafeArea = clampSafeArea(cfg.bibleSafeArea);
      saveBibleSafeArea(bibleSafeArea);
    }
    if (Object.prototype.hasOwnProperty.call(cfg, "bibleThemeId")) {
      prefs = prefsStore.savePrefs({
        bibleThemeId: cfg.bibleThemeId || null,
      });
    }
    if (Object.prototype.hasOwnProperty.call(cfg, "bibleShowTitle")) {
      prefs = prefsStore.savePrefs({
        bibleShowTitle: Boolean(cfg.bibleShowTitle),
      });
    }
    if (Object.prototype.hasOwnProperty.call(cfg, "bibleShowLyrics")) {
      prefs = prefsStore.savePrefs({
        bibleShowLyrics: Boolean(cfg.bibleShowLyrics),
      });
    }
    if (Object.prototype.hasOwnProperty.call(cfg, "simulation")) {
      simulationMode = Boolean(cfg.simulation);
      if (simulationMode) closeOutput();
    }
    if (
      Object.prototype.hasOwnProperty.call(cfg, "bgCameraEnabled") ||
      Object.prototype.hasOwnProperty.call(cfg, "bgCameraDeviceId")
    ) {
      const enabled = Object.prototype.hasOwnProperty.call(cfg, "bgCameraEnabled")
        ? Boolean(cfg.bgCameraEnabled)
        : Boolean(prefs.bgCameraEnabled);
      const deviceId = Object.prototype.hasOwnProperty.call(
        cfg,
        "bgCameraDeviceId",
      )
        ? cfg.bgCameraDeviceId || null
        : prefs.bgCameraDeviceId || null;
      persistBgCamera(enabled, deviceId);
    }

    if (Object.prototype.hasOwnProperty.call(cfg, "stackArtistic")) {
      prefs = prefsStore.savePrefs({
        stackArtistic: Boolean(cfg.stackArtistic),
      });
    }

    if (Object.prototype.hasOwnProperty.call(cfg, "stackArtisticMax")) {
      prefs = prefsStore.savePrefs({
        stackArtisticMax: Boolean(cfg.stackArtisticMax),
      });
    }

    if (Object.prototype.hasOwnProperty.call(cfg, "quickVideoItem")) {
      prefs = prefsStore.savePrefs({ quickVideoItem: cfg.quickVideoItem || null });
    }
    if (Object.prototype.hasOwnProperty.call(cfg, "quickImageItem")) {
      prefs = prefsStore.savePrefs({ quickImageItem: cfg.quickImageItem || null });
    }

    if (Object.prototype.hasOwnProperty.call(cfg, "spectrum")) {
      prefs = prefsStore.savePrefs({ spectrum: cfg.spectrum || null });
    }

    if (Object.prototype.hasOwnProperty.call(cfg, "autoAdvance")) {
      prefs = prefsStore.savePrefs({ autoAdvance: cfg.autoAdvance || null });
    }

    prefs = prefsStore.savePrefs({
      outputMode,
      outputDisplayId,
      ...(Object.prototype.hasOwnProperty.call(cfg, "simulation")
        ? { simulation: simulationMode }
        : null),
    });

    // Nunca cria / mostra / reposiciona a janela daqui.
    // Projeção só via "open-program-output" (botão AO VIVO).

    broadcastSimulation();
    broadcastOutputConfig();
    return {
      mode: outputMode,
      displayId: outputDisplayId,
      bounds: pickOutputBounds(outputMode, outputDisplayId),
      displays: listDisplays(),
      simulation: simulationMode,
      outputOpen: Boolean(outputWin && !outputWin.isDestroyed()),
      safeArea: { ...outputSafeArea },
      bibleSafeArea: { ...bibleSafeArea },
      bibleThemeId: prefs.bibleThemeId,
      bibleShowTitle: prefs.bibleShowTitle !== false,
      bibleShowLyrics: prefs.bibleShowLyrics !== false,
      spectrum: prefs.spectrum || null,
      autoAdvance: prefs.autoAdvance || null,
    };
  });

  /** Único caminho que abre a tela de exibição — chamado só no AO VIVO. */
  ipcMain.handle("open-program-output", () => {
    simulationMode = false;
    createOutput();
    // Cinto e suspensório: o operador continua com o teclado depois do AO VIVO
    if (operatorWin && !operatorWin.isDestroyed()) operatorWin.focus();
    broadcastSimulation();
    broadcastOutputConfig();
    return {
      mode: outputMode,
      displayId: outputDisplayId,
      simulation: simulationMode,
      outputOpen: Boolean(outputWin && !outputWin.isDestroyed()),
      safeArea: { ...outputSafeArea },
    };
  });

  ipcMain.handle("reassert-output", () => {
    // Só reposiciona se já estiver aberta — nunca abre daqui
    if (simulationMode || !outputWin || outputWin.isDestroyed()) {
      return false;
    }
    const bounds = pickOutputBounds(outputMode, outputDisplayId);
    placeOutputWindow(outputWin, bounds);
    return true;
  });
  ipcMain.handle("close-output", () => {
    closeOutput();
    simulationMode = true;
    broadcastSimulation();
    return {
      simulation: simulationMode,
      outputOpen: false,
    };
  });

  // Atualiza lista quando pluga/despluga projetor + poll (macOS às vezes não dispara evento)
  const notifyDisplays = () => {
    if (operatorWin && !operatorWin.isDestroyed()) {
      operatorWin.webContents.send("displays:update", listDisplays());
    }
  };
  screen.on("display-added", notifyDisplays);
  screen.on("display-removed", notifyDisplays);
  screen.on("display-metrics-changed", notifyDisplays);
  setInterval(notifyDisplays, 2000);

  ipcMain.handle("holyrics:find-default", () => findDefaultExport());

  ipcMain.handle("holyrics:import-path", (_e, filePath) => {
    if (!filePath) throw new Error("Caminho vazio");
    const imported = importFromFile(filePath);
    imported.library = songLibrary.mergeImport(imported.library);
    return imported;
  });

  ipcMain.handle("holyrics:import-dialog", async () => {
    const parent = operatorWin && !operatorWin.isDestroyed() ? operatorWin : undefined;
    const result = await dialog.showOpenDialog(parent, {
      title: "Importar letras do Holyrics",
      filters: [
        { name: "JSON Holyrics", extensions: ["json"] },
        { name: "Todos", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true };
    }
    const imported = importFromFile(result.filePaths[0]);
    imported.library = songLibrary.mergeImport(imported.library);
    return { canceled: false, ...imported };
  });

  ipcMain.handle("holyrics:import-auto", () => {
    const local = songLibrary.loadSongs();
    const found = findDefaultExport();
    if (!found) {
      return {
        found: local.length > 0,
        library: local,
        meta: {
          count: local.length,
          path: local.length ? "library/songs.json" : null,
          source: "local",
        },
      };
    }
    const imported = importFromFile(found);
    const library = songLibrary.mergeImport(imported.library);
    return {
      found: true,
      library,
      meta: {
        ...(imported.meta || {}),
        count: library.length,
        path: found,
        source: "holyrics+local",
      },
    };
  });

  ipcMain.handle("song:save-styles", (_e, payload) => {
    if (!payload?.songId) throw new Error("songId obrigatório");
    return songLibrary.upsertSongStyle(payload.songId, {
      phraseStyles: payload.phraseStyles || [],
      themeId: payload.themeId ?? null,
      uppercase: payload.uppercase ?? null,
      bgMediaPath: payload.bgMediaPath ?? null,
      bgMediaKind: payload.bgMediaKind ?? null,
    });
  });

  ipcMain.handle("song:load-styles", () => songLibrary.loadSongStyles());
  ipcMain.handle("song:list", () => songLibrary.loadSongs());
  ipcMain.handle("song:upsert", (_e, song) => songLibrary.upsertSong(song));
  ipcMain.handle("song:delete", (_e, songId) => songLibrary.deleteSong(songId));
  ipcMain.handle("song:save-library", (_e, songs) => songLibrary.saveSongs(songs));

  ipcMain.handle("plan:load", () => showPlan.loadPlan().items);
  ipcMain.handle("plan:save", (_e, items) => showPlan.savePlan(items).items);

  ipcMain.handle("lyrics:search", (_e, payload) =>
    lyricsSearch.searchLyrics({
      title: payload?.title,
      artist: payload?.artist,
      apiKey: prefs.vagalumeApiKey,
    }),
  );
  ipcMain.handle("lyrics:suggest", (_e, payload) =>
    lyricsSearch.suggestLyrics({
      query: payload?.query ?? payload?.q,
      apiKey: prefs.vagalumeApiKey,
      limit: payload?.limit,
    }),
  );
  ipcMain.handle("lyrics:get-api-key", () => prefs.vagalumeApiKey || null);
  ipcMain.handle("lyrics:set-api-key", (_e, key) => {
    const trimmed = String(key || "").trim();
    prefs = prefsStore.savePrefs({ vagalumeApiKey: trimmed || null });
    return prefs.vagalumeApiKey || null;
  });

  globalShortcut.register("CommandOrControl+Shift+F", () => {
    if (outputWin && !outputWin.isDestroyed()) {
      outputWin.setAlwaysOnTop(true, "screen-saver");
      if (typeof outputWin.showInactive === "function") outputWin.showInactive();
      else outputWin.show();
      if (operatorWin && !operatorWin.isDestroyed()) operatorWin.focus();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  ndiWanted = false;
  closeNdiCaptureWindow();
  ndiSender.destroyAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
