// PWA manifest — Next's native app/manifest.ts convention (no separate
// static manifest.json needed). Colors match the app's real design tokens
// (globals.css --color-primary / --color-background), not the unused
// teal/orange monogram gradient under public/logos/ (that artwork isn't
// wired into any shipped CSS token — the app's actual live palette is
// purple, see globals.css's "Lavender SaaS" theme comment).
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Schoolgesti',
    short_name: 'Schoolgesti',
    description: 'La plateforme tout-en-un de gestion scolaire.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f3f3f7',
    theme_color: '#6c2bd9',
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
