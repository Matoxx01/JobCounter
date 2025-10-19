const { app, BrowserWindow } = require('electron');
const { dialog } = require('electron');
const { ipcMain } = require('electron');
const { Tray, Notification } = require('electron');
const path = require('path');

// Inicialización de SQLite
const fs = require('fs');
const dataPath = path.join(__dirname, 'data.json');

// In-memory cache of data.json
let storage = { time_slaps: [], register: [] };

// Tray instance (created when window ready)
let tray = null;

// Ensure Windows notifications and taskbar use a consistent AppID and app name
try {
  if (process.platform === 'win32' && app && typeof app.setAppUserModelId === 'function') {
    // use a stable app id used for notifications
    app.setAppUserModelId('Cartoon Job Counter');
  }
  if (app && app.name !== 'Cartoon Job Counter') {
    app.name = 'Cartoon Job Counter';
  }
} catch (e) { /* ignore if not available */ }

function loadStorage() {
  try {
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf8');
      storage = JSON.parse(raw || '{}');
      storage.time_slaps = storage.time_slaps || [];
      storage.register = storage.register || [];
    } else {
      storage = { time_slaps: [], register: [] };
      fs.writeFileSync(dataPath, JSON.stringify(storage, null, 2));
    }
  } catch (e) {
    console.error('Failed to load storage', e);
    storage = { time_slaps: [], register: [] };
  }
}

function saveStorage() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(storage, null, 2));
  } catch (e) {
    console.error('Failed to save storage', e);
  }
}

