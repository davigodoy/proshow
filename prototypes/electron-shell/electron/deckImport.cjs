const { app, dialog, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile, execSync } = require("child_process");
const { promisify } = require("util");
const { randomUUID } = require("crypto");

const execFileAsync = promisify(execFile);

function mediaRoot() {
  return path.join(app.getPath("home"), "ible-projection", "media");
}

function deckDir(id) {
  return path.join(mediaRoot(), "decks", id);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function which(cmd) {
  try {
    return execSync(`which ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function toMediaPathUrl(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  const abs = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const encoded = abs
    .split("/")
    .map((seg) => (seg ? encodeURIComponent(seg) : ""))
    .join("/");
  return `iblemedia://local${encoded}`;
}

/** Extrai uma imagem por slide a partir das relationships do PPTX */
async function extractPptxSlideImages(filePath, outDir) {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  const byName = new Map(entries.map((e) => [e.entryName.replace(/\\/g, "/"), e]));

  const slideFiles = entries
    .map((e) => e.entryName.replace(/\\/g, "/"))
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number((a.match(/slide(\d+)/i) || [])[1] || 0);
      const nb = Number((b.match(/slide(\d+)/i) || [])[1] || 0);
      return na - nb;
    });

  const slides = [];
  let i = 0;
  for (const slideXmlPath of slideFiles) {
    const relsPath = slideXmlPath
      .replace("ppt/slides/", "ppt/slides/_rels/")
      .replace(/\.xml$/i, ".xml.rels");
    const relsEntry = byName.get(relsPath);
    let imageEntry = null;
    if (relsEntry) {
      const relsXml = relsEntry.getData().toString("utf8");
      const targets = [...relsXml.matchAll(/Target="([^"]+)"/g)].map((m) => m[1]);
      const imageTargets = targets.filter((t) =>
        /\.(png|jpe?g|gif|webp)$/i.test(t),
      );
      for (const target of imageTargets) {
        const resolved = path.posix.normalize(
          path.posix.join(path.posix.dirname(slideXmlPath), target),
        );
        const entry = byName.get(resolved) || byName.get(resolved.replace(/^\.\.\//, "ppt/"));
        if (entry) {
          imageEntry = entry;
          break;
        }
        // Common: ../media/image1.png
        const mediaName = target.replace(/^.*\//, "");
        const mediaPath = `ppt/media/${mediaName}`;
        if (byName.has(mediaPath)) {
          imageEntry = byName.get(mediaPath);
          break;
        }
      }
    }
    if (!imageEntry) continue;
    i += 1;
    const ext = path.extname(imageEntry.entryName).toLowerCase() || ".png";
    const dest = path.join(outDir, `slide-${String(i).padStart(3, "0")}${ext}`);
    fs.writeFileSync(dest, imageEntry.getData());
    slides.push(dest);
  }

  // Fallback: all media images in order
  if (!slides.length) {
    const media = entries
      .filter(
        (e) =>
          /^ppt\/media\//i.test(e.entryName.replace(/\\/g, "/")) &&
          /\.(png|jpe?g|gif|webp)$/i.test(e.entryName),
      )
      .sort((a, b) =>
        a.entryName.localeCompare(b.entryName, undefined, { numeric: true }),
      );
    for (const entry of media) {
      i += 1;
      const ext = path.extname(entry.entryName).toLowerCase();
      const dest = path.join(outDir, `slide-${String(i).padStart(3, "0")}${ext}`);
      fs.writeFileSync(dest, entry.getData());
      slides.push(dest);
    }
  }
  return slides;
}

async function extractPdfPhrases(filePath) {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;
    const pageCount = Math.min(doc.numPages, 80);
    const phrases = [];
    for (let p = 1; p <= pageCount; p += 1) {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      phrases.push(text || `Slide ${p}`);
    }
    return phrases;
  } catch {
    return [];
  }
}

async function renderPdfPages(filePath, outDir) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = require("@napi-rs/canvas");
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;
  const pageCount = Math.min(doc.numPages, 80);
  const slides = [];
  const phrases = [];
  let renderErrors = 0;

  for (let p = 1; p <= pageCount; p += 1) {
    const page = await doc.getPage(p);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((it) => it.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    phrases.push(text || `Slide ${p}`);

    try {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1920 / base.width, 1080 / base.height, 2);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dest = path.join(outDir, `slide-${String(p).padStart(3, "0")}.png`);
      fs.writeFileSync(dest, canvas.toBuffer("image/png"));
      slides.push(dest);
    } catch {
      renderErrors += 1;
    }
  }

  if (!slides.length && renderErrors) {
    throw new Error("Falha ao rasterizar páginas do PDF (fonte/canvas)");
  }
  return { slides, phrases };
}

async function qlmanageRaster(filePath, outDir) {
  const ql = which("qlmanage");
  if (!ql) return [];
  ensureDir(outDir);
  try {
    await execFileAsync(ql, ["-t", "-s", "1920", "-o", outDir, filePath], {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  return fs
    .readdirSync(outDir)
    .filter((f) => /\.png$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(outDir, f));
}

async function libreOfficeToPdf(filePath, workDir) {
  const soffice = which("soffice") || which("libreoffice");
  if (!soffice) return null;
  try {
    await execFileAsync(
      soffice,
      ["--headless", "--convert-to", "pdf", "--outdir", workDir, filePath],
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
    );
    const pdfName = path.basename(filePath).replace(/\.[^.]+$/, ".pdf");
    const pdfPath = path.join(workDir, pdfName);
    return fs.existsSync(pdfPath) ? pdfPath : null;
  } catch {
    return null;
  }
}

async function pdftoppmRaster(pdfPath, outDir) {
  const bin = which("pdftoppm");
  if (!bin) return [];
  ensureDir(outDir);
  const prefix = path.join(outDir, "slide");
  try {
    await execFileAsync(bin, ["-png", "-r", "150", pdfPath, prefix], {
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  return fs
    .readdirSync(outDir)
    .filter((f) => /^slide-?\d+\.png$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(outDir, f));
}

function findPythonWithFitz() {
  const candidates = [
    which("python3"),
    which("python"),
    "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/Current/bin/python3",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
  ].filter(Boolean);
  const seen = new Set();
  for (const py of candidates) {
    if (seen.has(py)) continue;
    seen.add(py);
    if (!fs.existsSync(py)) continue;
    try {
      execSync(`"${py}" -c "import fitz"`, {
        encoding: "utf8",
        stdio: ["ignore", "ignore", "ignore"],
        timeout: 8000,
      });
      return py;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Rasteriza todas as páginas via PyMuPDF (fitz) — confiável no macOS
 * quando pdftoppm/pdfjs+canvas falham.
 */
async function pymupdfRaster(pdfPath, outDir) {
  const py = findPythonWithFitz();
  if (!py) return [];
  ensureDir(outDir);
  const scriptPath = path.join(os.tmpdir(), `ible-pymupdf-${randomUUID()}.py`);
  const script = `
import fitz, os, sys
pdf, out, dpi = sys.argv[1], sys.argv[2], float(sys.argv[3])
os.makedirs(out, exist_ok=True)
doc = fitz.open(pdf)
mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
limit = min(doc.page_count, 80)
for i in range(limit):
    page = doc.load_page(i)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    pix.save(os.path.join(out, f"slide-{i + 1:03d}.png"))
print(limit)
`;
  try {
    fs.writeFileSync(scriptPath, script, "utf8");
    await execFileAsync(py, [scriptPath, pdfPath, outDir, "150"], {
      timeout: 300000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    return [];
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
  return fs
    .readdirSync(outDir)
    .filter((f) => /^slide-\d+\.png$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(outDir, f));
}

/** Preferência: pdftoppm → PyMuPDF → pdfjs → (caller) qlmanage */
async function rasterPdfToSlides(pdfPath, outDir) {
  let slides = await pdftoppmRaster(pdfPath, outDir);
  if (slides.length) return { slides, phrases: [], engine: "pdftoppm" };

  slides = await pymupdfRaster(pdfPath, outDir);
  if (slides.length) return { slides, phrases: [], engine: "pymupdf" };

  try {
    const rendered = await renderPdfPages(pdfPath, outDir);
    if (rendered.slides.length) {
      return {
        slides: rendered.slides,
        phrases: rendered.phrases,
        engine: "pdfjs",
      };
    }
  } catch {
    /* fall through */
  }
  return { slides: [], phrases: [], engine: null };
}

function clearSlidePngs(outDir) {
  if (!fs.existsSync(outDir)) return;
  for (const f of fs.readdirSync(outDir)) {
    if (/\.png$/i.test(f)) {
      try {
        fs.unlinkSync(path.join(outDir, f));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Decks importados só com miniatura qlmanage (1 PNG minúsculo) — re-rasteriza.
 */
async function repairThinDeck(meta, folderId) {
  const sourcePath = meta?.sourcePath;
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  if (path.extname(sourcePath).toLowerCase() !== ".pdf") return null;
  const slides = meta.slides || [];
  if (slides.length !== 1) return null;
  const only = slides[0]?.path;
  if (!only || !fs.existsSync(only)) return null;
  let size = 0;
  try {
    size = fs.statSync(only).size;
  } catch {
    return null;
  }
  // Miniatura qlmanage costuma ser bem pequena; PDFs reais geram PNGs maiores.
  if (size > 80_000) return null;

  const outDir = deckDir(folderId);
  clearSlidePngs(outDir);
  const { slides: files, phrases, engine } = await rasterPdfToSlides(
    sourcePath,
    outDir,
  );
  if (!files.length) return null;

  let texts = phrases;
  if (!texts.length) {
    texts = await extractPdfPhrases(sourcePath);
  }
  if (!texts.length) texts = files.map((_, i) => `Slide ${i + 1}`);

  const nextSlides = files.map((file, i) => ({
    index: i,
    path: file,
    text: texts[i] || `Slide ${i + 1}`,
  }));
  const next = {
    ...meta,
    slides: nextSlides,
    note: undefined,
    repairedAt: new Date().toISOString(),
    repairEngine: engine || undefined,
  };
  writeDeckMeta(outDir, next);
  return next;
}

function writeDeckMeta(outDir, meta) {
  fs.writeFileSync(path.join(outDir, "deck.json"), JSON.stringify(meta, null, 2), "utf8");
}

/**
 * Import PPT/PPTX/PDF into a deck of slide image paths + optional text phrases.
 */
async function importDeckFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const id = randomUUID();
  const outDir = deckDir(id);
  ensureDir(outDir);
  const workDir = path.join(os.tmpdir(), `ible-deck-${id}`);
  ensureDir(workDir);

  let slideFiles = [];
  let phrases = [];
  let note = "";

  if (ext === ".pdf") {
    // pdftoppm → PyMuPDF → pdfjs+canvas → qlmanage (só miniatura)
    const rendered = await rasterPdfToSlides(filePath, outDir);
    slideFiles = rendered.slides;
    phrases = rendered.phrases;
    if (!slideFiles.length) {
      const qlDir = path.join(workDir, "ql");
      ensureDir(qlDir);
      const ql = await qlmanageRaster(filePath, qlDir);
      for (let i = 0; i < ql.length; i += 1) {
        const dest = path.join(
          outDir,
          `slide-${String(i + 1).padStart(3, "0")}.png`,
        );
        fs.copyFileSync(ql[i], dest);
        slideFiles.push(dest);
      }
      if (!slideFiles.length) {
        note =
          "PDF: falha ao rasterizar. Instale PyMuPDF (`pip3 install pymupdf`) ou poppler (pdftoppm).";
      } else if (slideFiles.length === 1) {
        note =
          "PDF importado com miniatura (qlmanage). Instale PyMuPDF (`pip3 install pymupdf`) ou poppler para todas as páginas.";
      }
      phrases = slideFiles.map((_, i) => `Slide ${i + 1}`);
    }
    if (slideFiles.length && !phrases.length) {
      phrases = await extractPdfPhrases(filePath);
      if (!phrases.length) phrases = slideFiles.map((_, i) => `Slide ${i + 1}`);
    }
  } else if (ext === ".pptx") {
    slideFiles = await extractPptxSlideImages(filePath, outDir);

    if (!slideFiles.length) {
      const pdf = await libreOfficeToPdf(filePath, workDir);
      if (pdf) {
        const rendered = await rasterPdfToSlides(pdf, outDir);
        slideFiles = rendered.slides;
        phrases = rendered.phrases;
      }
    }

    if (!slideFiles.length) {
      const qlDir = path.join(workDir, "ql");
      ensureDir(qlDir);
      const ql = await qlmanageRaster(filePath, qlDir);
      for (let i = 0; i < ql.length; i += 1) {
        const dest = path.join(outDir, `slide-${String(i + 1).padStart(3, "0")}.png`);
        fs.copyFileSync(ql[i], dest);
        slideFiles.push(dest);
      }
      if (slideFiles.length === 1) {
        note =
          "PPTX com miniatura única. Para todos os slides: exporte como PDF no PowerPoint, ou instale LibreOffice.";
      }
    }
    if (!phrases.length) phrases = slideFiles.map((_, i) => `Slide ${i + 1}`);
  } else if (ext === ".ppt") {
    const pdf = await libreOfficeToPdf(filePath, workDir);
    if (pdf) {
      const rendered = await rasterPdfToSlides(pdf, outDir);
      slideFiles = rendered.slides;
      phrases = rendered.phrases.length
        ? rendered.phrases
        : slideFiles.map((_, i) => `Slide ${i + 1}`);
    } else {
      const qlDir = path.join(workDir, "ql");
      ensureDir(qlDir);
      const ql = await qlmanageRaster(filePath, qlDir);
      for (let i = 0; i < ql.length; i += 1) {
        const dest = path.join(outDir, `slide-${String(i + 1).padStart(3, "0")}.png`);
        fs.copyFileSync(ql[i], dest);
        slideFiles.push(dest);
      }
      phrases = slideFiles.map((_, i) => `Slide ${i + 1}`);
      note =
        "Arquivo .ppt antigo. Salve como .pptx ou PDF no PowerPoint, ou instale LibreOffice.";
    }
  } else if (ext === ".key") {
    const pdf = await libreOfficeToPdf(filePath, workDir);
    if (pdf) {
      const rendered = await rasterPdfToSlides(pdf, outDir);
      slideFiles = rendered.slides;
      phrases = rendered.phrases.length
        ? rendered.phrases
        : slideFiles.map((_, i) => `Slide ${i + 1}`);
    }
    if (!slideFiles.length) {
      const qlDir = path.join(workDir, "ql");
      ensureDir(qlDir);
      const ql = await qlmanageRaster(filePath, qlDir);
      for (let i = 0; i < ql.length; i += 1) {
        const dest = path.join(
          outDir,
          `slide-${String(i + 1).padStart(3, "0")}.png`,
        );
        fs.copyFileSync(ql[i], dest);
        slideFiles.push(dest);
      }
      phrases = slideFiles.map((_, i) => `Slide ${i + 1}`);
      if (slideFiles.length <= 1) {
        note =
          "Keynote: miniatura limitada. Exporte como PDF no Keynote, ou instale LibreOffice para todos os slides.";
      }
    }
  }

  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (!slideFiles.length) {
    return {
      ok: false,
      error:
        "Não foi possível importar o deck. Exporte como PDF no PowerPoint/Keynote e importe o PDF.",
    };
  }

  if (!phrases.length) phrases = slideFiles.map((_, i) => `Slide ${i + 1}`);

  const slides = slideFiles.map((file, i) => ({
    index: i,
    path: file,
    text: phrases[i] || `Slide ${i + 1}`,
  }));

  const title = path.basename(filePath, ext);
  const meta = {
    id,
    title,
    kind: "deck",
    sourcePath: filePath,
    slides,
    note: note || undefined,
    importedAt: new Date().toISOString(),
  };
  writeDeckMeta(outDir, meta);

  return {
    ok: true,
    id: `deck-${id}`,
    title,
    kind: "deck",
    path: slides[0]?.path || null,
    slides,
    slidePaths: slides.map((s) => s.path),
    phrases: slides.map((s) => s.text),
    lines: slides.map((s) => s.text),
    note: note || undefined,
    mime: "image/png",
  };
}

async function importDeckPaths(filePaths) {
  const items = [];
  const notes = [];
  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (![".ppt", ".pptx", ".pdf", ".key"].includes(ext)) continue;
    try {
      const deck = await importDeckFile(filePath);
      if (!deck.ok) {
        notes.push(`${path.basename(filePath)}: ${deck.error}`);
        continue;
      }
      if (deck.note) notes.push(`${deck.title}: ${deck.note}`);
      items.push(deck);
    } catch (err) {
      notes.push(`${path.basename(filePath)}: ${err?.message || String(err)}`);
    }
  }
  return {
    ok: items.length > 0,
    items,
    note: notes.length ? notes.join("\n") : undefined,
  };
}

async function pickAndImportDeck(win) {
  const parent = win || BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(parent, {
    title: "Importar apresentação (PPT / Keynote / PDF)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Apresentações", extensions: ["pptx", "ppt", "key", "pdf"] },
      { name: "Todos", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true, items: [] };
  }
  return importDeckPaths(result.filePaths);
}

function deckToLibraryItem(meta, folderId) {
  const slides = meta.slides || [];
  return {
    id: meta.id?.startsWith("deck-")
      ? meta.id
      : `deck-${meta.id || folderId}`,
    kind: "deck",
    label: meta.title || folderId,
    path: slides[0]?.path || null,
    slides,
    slidePaths: slides.map((s) => s.path),
    lines: slides.map((s) => s.text || `Slide ${(s.index || 0) + 1}`),
    mime: "image/png",
    note: meta.note,
  };
}

function listDecks() {
  const root = path.join(mediaRoot(), "decks");
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const id of fs.readdirSync(root)) {
    const metaPath = path.join(root, id, "deck.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      let meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      out.push(deckToLibraryItem(meta, id));
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Repara decks com só miniatura qlmanage (assíncrono; chama no boot). */
async function repairThinDecks() {
  const root = path.join(mediaRoot(), "decks");
  if (!fs.existsSync(root)) return { repaired: 0 };
  let repaired = 0;
  for (const id of fs.readdirSync(root)) {
    const metaPath = path.join(root, id, "deck.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      const next = await repairThinDeck(meta, id);
      if (next) repaired += 1;
    } catch {
      /* ignore */
    }
  }
  return { repaired };
}

module.exports = {
  pickAndImportDeck,
  importDeckFile,
  importDeckPaths,
  listDecks,
  repairThinDecks,
  deckDir,
  toMediaPathUrl,
};
