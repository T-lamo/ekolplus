'use client';

// Chrome of the fiche classe (add-class.md): the shared header card (← Retour ·
// chip in the class colour · title/meta · actions) with the four Banani tabs
// inside. The mock stacks the four cards under the first tab, so the tabs are
// **anchors**: click scrolls to the card, scrolling updates the active tab,
// and the badge turns ✓ when the section is complete.
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, Info, NotebookPen, School, UserCheck } from 'lucide-react';
import { PageHeaderCard } from '@/components/school/PageHeaderCard';
import { PageTabsBar, type PageTab } from '@/components/school/PageTabsBar';
import { tintOf } from '@/lib/subject-visuals';
import { CLASS_SECTION_IDS, type ClassSection } from './ClassForm';

const TABS: readonly PageTab<ClassSection>[] = [
  { key: 'info', label: 'Informations générales', Icon: Info },
  { key: 'prof', label: 'Professeur principal', Icon: UserCheck },
  { key: 'subjects', label: 'Matières', Icon: BookOpen },
  { key: 'notes', label: 'Notes & Évaluation', Icon: NotebookPen },
];

export function ClassPageShell({
  mode,
  name,
  color,
  meta,
  done,
  counts,
  actions,
  ready = true,
  children,
}: {
  mode: 'create' | 'edit';
  name: string;
  color: string | null;
  meta: string;
  done: readonly ClassSection[];
  /** False while the body is a skeleton — the scroll-spy attaches once true. */
  ready?: boolean;
  counts?: Partial<Record<ClassSection, number>>;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [active, setActive] = useState<ClassSection>('info');

  // Scroll-spy on the scrolling <main>: the active tab is the last section
  // whose top has passed the upper third of the viewport (the last one when
  // scrolled to the bottom), so every tab is reachable by scrolling.
  useEffect(() => {
    if (!ready) return;
    const sections = (Object.keys(CLASS_SECTION_IDS) as ClassSection[])
      .map((key) => ({ key, el: document.getElementById(CLASS_SECTION_IDS[key]) }))
      .filter((e): e is { key: ClassSection; el: HTMLElement } => e.el !== null);
    if (sections.length === 0) return;
    const scroller = sections[0]!.el.closest('main') ?? window;
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.35;
      const scrollEl = scroller instanceof Window ? document.documentElement : scroller;
      const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 2;
      let next: ClassSection = sections[0]!.key;
      if (atBottom) next = sections[sections.length - 1]!.key;
      else {
        for (const s of sections) {
          if (s.el.getBoundingClientRect().top <= line) next = s.key;
        }
      }
      setActive((prev) => (prev === next ? prev : next));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ready]);

  const goTo = (key: ClassSection) => {
    setActive(key);
    document
      .getElementById(CLASS_SECTION_IDS[key])
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const accent = color ?? 'var(--color-primary)';

  return (
    <div className="flex min-h-full flex-col">
      <PageHeaderCard
        backHref="/configuration/classes"
        chip={
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
            style={{ background: color ? tintOf(color) : 'var(--color-secondary)', color: accent }}
          >
            <School size={18} />
          </div>
        }
        title={mode === 'create' ? 'Ajouter une classe' : name || '…'}
        meta={meta}
        actions={actions}
        tabs={
          <PageTabsBar
            tabs={TABS}
            active={active}
            onChange={goTo}
            done={done}
            {...(counts ? { counts } : {})}
            ariaLabel="Sections de la fiche classe"
          />
        }
      />
      <div className="flex flex-1 flex-col pt-4">{children}</div>
    </div>
  );
}
