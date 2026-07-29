const fs = require("fs");
const path = require("path");
const os = require("os");

/** @typedef {import('../src/theme/types').ProjectionTheme} ProjectionTheme */

const BUILTIN = [
  {
    id: "classic",
    name: "Clássico centro",
    fontFamily: '"Avenir Next", "Segoe UI", system-ui, sans-serif',
    lyricSizeVw: 5.2,
    titleSizeVw: 1.6,
    lyricColor: "#ffffff",
    titleColor: "#ffffff",
    titleOpacity: 0.45,
    fontWeight: 650,
    letterSpacingEm: 0.02,
    lineHeight: 1.2,
    textAlign: "center",
    vertical: "center",
    offsetXPct: 0,
    offsetYPct: 0,
    rotationDeg: 0,
    padXVw: 8,
    padYVh: 8,
    textShadow: "0 3px 28px rgba(0,0,0,0.75)",
    overlayGradient:
      "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 45%, transparent 100%)",
    backgroundColor: "#000000",
    showTitle: true,
    showArtist: false,
    showLyrics: true,
    animation: "fade",
    animationMs: 320,
    animationIntervalMs: 0,
  },
  {
    id: "lower-third",
    name: "Lower third (sobre câmera)",
    fontFamily: '"Avenir Next", "Helvetica Neue", system-ui, sans-serif',
    lyricSizeVw: 4.4,
    titleSizeVw: 1.3,
    lyricColor: "#ffffff",
    titleColor: "#d7dde8",
    titleOpacity: 0.7,
    fontWeight: 600,
    letterSpacingEm: 0.01,
    lineHeight: 1.25,
    textAlign: "center",
    vertical: "bottom",
    offsetXPct: 0,
    offsetYPct: 0,
    rotationDeg: 0,
    padXVw: 6,
    padYVh: 7,
    textShadow: "0 2px 18px rgba(0,0,0,0.85)",
    overlayGradient:
      "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)",
    backgroundColor: "#000000",
    showTitle: false,
    showArtist: false,
    showLyrics: true,
    animation: "slide-up",
    animationMs: 380,
    animationIntervalMs: 0,
  },
  {
    id: "bold",
    name: "Impacto",
    fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
    titleFontFamily: '"Avenir Next", system-ui, sans-serif',
    lyricSizeVw: 6.2,
    titleSizeVw: 1.4,
    lyricColor: "#fff8e7",
    titleColor: "#ffd27a",
    titleOpacity: 0.85,
    fontWeight: 700,
    letterSpacingEm: 0.04,
    lineHeight: 1.1,
    textAlign: "center",
    vertical: "center",
    offsetXPct: 0,
    offsetYPct: 0,
    rotationDeg: 0,
    padXVw: 7,
    padYVh: 6,
    textShadow: "0 4px 0 rgba(0,0,0,0.55), 0 8px 32px rgba(0,0,0,0.65)",
    overlayGradient:
      "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 70%)",
    backgroundColor: "#050505",
    showTitle: true,
    showArtist: false,
    showLyrics: true,
    animation: "fade",
    animationMs: 280,
    animationIntervalMs: 0,
  },
  {
    id: "soft-top",
    name: "Suave topo",
    fontFamily: 'Georgia, "Times New Roman", serif',
    lyricSizeVw: 4.0,
    titleSizeVw: 1.5,
    lyricColor: "#f4f1ea",
    titleColor: "#c9c2b4",
    titleOpacity: 0.8,
    fontWeight: 500,
    letterSpacingEm: 0.03,
    lineHeight: 1.35,
    textAlign: "center",
    vertical: "top",
    offsetXPct: 0,
    offsetYPct: 0,
    rotationDeg: 0,
    padXVw: 10,
    padYVh: 10,
    textShadow: "0 2px 16px rgba(0,0,0,0.7)",
    overlayGradient:
      "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)",
    backgroundColor: "#0b0b0b",
    showTitle: true,
    showArtist: true,
    showLyrics: true,
    animation: "slide-down",
    animationMs: 400,
    animationIntervalMs: 0,
  },
];

function themesDir() {
  return path.join(os.homedir(), "ible-projection", "themes");
}

