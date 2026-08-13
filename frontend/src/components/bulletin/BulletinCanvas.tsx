'use client';

import { CalendarX, LayoutTemplate } from 'lucide-react';
import type {
  BlockId,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';

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
function cellBorderStyle(config: BulletinTemplateConfig): React.CSSProperties {
  return {
    borderBottomWidth: config.layout.borderWidth,
    borderBottomStyle: 'solid',
    borderBottomColor: config.layout.borderColor,
  };
}

export function BulletinCanvas({
  config,
  data,
  selected,
  onSelect,
}: {
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
  selected?: BlockId;
  onSelect?: (id: BlockId) => void;
}) {
  const interactive = onSelect != null;
  const visible = (id: BlockId) => config.blocks.find((b) => b.id === id)?.visible ?? true;
  const wrap = (id: BlockId, content: React.ReactNode) =>
    visible(id) ? (
      <div
        onClick={() => onSelect?.(id)}
        style={{ marginBottom: config.layout.blockSpacing }}
        className={`relative rounded ${interactive ? 'cursor-pointer' : ''} ${selected === id ? 'outline outline-2 outline-primary' : ''}`}
      >
        {content}
      </div>
    ) : null;

  return (
    <div
      className="print-bulletin-canvas relative overflow-hidden rounded-[2px] bg-white shadow-2xl"
      style={{ minHeight: 586 }}
    >
      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, ${config.primaryColor}, #a855f7)` }}
      />

      {(visible('header') || visible('studentInfo')) && (
        <div
          onClick={() => onSelect?.(visible('header') ? 'header' : 'studentInfo')}
          className={`flex items-center gap-0 border-b-[1.5px] px-5 py-3.5 ${interactive ? 'cursor-pointer' : ''}`}
          style={{ borderColor: `${config.primaryColor}30`, background: '#fdfcff' }}
        >
          {visible('header') && (
            <>
              {data.schoolLogoUrl ? (
                <img
                  src={data.schoolLogoUrl}
                  alt={data.schoolName}
                  className="h-13 w-13 shrink-0 rounded-md object-contain"
                />
              ) : (
                <div
                  className="flex h-13 w-13 shrink-0 items-center justify-center rounded-md border-[1.5px] border-dashed"
                  style={{
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
                <div className="text-[10px] text-[#8884a0]">
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
              <div className="text-[9px] text-[#8884a0]">{data.studentNumber}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: config.layout.pageMargin }}>
        {wrap(
          'stats',
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
          </div>,
        )}

        {wrap(
          'notes',
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr style={{ background: config.primaryColor }}>
                <th className="p-1.5 text-left text-[10px] font-bold text-white">Matière</th>
                {config.columns.coefficient && (
                  <th className="p-1.5 text-left text-[10px] font-bold text-white">Coeff.</th>
                )}
                <th className="p-1.5 text-left text-[10px] font-bold text-white">Moy. élève</th>
                {config.columns.classAverage && (
                  <th className="p-1.5 text-left text-[10px] font-bold text-white">Moy. classe</th>
                )}
                {config.columns.minMax && (
                  <>
                    <th className="p-1.5 text-left text-[10px] font-bold text-white">Min.</th>
                    <th className="p-1.5 text-left text-[10px] font-bold text-white">Max.</th>
                  </>
                )}
                {config.columns.appreciation && (
                  <th className="p-1.5 text-left text-[10px] font-bold text-white">Appréciation</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((s, i) => (
                <tr key={s.name} style={i % 2 === 1 ? { background: '#faf9ff' } : undefined}>
                  <td
                    className="p-1.5"
                    style={{ ...cellBorderStyle(config), fontSize: config.typography.tableBody }}
                  >
                    <strong>{s.name}</strong>
                  </td>
                  {config.columns.coefficient && (
                    <td className="p-1.5" style={cellBorderStyle(config)}>
                      {s.coefficient ?? '—'}
                    </td>
                  )}
                  <td
                    className="p-1.5 font-bold"
                    style={{ ...cellBorderStyle(config), color: scoreColor(s.average) }}
                  >
                    {fmt(s.average)}
                  </td>
                  {config.columns.classAverage && (
                    <td className="p-1.5" style={cellBorderStyle(config)}>
                      {fmt(s.classAverage)}
                    </td>
                  )}
                  {config.columns.minMax && (
                    <>
                      <td className="p-1.5" style={cellBorderStyle(config)}>
                        {fmt(s.min)}
                      </td>
                      <td className="p-1.5" style={cellBorderStyle(config)}>
                        {fmt(s.max)}
                      </td>
                    </>
                  )}
                  {config.columns.appreciation && (
                    <td className="p-1.5 text-[#6b6b8d] italic" style={cellBorderStyle(config)}>
                      {s.appreciation ?? '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: `${config.primaryColor}14` }}>
                <td className="p-1.5 font-bold" colSpan={config.columns.coefficient ? 2 : 1}>
                  Moyenne générale
                </td>
                <td className="p-1.5 text-[12px] font-bold" style={{ color: config.primaryColor }}>
                  {fmt(data.overallAverage)} / 20
                </td>
                <td
                  colSpan={
                    (config.columns.classAverage ? 1 : 0) +
                    (config.columns.minMax ? 2 : 0) +
                    (config.columns.appreciation ? 1 : 0)
                  }
                  className="p-1.5 text-[10px] text-[#8884a0]"
                >
                  Rang : {ordinal(data.rank)} / {data.rankedCount} élèves
                </td>
              </tr>
            </tfoot>
          </table>,
        )}

        <div className="mb-2.5 flex gap-3">
          {wrap(
            'absences',
            <div className="w-[200px] shrink-0">
              <div className="mb-1.5 text-[9px] font-bold tracking-wide text-[#8884a0] uppercase">
                Absences &amp; Retards
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 rounded-md bg-[#fff8e1] px-2.5 py-1.5">
                  <CalendarX size={14} className="shrink-0 text-[#f59e0b]" />
                  <div>
                    <div className="text-[13px] font-extrabold text-[#f59e0b]">
                      {data.absencesDays == null ? '—' : `${data.absencesDays} jours`}
                    </div>
                    <div className="text-[9px] text-[#8884a0]">Absences totales</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-md bg-[#fdecea] px-2.5 py-1.5">
                  <CalendarX size={14} className="shrink-0 text-[#d93025]" />
                  <div>
                    <div className="text-[13px] font-extrabold text-[#d93025]">
                      {data.retards == null ? '—' : data.retards}
                    </div>
                    <div className="text-[9px] text-[#8884a0]">Retards</div>
                  </div>
                </div>
              </div>
            </div>,
          )}
          {wrap(
            'appreciation',
            <div className="flex-1 rounded-md border border-[#e8e4f6] bg-[#faf9ff] p-2.5">
              <div className="mb-1 text-[9px] font-bold tracking-wide text-[#8884a0] uppercase">
                Appréciation générale du conseil de classe
              </div>
              <div className="text-[11px] leading-relaxed text-[#1a1a2e] italic">
                {data.generalAppreciation || 'Aucune appréciation générale saisie.'}
              </div>
            </div>,
          )}
        </div>

        {wrap(
          'signatures',
          <div>
            <div className="mb-1.5 text-[9px] font-bold tracking-wide text-[#8884a0] uppercase">
              Signatures
            </div>
            <div className="flex gap-3.5">
              {config.signatures.director && (
                <SigBox
                  label="Signature du Directeur"
                  color={config.primaryColor}
                  imageUrl={data.directorSignatureUrl}
                />
              )}
              {config.signatures.homeroom && (
                <SigBox label="Signature du Titulaire de classe" color={config.primaryColor} />
              )}
              {config.signatures.guardian && (
                <SigBox label="Signature du Parent / Tuteur" color={config.primaryColor} />
              )}
            </div>
          </div>,
        )}

        {config.content.footerMessage && (
          <div className="mt-1 text-center text-[9px] text-[#8884a0] italic">
            {config.content.footerMessage}
          </div>
        )}
      </div>

      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, ${config.primaryColor}, #a855f7)` }}
      />
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
      <div className="mt-0.5 text-[9px] text-[#8884a0]">{label}</div>
    </div>
  );
}

function SigBox({
  label,
  color,
  imageUrl,
}: {
  label: string;
  color: string;
  imageUrl?: string | null;
}) {
  return (
    <div
      className="flex min-h-13.5 flex-1 flex-col items-center justify-end gap-1 rounded-md border-[1.5px] border-dashed p-2.5 pb-1.5"
      style={{ borderColor: `${color}80` }}
    >
      {imageUrl && <img src={imageUrl} alt={label} className="mb-1 h-8 w-auto object-contain" />}
      <div className="text-center text-[9px] text-[#8884a0]">{label}</div>
    </div>
  );
}
