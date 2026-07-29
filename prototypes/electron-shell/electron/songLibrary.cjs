const fs = require("fs");
const path = require("path");
const os = require("os");
const { randomUUID } = require("crypto");

function libraryDir() {
  const dir = path.join(os.homedir(), "ible-projection", "library");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function stylesPath() {
  return path.join(libraryDir(), "song-styles.json");
}

function songsPath() {
  return path.join(libraryDir(), "songs.json");
}

/** Mapa id-da-música → estilos e preferências tipográficas. */
function loadSongStyles() {
  const file = stylesPath();
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveSongStyles(map) {
  fs.writeFileSync(stylesPath(), JSON.stringify(map || {}, null, 2), "utf8");
  return map;
}

function upsertSongStyle(songId, patch) {
  if (!songId) throw new Error("songId obrigatório");
  const all = loadSongStyles();
  all[songId] = { ...(all[songId] || {}), ...patch, updatedAt: Date.now() };
  saveSongStyles(all);
  return all[songId];
}

function applyStylesToLibrary(library) {
  const all = loadSongStyles();
  return (library || []).map((item) => {
    const meta = all[item.id] || all[String(item.id).replace(/-\d+$/, "")];
    if (!meta) return item;
    return {
      ...item,
      phraseStyles: meta.phraseStyles || item.phraseStyles,
      themeId: meta.themeId ?? item.themeId,
      uppercase: meta.uppercase !== undefined ? meta.uppercase : item.uppercase,
      bgMediaPath: meta.bgMediaPath ?? item.bgMediaPath ?? null,
      bgMediaKind: meta.bgMediaKind ?? item.bgMediaKind ?? null,
    };
  });
}

function readSongsStore() {
  const file = songsPath();
  if (!fs.existsSync(file)) {
    return { version: 1, deletedIds: [], songs: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(raw)) {
      return { version: 1, deletedIds: [], songs: raw };
    }
    return {
      version: raw.version || 1,
      deletedIds: Array.isArray(raw.deletedIds) ? raw.deletedIds : [],
      songs: Array.isArray(raw.songs) ? raw.songs : [],
    };
  } catch {
    return { version: 1, deletedIds: [], songs: [] };
  }
}

function writeSongsStore(store) {
  const payload = {
    version: 1,
    deletedIds: store.deletedIds || [],
    songs: store.songs || [],
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(songsPath(), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

/** Normaliza seções da letra (verso/refrão/…) para persistir no songs.json. */
function normalizeSections(sections) {
  if (!Array.isArray(sections)) return null;
  const out = [];
  for (const raw of sections) {
    if (!raw || typeof raw !== "object") continue;
    const lines = Array.isArray(raw.lines)
      ? raw.lines.map((l) => String(l ?? "").trim()).filter(Boolean)
      : [];
    if (!lines.length) continue;
    const kind = String(raw.kind || "verso");
    out.push({
      id: String(raw.id || `sec-${randomUUID().slice(0, 8)}`),
      kind,
      variant: Math.max(0, Number(raw.variant) || 0),
      lines,
    });
  }
  return out.length ? out : null;
}

function normalizeSongRecord(song) {
  if (!song || typeof song !== "object") return null;
  const id = String(song.id || `song-${randomUUID().slice(0, 8)}`);
  const lines = Array.isArray(song.lines)
    ? song.lines.map((l) => String(l ?? "").trim()).filter(Boolean)
    : [];
  const title = String(song.title || song.label || "Sem título").trim() || "Sem título";
  const artist = song.artist != null ? String(song.artist).trim() || null : null;
  const sections = normalizeSections(song.sections);
  const record = {
    id,
    libraryId: song.libraryId || id,
    kind: "lyrics",
    label: artist ? `${title} — ${artist}` : title,
    title,
    artist,
    lines,
    source: song.source || "local",
    themeId: song.themeId ?? null,
    uppercase: song.uppercase ?? null,
    bgMediaPath: song.bgMediaPath ?? null,
    bgMediaKind: song.bgMediaKind ?? null,
    updatedAt: Date.now(),
  };
  if (sections) record.sections = sections;
  if (song.phraseStyles) record.phraseStyles = song.phraseStyles;
  return record;
}

function loadSongs() {
  const store = readSongsStore();
  return applyStylesToLibrary(store.songs.map(normalizeSongRecord).filter(Boolean));
}

function saveSongs(songs) {
  const store = readSongsStore();
  store.songs = (songs || []).map(normalizeSongRecord).filter(Boolean);
  writeSongsStore(store);
  return applyStylesToLibrary(store.songs);
}

function upsertSong(song) {
  const store = readSongsStore();
  const next = normalizeSongRecord(song);
  if (!next) throw new Error("Música inválida");
  const idx = store.songs.findIndex(
    (s) => s.id === next.id || s.libraryId === next.id || s.id === next.libraryId,
  );
  if (idx >= 0) {
    const prev = store.songs[idx] || {};
    const merged = { ...prev, ...next };
    // Se o payload trouxe sections (mesmo vazio → null), aplica;
    // se omitiu o campo, preserva o que já estava gravado.
    if (Object.prototype.hasOwnProperty.call(song, "sections")) {
      if (next.sections) merged.sections = next.sections;
      else delete merged.sections;
    } else if (Array.isArray(prev.sections) && prev.sections.length) {
      merged.sections = prev.sections;
    }
    store.songs[idx] = merged;
  } else {
    store.songs.unshift(next);
  }
  store.deletedIds = (store.deletedIds || []).filter(
    (id) => id !== next.id && id !== next.libraryId,
  );
  writeSongsStore(store);
  const saved = store.songs.find(
    (s) => s.id === next.id || s.libraryId === next.id,
  );
  return applyStylesToLibrary([saved || next])[0];
}

function deleteSong(songId) {
  if (!songId) throw new Error("id obrigatório");
  const store = readSongsStore();
  const before = store.songs.length;
  store.songs = store.songs.filter(
    (s) => s.id !== songId && s.libraryId !== songId,
  );
  if (!store.deletedIds.includes(songId)) store.deletedIds.push(songId);
  writeSongsStore(store);
  // limpa estilos
  const styles = loadSongStyles();
  if (styles[songId]) {
    delete styles[songId];
    saveSongStyles(styles);
  }
  return { ok: true, removed: before !== store.songs.length, songs: loadSongs() };
}

/**
 * Mescla import Holyrics com biblioteca local.
 * Local vence em id conhecido; importados novos entram; deletedIds ficam de fora.
 */
function mergeImport(imported) {
  const store = readSongsStore();
  const deleted = new Set(store.deletedIds || []);
  const byId = new Map();

  for (const s of store.songs) {
    const n = normalizeSongRecord(s);
    if (n) byId.set(n.id, n);
  }

  for (const item of imported || []) {
    const n = normalizeSongRecord({
      ...item,
      source: item.source || "holyrics",
    });
    if (!n) continue;
    if (deleted.has(n.id)) continue;
    if (byId.has(n.id)) continue; // mantém edição local
    byId.set(n.id, n);
  }

  // Se biblioteca local estava vazia, ordem = import
  let songs;
  if (!store.songs.length && (imported || []).length) {
    songs = (imported || [])
      .map((item) => normalizeSongRecord({ ...item, source: item.source || "holyrics" }))
      .filter((n) => n && !deleted.has(n.id));
  } else {
    // locais primeiro (ordem atual), depois novos do import
    const localIds = new Set(store.songs.map((s) => s.id));
    songs = [
      ...store.songs.map(normalizeSongRecord).filter(Boolean),
      ...[...byId.values()].filter((s) => !localIds.has(s.id)),
    ];
  }

  store.songs = songs;
  writeSongsStore(store);
  return applyStylesToLibrary(songs);
}

module.exports = {
  loadSongStyles,
  saveSongStyles,
  upsertSongStyle,
  applyStylesToLibrary,
  libraryPath: stylesPath,
  loadSongs,
  saveSongs,
  upsertSong,
  deleteSong,
  mergeImport,
  songsPath,
  normalizeSongRecord,
};
