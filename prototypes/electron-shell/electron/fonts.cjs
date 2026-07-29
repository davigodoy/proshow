const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

/** Fontes Google curadas para projeção / louvor */
const CATALOG = [
  { id: "montserrat", family: "Montserrat", category: "sans-serif" },
  { id: "roboto", family: "Roboto", category: "sans-serif" },
  { id: "open-sans", family: "Open Sans", category: "sans-serif" },
  { id: "lato", family: "Lato", category: "sans-serif" },
  { id: "oswald", family: "Oswald", category: "sans-serif" },
  { id: "raleway", family: "Raleway", category: "sans-serif" },
  { id: "poppins", family: "Poppins", category: "sans-serif" },
  { id: "nunito", family: "Nunito", category: "sans-serif" },
  { id: "inter", family: "Inter", category: "sans-serif" },
  { id: "bebas-neue", family: "Bebas Neue", category: "display" },
  { id: "anton", family: "Anton", category: "display" },
  { id: "abril-fatface", family: "Abril Fatface", category: "display" },
  { id: "playfair-display", family: "Playfair Display", category: "serif" },
  { id: "merriweather", family: "Merriweather", category: "serif" },
  { id: "libre-baskerville", family: "Libre Baskerville", category: "serif" },
  { id: "cormorant-garamond", family: "Cormorant Garamond", category: "serif" },
  { id: "cinzel", family: "Cinzel", category: "serif" },
  { id: "great-vibes", family: "Great Vibes", category: "handwriting" },
  { id: "dancing-script", family: "Dancing Script", category: "handwriting" },
  { id: "pacifico", family: "Pacifico", category: "handwriting" },
  { id: "caveat", family: "Caveat", category: "handwriting" },
  { id: "source-sans-3", family: "Source Sans 3", category: "sans-serif" },
  { id: "work-sans", family: "Work Sans", category: "sans-serif" },
  { id: "rubik", family: "Rubik", category: "sans-serif" },
  { id: "barlow", family: "Barlow", category: "sans-serif" },
  { id: "dm-sans", family: "DM Sans", category: "sans-serif" },
  { id: "outfit", family: "Outfit", category: "sans-serif" },
  { id: "josefin-sans", family: "Josefin Sans", category: "sans-serif" },
  { id: "comfortaa", family: "Comfortaa", category: "display" },
  { id: "lobster", family: "Lobster", category: "display" },
];

function fontsRoot() {
  const dir = path.join(app.getPath("home"), "ible-projection", "fonts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function manifestPath() {
  return path.join(fontsRoot(), "manifest.json");
}

function readManifest() {
  try {
    const raw = fs.readFileSync(manifestPath(), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.fonts) ? data : { fonts: [] };
  } catch {
    return { fonts: [] };
  }
}

function writeManifest(data) {
  fs.writeFileSync(manifestPath(), JSON.stringify(data, null, 2), "utf8");
}

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          ...headers,
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location, headers).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("error", reject);
  });
}

function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBinary(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on("error", reject);
  });
}

function cssFamilyValue(family) {
  return `"${family}", sans-serif`;
}

