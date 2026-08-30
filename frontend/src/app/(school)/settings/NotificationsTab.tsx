'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
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
//
// `as const` is required here — the dynamic `t(`events.${key}.label`)` /
// `t(`events.${key}.desc`)` calls below only typecheck against next-intl's
// generated message keys because `key` is narrowed to a literal union;
// without `as const` this widens to `string` and the build breaks.
const EVENT_TYPE_KEYS = [
  'BULLETIN_GENERATED',
  'UNEXCUSED_ABSENCE',
  'RENEWAL_REMINDER',
  'TEACHER_ACTIVITY_DIGEST',
  'WEEKLY_SUMMARY',
] as const;

type Channel = 'email' | 'inApp';
type Prefs = Record<string, { email?: boolean; inApp?: boolean }>;

function isEnabled(prefs: Prefs, eventType: string, channel: Channel): boolean {
  const v = prefs[eventType]?.[channel];
  return v !== false;
}

export function NotificationsTab() {
  const t = useTranslations('Settings.notifications');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const {
    data: prefsData,
    loading,
    mutate,
  } = useApi<{ prefs: Prefs }>('/api/notifications/prefs', {
    onError: () => {
      mutate({ prefs: {} });
      return true;
    },
  });
  const prefs = prefsData?.prefs ?? null;
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function toggle(eventType: string, channel: Channel, next: boolean) {
    if (!prefs) return;
    const savingId = `${eventType}:${channel}`;
    const previous = prefs;
    const optimistic: Prefs = {
      ...prefs,
      [eventType]: { ...prefs[eventType], [channel]: next },
    };
    mutate({ prefs: optimistic });
    setSavingKey(savingId);
    try {
      const res = await api<{ prefs: Prefs }>('/api/notifications/prefs', {
        method: 'PATCH',
        body: { prefs: { [eventType]: { [channel]: next } } },
      });
      mutate({ prefs: res.prefs });
    } catch (err) {
      mutate({ prefs: previous });
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
        <p className="text-2xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      {loading || !prefs ? (
        <div className="flex flex-col gap-4 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {EVENT_TYPE_KEYS.map((key) => {
            const label = t(`events.${key}.label`);
            return (
              <div key={key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{label}</div>
                  <div className="text-xs text-muted-foreground">{t(`events.${key}.desc`)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <label className="flex items-center gap-2">
                    <span className="text-2xs font-medium text-muted-foreground">
                      {t('channelEmail')}
                    </span>
                    <Switch
                      checked={isEnabled(prefs, key, 'email')}
                      disabled={savingKey === `${key}:email`}
                      onChange={(v) => void toggle(key, 'email', v)}
                      label={t('emailAriaLabel', { label })}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-2xs font-medium text-muted-foreground">
                      {t('channelApp')}
                    </span>
                    <Switch
                      checked={isEnabled(prefs, key, 'inApp')}
                      disabled={savingKey === `${key}:inApp`}
                      onChange={(v) => void toggle(key, 'inApp', v)}
                      label={t('appAriaLabel', { label })}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
