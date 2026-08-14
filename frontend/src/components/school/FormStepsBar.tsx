'use client';

// Banani's `.steps-bar` — the Add Teacher/Add Student mockups render a
// single scrollable page whose "steps" are really section anchors, so this
// implements them as clickable anchors with the active section highlighted.
// Shared by the two form pages (add-teacher.md / add-student.md).

import { Check } from 'lucide-react';

export interface FormStep {
  id: string;
  label: string;
}

export function FormStepsBar({ steps, activeId }: { steps: FormStep[]; activeId: string }) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === activeId),
  );
  return (
    <div className="mb-5 flex items-center gap-0 overflow-x-auto rounded-lg border border-border bg-card px-4 py-3.5 sm:px-5">
      {steps.map((step, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={step.id} className="flex shrink-0 items-center">
            {i > 0 && (
              <div
                className={`mx-3 h-px w-8 shrink-0 sm:mx-4 sm:w-14 ${done || active ? 'bg-primary' : 'bg-border'}`}
              />
            )}
            <a
              href={`#${step.id}`}
              className="flex shrink-0 items-center gap-2"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  done || active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {done ? <Check size={12} /> : i + 1}
              </span>
              <span
                className={`text-[13px] whitespace-nowrap ${
                  active
                    ? 'font-semibold text-primary'
                    : done
                      ? 'font-medium text-foreground'
                      : 'font-medium text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </a>
          </div>
        );
      })}
    </div>
  );
}
