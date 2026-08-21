'use client';

// /admin/schools — Écoles clientes (Banani 72UpLW9LHCiI).
// Plan: .planning/banani/schools-management.md. Server-side filters +
// page-based pagination; row actions: profil / modifier / gérer
// l'abonnement / suspendre-réactiver / supprimer (type-to-confirm,
// SUPERADMIN). "Accéder à l'école" et "Réinitialiser mdp" restent des stubs
// honnêtes (impersonation + flow email non câblés — décision OVERVIEW).

import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CreditCard,
  Eye,
  FileSpreadsheet,
  KeyRound,
  LogIn,
  Pause,
  Pencil,
  Play,
  Plus,
  School as SchoolIcon,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { AdminSchoolRow } from '@/lib/admin-types';
import { ADMIN_CREATE_SCHOOL as TC, ADMIN_SAAS, ADMIN_SCHOOLS as T } from '@/lib/constants';
import { fmtDateMed, fmtRelativeDay, fmtUsd, fmtUsdRound } from '@/lib/admin-format';
import { exportToCsv } from '@/lib/csv-export';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Pager } from '@/components/ui/Pager';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select, SelectItem as FormSelectItem } from '@/components/ui/Select';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { SkeletonFilters, SkeletonStatCards, SkeletonTable } from '@/components/ui/Skeleton';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { CreateSchoolModal } from '@/components/admin/CreateSchoolModal';
import { StatCard } from '@/components/admin/StatCard';
import { PlanBadge, SubscriptionStatusBadge } from '@/components/admin/badges';

interface SchoolsResponse {
  items: AdminSchoolRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    totalSchools: number;
    schoolsDeltaMonth: number;
    activeSubscriptions: number;
    pendingOrSuspended: number;
    totalStudents: number;
    studentsDeltaMonth: number;
    monthRevenueCents: number;
    revenueDeltaPct: number | null;
  };
  countries: string[];
}

const FLAGS: Record<string, string> = {
  haiti: '🇭🇹',
  haïti: '🇭🇹',
  martinique: '🇲🇶',
  guadeloupe: '🇬🇵',
  senegal: '🇸🇳',
  sénégal: '🇸🇳',
  cameroun: '🇨🇲',
  france: '🇫🇷',
  canada: '🇨🇦',
  'république dominicaine': '🇩🇴',
};

function countryFlag(country: string): string | null {
  return FLAGS[country.trim().toLowerCase()] ?? null;
}

const TH_CLASS =
  'px-3 py-2 text-left text-2xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase';
const TD_CLASS = 'px-3 py-2.5 text-caption whitespace-nowrap';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'profile'; school: AdminSchoolRow }
  | { kind: 'edit'; school: AdminSchoolRow }
  | { kind: 'suspend'; school: AdminSchoolRow }
  | { kind: 'delete'; school: AdminSchoolRow };

export default function AdminSchoolsPage() {
  return (
    <Suspense fallback={null}>
      <SchoolsPage />
    </Suspense>
  );
}

function SchoolsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SchoolsResponse | null>(null);
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
    if (plan) params.set('plan', plan);
    if (status) params.set('status', status);
    if (country) params.set('country', country);
    params.set('page', String(page));
    try {
      const res = await api<SchoolsResponse>(`/api/admin/schools?${params.toString()}`);
      setData(res);
    } catch {
      setError(T.loadError);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, plan, status, country, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any filter change restarts from page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, plan, status, country]);

  function onExport() {
    if (!data) return;
    exportToCsv(
      'ecoles.csv',
      [
        T.columns.school,
        'Pays',
        'Ville',
        T.columns.plan,
        T.columns.status,
        T.columns.students,
        T.columns.revenue,
        T.columns.owner,
        T.columns.createdAt,
      ],
      data.items.map((s) => [
        s.name,
        s.country,
        s.city,
        s.plan?.name ?? '—',
        ADMIN_SAAS.subscriptionStatus[s.status],
        String(s.students),
        s.monthlyCents !== null ? fmtUsd(s.monthlyCents) : '—',
        s.ownerName,
        fmtDateMed(s.createdAt),
      ]),
    );
  }

  function rowActions(s: AdminSchoolRow): ActionMenuItem[] {
    const items: ActionMenuItem[] = [
      {
        label: T.actions.viewProfile,
        icon: <Eye size={14} />,
        onClick: () => setModal({ kind: 'profile', school: s }),
      },
      { label: T.actions.accessSchool, icon: <LogIn size={14} />, onClick: () => toast(T.stub) },
      {
        label: T.actions.edit,
        icon: <Pencil size={14} />,
        onClick: () => setModal({ kind: 'edit', school: s }),
      },
      {
        label: T.actions.manageSubscription,
        icon: <CreditCard size={14} />,
        onClick: () =>
          router.push(`/admin/billing/subscriptions?school=${encodeURIComponent(s.name)}`),
      },
      {
        label: T.actions.resetPassword,
        icon: <KeyRound size={14} />,
        onClick: () => toast(T.stub),
      },
    ];
    if (s.status === 'SUSPENDED') {
      items.push({
        label: T.actions.reactivate,
        icon: <Play size={14} />,
        onClick: () => setModal({ kind: 'suspend', school: s }),
        divider: true,
      });
    } else if (s.status !== 'NONE') {
      items.push({
        label: T.actions.suspend,
        icon: <Pause size={14} />,
        onClick: () => setModal({ kind: 'suspend', school: s }),
        tone: 'danger',
        divider: true,
      });
    }
    if (user?.role === 'SUPERADMIN') {
      items.push({
        label: T.actions.delete,
        icon: <Trash2 size={14} />,
        onClick: () => setModal({ kind: 'delete', school: s }),
        tone: 'danger',
      });
    }
    return items;
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
              <FileSpreadsheet size={14} />
              {T.exportCsv}
            </Button>
            <Button className="sm:w-auto" onClick={() => setModal({ kind: 'create' })}>
              <Plus size={14} />
              {T.createSchool}
            </Button>
          </>
        }
      />

      <div className="flex min-h-full flex-col gap-4">
        {stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={T.kpi.totalSchools}
              value={String(stats.totalSchools)}
              icon={<SchoolIcon size={15} />}
              delta={`+${stats.schoolsDeltaMonth}`}
              sub={T.kpi.thisMonth}
            />
            <StatCard
              label={T.kpi.activeSubscriptions}
              value={String(stats.activeSubscriptions)}
              icon={<CreditCard size={15} />}
              deltaTone="muted"
              sub={T.kpi.pendingOrSuspended(stats.pendingOrSuspended)}
            />
            <StatCard
              label={T.kpi.totalStudents}
              value={stats.totalStudents.toLocaleString('fr-FR')}
              icon={<Users size={15} />}
              delta={`+${stats.studentsDeltaMonth}`}
              sub={T.kpi.thisMonth}
            />
            <StatCard
              label={T.kpi.monthRevenue}
              value={fmtUsdRound(stats.monthRevenueCents)}
              icon={<Wallet size={15} />}
              delta={
                stats.revenueDeltaPct !== null
                  ? `${stats.revenueDeltaPct >= 0 ? '+' : ''}${stats.revenueDeltaPct}%`
                  : undefined
              }
              deltaTone={
                stats.revenueDeltaPct !== null && stats.revenueDeltaPct < 0
                  ? 'destructive'
                  : 'success'
              }
              sub={stats.revenueDeltaPct !== null ? T.kpi.vsLastMonth : undefined}
            />
          </div>
        ) : (
          <SkeletonStatCards count={4} />
        )}

        {/* Filter bar */}
        {data || !loading ? (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput
              placeholder={T.filters.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-[280px]"
            />
            <FilterSelect value={plan} onValueChange={setPlan} className="min-w-36">
              <SelectItem value="">{T.filters.allPlans}</SelectItem>
              <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
              <SelectItem value="PRO">Établissement Pro</SelectItem>
              <SelectItem value="STARTER">Starter</SelectItem>
            </FilterSelect>
            <FilterSelect value={status} onValueChange={setStatus} className="min-w-36">
              <SelectItem value="">{T.filters.allStatuses}</SelectItem>
              <SelectItem value="ACTIVE">{ADMIN_SAAS.subscriptionStatus.ACTIVE}</SelectItem>
              <SelectItem value="TRIAL">{ADMIN_SAAS.subscriptionStatus.TRIAL}</SelectItem>
              <SelectItem value="EXPIRED">{ADMIN_SAAS.subscriptionStatus.EXPIRED}</SelectItem>
              <SelectItem value="SUSPENDED">{ADMIN_SAAS.subscriptionStatus.SUSPENDED}</SelectItem>
              <SelectItem value="NONE">{ADMIN_SAAS.subscriptionStatus.NONE}</SelectItem>
            </FilterSelect>
            <FilterSelect value={country} onValueChange={setCountry} className="min-w-36">
              <SelectItem value="">{T.filters.allCountries}</SelectItem>
              {(data?.countries ?? []).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </FilterSelect>
            {data && (
              <span className="text-xs text-muted-foreground sm:ml-auto">
                {T.filters.results(data.total)}
              </span>
            )}
          </div>
        ) : (
          <SkeletonFilters />
        )}

        {/* Table */}
        <Card className="flex-1">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button className="w-auto" onClick={() => void load()}>
                {T.retry}
              </Button>
            </div>
          ) : loading || !data ? (
            <SkeletonTable rows={8} cols={7} />
          ) : data.items.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {data.total === 0 && !debouncedSearch && !plan && !status && !country
                ? T.emptyNoSchools
                : T.empty}
            </p>
          ) : (
            <>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={TH_CLASS}>{T.columns.school}</th>
                      <th className={TH_CLASS}>{T.columns.plan}</th>
                      <th className={TH_CLASS}>{T.columns.status}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.students}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.revenue}</th>
                      <th className={TH_CLASS}>{T.columns.owner}</th>
                      <th className={TH_CLASS}>{T.columns.createdAt}</th>
                      <th className={TH_CLASS}>{T.columns.lastAccess}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/50">
                        <td className={TD_CLASS}>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={s.name} size={32} />
                            <div className="min-w-0">
                              <div className="max-w-[240px] truncate font-semibold text-foreground">
                                {s.name}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                {countryFlag(s.country) ? `${countryFlag(s.country)} ` : ''}
                                {s.city}, {s.country}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={TD_CLASS}>
                          {s.plan ? <PlanBadge planKey={s.plan.key} name={s.plan.name} /> : '—'}
                        </td>
                        <td className={TD_CLASS}>
                          <SubscriptionStatusBadge
                            status={s.status}
                            expiringSoon={s.expiringSoon}
                          />
                        </td>
                        <td className={`${TD_CLASS} text-right font-semibold text-foreground`}>
                          {s.students}
                        </td>
                        <td className={`${TD_CLASS} text-right font-semibold text-foreground`}>
                          {s.monthlyCents !== null ? fmtUsd(s.monthlyCents) : '$0.00'}
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>{s.ownerName}</td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {fmtDateMed(s.createdAt)}
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {fmtRelativeDay(s.lastAccessAt)}
                        </td>
                        <td className={`${TD_CLASS} text-right`}>
                          <div className="flex justify-end">
                            <ActionMenu items={rowActions(s)} />
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

      {modal.kind === 'create' && (
        <CreateSchoolModal
          onClose={() => setModal({ kind: 'none' })}
          onCreated={() => {
            setModal({ kind: 'none' });
            void load();
          }}
        />
      )}
      {modal.kind === 'profile' && (
        <ProfileModal school={modal.school} onClose={() => setModal({ kind: 'none' })} />
      )}
      {modal.kind === 'edit' && (
        <EditModal
          school={modal.school}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            toast(T.editModal.saved, 'success');
            void load();
          }}
        />
      )}
      {modal.kind === 'suspend' && (
        <SuspendModal
          school={modal.school}
          onClose={() => setModal({ kind: 'none' })}
          onDone={(reactivated) => {
            setModal({ kind: 'none' });
            toast(
              reactivated ? T.suspendModal.doneReactivate : T.suspendModal.doneSuspend,
              'success',
            );
            void load();
          }}
        />
      )}
      {modal.kind === 'delete' && (
        <DeleteModal
          school={modal.school}
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

function ProfileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-caption font-semibold text-foreground">{children}</span>
    </div>
  );
}

