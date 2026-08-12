'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Calendar, ChevronDown } from 'lucide-react';

const MOCK_YEARS = ['2025-2026', '2024-2025', '2023-2024'];

export function AcademicYearSelector() {
  const [selected, setSelected] = useState(MOCK_YEARS[0]!);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground sm:flex"
        >
          <Calendar size={13} className="text-muted-foreground" />
          {selected}
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-40 rounded-lg border border-border bg-card p-1 shadow-xl"
        >
          {MOCK_YEARS.map((year) => (
            <DropdownMenu.Item
              key={year}
              onSelect={() => setSelected(year)}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-secondary ${
                year === selected ? 'font-semibold text-primary' : 'text-foreground'
              }`}
            >
              {year}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
