import { Card } from '@/components/ui/Card';
import type { MemberData } from './types';

export const ROLE_LABEL: Record<MemberData['role'], string> = {
  OWNER: 'Directeur / Directrice',
  ADMIN: 'Administrateur / Administratrice',
  MEMBER: 'Membre',
};

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// Read-only for V1 — add/remove is an invite flow, deferred (see
// school-settings.md).
export function AdministrateursTab({ members }: { members: MemberData[] }) {
  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-[13px] font-bold text-foreground">Administrateurs</h2>
        <p className="text-[11px] text-muted-foreground">
          Comptes ayant accès à l&apos;espace de gestion de l&apos;établissement.
        </p>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {m.name ?? m.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                {ROLE_LABEL[m.role]}
              </span>
              <span className="text-[10px] text-muted-foreground">Depuis le {fmt(m.joinedAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
