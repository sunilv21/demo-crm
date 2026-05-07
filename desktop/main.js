// Sky Visa CRM — Electron main process.
// Wraps the deployed Next.js web app in a native desktop window.
// Uses electron-updater to pull new shell builds from GitHub Releases.

const { app, BrowserWindow, Menu, dialog, shell, powerMonitor } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const config = require('./config');

const isDev = process.env.DEV_MODE === '1' || !app.isPackaged;
const targetUrl = isDev ? config.DEV_URL : config.APP_URL;

let mainWindow = null;

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

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  setupPowerEvents();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
