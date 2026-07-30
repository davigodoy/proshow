const fs = require("fs");
const path = require("path");
const os = require("os");
const { randomUUID } = require("crypto");
const { spawnSync } = require("child_process");

const VIDEO_EXTS = [
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
  ".avi",
  ".mpeg",
  ".mpg",
  ".m2ts",
  ".mts",
  ".ts",
  ".3gp",
  ".ogv",
  ".wmv",
  ".flv",
];

const AUDIO_EXTS = [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac", ".aiff", ".aif"];

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

const DECK_EXTS = [".ppt", ".pptx", ".key", ".pdf"];

const NATIVE_VIDEO = new Set([".mp4", ".mov", ".m4v", ".webm", ".ogv"]);

const REMUX_CANDIDATES = new Set([
  ".mkv",
  ".avi",
  ".m2ts",
  ".mts",
  ".ts",
  ".wmv",
  ".flv",
  ".mpeg",
  ".mpg",
]);

function mediaRoot() {
  const dir = path.join(os.homedir(), "ible-projection", "media");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findFfmpeg() {
  const candidates = [
    "ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ];
  for (const bin of candidates) {
    const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return bin;
  }
  return null;
}

function findFfprobe() {
  // 1) Binário empacotado via npm — confiável no Electron (PATH limitado)
  try {
    const installer = require("@ffprobe-installer/ffprobe");
    const bundled = installer?.path;
    if (bundled && fs.existsSync(bundled)) {
      const r = spawnSync(bundled, ["-version"], { encoding: "utf8" });
      if (r.status === 0) return bundled;
    }
  } catch {
    /* pacote ausente */
  }

  const candidates = [
    "ffprobe",
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "/usr/bin/ffprobe",
  ];
  for (const bin of candidates) {
    const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return bin;
  }
  // Fallback: ao lado do ffmpeg
  const ffmpeg = findFfmpeg();
  if (ffmpeg) {
    const sibling = ffmpeg.replace(/ffmpeg$/i, "ffprobe");
    if (sibling !== ffmpeg) {
      const r = spawnSync(sibling, ["-version"], { encoding: "utf8" });
      if (r.status === 0) return sibling;
    }
  }
  return null;
}

function formatBitrate(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mbps`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} kbps`;
  return `${Math.round(n)} bps`;
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function formatFps(rate) {
  if (rate == null || rate === "0/0" || rate === "N/A") return null;
  if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
    return Number.isInteger(rate) ? `${rate}` : rate.toFixed(2);
  }
  const s = String(rate);
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    if (b && Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
      const v = a / b;
      return Number.isInteger(v) ? `${v}` : v.toFixed(2);
    }
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

function channelLayoutLabel(channels, layout) {
  if (layout && String(layout).trim() && layout !== "unknown") {
    return String(layout).replace(/_/g, " ");
  }
  const n = Number(channels);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n === 1) return "mono";
  if (n === 2) return "stereo";
  return `${n} canais`;
}

/**
 * Metadados detalhados via ffprobe (codec, fps, áudio, bitrate…).
 */
function probeMediaFile(filePath) {
  const full = String(filePath || "").trim();
  if (!full || !fs.existsSync(full)) {
    return { ok: false, error: "Arquivo não encontrado" };
  }
  const ffprobe = findFfprobe();
  if (!ffprobe) {
    return { ok: false, error: "ffprobe ausente — instale ffmpeg" };
  }

  const r = spawnSync(
    ffprobe,
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      full,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 20000 },
  );
  if (r.status !== 0) {
    return {
      ok: false,
      error: (r.stderr || r.stdout || "Falha no ffprobe").slice(0, 200),
    };
  }

  let data;
  try {
    data = JSON.parse(r.stdout || "{}");
  } catch {
    return { ok: false, error: "JSON inválido do ffprobe" };
  }

  const format = data.format || {};
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const video = streams.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const audio = streams.find((s) => s.codec_type === "audio");
  const tags = { ...(format.tags || {}), ...(video?.tags || {}), ...(audio?.tags || {}) };

  const width = video?.width ? Number(video.width) : null;
  const height = video?.height ? Number(video.height) : null;
  const duration =
    Number(format.duration) ||
    Number(video?.duration) ||
    Number(audio?.duration) ||
    null;
  const sizeBytes = Number(format.size) || null;
  const bitrate = Number(format.bit_rate) || Number(video?.bit_rate) || null;
  const audioBitrate = Number(audio?.bit_rate) || null;
  const fps =
    formatFps(video?.avg_frame_rate) ||
    formatFps(video?.r_frame_rate) ||
    null;
  const sampleRate = audio?.sample_rate ? Number(audio.sample_rate) : null;
  const channels = audio?.channels ? Number(audio.channels) : null;
  const channelLayout = channelLayoutLabel(channels, audio?.channel_layout);

  let rotation = null;
  const sideData = Array.isArray(video?.side_data_list) ? video.side_data_list : [];
  for (const side of sideData) {
    if (side?.rotation != null) {
      rotation = Number(side.rotation);
      break;
    }
  }
  if (rotation == null && tags.rotate != null) rotation = Number(tags.rotate);

  return {
    ok: true,
    probe: {
      format: (format.format_long_name || format.format_name || path.extname(full).slice(1) || "")
        .split(",")[0]
        .trim(),
      container: format.format_name || null,
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      sizeLabel: formatBytes(sizeBytes),
      bitrate,
      bitrateLabel: formatBitrate(bitrate),
      fps,
      videoCodec: video?.codec_name || null,
      videoCodecLong: video?.codec_long_name || null,
      videoProfile: video?.profile || null,
      pixelFormat: video?.pix_fmt || null,
      colorSpace: video?.color_space || null,
      audioCodec: audio?.codec_name || null,
      audioCodecLong: audio?.codec_long_name || null,
      audioBitrate,
      audioBitrateLabel: formatBitrate(audioBitrate),
      sampleRate: Number.isFinite(sampleRate) ? sampleRate : null,
      channels: Number.isFinite(channels) ? channels : null,
      channelLayout,
      rotation: Number.isFinite(rotation) ? rotation : null,
      hasVideo: Boolean(video),
      hasAudio: Boolean(audio),
      streamCount: streams.length,
      title: tags.title || tags.TITLE || null,
      artist: tags.artist || tags.ARTIST || null,
    },
  };
}

function mimeFor(ext, kind) {
  const e = ext.toLowerCase();
  if (kind === "image") {
    if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
    if (e === ".png") return "image/png";
    if (e === ".gif") return "image/gif";
    if (e === ".webp") return "image/webp";
    return "image/*";
  }
  if (kind === "audio") {
    if (e === ".mp3") return "audio/mpeg";
    if (e === ".wav") return "audio/wav";
    if (e === ".aac" || e === ".m4a") return "audio/mp4";
    if (e === ".ogg") return "audio/ogg";
    if (e === ".flac") return "audio/flac";
    return "audio/*";
  }
  if (kind === "video") {
    if (e === ".webm") return "video/webm";
    if (e === ".ogv") return "video/ogg";
    if (e === ".mov") return "video/quicktime";
    return "video/mp4";
  }
  return "application/octet-stream";
}

function classify(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTS.includes(ext)) {
    return { kind: "image", mime: mimeFor(ext, "image"), ext };
  }
  if (VIDEO_EXTS.includes(ext)) {
    return { kind: "video", mime: mimeFor(ext, "video"), ext };
  }
  if (AUDIO_EXTS.includes(ext)) {
    return { kind: "audio", mime: mimeFor(ext, "audio"), ext };
  }
  if (DECK_EXTS.includes(ext)) {
    return { kind: "deck", mime: "application/octet-stream", ext };
  }
  return { kind: "file", mime: "application/octet-stream", ext };
}

function maybeRemux(srcPath, destDir, id) {
  const ext = path.extname(srcPath).toLowerCase();
  if (NATIVE_VIDEO.has(ext) || !REMUX_CANDIDATES.has(ext)) {
    return { path: null, remuxed: false, note: null };
  }
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    return {
      path: null,
      remuxed: false,
      note: "ffmpeg ausente — MKV/AVI podem não tocar; use MP4/MOV ou instale ffmpeg",
    };
  }
  const outPath = path.join(destDir, `${Date.now()}-${id}-remux.mp4`);
  const copy = spawnSync(
    ffmpeg,
    ["-y", "-i", srcPath, "-c", "copy", "-movflags", "+faststart", outPath],
    { encoding: "utf8" },
  );
  if (copy.status === 0 && fs.existsSync(outPath)) {
    return { path: outPath, remuxed: true, note: "Remuxado para MP4 (ffmpeg)" };
  }
  const encode = spawnSync(
    ffmpeg,
    [
      "-y",
      "-i",
      srcPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outPath,
    ],
    { encoding: "utf8" },
  );
  if (encode.status === 0 && fs.existsSync(outPath)) {
    return { path: outPath, remuxed: true, note: "Convertido para MP4 (ffmpeg)" };
  }
  return {
    path: null,
    remuxed: false,
    note: "Falha ao converter com ffmpeg — exporte como MP4 H.264",
  };
}

