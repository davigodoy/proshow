/**
 * Preferências do operador — sobrevivem a fechar/reabrir o app.
 * ~/ible-projection/operator-prefs.json
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const PREFS_PATH = path.join(os.homedir(), "ible-projection", "operator-prefs.json");

const DEFAULTS = {
  simulation: true,
  gateTitle: true,
  gateArtist: true,
  gateLyrics: true,
  showText: true,
  bgCameraEnabled: false,
  bgCameraDeviceId: null,
  ndiEnabled: false,
  ndiName: "ProShow",
  outputMode: "single",
  outputDisplayId: null,
  bibleThemeId: null,
  bibleShowTitle: true,
  bibleShowLyrics: true,
  /** Modo criativo (só letras de música) — restaura na próxima sessão */
  stackArtistic: false,
  /** Sub-modo Max do criativo (empilha até 3 frases) — só vale com stackArtistic ligado */
  stackArtisticMax: false,
  /** Slots rápidos (Show → ao vivo): vídeo/imagem pré-selecionados pra ir ao ar num clique */
  quickVideoItem: null,
  quickImageItem: null,
  /** Chave gratuita da API Vagalume — busca de letra online no editor de música */
  vagalumeApiKey: null,
  /** Espectro de áudio na projeção (fundo ou HUD) */
  spectrum: {
    enabled: false,
    style: "bars-neon",
    placement: "background",
    source: "audio-device",
    audioDeviceId: null,
    channel: "mix",
    opacity: 0.55,
    monitorAudio: false,
  },
  /** Auto-avanço — entrada própria, independente do espectro */
  autoAdvance: {
    enabled: false,
    audioDeviceId: null,
    channel: "mix",
  },
};

function normalizeSpectrum(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const styles = new Set([
    "bars-neon",
    "bars-mirror",
    "wave-silk",
    "radial-pulse",
    "mesh-3d",
    "particles",
  ]);
  let channel = "mix";
  if (r.channel === "l" || r.channel === "r") channel = r.channel;
  else if (typeof r.channel === "number" && Number.isFinite(r.channel)) {
    channel = Math.max(0, Math.floor(r.channel));
  } else if (typeof r.channel === "string" && /^\d+$/.test(r.channel)) {
    channel = Math.max(0, parseInt(r.channel, 10));
  }
  return {
    enabled: Boolean(r.enabled),
    style: styles.has(r.style) ? r.style : DEFAULTS.spectrum.style,
    placement: r.placement === "hud" ? "hud" : "background",
    source:
      r.source === "camera" || r.source === "media" ? r.source : "audio-device",
    audioDeviceId:
      r.audioDeviceId == null || r.audioDeviceId === ""
        ? null
        : String(r.audioDeviceId),
    channel,
    opacity: Math.min(
      1,
      Math.max(0.05, Number(r.opacity) || DEFAULTS.spectrum.opacity),
    ),
    monitorAudio: Boolean(r.monitorAudio),
  };
}

function normalizeAutoAdvance(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  let channel = "mix";
  if (r.channel === "l" || r.channel === "r") channel = r.channel;
  else if (typeof r.channel === "number" && Number.isFinite(r.channel)) {
    channel = Math.max(0, Math.floor(r.channel));
  } else if (typeof r.channel === "string" && /^\d+$/.test(r.channel)) {
    channel = Math.max(0, parseInt(r.channel, 10));
  }
  return {
    enabled: Boolean(r.enabled),
    audioDeviceId:
      r.audioDeviceId == null || r.audioDeviceId === ""
        ? null
        : String(r.audioDeviceId),
    channel,
  };
}

function normalizeQuickItem(v) {
  if (!v || typeof v !== "object") return null;
  if (typeof v.id !== "string" || typeof v.mediaPath !== "string") return null;
  return {
    id: v.id,
    kind: String(v.kind || ""),
    label: String(v.label || v.id),
    title: v.title ? String(v.title) : null,
    lines: Array.isArray(v.lines) ? v.lines.map(String) : [],
    mediaPath: v.mediaPath,
    mediaKind: v.mediaKind ? String(v.mediaKind) : null,
    mediaFit: ["contain", "cover", "fill"].includes(v.mediaFit) ? v.mediaFit : null,
    slidePaths: Array.isArray(v.slidePaths) ? v.slidePaths : null,
  };
}

function loadPrefs() {
  try {
    if (!fs.existsSync(PREFS_PATH)) return { ...DEFAULTS };
    const raw = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8"));
    return normalize({ ...DEFAULTS, ...raw });
  } catch {
    return { ...DEFAULTS };
  }
}

function normalize(p) {
  return {
    simulation: p.simulation !== false,
    gateTitle: p.gateTitle !== false,
    gateArtist: p.gateArtist !== false,
    gateLyrics: p.gateLyrics !== false,
    showText: p.showText !== false,
    bgCameraEnabled: Boolean(p.bgCameraEnabled),
    bgCameraDeviceId:
      p.bgCameraDeviceId == null || p.bgCameraDeviceId === ""
        ? null
        : String(p.bgCameraDeviceId),
    ndiEnabled: Boolean(p.ndiEnabled),
    ndiName: String(p.ndiName || DEFAULTS.ndiName).trim() || DEFAULTS.ndiName,
    outputMode: p.outputMode === "span" ? "span" : "single",
    outputDisplayId:
      p.outputDisplayId == null || Number.isNaN(Number(p.outputDisplayId))
        ? null
        : Number(p.outputDisplayId),
    bibleThemeId:
      p.bibleThemeId == null || p.bibleThemeId === ""
        ? null
        : String(p.bibleThemeId),
    bibleShowTitle: p.bibleShowTitle !== false,
    bibleShowLyrics: p.bibleShowLyrics !== false,
    stackArtistic: Boolean(p.stackArtistic),
    stackArtisticMax: Boolean(p.stackArtisticMax),
    quickVideoItem: normalizeQuickItem(p.quickVideoItem),
    quickImageItem: normalizeQuickItem(p.quickImageItem),
    vagalumeApiKey:
      p.vagalumeApiKey == null || String(p.vagalumeApiKey).trim() === ""
        ? null
        : String(p.vagalumeApiKey).trim(),
    spectrum: normalizeSpectrum(p.spectrum),
    autoAdvance: normalizeAutoAdvance(p.autoAdvance),
  };
}

function savePrefs(partial) {
  const next = normalize({ ...loadPrefs(), ...partial });
  try {
    fs.mkdirSync(path.dirname(PREFS_PATH), { recursive: true });
    fs.writeFileSync(PREFS_PATH, JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    console.error("[prefs] save failed", err);
  }
  return next;
}

module.exports = {
  DEFAULTS,
  PREFS_PATH,
  loadPrefs,
  savePrefs,
  normalize,
};
