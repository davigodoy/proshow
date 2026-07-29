const fs = require("fs");
const path = require("path");
const os = require("os");
const { splitLyricsIntoSlides } = require("./lyricsText.cjs");

/**
 * Converte export Holyrics (GetSongs / ExportSongs) em itens de biblioteca.
 * Formatos aceitos:
 * - { songs: [ { id, title, artist, author, lyrics, slides[] } ] }
 * - { data: [ ... ] }  (resposta API GetSongs)
 * - [ ... ]            (array direto)
 */
function normalizeSong(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id ?? raw._id ?? `hly-${index}`);
  const title = String(raw.title || raw.name || "Sem título").trim();
  const artist = String(raw.artist || "").trim();
  const author = String(raw.author || "").trim();
  const label = artist ? `${title} — ${artist}` : title;

  let slides = [];
  if (Array.isArray(raw.slides) && raw.slides.length) {
    slides = raw.slides
      .map((s) => {
        if (typeof s === "string") return s.trim();
        if (s && typeof s === "object") {
          return String(s.text || s.content || s.lyrics || "").trim();
        }
        return "";
      })
      .filter(Boolean);
  } else if (typeof raw.lyrics === "string" && raw.lyrics.trim()) {
    slides = splitLyricsIntoSlides(raw.lyrics);
  }

  if (!slides.length && title) {
    slides = [title];
  }

  // Cada entrada = um slide (pode ter várias linhas com \n)
  const lines = slides.length ? slides : [label];

  return {
    id: `hly-${id}`,
    kind: "lyrics",
    label,
    title,
    artist,
    author,
    lines,
    slides: lines,
    source: "holyrics",
  };
}

function extractSongsArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.songs)) return parsed.songs;
  if (Array.isArray(parsed?.data)) return parsed.data;
  return [];
}

function importFromJsonText(text) {
  const parsed = JSON.parse(text);
  const songs = extractSongsArray(parsed);
  const library = [];
  for (let i = 0; i < songs.length; i++) {
    const item = normalizeSong(songs[i], i);
    if (item) library.push(item);
  }
  return {
    library,
    meta: {
      source: parsed?.source || "holyrics",
      ok: parsed?.ok ?? library.length,
      fail: parsed?.fail ?? 0,
      count: library.length,
    },
  };
}

function importFromFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const result = importFromJsonText(text);
  result.meta.path = filePath;
  return result;
}

function defaultCandidatePaths() {
  const home = os.homedir();
  const env = process.env.HOLYRICS_SONGS_JSON;
  const candidates = [];
  if (env) candidates.push(env);
  candidates.push(
    path.join(home, "Downloads", "holyrics-songs.json"),
    path.join(home, "Desktop", "holyrics-songs.json"),
    path.join(__dirname, "..", "data", "holyrics-songs.json"),
  );
  return candidates;
}

function findDefaultExport() {
  for (const p of defaultCandidatePaths()) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

module.exports = {
  importFromFile,
  importFromJsonText,
  findDefaultExport,
  defaultCandidatePaths,
  normalizeSong,
};
