'use client';

import { useState } from 'react';
import {
  LayoutTemplate,
  CheckCircle2,
  Globe,
  User,
  Lock,
  Copy,
  Pencil,
  Trash2,
  Edit2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePermissions } from '@/lib/usePermissions';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Card } from '@/components/ui/Card';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { LOCALE_BCP47 } from '@/lib/locales';
import type { TemplateListData, TemplateRow } from './types';

function TemplateCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-[170px] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="mt-3.5 flex items-center justify-between">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
      </div>
    </Card>
  );
}

const SAMPLE_ROWS = [
  { subject: 'Mathématiques', avg: 15.67, tone: 'good' as const },
  { subject: 'Français', avg: 12.0, tone: 'mid' as const },
  { subject: 'Sciences', avg: 18.0, tone: 'good' as const },
  { subject: 'Anglais', avg: 10.0, tone: 'low' as const },
];
const TONE_COLOR: Record<'good' | 'mid' | 'low', string> = {
  good: '#1a9e5c',
  mid: '#f59e0b',
  low: '#d93025',
};

export default function BulletinTemplatesPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const t = useTranslations('Configuration.modeleBulletin');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [tab, setTab] = useState<'personal' | 'global'>('personal');

  const {
    data,
    error: dataErr,
    mutate: setData,
  } = useApi<TemplateListData>('/api/school/bulletin-templates', {
    skip: !user,
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
        router.replace('/');
        return true;
      }
    },
  });
  const error = dataErr ? t('loadError') : null;

  const { canSee } = usePermissions();
  if (!canSee('configuration')) return <AccessDenied />;

  async function fork(id: string) {
    try {
      const res = await api<{ template: { id: string } }>(
        `/api/school/bulletin-templates/${id}/fork`,
        { method: 'POST' },
      );
      toast(t('toast.forked'), 'success');
      router.push(`/configuration/modele-bulletin/${res.template.id}/edit`);
    } catch {
      toast(t('toast.forkError'), 'error');
    }
  }

  async function setActive(id: string) {
    try {
      await api(`/api/school/bulletin-templates/${id}`, {
        method: 'PATCH',
        body: { isActive: true },
      });
      toast(t('toast.activated'), 'success');
      setData((d) => ({
        personal: (d?.personal ?? []).map((tpl) => ({ ...tpl, isActive: tpl.id === id })),
        global: d?.global ?? [],
      }));
    } catch {
      toast(t('toast.activateError'), 'error');
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ message: t('deleteConfirm'), danger: true }))) return;
    try {
      await api(`/api/school/bulletin-templates/${id}`, { method: 'DELETE' });
      toast(t('toast.deleted'), 'success');
      setData((d) => ({
        personal: (d?.personal ?? []).filter((tpl) => tpl.id !== id),
        global: d?.global ?? [],
      }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') {
        toast(err.message, 'error');
        return;
      }
      toast(t('toast.deleteError'), 'error');
    }
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (!data && !error) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3.5 w-80 max-w-full" />
          </div>
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
        <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
          <Skeleton className="h-7 w-28 rounded-md" />
          <Skeleton className="h-7 w-32 rounded-md" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <TemplateCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        {error}
      </p>
    );
  }

  const active = data.personal.find((t) => t.isActive);
  const rows = tab === 'personal' ? data.personal : data.global;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
          <HelpTooltip label={t('help.pageOverview')} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {active && (
        <Card className="flex-row items-center gap-3 bg-secondary p-4">
          <CheckCircle2 size={20} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="text-caption font-semibold text-primary">
                {t('activeCard.label', { name: active.name })}
              </div>
              <HelpTooltip label={t('help.activeTemplate')} />
            </div>
            <div className="mt-0.5 text-xs text-secondary-foreground opacity-85">
              {t('activeCard.description', {
                date: new Date(active.updatedAt).toLocaleDateString(bcp47, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
              })}
            </div>
          </div>
          <Link
            href={`/configuration/modele-bulletin/${active.id}/edit`}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
          >
            <Edit2 size={12} />
            {t('activeCard.edit')}
          </Link>
        </Card>
      )}

      <div role="tablist" className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'personal'}
          onClick={() => setTab('personal')}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-caption font-medium ${tab === 'personal' ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          <User size={13} />
          {t('tabs.personal')}
          <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-secondary px-1 text-2xs font-bold text-primary">
            {data.personal.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'global'}
          onClick={() => setTab('global')}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-caption font-medium ${tab === 'global' ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          <Globe size={13} />
          {t('tabs.global')}
          <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-secondary px-1 text-2xs font-bold text-primary">
            {data.global.length}
          </span>
        </button>
      </div>

      {tab === 'global' && (
        <div className="flex w-fit items-center gap-1.5 rounded-md bg-warning px-2.5 py-1.5 text-xs font-medium text-warning-foreground">
          {t('globalHint')}
        </div>
      )}

      {rows.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <LayoutTemplate size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {tab === 'personal' ? t('empty.personal') : t('empty.global')}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              isGlobal={tab === 'global'}
              onFork={() => fork(tpl.id)}
              onDelete={() => remove(tpl.id)}
              onSetActive={() => setActive(tpl.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  isGlobal,
  onFork,
  onDelete,
  onSetActive,
}: {
  template: TemplateRow;
  isGlobal: boolean;
  onFork: () => void;
  onDelete: () => void;
  onSetActive: () => void;
}) {
  const t = useTranslations('Configuration.modeleBulletin');
  const items: ActionMenuItem[] = isGlobal
    ? []
    : [
        ...(template.isActive
          ? []
          : [
              {
                label: t('menu.setActive'),
                icon: <CheckCircle2 size={13} />,
                onClick: onSetActive,
              },
            ]),
        {
          label: t('menu.fork'),
          icon: <Copy size={13} />,
          onClick: onFork,
        },
        {
          label: t('menu.delete'),
          icon: <Trash2 size={13} />,
          onClick: onDelete,
          tone: 'danger',
          divider: true,
        },
      ];

  return (
    <Card className="overflow-hidden">
      <div
        className="relative flex h-[170px] items-center justify-center"
        style={{ background: `${template.primaryColor}14` }}
      >
        <MiniBulletin color={template.primaryColor} />
        {template.isActive && (
          <span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
            <CheckCircle2 size={10} />
            {t('badge.active')}
          </span>
        )}
        {isGlobal && (
          <span
            className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold"
            style={{
              background: `${template.primaryColor}1a`,
              borderColor: `${template.primaryColor}55`,
              color: template.primaryColor,
            }}
          >
            <Globe size={10} />
            {t('badge.global')}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <div className="text-[15px] font-semibold text-foreground">{template.name}</div>
        <div className="text-xs leading-relaxed text-muted-foreground">{template.description}</div>
        <div className="mt-3.5 flex items-center justify-between">
          {isGlobal ? (
            <span
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: `${template.primaryColor}1a`, color: template.primaryColor }}
            >
              <Lock size={11} />
              {t('badge.predefined')}
            </span>
          ) : (
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${template.isActive ? 'bg-success text-success-foreground' : 'bg-secondary text-secondary-foreground'}`}
            >
              {template.isActive ? <CheckCircle2 size={11} /> : <LayoutTemplate size={11} />}
              {template.isActive ? t('badge.active') : t('badge.personal')}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {isGlobal ? (
              <button
                type="button"
                onClick={onFork}
                className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
              >
                <Copy size={12} className="text-primary" />
                {t('menu.fork')}
              </button>
            ) : (
              <Link
                href={`/configuration/modele-bulletin/${template.id}/edit`}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground"
              >
                <Pencil size={11} className="text-primary" />
                {t('editLink')}
              </Link>
            )}
            {!isGlobal && <ActionMenu items={items} />}
          </div>
        </div>
      </div>
    </Card>
  );
}

function MiniBulletin({ color }: { color: string }) {
  return (
    <div className="w-[87%] overflow-hidden rounded-[3px] bg-white text-[5px] shadow-lg">
      <div className="h-1" style={{ background: color }} />
      <div className="flex items-center justify-between border-b border-[#eee] px-1.5 py-1">
        <div className="flex items-center gap-1">
          <div
            className="flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border border-dashed"
            style={{ borderColor: color }}
          >
            <LayoutTemplate size={5} style={{ color }} />
          </div>
          <div className="text-[6px] font-extrabold" style={{ color }}>
            École LesÉtoiles
          </div>
        </div>
        <div className="flex-1 px-1 text-center text-[7px] font-extrabold text-[#1a1a2e]">
          BULLETIN SCOLAIRE
        </div>
        <div
          className="min-w-[46px] rounded-[2px] px-1 py-0.5"
          style={{ background: `${color}14` }}
        >
          <div className="text-[5.5px] font-bold text-[#1a1a2e]">JEAN-PIERRE M.</div>
          <div className="text-[4.5px] text-[#6b6b8d]">3ème A · N° 2024-0047</div>
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: color }}>
            <th className="p-0.5 text-left text-[4.5px] font-bold text-white">Matière</th>
            <th className="p-0.5 text-left text-[4.5px] font-bold text-white">Coeff.</th>
            <th className="p-0.5 text-left text-[4.5px] font-bold text-white">Moy.</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_ROWS.map((r, i) => (
            <tr key={r.subject} style={i % 2 === 1 ? { background: '#faf9ff' } : undefined}>
              <td className="p-0.5 text-[4.5px] text-[#1a1a2e]">{r.subject}</td>
              <td className="p-0.5 text-[4.5px] text-[#1a1a2e]">4</td>
              <td className="p-0.5 text-[4.5px] font-bold" style={{ color: TONE_COLOR[r.tone] }}>
                {r.avg.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-1.5 border-t border-[#eee] px-1.5 py-1">
        <div className="text-2xs font-extrabold" style={{ color }}>
          14.38
        </div>
        <div className="text-[4px] text-[#999]">Moyenne / Rang 4ème</div>
      </div>
      <div className="h-0.5" style={{ background: color }} />
    </div>
  );
}
