'use client';

// The app's ONE "are you sure?" surface — replaces the native window.confirm()
// dialog (unstyled, unbranded, appears dead-center regardless of where the
// triggering click was) with the same Modal chrome every other dialog in the
// app uses. Imperative API mirrors useToast()'s toast(): call confirm({...})
// from an event handler, await the boolean.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action (delete/remove) → red confirm button. */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

const DESTRUCTIVE_BTN = 'bg-destructive text-destructive-foreground hover:bg-destructive/90';

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('Common.confirm');
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  function settle(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title ?? (state.danger ? t('deleteTitle') : t('title'))}
          onClose={() => settle(false)}
        >
          <p className="text-sm whitespace-pre-line text-foreground">{state.message}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" className="w-fit" onClick={() => settle(false)}>
              {state.cancelLabel ?? t('cancel')}
            </Button>
            <Button
              type="button"
              className={cn('w-fit', state.danger && DESTRUCTIVE_BTN)}
              onClick={() => settle(true)}
              autoFocus
            >
              {state.confirmLabel ?? (state.danger ? t('deleteAction') : t('confirmAction'))}
            </Button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

/** `if (!(await confirm({ message: 'Supprimer X ?', danger: true }))) return;` */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}