function ProfileModal({ school, onClose }: { school: AdminSchoolRow; onClose: () => void }) {
  return (
    <Modal title={T.profileModal.title} onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={school.name} size={40} />
        <div>
          <div className="text-sm font-bold text-foreground">{school.name}</div>
          <div className="text-xs text-muted-foreground">
            {school.city}, {school.country}
          </div>
        </div>
      </div>
      <div className="divide-y divide-border">
        <ProfileRow label={T.profileModal.owner}>{school.ownerName}</ProfileRow>
        <ProfileRow label={T.profileModal.code}>{school.officialCode ?? '—'}</ProfileRow>
        <ProfileRow label={T.profileModal.plan}>{school.plan?.name ?? '—'}</ProfileRow>
        <ProfileRow label={T.profileModal.status}>
          <SubscriptionStatusBadge status={school.status} expiringSoon={school.expiringSoon} />
        </ProfileRow>
        <ProfileRow label={T.profileModal.students}>{school.students}</ProfileRow>
        <ProfileRow label={T.profileModal.users}>{school.users}</ProfileRow>
        <ProfileRow label={T.profileModal.revenue}>
          {school.monthlyCents !== null ? fmtUsd(school.monthlyCents) : '—'}
        </ProfileRow>
        <ProfileRow label={T.profileModal.renewal}>
          {school.renewsAt ? fmtDateMed(school.renewsAt) : '—'}
        </ProfileRow>
        <ProfileRow label={T.profileModal.createdAt}>{fmtDateMed(school.createdAt)}</ProfileRow>
        <ProfileRow label={T.profileModal.lastAccess}>
          {fmtRelativeDay(school.lastAccessAt)}
        </ProfileRow>
      </div>
      <Button variant="outline" className="mt-4" onClick={onClose}>
        {T.profileModal.close}
      </Button>
    </Modal>
  );
}

