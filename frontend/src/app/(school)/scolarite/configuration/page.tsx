'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Pencil, Plus, Save, Split, Trash2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { getCache, useApi } from '@/lib/useApi';
import { usePermissions } from '@/lib/usePermissions';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { Field } from '@/components/ui/Field';
import { Select, SelectItem } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { ASIDE_GRID } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';
import { cn } from '@/lib/utils';
import { fmtMoney, fmtDateShort } from '@/lib/fees-format';
import { FeesTabs } from '@/components/school/fees/FeesTabs';
import {
  ClassFeeSummaryCard,
  filterClasses,
  type ClassFilter,
  type FeeClassOption,
} from './ClassFeePicker';
import { ClassDropdownSelector } from './ClassDropdownSelector';
import { TrancheFormModal, type TrancheFormValues } from './TrancheFormModal';

// Fixed 3-tone purple palette Banani uses for the tranche distribution bar +
// per-tranche accent color — cycles for classes with more than 3 tranches.
const TRANCHE_PALETTE = ['#6c2bd9', '#a855f7', '#c4b5fd'];
const TRANCHE_PALETTE_TEXT = ['#6c2bd9', '#a855f7', '#7c3aed'];

const CURRENCY_CODES = ['HTG', 'USD', 'XOF', 'XAF', 'EUR'] as const;

interface StructureResponse {
  class: { id: string; name: string };
  feeStructure: {
    id: string;
    totalAmount: number;
    registrationFee: number;
    tranches: {
      id: string;
      order: number;
      label: string;
      amount: number;
      dueDate: string;
      latePenaltyPercent: number | null;
      latePenaltyGraceDays: number | null;
    }[];
  } | null;
}

interface DraftTranche {
  key: string;
  label: string;
  amount: string;
  dueDate: string;
  latePenaltyPercent: string;
  latePenaltyGraceDays: string;
}

interface AutomationSettings {
  lateFeeEnabled: boolean;
  autoRemindersEnabled: boolean;
  currency: string;
}

function toDraft(
  tranches: NonNullable<StructureResponse['feeStructure']>['tranches'],
): DraftTranche[] {
  return tranches.map((tr) => ({
    key: tr.id,
    label: tr.label,
    amount: String(tr.amount),
    dueDate: tr.dueDate.slice(0, 10),
    latePenaltyPercent: tr.latePenaltyPercent == null ? '' : String(tr.latePenaltyPercent),
    latePenaltyGraceDays: tr.latePenaltyGraceDays == null ? '' : String(tr.latePenaltyGraceDays),
  }));
}

