'use client';

// Bulletin Viewer — the on-screen rendering of one student's bulletin for
// one term, with zoom, full screen, « Imprimer » (opens the real
// server-generated PDF inline) and « Télécharger PDF ». Extracted from the
// school page (app/(school)/bulletins/[studentId]/[termId]) so the Espace
// Élève renders the exact same viewer on its own read-only routes:
//   - `bulletinPath`: the full GET path of the StudentBulletinData read
//     (`?termId=` included);
//   - `pdfBase`: the PDF route without query (`?termId=&disposition=` is
//     appended here);
//   - `backHref`: where « Retour aux bulletins » goes;
//   - `readOnly`: hides « Modifier l'appréciation » and the prev/next
//     classmate Navigation card (the student audience has no roster).
// The chrome strings stay French for now, the same deferral the school
// viewer already carried (see the i18n roadmap in CLAUDE.md).
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Printer,
  Pencil,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Download,
} from 'lucide-react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ASIDE_GRID } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { useUser } from '@/contexts/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  BulletinCanvas,
  getPageHeightPx,
  getPageWidthPx,
  type BulletinRenderData,
} from '@/components/bulletin/BulletinCanvas';
import type { StudentBulletinData } from '@/app/(school)/bulletins/types';

export interface BulletinViewerProps {
  bulletinPath: string;
  pdfBase: string;
  backHref: string;
  readOnly?: boolean;
}