function createWindow() {

  // Crear ventana
  const win = new BrowserWindow({
    width: 500,
    height: 500,
    minWidth: 500,
    minHeight: 500,
    icon: path.join(__dirname, 'build', 'favicon.png'),
    preload: path.join(__dirname, 'preload.js'),
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('public/index.html');
  win.removeMenu();

  // When window is minimized, hide to tray and show a notification
  win.on('minimize', (event) => {
    try {
      event.preventDefault();
      win.hide();
      // Try native Notification first
      try {
        if (process.platform === 'win32' && tray && typeof tray.displayBalloon === 'function') {
          tray.displayBalloon({ title: 'Cartoon Job Counter', content: 'App minimized to tray. Timer will continue running.' });
        }
      } catch(e) { /* ignore */ }
    } catch (e) { console.warn('minimize handler failed', e); }
  });

  // Create tray icon once (idempotent)
  try {
    if (!tray) {
      const iconPath = path.join(__dirname, 'build', 'favicon.png');
      tray = new Tray(iconPath);
      tray.setToolTip('Cartoon Job Counter');
      tray.on('click', () => {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      });
    }
  } catch (e) { console.warn('Tray creation failed', e); }
}

function initDatabase() {
  // load JSON storage
  loadStorage();
  console.log('Loaded JSON storage from', dataPath);
  // After loading storage, process any missed weekly registers
  try {
    processWeekly();
  } catch (e) { console.warn('processWeekly failed on init', e); }
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function mondayOf(date){ const day = date.getDay(); const daysSinceMon = (day+6)%7; const m=new Date(date); m.setDate(date.getDate()-daysSinceMon); m.setHours(0,0,0,0); return m; }

function parseSignedHHMMSSToSeconds(str){ if (!str) return null; const sign = str.trim().startsWith('-')?-1:1; const s=str.trim().replace(/^[-+]/,''); const parts=s.split(':').map(x=>parseInt(x,10)||0); if (parts.length===3) return sign*(parts[0]*3600+parts[1]*60+parts[2]); if (parts.length===2) return sign*(parts[0]*60+parts[1]); return sign*(parts[0]||0); }

function formatHourFromSeconds(sec){ if (sec===null || sec===undefined) return '+00:00'; const sign = sec<0?'-':'+'; const abs = Math.abs(Math.floor(sec)); const hh = String(Math.floor(abs/3600)).padStart(2,'0'); const mm = String(Math.floor((abs%3600)/60)).padStart(2,'0'); return `${sign}${hh}:${mm}`; }

function processWeekly(){
  // Create register rows for each Monday from the snapshot's monday up to (but not including) this week's monday
  if (!storage.time_slaps || storage.time_slaps.length===0) return [];
  const snap = storage.time_slaps[0];
  if (!snap || !snap.saved_at) return [];
  const snapDate = new Date(snap.saved_at);
  const startMon = mondayOf(snapDate);
  const nowMon = mondayOf(new Date());
  const created = [];
  // Find latest week already in register to avoid duplicates
  const existingWeeks = new Set((storage.register||[]).map(r=>r.week));
  // determine starting id for new register rows (handle existing rows without id gracefully)
  let nextRegId = 1;
  if (storage.register && storage.register.length>0) {
    const maxId = Math.max(...storage.register.map(r=>r.id||0));
    nextRegId = maxId + 1;
  }
  // If the snapshot's Monday is before this week's Monday, create only one register
  // entry for the week when the timer was started (do not auto-fill all intervening weeks).
  if (startMon.getTime() < nowMon.getTime()) {
    const weekISO = fmtDate(startMon);
    if (!existingWeeks.has(weekISO)) {
      let sec = null;
      if (snap.time_stamp) sec = parseSignedHHMMSSToSeconds(snap.time_stamp);
      if (sec===null && snap.time_start) sec = parseSignedHHMMSSToSeconds(snap.time_start);
      const hourStr = formatHourFromSeconds(sec);
      storage.register = storage.register || [];
      const regRow = { id: nextRegId++, week: weekISO, hour: hourStr };
      storage.register.push(regRow);
      created.push(regRow);
    }
  }
  if (created.length>0) {
    // After registering the week(s), clear the stored time_stamp since we've recorded it
    if (storage.time_slaps && storage.time_slaps.length>0) {
      storage.time_slaps[0].time_stamp = null;
      storage.time_slaps[0].saved_at = new Date().toISOString();
    }
    saveStorage();
  }
  return created;
}

ipcMain.handle('storage:process_weekly', async ()=>{
  return processWeekly();
});

// Return the register rows
ipcMain.handle('storage:get_register', async ()=>{
  storage.register = storage.register || [];
  // Return a shallow copy to avoid renderer mutating main memory
  return storage.register.slice();
});

// Delete a register row by id
ipcMain.handle('storage:delete_register', async (event, { id }) => {
  if (!storage.register || storage.register.length===0) return { ok: false };
  const idx = storage.register.findIndex(r => r.id === id);
  if (idx === -1) return { ok: false };
  storage.register.splice(idx, 1);
  saveStorage();
  return { ok: true };
});

// Show a confirmation dialog for deleting a register row
ipcMain.handle('dialog:confirm_delete', async (event, { text }) => {
  const result = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Sí', 'No'],
    defaultId: 1,
    cancelId: 1,
    title: 'Eliminar registro',
    message: text || '¿Está seguro de eliminar el registro?'
  });
  return { confirmed: result.response === 0 };
});

// Assets management: list, add (via dialog + copy), delete
ipcMain.handle('assets:list', async (event, { type }) => {
  try {
    const folder = type === 'music' ? 'music' : 'images';
    const dir = path.join(__dirname, 'assets', folder);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => {
      if (folder === 'images') return /\.gif$/i.test(f);
      if (folder === 'music') return /\.(mp3|wav|ogg|m4a)$/i.test(f);
      return true;
    });
    return files;
  } catch (e) {
    console.error('assets:list failed', e);
    return [];
  }
});

ipcMain.handle('assets:add', async (event, { type }) => {
  try {
    const folder = type === 'music' ? 'music' : 'images';
    const dir = path.join(__dirname, 'assets', folder);
    const filters = folder === 'images' ? [{ name: 'GIF', extensions: ['gif'] }] : [{ name: 'Music', extensions: ['mp3','wav','ogg','m4a'] }];
    const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
    if (res.canceled || !res.filePaths || res.filePaths.length===0) return { ok: false };
    const src = res.filePaths[0];
    const base = path.basename(src);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let dest = path.join(dir, base);
    // if exists, create a unique name
    let i = 1;
    const ext = path.extname(base);
    const nameOnly = path.basename(base, ext);
    while (fs.existsSync(dest)) {
      dest = path.join(dir, `${nameOnly}(${i})${ext}`);
      i++;
    }
    fs.copyFileSync(src, dest);
    return { ok: true, name: path.basename(dest) };
  } catch (e) {
    console.error('assets:add failed', e);
    return { ok: false };
  }
});

