# Sky Visa CRM — Desktop

Native Windows desktop app wrapping the deployed web CRM. Auto-updates from GitHub Releases.

## How it works

- The Electron shell loads `https://crmskyvisa.vercel.app` (set in [config.js](config.js)).
- Vercel auto-deploys on every push to `main` — content updates flow without any desktop rebuild.
- The desktop SHELL itself updates via electron-updater + GitHub Releases. Tag a commit (e.g. `v1.0.1`), push the tag, the Action builds a new `.exe` and publishes it; installed apps detect it on next launch.

## Local development

```powershell
cd desktop
npm install
npm start
```

To point at your local Next.js dev server (`npm run dev` at port 9002), set the env var first:

```powershell
$env:DEV_MODE="1"; npm start
```

## Build a one-off installer locally

```powershell
cd desktop
npm install
npm run build:win
```

Output goes to `desktop/dist/Sky Visa CRM-Setup-1.0.0.exe`.

## Publish a new desktop version (the production flow)

1. Bump the version in [package.json](package.json) (e.g. `1.0.0` → `1.0.1`).
2. Commit + push.
3. Tag the commit and push the tag:

   ```powershell
   git tag v1.0.1
   git push origin v1.0.1
   ```

4. The GitHub Action at `.github/workflows/desktop-release.yml` runs, builds the Windows installer, and uploads it to a new GitHub Release.
5. Already-installed copies of the app see the new release on next launch and download/install it in the background; user gets a "Restart now" prompt when ready.

## What if a user is offline?

The app needs internet to load the deployed website (Firebase Auth, Firestore, the UI itself all live there). Without internet, the window will show a friendly load-failure dialog. This is the same constraint as opening the website in a browser.

## Files

- [main.js](main.js) — Electron main process: window creation, auto-updater wiring
- [preload.js](preload.js) — security boundary; intentionally empty
- [config.js](config.js) — production / dev URLs and update-check interval
- [package.json](package.json) — `electron-builder` config (NSIS installer, GitHub publish target)
