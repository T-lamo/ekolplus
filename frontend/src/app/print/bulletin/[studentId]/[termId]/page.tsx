import { verifyPrintToken } from '@/lib/server/bulletin-pdf/print-token';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { BulletinCanvas, type BulletinRenderData } from '@/components/bulletin/BulletinCanvas';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

export const dynamic = 'force-dynamic';

// Standalone print target for the server-side PDF pipeline (Puppeteer
// navigates here, see lib/server/bulletin-pdf/generate.ts). Authorized by a
// short-lived signed token bound to exactly one (schoolId, studentId,
// termId) tuple — never a session cookie, since headless Chromium has no
// browser session. Renders the same BulletinCanvas the Viewer shows on
// screen, so the generated PDF is byte-for-byte what a school configured.
export default async function PrintBulletinPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string; termId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { studentId, termId } = await params;
  const { token } = await searchParams;

  const payload = token ? verifyPrintToken(token) : null;
  if (!payload || payload.studentId !== studentId || payload.termId !== termId) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Lien invalide ou expiré.</p>;
  }

  const view = await getStudentBulletinView(payload.schoolId, studentId, termId);
  if (!view || !view.template) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Bulletin indisponible.</p>;
  }

  const config = view.template.config as BulletinTemplateConfig;
  const termLabel = view.terms.find((t) => t.id === view.resolvedTermId)?.label ?? '';
  const renderData: BulletinRenderData = {
    schoolName: view.schoolName,
    schoolLogoUrl: view.schoolLogoUrl,
    directorSignatureUrl: view.directorSignatureUrl,
    period: termLabel,
    academicYear: view.academicYearLabel,
    studentName: `${view.firstName} ${view.lastName}`,
    className: view.className,
    classSize: view.classSize,
    studentNumber: `N° ${view.studentNumber}`,
    subjects: view.subjects.map((s) => ({
      name: s.subjectName,
      coefficient: s.coefficient,
      average: s.average,
      classAverage: s.classAverage,
      min: s.min,
      max: s.max,
      appreciation: s.appreciation,
    })),
    overallAverage: view.overallAverage,
    classAverage: view.classAverage,
    rank: view.rank,
    rankedCount: view.rankedCount,
    generalAppreciation: view.generalAppreciation,
    absencesDays: null,
    retards: null,
  };

  return (
    <>
      {/* Puppeteer prints with preferCSSPageSize -> this @page rule drives
          the actual paper size + orientation + margin. chrome={false} on
          BulletinCanvas strips the on-screen card look (shadow, rounded
          corners) so the PDF renders as a real full-bleed page instead of a
          floating card — that's what made downloaded PDFs look like a photo
          pasted onto a blank sheet instead of the document itself. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@page{size:${config.pageFormat === 'LETTER' ? 'letter' : 'A4'} ${config.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait'};margin:12mm} body{margin:0}`,
        }}
      />
      <BulletinCanvas config={config} data={renderData} chrome={false} />
    </>
  );
}
