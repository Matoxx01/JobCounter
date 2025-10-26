const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// When the app starts (preload runs early), seed localStorage from bundled data.json
// if no existing DB is present in localStorage. This allows exported builds to use
// the packaged defaults and then persist runtime changes in localStorage.
try {
	// Resolve data.json next to the app root
	const dataPath = path.join(__dirname, 'data.json');
	if (fs.existsSync(dataPath)) {
		try {
			const raw = fs.readFileSync(dataPath, 'utf8') || '';
			const parsed = JSON.parse(raw || '{}');
			// We'll store the entire JSON under a single key so renderer can use it as DB
			const STORAGE_KEY = 'cartoonjobcounter_db';
			// Only seed if nothing is present to avoid overwriting user changes
			try {
				const existing = global.localStorage && global.localStorage.getItem && global.localStorage.getItem(STORAGE_KEY);
				if (!existing) {
					// Note: contextIsolation may be enabled; preload runs in an isolated world but has access to localStorage
					global.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
				}
			} catch (e) {
				// localStorage might be unavailable in some contexts; ignore silently
			}
		} catch (e) {
			// ignore parse/read errors
			console.warn('preload: failed to read/parse data.json', e);
		}
	}
} catch (e) {
	// ignore any unexpected errors
}

// Expose a minimal safe API to renderer
// Expose a safe ipc API: invoke (request/response) and on/off for events from main
contextBridge.exposeInMainWorld('ipcRenderer', {
	invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
	on: (channel, listener) => {
		const wrapped = (event, ...args) => listener(...args);
		ipcRenderer.on(channel, wrapped);
		// return unsubscribe function
		return () => ipcRenderer.removeListener(channel, wrapped);
	},
	removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// Also expose a small helper to tell the renderer that the bundled DB key exists
contextBridge.exposeInMainWorld('appBoot', {
	bundledDbKey: 'cartoonjobcounter_db'
});