ipcMain.handle('assets:delete', async (event, { type, name }) => {
  try {
    const folder = type === 'music' ? 'music' : 'images';
    const file = path.join(__dirname, 'assets', folder, name);
    if (!fs.existsSync(file)) return { ok: false };
    fs.unlinkSync(file);
    return { ok: true };
  } catch (e) {
    console.error('assets:delete failed', e);
    return { ok: false };
  }
});

function closeDatabase() {
  saveStorage();
}

// Initialize app: set up storage and create the window after app is ready
app.whenReady().then(() => {
  try { initDatabase(); } catch(e){ console.warn('initDatabase failed', e); }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: restore/show the app window
ipcMain.handle('app:show', async ()=>{
  const wins = BrowserWindow.getAllWindows();
  if (wins && wins.length>0) {
    const w = wins[0];
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }
  return { ok: true };
});

// IPC: alarm triggered in renderer - show notification and restore window
ipcMain.handle('alarm:trigger', async ()=>{
  const wins = BrowserWindow.getAllWindows();
  if (wins && wins.length>0) {
    const w = wins[0];
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title: 'Cartoon Job Counter - Alarma', body: 'Se alcanzó la cuota.' });
      n.show();
      n.on('click', ()=>{
        const wins2 = BrowserWindow.getAllWindows(); if (wins2 && wins2.length>0){ wins2[0].show(); wins2[0].focus(); }
      });
    }
  } catch(e) { console.warn('alarm notify failed', e); }
  return { ok: true };
});

// Cerrar la DB antes de salir
app.on('before-quit', () => {
  closeDatabase();
});

// Helper: format date to YYYY-MM-DD
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Insert a new time_slap row recording a timestamp
ipcMain.handle('storage:add_snapshot', async (event, { time_start, time_stamp }) => {
  const savedAt = new Date().toISOString();
  const row = { time_start: time_start||null, time_stamp: time_stamp||null, saved_at: savedAt };
  storage.time_slaps.push(row);
  saveStorage();
  return { ok: true };
});

// Update last time_slap row (used on stop or app close)
// Keep a handler named update_last but implement it as inserting a new snapshot row
ipcMain.handle('storage:add_snapshot_simple', async (event, { time_stamp }) => {
  const savedAt = new Date().toISOString();
  const row = { time_start: null, time_stamp: time_stamp||null, saved_at: savedAt };
  storage.time_slaps.push(row);
  saveStorage();
  return { ok: true };
});

// Get last saved time_slap row
ipcMain.handle('storage:get_last', async ()=>{
  // Return the single authoritative time_slap (index 0) if present
  if (storage.time_slaps.length===0) return null;
  // ensure we don't expose any id field (time_slaps no longer have ids)
  const row = storage.time_slaps[0];
  return { time_start: row.time_start||null, time_stamp: row.time_stamp||null, saved_at: row.saved_at||null };
});

ipcMain.handle('storage:has_snapshot_this_week', async ()=>{
  if (storage.time_slaps.length===0) return { has: false };
  const row = storage.time_slaps[0];
  if (!row || !row.saved_at || !row.time_stamp) return { has: false };
  const saved = new Date(row.saved_at);
  const now = new Date();
  function mondayOf(date){ const day = date.getDay(); const daysSinceMon = (day+6)%7; const m=new Date(date); m.setDate(date.getDate()-daysSinceMon); m.setHours(0,0,0,0); return m; }
  return { has: mondayOf(saved).getTime() === mondayOf(now).getTime() };
});

