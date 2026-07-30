/**
 * Plano do show (ordem do culto) — persiste entre sessões.
 * ~/ible-projection/library/show-plan.json
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

function libraryDir() {
  const dir = path.join(os.homedir(), "ible-projection", "library");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function planPath() {
  return path.join(libraryDir(), "show-plan.json");
}

const KINDS = new Set([
  "lyrics",
  "bible",
  "camera",
  "video",
  "audio",
  "image",
  "deck",
  "web",
  "file",
]);

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const kind = String(raw.kind || "");
  if (!KINDS.has(kind)) return null;
  return {
    id: raw.id,
    libraryId:
      raw.libraryId == null || raw.libraryId === ""
        ? undefined
        : String(raw.libraryId),
    kind,
    label: String(raw.label || raw.title || raw.id),
    lines: Array.isArray(raw.lines) ? raw.lines.map((l) => String(l ?? "")) : [],
    sections: Array.isArray(raw.sections) ? raw.sections : null,
    title: raw.title == null ? undefined : String(raw.title),
    artist: raw.artist == null ? undefined : String(raw.artist),
    source: raw.source == null ? undefined : String(raw.source),
    cameraDeviceId:
      raw.cameraDeviceId == null || raw.cameraDeviceId === ""
        ? null
        : String(raw.cameraDeviceId),
    cameraCaption:
      raw.cameraCaption == null || raw.cameraCaption === ""
        ? null
        : String(raw.cameraCaption),
    mediaVoiceIsolate: Boolean(raw.mediaVoiceIsolate),
    mediaPath:
      raw.mediaPath == null || raw.mediaPath === ""
        ? null
        : String(raw.mediaPath),
    mediaKind: raw.mediaKind == null ? null : String(raw.mediaKind),
    mediaFit: ["contain", "cover", "fill"].includes(raw.mediaFit)
      ? raw.mediaFit
      : null,
    slidePaths: Array.isArray(raw.slidePaths) ? raw.slidePaths : undefined,
    webUrl:
      raw.webUrl == null || raw.webUrl === "" ? null : String(raw.webUrl),
    note: raw.note == null ? undefined : String(raw.note),
    phraseStyles: Array.isArray(raw.phraseStyles) ? raw.phraseStyles : undefined,
    themeId: raw.themeId == null ? null : String(raw.themeId),
    uppercase:
      raw.uppercase === true || raw.uppercase === false ? raw.uppercase : null,
    bgMediaPath:
      raw.bgMediaPath == null || raw.bgMediaPath === ""
        ? null
        : String(raw.bgMediaPath),
    bgMediaKind:
      raw.bgMediaKind === "image" || raw.bgMediaKind === "video"
        ? raw.bgMediaKind
        : null,
  };
}

function loadPlan() {
  const file = planPath();
  if (!fs.existsSync(file)) {
    return { version: 1, items: [], updatedAt: null };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : [];
    const items = [];
    for (const entry of list) {
      const item = normalizeItem(entry);
      if (item) items.push(item);
    }
    return {
      version: 1,
      items,
      updatedAt: raw?.updatedAt || null,
    };
  } catch {
    return { version: 1, items: [], updatedAt: null };
  }
}

function savePlan(items) {
  const normalized = [];
  if (Array.isArray(items)) {
    for (const entry of items) {
      const item = normalizeItem(entry);
      if (item) normalized.push(item);
    }
  }
  const payload = {
    version: 1,
    items: normalized,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(planPath(), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

module.exports = {
  loadPlan,
  savePlan,
  planPath,
};
