import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour shared by every modal dialog: focus moves to the `data-autofocus` element (or the panel),
 * Tab and Shift+Tab stay inside the panel, Escape closes it (unless `canClose` is false), and focus returns to the
 * opener when it unmounts. Put the returned ref on the `dialog__panel` element and give it `tabIndex={-1}`.
 */
export function useDialog(onClose: () => void, { canClose = true }: { canClose?: boolean } = {}) {
  const panel = useRef<HTMLDivElement>(null);
  // Captured during the first render, while the opener still has focus.
  const opener = useRef<Element | null>(null);
  if (opener.current === null) opener.current = document.activeElement;
  // Latest values, so the listener below is added once and never sees stale props.
  const latest = useRef({ onClose, canClose });
  useEffect(() => {
    latest.current = { onClose, canClose };
  });

  useEffect(() => {
    const el = panel.current;
    const target = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el;
    target?.focus();
    const returnTo = opener.current;

    function onKeyDown(e: KeyboardEvent) {
      if (!el) return;
      if (e.key === 'Escape') {
        if (latest.current.canClose) latest.current.onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // The opener can be gone, e.g. the Pay button after the transfer is recorded.
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
    };
  }, []);

  return panel;
}
