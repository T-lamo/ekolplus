// 512×512 manifest icon. Not using the app/icon.tsx special-filename
// convention (that only yields one size) — a plain Route Handler calling
// ImageResponse directly works identically and lets both sizes coexist.
//
// Renders the real brand mark (app/icon.png, 256×256, itself regenerated
// from the SVG monogram — see commit 16bed9d) upscaled 2× rather than a
// placeholder — app/icon.tsx and app/apple-icon.tsx used to draw a plain
// "SG" text square here, which silently duplicated the real static
// icon.png/apple-icon.png files at the same route names. Next.js served
// BOTH, so the page shipped 5 competing <link rel="icon"> tags — very
// likely why Google Search showed a generic globe instead of the real
// logo. Fixed 2026-09-02 by deleting the two placeholder generators and
// making this one reuse the real artwork instead of inventing its own.
export const runtime = 'nodejs';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export async function GET(): Promise<Response> {
  const iconPath = join(process.cwd(), 'src/app/icon.png');
  const iconBase64 = readFileSync(iconPath).toString('base64');

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* next/image doesn't work inside ImageResponse (Satori) — a plain <img> is required here */}
      <img src={`data:image/png;base64,${iconBase64}`} width={512} height={512} alt="" />
    </div>,
    { width: 512, height: 512 },
  );
}
