'use client';

import { Suspense, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Pencil,
  Download,
  FileText,
  Hash,
  School as SchoolIcon,
  Calendar,
  UserCheck,
  BarChart2,
  CalendarCheck,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { NotesResultatsTab } from './NotesResultatsTab';
import { AppreciationsTab } from './AppreciationsTab';
import { PresencesTab } from './PresencesTab';
import { BulletinsTab } from './BulletinsTab';
import { StudentFormModal } from '../StudentFormModal';
import type { StudentDetail, StudentResults, StudentStatus } from '../types';
import type { StudentAttendanceResponse } from '../../pedagogie/presences/types';

const STATUS_LABEL: Record<StudentStatus, string> = {
  ENROLLED: 'Inscrit(e)',
  REPEATED_ABSENCES: 'Absences répétées',
  SUSPENDED: 'Suspendu(e)',
};
const STATUS_DOT: Record<StudentStatus, string> = {
  ENROLLED: '#16A34A',
  REPEATED_ABSENCES: '#F59E0B',
  SUSPENDED: '#9CA3AF',
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ageFrom(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

const TABS = [
  { key: 'info', label: 'Informations', icon: UserCheck },
  { key: 'grades', label: 'Notes & Résultats', icon: BarChart2 },
  { key: 'attendance', label: 'Présences', icon: CalendarCheck },
  { key: 'appreciations', label: 'Appréciations', icon: Star },
  { key: 'bulletins', label: 'Bulletins', icon: FileText },
] as const;

export default function StudentProfilePage() {
  return (
    <Suspense fallback={null}>
      <StudentProfile />
    </Suspense>
  );
}

const TAB_KEYS = TABS.map((t) => t.key);

function StudentProfile() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const { toast } = useToast();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [results, setResults] = useState<StudentResults | null>(null);
  const [attendance, setAttendance] = useState<StudentAttendanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>(
    initialTab && TAB_KEYS.some((k) => k === initialTab)
      ? (initialTab as (typeof TABS)[number]['key'])
      : 'info',
  );
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ student: StudentDetail }>(`/api/school/students/${params.id}`),
      api<StudentResults>(`/api/school/students/${params.id}/results`),
      api<StudentAttendanceResponse>(`/api/school/students/${params.id}/attendance`),
    ])
      .then(([s, r, a]) => {
        setStudent(s.student);
        setResults(r);
        setAttendance(a);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setError('Élève introuvable.');
          return;
        }
        setError('Impossible de charger le profil.');
      });
  }, [user, router, params.id, refreshKey]);

  if (!user || (student === null && !error)) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-40 rounded-md" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="hidden h-9 w-36 rounded-md sm:block" />
            <Skeleton className="h-9 w-36 rounded-md" />
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

  if (error || !student) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/eleves"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          Retour aux élèves
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/eleves"
          className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          Retour aux élèves
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bulk PDF export is desktop paperwork, not a phone action — kept
              off the mobile action row (user decision: hide secondary
              actions rather than let 3 buttons overflow at 360px). */}
          <Button
            variant="outline"
            className="hidden w-fit sm:inline-flex"
            onClick={() => toast('Export PDF du dossier — bientôt disponible.', 'info')}
          >
            <Download size={14} />
            Exporter le dossier
          </Button>
          {results?.resolvedTermId ? (
            <Link
              href={`/bulletins/${params.id}/${results.resolvedTermId}`}
              className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground"
            >
              <FileText size={14} />
              Voir le bulletin
            </Link>
          ) : (
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => toast('Aucune période scolaire disponible pour le moment.', 'info')}
            >
              <FileText size={14} />
              Voir le bulletin
            </Button>
          )}
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
                <Avatar
                  name={`${student.firstName} ${student.lastName}`}
                  size={80}
                  src={student.photoUrl}
                />
              </div>
              <div
                className="absolute right-1 bottom-1 h-3.5 w-3.5 rounded-full border-2 border-card"
                style={{ background: STATUS_DOT[student.status] }}
              />
            </div>
            <div>
              <div className="text-xl font-bold text-foreground">
                {student.firstName} {student.lastName}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Hash size={12} />#{student.studentNumber}
                </span>
                {student.class && (
                  <span className="flex items-center gap-1">
                    <SchoolIcon size={12} />
                    {student.class.name}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {fmtDate(student.dateOfBirth)} · {ageFrom(student.dateOfBirth)} ans
                </span>
                {student.homeroomTeacher && (
                  <span className="flex items-center gap-1">
                    <UserCheck size={12} />
                    {student.homeroomTeacher.name} (titulaire)
                  </span>
                )}
              </div>
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_DOT[student.status] }}
                  />
                  {STATUS_LABEL[student.status]}
                </span>
              </div>
            </div>
          </div>
          {/* 1×4 row with dividers from `sm` up; below that a 360px screen
              can't fit 4 labels + 3 dividers on one line (measured overflow
              during the mobile audit), so it becomes a borderless 2×2 grid. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:items-center sm:gap-6">
            <Stat
              label="Moyenne générale"
              value={results?.overallAverage != null ? `${results.overallAverage.toFixed(1)}` : '—'}
            />
            <div className="hidden h-9 w-px bg-border sm:block" />
            <Stat
              label="Taux de présence"
              value={attendance?.ratePercent != null ? `${attendance.ratePercent}%` : '—'}
            />
            <div className="hidden h-9 w-px bg-border sm:block" />
            <Stat
              label="Absences ce trimestre"
              value={attendance ? String(attendance.absences) : '—'}
            />
            <div className="hidden h-9 w-px bg-border sm:block" />
            <Stat label="Rang de classe" value={results?.rank ? `${results.rank}e` : '—'} />
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
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-caption font-medium whitespace-nowrap ${
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
              <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
                <UserCheck size={14} className="text-primary" />
                Informations personnelles
              </div>
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary">
                Modifier
              </button>
            </div>
            <InfoRow label="Nom complet" value={`${student.firstName} ${student.lastName}`} />
            <InfoRow label="Date de naissance" value={fmtDate(student.dateOfBirth)} />
            <InfoRow label="Lieu de naissance" value={student.placeOfBirth ?? '—'} />
            <InfoRow label="Genre" value={student.gender ?? '—'} />
            <InfoRow label="Nationalité" value={student.nationality ?? '—'} />
            <InfoRow label="Adresse" value={student.address ?? '—'} />
            <InfoRow label="Date d'inscription" value={fmtDate(student.enrolledAt)} />
            <InfoRow label="Statut" value={STATUS_LABEL[student.status]} last />
          </Card>

          <Card className="p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
                <UserCheck size={14} className="text-primary" />
                Tuteur légal
              </div>
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary">
                Modifier
              </button>
            </div>
            {student.guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun tuteur renseigné.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {student.guardians.map((g, i) => (
                  <div key={g.id ?? i} className={i > 0 ? 'border-t border-border pt-4' : ''}>
                    <div className="mb-2 flex items-center gap-2.5">
                      <Avatar name={g.name} size={36} />
                      <div>
                        <div className="text-caption font-semibold text-foreground">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{g.relationship}</div>
                      </div>
                    </div>
                    <InfoRow label="Téléphone" value={g.phone ?? '—'} />
                    <InfoRow label="Email" value={g.email ?? '—'} />
                    <InfoRow label="Profession" value={g.profession ?? '—'} last />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'grades' && results && (
        <NotesResultatsTab
          studentId={student.id}
          studentName={`${student.firstName} ${student.lastName}`}
          initial={results}
        />
      )}
      {tab === 'attendance' && <PresencesTab studentId={student.id} />}
      {tab === 'appreciations' && <AppreciationsTab studentId={student.id} />}
      {tab === 'bulletins' && <BulletinsTab studentId={student.id} />}

      {editing && (
        <StudentFormModal
          studentId={student.id}
          onClose={() => setEditing(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-xl leading-none font-bold text-foreground">{value}</div>
      <div className="text-center text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-start gap-2 py-1.5 ${last ? '' : 'border-b border-border'}`}>
      <span className="min-w-[130px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-caption font-medium text-foreground">{value}</span>
    </div>
  );
}
