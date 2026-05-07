// Generate a proper multi-resolution Windows .ico from desktop/build/icon.png.
// Output sizes: 16, 24, 32, 48, 64, 128, 256 — covers every Windows surface
// (taskbar, alt-tab, file explorer thumbnails, jump list, etc.).
//
// Run MANUALLY when you change the source icon.png:
//   cd desktop
//   npm run make-ico
//   git add build/icon.ico  &&  git commit -m "Update icon"
//
// This is intentionally NOT wired into the build pipeline so the GitHub
// Action build doesn't depend on ffmpeg being on the runner. The committed
// .ico is what every CI build uses.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pngToIco = require('png-to-ico').default;

const SRC = path.join(__dirname, '..', 'build', 'icon.png');
const OUT = path.join(__dirname, '..', 'build', 'icon.ico');
const TMP = path.join(__dirname, '..', 'build', '.ico-tmp');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

if (!fs.existsSync(SRC)) {
  console.error(`Missing source: ${SRC}`);
  process.exit(1);
}

fs.mkdirSync(TMP, { recursive: true });

const scaled = SIZES.map((size) => {
  const out = path.join(TMP, `icon-${size}.png`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i', SRC,
      '-vf', `scale=${size}:${size}:flags=lanczos`,
      out,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  return out;
});

pngToIco(scaled)
  .then((buf) => {
    fs.writeFileSync(OUT, buf);
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`Wrote ${OUT} (${buf.length} bytes, ${SIZES.length} sizes)`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
