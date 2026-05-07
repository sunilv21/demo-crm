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
};

function once(channel, cb) {
  const handler = () => cb();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

let lockOff = null;
let unlockOff = null;

contextBridge.exposeInMainWorld('electronAPI', {
  onScreenLock: (cb) => {
    if (lockOff) lockOff();
    lockOff = once(channels.lock, cb);
  },
  onScreenUnlock: (cb) => {
    if (unlockOff) unlockOff();
    unlockOff = once(channels.unlock, cb);
  },
  offScreenLock: () => {
    if (lockOff) lockOff();
    lockOff = null;
  },
  offScreenUnlock: () => {
    if (unlockOff) unlockOff();
    unlockOff = null;
  },
});
