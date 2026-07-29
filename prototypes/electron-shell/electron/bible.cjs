const fs = require("fs");
const os = require("os");
const path = require("path");

const VERSIONS = [
  { id: "nvi", label: "Nova Versão Internacional (NVI)", file: "nvi.json" },
  { id: "ntlh", label: "Nova Tradução na Linguagem de Hoje (NTLH)", file: "ntlh.json" },
  { id: "acf", label: "Almeida Corrigida Fiel (ACF)", file: "acf.json" },
  { id: "arc", label: "Almeida Revista e Corrigida (ARC)", file: "arc.json" },
  { id: "aa", label: "Almeida Revisada (AA)", file: "aa.json" },
  { id: "ara", label: "Almeida Revista e Atualizada (ARA)", file: "ara.json" },
  { id: "kja", label: "King James Atualizada (KJA)", file: "kja.json" },
  { id: "tb", label: "Tradução Brasileira (TB)", file: "tb.json" },
  { id: "blivre", label: "Bíblia Livre", file: "blivre.json" },
  { id: "alm1911", label: "Almeida 1911", file: "alm1911.json" },
];

/** @type {Map<string, any[]>} */
const cache = new Map();

/**
 * Traduções não são versionadas nem empacotadas (copyright): ficam na pasta
 * de dados do usuário. Cai no `data/bible` do projeto quando rodando do fonte.
 */
function bibleDir() {
  const userDir = path.join(os.homedir(), "ible-projection", "data", "bible");
  if (fs.existsSync(userDir)) return userDir;
  return path.join(__dirname, "..", "data", "bible");
}

function listVersions() {
  const dir = bibleDir();
  return VERSIONS.filter((v) => fs.existsSync(path.join(dir, v.file))).map((v) => ({
    id: v.id,
    label: v.label,
  }));
}

function loadVersion(versionId) {
  if (cache.has(versionId)) return cache.get(versionId);
  const meta = VERSIONS.find((v) => v.id === versionId);
  if (!meta) throw new Error(`Versão desconhecida: ${versionId}`);
  const file = path.join(bibleDir(), meta.file);
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${meta.file}`);
  const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  cache.set(versionId, data);
  return data;
}

function listBooks(versionId) {
  const data = loadVersion(versionId);
  return data.map((b, index) => ({
    index,
    abbrev: b.abbrev,
    name: b.name,
    chapters: Array.isArray(b.chapters) ? b.chapters.length : 0,
  }));
}

function getChapter(versionId, bookIndex, chapterIndex) {
  const data = loadVersion(versionId);
  const book = data[bookIndex];
  if (!book) throw new Error("Livro inválido");
  const chapter = book.chapters[chapterIndex];
  if (!chapter) throw new Error("Capítulo inválido");
  const verses = chapter.map((text, i) => ({
    n: i + 1,
    text: String(text),
  }));
  return {
    versionId,
    book: { index: bookIndex, abbrev: book.abbrev, name: book.name },
    chapter: chapterIndex + 1,
    verses,
  };
}

function getVerseRange(versionId, bookIndex, chapterIndex, fromVerse, toVerse) {
  const ch = getChapter(versionId, bookIndex, chapterIndex);
  const from = Math.max(1, fromVerse || 1);
  const to = Math.max(from, toVerse || from);
  const verses = ch.verses.filter((v) => v.n >= from && v.n <= to);
  const ref = `${ch.book.name} ${ch.chapter}:${from}${to > from ? `-${to}` : ""}`;
  return {
    ...ch,
    ref,
    verses,
    lines: verses.map((v) => v.text),
    slides: verses.map((v) => v.text),
  };
}

module.exports = {
  listVersions,
  listBooks,
  getChapter,
  getVerseRange,
  VERSIONS,
};
