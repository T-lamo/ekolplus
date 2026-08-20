// Translated presentation of the billing catalogue (billing-plans.ts) — the
// plan name and feature bullets shown on the SchoolPlanCard sidebar and the
// Abonnement screens. billing-plans.ts itself keeps PLAN_LABELS/PLAN_FEATURES
// as plain French constants: the public landing page (pricing-section.tsx)
// is not part of the app's i18n surface and still reads them directly.
import type { PlanKey } from './billing-plans';

export type PlanLabelT = (key: 'STARTER' | 'PRO' | 'ENTERPRISE') => string;

export function planLabel(plan: PlanKey, t: PlanLabelT): string {
  return t(plan);
}

export interface PlanFeatureItem {
  label: string;
  included: boolean;
}

type FeatureIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type PlanFeatureT = (key: `${PlanKey}.f${FeatureIndex}`) => string;

const FEATURE_INCLUDED: Record<PlanKey, boolean[]> = {
  STARTER: [true, true, true, true, true, false, false],
  PRO: [true, true, true, true, true, true, true],
  ENTERPRISE: [true, true, true, true, true, true, true],
};

export function planFeatures(plan: PlanKey, t: PlanFeatureT): PlanFeatureItem[] {
  return FEATURE_INCLUDED[plan].map((included, i) => ({
    included,
    label: t(`${plan}.f${(i + 1) as FeatureIndex}`),
  }));
}
