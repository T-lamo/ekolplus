// The single data shape every bulletin block renderer reads from —
// extracted from the old monolithic BulletinCanvas.tsx so both server
// components (print pages) and client components (viewer, editor) can
// import it without going through the component that's being deleted.
// See .planning/banani/report-cards-viewer.md for why the viewer renders
// the school's own configured layout rather than reproducing Banani's
// (differently-styled) mockup.
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

export interface BulletinSubjectRow {
  name: string;
  coefficient: number | null;
  average: number | null;
  classAverage: number | null;
  min: number | null;
  max: number | null;
  appreciation: string | null;
}

export interface BulletinRenderData {
  schoolName: string;
  schoolLogoUrl: string | null;
  directorSignatureUrl: string | null;
  period: string;
  academicYear: string;
  studentName: string;
  className: string;
  classSize: number;
  studentNumber: string;
  subjects: BulletinSubjectRow[];
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  generalAppreciation: string | null;
  absencesDays: number | null;
  retards: number | null;
  // Gained for the pages engine (spec §10.2) — additive: the fields above
  // stay as-is so the 7 legacy block renderers are unchanged verbatim.
  firstName: string;
  lastName: string;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  termLabel: string;
  academicYearLabel: string;
  qualitativeSubjects: {
    subjectName: string;
    ratingScale: string[];
    criteria: { label: string; level: number | null }[];
  }[];
}

export function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(2);
}
export function ordinal(n: number | null): string {
  return n == null ? '—' : `${n}${n === 1 ? 'er' : 'ème'}`;
}
export function scoreColor(avg: number | null): string {
  if (avg == null) return '#8884a0';
  if (avg < 8) return '#d93025';
  if (avg < 12) return '#f59e0b';
  return '#1a9e5c';
}
export function cellStyle(
  config: BulletinTemplateConfig,
  extra?: React.CSSProperties,
): React.CSSProperties {
  return {
    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
    borderBottomWidth: config.layout.borderWidth,
    borderBottomStyle: config.layout.borderStyle,
    borderBottomColor: config.layout.borderColor,
    ...extra,
  };
}

export function StatBox({
  label,
  value,
  color,
  tint,
}: {
  label: string;
  value: string;
  color: string;
  tint?: string;
}) {
  return (
    <div
      className="flex-1 rounded-md p-2.5 text-center"
      style={{ background: tint ?? `${color}0d` }}
    >
      <div className="text-base font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function SigBox({
  label,
  color,
  imageUrl,
  size = 32,
}: {
  label: string;
  color: string;
  imageUrl?: string | null;
  size?: number;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-end gap-1 rounded-md border-[1.5px] border-dashed p-2.5 pb-1.5"
      style={{ borderColor: `${color}80`, minHeight: Math.max(54, size + 22) }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={label}
          className="mb-1 w-auto object-contain"
          style={{ height: size }}
        />
      )}
      <div className="text-center text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}
