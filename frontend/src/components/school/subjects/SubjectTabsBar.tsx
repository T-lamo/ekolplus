'use client';

// Subject-page tabs (add-matiere.md) on top of the shared PageTabsBar.
// Compétences / Évaluations are deliberately absent (no screen selected yet —
// user decision 2026-08-17).
import { BookMarked, Info, Users } from 'lucide-react';
import { PageTabsBar, type PageTab } from '@/components/school/PageTabsBar';

export type SubjectTab = 'info' | 'programme' | 'affectations';

const TABS: readonly PageTab<SubjectTab>[] = [
  { key: 'info', label: 'Informations générales', Icon: Info },
  { key: 'programme', label: 'Programme annuel', Icon: BookMarked },
  { key: 'affectations', label: 'Affectations classes', Icon: Users },
];

export function SubjectTabsBar({
  active,
  onChange,
  counts,
  disabledTabs = [],
  disabledHint,
}: {
  active: SubjectTab;
  onChange: (tab: SubjectTab) => void;
  counts?: Partial<Record<SubjectTab, number>>;
  disabledTabs?: SubjectTab[];
  disabledHint?: string;
}) {
  return (
    <PageTabsBar
      tabs={TABS}
      active={active}
      onChange={onChange}
      {...(counts ? { counts } : {})}
      disabledTabs={disabledTabs}
      {...(disabledHint ? { disabledHint } : {})}
    />
  );
}
