// iOS home-screen icon (Next's native app/apple-icon.tsx convention) — iOS
// applies its own rounded-square mask, so this stays a plain filled square.
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#6c2bd9',
        color: '#ffffff',
        fontSize: 90,
        fontWeight: 700,
        fontFamily: 'sans-serif',
      }}
    >
      SG
    </div>,
    { ...size },
  );
}
