// Proceso principal de Electron.
// Aquí vive todo lo que el navegador no puede hacer por el origen opaco:
//   - la llamada a la API de Anthropic y al traductor de respaldo (Google),
//     ambas desde Node, sin CORS y sin exponer la clave en el renderer;
//   - la persistencia de la biblioteca en un JSON en la carpeta de datos.
// El renderer sigue siendo lector-bilingue.html, casi sin tocar.

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#0E1116", // el mismo --ink de la interfaz, evita el flash blanco al abrir
    title: "Lector bilingüe",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // el renderer no ve Node; solo el puente de preload.js
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.removeMenu(); // sin barra de menú: es una app de lectura, no un editor
  win.loadFile("lector-bilingue.html");

  // los enlaces externos se abren en el navegador del sistema, no en la app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

/* ============ Persistencia en disco ============ */
// Un solo JSON con todas las claves. Reemplaza al window.storage del sandbox
// de artifacts; la interfaz (get/set) es la misma para no tocar el renderer.
const storePath = () => path.join(app.getPath("userData"), "store.json");
function readStore() {
  try { return JSON.parse(fs.readFileSync(storePath(), "utf8")); } catch (e) { return {}; }
}
function writeStore(obj) {
  try { fs.writeFileSync(storePath(), JSON.stringify(obj)); } catch (e) {}
}
ipcMain.handle("storage:get", (_e, key) => {
  const o = readStore();
  return key in o ? { value: o[key] } : null;
});
ipcMain.handle("storage:set", (_e, key, value) => {
  const o = readStore();
  o[key] = value;
  writeStore(o);
  return true;
});

/* ============ API de traducción ============ */
// Llamada a Claude desde Node: sin CORS, sin el header de acceso directo del
// navegador, y con la clave viajando solo hasta aquí (nunca queda en la página).
ipcMain.handle("api:claude", async (_e, body, key) => {
  const h = { "Content-Type": "application/json" };
  if (key) { h["x-api-key"] = key; h["anthropic-version"] = "2023-06-01"; }
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: h, body: JSON.stringify(body),
    });
  } catch (e) {
    return { error: key ? "no se pudo contactar la API (revisa la conexión o la clave)" : "falta la clave de API en el pie de página" };
  }
  if (res.status === 401) return { error: "la clave de API no es válida" };
  if (res.status === 429) return { error: "límite de uso alcanzado, espera un momento" };
  if (!res.ok) return { error: "la API respondió " + res.status };
  const d = await res.json();
  const text = (d.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
  return { text };
});

// Traductor de respaldo (endpoint público de Google Translate).
ipcMain.handle("api:gtx", async (_e, text, tl) => {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
    tl + "&dt=t&q=" + encodeURIComponent(text);
  let r;
  try { r = await fetch(url); }
  catch (e) { return { error: "el traductor de respaldo no es alcanzable (revisa la conexión)" }; }
  if (!r.ok) return { error: "traductor de respaldo no disponible (" + r.status + ")" };
  const d = await r.json();
  return { text: (d[0] || []).map(s => s[0] || "").join("") };
});

/* ============ Ciclo de vida ============ */
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
