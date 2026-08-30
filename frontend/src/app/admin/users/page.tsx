'use client';

// /admin/users — Admin Users (Banani Znvh5ZdXvT5j).
// Plan: .planning/banani/admin-users.md. Cursor pagination (the existing
// GET /api/admin/users contract) driven through the shared Pager via a
// client-side cursor stack — the Pager only ever moves ±1 page. The mockup
// business roles (Directeur/Enseignant/Comptable) don't exist in the data
// model; we show the real org role (Propriétaire/Admin/Membre). Modifier /
// Réinitialiser mdp / Se connecter en tant que / Supprimer are honest stubs
// (PII edit, email flow and impersonation are deliberately not wired — see
// plan's Open questions).

import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  Eye,
  FileSpreadsheet,
  KeyRound,
  LogIn,
  Pause,
  Pencil,
  Play,
  Shield,
  Trash2,
  Users as UsersIcon,
  UserX,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { getCache, useApi } from '@/lib/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ADMIN_SAAS, ADMIN_USERS as T } from '@/lib/constants';
import { fmtDateMed, fmtRelativeWithTime } from '@/lib/admin-format';
import { exportToCsv } from '@/lib/csv-export';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Pager } from '@/components/ui/Pager';
import { Tabs } from '@/components/ui/Tabs';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { SkeletonFilters, SkeletonStatCards, SkeletonTable } from '@/components/ui/Skeleton';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { UserStatusBadge } from '@/components/admin/badges';
import { Badge } from '@/components/ui/Badge';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  orgRole: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
  school: { id: string; name: string } | null;
}

interface UsersResponse {
  items: UserRow[];
  nextCursor: string | null;
  total: number;
  stats: {
    totalUsers: number;
    usersDeltaMonth: number;
    activeUsers: number;
    activeUsersPct: number;
    schoolAdmins: number;
    suspendedUsers: number;
  };
  schools: { orgId: string; name: string }[];
}

const PAGE_SIZE = 20;

const TH_CLASS =
  'px-3 py-2 text-left text-2xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase';
const TD_CLASS = 'px-3 py-2.5 text-caption whitespace-nowrap';

