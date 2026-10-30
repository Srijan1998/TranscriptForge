const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fetchTranscript: (data) => ipcRenderer.invoke('fetch-transcript', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyToClipboard: (text) => {
    clipboard.writeText(text);
    return true;
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