function googleCssUrl(family) {
  const q = encodeURIComponent(family).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${q}:wght@400;600;700&display=swap`;
}

/**
 * Baixa CSS + woff2 do Google Fonts e grava em disco.
 */
async function importGoogleFont(familyName) {
  const family = String(familyName || "").trim();
  if (!family) return { ok: false, error: "Nome da fonte vazio" };

  const id = family
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const dir = path.join(fontsRoot(), id);
  fs.mkdirSync(dir, { recursive: true });

  let css;
  try {
    css = await fetchText(googleCssUrl(family));
  } catch (err) {
    return { ok: false, error: `Não foi possível baixar do Google Fonts: ${err.message}` };
  }

  if (/Error|did not match/i.test(css) || !/@font-face/i.test(css)) {
    return {
      ok: false,
      error: `Fonte "${family}" não encontrada no Google Fonts. Confira o nome exato.`,
    };
  }

  // Divide em blocos comentário + @font-face; fica só latin / latin-ext (pt-BR)
  const parts = css.split(/(?=\/\*)/);
  const faces = [];
  for (const part of parts) {
    if (!/@font-face/i.test(part)) continue;
    const comment = ((part.match(/^\/\*\s*([^*]+)\s*\*\//) || [])[1] || "").trim().toLowerCase();
    if (comment && !comment.includes("latin")) continue;
    const urlMatch = part.match(/url\(([^)]+)\)/);
    if (!urlMatch) continue;
    const remoteUrl = urlMatch[1].replace(/['"]/g, "").trim();
    if (!remoteUrl || !/\.woff2/i.test(remoteUrl)) continue;
    const weight = (part.match(/font-weight:\s*([^;]+)/i) || [])[1]?.trim() || "400";
    const style = (part.match(/font-style:\s*([^;]+)/i) || [])[1]?.trim() || "normal";
    const unicode = (part.match(/unicode-range:\s*([^;]+)/i) || [])[1]?.trim() || null;
    faces.push({ remoteUrl, weight, style, unicode });
  }

  if (!faces.length) {
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) =>
      m[1].replace(/['"]/g, "").trim(),
    );
    for (const remoteUrl of [...new Set(urls)]) {
      if (!/\.woff2/i.test(remoteUrl)) continue;
      faces.push({ remoteUrl, weight: "400", style: "normal", unicode: null });
    }
  }

  if (!faces.length) {
    return { ok: false, error: "CSS do Google Fonts sem arquivos woff2" };
  }

  const toUrl = (filePath) => {
    const normalized = String(filePath).replace(/\\/g, "/");
    const abs = normalized.startsWith("/") ? normalized : `/${normalized}`;
    const encoded = abs
      .split("/")
      .map((seg) => (seg ? encodeURIComponent(seg) : ""))
      .join("/");
    return `iblemedia://local${encoded}`;
  };

  const localFaces = [];
  let idx = 0;
  const seen = new Set();
  for (const face of faces) {
    const key = `${face.weight}|${face.style}|${face.remoteUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    idx += 1;
    const fileName = `face-${idx}.woff2`;
    const dest = path.join(dir, fileName);
    try {
      const bin = await fetchBinary(face.remoteUrl);
      fs.writeFileSync(dest, bin);
    } catch (err) {
      return { ok: false, error: `Falha ao baixar woff2: ${err.message}` };
    }
    localFaces.push({
      file: fileName,
      path: dest,
      weight: face.weight,
      style: face.style,
      unicode: face.unicode,
    });
  }

  const localCss = localFaces
    .map((f) => {
      const range = f.unicode ? `\n  unicode-range: ${f.unicode};` : "";
      return `@font-face {
  font-family: "${family}";
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: swap;
  src: url("${toUrl(f.path)}") format("woff2");${range}
}`;
    })
    .join("\n\n");

  fs.writeFileSync(path.join(dir, "font.css"), localCss, "utf8");

  const entry = {
    id,
    family,
    value: cssFamilyValue(family),
    source: "google",
    dir,
    faces: localFaces.length,
    importedAt: new Date().toISOString(),
  };

  const manifest = readManifest();
  manifest.fonts = [
    entry,
    ...manifest.fonts.filter((f) => f.id !== id && f.family !== family),
  ];
  writeManifest(manifest);

  return { ok: true, font: entry, css: localCss };
}

function listImported() {
  return readManifest().fonts;
}

/** CSS agregado de todas as fontes importadas (para injetar nas janelas) */
function buildInjectCss() {
  const fonts = listImported();
  const parts = [];
  for (const font of fonts) {
    const cssFile = path.join(fontsRoot(), font.id, "font.css");
    if (fs.existsSync(cssFile)) {
      parts.push(fs.readFileSync(cssFile, "utf8"));
    }
  }
  return parts.join("\n\n");
}

function removeFont(id) {
  const manifest = readManifest();
  const font = manifest.fonts.find((f) => f.id === id);
  if (!font) return { ok: false, error: "Fonte não encontrada" };
  const dir = path.join(fontsRoot(), id);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  manifest.fonts = manifest.fonts.filter((f) => f.id !== id);
  writeManifest(manifest);
  return { ok: true, fonts: manifest.fonts };
}

function fontOptions() {
  return listImported().map((f) => ({
    id: f.id,
    label: `${f.family} (importada)`,
    value: f.value || cssFamilyValue(f.family),
    source: "imported",
  }));
}

function slugFamily(family) {
  return String(family || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Catálogo remoto (cache em memória) — fonts.google.com/metadata/fonts */
let remoteCatalog = null;
/** @type {Promise<Array<{id:string,family:string,category:string,supportsPt:boolean}>> | null} */
let remoteCatalogPromise = null;

function supportsPortuguese(subsets) {
  const set = new Set(
    (Array.isArray(subsets) ? subsets : []).map((s) => String(s).toLowerCase()),
  );
  // latin-ext cobre acentos (áéíóúãõâêô) e ç
  return set.has("latin-ext");
}

async function loadRemoteCatalog() {
  if (remoteCatalog) return remoteCatalog;
  if (remoteCatalogPromise) return remoteCatalogPromise;

  remoteCatalogPromise = (async () => {
    try {
      const text = await fetchText("https://fonts.google.com/metadata/fonts");
      const start = text.indexOf("{");
      const json = JSON.parse(start >= 0 ? text.slice(start) : text);
      const list = json.familyMetadataList || json.familyMetadata || [];
      remoteCatalog = list
        .map((f) => {
          const family = String(f.family || f.displayName || "").trim();
          if (!family) return null;
          const subsets = Array.isArray(f.subsets) ? f.subsets : [];
          return {
            id: slugFamily(family),
            family,
            category: String(f.category || "sans-serif"),
            supportsPt: supportsPortuguese(subsets),
          };
        })
        .filter(Boolean);
      const pt = remoteCatalog.filter((f) => f.supportsPt).length;
      console.log(
        `[fonts] catálogo Google: ${remoteCatalog.length} famílias (${pt} com latin-ext / PT)`,
      );
      return remoteCatalog;
    } catch (err) {
      console.warn("[fonts] falha ao carregar catálogo remoto — usando lista local", err?.message || err);
      remoteCatalog = CATALOG.map((f) => ({ ...f, supportsPt: true }));
      return remoteCatalog;
    } finally {
      remoteCatalogPromise = null;
    }
  })();

  return remoteCatalogPromise;
}

/**
 * Busca fontes pelo nome. Sem query → lista curada.
 * Com query → filtra o catálogo completo (só fontes com acentos/ç = latin-ext).
 */
async function listCatalog(query = "") {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const importedByFamily = new Map(
    listImported().map((f) => [String(f.family || "").toLowerCase(), f]),
  );
  const mark = (f) => {
    const hit = importedByFamily.get(String(f.family || "").toLowerCase());
    return {
      id: f.id,
      family: f.family,
      category: f.category,
      supportsPt: f.supportsPt !== false,
      imported: Boolean(hit),
      importedId: hit?.id || null,
    };
  };

  if (!q) {
    return CATALOG.map((f) => mark({ ...f, supportsPt: true }));
  }

  const all = await loadRemoteCatalog();
  const scored = [];
  for (const f of all) {
    if (!f.supportsPt) continue;
    const name = f.family.toLowerCase();
    const id = f.id.toLowerCase();
    if (name === q || id === q) scored.push({ f, score: 0 });
    else if (name.startsWith(q) || id.startsWith(q)) scored.push({ f, score: 1 });
    else if (name.includes(q) || id.includes(q)) scored.push({ f, score: 2 });
  }
  scored.sort((a, b) => a.score - b.score || a.f.family.localeCompare(b.f.family));
  return scored.slice(0, 48).map(({ f }) => mark(f));
}

module.exports = {
  CATALOG,
  listCatalog,
  listImported,
  importGoogleFont,
  buildInjectCss,
  removeFont,
  fontOptions,
  fontsRoot,
  loadRemoteCatalog,
};
