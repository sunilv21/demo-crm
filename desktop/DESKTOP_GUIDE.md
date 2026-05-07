# Sky Visa CRM — Desktop App Guide

Everything you need to know about the desktop wrapper: how it works, how to build the installer, how updates flow, and what to give to users.

---

## TL;DR

- The desktop app is an **Electron shell** that loads `https://crmskyvisa.vercel.app` in a native window.
- **Content updates** (UI, features, bug fixes) flow automatically — when you push to GitHub, Vercel redeploys, the desktop app loads the latest content on next launch. No desktop rebuild needed.
- **Shell updates** (rare — only when the Electron wrapper itself changes) ship via GitHub Releases. You tag a version, a GitHub Action builds the new `.exe`, and installed apps auto-download/install on next launch.
- The thing you give end-users is one file: `Sky Visa CRM-Setup-X.X.X.exe`. They double-click, click through, done.

---

## How it works

```
┌──────────────────────────────────────────────────────────────────────┐
│                         End user's machine                            │
│                                                                       │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │  Sky Visa CRM (Electron app)                                │    │
│   │  ┌──────────────────────────────────────────────────────┐   │    │
│   │  │  BrowserWindow (Chromium)                            │   │    │
│   │  │  loads → https://crmskyvisa.vercel.app               │   │    │
│   │  │                                                      │   │    │
│   │  │  Talks to:                                           │   │    │
│   │  │   • Firebase Auth (sign-in)                          │   │    │
│   │  │   • Firestore (data)                                 │   │    │
│   │  │   • Cloud Functions (admin password reset)           │   │    │
│   │  └──────────────────────────────────────────────────────┘   │    │
│   │                                                             │    │
│   │  electron-updater → checks GitHub Releases on launch        │    │
│   │                     for new SHELL versions                  │    │
│   └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
       ┌─────────────────┐         ┌─────────────────┐
       │  Vercel         │         │ GitHub Releases │
       │  serves your    │         │ ships .exe      │
       │  Next.js code   │         │ shell upgrades  │
       └─────────────────┘         └─────────────────┘
                ▲                           ▲
                │                           │
                │ auto-deploys              │ GitHub Action
                │ on push to main           │ on tag push (v*)
                │                           │
                └───────────────────────────┘
                            │
                     ┌──────┴──────┐
                     │   GitHub    │
                     │ (your repo) │
                     └─────────────┘
```

**Two independent update channels.** UI/feature changes ride Vercel; the desktop shell rides GitHub Releases. Most days you only ever need the Vercel channel.

---

## File layout

Everything desktop-related lives in `desktop/` plus one CI workflow:

```
desktop/
├── package.json          # Electron 33 + electron-builder + electron-updater
├── package-lock.json     # cached for the GitHub Action
├── main.js               # Main process: window, auto-updater wiring
├── preload.js            # Empty preload (security boundary)
├── config.js             # APP_URL, DEV_URL, update check interval
├── README.md             # Quick reference
├── DESKTOP_GUIDE.md      # This file
├── .gitignore
├── assets/
│   └── icon.png          # 512x512 — runtime taskbar/window icon
└── build/
    ├── icon.png          # 512x512 — electron-builder source
    └── icon.ico          # 256x256 — Windows installer + shortcut icon

.github/
└── workflows/
    └── desktop-release.yml   # Tag-triggered build & publish
```

The Next.js code (`src/`, root `package.json`, etc.) was **not modified** — desktop is fully isolated.

---

## First-time deploy (handing the app to users for the first time)

You only do this once — when you first want users to install the app.

### Step 1 — Make sure the GitHub repo is public

`electron-updater` fetches releases anonymously, which requires the repo to be public. The repo at `https://github.com/sunilv21/crmskyvisa` is currently public — good.

If you ever make it private, you'll need to embed a `GITHUB_TOKEN` in the build, which is doable but more complex. Stay public for simplicity.

### Step 2 — Tag and push

```powershell
git add .
git commit -m "Add desktop wrapper"
git push origin main

git tag v1.0.0
git push origin v1.0.0
```

### Step 3 — Watch the Action run

Go to `https://github.com/sunilv21/crmskyvisa/actions`. The "Desktop Release" workflow kicks off automatically. It takes 4–8 minutes:

1. Spins up a fresh Windows runner
2. Installs Node 20
3. `npm ci` inside `desktop/`
4. `npm run publish` — builds `Sky Visa CRM-Setup-1.0.0.exe` and uploads it as a GitHub Release asset

When green, navigate to `https://github.com/sunilv21/crmskyvisa/releases/tag/v1.0.0` — the `.exe` is the downloadable asset.

### Step 4 — Hand the file to users

Send people the direct link to the `.exe` from the Releases page, OR download it yourself and email/share it directly. Either works.

---

## Building the installer locally (without using the GitHub Action)

If you want a one-off `.exe` to hand to a single user without going through GitHub:

```powershell
cd desktop
npm install      # only needed first time
npm run build:win
```

Output appears at `desktop/dist/Sky Visa CRM-Setup-1.0.0.exe`. Hand that file directly.

(The GitHub Action route is still preferred for any user you want to receive auto-updates — local builds are not connected to the GitHub Releases auto-update channel unless they were also published there.)

---

## What end users see when they install

1. Double-click `Sky Visa CRM-Setup-1.0.0.exe`.
2. Windows SmartScreen may warn "Windows protected your PC" because the installer isn't code-signed.
   - User clicks **More info** → **Run anyway**.
   - This warning is normal for unsigned apps. It can be eliminated by purchasing a Windows code-signing certificate (~$200/year) — optional, not required.