// Set the configured starting time for the current week (time_start = 'HH:MM:SS')
ipcMain.handle('storage:set_start', async (event, { time_start }) => {
  const savedAt = new Date().toISOString();
  const existing = storage.time_slaps.length>0 ? storage.time_slaps[0] : null;
  const row = { time_start: time_start||null, time_stamp: existing ? existing.time_stamp : null, saved_at: savedAt };
  if (storage.time_slaps.length>0) storage.time_slaps[0] = row; else storage.time_slaps.push(row);
  saveStorage();
  return { ok: true };
});

// Replace or set the single time_slap with a snapshot (time_stamp)
ipcMain.handle('storage:set_time_slap', async (event, { time_stamp }) => {
  const savedAt = new Date().toISOString();
  const prevStart = storage.time_slaps.length>0 ? storage.time_slaps[0].time_start : null;
  const row = { time_start: prevStart || null, time_stamp: time_stamp||null, saved_at: savedAt };
  storage.time_slaps[0] = row;
  saveStorage();
  return { ok: true };
});

// Get all snapshots
ipcMain.handle('storage:get_all', async ()=>{
  return storage.time_slaps.slice();
});

// Save the configured starting time for the current week (time_start = 'HH:MM:SS')
ipcMain.handle('time_slap:set_start', async (event, { time_start }) => {
  return new Promise((resolve, reject)=>{
    const savedAt = new Date().toISOString();
    db.run(`INSERT INTO time_slap(time_start, saved_at) VALUES(?,?)`, [time_start||null, savedAt], function(err){
      if (err) return reject(err);
      resolve({ id: this.lastID });
    });
  });
});

// Get the latest time_slap for a given week start date (weekStart in YYYY-MM-DD)
ipcMain.handle('time_slap:get_for_week', async (event, { weekStart }) => {
  return new Promise((resolve, reject)=>{
    // find the latest time_slap with saved_at on or before weekStart+7 days (rough heuristic)
    db.get(`SELECT * FROM time_slap ORDER BY id DESC LIMIT 1`, (err, row)=>{
      if (err) return reject(err);
      resolve(row || null);
    });
  });
});

// Register weekly summarization: called externally or on app start if needed
ipcMain.handle('weekly:process', async ()=>{
  // Determine last Monday and aggregate the most recent time_slap entries to produce a register row
  return new Promise((resolve, reject)=>{
    // Get all time_slap rows
    db.all(`SELECT * FROM time_slap ORDER BY id ASC`, (err, rows)=>{
      if (err) return reject(err);

      // Find earliest and latest timestamps and time_start values to compute intervals per week.
      // For simplicity, we'll create a register row for the Monday prior to now using last recorded remaining.
      const now = new Date();
      // compute last Monday (start of current week)
      const day = now.getDay(); // 0 Sun, 1 Mon
      const daysSinceMon = (day + 6) % 7; // 0 if Mon
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - daysSinceMon);
      thisMonday.setHours(0,0,0,0);

      // Monday prior
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);

      // Find the time_slap row closest before thisMonday (i.e., snapshot at previous Monday)
      let snapshot = null;
      for (let i = rows.length-1;i>=0;i--) {
        const r = rows[i];
        // parse time_stamp as ISO if possible
        const ts = r && r.time_stamp ? new Date(r.time_stamp) : null;
        if (!ts) continue;
        if (ts <= thisMonday) { snapshot = r; break; }
      }

      // If no snapshot found, use earliest
      if (!snapshot) snapshot = rows.length>0? rows[0]: null;

      // Create register entry using snapshot.remaining
      const weekStart = fmtDate(lastMonday);
      const timeStr = snapshot ? (()=>{
        // derive HH:MM string from remaining (abs) and prefix
        const rem = snapshot.remaining || 0;
        const sign = rem<0? '-' : '+';
        const abs = Math.abs(rem);
        const hh = String(Math.floor(abs/3600)).padStart(2,'0');
        const mm = String(Math.floor((abs%3600)/60)).padStart(2,'0');
        return `${sign}${hh}:${mm}`;
      })() : '+00:00';

      db.run(`INSERT INTO register(week, hour) VALUES(?,?)`, [weekStart, timeStr], function(err2){
        if (err2) return reject(err2);
        resolve({ created: this.lastID });
      });
    });
  });
});
