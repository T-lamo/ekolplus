import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/bulletin-pdf/get-bulletin-view', () => ({
  getStudentBulletinView: vi.fn(),
}));
vi.mock('@/lib/server/bulletin-pdf/generate', () => ({
  generateBulletinPdf: vi.fn(),
  PdfGenerationError: class PdfGenerationError extends Error {},
}));

import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { generateBulletinPdf, PdfGenerationError } from '@/lib/server/bulletin-pdf/generate';
import { GET } from './route';

const mockRequireStudent = vi.mocked(requireStudent);
const mockView = vi.mocked(getStudentBulletinView);
const mockPdf = vi.mocked(generateBulletinPdf);

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(studentCtx as never);
  mockView.mockResolvedValue({
    firstName: 'Nadia',
    lastName: 'Joseph',
    template: {
      id: 'tpl',
      name: 'Standard',
      isActive: true,
      config: { pageFormat: 'A4', orientation: 'PORTRAIT' },
    },
  } as never);
  mockPdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
});

describe('GET /api/student/bulletin/pdf', () => {
  it('passes the requireStudent response through', async () => {
    mockRequireStudent.mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(new NextRequest('http://localhost/api/student/bulletin/pdf?termId=t1'));
    expect(res.status).toBe(404);
    expect(mockView).not.toHaveBeenCalled();
  });

  it('requires termId', async () => {
    const res = await GET(new NextRequest('http://localhost/api/student/bulletin/pdf'));
    expect(res.status).toBe(400);
    expect(mockView).not.toHaveBeenCalled();
  });

  it('returns 404 when no template is available', async () => {
    mockView.mockResolvedValue({ firstName: 'N', lastName: 'J', template: null } as never);
    const res = await GET(new NextRequest('http://localhost/api/student/bulletin/pdf?termId=t1'));
    expect(res.status).toBe(404);
    expect(mockPdf).not.toHaveBeenCalled();
  });

  it('streams the PDF for the session student with the student audience', async () => {
    const res = await GET(new NextRequest('http://localhost/api/student/bulletin/pdf?termId=t1'));
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith('school_1', 'stu_1', 't1', 'student');
    expect(mockPdf).toHaveBeenCalledWith(
      'school_1',
      'stu_1',
      't1',
      { pageFormat: 'A4', orientation: 'PORTRAIT' },
      'student',
    );
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="bulletin-Nadia-Joseph.pdf"',
    );
  });

  it('honours disposition=inline', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/student/bulletin/pdf?termId=t1&disposition=inline'),
    );
    expect(res.headers.get('Content-Disposition')).toBe(
      'inline; filename="bulletin-Nadia-Joseph.pdf"',
    );
  });

  it('maps a PdfGenerationError to 502', async () => {
    mockPdf.mockRejectedValue(new PdfGenerationError('chromium down'));
    const res = await GET(new NextRequest('http://localhost/api/student/bulletin/pdf?termId=t1'));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'PDF_GENERATION_FAILED' });
  });
});
