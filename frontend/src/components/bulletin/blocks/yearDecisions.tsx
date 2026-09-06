import type {
  YearDecisionsBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { INK, fmtPoints } from './yearGrid';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// « Décisions » table of the annual carnet (spec 2026-09-06 §4.1): one row
// per period (roman numeral, Moyenne on 10, Coefficient = sum of the subject
// coefficients), then the Moyenne Générale row (sum of the graded periods).
export function render({
  block,
  config,
  data,
}: {
  block: YearDecisionsBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const year = data.year;
  if (!year || year.terms.length === 0) return null;
  const cell: React.CSSProperties = {
    border: `1px solid ${INK}`,
    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
    color: INK,
    fontSize: config.typography.tableBody,
  };
  const center: React.CSSProperties = { ...cell, textAlign: 'center' };
  return (
    <div>
      <div
        className="mb-2 font-bold underline"
        style={{ color: INK, fontSize: config.typography.tableBody + 1 }}
      >
        {block.title ?? 'Décisions'}
      </div>
      <table
        className="w-full border-collapse"
        style={{ lineHeight: config.layout.tableLineHeight }}
      >
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Contrôle</th>
            <th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Moyenne</th>
            <th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Coefficient</th>
          </tr>
        </thead>
        <tbody>
          {year.terms.map((t, i) => (
            <tr key={t.termId}>
              <td style={{ ...cell, fontWeight: 700 }}>{ROMAN[i] ?? String(i + 1)}</td>
              <td style={center}>{fmtPoints(t.average10)}</td>
              <td style={center}>{t.hasGrades ? String(t.coefficientSum) : ''}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }}>Moyenne Générale</td>
            <td style={{ ...center, fontWeight: 700 }}>{fmtPoints(year.generalAverage)}</td>
            <td style={{ ...center, fontWeight: 700 }}>
              {year.generalAverage == null ? '' : String(year.generalCoefficient)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
