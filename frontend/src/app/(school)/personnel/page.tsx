'use client';

// /personnel — unified Personnel list (teachers + admin staff), replacing
// the old Enseignants list and the Administrateurs settings tab (spec
// docs/superpowers/specs/2026-09-04-personnel-module-design.md §6.2).
// Banani source: .planning/banani/fetches/personnel-module/personnel-list.html
// (sidebar/topbar chrome discarded — only the toolbar + table are new here,
// the rest is this app's existing shell). Server-paginated (20/page) unlike
// the client-filtered Enseignants/Élèves lists, so search is debounced —
// pattern mirrored from app/admin/schools/page.tsx, this app's only other
// server-paginated + search screen.
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePermissions } from '@/lib/usePermissions';
import { useUser } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton, SkeletonFilters, SkeletonTable } from '@/components/ui/Skeleton';
import { Pager } from '@/components/ui/Pager';
import { LIST_PAGE } from '@/lib/layout';
import { PersonnelFormModal } from './PersonnelFormModal';
import { PersonnelTable } from './PersonnelTable';
import type { PersonnelListResponse, PersonnelProfileFilter } from './types';

const PAGE_SIZE = 20;

function SegmentedFilter({
  value,
  onChange,
  options,
}: {
  value: PersonnelProfileFilter;
  onChange: (value: PersonnelProfileFilter) => void;
  options: { value: PersonnelProfileFilter; label: string }[];
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`h-8 shrink-0 rounded-lg px-3.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            value === o.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PersonnelPage() {
  const user = useUser();
  const router = useRouter();
  const t = useTranslations('Personnel.list');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [profile, setProfile] = useState<PersonnelProfileFilter>('all');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, profile]);

  const onNoSchool = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
      router.replace('/');
      return true;
    }
  };

  const params = new URLSearchParams();
  if (profile !== 'all') params.set('profile', profile);
  if (debouncedSearch) params.set('q', debouncedSearch);
  params.set('page', String(page));

  const {
    data,
    error: dataErr,
    refresh,
  } = useApi<PersonnelListResponse>(`/api/school/personnel?${params.toString()}`, {
    skip: !user,
    onError: onNoSchool,
  });
  const error = dataErr ? t('loadError') : null;

  const { can, canSee } = usePermissions();
  if (!canSee('enseignants')) return <AccessDenied />;

  const isFiltered = profile !== 'all' || debouncedSearch.length > 0;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        {can('enseignants', 'create') && (
          <Button className="w-fit" onClick={() => setAddOpen(true)}>
            <Plus size={14} />
            {t('addButton')}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {data === null && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={5} />
          </Card>
        </div>
      )}

      {data !== null && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <SegmentedFilter
              value={profile}
              onChange={setProfile}
              options={[
                { value: 'all', label: t('filter.all') },
                { value: 'teacher', label: t('filter.teacher') },
                { value: 'staff', label: t('filter.staff') },
              ]}
            />
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="max-w-[300px]"
            />
          </div>

          {data.items.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">
                {isFiltered ? t('emptyFiltered') : t('emptyNone')}
              </p>
            </Card>
          ) : (
            <>
              <PersonnelTable rows={data.items} />
              {/* Pager's own "Affichage de X a Y sur N ..." sentence is a
                  shared primitive not yet in the i18n rollout (unlike this
                  screen) — translating only itemsLabel would produce a
                  half-French, half-English sentence in en/ht, worse than
                  the pre-existing French-only gap this shares with every
                  other Pager consumer in the app. */}
              <Pager
                page={data.page}
                pageSize={PAGE_SIZE}
                total={data.total}
                onChange={setPage}
                itemsLabel="membres"
              />
            </>
          )}
        </>
      )}

      {addOpen && (
        <PersonnelFormModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