// Full editable profile — same surface as the creation form's school
// section (CreateSchoolModal) plus the admin-only officialCode/officialEmail.
interface SchoolDetail {
  id: string;
  name: string;
  shortName: string | null;
  country: string;
  city: string;
  schoolType: string;
  primaryLanguage: string | null;
  address: string | null;
  phone: string | null;
  estimatedStudents: number | null;
  officialCode: string | null;
  officialEmail: string | null;
  logoUrl: string | null;
}

function EditModal({
  school,
  onClose,
  onSaved,
}: {
  school: AdminSchoolRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<{
    logoUrl: string | null;
    name: string;
    shortName: string;
    country: string;
    city: string;
    schoolType: string;
    primaryLanguage: string;
    address: string;
    phone: string;
    estimatedStudents: string;
    officialCode: string;
    officialEmail: string;
  } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ school: SchoolDetail }>(`/api/admin/schools/${school.id}`)
      .then(({ school: d }) => {
        if (cancelled) return;
        setForm({
          logoUrl: d.logoUrl,
          name: d.name,
          shortName: d.shortName ?? '',
          country: d.country,
          city: d.city,
          schoolType: d.schoolType,
          primaryLanguage: d.primaryLanguage ?? '',
          address: d.address ?? '',
          phone: d.phone ?? '',
          estimatedStudents: d.estimatedStudents !== null ? String(d.estimatedStudents) : '',
          officialCode: d.officialCode ?? '',
          officialEmail: d.officialEmail ?? '',
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [school.id]);

  function patch(p: Partial<NonNullable<typeof form>>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const students = form.estimatedStudents.trim();
    const estimatedStudents = students === '' ? null : Number.parseInt(students, 10);
    if (
      estimatedStudents !== null &&
      (!Number.isInteger(estimatedStudents) || estimatedStudents < 0)
    ) {
      toast(TC.schoolSection.estimatedStudents, 'error');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/admin/schools/${school.id}`, {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          shortName: form.shortName.trim() || null,
          country: form.country.trim(),
          city: form.city.trim(),
          schoolType: form.schoolType,
          primaryLanguage: form.primaryLanguage.trim() || null,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          estimatedStudents,
          officialCode: form.officialCode.trim() || null,
          officialEmail: form.officialEmail.trim() || null,
          logoUrl: form.logoUrl,
        },
      });
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : T.loadError, 'error');
      setSaving(false);
    }
  }

  // The catalog is free-form in DB — keep the stored value selectable even
  // if it's not in the current creation catalog.
  const schoolTypes =
    form && !TC.schoolTypes.includes(form.schoolType as (typeof TC.schoolTypes)[number])
      ? [form.schoolType, ...TC.schoolTypes]
      : [...TC.schoolTypes];

  return (
    <Modal title={T.editModal.title} onClose={onClose} wide>
      {loadFailed ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-sm text-muted-foreground">{T.loadError}</p>
          <Button variant="outline" className="w-auto" onClick={onClose}>
            {T.editModal.cancel}
          </Button>
        </div>
      ) : !form ? (
        <div className="flex flex-col gap-3.5 py-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <ImageUploader
            label={TC.schoolSection.logo}
            hint={TC.schoolSection.logoHint}
            value={form.logoUrl}
            onChange={(url) => patch({ logoUrl: url })}
          />
          <Field
            label={T.editModal.name}
            name="name"
            required
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <div>
            <Field
              label={T.editModal.shortName}
              name="shortName"
              maxLength={10}
              value={form.shortName}
              onChange={(e) => patch({ shortName: e.target.value })}
            />
            <p className="mt-1 text-2xs text-muted-foreground">{TC.schoolSection.shortNameHint}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={T.editModal.country}
              name="country"
              required
              value={form.country}
              onChange={(e) => patch({ country: e.target.value })}
            />
            <Field
              label={T.editModal.city}
              name="city"
              required
              value={form.city}
              onChange={(e) => patch({ city: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label={TC.schoolSection.schoolType}
              value={form.schoolType}
              onValueChange={(v) => patch({ schoolType: v })}
            >
              {schoolTypes.map((t) => (
                <FormSelectItem key={t} value={t}>
                  {t}
                </FormSelectItem>
              ))}
            </Select>
            <Field
              label={TC.schoolSection.primaryLanguage}
              name="primaryLanguage"
              value={form.primaryLanguage}
              onChange={(e) => patch({ primaryLanguage: e.target.value })}
            />
          </div>
          <Field
            label={TC.schoolSection.address}
            name="address"
            placeholder={TC.schoolSection.addressPlaceholder}
            value={form.address}
            onChange={(e) => patch({ address: e.target.value })}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PhoneInput
              label={T.editModal.phone}
              value={form.phone}
              onChange={(v) => patch({ phone: v })}
            />
            <div>
              <Field
                label={TC.schoolSection.estimatedStudents}
                name="estimatedStudents"
                inputMode="numeric"
                value={form.estimatedStudents}
                onChange={(e) => patch({ estimatedStudents: e.target.value })}
              />
              <p className="mt-1 text-2xs text-muted-foreground">
                {TC.schoolSection.estimatedStudentsHint}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={T.editModal.officialEmail}
              name="officialEmail"
              type="email"
              value={form.officialEmail}
              onChange={(e) => patch({ officialEmail: e.target.value })}
            />
            <Field
              label={T.editModal.officialCode}
              name="officialCode"
              value={form.officialCode}
              onChange={(e) => patch({ officialCode: e.target.value })}
            />
          </div>
          <div className="mt-1 flex gap-2.5">
            <Button type="button" variant="outline" onClick={onClose}>
              {T.editModal.cancel}
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? T.editModal.saving : T.editModal.save}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function SuspendModal({
  school,
  onClose,
  onDone,
}: {
  school: AdminSchoolRow;
  onClose: () => void;
  onDone: (reactivated: boolean) => void;
}) {
  const { toast } = useToast();
  const reactivating = school.status === 'SUSPENDED';
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      await api(`/api/admin/schools/${school.id}`, {
        method: 'PATCH',
        body: { subscriptionStatus: reactivating ? 'ACTIVE' : 'SUSPENDED' },
      });
      onDone(reactivating);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : T.loadError, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={reactivating ? T.suspendModal.titleReactivate : T.suspendModal.titleSuspend}
      onClose={onClose}
    >
      <p className="text-sm text-muted-foreground">
        {reactivating
          ? T.suspendModal.bodyReactivate(school.name)
          : T.suspendModal.bodySuspend(school.name)}
      </p>
      <div className="mt-4 flex gap-2.5">
        <Button variant="outline" onClick={onClose}>
          {T.suspendModal.cancel}
        </Button>
        <Button
          loading={busy}
          className={
            reactivating ? '' : 'bg-destructive-foreground hover:bg-destructive-foreground/90'
          }
          onClick={() => void onConfirm()}
        >
          {reactivating ? T.suspendModal.confirmReactivate : T.suspendModal.confirmSuspend}
        </Button>
      </div>
    </Modal>
  );
}

function DeleteModal({
  school,
  onClose,
  onDone,
}: {
  school: AdminSchoolRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      await api(`/api/admin/schools/${school.id}`, {
        method: 'DELETE',
        body: { confirmName },
      });
      onDone();
    } catch (err) {
      toast(
        err instanceof ApiError && err.code === 'CONFIRM_NAME_MISMATCH'
          ? T.deleteModal.mismatch
          : err instanceof ApiError
            ? err.message
            : T.loadError,
        'error',
      );
      setBusy(false);
    }
  }

  return (
    <Modal title={T.deleteModal.title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-destructive-foreground">
        {T.deleteModal.warning(school.name)}
      </p>
      <div className="mt-4">
        <Field
          label={T.deleteModal.confirmLabel(school.name)}
          name="confirmName"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="mt-4 flex gap-2.5">
        <Button variant="outline" onClick={onClose}>
          {T.deleteModal.cancel}
        </Button>
        <Button
          loading={busy}
          disabled={confirmName.trim() !== school.name.trim()}
          className="bg-destructive-foreground hover:bg-destructive-foreground/90"
          onClick={() => void onConfirm()}
        >
          {T.deleteModal.confirm}
        </Button>
      </div>
    </Modal>
  );
}
