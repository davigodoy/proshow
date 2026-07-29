/**
 * Texto cru de letra → slides. Convenção já usada pelo import Holyrics:
 * cada estrofe (bloco separado por linha em branco) vira um slide, com as
 * linhas internas preservadas (\n) — o SongEditor achata isso com " · " ao
 * exibir no textarea.
 */
function splitLyricsIntoSlides(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) return [];
  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

module.exports = { splitLyricsIntoSlides };