export default function PaymentConfigurationPage() {
  const user = useUser();
  const { toast } = useToast();
  const t = useTranslations('Fees.configuration');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [filter, setFilter] = useState<ClassFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState('0');
  const [registrationFee, setRegistrationFee] = useState('0');
  const [tranches, setTranches] = useState<DraftTranche[]>([]);
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [trancheModalOpen, setTrancheModalOpen] = useState(false);
  const [editingTrancheIndex, setEditingTrancheIndex] = useState<number | null>(null);

  const { data: classesData, refresh: refreshClassesList } = useApi<{
    classes: FeeClassOption[];
    academicYearLabel: string | null;
  }>('/api/school/fees/structures', {
    skip: !user,
    onError: () => setLoadError(t('loadClassesError')),
  });
  const classes = classesData?.classes ?? null;
  const academicYearLabel = classesData?.academicYearLabel ?? null;
  const error = loadError;

  const { data: automationData, mutate: mutateAutomation } = useApi<{
    settings: AutomationSettings;
  }>('/api/school/fees/automation-settings', { skip: !user });
  const automation = automationData?.settings ?? null;

  // Seed the initial class selection once, the first time the class list
  // loads — never again (a later `refreshClassesList()` after Save/Copy
  // must not silently jump the editor to a different class).
  const initialSelectionDone = useRef(false);
  useEffect(() => {
    if (!initialSelectionDone.current && classes && classes.length > 0) {
      initialSelectionDone.current = true;
      setSelectedId(classes[0]!.id);
    }
  }, [classes]);

  const structurePath = selectedId ? `/api/school/fees/structures/${selectedId}` : null;
  const { data: structure, refresh: refreshStructure } = useApi<StructureResponse>(
    structurePath ?? '',
    {
      skip: !structurePath,
      onError: () => toast(t('loadStructureError'), 'error'),
    },
  );
  function loadStructure(_classId: string) {
    void refreshStructure();
  }

  // `selectedId` is local state, not a URL param, so this component never
  // remounts when the user picks a different class — useApi's `data` can
  // still hold the PREVIOUS class's structure for one render while the new
  // fetch is in flight. Gate on `getCache(...) === structure` (only true
  // once the cache entry actually written for THIS path matches what we're
  // holding) so the draft fields never get seeded from another class's data.
  const seededForId = useRef<string | null>(null);
  useEffect(() => {
    if (
      structure &&
      structurePath &&
      getCache(structurePath) === structure &&
      seededForId.current !== selectedId
    ) {
      seededForId.current = selectedId;
      setTotalAmount(String(structure.feeStructure?.totalAmount ?? 0));
      setRegistrationFee(String(structure.feeStructure?.registrationFee ?? 0));
      setTranches(structure.feeStructure ? toDraft(structure.feeStructure.tranches) : []);
    }
  }, [structure, structurePath, selectedId]);

  const totalAmountNum = Number(totalAmount) || 0;
  const allocated = tranches.reduce((sum, tr) => sum + (Number(tr.amount) || 0), 0);
  const distributionPercent =
    totalAmountNum > 0 ? Math.round((allocated / totalAmountNum) * 100) : 0;

  function trancheAmountPercent(tr: DraftTranche): number {
    return totalAmountNum > 0 ? Math.round(((Number(tr.amount) || 0) / totalAmountNum) * 100) : 0;
  }

  function updateTranche(index: number, patch: Partial<DraftTranche>) {
    setTranches((prev) => prev.map((tr, i) => (i === index ? { ...tr, ...patch } : tr)));
  }
  function removeTranche(index: number) {
    setTranches((prev) => prev.filter((_, i) => i !== index));
  }

  function openAddTrancheModal() {
    setEditingTrancheIndex(null);
    setTrancheModalOpen(true);
  }
  function openEditTrancheModal(index: number) {
    setEditingTrancheIndex(index);
    setTrancheModalOpen(true);
  }
  function handleTrancheModalSave(values: TrancheFormValues) {
    if (editingTrancheIndex !== null) {
      updateTranche(editingTrancheIndex, values);
    } else {
      setTranches((prev) => [...prev, { key: `new-${Date.now()}`, ...values }]);
    }
  }

  async function patchAutomation(patch: Partial<AutomationSettings>) {
    if (!automation) return;
    const next = { ...automation, ...patch };
    mutateAutomation({ settings: next });
    try {
      await api('/api/school/fees/automation-settings', { method: 'PATCH', body: patch });
    } catch (err) {
      mutateAutomation({ settings: automation });
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function onSave() {
    if (!selectedId) return;
    if (tranches.length === 0) {
      toast(t('emptyClassPrompt'), 'error');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/school/fees/structures/${selectedId}`, {
        method: 'PUT',
        body: {
          totalAmount: totalAmountNum,
          registrationFee: Number(registrationFee) || 0,
          tranches: tranches.map((tr, i) => ({
            order: i + 1,
            label: tr.label,
            amount: Number(tr.amount) || 0,
            dueDate: tr.dueDate,
            latePenaltyPercent: tr.latePenaltyPercent === '' ? null : Number(tr.latePenaltyPercent),
            latePenaltyGraceDays:
              tr.latePenaltyGraceDays === '' ? null : Number(tr.latePenaltyGraceDays),
          })),
        },
      });
      toast(t('savedToast'), 'success');
      loadStructure(selectedId);
      refreshClassesList();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (!structure) return;
    setTotalAmount(String(structure.feeStructure?.totalAmount ?? 0));
    setRegistrationFee(String(structure.feeStructure?.registrationFee ?? 0));
    setTranches(structure.feeStructure ? toDraft(structure.feeStructure.tranches) : []);
  }

  async function onCopyFrom() {
    if (!selectedId || !copySourceId) return;
    setCopying(true);
    try {
      await api(`/api/school/fees/structures/${selectedId}/copy-from`, {
        method: 'POST',
        body: { sourceClassId: copySourceId },
      });
      toast(t('copiedToast'), 'success');
      setCopySourceId('');
      setCopyPickerOpen(false);
      loadStructure(selectedId);
      refreshClassesList();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    } finally {
      setCopying(false);
    }
  }

  const filteredClasses = useMemo(() => filterClasses(classes ?? [], filter), [classes, filter]);
  const copySources = useMemo(
    () => (classes ?? []).filter((c) => c.configured && c.id !== selectedId),
    [classes, selectedId],
  );

  const { canSee } = usePermissions();
  if (!canSee('paiements')) return <AccessDenied />;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  const selectedStudentCount = classes?.find((c) => c.id === selectedId)?.studentCount ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          <HelpTooltip label={t('help.pageOverview')} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      <FeesTabs active="configuration" />

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes === null && !error ? (
        <div className={ASIDE_GRID}>
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className={cn(ASIDE_GRID, 'items-start')}>
          {/* Panneau classes + paramètres globaux — à droite sur desktop (même
              largeur que la colonne droite de la fiche matière), en premier
              sur mobile pour choisir la classe avant l'éditeur. */}
          <div className="flex min-w-0 flex-col gap-4 lg:order-2">
            <ClassFeeSummaryCard
              classes={classes ?? []}
              filter={filter}
              onFilterChange={setFilter}
            />

            <ClassDropdownSelector
              classes={filteredClasses}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            <Card className="gap-3.5 p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                {t('globalSettingsTitle')}
              </h2>
              {!automation ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">
                          {t('latePenaltyToggle')}
                        </span>
                        <HelpTooltip label={t('help.latePenaltyToggle')} />
                      </div>
                      <div className="text-2xs text-muted-foreground">
                        {t('latePenaltyToggleDesc')}
                      </div>
                    </div>
                    <Switch
                      checked={automation.lateFeeEnabled}
                      onChange={(v) => patchAutomation({ lateFeeEnabled: v })}
                      label={t('latePenaltyToggle')}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">
                          {t('autoRemindersToggle')}
                        </span>
                        <HelpTooltip label={t('help.autoRemindersToggle')} />
                      </div>
                      <div className="text-2xs text-muted-foreground">
                        {t('autoRemindersToggleDesc')}
                      </div>
                    </div>
                    <Switch
                      checked={automation.autoRemindersEnabled}
                      onChange={(v) => patchAutomation({ autoRemindersEnabled: v })}
                      label={t('autoRemindersToggle')}
                    />
                  </div>
                  <div className="border-t border-border pt-3">
                    <Select
                      label={t('currencyLabel')}
                      value={automation.currency}
                      onValueChange={(v) => patchAutomation({ currency: v })}
                    >
                      {CURRENCY_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {t(`currencyOptions.${code}`)}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Éditeur de la classe sélectionnée */}
          <div className="flex min-w-0 flex-col gap-4 lg:order-1">
            {!selectedId ? (
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">{t('selectClassPrompt')}</p>
              </Card>
            ) : structure === null ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <>
                {/* En-tête en carte, comme la fiche matière : titre + statut à
                    gauche, actions à droite (passent à la ligne, alignées à
                    droite, quand la colonne est étroite). */}
                <Card className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[17px] font-bold tracking-tight text-foreground">
                        {t('configHeadingPrefix', { className: structure.class.name })}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-primary">
                        {t(
                          selectedStudentCount > 1
                            ? 'studentCountBadge.other'
                            : 'studentCountBadge.one',
                          { n: selectedStudentCount },
                        )}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${
                          structure.feeStructure
                            ? 'bg-success text-success-foreground'
                            : 'bg-warning text-warning-foreground'
                        }`}
                      >
                        {structure.feeStructure ? t('editorConfigured') : t('editorPending')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('editorSubtitle')}</p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {copySources.length > 0 && (
                      <Button
                        variant="outline"
                        className="w-fit"
                        onClick={() => setCopyPickerOpen((v) => !v)}
                      >
                        <Copy size={13} />
                        {t('copyFromClass')}
                      </Button>
                    )}
                    <Button variant="ghost" className="w-fit" onClick={onCancel}>
                      {t('cancel')}
                    </Button>
                    <Button className="w-fit" loading={saving} onClick={onSave}>
                      <Save size={13} />
                      {t('save')}
                    </Button>
                  </div>
                </Card>

                {copyPickerOpen && copySources.length > 0 && (
                  <Card className="flex-row flex-wrap items-end gap-2 p-3.5">
                    <div className="min-w-[220px] flex-1">
                      <Select
                        label={t('copyFromClass')}
                        value={copySourceId}
                        onValueChange={setCopySourceId}
                      >
                        <SelectItem value="">—</SelectItem>
                        {copySources.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      className="w-fit"
                      disabled={!copySourceId || copying}
                      loading={copying}
                      onClick={onCopyFrom}
                    >
                      <Copy size={13} />
                      {t('copyFromClass')}
                    </Button>
                  </Card>
                )}

                <Card className="gap-3.5 p-4">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Pencil size={13} className="text-primary" />
                    {t('generalInfoTitle')}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field
                      label={t('totalAmountLabel')}
                      type="number"
                      min={0}
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                    />
                    <Field
                      label={t('registrationFeeLabel')}
                      type="number"
                      min={0}
                      value={registrationFee}
                      onChange={(e) => setRegistrationFee(e.target.value)}
                    />
                    <Field
                      label={t('academicYearLabel')}
                      value={academicYearLabel ?? '—'}
                      disabled
                      readOnly
                    />
                  </div>
                </Card>

                <Card className="gap-3.5 p-4">
                  {tranches.length === 0 ? (
                    <div className="flex flex-col items-start gap-3">
                      <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                        <Split size={13} className="text-primary" />
                        {t('tranchesBuilderTitle')}
                      </h3>
                      <div className="flex w-full flex-col items-start gap-3 rounded-md border border-dashed border-border p-4">
                        <p className="text-sm text-muted-foreground">{t('emptyClassPrompt')}</p>
                        <Button variant="outline" className="w-fit" onClick={openAddTrancheModal}>
                          <Plus size={14} />
                          {t('addTranche')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                            <Split size={13} className="text-primary" />
                            {t('tranchesBuilderTitle')}
                          </h3>
                          <p className="mt-0.5 text-2xs text-muted-foreground">
                            {t(
                              tranches.length > 1
                                ? 'tranchesBuilderSubtitle.other'
                                : 'tranchesBuilderSubtitle.one',
                              {
                                total: fmtMoney(allocated, automation?.currency),
                                count: tranches.length,
                              },
                            )}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t('distributionPrefix')}{' '}
                          <span className="font-bold text-success-foreground">
                            {distributionPercent}%
                          </span>
                        </span>
                      </div>

                      <div>
                        <div className="flex h-[7px] w-full gap-0.5 overflow-hidden rounded-full">
                          {tranches.map((tr, i) => (
                            <div
                              key={tr.key}
                              style={{
                                flex: Math.max(trancheAmountPercent(tr), 1),
                                background: TRANCHE_PALETTE[i % TRANCHE_PALETTE.length],
                              }}
                              className="h-full first:rounded-l-full last:rounded-r-full"
                            />
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {tranches.map((tr, i) => (
                            <div
                              key={tr.key}
                              className="flex items-center gap-1 text-2xs text-muted-foreground"
                            >
                              <span
                                className="h-[9px] w-[9px] shrink-0 rounded-sm"
                                style={{ background: TRANCHE_PALETTE[i % TRANCHE_PALETTE.length] }}
                              />
                              {tr.label || t('trancheFallbackLabel', { n: i + 1 })} ·{' '}
                              {trancheAmountPercent(tr)}%
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        {tranches.map((tr, i) => {
                          const color = TRANCHE_PALETTE[i % TRANCHE_PALETTE.length];
                          const textColor = TRANCHE_PALETTE_TEXT[i % TRANCHE_PALETTE_TEXT.length];
                          const hasPenalty =
                            automation?.lateFeeEnabled && tr.latePenaltyPercent !== '';
                          return (
                            <div
                              key={tr.key}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3.5 py-2.5"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span
                                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white"
                                  style={{ background: color }}
                                >
                                  {i + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-1.5">
                                    <span className="truncate text-sm font-bold text-foreground">
                                      {tr.label || t('trancheFallbackLabel', { n: i + 1 })}
                                    </span>
                                    {hasPenalty && (
                                      <span className="text-2xs whitespace-nowrap text-muted-foreground">
                                        ·{' '}
                                        {tr.latePenaltyGraceDays === ''
                                          ? t('trancheLatePenaltySummaryNoGrace', {
                                              percent: Number(tr.latePenaltyPercent),
                                            })
                                          : t('trancheLatePenaltySummaryWithGrace', {
                                              percent: Number(tr.latePenaltyPercent),
                                              graceDays: Number(tr.latePenaltyGraceDays),
                                            })}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-2xs text-muted-foreground">
                                    {fmtDateShort(tr.dueDate, bcp47)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="text-sm font-bold" style={{ color: textColor }}>
                                  {fmtMoney(Number(tr.amount) || 0, automation?.currency)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {trancheAmountPercent(tr)}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openEditTrancheModal(i)}
                                  aria-label={t('editTranche')}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeTranche(i)}
                                  aria-label={t('deleteTrancheAria')}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-destructive-foreground hover:bg-muted"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <Button variant="outline" className="w-fit" onClick={openAddTrancheModal}>
                          <Plus size={14} />
                          {t('addTranche')}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {trancheModalOpen && (
        <TrancheFormModal
          tranche={editingTrancheIndex !== null ? (tranches[editingTrancheIndex] ?? null) : null}
          defaultLabel={t(
            tranches.length + 1 > 1 ? 'trancheDefaultLabel.other' : 'trancheDefaultLabel.one',
            { n: tranches.length + 1 },
          )}
          lateFeeEnabled={automation?.lateFeeEnabled ?? true}
          totalAmount={totalAmountNum}
          onClose={() => setTrancheModalOpen(false)}
          onSave={handleTrancheModalSave}
        />
      )}
    </div>
  );
}
