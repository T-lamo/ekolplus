import { Fragment } from 'react';
import type {
  YearGridBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData, YearTermData } from '../render-data';

// Matières × périodes grid of the annual carnet (spec 2026-09-06 §4.1):
// Word-style table, a thin border on every cell, one two-column group
// (Notes, Sur) per period of the year, then Total / Moyenne / Place rows.
export const INK = '#1a1a2e';

/** French decimal comma, no trailing zero, empty for null. */
export function fmtPoints(n: number | null): string {
  return n == null ? '' : String(n).replace('.', ',');
}
/** Rank as printed on the carnet: 1er, 2e, 3e…; empty for null. */
export function place(n: number | null): string {
  return n == null ? '' : n === 1 ? '1er' : `${n}e`;
}

export function render({
  block,
  config,
  data,
}: {
  block: YearGridBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const year = data.year;
  if (!year || year.terms.length === 0) return null;
  const terms: YearTermData[] = year.terms;
  const subjects = terms[0]!.subjects;
  const notesLabel = block.notesLabel ?? 'Notes';
  const maxLabel = block.maxLabel ?? 'Sur';

  const cell: React.CSSProperties = {
    border: `1px solid ${INK}`,
    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
    color: INK,
  };
  const head: React.CSSProperties = {
    ...cell,
    fontSize: config.typography.tableHeader,
    fontWeight: 700,
  };
  const body: React.CSSProperties = { ...cell, fontSize: config.typography.tableBody };
  const num: React.CSSProperties = {
    ...body,
    textAlign: 'center',
    fontSize: config.typography.noteValue,
  };

  const rows: React.ReactNode[] = [];
  let lastDomain: string | null = null;
  subjects.forEach((subject, i) => {
    if (block.showDomains && subject.domain && subject.domain !== lastDomain) {
      rows.push(
        <tr key={`domain-${i}-${subject.domain}`}>
          <td style={{ ...body, fontWeight: 700 }}>{subject.domain}</td>
          {terms.map((t) => (
            <Fragment key={t.termId}>
              <td style={cell} />
              <td style={cell} />
            </Fragment>
          ))}
        </tr>,
      );
    }
    lastDomain = subject.domain;
    rows.push(
      <tr key={`${i}-${subject.subjectName}`}>
        <td style={body}>{subject.subjectName}</td>
        {terms.map((t) => {
          const s = t.subjects[i];
          return (
            <Fragment key={t.termId}>
              <td style={num}>{fmtPoints(s?.points ?? null)}</td>
              <td style={num}>{t.hasGrades && s ? String(s.maxPoints) : ''}</td>
            </Fragment>
          );
        })}
      </tr>,
    );
  });

  const footRow = (
    label: string,
    left: (t: YearTermData) => string,
    right: (t: YearTermData) => string,
  ) => (
    <tr key={label}>
      <td style={{ ...body, fontWeight: 700 }}>{label}</td>
      {terms.map((t) => (
        <Fragment key={t.termId}>
          <td style={{ ...num, fontWeight: 700 }}>{left(t)}</td>
          <td style={{ ...num, fontWeight: 700 }}>{right(t)}</td>
        </Fragment>
      ))}
    </tr>
  );

  return (
    <table
      className="w-full border-collapse"
      style={{ lineHeight: config.layout.tableLineHeight, breakInside: 'avoid' }}
    >
      <thead>
        <tr>
          <th
            rowSpan={2}
            style={{
              ...head,
              textAlign: 'left',
              width: '32%',
              fontSize: config.typography.tableBody + 1,
            }}
          >
            Matières
          </th>
          {terms.map((t) => (
            <th key={t.termId} colSpan={2} style={{ ...head, textAlign: 'center' }}>
              {t.label}
            </th>
          ))}
        </tr>
        <tr>
          {terms.map((t) => (
            <Fragment key={t.termId}>
              <th style={{ ...head, textAlign: 'center', fontWeight: 400 }}>{notesLabel}</th>
              <th style={{ ...head, textAlign: 'center', fontWeight: 400 }}>{maxLabel}</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows}
        {footRow(
          'Total',
          (t) => fmtPoints(t.totalPoints),
          (t) => (t.hasGrades ? String(t.totalMax) : ''),
        )}
        {footRow(
          'Moyenne',
          (t) => fmtPoints(t.average10),
          () => '',
        )}
        {footRow(
          'Place',
          (t) => place(t.rank),
          () => '',
        )}
      </tbody>
    </table>
  );
}