function importMediaFiles(filePaths, { skipDecks = false } = {}) {
  const root = mediaRoot();
  const imported = [];
  const deferredDecks = [];
  for (const src of filePaths) {
    if (!src || !fs.existsSync(src)) continue;
    const cls = classify(src);
    if (cls.kind === "deck") {
      if (!skipDecks) deferredDecks.push(src);
      continue;
    }
    const base = path.basename(src);
    const id = randomUUID().slice(0, 8);
    const destName = `${Date.now()}-${id}-${base}`;
    const dest = path.join(root, destName);
    fs.copyFileSync(src, dest);

    let playPath = dest;
    let note = null;
    if (cls.kind === "video") {
      const remux = maybeRemux(dest, root, id);
      if (remux.path) {
        playPath = remux.path;
        note = remux.note;
      } else if (remux.note) {
        note = remux.note;
      }
    }

    imported.push({
      id: `media-${id}`,
      kind: cls.kind,
      label: base,
      path: playPath,
      sourcePath: dest,
      mime: playPath.endsWith(".mp4") && cls.kind === "video" ? "video/mp4" : cls.mime,
      note,
      ffmpeg: Boolean(findFfmpeg()),
      lines:
        cls.kind === "video"
          ? ["[ vídeo ]"]
          : cls.kind === "audio"
            ? ["[ áudio ]"]
            : cls.kind === "image"
              ? ["[ imagem ]"]
              : ["[ arquivo ]"],
      slidePaths: cls.kind === "image" ? [playPath] : undefined,
    });
  }
  return { items: imported, deckPaths: deferredDecks };
}

