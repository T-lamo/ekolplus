'use client';

// Subject-page tabs (add-matiere.md) on top of the shared PageTabsBar.
// Compétences / Évaluations are deliberately absent (no screen selected yet —
// user decision 2026-08-17).
import { BookMarked, Info, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageTabsBar, type PageTab } from '@/components/school/PageTabsBar';

export type SubjectTab = 'info' | 'programme' | 'affectations';

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
  const t = useTranslations('Configuration.matieres.tabsBar');
  const TABS: readonly PageTab<SubjectTab>[] = [
    { key: 'info', label: t('info'), Icon: Info },
    { key: 'programme', label: t('programme'), Icon: BookMarked },
    { key: 'affectations', label: t('affectations'), Icon: Users },
  ];
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
