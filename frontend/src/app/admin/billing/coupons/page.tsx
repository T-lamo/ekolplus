'use client';

// /admin/billing/coupons — Coupons & Codes Promo (Banani zNn8It52QEEh).
// Plan: .planning/banani/admin-coupons.md. The mockup's inline creation form
// becomes a Modal (consistent with the rest of the app); statuses are always
// server-derived so they can't drift. The mockup's school-restriction select
// is deferred (the API accepts schoolId, no UI consumer yet).

import { useCallback, useEffect, useState } from 'react';
import { Copy, Download, Gift, Percent, Plus, Tag, Ticket, Wallet } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { ADMIN_COUPONS as T, ADMIN_SAAS } from '@/lib/constants';
import { couponDiscountLabel, fmtDateMed, fmtUsdRound } from '@/lib/admin-format';
import { exportToCsv } from '@/lib/csv-export';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Modal } from '@/components/ui/Modal';
import { Pager } from '@/components/ui/Pager';
import { Select, SelectItem as FormSelectItem } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SkeletonFilters, SkeletonStatCards, SkeletonTable } from '@/components/ui/Skeleton';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { CouponStatusBadge, PlanBadge } from '@/components/admin/badges';

type CouponType = 'PERCENT' | 'FIXED' | 'FREE_MONTH';
type CouponDisplayStatus = 'ACTIVE' | 'EXPIRING' | 'EXHAUSTED' | 'EXPIRED' | 'INACTIVE';

interface CouponRow {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  durationMonths: number | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
  description: string | null;
  plan: { key: string; name: string } | null;
  school: { id: string; name: string } | null;
  attachedSubscriptions: number;
  status: CouponDisplayStatus;
}

interface CouponsResponse {
  items: CouponRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    activeCount: number;
    totalUses: number;
    monthlyDiscountCents: number;
    expiredCount: number;
  };
}

const TH_CLASS =
  'px-3 py-2 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase';
const TD_CLASS = 'px-3 py-2.5 text-[13px] whitespace-nowrap';

type ModalState =
  | { kind: 'none' }
  | { kind: 'form'; mode: 'create' | 'edit' | 'duplicate'; coupon?: CouponRow }
  | { kind: 'delete'; coupon: CouponRow };

