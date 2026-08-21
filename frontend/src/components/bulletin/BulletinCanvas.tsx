'use client';

import { CalendarX, GripVertical, LayoutTemplate } from 'lucide-react';
import {
  REORDERABLE_BLOCK_IDS,
  type BlockId,
  type BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import { getPageHeightPx } from './page-size';

export { PAGE_PX_PER_IN, PAGE_SIZES_IN, getPageHeightPx, getPageWidthPx } from './page-size';

// Shared by the template editor (illustrative sample data, interactive block
// selection) and the bulletin viewer (real computed data, read-only) — the
// whole point of a customizable template is that both render identically to
// what was configured. See .planning/banani/report-cards-viewer.md for why
// the viewer does NOT reproduce Banani's own (differently-styled) mockup.

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
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(2);
}
function ordinal(n: number | null): string {
  return n == null ? '—' : `${n}${n === 1 ? 'er' : 'ème'}`;
}
function scoreColor(avg: number | null): string {
  if (avg == null) return '#8884a0';
  if (avg < 8) return '#d93025';
  if (avg < 12) return '#f59e0b';
  return '#1a9e5c';
}
function cellStyle(
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

export function BulletinCanvas({
  config,
  data,
  selected,
  onSelect,
  chrome = true,
  dragId,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
  selected?: BlockId;
  onSelect?: (id: BlockId) => void;
  /** Card shadow/rounded corners for on-screen display. Callers that print
   * or embed the canvas in their own page frame (PDF generation, the
   * editor's paper preview) pass `chrome={false}` for full-bleed output —
   * a floating drop-shadowed card is what made downloaded PDFs look like a
   * photo pasted on a page instead of the document itself. */
  chrome?: boolean;
  /** Editor-only drag-and-drop reordering, applied directly to the
   * reorderable blocks on the canvas (not just the sidebar list). Omit all
   * three on read-only callers (Viewer, print/PDF) to disable it there. */
  dragId?: BlockId | null;
  onDragStart?: (id: BlockId) => void;
  onDrop?: (id: BlockId) => void;
  onDragEnd?: () => void;
}) {
  // Fallback for templates saved before logoSize/signatureSize existed —
  // DB rows aren't backfilled, so an old config's `layout` object simply
  // lacks these keys until the school re-saves via the size sliders.
  const logoSize = config.layout.logoSize ?? 52;
  const interactive = onSelect != null;
  const draggingEnabled = onDragStart != null && onDrop != null;
  const visible = (id: BlockId) => config.blocks.find((b) => b.id === id)?.visible ?? true;
  const wrap = (id: BlockId, content: React.ReactNode, opts?: { pushToBottom?: boolean }) => {
    if (!visible(id)) return null;
    const reorderable = draggingEnabled && REORDERABLE_BLOCK_IDS.includes(id);
    return (
      <div
        key={id}
        onClick={() => onSelect?.(id)}
        draggable={reorderable}
        onDragStart={reorderable ? () => onDragStart?.(id) : undefined}
        onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
        onDrop={reorderable ? () => onDrop?.(id) : undefined}
        onDragEnd={reorderable ? onDragEnd : undefined}
        style={{
          marginBottom: config.layout.blockSpacing,
          marginTop: opts?.pushToBottom ? 'auto' : undefined,
          opacity: dragId === id ? 0.4 : 1,
          flexShrink: 0,
        }}
        className={`relative rounded ${interactive ? 'cursor-pointer' : ''} ${reorderable ? 'cursor-grab' : ''} ${selected === id ? 'outline outline-2 outline-primary' : ''}`}
      >
        {reorderable && (
          <span className="absolute top-1/2 -left-5 -translate-y-1/2 text-muted-foreground">
            <GripVertical size={14} />
          </span>
        )}
        {content}
      </div>
    );
  };

  // Rendered strictly in config.blocks order below — previously this
  // component always rendered stats/notes/absences/appreciation/signatures
  // in one hardcoded sequence regardless of config.blocks' order, so
  // reordering (drag-and-drop, either from the sidebar or the canvas)
  // updated the stored order but never visibly moved anything on the page.
  const blockContent: Partial<Record<BlockId, () => React.ReactNode>> = {
    stats: () => (
      <div className="flex gap-2.5">
        <StatBox
          label="Moyenne générale"
          value={fmt(data.overallAverage)}
          color={config.primaryColor}
        />
        {config.columns.rank && (
          <StatBox label="Rang dans la classe" value={ordinal(data.rank)} color="#1a9e5c" />
        )}
        {config.columns.absences && (
          <>
            <StatBox
              label="Absences (j.)"
              value={data.absencesDays == null ? '—' : String(data.absencesDays)}
              color="#f59e0b"
              tint="#fff8e1"
            />
            <StatBox
              label="Retards"
              value={data.retards == null ? '—' : String(data.retards)}
              color="#f59e0b"
              tint="#fff8e1"
            />
          </>
        )}
        <StatBox
          label="Moy. classe"
          value={fmt(data.classAverage)}
          color="#d93025"
          tint="#fdecea"
        />
      </div>
    ),
    notes: () => (
      <table
        className="w-full border-collapse"
        style={{ lineHeight: config.layout.tableLineHeight }}
      >
        <thead>
          <tr style={{ background: config.primaryColor }}>
            <th
              className="text-left font-bold text-white"
              style={{
                padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                fontSize: config.typography.tableHeader,
              }}
            >
              Matière
            </th>
            {config.columns.coefficient && (
              <th
                className="text-left font-bold text-white"
                style={{
                  padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                  fontSize: config.typography.tableHeader,
                }}
              >
                Coeff.
              </th>
            )}
            <th
              className="text-left font-bold text-white"
              style={{
                padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                fontSize: config.typography.tableHeader,
              }}
            >
              Moy. élève
            </th>
            {config.columns.classAverage && (
              <th
                className="text-left font-bold text-white"
                style={{
                  padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                  fontSize: config.typography.tableHeader,
                }}
              >
                Moy. classe
              </th>
            )}
            {config.columns.minMax && (
              <>
                <th
                  className="text-left font-bold text-white"
                  style={{
                    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                    fontSize: config.typography.tableHeader,
                  }}
                >
                  Min.
                </th>
                <th
                  className="text-left font-bold text-white"
                  style={{
                    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                    fontSize: config.typography.tableHeader,
                  }}
                >
                  Max.
                </th>
              </>
            )}
            {config.columns.appreciation && (
              <th
                className="text-left font-bold text-white"
                style={{
                  padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                  fontSize: config.typography.tableHeader,
                }}
              >
                Appréciation
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.subjects.map((s, i) => (
            <tr
              key={s.name}
              style={
                config.layout.showTableBackgrounds && i % 2 === 1
                  ? { background: '#faf9ff' }
                  : undefined
              }
            >
              <td style={cellStyle(config, { fontSize: config.typography.tableBody })}>
                <strong>{s.name}</strong>
              </td>
              {config.columns.coefficient && (
                <td style={cellStyle(config, { fontSize: config.typography.noteValue })}>
                  {s.coefficient ?? '—'}
                </td>
              )}
              <td
                className="font-bold"
                style={cellStyle(config, {
                  color: scoreColor(s.average),
                  fontSize: config.typography.noteValue,
                })}
              >
                {fmt(s.average)}
              </td>
              {config.columns.classAverage && (
                <td style={cellStyle(config, { fontSize: config.typography.noteValue })}>
                  {fmt(s.classAverage)}
                </td>
              )}
              {config.columns.minMax && (
                <>
                  <td style={cellStyle(config, { fontSize: config.typography.noteValue })}>
                    {fmt(s.min)}
                  </td>
                  <td style={cellStyle(config, { fontSize: config.typography.noteValue })}>
                    {fmt(s.max)}
                  </td>
                </>
              )}
              {config.columns.appreciation && (
                <td
                  className="text-[#6b6b8d] italic"
                  style={cellStyle(config, { fontSize: config.typography.noteValue })}
                >
                  {s.appreciation ?? '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr
            style={{
              borderTopWidth: config.layout.borderWidth || 1,
              borderTopStyle: config.layout.borderStyle,
              borderTopColor: config.primaryColor,
              ...(config.layout.showTableBackgrounds
                ? { background: `${config.primaryColor}14` }
                : undefined),
            }}
          >
            <td
              className="font-bold"
              colSpan={1 + (config.columns.coefficient ? 1 : 0)}
              style={{
                padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                fontSize: config.typography.tableBody,
              }}
            >
              Moyenne générale
            </td>
            <td
              colSpan={
                // Always at least 1 (the "Moy. élève" column always
                // exists) — a naive sum of the optional columns alone can
                // hit 0 when they're all hidden, which is invalid colSpan
                // and was breaking the table's column widths.
                1 +
                (config.columns.classAverage ? 1 : 0) +
                (config.columns.minMax ? 2 : 0) +
                (config.columns.appreciation ? 1 : 0)
              }
              style={{ padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px` }}
            >
              <span className="font-bold" style={{ fontSize: 12, color: config.primaryColor }}>
                {fmt(data.overallAverage)} / 20
              </span>
              <span className="ml-2.5 text-muted-foreground" style={{ fontSize: 10 }}>
                Rang : {ordinal(data.rank)} / {data.rankedCount} élèves
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    ),
    absences: () => (
      <div>
        <div className="mb-1.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
          Absences &amp; Retards
        </div>
        <div className="flex gap-1.5">
          <div className="flex flex-1 items-center gap-1.5 rounded-md bg-[#fff8e1] px-2.5 py-1.5">
            <CalendarX size={14} className="shrink-0 text-[#f59e0b]" />
            <div>
              <div className="text-caption font-extrabold text-[#f59e0b]">
                {data.absencesDays == null ? '—' : `${data.absencesDays} jours`}
              </div>
              <div className="text-[9px] text-muted-foreground">Absences totales</div>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-1.5 rounded-md bg-[#fdecea] px-2.5 py-1.5">
            <CalendarX size={14} className="shrink-0 text-[#d93025]" />
            <div>
              <div className="text-caption font-extrabold text-[#d93025]">
                {data.retards == null ? '—' : data.retards}
              </div>
              <div className="text-[9px] text-muted-foreground">Retards</div>
            </div>
          </div>
        </div>
      </div>
    ),
    appreciation: () => (
      <div className="rounded-md border border-[#e8e4f6] bg-[#faf9ff] p-2.5">
        <div className="mb-1 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
          Appréciation générale du conseil de classe
        </div>
        <div className="text-2xs leading-relaxed text-[#1a1a2e] italic">
          {data.generalAppreciation || 'Aucune appréciation générale saisie.'}
        </div>
      </div>
    ),
    signatures: () => (
      <div>
        <div className="mb-1.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
          Signatures
        </div>
        <div className="flex gap-3.5">
          {config.signatures.director && (
            <SigBox
              label="Signature du Directeur"
              color={config.primaryColor}
              imageUrl={data.directorSignatureUrl}
              size={config.layout.signatureSize ?? 32}
            />
          )}
          {config.signatures.homeroom && (
            <SigBox label="Signature du Titulaire de classe" color={config.primaryColor} />
          )}
          {config.signatures.guardian && (
            <SigBox label="Signature du Parent / Tuteur" color={config.primaryColor} />
          )}
        </div>
      </div>
    ),
  };

  return (
    <div
      className={`print-bulletin-canvas bulletin-print-root relative flex flex-col bg-white ${chrome ? 'overflow-hidden rounded-[2px] shadow-2xl' : ''}`}
      style={{ minHeight: getPageHeightPx(config) }}
    >
      {/* A bulletin long enough to spill past one page (many subjects, all
          optional blocks visible) genuinely paginates when printed — these
          two `display:table*` roles make Chromium's print engine repeat
          `.bulletin-print-header` at the top of every resulting page, the
          same way an HTML <thead> repeats across a printed <table>, instead
          of only showing the school/student header on page 1. Scoped to
          `@media print` so the on-screen editor/viewer keep their ordinary
          flex layout untouched. */}
      <style>{`
        @media print {
          .bulletin-print-root { display: table; width: 100%; }
          .bulletin-print-header { display: table-header-group; }
          .bulletin-print-body { display: table-row-group; }
        }
      `}</style>
      <div className="bulletin-print-header">
        <div
          className="h-1.5 shrink-0"
          style={{
            background: `linear-gradient(90deg, ${config.primaryColor}, var(--color-bulletin-gradient-end))`,
          }}
        />

        {(visible('header') || visible('studentInfo')) && (
          <div
            onClick={() => onSelect?.(visible('header') ? 'header' : 'studentInfo')}
            className={`flex shrink-0 items-center gap-0 border-b-[1.5px] px-5 py-3.5 ${interactive ? 'cursor-pointer' : ''}`}
            style={{ borderColor: `${config.primaryColor}30`, background: '#fdfcff' }}
          >
            {visible('header') && (
              <>
                {data.schoolLogoUrl ? (
                  <img
                    src={data.schoolLogoUrl}
                    alt={data.schoolName}
                    className="shrink-0 rounded-md object-contain"
                    style={{ height: logoSize, width: logoSize }}
                  />
                ) : (
                  <div
                    className="flex shrink-0 items-center justify-center rounded-md border-[1.5px] border-dashed"
                    style={{
                      height: logoSize,
                      width: logoSize,
                      borderColor: `${config.primaryColor}80`,
                      background: `${config.primaryColor}0d`,
                    }}
                  >
                    <LayoutTemplate size={18} style={{ color: `${config.primaryColor}80` }} />
                  </div>
                )}
                <div className="flex flex-1 flex-col items-center gap-0.5">
                  <div
                    className="font-extrabold"
                    style={{ color: config.primaryColor, fontSize: config.typography.schoolName }}
                  >
                    {data.schoolName}
                  </div>
                  <div
                    className="font-black tracking-widest text-[#1a1a2e] uppercase"
                    style={{ fontSize: config.typography.title }}
                  >
                    {config.content.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Année {data.academicYear} · {data.period}
                  </div>
                </div>
              </>
            )}
            {visible('studentInfo') && (
              <div
                className="min-w-[150px] rounded-md border p-2.5 text-right"
                style={{
                  background: `${config.primaryColor}0d`,
                  borderColor: `${config.primaryColor}30`,
                }}
              >
                <div className="text-xs font-extrabold text-[#1a1a2e] uppercase">
                  {data.studentName}
                </div>
                <div className="mt-0.5 text-[10px] text-[#6b6b8d]">
                  {data.className} · Effectif : {data.classSize}
                </div>
                <div className="text-[9px] text-muted-foreground">{data.studentNumber}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bulletin-print-body flex flex-1 flex-col">
        <div className="flex flex-1 flex-col" style={{ padding: config.layout.pageMargin }}>
          {(() => {
            const visibleIds = config.blocks
              .filter((b) => blockContent[b.id] != null && visible(b.id))
              .map((b) => b.id);
            const lastVisibleId = visibleIds[visibleIds.length - 1];
            return config.blocks.map((b) => {
              const renderer = blockContent[b.id];
              if (!renderer) return null;
              // Only anchor signatures near the bottom of a sparsely-filled
              // page when it's actually the LAST visible block — if the
              // school reordered content so something else trails it, an
              // unconditional auto-margin here would still try to push
              // signatures toward the bottom while the trailing blocks
              // still render after it, opening up a large orphaned gap.
              const pushToBottom = b.id === 'signatures' && b.id === lastVisibleId;
              return wrap(b.id, renderer(), { pushToBottom });
            });
          })()}

          {config.content.footerMessage && (
            <div
              className="shrink-0 text-center text-muted-foreground italic"
              style={{ fontSize: config.typography.footer }}
            >
              {config.content.footerMessage}
            </div>
          )}
        </div>

        <div
          className="h-1.5 shrink-0"
          style={{
            background: `linear-gradient(90deg, ${config.primaryColor}, var(--color-bulletin-gradient-end))`,
          }}
        />
      </div>
    </div>
  );
}

function StatBox({
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

function SigBox({
  label,
  color,
  imageUrl,
  size = 32,
}: {
  label: string;
  color: string;
  imageUrl?: string | null;
  /** Rendered signature image height in px (width follows aspect ratio).
   * Also grows the box's min-height so a large signature doesn't overflow
   * the dashed frame — 54px (the box's original fixed min-height, `min-h-13.5`)
   * is the floor. */
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
