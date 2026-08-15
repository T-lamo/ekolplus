'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';

// Event-type keys stored in NotificationPreferences.prefs (per-user JSON,
// opt-out semantics — a missing key means "enabled"). These 5 event types
// are genuinely persisted here but, as of this pass, not yet consumed by any
// notification dispatcher (no outbox `kind` or template emits them yet) —
// same "flagged, not silently faked" precedent as other honest gaps in this
// codebase. Wiring the actual sends is a separate, future change.
const EVENT_TYPES = [
  {
    key: 'BULLETIN_GENERATED',
    label: 'Bulletins générés',
    desc: 'Quand un bulletin est prêt à consulter.',
  },
  {
    key: 'UNEXCUSED_ABSENCE',
    label: 'Absences non justifiées',
    desc: 'Quand un élève est marqué absent sans justification.',
  },
  {
    key: 'RENEWAL_REMINDER',
    label: 'Rappel de renouvellement',
    desc: "Avant l'expiration de l'abonnement de l'établissement.",
  },
  {
    key: 'TEACHER_ACTIVITY_DIGEST',
    label: 'Activité des enseignants',
    desc: "Résumé des saisies (notes, présences) par l'équipe pédagogique.",
  },
  {
    key: 'WEEKLY_SUMMARY',
    label: 'Résumé hebdomadaire',
    desc: "Un récapitulatif de l'activité de l'établissement chaque semaine.",
  },
] as const;

type Channel = 'email' | 'inApp';
type Prefs = Record<string, { email?: boolean; inApp?: boolean }>;

function isEnabled(prefs: Prefs, eventType: string, channel: Channel): boolean {
  const v = prefs[eventType]?.[channel];
  return v !== false;
}

export function NotificationsTab() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    api<{ prefs: Prefs }>('/api/notifications/prefs')
      .then((res) => setPrefs(res.prefs))
      .catch(() => setPrefs({}))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(eventType: string, channel: Channel, next: boolean) {
    if (!prefs) return;
    const savingId = `${eventType}:${channel}`;
    const previous = prefs;
    const optimistic: Prefs = {
      ...prefs,
      [eventType]: { ...prefs[eventType], [channel]: next },
    };
    setPrefs(optimistic);
    setSavingKey(savingId);
    try {
      const res = await api<{ prefs: Prefs }>('/api/notifications/prefs', {
        method: 'PATCH',
        body: { prefs: { [eventType]: { [channel]: next } } },
      });
      setPrefs(res.prefs);
    } catch (err) {
      setPrefs(previous);
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-caption font-bold text-foreground">Notifications</h2>
        <p className="text-2xs text-muted-foreground">
          Choisis les événements pour lesquels tu souhaites être notifié·e, par courriel ou dans
          l&apos;application.
        </p>
      </div>

      {loading || !prefs ? (
        <div className="flex flex-col gap-4 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {EVENT_TYPES.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <label className="flex items-center gap-2">
                  <span className="text-2xs font-medium text-muted-foreground">Courriel</span>
                  <Switch
                    checked={isEnabled(prefs, key, 'email')}
                    disabled={savingKey === `${key}:email`}
                    onChange={(v) => void toggle(key, 'email', v)}
                    label={`${label} — courriel`}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-2xs font-medium text-muted-foreground">App</span>
                  <Switch
                    checked={isEnabled(prefs, key, 'inApp')}
                    disabled={savingKey === `${key}:inApp`}
                    onChange={(v) => void toggle(key, 'inApp', v)}
                    label={`${label} — dans l'application`}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
