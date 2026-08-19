import type { Metadata } from 'next';

// /login is a 'use client' page, so the indexability override lives here —
// client components can't export `metadata`. Unlike the rest of the
// authenticated app (kept out of search results by the root layout's
// default), the login page itself carries no user data and is worth being
// discoverable ("Schoolgesti login") — see robots.ts for the matching
// disallow-list exception.
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
