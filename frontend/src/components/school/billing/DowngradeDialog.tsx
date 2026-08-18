'use client';

// « Rétrograder vers Starter » — the one place a Pro school schedules its
// downgrade (PATCH cancelAtPeriodEnd:true). Lists every consequence before
// the button, in plain words: effective date (end of the paid period), no
// refund / no further invoice, the 50-student cap coming back (with the
// school's own headcount), data + modules kept (no locking), resume possible
// until the date. Confirmation = destructive-outline button; the primary
// action of the dialog is to KEEP Pro.
import { CalendarClock, Database, RotateCcw, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PLAN_LABELS, PLAN_STUDENT_HARD_LIMIT, type BillingSummary } from '@/lib/billing-plans';
import { fmtDateLong } from './billing-format';

export function DowngradeDialog({
  billing,
  busy,
  onConfirm,
  onClose,
}: {
  billing: BillingSummary;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cap = PLAN_STUDENT_HARD_LIMIT.STARTER ?? 50;
  const n = billing.studentCount;
  const over = n > cap;
  const date = fmtDateLong(billing.renewsAt);
  const trial = billing.status === 'TRIAL';

  const rows: { icon: React.ReactNode; title: string; body: string }[] = [
    {
      icon: <CalendarClock size={15} />,
      title: `Prend effet le ${date}`,
      body: trial
        ? 'À la fin de votre période d’essai — aucune facture ne sera émise.'
        : 'À la fin de la période déjà payée. Aucun remboursement, plus aucune facture ensuite.',
    },
    {
      icon: <Users size={15} />,
      title: over
        ? `Vos ${n} élèves restent, mais plus d’inscriptions au-delà de ${cap}`
        : `Le plafond de ${cap} élèves s’appliquera de nouveau`,
      body: over
        ? `Starter est limité à ${cap} élèves : les ${n} fiches existantes restent accessibles et modifiables, mais aucune nouvelle inscription tant que vous dépassez ${cap}.`
        : `Vous en avez ${n} aujourd’hui — vous pourrez encore en inscrire ${Math.max(cap - n, 0)}.`,
    },
    {
      icon: <Database size={15} />,
      title: 'Données et modules conservés',
      body: 'Élèves, notes, bulletins, présences, frais, emploi du temps : rien n’est verrouillé ni supprimé.',
    },
    {
      icon: <Wallet size={15} />,
      title: 'Factures et reçus toujours disponibles',
      body: 'L’historique reste consultable ici et dans l’espace Stripe.',
    },
    {
      icon: <RotateCcw size={15} />,
      title: `Reprise possible jusqu’au ${date}`,
      body: `Changez d’avis d’ici là : un clic sur « Reprendre ${PLAN_LABELS.PRO} » annule la rétrogradation sans nouvelle facture.`,
    },
  ];

  return (
    <Modal
      title={`Rétrograder vers ${PLAN_LABELS.STARTER}`}
      subtitle={`Votre plan ${PLAN_LABELS.PRO} reste actif jusqu’au ${date}`}
      onClose={onClose}
      medium
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-destructive-foreground/30 text-destructive-foreground hover:bg-destructive sm:w-fit"
            onClick={onConfirm}
            loading={busy}
            data-testid="downgrade-confirm"
          >
            Rétrograder à la fin de la période
          </Button>
          <Button
            type="button"
            variant="gold"
            size="sm"
            className="w-full sm:w-fit"
            onClick={onClose}
            disabled={busy}
          >
            Garder {PLAN_LABELS.PRO}
          </Button>
        </div>
      }
    >
      <p className="text-caption text-foreground">
        Voici exactement ce qui se passera si vous confirmez :
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {r.icon}
            </span>
            <div>
              <div className="text-caption font-semibold text-foreground">{r.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{r.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
