import type { MetadataRoute } from 'next';
import { resolvePrintBaseUrl } from '@/lib/server/bulletin-pdf/print-base-url';

// The only real public content is the marketing landing (`/`) — everything
// else is either the authenticated app (dashboard/configuration/pedagogie/
// eleves/enseignants/scolarite/settings/bulletins), the back-office
// (/admin), the JSON API, print-only renders meant for the PDF pipeline, or
// an auth flow that can carry a one-time token in the URL (reset-password,
// verify-email) — none of those should ever be crawled or indexed. Static
// assets (images, /_next/*) are left allowed by omission so Google can
// still render and index the landing page itself.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/configuration',
        '/pedagogie',
        '/eleves',
        '/enseignants',
        '/scolarite',
        '/settings',
        '/bulletins',
        '/admin',
        '/api',
        '/print',
        '/login',
        '/forgot-password',
        '/reset-password',
        '/verify-email',
        '/auth',
      ],
    },
    sitemap: `${resolvePrintBaseUrl()}/sitemap.xml`,
  };
}