3. NSIS installer opens with the Sky Visa logo. User clicks **Next**, optionally changes install location, clicks **Install**.
4. Sky Visa CRM appears in the **Start Menu** + as a **desktop shortcut**.
5. User double-clicks the shortcut. App opens, shows the login page from Vercel.
6. User signs in. Works exactly like the website, but in a native window.

---

## Pushing UI / feature changes (the everyday flow)

Nothing about this changes. Whatever you used to do still works:

```powershell
# Make code changes anywhere in src/, components/, etc.
git add .
git commit -m "Whatever you changed"
git push origin main
```

Vercel auto-deploys. **Already-installed desktop apps see the new content** on next launch — or right now if the user hits Ctrl+R inside the app to refresh.

You do **not** need to rebuild the desktop installer for UI changes. The desktop app is a thin shell — all the actual code lives on Vercel.

---

## Pushing a new desktop SHELL version (rare)

Only do this if you change something in `desktop/` itself: `main.js`, the icon, the auto-updater config, the bundled Electron version, etc.

```powershell
# 1. Bump the version in desktop/package.json
#    e.g. "version": "1.0.0" → "version": "1.0.1"
git add desktop/package.json
git commit -m "Bump desktop to 1.0.1"
git push origin main

# 2. Tag the commit and push the tag
git tag v1.0.1
git push origin v1.0.1
```

The GitHub Action runs again, builds `Sky Visa CRM-Setup-1.0.1.exe`, attaches it to a new GitHub Release.

**Already-installed apps detect the new version** on next launch:
- They silently download the new installer in the background
- When done, the user gets a "Sky Visa CRM 1.0.1 is ready to install" dialog with **Restart now** / **Later** buttons
- Restart applies the update; the user's session resumes from where they left off

---

## Local development

To run the desktop wrapper against the **deployed Vercel URL** (default):

```powershell
cd desktop
npm start
```

To run it against your **local Next.js dev server** (you'd run `npm run dev` in the project root in a second terminal first):

```powershell
cd desktop
$env:DEV_MODE="1"; npm start
```

This is useful when you want to see how a UI change feels in the desktop app before pushing.

---

## Editing configuration

Open `desktop/config.js`:

```js
module.exports = {
  APP_URL: 'https://crmskyvisa.vercel.app',
  DEV_URL: 'http://localhost:9002',
  UPDATE_CHECK_INTERVAL_MS: 30 * 60 * 1000, // every 30 min
};
```

| Field | What it controls |
|---|---|
| `APP_URL` | The website the desktop app loads in production. If you ever change hosts (e.g. Vercel → custom domain), update this and ship a new desktop version. |
| `DEV_URL` | The URL used when `DEV_MODE=1` is set. Defaults to your `npm run dev` port. |
| `UPDATE_CHECK_INTERVAL_MS` | How often (ms) to recheck GitHub Releases for new shell versions while the app stays open. Set to `0` to only check on launch. |

---

## How the icon was generated

The original `src/app/skylogo.png` is wide (432×247). Windows app icons need to be **square 256×256+**. I padded the logo onto a 512×512 white background with this:

```powershell
# 512×512 PNG (used for taskbar, electron-builder source)
ffmpeg -y -i src/app/skylogo.png -vf "scale=512:-1:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white" desktop/build/icon.png
cp desktop/build/icon.png desktop/assets/icon.png

# 256×256 ICO (used for installer + .exe shortcut)
ffmpeg -y -i src/app/skylogo.png -vf "scale=256:-1:flags=lanczos,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=white" desktop/build/icon.ico
```

If you ever want to change the icon: replace those three files (`desktop/build/icon.png`, `desktop/build/icon.ico`, `desktop/assets/icon.png`), bump the desktop version, tag, push.

---

## Common pitfalls

| Problem | Cause | Fix |
|---|---|---|
| GitHub Action fails on first run | Repo is private | Make repo public, or embed `GITHUB_TOKEN` in the build |
| User sees "Windows protected your PC" | Installer isn't code-signed | Have user click "More info → Run anyway"; or buy a code-signing cert |
| App shows blank window | Vercel deploy is broken | Open `https://crmskyvisa.vercel.app` in a regular browser to confirm; the desktop app is just rendering the same URL |
| Auto-update never triggers | No tags pushed since first install, or repo went private | Push a higher version tag like `v1.0.1` |
| App still shows old data after Vercel deploy | Heavy browser cache inside Electron | User hits Ctrl+Shift+R inside the app to hard-refresh |
| Build fails with "icon must be at least 256x256" | Custom icon you swapped in is too small or non-square | Run the ffmpeg commands above again with a bigger square source |

---

## Constraints / things you can't do without changes

- **Offline mode** — none. The app loads a URL, so it requires internet to even open. (Same as opening the website in a browser.)
- **Mac / Linux builds** — only Windows is wired up. Can be added by:
  1. Add `--mac` / `--linux` to `npm run publish` in `desktop/package.json`
  2. Add `macos-latest` / `ubuntu-latest` jobs to the GitHub Action
- **Code signing** — installer is unsigned. Users see SmartScreen warning the first time. Optional fix: buy a Windows code-signing certificate.

---

## Quick reference card

| I want to… | Do this |
|---|---|
| Change UI / fix a bug | Push code → Vercel deploys → users see it. **No desktop work.** |
| Hand a friend the installer right now | `cd desktop && npm run build:win` → grab `desktop/dist/Sky Visa CRM-Setup-X.X.X.exe` |
| Roll out a desktop shell update to all users | Bump `desktop/package.json` version → tag `vX.Y.Z` → push tag |
| Change the production URL the app loads | Edit `desktop/config.js` `APP_URL` → bump version → tag → push |
| Test desktop locally | `cd desktop && npm start` |
| Test desktop against local Next.js dev | `npm run dev` in root, then `cd desktop && $env:DEV_MODE="1"; npm start` |
