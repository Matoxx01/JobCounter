const { app, BrowserWindow } = require('electron');
require('dotenv').config();
const path = require('path');

// Inicialización de SQLite
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'db.sqlite3');
let db;

function createWindow() {

  // Crear ventana
  const win = new BrowserWindow({
    width: 700,
    height: 700,
    minWidth: 700,
    minHeight: 700,
    icon: path.join(__dirname, 'build', 'favicon.png'),
    preload: path.join(__dirname, 'preload.js'),
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('public/index.html');
  win.removeMenu();
}

function initDatabase() {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      return;
    }
    console.log('Connected to SQLite database at', dbPath);

    // Crear tablas básicas si no existen
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          company TEXT,
          status TEXT,
          created_at DATETIME DEFAULT (datetime('now'))
        )
      `);

    });
  });
}

function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) console.error('Error closing database:', err.message);
      else console.log('Closed SQLite database');
    });
  }
}

app.whenReady().then(createWindow);

// Inicializar DB cuando la app esté lista
app.whenReady().then(() => {
  initDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Cerrar la DB antes de salir
app.on('before-quit', () => {
  closeDatabase();
});
