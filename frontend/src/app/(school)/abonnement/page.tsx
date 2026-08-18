'use client';

// /abonnement — Compte › Abonnement. Own screen since 2026-08-18 (was the
// « Abonnement » tab of /settings; next.config.ts redirects the old deep
// links). Wide column: 3 plan cards + billing table side by side. Suspense
// because the screen reads `?plan=` (deep link from the sidebar plan card).
import { Suspense } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { AbonnementScreen } from '@/components/school/billing/AbonnementScreen';

export default function AbonnementPage() {
  const user = useUser();
  if (!user) return null;
  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <Suspense fallback={null}>
        <AbonnementScreen />
      </Suspense>
    </div>
  );
}