export default function AdminCouponsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CouponsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (type) params.set('type', type);
    if (plan) params.set('plan', plan);
    params.set('page', String(page));
    try {
      setData(await api<CouponsResponse>(`/api/admin/billing/coupons?${params.toString()}`));
    } catch {
      setError(T.loadError);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, type, plan, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, type, plan]);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast(T.copied, 'success');
    } catch {
      // Clipboard unavailable (insecure context) — silently skip.
    }
  }

  async function toggleActive(c: CouponRow) {
    try {
      await api(`/api/admin/billing/coupons/${c.id}`, {
        method: 'PATCH',
        body: { active: !c.active },
      });
      toast(c.active ? T.toggled.disabled : T.toggled.enabled, 'success');
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : T.loadError, 'error');
    }
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      'coupons.csv',
      [
        T.columns.code,
        T.columns.type,
        T.columns.discount,
        T.columns.plan,
        T.columns.uses,
        T.columns.limit,
        T.columns.expiry,
        T.columns.status,
      ],
      data.items.map((c) => [
        c.code,
        T.typeLabels[c.type] ?? c.type,
        couponDiscountLabel(c.type, c.value),
        c.plan?.name ?? T.allPlans,
        c.usedCount,
        c.maxUses ?? T.unlimited,
        c.expiresAt ? fmtDateMed(c.expiresAt) : T.noExpiry,
        ADMIN_SAAS.couponStatus[c.status],
      ]),
    );
  }

  const stats = data?.stats;

  return (
    <div className="w-full">
      <AdminPageHeader
        title={T.title}
        subtitle={T.subtitle}
        actions={
          <>
            <Button variant="outline" className="sm:w-auto" onClick={onExport} disabled={!data}>
              <Download size={14} />
              {T.export}
            </Button>
            <Button
              className="sm:w-auto"
              onClick={() => setModal({ kind: 'form', mode: 'create' })}
            >
              <Plus size={14} />
              {T.createCoupon}
            </Button>
          </>
        }
      />

      <div className="flex min-h-full flex-col gap-4">
        {stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={T.kpi.active}
              value={String(stats.activeCount)}
              icon={<Ticket size={15} />}
              deltaTone="muted"
              sub={undefined}
            />
            <StatCard
              label={T.kpi.totalUses}
              value={String(stats.totalUses)}
              icon={<Tag size={15} />}
              deltaTone="muted"
              sub={undefined}
            />
            <StatCard
              label={T.kpi.monthlyDiscount}
              value={fmtUsdRound(stats.monthlyDiscountCents)}
              icon={<Wallet size={15} />}
              deltaTone="muted"
              sub={T.kpi.monthlyDiscountSub}
            />
            <StatCard
              label={T.kpi.expired}
              value={String(stats.expiredCount)}
              icon={<Percent size={15} />}
              deltaTone="muted"
              sub={T.kpi.expiredSub}
            />
          </div>
        ) : (
          <SkeletonStatCards count={4} />
        )}

        {data || !loading ? (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput
              placeholder={T.filters.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-[300px]"
            />
            <FilterSelect value={type} onValueChange={setType} className="min-w-36">
              <SelectItem value="">{T.filters.allTypes}</SelectItem>
              {(['PERCENT', 'FIXED', 'FREE_MONTH'] as const).map((t) => (
                <SelectItem key={t} value={t}>
                  {T.typeLabels[t]}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={plan} onValueChange={setPlan} className="min-w-36">
              <SelectItem value="">{T.filters.allPlans}</SelectItem>
              <SelectItem value="STARTER">Starter</SelectItem>
              <SelectItem value="PRO">Établissement Pro</SelectItem>
              <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
            </FilterSelect>
          </div>
        ) : (
          <SkeletonFilters />
        )}

        <Card className="flex-1">
          {data && (
            <div className="border-b border-border px-4 py-3.5">
              <h2 className="text-sm font-bold text-foreground">{T.list.title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {T.list.subtitle(data.total, data.stats.activeCount, data.stats.expiredCount)}
              </p>
            </div>
          )}
          {error ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button className="w-auto" onClick={() => void load()}>
                {T.retry}
              </Button>
            </div>
          ) : loading || !data ? (
            <SkeletonTable rows={6} cols={7} />
          ) : data.items.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{T.empty}</p>
          ) : (
            <>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={TH_CLASS}>{T.columns.code}</th>
                      <th className={TH_CLASS}>{T.columns.type}</th>
                      <th className={TH_CLASS}>{T.columns.discount}</th>
                      <th className={TH_CLASS}>{T.columns.plan}</th>
                      <th className={TH_CLASS}>{T.columns.uses}</th>
                      <th className={TH_CLASS}>{T.columns.limit}</th>
                      <th className={TH_CLASS}>{T.columns.expiry}</th>
                      <th className={TH_CLASS}>{T.columns.status}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/50">
                        <td className={TD_CLASS}>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs font-bold text-primary">
                              {c.code}
                            </span>
                            <button
                              type="button"
                              aria-label={`Copier ${c.code}`}
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => void copyCode(c.code)}
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {T.typeLabels[c.type] ?? c.type}
                        </td>
                        <td className={`${TD_CLASS} font-semibold text-foreground`}>
                          {couponDiscountLabel(c.type, c.value)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {c.type === 'FREE_MONTH'
                              ? T.free
                              : c.durationMonths
                                ? T.perMonths(c.durationMonths)
                                : T.permanent}
                          </span>
                        </td>
                        <td className={TD_CLASS}>
                          {c.plan ? (
                            <PlanBadge planKey={c.plan.key} name={c.plan.name} />
                          ) : (
                            <span className="text-muted-foreground">{T.allPlans}</span>
                          )}
                        </td>
                        <td className={TD_CLASS}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{c.usedCount}</span>
                            {c.maxUses !== null && (
                              <span
                                className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-valuenow={c.usedCount}
                                aria-valuemin={0}
                                aria-valuemax={c.maxUses}
                              >
                                <span
                                  className="block h-full rounded-full bg-primary"
                                  style={{
                                    width: `${Math.min(100, Math.round((c.usedCount / c.maxUses) * 100))}%`,
                                  }}
                                />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {c.maxUses !== null ? T.maxUses(c.maxUses) : T.unlimited}
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {c.expiresAt ? fmtDateMed(c.expiresAt) : T.noExpiry}
                        </td>
                        <td className={TD_CLASS}>
                          <CouponStatusBadge status={c.status} />
                        </td>
                        <td className={`${TD_CLASS} text-right`}>
                          <div className="flex justify-end">
                            <ActionMenu
                              items={[
                                {
                                  label: T.actions.edit,
                                  onClick: () =>
                                    setModal({ kind: 'form', mode: 'edit', coupon: c }),
                                },
                                {
                                  label: T.actions.duplicate,
                                  onClick: () =>
                                    setModal({ kind: 'form', mode: 'duplicate', coupon: c }),
                                },
                                {
                                  label: c.active ? T.actions.disable : T.actions.enable,
                                  onClick: () => void toggleActive(c),
                                },
                                {
                                  label: T.actions.delete,
                                  tone: 'danger',
                                  divider: true,
                                  onClick: () => setModal({ kind: 'delete', coupon: c }),
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onChange={setPage}
                itemsLabel={T.pagerLabel}
                shownCount={data.items.length}
              />
            </>
          )}
        </Card>
      </div>

      {modal.kind === 'form' && (
        <FormModal
          mode={modal.mode}
          coupon={modal.coupon}
          onClose={() => setModal({ kind: 'none' })}
          onDone={(msg) => {
            setModal({ kind: 'none' });
            toast(msg, 'success');
            void load();
          }}
        />
      )}
      {modal.kind === 'delete' && (
        <DeleteModal
          coupon={modal.coupon}
          onClose={() => setModal({ kind: 'none' })}
          onDone={() => {
            setModal({ kind: 'none' });
            toast(T.deleteModal.done, 'success');
            void load();
          }}
        />
      )}
    </div>
  );
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

const TYPE_ICONS: Record<CouponType, React.ReactNode> = {
  PERCENT: <Percent size={16} />,
  FIXED: <Wallet size={16} />,
  FREE_MONTH: <Gift size={16} />,
};

function FormModal({
  mode,
  coupon,
  onClose,
  onDone,
}: {
  mode: 'create' | 'edit' | 'duplicate';
  coupon?: CouponRow | undefined;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { toast } = useToast();
  const isEdit = mode === 'edit';
  const src = mode === 'create' ? undefined : coupon;
  const [type, setFormType] = useState<CouponType>(src?.type ?? 'PERCENT');
  const [code, setCode] = useState(isEdit ? (coupon?.code ?? '') : '');
  const [value, setValue] = useState(
    src ? (src.type === 'FIXED' ? String(src.value / 100) : String(src.value)) : '',
  );
  const [duration, setDuration] = useState(src?.durationMonths ? String(src.durationMonths) : '');
  const [planKey, setPlanKey] = useState(src?.plan?.key ?? '');
  const [maxUses, setMaxUses] = useState(src?.maxUses ? String(src.maxUses) : '');
  const [expiresAt, setExpiresAt] = useState(src?.expiresAt ? src.expiresAt.slice(0, 10) : '');
  const [description, setDescription] = useState(src?.description ?? '');
  const [busy, setBusy] = useState(false);

  const valueLabel =
    type === 'PERCENT'
      ? T.formModal.valuePercent
      : type === 'FIXED'
        ? T.formModal.valueFixed
        : T.formModal.valueFreeMonths;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = Number.parseFloat(value.replace(',', '.'));
    const intValue = type === 'FIXED' ? Math.round(raw * 100) : Math.round(raw);
    if (!Number.isFinite(intValue) || intValue <= 0 || (type === 'PERCENT' && intValue > 100)) {
      toast(valueLabel, 'error');
      return;
    }
    const shared = {
      type,
      value: intValue,
      durationMonths: type !== 'FREE_MONTH' && duration ? Number.parseInt(duration, 10) : null,
      planKey: planKey || null,
      maxUses: maxUses ? Number.parseInt(maxUses, 10) : null,
      expiresAt: expiresAt || null,
      description: description.trim() || null,
    };
    setBusy(true);
    try {
      if (isEdit && coupon) {
        await api(`/api/admin/billing/coupons/${coupon.id}`, { method: 'PATCH', body: shared });
        onDone(T.formModal.updated);
      } else {
        await api('/api/admin/billing/coupons', {
          method: 'POST',
          body: { ...shared, code: code.trim().toUpperCase() },
        });
        onDone(T.formModal.created);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError && err.code === 'CODE_TAKEN'
          ? T.formModal.codeTaken
          : err instanceof ApiError
            ? err.message
            : T.loadError;
      toast(msg, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title={isEdit ? T.formModal.titleEdit : T.formModal.titleCreate} onClose={onClose}>
      <p className="mb-3 text-xs text-muted-foreground">{T.formModal.subtitle}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-foreground">
            {T.formModal.typeLabel}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(['PERCENT', 'FIXED', 'FREE_MONTH'] as const).map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors ${
                  type === t
                    ? 'border-primary bg-secondary'
                    : 'border-border bg-background hover:border-primary/40'
                }`}
              >
                <input
                  type="radio"
                  name="couponType"
                  value={t}
                  checked={type === t}
                  onChange={() => setFormType(t)}
                  className="sr-only"
                />
                <span
                  className={`flex items-center gap-1.5 text-[13px] font-semibold ${type === t ? 'text-primary' : 'text-foreground'}`}
                >
                  {TYPE_ICONS[t]}
                  {T.formModal.types[t].label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {T.formModal.types[t].example}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {!isEdit && (
          <div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field
                  label={T.formModal.code}
                  name="code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoComplete="off"
                  className="font-mono uppercase"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-auto shrink-0"
                onClick={() => setCode(randomCode())}
              >
                {T.formModal.generate}
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{T.formModal.codeHint}</p>
          </div>
        )}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field
            label={valueLabel}
            name="value"
            inputMode="decimal"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {type !== 'FREE_MONTH' && (
            <div>
              <Field
                label={T.formModal.duration}
                name="duration"
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">{T.formModal.durationHint}</p>
            </div>
          )}
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select label={T.formModal.plan} value={planKey} onValueChange={setPlanKey}>
            <FormSelectItem value="">{T.allPlans}</FormSelectItem>
            <FormSelectItem value="STARTER">Starter</FormSelectItem>
            <FormSelectItem value="PRO">Établissement Pro</FormSelectItem>
            <FormSelectItem value="ENTERPRISE">Enterprise</FormSelectItem>
          </Select>
          <div>
            <Field
              label={T.formModal.maxUses}
              name="maxUses"
              inputMode="numeric"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{T.formModal.maxUsesHint}</p>
          </div>
        </div>

        <DateField
          label={T.formModal.expiresAt}
          name="expiresAt"
          value={expiresAt}
          onChange={setExpiresAt}
        />
        <Field
          label={T.formModal.description}
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoComplete="off"
        />

        <div className="mt-1 flex gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>
            {T.formModal.cancel}
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? T.formModal.saving : T.formModal.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteModal({
  coupon,
  onClose,
  onDone,
}: {
  coupon: CouponRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const inUse = coupon.attachedSubscriptions > 0;

  async function onDelete() {
    setBusy(true);
    try {
      await api(`/api/admin/billing/coupons/${coupon.id}`, { method: 'DELETE' });
      onDone();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.code === 'COUPON_IN_USE'
          ? T.deleteModal.inUse
          : err instanceof ApiError
            ? err.message
            : T.loadError;
      toast(msg, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title={T.deleteModal.title} onClose={onClose}>
      <p className="text-sm text-foreground">{T.deleteModal.body(coupon.code)}</p>
      {inUse && (
        <p className="mt-2 text-sm font-medium text-destructive-foreground">
          {T.deleteModal.inUse}
        </p>
      )}
      <div className="mt-4 flex gap-2.5">
        <Button variant="outline" onClick={onClose}>
          {T.deleteModal.cancel}
        </Button>
        <Button
          loading={busy}
          disabled={inUse}
          className="bg-destructive-foreground hover:bg-destructive-foreground/90"
          onClick={() => void onDelete()}
        >
          {T.deleteModal.confirm}
        </Button>
      </div>
    </Modal>
  );
}
