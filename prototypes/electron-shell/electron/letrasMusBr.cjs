/**
 * Busca de letra sem chave (reserva do Vagalume) — acesso direto por URL no
 * letras.mus.br. O site não tem API pública; a busca embutida dele roda em
 * JS via widget do Google (inacessível com fetch simples), então a única
 * via viável sem navegador de verdade é montar a URL da música por slug
 * best-effort do artista/título e conferir se a página que voltou é
 * realmente a música pedida.
 *
 * Isso importa porque quando o slug do artista existe mas o do título não,
 * o site redireciona (302/307) para OUTRA música do mesmo artista, com
 * HTTP 200 e letra preenchida — sem o confronto de título abaixo o
 * resultado seria uma letra errada com cara de sucesso.
 */

const TIMEOUT_MS = 8000;

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function slugify(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeForCompare(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(html) {
  return decodeHtmlEntities(String(html).replace(/<[^>]+>/g, "")).trim();
}

/** Miolo de <div class="lyric-original">…</div> — sem <div> aninhado na página real. */
function extractLyricHtml(pageHtml) {
  const m = pageHtml.match(/<div class="lyric-original"[^>]*>([\s\S]*?)<\/div>/);
  return m ? m[1] : null;
}

/** Cada <p> vira um slide (estrofe); <br> dentro dele vira quebra de linha. */
function lyricHtmlToSlides(lyricHtml) {
  const paragraphs = [...lyricHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
  const blocks = paragraphs.length ? paragraphs.map((m) => m[1]) : [lyricHtml];
  return blocks
    .map((block) => stripTags(block.replace(/<br\s*\/?>/gi, "\n")))
    .filter(Boolean);
}

async function searchLyrics({ title, artist }) {
  const t = String(title || "").trim();
  if (!t) return { ok: false, reason: "empty-query" };

  const artistSlug = slugify(artist || "");
  const titleSlug = slugify(t);
  if (!artistSlug || !titleSlug) return { ok: false, reason: "not-found" };

  const url = `https://www.letras.mus.br/${artistSlug}/${titleSlug}/`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message || err) };
  }
  if (!res.ok) {
    return res.status === 404
      ? { ok: false, reason: "not-found" }
      : { ok: false, reason: "network", detail: `HTTP ${res.status}` };
  }

  const html = await res.text();
  const titleTag = html.match(/<title>([^<]*)<\/title>/);
  const pageTitle = titleTag ? decodeHtmlEntities(titleTag[1]) : "";
  // Padrão do site: "{Título} - {Artista} - LETRAS.MUS.BR"
  const parts = pageTitle.split(" - ");
  const returnedTitle = parts[0] || "";
  const returnedArtist = parts.length >= 3 ? parts[1] : String(artist || "").trim();

  const reqNorm = normalizeForCompare(t);
  const gotNorm = normalizeForCompare(returnedTitle);
  const titleMatches = Boolean(reqNorm) && (gotNorm.includes(reqNorm) || reqNorm.includes(gotNorm));
  if (!titleMatches) return { ok: false, reason: "not-found" };

  const lyricHtml = extractLyricHtml(html);
  if (!lyricHtml) return { ok: false, reason: "not-found" };

  const lines = lyricHtmlToSlides(lyricHtml);
  if (!lines.length) return { ok: false, reason: "not-found" };

  return {
    ok: true,
    title: returnedTitle || t,
    artist: returnedArtist,
    lines,
    sourceUrl: url,
    source: "letras-mus-br",
  };
}

module.exports = { searchLyrics, slugify, normalizeForCompare };
