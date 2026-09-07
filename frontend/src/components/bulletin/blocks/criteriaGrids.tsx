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

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

// `block.subjects` pins which grids this block prints and in which order,
// so a template can split them across columns deterministically (the livret
// puts Comportement + Développement physique left, Développement
// intellectuel right) instead of relying on column overflow. Without a list
// every grid prints in data order.
function selectSubjects<T extends { subjectName: string }>(all: T[], wanted: string[] | undefined) {
  if (!wanted || wanted.length === 0) return all;
  return wanted.flatMap((name) => {
    const key = fold(name);
    const hit = all.find((s) => fold(s.subjectName) === key);
    return hit ? [hit] : [];
  });
}

export function render({
  block,
  config,
  data,
}: {
  block: CriteriaGridsBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const subjects = selectSubjects(data.qualitativeSubjects, block.subjects);
  if (subjects.length === 0) return null;
  const grid = block.style === 'grid';
  const cellPadding = `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`;
  const cellBorder = grid ? { border: `1px solid ${INK}` } : {};
  const headClass = grid ? 'font-bold' : 'font-bold text-white';
  return (
    <div className="flex flex-col gap-3">
      {subjects.map((subject) => (
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
