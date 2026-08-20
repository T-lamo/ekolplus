'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Tabs } from '@/components/ui/Tabs';

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
  const t = useTranslations('Fees.tabs');
  const tabs = (Object.keys(ROUTE_BY_TAB) as FeesTabKey[]).map((key) => ({
    key,
    label: t(key),
  }));
  return (
    <Tabs
      tabs={tabs}
      active={active}
      onChange={(key) => router.push(ROUTE_BY_TAB[key as FeesTabKey])}
    />
  );
}
