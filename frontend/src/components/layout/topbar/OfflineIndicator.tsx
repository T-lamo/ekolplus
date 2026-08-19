'use client';

// Persistent "N en attente" pill — NOT a toast (toasts auto-dismiss after
// 4s; this must stay visible for as long as entries are queued). Drives
// the queue's drain triggers: the browser's online event, the tab
// regaining foreground focus, and a 30s interval fallback (the online
// event alone is known to be unreliable on Android Chrome — this
// redundancy is deliberate, see the design spec).
import { useCallback, useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { drain, listPending, subscribe, type QueuedMutation } from '@/lib/offline-queue';
import { OFFLINE_SYNC } from '@/lib/constants';

export function OfflineIndicator() {
  const user = useUser();
  const { toast } = useToast();
  const [pending, setPending] = useState<QueuedMutation[]>([]);
  const [reconnectNeeded, setReconnectNeeded] = useState(false);
  const drainingRef = useRef(false);
  const wasPendingRef = useRef(false);

  const refresh = useCallback(() => {
    if (!user) {
      setPending([]);
      return;
    }
    listPending(user.id)
      .then(setPending)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  const runDrain = useCallback(() => {
    if (!user || drainingRef.current) return;
    drainingRef.current = true;
    drain(user.id)
      .then((result) => {
        setReconnectNeeded(result.stoppedReason === 'auth');
        if (result.failed > 0) {
          toast(OFFLINE_SYNC.failedToast(result.failed), 'error');
        }
      })
      .finally(() => {
        drainingRef.current = false;
      });
  }, [user, toast]);

  useEffect(() => {
    if (!user) return;
    runDrain();
    function onVisible() {
      if (document.visibilityState === 'visible') runDrain();
    }
    window.addEventListener('online', runDrain);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(runDrain, 30_000);
    return () => {
      window.removeEventListener('online', runDrain);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [user, runDrain]);

  useEffect(() => {
    if (wasPendingRef.current && pending.length === 0) {
      toast(OFFLINE_SYNC.syncedToast, 'success');
    }
    wasPendingRef.current = pending.length > 0;
  }, [pending.length, toast]);

  if (pending.length === 0) return null;

  return (
    <div className="hidden h-10 items-center gap-1.5 rounded-full border border-warning-foreground/20 bg-warning px-3.5 text-xs font-medium text-warning-foreground sm:flex">
      <WifiOff size={13} />
      {reconnectNeeded
        ? OFFLINE_SYNC.reconnect(pending.length)
        : OFFLINE_SYNC.offline(pending.length)}
    </div>
  );
}
