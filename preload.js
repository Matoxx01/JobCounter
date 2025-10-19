const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal safe API to renderer
contextBridge.exposeInMainWorld('ipcRenderer', {
	invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
