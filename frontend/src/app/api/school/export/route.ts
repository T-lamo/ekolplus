// GET /api/school/export — Zone dangereuse's one non-destructive action:
// streams a ZIP with every row scoped to the caller's school as plain JSON
// files. Read-only, OWNER-only (matches the other two danger-zone actions'
// gating even though nothing here is destroyed). See
// .planning/banani/school-settings-v2.md.
export const runtime = 'nodejs';

import 'server-only';
import { Readable } from 'node:stream';
import { NextResponse, type NextRequest } from 'next/server';
import { ZipArchive } from 'archiver';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'OWNER')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { schoolId } = mySchool;

    const [
      school,
      students,
      guardians,
      enrollments,
      teachers,
      classes,
      subjects,
      classSubjects,
      evaluations,
      grades,
      attendance,
      goals,
      appreciations,
      bulletinTemplates,
    ] = await Promise.all([
      prisma.school.findUniqueOrThrow({ where: { id: schoolId } }),
      prisma.student.findMany({ where: { schoolId } }),
      prisma.guardian.findMany({ where: { student: { schoolId } } }),
      prisma.enrollment.findMany({ where: { student: { schoolId } } }),
      prisma.teacher.findMany({ where: { schoolId } }),
      prisma.class.findMany({ where: { schoolId } }),
      prisma.subject.findMany({ where: { schoolId } }),
      prisma.classSubject.findMany({ where: { class: { schoolId } } }),
      prisma.evaluation.findMany({ where: { classSubject: { class: { schoolId } } } }),
      prisma.grade.findMany({ where: { student: { schoolId } } }),
      prisma.attendance.findMany({ where: { student: { schoolId } } }),
      prisma.goal.findMany({ where: { student: { schoolId } } }),
      prisma.appreciation.findMany({ where: { student: { schoolId } } }),
      prisma.bulletinTemplate.findMany({ where: { schoolId } }),
    ]);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.append(JSON.stringify(school, null, 2), { name: 'school.json' });
    archive.append(JSON.stringify({ students, guardians, enrollments }, null, 2), {
      name: 'students.json',
    });
    archive.append(JSON.stringify(teachers, null, 2), { name: 'teachers.json' });
    archive.append(JSON.stringify(classes, null, 2), { name: 'classes.json' });
    archive.append(JSON.stringify(subjects, null, 2), { name: 'subjects.json' });
    archive.append(JSON.stringify(classSubjects, null, 2), { name: 'class-subjects.json' });
    archive.append(JSON.stringify(evaluations, null, 2), { name: 'evaluations.json' });
    archive.append(JSON.stringify(grades, null, 2), { name: 'grades.json' });
    archive.append(JSON.stringify(attendance, null, 2), { name: 'attendance.json' });
    archive.append(JSON.stringify(goals, null, 2), { name: 'goals.json' });
    archive.append(JSON.stringify(appreciations, null, 2), { name: 'appreciations.json' });
    archive.append(JSON.stringify(bulletinTemplates, null, 2), {
      name: 'bulletin-templates.json',
    });
    void archive.finalize();

    const filename = `export-${school.shortName ?? school.id}-${new Date().toISOString().slice(0, 10)}.zip`;

    return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
        'x-request-id': ctx.requestId,
      },
    });
  });
}
