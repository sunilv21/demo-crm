// Sky Visa CRM — Electron preload.
// Runs before the web page loads, in an isolated context. Currently no APIs
// are exposed to the renderer — the web app talks to Firebase directly over
// HTTPS the same way it does in a browser. Keeping this file empty (but
// present) is a security best-practice: contextIsolation + sandbox + an
// empty preload = the renderer cannot reach Node.js or Electron internals.

// If you ever need to bridge native APIs (e.g. file pickers, OS notifications)
// from the web UI, expose them here via contextBridge.exposeInMainWorld.
