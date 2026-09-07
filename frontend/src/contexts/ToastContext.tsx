'use client';

// The app's ONE transient-feedback surface — every "Élève supprimé.",
// "Erreur réseau." etc. across the app must go through toast(), never a
// bespoke inline banner. Colors are drawn from the same --color-success/
// -destructive/-warning/-info tokens every persistent banner and button in
// the app already uses (globals.css) — the toast was previously the one
// surface hand-rolling its own green-200/red-200/gray palette instead.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastRecord {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toasts: ToastRecord[];
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  toast: () => {},
});

const TOAST_DURATION = 4000;
const EXIT_DURATION = 200;
// Caps a burst of feedback (e.g. a bulk action failing several times in a
// row) from flooding the screen — the oldest toast is dropped first.
const MAX_TOASTS = 4;

const VARIANTS: Record<ToastType, { icon: typeof CheckCircle2; classes: string }> = {
  success: {
    icon: CheckCircle2,
    classes: 'border-success-foreground/15 bg-success text-success-foreground',
  },
  error: {
    icon: XCircle,
    classes: 'border-destructive-foreground/15 bg-destructive text-destructive-foreground',
  },
  warning: {
    icon: AlertTriangle,
    classes: 'border-warning-foreground/15 bg-warning text-warning-foreground',
  },
  info: {
    icon: Info,
    classes: 'border-info-foreground/15 bg-info text-info-foreground',
  },
};

function ToastItem({
  id,
  message,
  type,
  onDismiss,
}: {
  id: number;
  message: string;
  type: ToastType;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const requestClose = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(id), EXIT_DURATION);
  }, [id, onDismiss]);

  useEffect(() => {
    // One frame between mount and "visible" so the transition actually
    // plays — flipping the class in the same paint as the mount would jump
    // straight to the end state instead of animating into it.
    const enter = requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(requestClose, TOAST_DURATION);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(timer);
    };
  }, [requestClose]);

  const { icon: Icon, classes } = VARIANTS[type];

  return (
    <div
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-max max-w-[90vw] items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm font-medium shadow-lg transition-all duration-200 ease-out',
        classes,
        visible && !leaving ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
      )}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <p className="min-w-0">{message}</p>
      <button
        type="button"
        onClick={requestClose}
        aria-label="Fermer"
        className="-mt-0.5 -mr-1 shrink-0 rounded-md p-1 text-current opacity-60 transition-opacity hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextIdRef.current++;
    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
  }, []);

  const value = useMemo(() => ({ toasts, toast: addToast }), [toasts, addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed top-0 right-0 left-0 z-[100] flex flex-col items-center gap-2 px-4 pt-4"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} id={t.id} message={t.message} type={t.type} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
