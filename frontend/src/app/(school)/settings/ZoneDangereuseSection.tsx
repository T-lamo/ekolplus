'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, RotateCcw, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';

const DESTRUCTIVE_BTN = 'bg-destructive text-destructive-foreground hover:bg-destructive/90';
const WARNING_BTN = 'bg-warning text-warning-foreground hover:bg-warning/90';

function ConfirmNameModal({
  title,
  warning,
  schoolName,
  confirmLabel,
  confirmClassName,
  onConfirm,
  onClose,
}: {
  title: string;
  warning: string;
  schoolName: string;
  confirmLabel: string;
  confirmClassName: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = value.trim() === schoolName;

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{warning}</p>
        <Field
          label={`Tape « ${schoolName} » pour confirmer`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!matches}
            loading={submitting}
            className={`w-fit ${confirmClassName}`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DangerItem({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
      </div>
      <div className="shrink-0 sm:pl-4">{action}</div>
    </div>
  );
}

export function ZoneDangereuseSection({ schoolName }: { schoolName: string }) {
  const { toast } = useToast();
  const { logout } = useAuth();
  const router = useRouter();
  const [openModal, setOpenModal] = useState<'reset' | 'delete' | null>(null);

  async function onResetYear() {
    const res = await api<{ deleted: Record<string, number> }>('/api/school/reset-year', {
      method: 'POST',
      body: { confirmName: schoolName },
    });
    const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
    toast(`Année scolaire réinitialisée (${total} enregistrements supprimés).`, 'success');
    setOpenModal(null);
  }

  async function onDeleteSchool() {
    await api('/api/school', { method: 'DELETE', body: { confirmName: schoolName } });
    toast('Établissement supprimé.', 'success');
    setOpenModal(null);
    await logout();
    router.replace('/login');
  }

  return (
    <>
      <Card className="border-destructive-foreground/30">
        <div className="flex items-center justify-between gap-3 border-b border-destructive-foreground/30 bg-destructive px-5 py-3.5">
          <div>
            <h2 className="text-[13px] font-bold text-destructive-foreground">Zone dangereuse</h2>
            <p className="text-[11px] text-muted-foreground">
              Ces actions sont irréversibles. Procédez avec précaution.
            </p>
          </div>
          <AlertTriangle size={18} className="shrink-0 text-destructive-foreground" />
        </div>
        <div className="flex flex-col divide-y divide-border">
          <DangerItem
            title="Exporter toutes les données"
            desc="Télécharger un fichier ZIP complet avec tous les élèves, notes, bulletins et paramètres."
            action={
              <a
                href="/api/school/export"
                className="flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium text-foreground"
              >
                <Download size={12} />
                Exporter
              </a>
            }
          />
          <DangerItem
            title="Réinitialiser l'année scolaire"
            desc="Effacer toutes les notes et présences de l'année en cours. Les élèves et enseignants seront conservés."
            action={
              <Button
                type="button"
                className={`w-fit gap-1.5 ${WARNING_BTN}`}
                onClick={() => setOpenModal('reset')}
              >
                <RotateCcw size={12} />
                Réinitialiser
              </Button>
            }
          />
          <DangerItem
            title="Supprimer le compte de l'établissement"
            desc="Cette action supprimera définitivement toutes les données, élèves, enseignants, bulletins et paramètres. Aucune récupération possible."
            action={
              <Button
                type="button"
                className={`w-fit gap-1.5 ${DESTRUCTIVE_BTN}`}
                onClick={() => setOpenModal('delete')}
              >
                <Trash2 size={12} />
                Supprimer
              </Button>
            }
          />
        </div>
      </Card>

      {openModal === 'reset' && (
        <ConfirmNameModal
          title="Réinitialiser l'année scolaire"
          warning="Toutes les notes, évaluations, présences, objectifs et appréciations de l'année scolaire active seront supprimés définitivement. Les élèves, enseignants, classes et matières seront conservés. Cette action est irréversible."
          schoolName={schoolName}
          confirmLabel="Réinitialiser définitivement"
          confirmClassName={WARNING_BTN}
          onConfirm={onResetYear}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === 'delete' && (
        <ConfirmNameModal
          title="Supprimer l'établissement"
          warning="L'établissement et toutes ses données (élèves, enseignants, classes, notes, bulletins...) seront supprimés définitivement. Ton compte utilisateur restera actif mais perdra l'accès à cet établissement. Cette action est irréversible."
          schoolName={schoolName}
          confirmLabel="Supprimer définitivement"
          confirmClassName={DESTRUCTIVE_BTN}
          onConfirm={onDeleteSchool}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}
