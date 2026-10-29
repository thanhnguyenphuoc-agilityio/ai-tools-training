import { useRef, type ReactNode } from 'react';
import { useDialog } from '../hooks/useDialog';
import { useI18n, type UiMessage } from '../i18n';

// Confirms a destructive action in an app dialog (useDialog), not window.confirm.
export function ConfirmDialog({
  title,
  detail,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  detail?: ReactNode;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error: UiMessage | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t, message: renderMessage } = useI18n();
  const panel = useDialog(onCancel, { canClose: !busy });
  const pressedOnBackdrop = useRef(false);

  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const onBackdrop = pressedOnBackdrop.current && e.target === e.currentTarget;
        pressedOnBackdrop.current = false;
        if (onBackdrop && !busy) onCancel();
      }}
    >
      <div ref={panel} tabIndex={-1} className="dialog__panel card stack">
        <h2 className="card__title">{title}</h2>
        {detail && <p className="text text--muted text--small">{detail}</p>}
        <p className="text text--muted">{message}</p>
        {error && <p className="text text--error">{renderMessage(error)}</p>}
        <div className="cluster">
          <button className="button button--danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
          <button className="button button--ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