function listMedia() {
  const root = mediaRoot();
  const names = fs.readdirSync(root);
  const remuxById = new Map();
  for (const name of names) {
    const m = name.match(/^\d+-([a-f0-9]+)-remux\.mp4$/);
    if (m) remuxById.set(m[1], path.join(root, name));
  }

  return names
    .filter((name) => name !== "decks" && !/-remux\.mp4$/i.test(name))
    .filter((name) => {
      const full = path.join(root, name);
      try {
        return fs.statSync(full).isFile();
      } catch {
        return false;
      }
    })
    .map((name) => {
      const full = path.join(root, name);
      const cls = classify(full);
      if (cls.kind === "deck") return null;
      const idMatch = name.match(/^\d+-([a-f0-9]+)-/);
      const remux = idMatch ? remuxById.get(idMatch[1]) : null;
      return {
        id: `media-${name}`,
        kind: cls.kind,
        label: name.replace(/^\d+-[a-f0-9]+-/, ""),
        path: remux || full,
        mime: remux ? "video/mp4" : cls.mime,
        lines:
          cls.kind === "video"
            ? ["[ vídeo ]"]
            : cls.kind === "audio"
              ? ["[ áudio ]"]
              : cls.kind === "image"
                ? ["[ imagem ]"]
                : ["[ mídia ]"],
        slidePaths: cls.kind === "image" ? [remux || full] : undefined,
      };
    })
    .filter(Boolean);
}

