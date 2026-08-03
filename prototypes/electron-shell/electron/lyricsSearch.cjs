/**
 * Busca de letra online — usada quando a música não está na biblioteca
 * local. Nunca salva sozinho: o resultado só preenche o editor para
 * revisão do operador antes de "Salvar".
 *
 * Ordem: Vagalume (primária, exige chave gratuita própria) → letras.mus.br
 * (reserva, sem chave, acesso direto por URL — ver letrasMusBr.cjs).
 */

const VAGALUME_ENDPOINT = "https://api.vagalume.com.br/search.php";
const VAGALUME_ARTMUS = "https://api.vagalume.com.br/search.artmus";
const TIMEOUT_MS = 8000;

const { splitLyricsIntoSlides } = require("./lyricsText.cjs");
const letrasMusBr = require("./letrasMusBr.cjs");

/** A Vagalume às vezes anexa o crédito de composição ao fim do texto. */
function stripComposerCredit(text) {
  return text.replace(/\n{1,2}\s*Composi[çc][ãa]o\s*:.*$/is, "").trim();
}

async function searchVagalume({ title, artist, apiKey }) {
  const query = String(title || "").trim();
  if (!query) return { ok: false, reason: "empty-query" };
  if (!apiKey) return { ok: false, reason: "missing-key" };

  const url = new URL(VAGALUME_ENDPOINT);
  url.searchParams.set("mus", query);
  const artistQuery = String(artist || "").trim();
  if (artistQuery) url.searchParams.set("art", artistQuery);
  url.searchParams.set("apikey", apiKey);

  let res;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message || err) };
  }
  if (!res.ok) {
    return { ok: false, reason: "network", detail: `HTTP ${res.status}` };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "bad-response" };
  }

  const song = Array.isArray(data?.mus) ? data.mus[0] : null;
  const rawText = typeof song?.text === "string" ? song.text : "";
  if (!song || !rawText.trim() || data?.type === "song_notfound") {
    return { ok: false, reason: "not-found" };
  }

  const lines = splitLyricsIntoSlides(stripComposerCredit(rawText));
  if (!lines.length) return { ok: false, reason: "not-found" };

  return {
    ok: true,
    title: String(song.name || query).trim(),
    artist: String(data?.art?.name || artistQuery || "").trim(),
    lines,
    sourceUrl: song.url || data?.art?.url || null,
    source: "vagalume",
  };
}

/**
 * Sugestões (slots) enquanto digita — search.artmus da Vagalume.
 * Sem chave → lista vazia (a UI ainda mostra a biblioteca local).
 */
async function suggestLyrics({ query, apiKey, limit = 6 }) {
  const q = String(query || "").trim();
  if (q.length < 2) return { ok: true, items: [] };
  if (!apiKey) return { ok: true, items: [], reason: "missing-key" };

  const url = new URL(VAGALUME_ARTMUS);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(Math.min(10, Math.max(1, limit))));
  url.searchParams.set("apikey", apiKey);

  let res;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message || err) };
  }
  if (!res.ok) {
    return { ok: false, reason: "network", detail: `HTTP ${res.status}` };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "bad-response" };
  }

  const docs = Array.isArray(data?.response?.docs)
    ? data.response.docs
    : Array.isArray(data?.docs)
      ? data.docs
      : [];

  const items = [];
  const seen = new Set();
  for (const doc of docs) {
    const title = String(doc?.title || doc?.name || doc?.mus || "").trim();
    const artist = String(
      doc?.band || doc?.art || doc?.artist || doc?.artistName || "",
    ).trim();
    if (!title) continue;
    const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      title,
      artist,
      id: doc?.id ? String(doc.id) : null,
      url: doc?.url || null,
    });
    if (items.length >= limit) break;
  }

  return { ok: true, items };
}

/**
 * Vagalume primeiro; se não achar (ou faltar chave), tenta letras.mus.br.
 * Se as duas falharem, prioriza sinalizar "missing-key" — é a única causa
 * que o operador consegue corrigir de forma permanente; as outras são por
 * música e o próximo resultado pode ser diferente.
 */
async function searchLyrics({ title, artist, apiKey }) {
  const primary = await searchVagalume({ title, artist, apiKey });
  if (primary.ok) return primary;

  const secondary = await letrasMusBr.searchLyrics({ title, artist });
  if (secondary.ok) return secondary;

  return primary.reason === "missing-key" ? primary : secondary;
}

module.exports = { searchLyrics, searchVagalume, suggestLyrics };
