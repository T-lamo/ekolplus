'use client';

// Configuration › Salles — catalogue des salles et lieux de l'école (validé
// 2026-08-17 avec la fiche classe compacte). Même gabarit que la liste des
// classes : en-tête + « Ajouter une salle », 4 cartes de synthèse, filtres
// (recherche / type / statut), grille de ListCard ou tableau, Pager compact.
// Les salles alimentent le champ Salle de la fiche classe et la modale de
// séance de l'emploi du temps ; une salle inactive n'y est plus proposée.
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Armchair,
  CheckCircle2,
  DoorOpen,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { ListCard, ListCardTile } from '@/components/school/ListCard';
import { Button } from '@/components/ui/Button';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { CardGrid } from '@/components/school/CardGrid';
import { GRID_SCROLL, LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import {
  ROOM_TYPES,
  ROOM_TYPE_LABELS,
  roomLocation,
  roomTypeLabel,
  type RoomRow,
} from '@/lib/rooms';
import { roomTypeIcon } from '@/components/school/rooms/room-type-icon';
import { RoomFormModal } from './RoomFormModal';

const PAGE_SIZE = 20;

type StatusFilter = '' | 'active' | 'inactive';

export default function RoomsPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);
  // null = fermé ; 'new' = création ; RoomRow = édition.
  const [editing, setEditing] = useState<RoomRow | 'new' | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ rooms: RoomRow[] }>('/api/school/rooms')
      .then((r) => setRooms(r.rooms))
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les salles.');
      });
  }, [user, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rooms ?? []).filter((r) => {
      if (type && r.type !== type) return false;
      if (status === 'active' && !r.isActive) return false;
      if (status === 'inactive' && r.isActive) return false;
      if (q) {
        const hay = [r.name, r.building, r.floor, r.equipment]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rooms, search, type, status]);

  useEffect(() => {
    setPage(1);
  }, [search, type, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const all = rooms ?? [];
    return {
      total: all.length,
      active: all.filter((r) => r.isActive).length,
      seats: all.reduce((sum, r) => sum + (r.capacity ?? 0), 0),
      used: all.filter((r) => r.classCount > 0 || r.sessionCount > 0).length,
    };
  }, [rooms]);

  function onSaved(room: RoomRow, mode: 'create' | 'edit') {
    setRooms((prev) => {
      if (!prev) return [room];
      if (mode === 'create') {
        return [...prev, room].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      }
      return prev.map((r) => (r.id === room.id ? room : r));
    });
    setEditing(null);
    toast(mode === 'create' ? 'Salle créée.' : 'Salle mise à jour.', 'success');
  }

  async function onToggleActive(room: RoomRow) {
    try {
      const res = await api<{ room: RoomRow }>(`/api/school/rooms/${room.id}`, {
        method: 'PATCH',
        body: { isActive: !room.isActive },
      });
      setRooms((prev) => (prev ? prev.map((r) => (r.id === room.id ? res.room : r)) : prev));
      toast(res.room.isActive ? 'Salle réactivée.' : 'Salle désactivée.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  async function onDelete(room: RoomRow) {
    const usage =
      room.classCount + room.sessionCount > 0
        ? `\nLes ${room.classCount} classe(s) et ${room.sessionCount} séance(s) qui l’utilisent garderont « ${room.name} » en texte libre.`
        : '';
    if (
      !(await confirm({ message: `Supprimer la salle « ${room.name} » ?${usage}`, danger: true }))
    )
      return;
    try {
      await api(`/api/school/rooms/${room.id}`, { method: 'DELETE' });
      setRooms((prev) => (prev ? prev.filter((r) => r.id !== room.id) : prev));
      toast('Salle supprimée.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  function menuItemsFor(r: RoomRow) {
    return [
      { label: 'Modifier', icon: <Pencil size={14} />, onClick: () => setEditing(r) },
      {
        label: r.isActive ? 'Désactiver' : 'Réactiver',
        icon: r.isActive ? <PowerOff size={14} /> : <Power size={14} />,
        onClick: () => onToggleActive(r),
      },
      {
        label: 'Supprimer la salle',
        icon: <Trash2 size={14} />,
        onClick: () => onDelete(r),
        tone: 'danger' as const,
        divider: true,
      },
    ];
  }

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
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Salles</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Salles et lieux proposés aux classes et à l&apos;emploi du temps.
          </p>
        </div>
        <Button className="w-fit" onClick={() => setEditing('new')}>
          <Plus size={14} />
          Ajouter une salle
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {rooms === null && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonStatCards count={4} />
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={6} />
          </Card>
        </div>
      )}

      {rooms !== null && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <SummaryCard icon={DoorOpen} label="Total salles" value={stats.total} />
            <SummaryCard
              icon={CheckCircle2}
              label="Salles actives"
              value={`${stats.active} / ${stats.total}`}
              tone="success"
            />
            <SummaryCard icon={Armchair} label="Places au total" value={stats.seats} tone="blue" />
            <SummaryCard
              icon={Users}
              label="Salles utilisées"
              value={`${stats.used} / ${stats.total}`}
              tone="warning"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une salle..."
              className="max-w-[260px]"
            />
            <FilterSelect value={type} onValueChange={setType}>
              <SelectItem value="">Tous types</SelectItem>
              {ROOM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ROOM_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectItem value="">Tous statuts</SelectItem>
              <SelectItem value="active">Actives</SelectItem>
              <SelectItem value="inactive">Inactives</SelectItem>
            </FilterSelect>
            <span className="text-sm text-muted-foreground">
              {filtered.length} salle{filtered.length > 1 ? 's' : ''}
            </span>
            {/* Table view needs real width to be usable — mobile always
                gets the card grid instead, so the toggle (and the way to
                reach the table) only shows from `md` up. */}
            <div className="ml-auto hidden md:block">
              <ViewToggle view={view} onChange={setView} />
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">
                {rooms.length === 0
                  ? 'Aucune salle — ajoute la première pour la proposer aux classes et à l’emploi du temps.'
                  : 'Aucun résultat.'}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <CardGrid className={GRID_SCROLL}>
              {paged.map((r) => {
                const Icon = roomTypeIcon(r.type);
                const location = roomLocation(r);
                return (
                  <ListCard
                    key={r.id}
                    {...(r.isActive ? {} : { className: 'opacity-70' })}
                    tile={
                      <ListCardTile className="bg-secondary text-primary">
                        <Icon size={18} />
                      </ListCardTile>
                    }
                    title={r.name}
                    subtitle={[
                      roomTypeLabel(r.type),
                      r.capacity != null ? `${r.capacity} places` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    menu={<ActionMenu items={menuItemsFor(r)} />}
                    metaLeft={
                      location ? (
                        <span className="truncate">{location}</span>
                      ) : (
                        <span className="text-muted-foreground italic">
                          Emplacement non renseigné
                        </span>
                      )
                    }
                    metaRight={
                      <Badge tone={r.isActive ? 'success' : 'secondary'}>
                        {r.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    }
                    footerLeft={
                      <>
                        <span className="font-bold text-foreground">{r.classCount}</span> classe
                        {r.classCount > 1 ? 's' : ''}
                      </>
                    }
                    footerRight={
                      <>
                        <span className="font-bold text-foreground">{r.sessionCount}</span> séance
                        {r.sessionCount > 1 ? 's' : ''}
                      </>
                    }
                  />
                );
              })}
            </CardGrid>
          ) : (
            <Card>
              <div className={TABLE_SCROLL}>
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>Salle</Th>
                      <Th>Type</Th>
                      <Th>Capacité</Th>
                      <Th>Équipements</Th>
                      <Th>Classes</Th>
                      <Th>Séances</Th>
                      <Th>Statut</Th>
                      <Th className="w-[80px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => {
                      const Icon = roomTypeIcon(r.type);
                      const location = roomLocation(r);
                      return (
                        <tr key={r.id} className="border-b border-border last:border-none">
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                                <Icon size={14} />
                              </span>
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground">{r.name}</div>
                                {location && (
                                  <div className="text-2xs text-muted-foreground">{location}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Badge>{roomTypeLabel(r.type)}</Badge>
                          </td>
                          <td className="px-3.5 py-2.5 text-foreground">
                            {r.capacity != null ? (
                              <>
                                <span className="font-semibold">{r.capacity}</span>
                                <span className="text-muted-foreground"> places</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="max-w-[260px] truncate px-3.5 py-2.5 text-muted-foreground">
                            {r.equipment ?? '—'}
                          </td>
                          <td className="px-3.5 py-2.5 font-semibold text-foreground">
                            {r.classCount}
                          </td>
                          <td className="px-3.5 py-2.5 font-semibold text-foreground">
                            {r.sessionCount}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Badge tone={r.isActive ? 'success' : 'secondary'}>
                              {r.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <ActionMenu items={menuItemsFor(r)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager
                centered
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onChange={setPage}
              />
            </Card>
          )}
          {view === 'grid' && filtered.length > 0 && (
            <Pager
              centered
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onChange={setPage}
            />
          )}
        </>
      )}

      {editing !== null && (
        <RoomFormModal
          room={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function Badge({
  children,
  tone = 'secondary',
}: {
  children: ReactNode;
  tone?: 'secondary' | 'success';
}) {
  const toneClasses = {
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-success text-success-foreground',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = 'secondary',
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number | string;
  tone?: 'secondary' | 'success' | 'warning' | 'blue';
}) {
  const iconWrap = {
    secondary: 'bg-secondary text-primary',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
    blue: 'bg-info text-info-foreground',
  } as const;
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconWrap[tone]}`}
      >
        <Icon size={17} />
      </div>
      <div>
        <div className="text-2xs font-medium text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
      </div>
    </Card>
  );
}