function extFromContentType(ctype) {
  const c = String(ctype || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const map = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/ogg": ".ogv",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/aac": ".aac",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
  };
  return map[c] || null;
}

function kindFromContentType(ctype) {
  const c = String(ctype || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (c.startsWith("image/")) return "image";
  if (c.startsWith("video/")) return "video";
  if (c.startsWith("audio/")) return "audio";
  return null;
}

function findYtDlp() {
  const candidates = [
    "yt-dlp",
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
  ];
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return bin;
  }
  return null;
}

function youtubeVideoId(rawUrl) {
  try {
    const u = new URL(String(rawUrl || "").trim());
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "embed" ||
          parts[0] === "shorts" ||
          parts[0] === "live" ||
          parts[0] === "v") &&
        parts[1]
      ) {
        return parts[1];
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function youtubeEmbedUrl(videoId) {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`;
}

/**
 * Baixa vídeo do YouTube com yt-dlp (se instalado).
 */
function downloadYouTube(rawUrl, destDir, id) {
  const ytDlp = findYtDlp();
  if (!ytDlp) return { ok: false, error: "yt-dlp ausente" };
  const outTpl = path.join(destDir, `${Date.now()}-${id}-%(title).80B.%(ext)s`);
  const r = spawnSync(
    ytDlp,
    [
      "--no-playlist",
      "--no-warnings",
      "-f",
      "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
      "--merge-output-format",
      "mp4",
      "-o",
      outTpl,
      rawUrl,
    ],
    { encoding: "utf8", timeout: 180000 },
  );
  if (r.status !== 0) {
    return {
      ok: false,
      error: (r.stderr || r.stdout || "Falha no yt-dlp").slice(0, 240),
    };
  }
  const names = fs
    .readdirSync(destDir)
    .filter((n) => n.includes(`-${id}-`))
    .map((n) => ({ n, t: fs.statSync(path.join(destDir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!names.length) return { ok: false, error: "yt-dlp não gerou arquivo" };
  const full = path.join(destDir, names[0].n);
  return { ok: true, path: full, label: path.basename(full) };
}

/**
 * Importa URL: mídia direta (download), YouTube, ou qualquer página web (iframe).
 */
async function importMediaUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    return { ok: false, error: "URL inválida" };
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return { ok: false, error: "Use http:// ou https://" };
  }

  const root = mediaRoot();
  const id = randomUUID().slice(0, 8);
  const ytId = youtubeVideoId(parsed.href);

  function asWebPage(note) {
    const host = parsed.hostname.replace(/^www\./i, "");
    const pathPart =
      parsed.pathname && parsed.pathname !== "/"
        ? parsed.pathname.replace(/\/$/, "").slice(0, 56)
        : "";
    const label = pathPart ? `${host}${pathPart}` : host || parsed.href;
    return {
      ok: true,
      items: [
        {
          id: `media-${id}`,
          kind: "web",
          label,
          title: label,
          path: parsed.href,
          sourceUrl: parsed.href,
          mime: "text/html",
          note: note || "Página web",
          lines: ["[ página web ]"],
        },
      ],
    };
  }

  if (ytId) {
    const downloaded = downloadYouTube(parsed.href, root, id);
    if (downloaded.ok && downloaded.path) {
      return {
        ok: true,
        items: [
          {
            id: `media-${id}`,
            kind: "video",
            label: downloaded.label || `YouTube ${ytId}`,
            title: downloaded.label || `YouTube ${ytId}`,
            path: downloaded.path,
            sourcePath: downloaded.path,
            sourceUrl: parsed.href,
            mime: "video/mp4",
            note: "YouTube baixado com yt-dlp",
            ffmpeg: Boolean(findFfmpeg()),
            lines: ["[ vídeo ]"],
          },
        ],
      };
    }

    return {
      ok: true,
      items: [
        {
          id: `media-${id}`,
          kind: "web",
          label: `YouTube ${ytId}`,
          title: `YouTube ${ytId}`,
          path: youtubeEmbedUrl(ytId),
          sourceUrl: parsed.href,
          mime: "text/html",
          note:
            downloaded.error === "yt-dlp ausente"
              ? "YouTube via embed. Para baixar o arquivo, instale yt-dlp."
              : `YouTube via embed (${downloaded.error || "download falhou"}).`,
          lines: ["[ YouTube ]"],
        },
      ],
    };
  }

  // Extensão conhecida de mídia → baixa arquivo
  const pathExt = path.extname(parsed.pathname).toLowerCase();
  const pathCls = pathExt ? classify(`file${pathExt}`) : null;
  const looksLikeMediaFile =
    pathCls &&
    (pathCls.kind === "image" ||
      pathCls.kind === "video" ||
      pathCls.kind === "audio");

  // Sem extensão de mídia e sem YouTube: trata como página (sem HEAD —
  // evita travar o operador em hosts lentos / que bloqueiam HEAD).
  if (!looksLikeMediaFile) {
    return asWebPage("Página web");
  }

  let res;
  try {
    res = await fetch(parsed.href, {
      redirect: "follow",
      headers: { Accept: "image/*,video/*,audio/*,*/*" },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    // Se o download falhar, tenta como página web
    return asWebPage(`Página web (download falhou: ${err?.message || err})`);
  }
  if (!res.ok) {
    return asWebPage(`Página web (HTTP ${res.status})`);
  }

  const ctype = (res.headers.get("content-type") || "").split(";")[0].trim();
  if (/^text\/html/i.test(ctype) || /^application\/xhtml/i.test(ctype)) {
    return asWebPage("Página web");
  }

  let ext = pathExt;
  let cls = looksLikeMediaFile
    ? pathCls
    : ext
      ? classify(`file${ext}`)
      : { kind: "file", mime: ctype, ext: "" };
  if (cls.kind === "file" || cls.kind === "deck" || !ext) {
    const byType = kindFromContentType(ctype);
    const typeExt = extFromContentType(ctype);
    if (!byType || !typeExt) {
      return asWebPage("Página web");
    }
    cls = {
      kind: byType,
      mime: mimeFor(typeExt, byType),
      ext: typeExt,
    };
    ext = typeExt;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return asWebPage("Página web (resposta vazia)");

  const baseName =
    path.basename(parsed.pathname).replace(/[^\w.\-]+/g, "_") ||
    `url-media${ext}`;
  const safeBase = baseName.includes(".") ? baseName : `${baseName}${ext}`;
  const destName = `${Date.now()}-${id}-${safeBase}`;
  const dest = path.join(root, destName);
  fs.writeFileSync(dest, buf);

  let playPath = dest;
  let note = `Importado de URL`;
  if (cls.kind === "video") {
    const remux = maybeRemux(dest, root, id);
    if (remux.path) {
      playPath = remux.path;
      note = remux.note || note;
    } else if (remux.note) {
      note = remux.note;
    }
  }

  const label =
    decodeURIComponent(path.basename(parsed.pathname)) ||
    parsed.hostname ||
    "URL";

  return {
    ok: true,
    items: [
      {
        id: `media-${id}`,
        kind: cls.kind,
        label,
        title: label,
        path: playPath,
        sourcePath: dest,
        sourceUrl: parsed.href,
        mime:
          playPath.endsWith(".mp4") && cls.kind === "video"
            ? "video/mp4"
            : cls.mime,
        note,
        ffmpeg: Boolean(findFfmpeg()),
        lines:
          cls.kind === "video"
            ? ["[ vídeo ]"]
            : cls.kind === "audio"
              ? ["[ áudio ]"]
              : cls.kind === "image"
                ? ["[ imagem ]"]
                : ["[ mídia ]"],
        slidePaths: cls.kind === "image" ? [playPath] : undefined,
      },
    ],
  };
}

module.exports = {
  importMediaFiles,
  importMediaUrl,
  listMedia,
  mediaRoot,
  classify,
  findFfmpeg,
  findFfprobe,
  probeMediaFile,
  findYtDlp,
  youtubeVideoId,
  VIDEO_EXTS,
  AUDIO_EXTS,
  IMAGE_EXTS,
  DECK_EXTS,
};
