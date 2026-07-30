const { contextBridge, ipcRenderer } = require("electron");

let webUtils = null;
try {
  webUtils = require("electron").webUtils;
} catch {
  webUtils = null;
}

contextBridge.exposeInMainWorld("projection", {
  getLive: () => ipcRenderer.invoke("get-live"),
  setLive: (next) => ipcRenderer.invoke("set-live", next),
  onLive: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("live:update", handler);
    return () => ipcRenderer.removeListener("live:update", handler);
  },
  listDisplays: () => ipcRenderer.invoke("list-displays"),
  getOutputConfig: () => ipcRenderer.invoke("get-output-config"),
  setOutputConfig: (cfg) => ipcRenderer.invoke("set-output-config", cfg),
  openProgramOutput: () => ipcRenderer.invoke("open-program-output"),
  setSimulation: (enabled) => ipcRenderer.invoke("set-simulation", enabled),
  closeOutput: () => ipcRenderer.invoke("close-output"),
  reassertOutput: () => ipcRenderer.invoke("reassert-output"),
  onSimulation: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("simulation:update", handler);
    return () => ipcRenderer.removeListener("simulation:update", handler);
  },
  onOutputConfig: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("output-config:update", handler);
    return () => ipcRenderer.removeListener("output-config:update", handler);
  },
  onDisplays: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("displays:update", handler);
    return () => ipcRenderer.removeListener("displays:update", handler);
  },
  holyricsFindDefault: () => ipcRenderer.invoke("holyrics:find-default"),
  holyricsImportPath: (filePath) =>
    ipcRenderer.invoke("holyrics:import-path", filePath),
  holyricsImportDialog: () => ipcRenderer.invoke("holyrics:import-dialog"),
  holyricsImportAuto: () => ipcRenderer.invoke("holyrics:import-auto"),
  listThemes: () => ipcRenderer.invoke("theme:list"),
  getTheme: () => ipcRenderer.invoke("theme:get"),
  setTheme: (theme) => ipcRenderer.invoke("theme:set", theme),
  getBibleTheme: () => ipcRenderer.invoke("bible-theme:get"),
  setBibleTheme: (theme) => ipcRenderer.invoke("bible-theme:set", theme),
  saveTheme: (theme) => ipcRenderer.invoke("theme:save", theme),
  saveThemeAs: (theme, name) =>
    ipcRenderer.invoke("theme:save-as", { theme, name }),
  deleteTheme: (themeId) => ipcRenderer.invoke("theme:delete", themeId),
  pickThemeBackground: (kind) =>
    ipcRenderer.invoke("theme:pick-background", kind),
  importThemeDialog: () => ipcRenderer.invoke("theme:import-dialog"),
  onTheme: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("theme:update", handler);
    return () => ipcRenderer.removeListener("theme:update", handler);
  },
  onThemesList: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("themes:list", handler);
    return () => ipcRenderer.removeListener("themes:list", handler);
  },
  onBibleTheme: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("bible-theme:update", handler);
    return () => ipcRenderer.removeListener("bible-theme:update", handler);
  },
  bibleVersions: () => ipcRenderer.invoke("bible:versions"),
  bibleBooks: (versionId) => ipcRenderer.invoke("bible:books", versionId),
  bibleChapter: (payload) => ipcRenderer.invoke("bible:chapter", payload),
  bibleRange: (payload) => ipcRenderer.invoke("bible:range", payload),
  mediaList: () => ipcRenderer.invoke("media:list"),
  mediaDelete: (item) => ipcRenderer.invoke("media:delete", item),
  mediaImportDialog: (opts) => ipcRenderer.invoke("media:import-dialog", opts),
  mediaImportPaths: (paths) => ipcRenderer.invoke("media:import-paths", paths),
  mediaImportUrl: (url) => ipcRenderer.invoke("media:import-url", url),
  mediaProbe: (filePath) => ipcRenderer.invoke("media:probe", filePath),
  saveWebLiveFrame: (dataUrl) =>
    ipcRenderer.invoke("media:save-web-live-frame", dataUrl),
  cameraEnsureAccess: () => ipcRenderer.invoke("camera:ensure-access"),
  fontsCatalog: (query) => ipcRenderer.invoke("fonts:catalog", query),
  fontsList: () => ipcRenderer.invoke("fonts:list"),
  fontsImport: (family) => ipcRenderer.invoke("fonts:import", family),
  fontsRemove: (id) => ipcRenderer.invoke("fonts:remove", id),
  onFonts: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("fonts:update", handler);
    return () => ipcRenderer.removeListener("fonts:update", handler);
  },
  songSaveStyles: (payload) => ipcRenderer.invoke("song:save-styles", payload),
  songLoadStyles: () => ipcRenderer.invoke("song:load-styles"),
  songList: () => ipcRenderer.invoke("song:list"),
  songUpsert: (song) => ipcRenderer.invoke("song:upsert", song),
  songDelete: (songId) => ipcRenderer.invoke("song:delete", songId),
  songSaveLibrary: (songs) => ipcRenderer.invoke("song:save-library", songs),
  planLoad: () => ipcRenderer.invoke("plan:load"),
  planSave: (items) => ipcRenderer.invoke("plan:save", items),
  lyricsSearch: (payload) => ipcRenderer.invoke("lyrics:search", payload),
  lyricsSuggest: (payload) => ipcRenderer.invoke("lyrics:suggest", payload),
  lyricsGetApiKey: () => ipcRenderer.invoke("lyrics:get-api-key"),
  lyricsSetApiKey: (key) => ipcRenderer.invoke("lyrics:set-api-key", key),
  getPathForFile: (file) => {
    try {
      if (webUtils?.getPathForFile) return webUtils.getPathForFile(file);
      return file?.path || null;
    } catch {
      return file?.path || null;
    }
  },
  ndiStatus: () => ipcRenderer.invoke("ndi:status"),
  ndiSetEnabled: (enabled, name) =>
    ipcRenderer.invoke("ndi:set-enabled", { enabled, name }),
  ndiSetName: (name) => ipcRenderer.invoke("ndi:set-name", name),
});
