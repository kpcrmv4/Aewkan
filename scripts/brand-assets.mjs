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

// square icon = the wordmark's red map pin, redrawn as SVG (public/brand/aewkan-pin.svg) so it
// stays crisp at 32 px; cropping the raster pulled in the neighbouring letters
const pinBuf = await sharp(`${out}/aewkan-pin.svg`, { density: 1200 }).png().toBuffer();
for (const s of [32, 180, 192, 512]) {
  await sharp(pinBuf)
    .resize({ width: Math.round(s * 0.78), height: Math.round(s * 0.78), fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: Math.round(s * 0.11), bottom: s - Math.round(s * 0.78) - Math.round(s * 0.11), left: Math.round(s * 0.11), right: s - Math.round(s * 0.78) - Math.round(s * 0.11), background: { r: 255, g: 255, b: 255, alpha: s === 32 ? 0 : 1 } })
    .png({ compressionLevel: 9 })
    .toFile(`${out}/aewkan-pin-${s}.png`);
}
console.log(`logo ${W}×${H} → ${out}/ (wordmark 240/480/960 webp, 480/1200 png, pin 32/180/192/512)`);
