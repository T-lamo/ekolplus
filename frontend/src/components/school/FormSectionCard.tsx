'use client';

// Banani's `.section-card` — icon chip + title/subtitle header over a form
// section. Shared by the Add Teacher / Add Student pages (add-teacher.md /
// add-student.md); `id` is the FormStepsBar anchor target.

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export function FormSectionCard({
  id,
  icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5 border-b border-border pb-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
          {icon}
        </span>
        <div>
          <div className="text-sm font-bold text-foreground">{title}</div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      {children}
    </Card>
  );
}
