// Brand assets from the owner's logo (transparent PNG). Re-run when the logo changes:
//   node scripts/brand-assets.mjs <logo.png>
// Writes public/brand/*: web wordmarks (webp + png fallback), an e-mail/OG png,
// and a square map-pin icon cropped from the wordmark (used for favicon / apple icon).
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/brand-assets.mjs <logo.png>');
  process.exit(1);
}
const out = 'public/brand';
mkdirSync(out, { recursive: true });

const logo = sharp(src).trim(); // drop transparent margins
const meta = await logo.clone().png().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = meta.info;

for (const w of [240, 480, 960]) {
  await sharp(meta.data).resize({ width: w }).webp({ quality: 88, alphaQuality: 90 }).toFile(`${out}/aewkan-logo-${w}.webp`);
}
await sharp(meta.data).resize({ width: 480 }).png({ compressionLevel: 9, palette: true }).toFile(`${out}/aewkan-logo-480.png`);
await sharp(meta.data).resize({ width: 1200 }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(`${out}/aewkan-logo-1200.png`);

// square icon = the small mark from the owner's brand sheet (sun, peaks, road, pin), drawn as
// SVG (public/brand/aewkan-mark.svg) so it stays crisp at 32 px. 32 = transparent favicon;
// 180/192/512 = white square for apple-touch / PWA (the OS rounds the corners)
const markBuf = await sharp(`${out}/aewkan-mark.svg`, { density: 1200 }).png().toBuffer();
for (const s of [32, 180, 192, 512]) {
  const inner = s === 32 ? s : Math.round(s * 0.8);
  const off = Math.round((s - inner) / 2);
  await sharp(markBuf)
    .resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: off, bottom: s - inner - off, left: off, right: s - inner - off, background: { r: 255, g: 255, b: 255, alpha: s === 32 ? 0 : 1 } })
    .png({ compressionLevel: 9 })
    .toFile(`${out}/aewkan-icon-${s}.png`);
}
console.log(`logo ${W}×${H} → ${out}/ (wordmark 240/480/960 webp, 480/1200 png, icon 32/180/192/512)`);
