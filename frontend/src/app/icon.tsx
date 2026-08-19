// Next's native app/icon.tsx convention — auto-wraps this in ImageResponse
// (next/og, bundled with Next.js, zero extra dependency) and wires the
// <link rel="icon"> tag for free. 192×192 for the PWA manifest's smaller
// icon slot.
import { ImageResponse } from 'next/og';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#6c2bd9',
        borderRadius: 40,
        color: '#ffffff',
        fontSize: 96,
        fontWeight: 700,
        fontFamily: 'sans-serif',
      }}
    >
      SG
    </div>,
    { ...size },
  );
}
