'use client';

import { useRouter } from 'next/navigation';
import { Tabs } from '@/components/ui/Tabs';
import { FEES } from '@/lib/constants';

const ROUTE_BY_TAB = {
  paiements: '/scolarite/paiements',
  relances: '/scolarite/relances',
  configuration: '/scolarite/configuration',
} as const;

export type FeesTabKey = keyof typeof ROUTE_BY_TAB;

// `Tabs` is a pure key/onChange primitive (no routing) — this wraps it for
// Frais & Scolarité's 3 sibling routes, which the user confirmed should be
// real pages (not `?tab=` state) so each is independently linkable/back-
// button-able.
export function FeesTabs({ active }: { active: FeesTabKey }) {
  const router = useRouter();
  return (
    <Tabs
      tabs={Object.entries(FEES.tabs).map(([key, label]) => ({ key, label }))}
      active={active}
      onChange={(key) => router.push(ROUTE_BY_TAB[key as FeesTabKey])}
    />
  );
}
