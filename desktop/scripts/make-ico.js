// Generate a proper multi-resolution Windows .ico from desktop/build/icon.png.
// Output sizes: 16, 24, 32, 48, 64, 128, 256 — covers every Windows surface
// (taskbar, alt-tab, file explorer thumbnails, jump list, etc.).
//
// Run: node scripts/make-ico.js

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
