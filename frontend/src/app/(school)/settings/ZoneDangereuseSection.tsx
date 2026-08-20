'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('Settings.zoneDangereuse');
  const tCommon = useTranslations('Common');
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
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{warning}</p>
        <Field
          label={t('confirmFieldLabel', { schoolName })}
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
            {t('cancel')}
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
  const t = useTranslations('Settings.zoneDangereuse');
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
    toast(t('resetYear.success', { total }), 'success');
    setOpenModal(null);
  }

  async function onDeleteSchool() {
    await api('/api/school', { method: 'DELETE', body: { confirmName: schoolName } });
    toast(t('deleteSchool.success'), 'success');
    setOpenModal(null);
    await logout();
    router.replace('/login');
  }

  return (
    <>
      <Card className="border-destructive-foreground/30">
        <div className="flex items-center justify-between gap-3 border-b border-destructive-foreground/30 bg-destructive px-5 py-3.5">
          <div>
            <h2 className="text-caption font-bold text-destructive-foreground">{t('title')}</h2>
            <p className="text-2xs text-muted-foreground">{t('subtitle')}</p>
          </div>
          <AlertTriangle size={18} className="shrink-0 text-destructive-foreground" />
        </div>
        <div className="flex flex-col divide-y divide-border">
          <DangerItem
            title={t('export.title')}
            desc={t('export.desc')}
            action={
              <a
                href="/api/school/export"
                className="flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium text-foreground"
              >
                <Download size={12} />
                {t('export.action')}
              </a>
            }
          />
          <DangerItem
            title={t('resetYear.title')}
            desc={t('resetYear.desc')}
            action={
              <Button
                type="button"
                className={`w-fit gap-1.5 ${WARNING_BTN}`}
                onClick={() => setOpenModal('reset')}
              >
                <RotateCcw size={12} />
                {t('resetYear.action')}
              </Button>
            }
          />
          <DangerItem
            title={t('deleteSchool.title')}
            desc={t('deleteSchool.desc')}
            action={
              <Button
                type="button"
                className={`w-fit gap-1.5 ${DESTRUCTIVE_BTN}`}
                onClick={() => setOpenModal('delete')}
              >
                <Trash2 size={12} />
                {t('deleteSchool.action')}
              </Button>
            }
          />
        </div>
      </Card>

      {openModal === 'reset' && (
        <ConfirmNameModal
          title={t('resetYear.modalTitle')}
          warning={t('resetYear.warning')}
          schoolName={schoolName}
          confirmLabel={t('resetYear.confirmLabel')}
          confirmClassName={WARNING_BTN}
          onConfirm={onResetYear}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === 'delete' && (
        <ConfirmNameModal
          title={t('deleteSchool.modalTitle')}
          warning={t('deleteSchool.warning')}
          schoolName={schoolName}
          confirmLabel={t('deleteSchool.confirmLabel')}
          confirmClassName={DESTRUCTIVE_BTN}
          onConfirm={onDeleteSchool}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}
