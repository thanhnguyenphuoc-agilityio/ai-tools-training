import { useRef, useState } from 'react';
import type { GroupDto, MemberDto } from '../../shared/types';
import { api } from '../api';
import { useDialog } from '../hooks/useDialog';
import { useI18n, type UiMessage } from '../i18n';

// The owner gives a wrongly claimed name back: one confirmation, then the device and account lose the member.
export function ReleaseMemberDialog({
  group,
  member,
  onClose,
  onChanged,
}: {
  group: GroupDto;
  member: MemberDto;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, message } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiMessage | null>(null);
  const panel = useDialog(onClose, { canClose: !busy });
  // True when the current press started on the backdrop itself, so a drag that ends there does not close the dialog.
  const pressedOnBackdrop = useRef(false);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.releaseMember(group.code, member.id);
      onClose();
      onChanged();
    } catch (err) {
      setError({ error: err });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('members.releaseLabel', { name: member.name })}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const onBackdrop = pressedOnBackdrop.current && e.target === e.currentTarget;
        pressedOnBackdrop.current = false;
        if (onBackdrop && !busy) onClose();
      }}
    >
      <div ref={panel} tabIndex={-1} className="dialog__panel card stack">
        <h2 className="card__title">{t('members.releaseLabel', { name: member.name })}</h2>
        <p className="text text--muted text--small">{t('members.releaseConfirm', { name: member.name })}</p>
        <form onSubmit={confirm} className="stack">
          {error && <p className="text text--error">{message(error)}</p>}
          <div className="cluster">
            <button className="button" type="submit" disabled={busy}>
              {t('members.release')}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={onClose}
              disabled={busy}
              data-autofocus
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
