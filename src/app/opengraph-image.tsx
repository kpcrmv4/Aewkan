import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'AewKan · Chiang Mai private driver';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// canvas and coral from src/app/globals.css (an image has no CSS variables).
// Thai appears only inside the logo picture: no Thai font file is bundled and fonts are not fetched at build.
const CORAL = '#D2421D';
const CANVAS = '#F3F6F1';
const INK = '#14201A';
const LOGO_W = 880;
const LOGO_H = Math.round((LOGO_W * 713) / 2062);

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), 'public/brand/aewkan-logo-1200.png'));
  const src = `data:image/png;base64,${logo.toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: CANVAS, color: INK }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain img */}
        <img src={src} width={LOGO_W} height={LOGO_H} alt="" />
        <div style={{ marginTop: 56, fontSize: 56, fontWeight: 700 }}>Chiang Mai private driver</div>
        <div style={{ marginTop: 16, fontSize: 34, color: '#44524A' }}>Plan your trip on the map. See the price instantly.</div>
        <div style={{ marginTop: 44, height: 12, width: 220, borderRadius: 6, background: CORAL }} />
      </div>
    ),
    size,
  );
}
