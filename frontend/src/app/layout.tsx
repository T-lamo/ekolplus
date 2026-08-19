import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { resolvePrintBaseUrl } from '@/lib/server/bulletin-pdf/print-base-url';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// `metadataBase` resolves every relative URL used in `metadata.openGraph`/
// `metadata.twitter`/`metadata.alternates.canonical` across the app (root +
// per-page overrides) into an absolute one — required for social-preview
// images to work. Reuses the same APP_URL → Vercel-env → localhost
// resolution the PDF pipeline already relies on, so both stay in sync
// instead of drifting.
export const metadata: Metadata = {
  metadataBase: new URL(resolvePrintBaseUrl()),
  title: {
    default: 'Schoolgesti',
    template: '%s — Schoolgesti',
  },
  description: 'La plateforme tout-en-un de gestion scolaire.',
  // Everything except the public landing page is an authenticated app
  // (dashboard, back-office, auth flows with one-time tokens) — this
  // fallback keeps any page that forgets to set its own `metadata` out of
  // search results by default; `app/page.tsx` opts the landing page back in.
  robots: { index: false, follow: false },
};

// `viewport-fit=cover` lets the app draw under the iPhone home-indicator
// area so `env(safe-area-inset-bottom)` (used by MobileBottomNav) resolves
// to the real inset instead of 0 — without it the bottom tab bar would sit
// flush under the home indicator.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className={inter.className}>
        <ServiceWorkerRegister />
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>{children}</AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