export function BulletinViewer({
  bulletinPath,
  pdfBase,
  backHref,
  readOnly = false,
}: BulletinViewerProps) {
  const user = useUser();
  const [zoom, setZoom] = useState(100);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { data } = useApi<StudentBulletinData>(bulletinPath, {
    skip: !user,
    onError: (err) => {
      setLoadError(
        err instanceof ApiError && err.status === 404
          ? 'Élève introuvable.'
          : 'Impossible de charger le bulletin.',
      );
      return true;
    },
  });
  // A prior transient failure must not keep the banner up once a later
  // fetch of the same resource has succeeded.
  useEffect(() => {
    if (data) setLoadError(null);
  }, [data]);
  const error = loadError;

  if (!user || (!data && !error)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <div className={cn(ASIDE_GRID, 'items-start')}>
          <div className="flex flex-col gap-3 lg:order-2">
            <div className="rounded-lg bg-card p-3.5">
              <Skeleton className="mb-2.5 h-3 w-16" />
              <div className="mb-2.5 flex items-center gap-2.5">
                <Skeleton className="h-9.5 w-9.5 shrink-0 rounded-full" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
            <div className="rounded-lg bg-card p-3.5">
              <Skeleton className="mb-2.5 h-3 w-16" />
              <Skeleton className="mb-1.5 h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 lg:order-1">
            <Skeleton className="h-11 w-full rounded-lg" />
            <div className="flex justify-center py-2">
              <div className="flex w-[760px] max-w-full flex-col gap-3 rounded-md bg-card p-8">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
                <Skeleton className="mt-4 h-24 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href={backHref}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          Retour aux bulletins
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const termLabel = data.terms.find((t) => t.id === data.resolvedTermId)?.label ?? '';
  const renderData: BulletinRenderData = {
    schoolName: data.schoolName,
    schoolLogoUrl: data.schoolLogoUrl,
    directorSignatureUrl: data.directorSignatureUrl,
    period: termLabel,
    academicYear: data.academicYearLabel,
    studentName: `${data.firstName} ${data.lastName}`,
    className: data.className,
    classSize: data.classSize,
    studentNumber: `N° ${data.studentNumber}`,
    subjects: data.subjects.map((s) => ({
      name: s.subjectName,
      coefficient: s.coefficient,
      average: s.average,
      classAverage: s.classAverage,
      min: s.min,
      max: s.max,
      appreciation: s.appreciation,
    })),
    overallAverage: data.overallAverage,
    classAverage: data.classAverage,
    rank: data.rank,
    rankedCount: data.rankedCount,
    generalAppreciation: data.generalAppreciation,
    absencesDays: null,
    retards: null,
  };

  const termQs = `termId=${data.resolvedTermId ?? ''}`;
  const navHref = (studentId: string) => `/bulletins/${studentId}/${data.resolvedTermId ?? ''}`;

  // "Imprimer" opens the real, server-generated PDF (inline, in a new tab)
  // instead of window.print()-ing the on-screen editor view — the on-screen
  // page has no print stylesheet of its own, so a raw window.print() would
  // print the sidebars/toolbar along with a layout that doesn't match the
  // official PDF's pagination. Opening the actual PDF guarantees what gets
  // printed IS the official document.
  const printBulletin = () => {
    window.open(`${pdfBase}?${termQs}&disposition=inline`, '_blank');
  };

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft size={14} />
        Retour aux bulletins
      </Link>

      <div className={cn(ASIDE_GRID, 'items-start')}>
        {/* Élève / actions / navigation — à droite sur desktop, à la largeur
            partagée par toutes les colonnes droites de l'app (ASIDE_GRID) ;
            au-dessus du bulletin sur mobile au lieu de le comprimer. */}
        <div className="flex flex-col gap-3 lg:order-2">
          <div className="rounded-lg bg-card p-3.5">
            <div className="mb-2.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
              Élève
            </div>
            <div className="mb-2.5 flex items-center gap-2.5">
              <Avatar name={`${data.firstName} ${data.lastName}`} size={38} />
              <div>
                <div className="text-caption font-bold text-foreground">
                  {data.firstName} {data.lastName}
                </div>
                <div className="text-2xs text-muted-foreground">#{data.studentNumber}</div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <InfoItem label="Classe" value={data.className} />
              <InfoItem label="Période" value={termLabel} />
              <InfoItem label="Année" value={data.academicYearLabel} />
              <div className="my-1 h-px bg-border" />
              <InfoItem label="Modèle" value={data.template?.name ?? '—'} />
            </div>
          </div>

          <div className="rounded-lg bg-card p-3.5">
            <div className="mb-2.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
              Actions
            </div>
            <ActionBtn icon={Printer} label="Imprimer" primary onClick={printBulletin} />
            <a
              href={`${pdfBase}?${termQs}`}
              className="mb-1 flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-caption font-medium text-foreground"
            >
              <Download size={14} className="text-muted-foreground" />
              Télécharger PDF
            </a>
            {!readOnly && (
              <Link
                href={`/pedagogie/appreciations/${data.studentId}/saisie?${termQs}`}
                className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-caption font-medium text-foreground"
              >
                <Pencil size={14} className="text-muted-foreground" />
                Modifier l&apos;appréciation
              </Link>
            )}
          </div>

          {!readOnly && (
            <div className="rounded-lg bg-card p-3.5">
              <div className="mb-2.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                Navigation
              </div>
              <div className="flex gap-2">
                {data.prevStudentId ? (
                  <Link
                    href={navHref(data.prevStudentId)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground"
                  >
                    <ChevronLeft size={13} />
                    Précédent
                  </Link>
                ) : (
                  <span className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground opacity-40">
                    <ChevronLeft size={13} />
                    Précédent
                  </span>
                )}
                {data.nextStudentId ? (
                  <Link
                    href={navHref(data.nextStudentId)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground"
                  >
                    Suivant
                    <ChevronRight size={13} />
                  </Link>
                ) : (
                  <span className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground opacity-40">
                    Suivant
                    <ChevronRight size={13} />
                  </span>
                )}
              </div>
              <div className="mt-2 text-center text-2xs text-muted-foreground">
                Élève {data.studentIndex ?? '—'} sur {data.classSize}
              </div>
            </div>
          )}
        </div>

        {/* Bulletin area */}
        <div className="flex min-w-0 flex-col gap-3 lg:order-1">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card px-4 py-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(50, z - 10))}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <ZoomOut size={14} />
              </button>
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(150, z + 10))}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('bulletin-page-wrap')?.requestFullscreen?.()}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground"
              >
                <Maximize2 size={13} />
                Plein écran
              </button>
            </div>
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <FileText size={13} />
              Format :{' '}
              {data.template
                ? `${data.template.config.pageFormat === 'LETTER' ? 'Letter' : 'A4'} ${data.template.config.orientation === 'LANDSCAPE' ? 'paysage' : 'portrait'}`
                : '—'}{' '}
              — Modèle : {data.template?.name ?? '—'}
            </span>
            <button
              type="button"
              onClick={printBulletin}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <Printer size={13} />
              Imprimer
            </button>
          </div>

          {/* `overflow-x-auto` + `mx-auto` (not flex `justify-center`): a page
            wider than the column scrolls inside its own area instead of
            spilling under the right panel — and a centered flex child that
            overflows gets its left edge clipped. */}
          <div id="bulletin-page-wrap" className="overflow-x-auto py-2">
            {data.template ? (
              (() => {
                // Natural (unscaled) page size — same 96 CSS px/in convention
                // the PDF export and template editor use. The outer div
                // reserves the SCALED footprint and the inner div is the real
                // page at its natural size with transform:scale only — same
                // fix already applied to the template editor's preview.
                const naturalWidth = getPageWidthPx(data.template.config);
                const naturalHeight = getPageHeightPx(data.template.config);
                const scaledWidth = Math.round(naturalWidth * (zoom / 100));
                const scaledHeight = Math.round(naturalHeight * (zoom / 100));
                return (
                  <div className="mx-auto" style={{ width: scaledWidth, height: scaledHeight }}>
                    <div
                      style={{
                        width: naturalWidth,
                        height: naturalHeight,
                        transform: `scale(${zoom / 100})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <BulletinCanvas config={data.template.config} data={renderData} />
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="mx-auto w-fit rounded-md bg-card p-10 text-center text-sm text-muted-foreground">
                Aucun modèle de bulletin disponible.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  primary,
  danger,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const cls = primary
    ? 'bg-primary text-primary-foreground'
    : danger
      ? 'bg-destructive text-destructive-foreground'
      : 'border border-border bg-card text-foreground';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-caption font-medium ${cls}`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
