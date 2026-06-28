const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDesktopSourceId: () => ipcRenderer.invoke('get-desktop-source-id'),
  onShowMessage: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('show-openclaw-message', subscription);
    return () => ipcRenderer.removeListener('show-openclaw-message', subscription);
  }
});
