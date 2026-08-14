'use client';

// Teacher profile page — strictly the same layout skeleton as the student
// profile (/eleves/[id]): back+actions row, gradient hero card (avatar,
// identity chips, status pill, stats), tab bar, info tab as a 2-column
// grid of InfoRow cards. Stats and the Matières & Classes tab are real,
// derived from ClassSubject assignments — never fabricated numbers.

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Calendar,
  Hash,
  Link as LinkIcon,
  Mail,
  Pencil,
  Phone,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { TeacherFormModal } from '../TeacherFormModal';
import type { TeacherDetail, TeacherStatus } from '../types';

const STATUS_LABEL: Record<TeacherStatus, string> = {
  ACTIVE: 'Actif(ve)',
  ON_LEAVE: 'En congé',
  INACTIVE: 'Inactif(ve)',
};
const STATUS_DOT: Record<TeacherStatus, string> = {
  ACTIVE: '#16A34A',
  ON_LEAVE: '#F59E0B',
  INACTIVE: '#9CA3AF',
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const TABS = [
  { key: 'info', label: 'Informations', icon: UserCheck },
  { key: 'assignments', label: 'Matières & Classes', icon: BookOpen },
] as const;

export default function TeacherProfilePage() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('info');
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api<{ teacher: TeacherDetail }>(`/api/school/teachers/${params.id}`)
      .then(({ teacher: t }) => setTeacher(t))
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setError('Enseignant introuvable.');
          return;
        }
        setError('Impossible de charger le profil.');
      });
  }, [params.id, router]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  if (!user || (teacher === null && !error)) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-40 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-40 rounded-md" />
            <Skeleton className="h-9 w-40 rounded-md" />
          </div>
        </div>

        <Card className="gap-4 p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </Card>

        <Skeleton className="h-10 w-72 rounded-lg" />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="mb-3.5 h-4 w-48" />
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="h-3 w-28 shrink-0" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !teacher) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/enseignants"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          Retour aux enseignants
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const displayName = [teacher.civility, teacher.name].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/enseignants"
          className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          Retour aux enseignants
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/configuration/affectations"
            className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground"
          >
            <LinkIcon size={14} />
            Gérer les affectations
          </Link>
          <Button className="w-fit" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            Modifier le profil
          </Button>
        </div>
      </div>

      <Card className="relative gap-4 overflow-hidden p-6">
        <div
          className="absolute inset-x-0 top-0 h-[72px]"
          style={{ background: 'linear-gradient(135deg, #6c2bd9 0%, #a855f7 100%)' }}
        />
        <div className="relative z-10 flex flex-col gap-4 pt-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="relative shrink-0">
              <div className="rounded-full border-[3px] border-card shadow-lg">
                <Avatar name={teacher.name} size={80} src={teacher.photoUrl} />
              </div>
              <div
                className="absolute right-1 bottom-1 h-3.5 w-3.5 rounded-full border-2 border-card"
                style={{ background: STATUS_DOT[teacher.status] }}
              />
            </div>
            <div>
              <div className="text-xl font-bold text-foreground">{displayName}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {teacher.idNumber && (
                  <span className="flex items-center gap-1">
                    <Hash size={12} />
                    {teacher.idNumber}
                  </span>
                )}
                {teacher.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={12} />
                    {teacher.email}
                  </span>
                )}
                {teacher.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={12} />
                    {teacher.phone}
                  </span>
                )}
                {teacher.contractType && (
                  <span className="flex items-center gap-1">
                    <Briefcase size={12} />
                    {teacher.contractType}
                  </span>
                )}
                {teacher.hiredAt && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    Depuis le {fmtDate(teacher.hiredAt)}
                  </span>
                )}
              </div>
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_DOT[teacher.status] }}
                  />
                  {STATUS_LABEL[teacher.status]}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 sm:gap-6">
            <Stat label="Matières" value={String(teacher.subjects.length)} />
            <div className="h-9 w-px bg-border" />
            <Stat label="Classes" value={String(teacher.classes.length)} />
            <div className="h-9 w-px bg-border" />
            <Stat label="Heures / semaine" value={`${teacher.weeklyHours} h`} />
          </div>
        </div>
      </Card>

      <div role="tablist" className="flex w-fit gap-1 overflow-x-auto rounded-lg bg-card p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium whitespace-nowrap ${
                tab === t.key ? 'bg-secondary font-semibold text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'info' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <UserCheck size={14} className="text-primary" />
                Informations personnelles
              </div>
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary">
                Modifier
              </button>
            </div>
            <InfoRow label="Nom complet" value={displayName} />
            <InfoRow
              label="Date de naissance"
              value={teacher.dateOfBirth ? fmtDate(teacher.dateOfBirth) : '—'}
            />
            <InfoRow label="Genre" value={teacher.gender ?? '—'} />
            <InfoRow label="Nationalité" value={teacher.nationality ?? '—'} />
            <InfoRow label="N° d'identification" value={teacher.idNumber ?? '—'} />
            <InfoRow label="Adresse" value={teacher.address ?? '—'} />
            <InfoRow label="Statut" value={STATUS_LABEL[teacher.status]} last />
          </Card>

          <Card className="p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <Briefcase size={14} className="text-primary" />
                Coordonnées & Contrat
              </div>
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary">
                Modifier
              </button>
            </div>
            <InfoRow label="Adresse e-mail" value={teacher.email ?? '—'} />
            <InfoRow label="Téléphone principal" value={teacher.phone ?? '—'} />
            <InfoRow label="Téléphone secondaire" value={teacher.secondaryPhone ?? '—'} />
            <InfoRow label="Type de contrat" value={teacher.contractType ?? '—'} />
            <InfoRow
              label="Date d'embauche"
              value={teacher.hiredAt ? fmtDate(teacher.hiredAt) : '—'}
            />
            <InfoRow
              label="Heures / sem. (contrat)"
              value={teacher.weeklyHoursTarget !== null ? `${teacher.weeklyHoursTarget} h` : '—'}
              last
            />
          </Card>
        </div>
      )}

      {tab === 'assignments' && (
        <Card className="p-5">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <BookOpen size={14} className="text-primary" />
              Matières & Classes assignées
            </div>
            <Link href="/configuration/affectations" className="text-xs font-medium text-primary">
              Gérer
            </Link>
          </div>
          {teacher.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune affectation pour l'instant — elles se configurent depuis la page{' '}
              <Link href="/configuration/affectations" className="font-semibold text-primary">
                Affectations
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <th className="py-2 pr-3">Matière</th>
                    <th className="py-2 pr-3">Classe</th>
                    <th className="py-2 pr-3">Heures / sem.</th>
                    <th className="py-2">Coefficient</th>
                  </tr>
                </thead>
                <tbody>
                  {teacher.assignments.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-3 text-[13px] font-medium text-foreground">
                        {a.subject.name}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="rounded-full bg-[#e0f0ff] px-2.5 py-1 text-xs font-semibold text-[#2563eb]">
                          {a.class.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-[13px] text-foreground">
                        {a.weeklyHours !== null ? `${a.weeklyHours} h` : '—'}
                      </td>
                      <td className="py-2.5 text-[13px] text-foreground">{a.coefficient ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing && (
        <TeacherFormModal teacherId={teacher.id} onClose={() => setEditing(false)} onSaved={load} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-xl leading-none font-bold text-foreground">{value}</div>
      <div className="text-center text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-start gap-2 py-1.5 ${last ? '' : 'border-b border-border'}`}>
      <span className="min-w-[130px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium text-foreground">{value}</span>
    </div>
  );
}
