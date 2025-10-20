(function () {
    // Lists discovered from the assets directories
    const musicList = [
        '../assets/music/Everything Stays (feat. Olivia Olson).mp3',
        '../assets/music/Island Song (Come Along with Me) (feat. Ashley Eriksson).mp3'
    ];

    const sounds = [
        'alert.wav',
        'delete.wav',
        'passhour.wav',
        'select.wav',
        'start.wav'
    ];

    const gifs = [
        '../assets/images/finn&jake.gif',
        '../assets/images/finn&jake2.gif',
        '../assets/images/steven.gif',
        '../assets/images/steven2.gif'
    ];

    // Load assets from main process and populate musicList and gifs arrays
    async function loadAssets(){
        try {
            if (!window.ipcRenderer) return;
            const musicFiles = await window.ipcRenderer.invoke('assets:list', { type: 'music' }) || [];
            // replace musicList contents
            musicList.length = 0;
            musicFiles.forEach(f => musicList.push('../assets/music/' + f));

            const imageFiles = await window.ipcRenderer.invoke('assets:list', { type: 'images' }) || [];
            gifs.length = 0;
            imageFiles.forEach(f => gifs.push('../assets/images/' + f));
        } catch (e) {
            console.warn('loadAssets failed', e);
        }
    }

    // ----------------------
    // Storage abstraction
    // ----------------------
    // Prefer using a localStorage-backed DB when present (seeded by preload from data.json)
    const BUNDLED_DB_KEY = (window.appBoot && window.appBoot.bundledDbKey) ? window.appBoot.bundledDbKey : 'cartoonjobcounter_db';

    function readBundledDb() {
        try {
            const raw = localStorage.getItem(BUNDLED_DB_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function writeBundledDb(obj) {
        try {
            localStorage.setItem(BUNDLED_DB_KEY, JSON.stringify(obj));
            return true;
        } catch (e) { return false; }
    }

    // Storage helpers used by the app. They will use localStorage DB if present, otherwise fall back to ipcRenderer.
    const Storage = {
        async getLast() {
            try {
                const db = readBundledDb();
                if (db && db.time_slaps && db.time_slaps.length>0) {
                    const row = db.time_slaps[0];
                    return { time_start: row.time_start||null, time_stamp: row.time_stamp||null, saved_at: row.saved_at||null };
                }
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:get_last').catch(()=>null);
            return null;
        },
        async setTimeSlap(time_stamp) {
            try {
                const db = readBundledDb();
                if (db) {
                    const prevStart = (db.time_slaps && db.time_slaps.length>0) ? db.time_slaps[0].time_start : null;
                    const savedAt = new Date().toISOString();
                    const row = { time_start: prevStart || null, time_stamp: time_stamp||null, saved_at: savedAt };
                    db.time_slaps = db.time_slaps || [];
                    db.time_slaps[0] = row;
                    writeBundledDb(db);
                    return { ok: true };
                }
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:set_time_slap', { time_stamp }).catch(()=>({ ok: false }));
            return { ok: false };
        },
        async setStart(time_start) {
            try {
                const db = readBundledDb();
                if (db) {
                    const savedAt = new Date().toISOString();
                    // When setting a new configured start, clear any existing time_stamp
                    // so the configured start becomes authoritative immediately.
                    const row = { time_start: time_start||null, time_stamp: null, saved_at: savedAt };
                    db.time_slaps = db.time_slaps || [];
                    db.time_slaps[0] = row;
                    writeBundledDb(db);
                    return { ok: true };
                }
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:set_start', { time_start }).catch(()=>({ ok: false }));
            return { ok: false };
        },
        async getRegister() {
            try {
                const db = readBundledDb();
                if (db && db.register) return db.register.slice();
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:get_register').catch(()=>[]);
            return [];
        },
        async deleteRegister(id) {
            try {
                const db = readBundledDb();
                if (db && db.register) {
                    const idx = db.register.findIndex(r=>r.id===id);
                    if (idx===-1) return { ok: false };
                    db.register.splice(idx,1);
                    writeBundledDb(db);
                    return { ok: true };
                }
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:delete_register', { id }).catch(()=>({ ok: false }));
            return { ok: false };
        },
        async listAllSnapshots() {
            try {
                const db = readBundledDb();
                if (db && db.time_slaps) return db.time_slaps.slice();
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:get_all').catch(()=>[]);
            return [];
        },
        async addSnapshotSimple(time_stamp) {
            try {
                const db = readBundledDb();
                if (db) {
                    const savedAt = new Date().toISOString();
                    const row = { time_start: null, time_stamp: time_stamp||null, saved_at: savedAt };
                    db.time_slaps = db.time_slaps || [];
                    db.time_slaps.push(row);
                    writeBundledDb(db);
                    return { ok: true };
                }
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:add_snapshot_simple', { time_stamp }).catch(()=>({ ok: false }));
            return { ok: false };
        },
        async addSnapshot(time_start, time_stamp) {
            try {
                const db = readBundledDb();
                if (db) {
                    const savedAt = new Date().toISOString();
                    const row = { time_start: time_start||null, time_stamp: time_stamp||null, saved_at: savedAt };
                    db.time_slaps = db.time_slaps || [];
                    db.time_slaps.push(row);
                    writeBundledDb(db);
                    return { ok: true };
                }
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:add_snapshot', { time_start, time_stamp }).catch(()=>({ ok: false }));
            return { ok: false };
        },
        async processWeekly() {
            try {
                const db = readBundledDb();
                if (db && db.time_slaps && db.time_slaps.length>0) {
                    const snap = db.time_slaps[0];
                    if (!snap || !snap.saved_at) return [];
                    const snapDate = new Date(snap.saved_at);
                    function mondayOf(date){ const day = date.getDay(); const daysSinceMon = (day+6)%7; const m=new Date(date); m.setDate(date.getDate()-daysSinceMon); m.setHours(0,0,0,0); return m; }
                    const startMon = mondayOf(snapDate);
                    const nowMon = mondayOf(new Date());
                    const created = [];
                    // existing weeks set
                    const existingWeeks = new Set((db.register||[]).map(r=>r.week));
                    // next id
                    let nextRegId = 1;
                    if (db.register && db.register.length>0) {
                        const maxId = Math.max(...db.register.map(r=>r.id||0));
                        nextRegId = maxId + 1;
                    }
                    // only create a register entry if snapshot's Monday is before this week's Monday
                    if (startMon.getTime() < nowMon.getTime()) {
                        const weekISO = (function(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; })(startMon);
                        if (!existingWeeks.has(weekISO)) {
                            // determine seconds from time_stamp or time_start
                            function parseSignedHHMMSSToSeconds(str){ if (!str) return null; const sign = str.trim().startsWith('-')?-1:1; const s=str.trim().replace(/^[-+]/,''); const parts=s.split(':').map(x=>parseInt(x,10)||0); if (parts.length===3) return sign*(parts[0]*3600+parts[1]*60+parts[2]); if (parts.length===2) return sign*(parts[0]*60+parts[1]); return sign*(parts[0]||0); }
                            function formatHourFromSeconds(sec){ if (sec===null || sec===undefined) return '+00:00'; const sign = sec<0?'-':'+'; const abs = Math.abs(Math.floor(sec)); const hh = String(Math.floor(abs/3600)).padStart(2,'0'); const mm = String(Math.floor((abs%3600)/60)).padStart(2,'0'); return `${sign}${hh}:${mm}`; }
                            let sec = null;
                            if (snap.time_stamp) sec = parseSignedHHMMSSToSeconds(snap.time_stamp);
                            if (sec===null && snap.time_start) sec = parseSignedHHMMSSToSeconds(snap.time_start);
                            const hourStr = formatHourFromSeconds(sec);
                            db.register = db.register || [];
                            const regRow = { id: nextRegId++, week: weekISO, hour: hourStr };
                            db.register.push(regRow);
                            created.push(regRow);
                        }
                    }
                    if (created.length>0) {
                        // clear time_stamp and update saved_at
                        if (db.time_slaps && db.time_slaps.length>0) {
                            db.time_slaps[0].time_stamp = null;
                            db.time_slaps[0].saved_at = new Date().toISOString();
                        }
                        writeBundledDb(db);
                    }
                    return created;
                }
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:process_weekly').catch(()=>[]);
            return [];
        },
        async hasSnapshotThisWeek() {
            try {
                const db = readBundledDb();
                if (db && db.time_slaps && db.time_slaps.length>0) {
                    const row = db.time_slaps[0];
                    if (!row || !row.saved_at || !row.time_stamp) return { has: false };
                    const saved = new Date(row.saved_at);
                    const now = new Date();
                    function mondayOf(date){ const day = date.getDay(); const daysSinceMon = (day+6)%7; const m=new Date(date); m.setDate(date.getDate()-daysSinceMon); m.setHours(0,0,0,0); return m; }
                    return { has: mondayOf(saved).getTime() === mondayOf(now).getTime() };
                }
            } catch(e){}
            if (window.ipcRenderer) return window.ipcRenderer.invoke('storage:has_snapshot_this_week').catch(()=>({ has: false }));
            return { has: false };
        }
    };


    // Utility: pick random item
    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Create background GIF element
    function createBackgroundGif() {
        const wrapper = document.createElement('div');
        wrapper.className = 'bg-gif-wrapper';

        const img = document.createElement('img');
        img.alt = 'background-gif';
    // encodeURI handles spaces and special chars like &
    img.src = encodeURI(pickRandom(gifs));

        // Add onload handler to ensure layout
        img.addEventListener('load', () => {
            // no-op; image will size with CSS (object-fit: contain)
        });

        wrapper.appendChild(img);
        document.body.appendChild(wrapper);
    }

    // Audio: play a single music track once on start
    function playOneRandomMusicOnce() {
        if (!musicList || musicList.length === 0) return;

    const chosen = pickRandom(musicList);
    const audio = new Audio(encodeURI(chosen));
        audio.loop = false;
        audio.preload = 'auto';

        // Modern browsers block autoplay with sound until user interaction.
        // We'll attempt to play; if it fails, wait for first user interaction.
        function tryPlay() {
            audio.play().catch(() => {
                // attach a one-time user gesture to start audio
                const startOnGesture = () => {
                    audio.play().catch(() => { /* still blocked */ });
                    window.removeEventListener('pointerdown', startOnGesture);
                    window.removeEventListener('keydown', startOnGesture);
                };
                window.addEventListener('pointerdown', startOnGesture, { once: true });
                window.addEventListener('keydown', startOnGesture, { once: true });
            });
        }

        // Try immediately
        tryPlay();
    }

    // Expose global function to play sounds from assets/sounds by name (without extension)
    window.playSound = function (name) {
        if (!name) return;
        // sanitize name: allow alphanum, -, _, and spaces (replace spaces with %20 for URL)
        const sanitized = String(name).replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/ /g, '%20');
        const fileName = sanitized + '.wav';

        // check existence quickly by comparing to list we have
        if (sounds.indexOf(fileName) === -1) {
            // not in known list; still try to play the path
            console.warn('playSound: sound not found in list, attempting to play anyway:', fileName);
        }

    const url = encodeURI('../assets/sounds/' + fileName);
    const s = new Audio(url);
        s.preload = 'auto';
        s.play().catch((e) => {
            // If blocked, attach a one-time gesture to retry
            const retry = () => {
                s.play().catch(() => {});
                window.removeEventListener('pointerdown', retry);
                window.removeEventListener('keydown', retry);
            };
            window.addEventListener('pointerdown', retry, { once: true });
            window.addEventListener('keydown', retry, { once: true });
        });
        return s;
    };

    // State to allow SPA-like navigation without reloading (keeps audio/background)
    let origHeaderText = null;
    let origContainerHTML = null;
    // Counter element reference (may be re-rendered when switching views)
    let counterEl = null;

    function attachMainHandlers() {
        const startBtn = document.getElementById('start');
        const stopBtn = document.getElementById('stop');
        const settingsBtn = document.getElementById('settings');

        if (startBtn) {
            // remove previous listeners to avoid duplicates
            startBtn.replaceWith(startBtn.cloneNode(true));
            const newStart = document.getElementById('start');
            newStart.addEventListener('click', () => {
                try { window.playSound('start'); } catch (e) { console.error('Failed to play start sound', e); }
                startTimerFromConfig();
            });
        }

        if (stopBtn) {
            stopBtn.replaceWith(stopBtn.cloneNode(true));
            const newStop = document.getElementById('stop');
            newStop.addEventListener('click', () => {
                try { window.playSound('delete'); } catch (e) { console.error('Failed to play delete sound', e); }
                stopTimer();
            });
        }

        if (settingsBtn) {
            settingsBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                try { window.playSound('select'); } catch (e) { console.error('Failed to play select sound', e); }
                showConfigView();
            });
        }
    }

    // Keep Start/Stop visibility in sync and persisted across view switches
    function updateStartStopVisibility() {
        try {
            const startBtn = document.getElementById('start');
            const stopBtn = document.getElementById('stop');
            if (timerRunning) {
                if (startBtn) startBtn.style.display = 'none';
                if (stopBtn) stopBtn.style.display = '';
            } else {
                if (startBtn) startBtn.style.display = '';
                if (stopBtn) stopBtn.style.display = 'none';
            }
        } catch (e) { /* ignore */ }
    }

    function setTimerRunningState(running) {
        timerRunning = !!running;
        try { sessionStorage.setItem('timerRunning', timerRunning ? '1' : '0'); } catch (e) {}
        updateStartStopVisibility();
    }

    function attachConfigHandlers() {
        const backBtn = document.getElementById('back');
        const registerBtn = document.getElementById('register');
        const saveBtn = document.getElementById('save');

        if (backBtn) {
            backBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                try { window.playSound('select'); } catch (e) { console.error('Failed to play select sound', e); }
                history.back();
            });
        }

        if (registerBtn) {
            registerBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                try { window.playSound('select'); } catch (e) { console.error('Failed to play select sound', e); }
                showRegisterView();
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                try { window.playSound('select'); } catch (e) { console.error('Failed to play select sound', e); }
                try {
                    const tlInput = document.getElementById('timeLapse');
                    if (tlInput) localStorage.setItem('timeLapse', tlInput.value);
                    // persist configured time_start to storage as HH:MM:SS but preserve time_stamp
                    try {
                        const parts = (tlInput && tlInput.value) ? tlInput.value.split(':').map(x=>parseInt(x,10)||0) : [0,0,0];
                        let hh = 0, mm = 0, ss = 0;
                        if (parts.length===3) { hh = parts[0]; mm = parts[1]; ss = parts[2]; }
                        else if (parts.length===2) { hh = 0; mm = parts[0]; ss = parts[1]; }
                        else { mm = parts[0]||0; }
                        const asHHMMSS = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
                        try {
                            // Ensure the configured start is persisted before leaving the settings
                            try {
                                const res = await Storage.setStart(asHHMMSS).catch(()=>({ ok: false }));
                                if (!res || !res.ok) {
                                    console.warn('Storage.setStart failed', res);
                                    alert('No se pudo guardar el tiempo configurado. Intente de nuevo.');
                                    return;
                                }
                            } catch (e) { console.warn('Storage.setStart threw', e); }
                        } catch(e){}
                    } catch(e){}
                } catch (e) { console.warn('Failed to save timeLapse', e); }
                // return to previous page
                try { history.back(); } catch(e) {}
            });
        }

        // Carousel controls for hours/minutes/seconds
        const hUp = document.getElementById('tl-hours-up');
        const hDown = document.getElementById('tl-hours-down');
        const mUp = document.getElementById('tl-minutes-up');
        const mDown = document.getElementById('tl-minutes-down');
        const sUp = document.getElementById('tl-seconds-up');
        const sDown = document.getElementById('tl-seconds-down');
        const hVal = document.getElementById('tl-hours');
        const mVal = document.getElementById('tl-minutes');
        const sVal = document.getElementById('tl-seconds');
        const hiddenInput = document.getElementById('timeLapse');

        function pad(n) { return String(n).padStart(2,'0'); }
        function getCurrent() {
            const h = hVal ? parseInt(hVal.textContent,10)||0 : 0;
            const m = mVal ? parseInt(mVal.textContent,10)||0 : 0;
            const s = sVal ? parseInt(sVal.textContent,10)||0 : 0;
            return {h,m,s};
        }
        function setCurrent(h,m,s) {
            h = Math.max(0, Math.min(99, Math.floor(h)));
            m = ((Math.floor(m)%60)+60)%60;
            s = ((Math.floor(s)%60)+60)%60;
            if (hVal) hVal.textContent = pad(h);
            if (mVal) mVal.textContent = pad(m);
            if (sVal) sVal.textContent = pad(s);
            const formatted = (h>0) ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
            if (hiddenInput) hiddenInput.value = formatted;
            try { localStorage.setItem('timeLapse', formatted); } catch (e) {}
        }

        function changeUnit(unit, delta) {
            const cur = getCurrent();
            if (unit === 'h') setCurrent(cur.h+delta, cur.m, cur.s);
            if (unit === 'm') setCurrent(cur.h, cur.m+delta, cur.s);
            if (unit === 's') setCurrent(cur.h, cur.m, cur.s+delta);
        }

        // Attach click and wheel handlers
    if (hUp) hUp.addEventListener('click', (e)=>{ e.preventDefault(); try{ window.playSound('select'); }catch{}; changeUnit('h',1); });
    if (hDown) hDown.addEventListener('click', (e)=>{ e.preventDefault(); try{ window.playSound('select'); }catch{}; changeUnit('h',-1); });
    if (mUp) mUp.addEventListener('click', (e)=>{ e.preventDefault(); try{ window.playSound('select'); }catch{}; changeUnit('m',1); });
    if (mDown) mDown.addEventListener('click', (e)=>{ e.preventDefault(); try{ window.playSound('select'); }catch{}; changeUnit('m',-1); });
    if (sUp) sUp.addEventListener('click', (e)=>{ e.preventDefault(); try{ window.playSound('select'); }catch{}; changeUnit('s',1); });
    if (sDown) sDown.addEventListener('click', (e)=>{ e.preventDefault(); try{ window.playSound('select'); }catch{}; changeUnit('s',-1); });

        function wheelHandlerFactory(unit) {
            return function(ev){ ev.preventDefault(); const delta = ev.deltaY>0 ? -1 : 1; try{ window.playSound('select'); }catch{}; changeUnit(unit, delta); };
        }
        if (hVal) hVal.addEventListener('wheel', wheelHandlerFactory('h'));
        if (mVal) mVal.addEventListener('wheel', wheelHandlerFactory('m'));
        if (sVal) sVal.addEventListener('wheel', wheelHandlerFactory('s'));

        // load stored value if present
        try {
            const stored = localStorage.getItem('timeLapse');
            if (stored) {
                const parts = stored.split(':').map(x=>parseInt(x,10)||0);
                if (parts.length===3) setCurrent(parts[0],parts[1],parts[2]);
                else if (parts.length===2) setCurrent(0,parts[0],parts[1]);
                else setCurrent(0,parts[0],0);
            }
        } catch(e) {}
    }

    function attachRegisterHandlers() {
        const backBtn = document.getElementById('back');
        if (backBtn) {
            backBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                try { window.playSound('select'); } catch (e) { console.error('Failed to play select sound', e); }
                history.back();
            });
        }
    }

    function showRegisterView(push = true) {
        const header = document.querySelector('h1');
        const container = document.getElementById('container');
        if (!container || !header) return;

        // Save original content so we can restore later
        if (origHeaderText === null) origHeaderText = header.textContent;
        if (origContainerHTML === null) origContainerHTML = container.innerHTML;

        // Update header and container to settings view
        header.textContent = 'Register';
        document.title = 'Register';

        // Replace container content — no buttons here as requested
            container.innerHTML = `
                <div class="register-panel">
                    <div id="registerList"></div>
                    <div class="btns">
                        <button id="back" class="btnRed">Back</button>
                    </div>
                </div>
            `;

        // attach handlers for elements inside the injected register view
        attachRegisterHandlers();

        // populate register list from storage
        (async function loadRegister(){
            try {
                // Ensure weekly processing runs for localStorage-backed DB so register entries
                // are created when appropriate (mirrors main.processWeekly behavior).
                try { await Storage.processWeekly(); } catch(e) { /* ignore */ }
                const rows = await Storage.getRegister();
                const list = document.getElementById('registerList');
                if (!list) return;
                list.innerHTML = '';
                // helper: format week 'YYYY-MM-DD' into '[d]-[mesAbr] Semana [num]'
                function formatWeekLabel(weekISO){
                    try {
                        const d = new Date(weekISO + 'T00:00:00');
                        const day = d.getDate();
                        const monthIdx = d.getMonth();
                        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                        // week number (ISO week): simple approximation using Jan 1-based calc
                        return `${day}-${months[monthIdx]}`;
                    } catch(e){ return weekISO; }
                }

                (rows||[]).forEach(r => {
                    const rowEl = document.createElement('div');
                    rowEl.className = 'register-row';

                    const left = document.createElement('div');
                    left.className = 'register-left';
                    left.textContent = formatWeekLabel(r.week);

                    const right = document.createElement('div');
                    right.className = 'register-right';

                    const time = document.createElement('div');
                    time.className = 'register-time';
                    // r.hour is like '+HH:MM' or '-HH:MM'
                    if (String(r.hour || '').trim().startsWith('-')) time.classList.add('negative'); else time.classList.add('positive');
                    time.textContent = r.hour || '+00:00';

                    const trash = document.createElement('div');
                    trash.className = 'register-trash';
                    const img = document.createElement('img');
                    img.src = encodeURI('../assets/icons/trash.svg');
                    img.alt = 'trash';
                    trash.appendChild(img);
                    trash.addEventListener('click', async (ev)=>{
                        ev.preventDefault();
                        try {
                            const dlg = await (window.ipcRenderer ? window.ipcRenderer.invoke('dialog:confirm_delete', { text: '¿Está seguro de eliminar el registro?' }) : { confirmed: true });
                            if (!dlg || !dlg.confirmed) {
                                try { if (window.playSound) window.playSound('select'); } catch(e){}
                                return;
                            }
                            try { if (window.playSound) window.playSound('delete'); } catch(e){}
                            const res = await Storage.deleteRegister(r.id);
                            if (res && res.ok) {
                                // remove from DOM
                                rowEl.remove();
                            } else {
                                alert('No se pudo eliminar el registro');
                            }
                        } catch(e){ console.error('delete register failed', e); alert('Error al eliminar'); }
                    });

                    right.appendChild(time);
                    right.appendChild(trash);

                    rowEl.appendChild(left);
                    rowEl.appendChild(right);
                    list.appendChild(rowEl);
                });

            } catch(e){ console.warn('Failed to load register', e); }
        })();

        if (push) {
            history.pushState({ page: 'register' }, 'Register', '#register');
        }
    }

    function showConfigView(push = true) {
        const header = document.querySelector('h1');
        const container = document.getElementById('container');
        if (!container || !header) return;

        // Save original content so we can restore later
        if (origHeaderText === null) origHeaderText = header.textContent;
        if (origContainerHTML === null) origContainerHTML = container.innerHTML;

        // Update header and container to settings view
        header.textContent = 'Settings';
        document.title = 'Settings';

        // Replace container content — no buttons here as requested
        container.innerHTML = `
            <div class="config-panel">
            <div>
                <div class="left-right">
                    <div class="leftContainer">
                        <p class="lyrics">Time lapse:</p>
                    </div>
                    <div class="rightContainer">
                        <div class="tl-carousel" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">
                            <div class="tl-unit">
                                <button id="tl-hours-up" class="arowsup">▲</button>
                                <div id="tl-hours" class="tl-value">00</div>
                                <button id="tl-hours-down" class="arowsdown">▼</button>
                            </div>
                            <div class="tl-unit">
                                <button id="tl-minutes-up" class="arowsup">▲</button>
                                <div id="tl-minutes" class="tl-value">00</div>
                                <button id="tl-minutes-down" class="arowsdown">▼</button>
                            </div>
                            <div class="tl-unit">
                                <button id="tl-seconds-up" class="arowsup">▲</button>
                                <div id="tl-seconds" class="tl-value">00</div>
                                <button id="tl-seconds-down" class="arowsdown">▼</button>
                            </div>
                            <input class="timelapse" type="hidden" id="timeLapse" name="timeLapse" value="10:00:00">
                        </div>
                    </div>
                </div>
                <div class="btns">
                    <button id="back" class="btnRed">Back</button>
                    <button id="save" class="btnGreen">Save</button>
                    <button id="register" class="btnBlue">Register</button>
                </div>
            </div>
            `;

        // attach handlers for config view buttons
        attachConfigHandlers();

        // Add the original two buttons below Time lapse to manage assets (keeps previous behavior)
        (function attachAssetButtons(){
            const container = document.querySelector('.config-panel > div');
            if (!container) return;
            const wrapper = document.createElement('div');
            // give it a class so it uses the same scrollbar styles as the register list
            wrapper.className = 'register-scroll';
            wrapper.style.marginTop = '10px';
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.gap = '8px';
            // make it scrollable like register but show exactly two buttons by default
            try {
                // create a temporary sample button to measure rendered height (including margins)
                const sample = document.createElement('button');
                sample.className = 'btnGray';
                sample.style.visibility = 'hidden';
                sample.style.position = 'absolute';
                sample.textContent = 'sample';
                wrapper.appendChild(sample);
                const cs = window.getComputedStyle(sample);
                const height = sample.offsetHeight || parseFloat(cs.height) || 40;
                const marginTop = parseFloat(cs.marginTop) || 0;
                const marginBottom = parseFloat(cs.marginBottom) || 0;
                const totalPerButton = Math.ceil(height + marginTop + marginBottom);
                // show two buttons worth of height
                wrapper.style.maxHeight = '130px';
                wrapper.style.overflowY = 'auto';
                // remove sample
                wrapper.removeChild(sample);
            } catch (e) {
                // fallback: approximately two buttons
                wrapper.style.maxHeight = '110px';
                wrapper.style.overflowY = 'auto';
            }

            const addGifs = document.createElement('button');
            addGifs.className = 'btnGray';
            addGifs.textContent = 'Add GIFs';
            addGifs.addEventListener('click', (ev)=>{ ev.preventDefault(); try{ window.playSound && window.playSound('select'); }catch{}; showAssetsView('images'); });

            const addMusic = document.createElement('button');
            addMusic.className = 'btnGray';
            addMusic.textContent = 'Add music';
            addMusic.addEventListener('click', (ev)=>{ ev.preventDefault(); try{ window.playSound && window.playSound('select'); }catch{}; showAssetsView('music'); });

            const resetBtn = document.createElement('button');
            resetBtn.className = 'btnGray';
            resetBtn.textContent = 'Reset to default settings';
            resetBtn.addEventListener('click', async (ev)=>{
                ev.preventDefault();
                try {
                    const ok = confirm('Restablecer configuración por defecto? Esto sobrescribirá los cambios actuales.');
                    if (!ok) return;
                    const defaultObj = { time_slaps: [ { time_start: '10:00:00', time_stamp: null, saved_at: null } ], register: [] };
                    try {
                        // update renderer localStorage-backed DB
                        try { writeBundledDb(defaultObj); } catch(e) { console.warn('writeBundledDb failed', e); }
                        // also ask main process to replace its in-memory storage and persist to disk
                        if (window.ipcRenderer) {
                            try {
                                // suppress beforeunload saving so this reset is not immediately overwritten
                                window.__suppressBeforeUnload = true;
                                const res = await window.ipcRenderer.invoke('storage:replace_with_default', { obj: defaultObj });
                                if (!res || !res.ok) {
                                    console.warn('IPC replace default returned failure', res);
                                    window.__suppressBeforeUnload = false;
                                    alert('No se pudo restablecer la configuración en el proceso principal.');
                                    return;
                                }
                            } catch (e) { console.warn('IPC replace default failed', e); }
                        }
                        try { localStorage.setItem('timeLapse', '10:00:00'); } catch(e) {}
                        // reload to pick up changes from both renderer and main
                        location.reload();
                    } catch(e){ console.warn('failed during reset', e); }
                } catch(e){ console.error('reset failed', e); alert('No se pudo restablecer'); }
            });

            wrapper.appendChild(addGifs);
            wrapper.appendChild(addMusic);
            wrapper.appendChild(resetBtn);
            container.appendChild(wrapper);
        })();

        // load stored timelapse value if present
        try {
            const stored = localStorage.getItem('timeLapse');
            const tlInput = document.getElementById('timeLapse');
            if (stored && tlInput) tlInput.value = stored;
        } catch (e) {}

        if (push) {
            history.pushState({ page: 'config' }, 'Settings', '#config');
        }
    }

    // Show assets listing and allow add/delete
    function showAssetsView(type, push = true) {
        const header = document.querySelector('h1');
        const container = document.getElementById('container');
        if (!container || !header) return;
        if (origHeaderText === null) origHeaderText = header.textContent;
        if (origContainerHTML === null) origContainerHTML = container.innerHTML;
        header.textContent = type === 'music' ? 'Add music' : 'Add GIFs';
        document.title = header.textContent;

        container.innerHTML = `
            <div class="register-panel">
                <div id="assetsList"></div>
                <div class="btns">
                    <button id="assets-back" class="btnRed">Back</button>
                    <button id="assets-add" class="btnGreen">Add</button>
                </div>
            </div>
        `;

        const list = document.getElementById('assetsList');
        const addBtn = document.getElementById('assets-add');
        const backBtn = document.getElementById('assets-back');

        async function load(){
            try {
                const rows = await window.ipcRenderer.invoke('assets:list', { type });
                list.innerHTML = '';
                rows.forEach(name => {
                const row = document.createElement('div');
                row.className = 'register-row';
                const left = document.createElement('div'); left.className = 'register-left';
                if (type === 'images') {
                    const thumb = document.createElement('img');
                    thumb.className = 'register-thumb';
                    thumb.src = encodeURI('../assets/images/' + name);
                    thumb.alt = name;
                    left.appendChild(thumb);
                    const span = document.createElement('span'); span.textContent = name; left.appendChild(span);
                } else {
                    left.textContent = name;
                }
                    const right = document.createElement('div'); right.className = 'register-right';
                    const del = document.createElement('div'); del.className = 'register-trash';
                    const img = document.createElement('img'); img.src = encodeURI('../assets/icons/trash.svg'); del.appendChild(img);
                    del.addEventListener('click', async ()=>{
                        const dlg = await window.ipcRenderer.invoke('dialog:confirm_delete', { text: `¿Eliminar ${name}?` });
                        if (!dlg || !dlg.confirmed) { try{ window.playSound && window.playSound('select'); }catch{}; return; }
                        try{ window.playSound && window.playSound('delete'); }catch{};
                        const res = await window.ipcRenderer.invoke('assets:delete', { type, name });
                        if (res && res.ok) { row.remove(); try{ await loadAssets(); }catch{} } else alert('No se pudo eliminar');
                    });
                    right.appendChild(del);
                    row.appendChild(left); row.appendChild(right); list.appendChild(row);
                });
            } catch(e){ console.error('load assets failed', e); }
        }

        addBtn.addEventListener('click', async ()=>{
            try{ try{ window.playSound && window.playSound('select'); }catch{};
                const res = await window.ipcRenderer.invoke('assets:add', { type });
                if (res && res.ok) { await load(); try{ await loadAssets(); }catch{} }
            } catch(e){ console.error('assets:add failed', e); }
        });

        backBtn.addEventListener('click', ()=>{ try{ window.playSound && window.playSound('select'); }catch{}; history.back(); });

        load();
        if (push) history.pushState({ page: `assets-${type}` }, header.textContent, `#assets-${type}`);
    }

    function showMainView() {
        const header = document.querySelector('h1');
        const container = document.getElementById('container');
        if (!container || !header) return;

        // Restore original content if we have it
        if (origHeaderText !== null) header.textContent = origHeaderText;
        if (origContainerHTML !== null) container.innerHTML = origContainerHTML;
        document.title = 'Counter';

        // Reattach handlers for buttons that were restored into the DOM
        attachMainHandlers();

    // Ensure Start/Stop visibility matches current timerRunning state
    updateStartStopVisibility();

        // Resolve counter element (container.innerHTML was restored) and render current value
        counterEl = document.getElementById('counter');
        try { updateCounterDisplay(); } catch (e) {}

        // Refresh current timer state from storage each time main view is shown
    (async function refreshFromStorage(){
            try {
        const last = await Storage.getLast();
                function parseSignedHHMMSS(str) {
                    if (!str) return null;
                    const sign = str.trim().startsWith('-') ? -1 : 1;
                    const s = str.trim().replace(/^[-+]/, '');
                    const parts = s.split(':').map(x=>parseInt(x,10)||0);
                    if (parts.length===3) return sign*(parts[0]*3600 + parts[1]*60 + parts[2]);
                    if (parts.length===2) return sign*(parts[0]*60 + parts[1]);
                    return sign*(parts[0]||0);
                }
                let initialSeconds = null;
                if (last) {
                    // If the last snapshot is from this week and has time_stamp, use it
                    if (last.saved_at) {
                        const d = new Date(last.saved_at);
                        const now = new Date();
                        function mondayOf(date){ const day = date.getDay(); const daysSinceMon = (day+6)%7; const m=new Date(date); m.setDate(date.getDate()-daysSinceMon); m.setHours(0,0,0,0); return m; }
                        if (mondayOf(d).getTime() === mondayOf(now).getTime() && last.time_stamp) {
                            const p = parseSignedHHMMSS(last.time_stamp);
                            if (p !== null) initialSeconds = p;
                        }
                    }
                    // else use time_start if present
                    if (initialSeconds === null && last.time_start) {
                        const p = parseSignedHHMMSS(last.time_start);
                        if (p !== null) initialSeconds = p;
                    }
                }
                if (initialSeconds !== null) {
                    // only apply stored value if timer is not currently running
                    if (!timerRunning) {
                        timerRemaining = initialSeconds;
                        updateCounterDisplay();
                    }
                }
            } catch(e) { console.warn('refreshFromStorage failed', e); }
        })();
    }

    // Handle back/forward navigation
    window.addEventListener('popstate', (ev) => {
        const state = ev.state;
        if (state && state.page === 'config') {
            showConfigView(false);
        } else if (state && state.page === 'register') {
            showRegisterView(false);
        } else {
            showMainView();
        }
    });

    // Initialize on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
    // load assets from disk then create background GIF and play random music
    (async ()=>{ await loadAssets(); createBackgroundGif(); playOneRandomMusicOnce(); })();

        // Save original page state and attach handlers
        const header = document.querySelector('h1');
        const container = document.getElementById('container');
        if (header) origHeaderText = header.textContent;
        if (container) origContainerHTML = container.innerHTML;

        attachMainHandlers();

        // Resolve the counter element after DOM is ready and render initial value
        counterEl = document.getElementById('counter');
        try { updateCounterDisplay(); } catch (e) {}

        // On startup, determine the timer starting point based on DB and week semantics
        (async function determineStartupTime(){
            try {
                // helper: get Monday date string YYYY-MM-DD for a date
                function mondayOf(d) {
                    const day = d.getDay(); // 0 Sun
                    const daysSinceMon = (day + 6) % 7;
                    const m = new Date(d);
                    m.setDate(d.getDate() - daysSinceMon);
                    m.setHours(0,0,0,0);
                    return m;
                }

                const now = new Date();
                const thisMonday = mondayOf(now);

                // ask main for last saved time_slap row
                let last = null;
                last = await Storage.getLast();

                // helper: parse HH:MM or HH:MM:SS or signed string to seconds
                function parseSignedHHMMSS(str) {
                    if (!str) return null;
                    const sign = str.trim().startsWith('-') ? -1 : 1;
                    const s = str.trim().replace(/^[-+]/, '');
                    const parts = s.split(':').map(x=>parseInt(x,10)||0);
                    if (parts.length===3) return sign*(parts[0]*3600 + parts[1]*60 + parts[2]);
                    if (parts.length===2) return sign*(parts[0]*60 + parts[1]);
                    return sign*(parts[0]||0);
                }

                // Decide initial timerRemaining
                let initialSeconds = null;
                if (last) {
                    // if last.saved_at exists, parse its date and check if it's in the same week
                    if (last.saved_at) {
                        const savedDate = new Date(last.saved_at);
                        const savedMonday = mondayOf(savedDate);
                        // If the last snapshot is from this week, prefer time_stamp (if present)
                        if (savedMonday.getTime() === thisMonday.getTime() && last.time_stamp) {
                            const parsed = parseSignedHHMMSS(last.time_stamp);
                            if (parsed !== null) initialSeconds = parsed;
                        }
                    }
                    // If we didn't get initialSeconds from time_stamp, but there's a time_start provided, use it
                    if (initialSeconds === null && last.time_start) {
                        const parsed = parseSignedHHMMSS(last.time_start);
                        if (parsed !== null) initialSeconds = parsed;
                    }
                }

                // Fallback to localStorage stored timeLapse
                if (initialSeconds === null) {
                    try {
                        const stored = localStorage.getItem('timeLapse');
                        if (stored) {
                            // stored might be MM:SS or HH:MM:SS
                            const p = stored.split(':').map(x=>parseInt(x,10)||0);
                            if (p.length===3) initialSeconds = p[0]*3600 + p[1]*60 + p[2];
                            else if (p.length===2) initialSeconds = p[0]*60 + p[1];
                            else initialSeconds = p[0]||0;
                        }
                    } catch(e){}
                }

                if (initialSeconds !== null) {
                    timerRemaining = initialSeconds;
                    updateCounterDisplay();
                }
            } catch (e) { console.warn('Failed to determine startup time', e); }
        })();

        // If the page was loaded with config.html in URL (direct open), show config view
        // Support hash-based direct entry: if URL contains #config or #register show the respective view
        if (location.hash === '#config') {
            history.replaceState({ page: 'config' }, 'Settings', '#config');
            showConfigView(false);
        }
        if (location.hash === '#register') {
            history.replaceState({ page: 'register' }, 'Register', '#register');
            showRegisterView(false);
        }
    });

    // TIMER state
    let timerInterval = null;
    let timerRemaining = null; // seconds
    let timerRunning = false;

    // Helper parse/format reused
    function parseTimeToSeconds(str) {
        if (!str) return 0;
        const parts = str.split(':').map(x=>parseInt(x,10)||0);
        if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
        if (parts.length === 2) return parts[0]*60 + parts[1];
        return parts[0]||0;
    }
    // Always format as HH:MM:SS with optional '-' for negatives
    function formatSeconds(s) {
        const sign = s < 0 ? '-' : '';
        const abs = Math.abs(Math.floor(s || 0));
        const h = Math.floor(abs / 3600);
        const m = Math.floor((abs % 3600) / 60);
        const sec = abs % 60;
        return `${sign}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }

    // We'll create DB snapshots only when the user Stops the timer or the app unloads.

    // Start timer using current timelapse value
    async function startTimerFromConfig(){
        // Prefer the stored time_slap (time_stamp if present, else time_start), fallback to localStorage
        let initialSeconds = null;
        try {
            const last = await Storage.getLast();
            function parseSignedHHMMSS(str) { if (!str) return null; const sign = str.trim().startsWith('-')?-1:1; const s=str.trim().replace(/^[-+]/,''); const parts=s.split(':').map(x=>parseInt(x,10)||0); if (parts.length===3) return sign*(parts[0]*3600+parts[1]*60+parts[2]); if (parts.length===2) return sign*(parts[0]*60+parts[1]); return sign*(parts[0]||0); }
            if (last) {
                if (last.time_stamp) initialSeconds = parseSignedHHMMSS(last.time_stamp);
                else if (last.time_start) initialSeconds = parseSignedHHMMSS(last.time_start);
            }
        } catch(e) { console.warn('startTimerFromConfig storage read failed', e); }

        if (initialSeconds === null) {
            const tl = (function(){ try{ return localStorage.getItem('timeLapse') || '10:00'; }catch(e){return '10:00';}})();
            initialSeconds = parseTimeToSeconds(tl);
        }

        timerRemaining = initialSeconds;
        // ensure we have the counter element reference
        if (!counterEl) counterEl = document.getElementById('counter');
        setTimerRunningState(true);
        updateCounterDisplay();

        // tick every second
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(()=>{
            timerRemaining -= 1;
            updateCounterDisplay();
            // when crossing zero (0 -> -1) play alert sounds sequentially and mark red
                if (timerRemaining === -1) {
                    // Play the 'alert' sound N times in sequence (no overlap)
                    // Notify main process once when alarm sequence starts so app can restore/notify
                    try { if (window.ipcRenderer && !window.__alarmTriggered) { window.__alarmTriggered = true; window.ipcRenderer.invoke('alarm:trigger').catch(()=>{}); } } catch(e){}
                    (async function playAlertsSequentially(count){
                        try {
                            for (let i=0;i<count;i++){
                                // create a fresh Audio instance so events are reliable
                                const audio = window.playSound && window.playSound('alert');
                                if (!audio) {
                                    // if playSound didn't return an Audio, just wait a short delay
                                    await new Promise(r => setTimeout(r, 600));
                                    continue;
                                }

                                // Helper to await either 'ended' event or timeout (in case the event doesn't fire)
                                await new Promise((resolve) => {
                                    let settled = false;
                                    const onEnded = () => { if (settled) return; settled = true; cleanup(); resolve(); };
                                    const onError = () => { if (settled) return; settled = true; cleanup(); resolve(); };
                                    const timeout = setTimeout(() => { if (settled) return; settled = true; cleanup(); resolve(); }, 4000);
                                    function cleanup(){
                                        clearTimeout(timeout);
                                        try { audio.removeEventListener('ended', onEnded); audio.removeEventListener('error', onError); } catch(e){}
                                    }
                                    try {
                                        audio.addEventListener('ended', onEnded);
                                        audio.addEventListener('error', onError);
                                    } catch(e){ /* if adding listeners fails, fallback to timeout */ }
                                });
                            }
                        } catch(e){
                            console.error('Failed during sequential alert playback', e);
                        }
                    })(4);

                    if (counterEl) counterEl.style.color = 'red';
                }
        }, 1000);
    }

    function stopTimer(){
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        setTimerRunningState(false);
        // save current remaining as signed HH:MM:SS string
        (async ()=>{
            try {
                const stamp = formatSeconds(timerRemaining || 0);
                await Storage.setTimeSlap(stamp);
            } catch(e){}
        })();
    }

    function updateCounterDisplay(){
        if (!counterEl) return;
        const text = formatSeconds(timerRemaining || 0);
        counterEl.textContent = text;
        if ((timerRemaining || 0) < 0) {
            counterEl.style.color = 'red';
        } else {
            counterEl.style.color = '';
        }
    }

    // On initial load, restore persisted timerRunning state (so Start/Stop visibility persists)
    document.addEventListener('DOMContentLoaded', ()=>{
        try {
            const stored = sessionStorage.getItem('timerRunning');
            if (stored === '1') timerRunning = true; else if (stored === '0') timerRunning = false;
        } catch (e) {}
        // Update visibility now that DOM has elements and handlers attached
        updateStartStopVisibility();
    });

    // Save timer state when window is closed or refreshed
    window.addEventListener('beforeunload', ()=>{
        try {
                // If a reset is in progress, skip persisting so the reset isn't overwritten
                if (window.__suppressBeforeUnload) return;
                const stamp = formatSeconds(timerRemaining || 0);
                Storage.setTimeSlap(stamp).catch(()=>{});
        } catch(e){}
    });

})();
