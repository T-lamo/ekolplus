import Link from 'next/link';
import { Check } from 'lucide-react';
import { Card } from '@/components/ui/Card';

// No billing/subscription model exists yet (schema has no Plan/Subscription
// table — see prisma/schema.prisma) — every school is on Starter by default.
// Shown as static info rather than faking a plan switcher or payment method
// UI; upgrades route to the landing page's contact form until a real billing
// flow is wired (same "flagged, not silently faked" precedent as
// NotificationsTab's unwired event types).
const STARTER_FEATURES = [
  'Gestion des élèves, enseignants et classes',
  'Carnet de notes et bulletins',
  'Suivi des présences',
  "Jusqu'à 1 établissement",
];

export function AbonnementTab() {
  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-caption font-bold text-foreground">Abonnement</h2>
        <p className="text-2xs text-muted-foreground">
          Ton forfait actuel et les options disponibles.
        </p>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted px-4 py-3">
          <div>
            <div className="text-sm font-bold text-foreground">Starter</div>
            <div className="text-xs text-muted-foreground">Gratuit</div>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-primary">
            Forfait actuel
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {STARTER_FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
              <Check size={14} className="shrink-0 text-success-foreground" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Besoin de plus de fonctionnalités ou de plusieurs établissements ?
          </p>
          <Link
            href="/#contact-demo"
            className="w-fit text-sm font-semibold text-primary hover:underline"
          >
            Passer à un forfait supérieur
          </Link>
        </div>
      </div>
    </Card>
  );
}