function ensureThemesDir() {
  const dir = themesDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listImportedThemes() {
  const dir = ensureThemesDir();
  /** @type {ProjectionTheme[]} */
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      const theme = normalizeTheme(raw, path.basename(name, ".json"));
      if (theme) out.push(theme);
    } catch {
      /* ignore broken */
    }
  }
  return out;
}

function normalizeTheme(raw, fallbackId) {
  if (!raw || typeof raw !== "object") return null;
  const base = {
    ...BUILTIN.find((t) => t.id === "lower-third"),
    offsetXPct: 0,
    offsetYPct: 0,
    animation: "fade",
    animationMs: 350,
    animationIntervalMs: 0,
    phraseFontFamily: undefined,
    showTitle: false,
    showArtist: false,
    showLyrics: true,
    rotationDeg: 0,
  };
  return {
    ...base,
    ...raw,
    id: String(raw.id || fallbackId || `theme-${Date.now()}`),
    name: String(raw.name || raw.id || "Tema importado"),
    offsetXPct: Number(raw.offsetXPct ?? base.offsetXPct ?? 0),
    offsetYPct: Number(raw.offsetYPct ?? base.offsetYPct ?? 0),
    titleOffsetXPct: Number(raw.titleOffsetXPct ?? base.titleOffsetXPct ?? 0),
    titleOffsetYPct: Number(raw.titleOffsetYPct ?? base.titleOffsetYPct ?? 0),
    rotationDeg: Number(raw.rotationDeg ?? 0) || 0,
    titleRotationDeg: Number(raw.titleRotationDeg ?? 0) || 0,
    animation: raw.animation || base.animation || "fade",
    animationMs: Number(raw.animationMs ?? base.animationMs ?? 350),
    animationIntervalMs: Math.max(
      0,
      Number(raw.animationIntervalMs ?? base.animationIntervalMs ?? 0) || 0,
    ),
    showTitle: raw.showTitle !== undefined ? Boolean(raw.showTitle) : Boolean(base.showTitle),
    showArtist: raw.showArtist !== undefined ? Boolean(raw.showArtist) : Boolean(base.showArtist),
    showLyrics: raw.showLyrics === false ? false : true,
    titlePlacement: "above",
    uppercase: Boolean(raw.uppercase),
    wrapLines: Boolean(raw.wrapLines),
    backgroundImage: raw.backgroundImage ? String(raw.backgroundImage) : null,
    backgroundVideo: raw.backgroundVideo ? String(raw.backgroundVideo) : null,
    safeArea: normalizeSafeArea(
      raw.safeArea,
      Number(raw.padXVw ?? base.padXVw ?? 6),
      Number(raw.padYVh ?? base.padYVh ?? 6),
    ),
  };
}

function clampSafePct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(40, v));
}

function normalizeSafeArea(raw, padX, padY) {
  if (raw && typeof raw === "object") {
    const top = clampSafePct(raw.top);
    const left = clampSafePct(raw.left);
    const bottom = clampSafePct(raw.bottom);
    const right = clampSafePct(raw.right);
    const maxTB = Math.max(0, 80 - top);
    const maxLR = Math.max(0, 80 - left);
    return {
      top,
      left,
      bottom: Math.min(bottom, maxTB),
      right: Math.min(right, maxLR),
    };
  }
  const x = clampSafePct(padX);
  const y = clampSafePct(padY);
  return { top: y, right: x, bottom: y, left: x };
}

function listAllThemes() {
  const imported = listImportedThemes();
  const ids = new Set(imported.map((t) => t.id));
  return [...BUILTIN.filter((t) => !ids.has(t.id)), ...imported];
}

function slugifyThemeId(name) {
  const base = String(name || "tema")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || `tema-${Date.now()}`;
}

