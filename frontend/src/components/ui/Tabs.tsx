'use client';

interface TabDef {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}

/** Horizontally-scrollable pill tabs — mobile-first (Banani's own vertical
 * left-nav-as-tabs pattern doesn't fit a phone width, see school-settings.md). */
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border pb-px">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex min-h-12 shrink-0 items-center border-b-2 px-3.5 text-sm font-semibold whitespace-nowrap ${
            active === tab.key
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
