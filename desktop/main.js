// Sky Visa CRM — Electron main process.
// Wraps the deployed Next.js web app in a native desktop window.
// Uses electron-updater to pull new shell builds from GitHub Releases.

const { app, BrowserWindow, Menu, Tray, dialog, shell, powerMonitor, nativeImage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const config = require('./config');

const isDev = process.env.DEV_MODE === '1' || !app.isPackaged;
const targetUrl = isDev ? config.DEV_URL : config.APP_URL;

// OS idle threshold for auto-Away tracking. Kept in sync with
// IDLE_AWAY_THRESHOLD_SEC in src/lib/attendance.ts (5 minutes).
const IDLE_AWAY_THRESHOLD_SEC = 5 * 60;
const IDLE_POLL_INTERVAL_MS = 30 * 1000;

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Sky Visa CRM',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Hide the OS menu bar; users get File/Edit/View shortcuts via the system.
  Menu.setApplicationMenu(null);

  mainWindow.loadURL(targetUrl);

  // External links open in the user's default browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(config.APP_URL) || url.startsWith(config.DEV_URL)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Hijack the close button — minimize to tray instead of quitting. This
  // keeps the app alive so heartbeats, screen-lock detection, idle tracking
  // and the 8 PM auto-punch-out continue to run. Real quit only happens via
  // the tray "Quit" menu (which sets isQuitting = true) or app.quit().
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      // First time we hide, show a tray hint so users know the app is still running.
      if (tray && !mainWindow.__trayHintShown) {
        mainWindow.__trayHintShown = true;
        try {
          tray.displayBalloon({
            title: 'Sky Visa CRM is still running',
            content:
              'The app is minimized to the system tray so attendance tracking continues. Right-click the tray icon to quit.',
          });
        } catch {
          // Balloon is best-effort — Linux/macOS may not support it.
        }
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Surface load errors to the user instead of silent white screens.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // -3 = aborted (e.g. nav before load complete)
    console.error('Failed to load', validatedURL, errorCode, errorDescription);
    dialog.showErrorBox(
      'Sky Visa CRM — Failed to load',
      `Could not load ${validatedURL}\n\nError: ${errorDescription}\n\n` +
        'Check your internet connection. If the problem persists, the server may be down.',
    );
  });
}

// ---------------------------------------------------------------------------
// Auto-update wiring (electron-updater + GitHub Releases)
// ---------------------------------------------------------------------------
function setupAutoUpdater() {
  if (isDev) return; // updates only matter in packaged builds

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        state: 'available',
        version: info.version,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    const choice = dialog.showMessageBoxSync({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'Update ready',
      message: `Sky Visa CRM ${info.version} is ready to install.`,
      detail: 'The app will restart and apply the update.',
    });
    if (choice === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (err) => {
    // Don't show a popup — silent failure is fine for update checks.
    console.error('Auto-update error:', err);
  });

  // Check immediately on launch, then on the configured interval.
  autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error(err));

  if (config.UPDATE_CHECK_INTERVAL_MS > 0) {
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error(err));
    }, config.UPDATE_CHECK_INTERVAL_MS);
  }
}

// ---------------------------------------------------------------------------
// Screen-lock / suspend wiring — forwards OS power events to the renderer
// so the web app can record automatic breaks while the user is away.
//   * 'lock-screen' / 'unlock-screen' — exact lock events (Win+L, idle)
//   * 'suspend' / 'resume' — laptop lid close / sleep / wake
// Both pairs map to the same screen-lock / screen-unlock IPC channels so
// the renderer treats them uniformly.
// ---------------------------------------------------------------------------
function setupPowerEvents() {
  const sendLock = () => mainWindow?.webContents.send('screen-lock');
  const sendUnlock = () => mainWindow?.webContents.send('screen-unlock');

  powerMonitor.on('lock-screen', sendLock);
  powerMonitor.on('unlock-screen', sendUnlock);
  powerMonitor.on('suspend', sendLock);
  powerMonitor.on('resume', sendUnlock);
}

// ---------------------------------------------------------------------------
// OS idle polling — `powerMonitor.getSystemIdleTime()` returns seconds since
// the last keyboard/mouse input. We poll periodically and emit `idle` /
// `active` IPC events when crossing IDLE_AWAY_THRESHOLD_SEC. This catches
// the "user left the PC, app still open" case.
// ---------------------------------------------------------------------------
function setupIdleWatcher() {
  let isIdle = false;
  let idleStartedAtMs = null;

  const tick = () => {
    const seconds = powerMonitor.getSystemIdleTime();
    if (!isIdle && seconds >= IDLE_AWAY_THRESHOLD_SEC) {
      isIdle = true;
      // Reconstruct when idle started: now - idle seconds. We send this so the
      // renderer logs the break starting from the actual idle moment, not
      // when we noticed.
      idleStartedAtMs = Date.now() - seconds * 1000;
      mainWindow?.webContents.send('user-idle', idleStartedAtMs);
    } else if (isIdle && seconds < IDLE_AWAY_THRESHOLD_SEC) {
      isIdle = false;
      idleStartedAtMs = null;
      mainWindow?.webContents.send('user-active');
    }
  };

  setInterval(tick, IDLE_POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// System tray — keeps the app alive in the background after the window is
// closed so attendance/break tracking continues. Right-click menu offers a
// real quit path; left-click reopens the window.
// ---------------------------------------------------------------------------
function setupTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) trayIcon = nativeImage.createEmpty();
  } catch {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('Sky Visa CRM');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Sky Visa CRM',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  // Single-click reopens — same as the menu item.
  tray.on('click', () => {
    if (!mainWindow) {
      createWindow();
    } else {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  setupPowerEvents();
  setupIdleWatcher();
  setupTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Tray keeps the process alive after the last window closes — only really
// quit when the user explicitly chose to (isQuitting = true). On macOS the
// app traditionally stays in the dock, so we keep the same shape there too.
app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') app.quit();
});