/** Converte file:// / iblemedia:// para caminho no disco */
function mediaPathToFs(p) {
  if (!p || typeof p !== "string") return null;
  if (p.startsWith("file://")) {
    try {
      return decodeURIComponent(p.replace(/^file:\/\//i, ""));
    } catch {
      return p.replace(/^file:\/\//i, "");
    }
  }
  if (/^iblemedia:\/\/local/i.test(p)) {
    const rest = p.replace(/^iblemedia:\/\/local/i, "");
    try {
      return decodeURIComponent(rest);
    } catch {
      return rest;
    }
  }
  return p;
}

/** Copia mídia do tema para ~/ible-projection/themes/media/<themeId>/ */
function embedThemeMedia(theme) {
  const next = { ...theme };
  const mediaDir = path.join(ensureThemesDir(), "media", next.id);
  for (const key of ["backgroundImage", "backgroundVideo"]) {
    const src = mediaPathToFs(next[key]);
    if (!src) {
      next[key] = null;
      continue;
    }
    if (!fs.existsSync(src)) continue;
    // Já está na pasta deste tema?
    if (src === mediaDir || src.startsWith(mediaDir + path.sep)) {
      next[key] = src;
      continue;
    }
    fs.mkdirSync(mediaDir, { recursive: true });
    const ext = path.extname(src) || (key === "backgroundVideo" ? ".mp4" : ".jpg");
    const dest = path.join(mediaDir, `${key}${ext}`);
    try {
      fs.copyFileSync(src, dest);
      next[key] = dest;
    } catch {
      next[key] = src;
    }
  }
  return next;
}

/** Grava tema em disco (sobrescreve se o id já existir) */
function saveTheme(theme) {
  let normalized = normalizeTheme(theme, theme?.id);
  if (!normalized) throw new Error("Tema inválido");
  normalized = embedThemeMedia(normalized);
  const dest = path.join(ensureThemesDir(), `${normalized.id}.json`);
  fs.writeFileSync(dest, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

/** Cria cópia com novo nome/id */
function saveThemeAs(theme, newName) {
  const name = String(newName || "").trim() || "Tema novo";
  let id = slugifyThemeId(name);
  const existing = new Set(listAllThemes().map((t) => t.id));
  if (existing.has(id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
  return saveTheme({ ...theme, id, name });
}

function deleteTheme(themeId) {
  if (!themeId) return { ok: false, error: "id vazio" };
  if (BUILTIN.some((t) => t.id === themeId)) {
    return { ok: false, error: "Não é possível apagar tema embutido" };
  }
  const dest = path.join(ensureThemesDir(), `${themeId}.json`);
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  const mediaDir = path.join(ensureThemesDir(), "media", themeId);
  if (fs.existsSync(mediaDir)) {
    try {
      fs.rmSync(mediaDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  return { ok: true, themes: listAllThemes() };
}

function importThemeFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const theme = normalizeTheme(raw, path.basename(filePath, ".json"));
  if (!theme) throw new Error("JSON de tema inválido");
  return saveTheme(theme);
}

function getBuiltin() {
  return BUILTIN;
}

function defaultTheme() {
  return { ...(BUILTIN.find((t) => t.id === "lower-third") || BUILTIN[0]) };
}

function defaultBibleTheme() {
  return {
    id: "bible-serif",
    name: "Bíblia (serif)",
    fontFamily: 'Georgia, "Times New Roman", serif',
    titleFontFamily: '"Avenir Next", system-ui, sans-serif',
    lyricSizeVw: 4.2,
    titleSizeVw: 1.5,
    lyricColor: "#f4f1ea",
    titleColor: "#c9c2b4",
    titleOpacity: 0.85,
    fontWeight: 500,
    letterSpacingEm: 0.01,
    lineHeight: 1.4,
    textAlign: "center",
    vertical: "center",
    offsetXPct: 0,
    offsetYPct: 0,
    rotationDeg: 0,
    padXVw: 10,
    padYVh: 10,
    textShadow: "0 2px 16px rgba(0,0,0,0.7)",
    overlayGradient:
      "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)",
    backgroundColor: "#0b0b0b",
    showTitle: true,
    showArtist: false,
    showLyrics: true,
    wrapLines: true,
    animation: "fade",
    animationMs: 320,
    animationIntervalMs: 0,
  };
}

module.exports = {
  listAllThemes,
  listImportedThemes,
  importThemeFile,
  saveTheme,
  saveThemeAs,
  deleteTheme,
  getBuiltin,
  defaultTheme,
  defaultBibleTheme,
  themesDir,
  normalizeTheme,
  BUILTIN,
};
