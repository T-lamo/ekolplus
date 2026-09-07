import type {
  YearSignaturesBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { INK } from './yearGrid';

// « Signatures » box of the annual carnet (spec 2026-09-06 §4.1): a framed
// column with a rounded title box, then one « Direction » line and one
// « Les Parents » line per period, spread over the available height.
// BulletinPage gives this block the full column height (Task 6).
export function render({
  block,
  config,
  data,
}: {
  block: YearSignaturesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const year = data.year;
  if (!year || year.terms.length === 0) return null;
  const director = block.labels?.director ?? 'Direction';
  const guardian = block.labels?.guardian ?? 'Les Parents';
  const fontSize = config.typography.tableBody;
  const line = (label: string, bold: boolean) => (
    <div>
      <div className="border-b" style={{ borderColor: INK, minHeight: 22 }} />
      <div
        className="mt-0.5 text-center"
        style={{ color: INK, fontSize, fontWeight: bold ? 700 : 400 }}
      >
        {label}
      </div>
    </div>
  );
  return (
    <div className="flex h-full flex-col border px-3 py-3" style={{ borderColor: INK }}>
      <div
        className="mx-auto mb-3 rounded-lg border px-5 py-1.5 text-center font-bold"
        style={{ borderColor: INK, color: INK, fontSize: fontSize + 3 }}
      >
        {block.title ?? 'Signatures'}
      </div>
      <div className="flex flex-1 flex-col justify-around gap-4">
        {year.terms.map((t) => (
          <div key={t.termId} className="flex flex-col gap-3" data-term-id={t.termId}>
            {line(director, true)}
            {line(guardian, false)}
          </div>
        ))}
      </div>
    </div>
  );
}
