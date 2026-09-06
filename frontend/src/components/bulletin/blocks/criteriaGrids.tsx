import type {
  CriteriaGridsBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// `style: 'grid'` reproduces a Word-style gridded table (spec §12, the
// livret): a thin border on every cell, a plain white header row without
// the "Critère" label and the subject name printed as typed. The default
// 'modern' look keeps the colored header row of the other templates.
const INK = '#1a1a2e';

export function render({
  block,
  config,
  data,
}: {
  block: CriteriaGridsBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  if (data.qualitativeSubjects.length === 0) return null;
  const grid = block.style === 'grid';
  const cellPadding = `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`;
  const cellBorder = grid ? { border: `1px solid ${INK}` } : {};
  const headClass = grid ? 'font-bold' : 'font-bold text-white';
  return (
    <div className="flex flex-col gap-3">
      {data.qualitativeSubjects.map((subject) => (
        <table
          key={subject.subjectName}
          className="w-full border-collapse"
          style={{ breakInside: 'avoid', lineHeight: config.layout.tableLineHeight }}
        >
          <caption
            className={
              grid ? 'mb-1.5 text-left font-bold' : 'mb-1 text-left font-extrabold uppercase'
            }
            style={{
              fontSize: config.typography.tableBody,
              color: grid ? INK : config.primaryColor,
            }}
          >
            {subject.subjectName}
          </caption>
          {block.showScaleHeader !== false && (
            <thead>
              <tr style={grid ? { color: INK } : { background: config.primaryColor }}>
                <th
                  className={`text-left ${headClass}`}
                  style={{
                    padding: cellPadding,
                    fontSize: config.typography.tableHeader,
                    ...cellBorder,
                  }}
                >
                  {grid ? '' : 'Critère'}
                </th>
                {subject.ratingScale.map((label) => (
                  <th
                    key={label}
                    className={`text-center ${headClass}`}
                    style={{
                      padding: cellPadding,
                      fontSize: config.typography.tableHeader,
                      ...cellBorder,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {subject.criteria.map((criterion) => (
              <tr key={criterion.label}>
                <td
                  style={{
                    padding: cellPadding,
                    fontSize: config.typography.tableBody,
                    ...cellBorder,
                  }}
                >
                  {criterion.label}
                </td>
                {subject.ratingScale.map((_, levelIndex) => (
                  <td
                    key={levelIndex}
                    className="text-center"
                    style={{
                      padding: cellPadding,
                      fontSize: config.typography.noteValue,
                      ...cellBorder,
                    }}
                  >
                    {criterion.level === levelIndex ? '✓' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}
