import type {
  CriteriaGridsBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

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
  return (
    <div className="flex flex-col gap-3">
      {data.qualitativeSubjects.map((subject) => (
        <table
          key={subject.subjectName}
          className="w-full border-collapse"
          style={{ breakInside: 'avoid', lineHeight: config.layout.tableLineHeight }}
        >
          <caption
            className="mb-1 text-left font-extrabold uppercase"
            style={{ fontSize: config.typography.tableBody, color: config.primaryColor }}
          >
            {subject.subjectName}
          </caption>
          {block.showScaleHeader !== false && (
            <thead>
              <tr style={{ background: config.primaryColor }}>
                <th
                  className="text-left font-bold text-white"
                  style={{
                    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                    fontSize: config.typography.tableHeader,
                  }}
                >
                  Critère
                </th>
                {subject.ratingScale.map((label) => (
                  <th
                    key={label}
                    className="text-center font-bold text-white"
                    style={{
                      padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                      fontSize: config.typography.tableHeader,
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
                    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                    fontSize: config.typography.tableBody,
                  }}
                >
                  {criterion.label}
                </td>
                {subject.ratingScale.map((_, levelIndex) => (
                  <td
                    key={levelIndex}
                    className="text-center"
                    style={{
                      padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                      fontSize: config.typography.noteValue,
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
