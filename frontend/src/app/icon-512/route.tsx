// 512×512 manifest icon. Not using the app/icon.tsx special-filename
// convention (that only yields one size) — a plain Route Handler calling
// ImageResponse directly works identically and lets both sizes coexist.
export const runtime = 'nodejs';

import { ImageResponse } from 'next/og';

export async function GET(): Promise<Response> {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#6c2bd9',
        borderRadius: 104,
        color: '#ffffff',
        fontSize: 256,
        fontWeight: 700,
        fontFamily: 'sans-serif',
      }}
    >
      SG
    </div>,
    { width: 512, height: 512 },
  );
}
