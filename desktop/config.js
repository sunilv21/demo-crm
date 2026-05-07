// ----------------------------------------------------------------------------
// Sky Visa CRM Desktop — Configuration
// ----------------------------------------------------------------------------
// Edit APP_URL below to your deployed production URL. Whenever you push code
// changes to GitHub and your hosting provider redeploys, this app will load
// the new content automatically on next launch (or page refresh).
//
// The desktop app SHELL itself is auto-updated via GitHub Releases — see the
// GitHub Action at .github/workflows/desktop-release.yml. Tag a commit
// (e.g. `git tag v1.0.1 && git push origin v1.0.1`) and the Action publishes
// a new installer to the repo's Releases. Installed apps detect the new
// release on next launch and download/install in the background.
// ----------------------------------------------------------------------------

module.exports = {
  // Production URL the desktop app loads. Vercel auto-deploys on git push,
  // so any code change you push to GitHub becomes live here without
  // rebuilding the desktop app.
  APP_URL: 'https://crmskyvisa.vercel.app',

  // Optional dev URL — used when DEV_MODE env var is set. Default is the
  // Next.js dev port from your package.json scripts.
  DEV_URL: 'http://localhost:9002',

  // How often (ms) to check for desktop app updates after launch.
  // 0 disables auto-update checks entirely (only check on startup).
  UPDATE_CHECK_INTERVAL_MS: 30 * 60 * 1000, // 30 min
};
