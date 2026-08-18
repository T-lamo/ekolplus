'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface TodaySession {
  id: string;
  subjectName: string;
  className: string;
  room: string | null;
  startMinutes: number;
  endMinutes: number;
  status: 'UPCOMING' | 'PRESENT' | 'LATE' | 'ABSENT';
  checkedInAt: string | null;
}

const STATUS_TONE: Record<TodaySession['status'], BadgeTone> = {
  UPCOMING: 'muted',
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'destructive',
};
const STATUS_LABEL: Record<TodaySession['status'], string> = {
  UPCOMING: 'À venir',
  PRESENT: 'Présent',
  LATE: 'En retard',
  ABSENT: 'Absent',
};

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isSessionLive(s: TodaySession): boolean {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= s.startMinutes && nowMinutes <= s.endMinutes + 15;
}

export default function TeacherPortalPage() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<TodaySession[] | null>(null);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  function load() {
    api<{ sessions: TodaySession[] }>('/api/teacher/sessions/today')
      .then((res) => setSessions(res.sessions))
      .catch(() => toast('Impossible de charger tes cours.', 'error'));
  }

  useEffect(load, []);

  async function onCheckIn(session: TodaySession) {
    setCheckingIn(session.id);
    try {
      await api('/api/teacher/checkins', {
        method: 'POST',
        body: { timetableSessionId: session.id },
      });
      toast('Présence enregistrée.', 'success');
      load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OUTSIDE_WINDOW') {
        toast('Ce cours n’est pas en cours actuellement.', 'error');
      } else if (err instanceof ApiError && err.code === 'ALREADY_CHECKED_IN') {
        toast('Déjà pointé pour ce cours.', 'info');
        load();
      } else {
        toast('Impossible d’enregistrer ta présence. Réessaie.', 'error');
      }
    } finally {
      setCheckingIn(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">
          Mes cours aujourd'hui
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Signe ta présence à chaque cours.</p>
      </div>

      {sessions === null && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {sessions?.length === 0 && (
        <Card className="items-center gap-2 p-8 text-center">
          <Clock size={22} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aucun cours prévu aujourd'hui.</p>
        </Card>
      )}

      {sessions?.map((s) => (
        <Card key={s.id} className="gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-foreground">{s.subjectName}</div>
              <div className="text-xs text-muted-foreground">
                {s.className} · {fmtTime(s.startMinutes)}–{fmtTime(s.endMinutes)}
                {s.room ? ` · ${s.room}` : ''}
              </div>
            </div>
            <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
          </div>
          {s.status === 'PRESENT' || s.status === 'LATE' ? (
            <div className="flex items-center gap-1.5 text-xs text-success-foreground">
              <CheckCircle2 size={13} />
              Pointé à{' '}
              {s.checkedInAt
                ? new Date(s.checkedInAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''}
            </div>
          ) : s.status === 'ABSENT' ? (
            <div className="flex items-center gap-1.5 text-xs text-destructive-foreground">
              <XCircle size={13} />
              Cours terminé sans pointage
            </div>
          ) : (
            <Button
              className="w-fit"
              disabled={!isSessionLive(s)}
              loading={checkingIn === s.id}
              onClick={() => onCheckIn(s)}
            >
              Je suis présent
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
