const { contextBridge, ipcRenderer } = require('electron');

// 画面側（renderer）から安全に呼べる窓口だけを公開する
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),

  hideWindow: () => ipcRenderer.send('win:hide'),
  minimizeWindow: () => ipcRenderer.send('win:minimize'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('win:toggleTop'),
  openExternal: (url) => ipcRenderer.send('open:external', url),

  listModels: (apiKey) => ipcRenderer.invoke('gemini:listModels', apiKey),
  generate: (payload) => ipcRenderer.invoke('gemini:generate', payload),
});
