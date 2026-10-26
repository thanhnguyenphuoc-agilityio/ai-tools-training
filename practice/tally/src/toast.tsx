// Short confirmation messages after a save (ui_redesign). A toast keeps the
// message key and its variables, not the translated text, so a visible toast
// follows a language change (see stale_language_messages). Errors are not
// toasts: they stay next to the form that caused them.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from './i18n';
import type { MessageKey, Vars } from './i18n/types';
import { Icon } from './components/Icon';
import './toast.scss';

export interface Toast {
  id: number;
  key: MessageKey;
  vars?: Vars;
}

/** How long a toast stays on screen, in milliseconds. */
export const TOAST_DURATION = 4000;
/** At most this many toasts are visible; a new one pushes out the oldest. */
export const TOAST_LIMIT = 3;

/** The queue after adding a toast: newest last, oldest dropped past the limit. */
export function pushToast(queue: Toast[], toast: Toast, limit = TOAST_LIMIT): Toast[] {
  return [...queue, toast].slice(-limit);
}

export function dropToast(queue: Toast[], id: number): Toast[] {
  return queue.filter((t) => t.id !== id);
}

type Notify = (key: MessageKey, vars?: Vars) => void;

const ToastContext = createContext<Notify | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setQueue((q) => dropToast(q, id)), []);
  const notify = useCallback<Notify>((key, vars) => {
    // The id is taken outside the updater, which React may call twice in StrictMode.
    const id = nextId++;
    setQueue((q) => pushToast(q, { id, key, vars }));
  }, []);
  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toasts queue={queue} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Shows a confirmation toast: notify('toast.expenseAdded'). */
export function useToast(): Notify {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// The live region holds only the message texts and is always mounted, so screen readers announce each toast as
// it is added without reading the close buttons. The visible cards, with their buttons, are outside it.
function Toasts({ queue, onDismiss }: { queue: Toast[]; onDismiss: (id: number) => void }) {
  const { t } = useI18n();
  return (
    <>
      <div className="toasts__live" role="status" aria-live="polite">
        {queue.map((toast) => (
          <p key={toast.id}>{t(toast.key, toast.vars)}</p>
        ))}
      </div>
      <div className="toasts" aria-hidden={queue.length === 0 ? true : undefined}>
        {queue.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const { t } = useI18n();
  // The timer pauses while the pointer is over the toast or its button has focus, and restarts with the full
  // duration afterwards (WCAG 2.2.1).
  const [paused, setPaused] = useState(false);
  const item = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss, paused]);

  return (
    <div
      ref={item}
      className="toasts__item"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!item.current?.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <Icon name="check" className="toasts__icon" />
      <span className="toasts__text">{t(toast.key, toast.vars)}</span>
      <button type="button" className="toasts__close" onClick={() => onDismiss(toast.id)} aria-label={t('common.close')}>
        <Icon name="close" />
      </button>
    </div>
  );
}
