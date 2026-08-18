import type { MetadataRoute } from 'next';
import { resolvePrintBaseUrl } from '@/lib/server/bulletin-pdf/print-base-url';

// Single-page marketing site (the landing's sections are anchors on `/`,
// not separate documents) — one real entry. Add a URL here only when a new
// page is meant to be publicly indexed; everything else is disallowed in
// robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = resolvePrintBaseUrl();
  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
