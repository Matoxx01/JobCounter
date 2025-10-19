# Cartoon Job Counter (JobCounter)

Este repositorio contiene una pequeña aplicación de escritorio hecha con Electron para llevar un "contador"/temporizador semanal y un registro (register) de horas semanales. A continuación encontrarás una descripción en español de cómo funciona el proyecto, cómo ejecutarlo, estructura de archivos, comunicación entre procesos y detalles del archivo de datos `data.json`.

## Resumen

- App: Electron (main process + renderer en `public/index.html` y `public/index.js`).
- Almacenamiento: archivo JSON (`data.json`).
- Objetivo: iniciar un temporizador (timelapse), registrar el tiempo restante o la diferencia y almacenar registros **semanales**.
- Soporta: gestión de assets (GIFs e música) desde `assets/` (copiar/añadir/eliminar), notificaciones y minimizado a bandeja.

## Requisitos

- Node.js 18+ recomendado.
- npm instalado.
- Windows / macOS / Linux (la app incluye ciertos manejos específicos para Windows tray/notifications).

Nota: `package.json` declara `electron` como dependencia. Instala dependencias antes de ejecutar.

## Instalación

Abre PowerShell en la carpeta del proyecto y ejecuta:

```powershell
npm install
```

## Ejecución

Para arrancar la aplicación en modo desarrollo/ejecución local:

```powershell
npm start
```

Esto ejecutará `electron .` según `package.json`.

## Estructura de archivos (resumen)

- `main.js` - Proceso principal de Electron. Maneja:
  - Creación de la ventana `BrowserWindow` y `Tray`.
  - Lectura/escritura de `data.json` (funciones `loadStorage`, `saveStorage`).
  - IPC handlers (vía `ipcMain.handle`) para operaciones de almacenamiento, assets, diálogo y notificaciones.
  - Lógica de procesado semanal (crear filas en `register` si hay snapshots antiguos).

- `preload.js` - Expone una API mínima al renderer: `window.ipcRenderer.invoke(channel, ...args)` segura para invocar handlers del main.

- `public/index.html` - Interfaz HTML principal con botones `Start`, `Stop`, `Settings`.

- `public/index.js` - Lógica del renderer: UI SPA ligera, manejo de assets, reproducción de audio, temporizador, vistas (Main, Config, Register, Assets). Comunica con `main` usando `window.ipcRenderer.invoke(...)`.

- `data.json` - Archivo JSON que actúa como almacenamiento local. Ejemplo:

```json
{
  "time_slaps": [
    {
      "time_start": "00:00:10",
      "time_stamp": "00:00:04",
      "saved_at": "2025-10-19T20:30:36.400Z"
    }
  ],
  "register": []
}
```

- `assets/` - Contiene `music/`, `images/` (GIFs), `sounds/`, `icons/`, `fonts/`.

- `public/index.css` - Estilos para la UI.

## Cómo funciona (detalle técnico)

1. Inicio
   - `npm start` lanza Electron y ejecuta `main.js`.
   - `main.js` llama a `initDatabase()` → `loadStorage()` para cargar o crear `data.json`.
   - Se crea la ventana con `public/index.html` y se carga `preload.js` para exponer la API segura.

2. Comunicación renderer ↔ main
   - `preload.js` expone `window.ipcRenderer.invoke(channel, ...args)` que llama internamente a `ipcRenderer.invoke`.
   - El renderer (en `public/index.js`) invoca handlers como:
     - `storage:get_last`, `storage:set_time_slap`, `storage:set_start`, `storage:get_register`, `storage:delete_register`.
     - `assets:list`, `assets:add`, `assets:delete` para gestionar archivos en `assets/`.
     - `dialog:confirm_delete` para pedir confirmaciones nativas.
     - `alarm:trigger` para notificaciones desde main.

3. Lógica del temporizador
   - `public/index.js` mantiene `timerRemaining` en segundos, `timerRunning` y un `timerInterval`.
   - Al `Start`, el renderer determina el valor inicial (primero revisa snapshot `storage:get_last` y si no, `localStorage.timeLapse`) y comienza a decrementar cada segundo.
   - Si el temporizador cruza a valores negativos, reproduce repetidamente un sonido `alert` y solicita a main que muestre una notificación (`alarm:trigger`).
   - Al `Stop` o al cerrar la ventana, el renderer guarda el estado actual con `storage:set_time_slap` (que persiste en `data.json`).

4. Registro semanal (`register`)
   - `main.js` mantiene la estructura `storage.register` y provee handlers para listarlo y eliminar filas.
   - Al arrancar, `main.js` ejecuta `processWeekly()` que intenta crear una fila en `register` para la semana en la que se inició el temporizador si aún no existe (lógica simplificada para prevenir duplicados) y luego limpia la `time_stamp` del snapshot.

5. Assets
   - El renderer pide a main la lista de archivos en `assets/music` o `assets/images` usando `assets:list`.
   - `assets:add` abre un diálogo nativo para seleccionar un archivo y lo copia a la carpeta adecuada con nombre único si ya existe.
   - `assets:delete` elimina el archivo físicamente.

## Formato de `data.json`

- time_slaps: array, el índice 0 representa el snapshot actual más reciente con campos:
  - time_start: string o null - el valor configurado inicial ("HH:MM:SS" o "MM:SS").
  - time_stamp: string o null - el valor guardado actual del temporizador (signed hh:mm:ss o mm:ss). Ej.: "+00:10:00" o "-00:05:00".
  - saved_at: ISO timestamp cuando se guardó.

- register: array de objetos { id: number, week: "YYYY-MM-DD", hour: "+HH:MM" }

## Notas de desarrollo y debugging

- `package.json` incluye dependencias: `electron` y `electron-rebuild`. En la versión actual del código las llamadas a SQLite están en algunos fragmentos comentados/no completos; el proyecto en la práctica usa `data.json` para persistencia.
- Si el icono de tray o notificaciones no funcionan en Windows, asegúrate de que la aplicación tenga AppUserModelID o ejecuta el empaquetado con un instalador que registre la AppID.

## Resumen de comandos útiles

- Instalar dependencias:

```powershell
npm install
```

- Ejecutar la app:

```powershell
npm start
```

- Empaquetar la app: (no incluido un script en package.json; usar `electron-builder` o `electron-forge` si quieres crear instaladores)

## Estado actual y verificación

- Se leyó el proyecto y se verificó el contenido de los archivos principales (`main.js`, `preload.js`, `public/index.html`, `public/index.js`, `public/index.css`, `data.json`).
- El README generado describe la ejecución y el flujo interno en español.

---

Si quieres, puedo:

- Añadir scripts útiles a `package.json` (por ejemplo `package` con `electron-builder`).
- Crear tests unitarios mínimos para `processWeekly`.
- Empaquetar la app para Windows con `electron-builder`.

Dime qué prefieres y continúo.