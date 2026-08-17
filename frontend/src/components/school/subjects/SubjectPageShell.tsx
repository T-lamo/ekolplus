'use client';

// Shared chrome of the subject pages (add-matiere.md / programme-annuel.md /
// affectations-classes.md): white sub-header bled to the content edges
// (« ← Retour » · icon chip · title/meta · actions), the tabs bar, the page
// body, and a sticky white footer. The (school) layout's <main> owns the
// padding, hence the negative margins that mirror it exactly.
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { getSubjectVisual } from '@/lib/subject-visuals';
import {
  SUBJECT_STATUS_LABEL,
  type SubjectStatus,
} from '@/app/(school)/configuration/matieres/subject-form.constants';
import { SubjectTabsBar, type SubjectTab } from './SubjectTabsBar';

const BLEED_X = '-mx-4 sm:-mx-6 lg:-mx-7';

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
      <header className={`${BLEED_X} -mt-5 border-b border-border bg-card sm:-mt-6 lg:-mt-7`}>
        <div className="flex flex-col gap-3 px-4 pt-3 pb-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/configuration/matieres"
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-[7px] text-caption font-medium text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft size={15} />
              Retour
            </Link>
            <div className="flex min-w-0 items-center gap-2.5">
              {visual && (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                  style={{ background: visual.iconBg, color: visual.iconFg }}
                >
                  <visual.Icon size={18} />
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-[17px] leading-tight font-bold text-foreground">
                  {mode === 'create' ? 'Ajouter une matière' : (subject?.name ?? '…')}
                </div>
                <div className="truncate text-xs text-muted-foreground">{meta}</div>
              </div>
            </div>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
          )}
        </div>
        <SubjectTabsBar
          active={activeTab}
          onChange={onTabChange}
          {...(counts ? { counts } : {})}
          disabledTabs={mode === 'create' ? ['programme', 'affectations'] : []}
          disabledHint="Enregistre la matière pour continuer"
        />
      </header>

      <div className="flex flex-1 flex-col pt-5">{children}</div>
    </div>
  );
}

/**
 * White footer bar (`.form-footer` / `.page-footer`), rendered by each tab as
 * its last child. Sits in the normal flow at the end of the content (pushed
 * to the bottom when the tab is short) — deliberately not sticky, so nothing
 * slides underneath it while scrolling. `left` = status line, `right` =
 * action buttons.
 */
export function SubjectPageFooter({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <footer
      className={`${BLEED_X} mt-auto -mb-5 flex flex-col gap-2 border-t border-border bg-card px-4 py-3 sm:-mb-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mb-7`}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{left}</div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">{right}</div>
    </footer>
  );
}
