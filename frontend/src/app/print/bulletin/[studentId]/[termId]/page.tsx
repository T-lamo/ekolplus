import { verifyPrintToken } from '@/lib/server/bulletin-pdf/print-token';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { normalizeConfig } from '@/lib/server/bulletin-templates';
import { BulletinDocument } from '@/components/bulletin/BulletinDocument';
import type { BulletinRenderData } from '@/components/bulletin/render-data';

export const dynamic = 'force-dynamic';

// Standalone print target for the server-side PDF pipeline (Puppeteer
// navigates here, see lib/server/bulletin-pdf/generate.ts). Authorized by a
// short-lived signed token bound to exactly one (schoolId, studentId,
// termId) tuple — never a session cookie, since headless Chromium has no
// browser session. Renders the same BulletinDocument the Viewer shows on
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

  const view = await getStudentBulletinView(
    payload.schoolId,
    studentId,
    termId,
    payload.audience ?? 'staff',
  );
  if (!view || !view.template) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Bulletin indisponible.</p>;
  }

  const config = normalizeConfig(view.template.config);
  const renderData: BulletinRenderData = {
    schoolName: view.schoolName,
    schoolLogoUrl: view.schoolLogoUrl,
    directorSignatureUrl: view.directorSignatureUrl,
    period: view.termLabel,
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
    firstName: view.firstName,
    lastName: view.lastName,
    schoolAddress: view.schoolAddress,
    schoolPhone: view.schoolPhone,
    schoolEmail: view.schoolEmail,
    termLabel: view.termLabel,
    academicYearLabel: view.academicYearLabel,
    qualitativeSubjects: view.qualitativeSubjects,
    nisu: view.nisu,
    ...(view.year ? { year: view.year } : {}),
  };

  return (
    <>
      {/* Puppeteer prints with preferCSSPageSize -> this @page rule drives
          the actual paper size + orientation. margin:0 is deliberate — the
          PDF must be a literal 1:1 match of the on-screen Viewer, which
          renders the bulletin edge-to-edge with no outer gutter. Any
          spacing the school wants around the content is authored inside
          the template itself (config.layout.pageMargin), not injected
          here. chrome={false} strips the on-screen card look (shadow,
          rounded corners) so the PDF is the real page, not a floating
          card. Each sheet already carries its own break-after:page (see
          BulletinDocument.tsx) except the last one. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@page{size:${config.pageFormat === 'LETTER' ? 'letter' : 'A4'} ${config.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait'};margin:0} body{margin:0}`,
        }}
      />
      <BulletinDocument config={config} data={renderData} chrome={false} />
    </>
  );
}
