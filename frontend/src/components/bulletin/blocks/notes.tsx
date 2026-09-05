import type {
  NotesBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { cellStyle, fmt, ordinal, scoreColor } from '../render-data';

export function render({
  config,
  data,
}: {
  block: NotesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <table className="w-full border-collapse" style={{ lineHeight: config.layout.tableLineHeight }}>
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
  );
}
