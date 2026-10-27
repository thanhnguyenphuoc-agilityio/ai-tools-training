import { useRef, useState } from 'react';
import type { GroupDto, MemberDto } from '../../shared/types';
import { api } from '../api';
import { useDialog } from '../hooks/useDialog';
import { useI18n } from '../i18n';

export function RemoveMemberDialog({
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
  const { t, errorMessage } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useDialog(onClose, { canClose: !busy });
  // True when the current press started on the backdrop itself; a press that starts in the panel (e.g. selecting
  // the reason with the mouse) and ends on the backdrop must not close the dialog and lose the typed reason.
  const pressedOnBackdrop = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.removeMember(group.code, member.id, reason.trim());
      onClose();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('members.removeTitle', { name: member.name })}
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
        <h2 className="card__title">{t('members.removeTitle', { name: member.name })}</h2>
        <p className="text text--muted text--small">{t('members.removeHint')}</p>
        <form onSubmit={submit} className="stack">
          <label className="field" htmlFor="remove-member-reason">
            <span className="field__label">{t('members.removeReason')}</span>
            <input
              id="remove-member-reason"
              className="field__control"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              data-autofocus
            />
          </label>
          {error && <p className="text text--error">{error}</p>}
          <div className="cluster">
            <button className="button" type="submit" disabled={busy}>
              {t('members.remove')}
            </button>
            <button className="button button--ghost" type="button" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
