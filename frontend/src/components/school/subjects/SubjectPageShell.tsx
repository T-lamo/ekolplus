'use client';

// Shared chrome of the subject pages (add-matiere.md / programme-annuel.md /
// affectations-classes.md): a white header card (« ← Retour » · icon chip ·
// title/meta · actions + the tabs bar) inside the page padding — like every
// other page title in the app, not flush against the sidebar/topbar — then
// the page body. Tabs render their own footer card at the end.
import type { ReactNode } from 'react';
import { PageHeaderCard } from '@/components/school/PageHeaderCard';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { getSubjectVisual } from '@/lib/subject-visuals';
import {
  SUBJECT_STATUS_LABEL,
  type SubjectStatus,
} from '@/app/(school)/configuration/matieres/subject-form.constants';
import { SubjectTabsBar, type SubjectTab } from './SubjectTabsBar';

export const STATUS_TONE: Record<SubjectStatus, BadgeTone> = {
  ACTIVE: 'success',
  DRAFT: 'muted',
  ARCHIVED: 'warning',
};

export function SubjectStatusBadge({
  status,
  className,
}: {
  status: SubjectStatus;
  className?: string;
}) {
  return (
    <Badge tone={STATUS_TONE[status]} {...(className ? { className } : {})}>
      {SUBJECT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function SubjectPageShell({
  mode,
  subject,
  yearLabel,
  activeTab,
  onTabChange,
  counts,
  actions,
  children,
}: {
  mode: 'create' | 'edit';
  subject?: {
    name: string;
    code: string | null;
    domain: string | null;
    defaultCoefficient: number | null;
    icon: string | null;
    color: string | null;
  } | null;
  yearLabel: string | null;
  activeTab: SubjectTab;
  onTabChange: (tab: SubjectTab) => void;
  counts?: Partial<Record<SubjectTab, number>>;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const visual = subject
    ? getSubjectVisual(subject.name, { icon: subject.icon, color: subject.color })
    : null;
  const meta =
    mode === 'create'
      ? `Nouvelle matière${yearLabel ? ` — Année scolaire ${yearLabel}` : ''}`
      : [
          subject?.code,
          subject?.domain,
          subject?.defaultCoefficient != null ? `Coeff. ${subject.defaultCoefficient}` : null,
          yearLabel ? `Année ${yearLabel}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div className="flex min-h-full flex-col">
      <PageHeaderCard
        backHref="/configuration/matieres"
        chip={
          visual ? (
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              style={{ background: visual.iconBg, color: visual.iconFg }}
            >
              <visual.Icon size={18} />
            </div>
          ) : undefined
        }
        title={mode === 'create' ? 'Ajouter une matière' : (subject?.name ?? '…')}
        meta={meta}
        actions={actions}
        tabs={
          <SubjectTabsBar
            active={activeTab}
            onChange={onTabChange}
            {...(counts ? { counts } : {})}
            disabledTabs={mode === 'create' ? ['programme', 'affectations'] : []}
            disabledHint="Enregistre la matière pour continuer"
          />
        }
      />

      <div className="flex flex-1 flex-col pt-4">{children}</div>
    </div>
  );
}

/**
 * White footer card (`.form-footer` / `.page-footer`), rendered by each tab as
 * its last child. Sits in the normal flow at the end of the content (pushed
 * to the bottom when the tab is short) — deliberately not sticky, so nothing
 * slides underneath it while scrolling. `left` = status line, `right` =
 * action buttons.
 */
export function SubjectPageFooter({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <footer className="mt-auto flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{left}</div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">{right}</div>
    </footer>
  );
}