type ModalState =
  | { kind: 'none' }
  | { kind: 'profile'; user: UserRow }
  | { kind: 'suspend'; user: UserRow };

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [org, setOrg] = useState('');
  const [orgRole, setOrgRole] = useState('');
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState('all');
  // cursors[i] = cursor that loads page i+1 (cursors[0] = null → first page).
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveStatus = tab === 'all' ? status : tab;

  const usersParams = new URLSearchParams();
  if (debouncedSearch) usersParams.set('q', debouncedSearch);
  if (effectiveStatus) usersParams.set('status', effectiveStatus);
  if (org) usersParams.set('org', org);
  if (orgRole) usersParams.set('orgRole', orgRole);
  usersParams.set('limit', String(PAGE_SIZE));
  const cursor = cursors[page - 1];
  if (cursor) usersParams.set('cursor', cursor);
  const usersPath = `/api/admin/users?${usersParams.toString()}`;
  const { data, loading, error: dataErr, refresh: load } = useApi<UsersResponse>(usersPath);
  const error = dataErr ? T.loadError : null;

  // Append the next page's cursor once `data` is CONFIRMED fresh for the
  // CURRENT `usersPath` (matches the cache entry useApi just wrote for this
  // exact path/page/cursor combo) — `cursors`/`page` are local state, not
  // URL params, so this component never remounts on page change, and
  // useApi's `data` can still hold the PREVIOUS page's response for one
  // render while the new fetch is in flight. Appending from that stale
  // value would corrupt the cursor stack (duplicate/misaligned cursors).
  useEffect(() => {
    if (data && getCache(usersPath) === data && cursors.length === page && data.nextCursor) {
      const nextCursor = data.nextCursor;
      setCursors((prev) => [...prev, nextCursor]);
    }
  }, [data, usersPath, cursors.length, page]);

  // Any filter change restarts pagination from scratch.
  useEffect(() => {
    setPage(1);
    setCursors([null]);
  }, [debouncedSearch, effectiveStatus, org, orgRole]);

  function resetFilters() {
    setSearch('');
    setOrg('');
    setOrgRole('');
    setStatus('');
    setTab('all');
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      'utilisateurs.csv',
      [
        T.columns.user,
        'Email',
        T.columns.school,
        T.columns.role,
        T.columns.status,
        T.columns.lastLogin,
        T.columns.createdAt,
      ],
      data.items.map((u) => [
        u.name ?? u.email,
        u.email,
        u.school?.name ?? '—',
        u.orgRole ? ADMIN_SAAS.orgRole[u.orgRole] : '—',
        ADMIN_SAAS.userStatus[u.status],
        fmtRelativeWithTime(u.lastLoginAt),
        fmtDateMed(u.createdAt),
      ]),
    );
  }

  function rowActions(u: UserRow): ActionMenuItem[] {
    const items: ActionMenuItem[] = [
      {
        label: T.actions.viewProfile,
        icon: <Eye size={14} />,
        onClick: () => setModal({ kind: 'profile', user: u }),
      },
      { label: T.actions.edit, icon: <Pencil size={14} />, onClick: () => toast(T.stub) },
      {
        label: T.actions.resetPassword,
        icon: <KeyRound size={14} />,
        onClick: () => toast(T.stub),
      },
      { label: T.actions.impersonate, icon: <LogIn size={14} />, onClick: () => toast(T.stub) },
    ];
    if (u.status === 'ACTIVE') {
      items.push({
        label: T.actions.suspend,
        icon: <Pause size={14} />,
        onClick: () => setModal({ kind: 'suspend', user: u }),
        tone: 'danger',
        divider: true,
      });
    } else if (me?.role === 'SUPERADMIN') {
      items.push({
        label: T.actions.reactivate,
        icon: <Play size={14} />,
        onClick: () => setModal({ kind: 'suspend', user: u }),
        divider: true,
      });
    }
    items.push({
      label: T.actions.delete,
      icon: <Trash2 size={14} />,
      onClick: () => toast(T.stub),
      tone: 'danger',
    });
    return items;
  }

  const stats = data?.stats;

  return (
    <div className="w-full">
      <AdminPageHeader
        title={T.title}
        subtitle={T.subtitle}
        actions={
          <Button variant="outline" className="sm:w-auto" onClick={onExport} disabled={!data}>
            <FileSpreadsheet size={14} />
            {T.exportCsv}
          </Button>
        }
      />

      <div className="flex min-h-full flex-col gap-4">
        {stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={T.kpi.totalUsers}
              value={stats.totalUsers.toLocaleString('fr-FR')}
              icon={<UsersIcon size={15} />}
              delta={T.kpi.thisMonth(stats.usersDeltaMonth)}
              sub={undefined}
            />
            <StatCard
              label={T.kpi.activeUsers}
              value={stats.activeUsers.toLocaleString('fr-FR')}
              icon={<Activity size={15} />}
              deltaTone="muted"
              sub={T.kpi.activePct(stats.activeUsersPct)}
            />
            <StatCard
              label={T.kpi.schoolAdmins}
              value={String(stats.schoolAdmins)}
              icon={<Shield size={15} />}
              deltaTone="muted"
              sub={T.kpi.schoolAdminsSub}
            />
            <StatCard
              label={T.kpi.suspended}
              value={String(stats.suspendedUsers)}
              icon={<UserX size={15} />}
              deltaTone={stats.suspendedUsers > 0 ? 'destructive' : 'muted'}
              sub={undefined}
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
              className="sm:max-w-[280px]"
            />
            <FilterSelect value={org} onValueChange={setOrg} className="min-w-40">
              <SelectItem value="">{T.filters.allSchools}</SelectItem>
              {(data?.schools ?? []).map((s) => (
                <SelectItem key={s.orgId} value={s.orgId}>
                  {s.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={orgRole} onValueChange={setOrgRole} className="min-w-36">
              <SelectItem value="">{T.filters.allRoles}</SelectItem>
              <SelectItem value="OWNER">{ADMIN_SAAS.orgRole.OWNER}</SelectItem>
              <SelectItem value="ADMIN">{ADMIN_SAAS.orgRole.ADMIN}</SelectItem>
              <SelectItem value="MEMBER">{ADMIN_SAAS.orgRole.MEMBER}</SelectItem>
            </FilterSelect>
            <FilterSelect
              value={tab === 'all' ? status : tab}
              onValueChange={(v) => {
                setTab('all');
                setStatus(v);
              }}
              className="min-w-36"
            >
              <SelectItem value="">{T.filters.allStatuses}</SelectItem>
              <SelectItem value="ACTIVE">{ADMIN_SAAS.userStatus.ACTIVE}</SelectItem>
              <SelectItem value="SUSPENDED">{ADMIN_SAAS.userStatus.SUSPENDED}</SelectItem>
            </FilterSelect>
            <button
              type="button"
              onClick={resetFilters}
              className="text-left text-xs font-semibold text-primary sm:px-2"
            >
              {T.filters.reset}
            </button>
            {data && (
              <span className="text-xs text-muted-foreground sm:ml-auto">
                {T.filters.results(data.total)}
              </span>
            )}
          </div>
        ) : (
          <SkeletonFilters />
        )}

        <Card className="flex-1">
          <div className="border-b border-border px-4 pt-3.5">
            <h2 className="text-sm font-bold text-foreground">{T.list.title}</h2>
            <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{T.list.subtitle}</p>
            <Tabs
              tabs={[
                { key: 'all', label: T.list.tabs.all },
                { key: 'ACTIVE', label: T.list.tabs.active },
                { key: 'SUSPENDED', label: T.list.tabs.suspended },
              ]}
              active={tab}
              onChange={(k) => {
                setStatus('');
                setTab(k);
              }}
            />
          </div>
          {error ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button className="w-auto" onClick={() => void load()}>
                {T.retry}
              </Button>
            </div>
          ) : loading || !data ? (
            <SkeletonTable rows={8} cols={6} />
          ) : data.items.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{T.empty}</p>
          ) : (
            <>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={TH_CLASS}>{T.columns.user}</th>
                      <th className={TH_CLASS}>{T.columns.school}</th>
                      <th className={TH_CLASS}>{T.columns.role}</th>
                      <th className={TH_CLASS}>{T.columns.status}</th>
                      <th className={TH_CLASS}>{T.columns.lastLogin}</th>
                      <th className={TH_CLASS}>{T.columns.createdAt}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/50">
                        <td className={TD_CLASS}>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={u.name ?? u.email} size={32} src={u.avatarUrl} />
                            <div className="min-w-0">
                              <div className="max-w-[220px] truncate font-semibold text-foreground">
                                {u.name ?? u.email}
                              </div>
                              <div className="max-w-[220px] truncate text-2xs text-muted-foreground">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={TD_CLASS}>
                          {u.school ? (
                            <div className="flex items-center gap-2">
                              <Avatar name={u.school.name} size={22} />
                              <span className="max-w-[180px] truncate text-caption text-foreground">
                                {u.school.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={TD_CLASS}>
                          {u.role !== 'USER' ? (
                            <Badge tone="primary">
                              {u.role === 'SUPERADMIN' ? 'Superadmin' : 'Staff'}
                            </Badge>
                          ) : u.orgRole ? (
                            <span className="text-caption text-foreground">
                              {ADMIN_SAAS.orgRole[u.orgRole]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={TD_CLASS}>
                          <UserStatusBadge status={u.status} />
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {fmtRelativeWithTime(u.lastLoginAt)}
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {fmtDateMed(u.createdAt)}
                        </td>
                        <td className={`${TD_CLASS} text-right`}>
                          <div className="flex justify-end">
                            <ActionMenu items={rowActions(u)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={data.total}
                onChange={setPage}
                itemsLabel={T.pagerLabel}
                shownCount={data.items.length}
              />
            </>
          )}
        </Card>
      </div>

      {modal.kind === 'profile' && (
        <UserProfileModal user={modal.user} onClose={() => setModal({ kind: 'none' })} />
      )}
      {modal.kind === 'suspend' && (
        <UserSuspendModal
          user={modal.user}
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

function UserProfileModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  return (
    <Modal title={T.profileModal.title} onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={user.name ?? user.email} size={40} src={user.avatarUrl} />
        <div>
          <div className="text-sm font-bold text-foreground">{user.name ?? user.email}</div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </div>
      </div>
      <div className="divide-y divide-border">
        <ProfileRow label={T.profileModal.school}>{user.school?.name ?? '—'}</ProfileRow>
        <ProfileRow label={T.profileModal.orgRole}>
          {user.orgRole ? ADMIN_SAAS.orgRole[user.orgRole] : '—'}
        </ProfileRow>
        {user.role !== 'USER' && (
          <ProfileRow label={T.profileModal.appRole}>{user.role}</ProfileRow>
        )}
        <ProfileRow label={T.profileModal.status}>
          <UserStatusBadge status={user.status} />
        </ProfileRow>
        <ProfileRow label={T.profileModal.emailVerified}>
          {user.emailVerifiedAt ? T.profileModal.yes : T.profileModal.no}
        </ProfileRow>
        <ProfileRow label={T.profileModal.lastLogin}>
          {fmtRelativeWithTime(user.lastLoginAt)}
        </ProfileRow>
        <ProfileRow label={T.profileModal.createdAt}>{fmtDateMed(user.createdAt)}</ProfileRow>
      </div>
      <Button variant="outline" className="mt-4" onClick={onClose}>
        {T.profileModal.close}
      </Button>
    </Modal>
  );
}

function UserSuspendModal({
  user,
  onClose,
  onDone,
}: {
  user: UserRow;
  onClose: () => void;
  onDone: (reactivated: boolean) => void;
}) {
  const { toast } = useToast();
  const reactivating = user.status === 'SUSPENDED';
  const [busy, setBusy] = useState(false);
  const name = user.name ?? user.email;

  async function onConfirm() {
    setBusy(true);
    try {
      await api(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: { status: reactivating ? 'ACTIVE' : 'SUSPENDED' },
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
        {reactivating ? T.suspendModal.bodyReactivate(name) : T.suspendModal.bodySuspend(name)}
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
