// Sky Visa CRM — Electron preload.
// Runs before the web page loads, in an isolated context. Exposes a tiny
// API to the renderer so the web app can subscribe to OS-level screen lock
// events (used for automatic break / away tracking).
//
// Security: contextIsolation + sandbox + a minimal allow-list of IPC
// channels = the renderer can't reach arbitrary Node.js or Electron
// internals, only the events we explicitly forward.

const { contextBridge, ipcRenderer } = require('electron');

const channels = {
  lock: 'screen-lock',
  unlock: 'screen-unlock',
  idle: 'user-idle',
  active: 'user-active',
};

function on(channel, cb) {
  const handler = (_event, ...args) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

let lockOff = null;
let unlockOff = null;
let idleOff = null;
let activeOff = null;

contextBridge.exposeInMainWorld('electronAPI', {
  onScreenLock: (cb) => {
    if (lockOff) lockOff();
    lockOff = on(channels.lock, () => cb());
  },
  onScreenUnlock: (cb) => {
    if (unlockOff) unlockOff();
    unlockOff = on(channels.unlock, () => cb());
  },
  offScreenLock: () => {
    if (lockOff) lockOff();
    lockOff = null;
  },
  offScreenUnlock: () => {
    if (unlockOff) unlockOff();
    unlockOff = null;
  },
  onIdle: (cb) => {
    if (idleOff) idleOff();
    idleOff = on(channels.idle, (idleStartedAtMs) => cb(idleStartedAtMs));
  },
  onActive: (cb) => {
    if (activeOff) activeOff();
    activeOff = on(channels.active, () => cb());
  },
  offIdle: () => {
    if (idleOff) idleOff();
    idleOff = null;
  },
  offActive: () => {
    if (activeOff) activeOff();
    activeOff = null;
  },
});
