// Puente entre el proceso principal y la página.
// Con contextIsolation activado, el renderer solo ve lo que exponemos aquí.
// Reproducimos exactamente dos interfaces que el HTML ya esperaba:
//   - window.storage.get/set  (persistencia; antes la ponía el sandbox de artifacts)
//   - window.desktop          (nuevo: enruta la API por Node; su sola presencia
//                              le dice al renderer que corre como app de escritorio)

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("storage", {
  get: (key) => ipcRenderer.invoke("storage:get", key),
  set: (key, value) => ipcRenderer.invoke("storage:set", key, value),
});

contextBridge.exposeInMainWorld("desktop", {
  // devuelve { text } o { error }
  claude: (body, key) => ipcRenderer.invoke("api:claude", body, key),
  gtx: (text, tl) => ipcRenderer.invoke("api:gtx", text, tl),
});
