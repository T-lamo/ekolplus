import { verifyTemplatePreviewToken } from '@/lib/server/bulletin-pdf/print-token';
import { BulletinDocument } from '@/components/bulletin/BulletinDocument';
import { SAMPLE_BULLETIN_DATA } from '@/components/bulletin/sample-bulletin-data';

export const dynamic = 'force-dynamic';

// Standalone print target for the template editor's "Exporter PDF" button
// (see lib/server/bulletin-pdf/generate.ts's generateBulletinTemplatePreviewPdf).
// Unlike app/print/bulletin/[studentId]/[termId], the config travels IN the
// signed token instead of being re-read from the DB — so the exported PDF
// reflects the editor's current in-memory state even before "Enregistrer".
// The editor always sends a config that already validated against the full
// pages-shaped schema, so no normalizeConfig call is needed here.
export default async function PrintBulletinTemplatePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const payload = token ? verifyTemplatePreviewToken(token) : null;
  if (!payload) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Lien invalide ou expiré.</p>;
  }

  const { config } = payload;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `@page{size:${config.pageFormat === 'LETTER' ? 'letter' : 'A4'} ${config.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait'};margin:0} body{margin:0}`,
        }}
      />
      <BulletinDocument config={config} data={SAMPLE_BULLETIN_DATA} chrome={false} />
    </>
  );
}
