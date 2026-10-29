import { useState } from 'react';
import type { GroupDto, MemberDto } from '../../shared/types';
import { api } from '../api';
import { useDialog } from '../hooks/useDialog';
import { useI18n, type UiMessage } from '../i18n';
import './TransferOwnerDialog.scss';

// One confirmation, then the hand-over takes effect at once (the new owner does not accept).
export function TransferOwnerDialog({
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

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.transferOwner(group.code, member.id);
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
      className="dialog transfer-owner-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('ownerTransfer.title', { name: member.name })}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div ref={panel} tabIndex={-1} className="dialog__panel card stack">
        <h2 className="card__title">{t('ownerTransfer.title', { name: member.name })}</h2>
        <p className="text text--muted text--small">{t('ownerTransfer.body', { name: member.name })}</p>
        {group.locked && <p className="text text--small">{t('ownerTransfer.stopsKeeping')}</p>}
        <form onSubmit={confirm} className="stack">
          {error && <p className="text text--error">{message(error)}</p>}
          <div className="cluster">
            <button className="button transfer-owner-dialog__confirm" type="submit" disabled={busy}>
              {t('ownerTransfer.confirm')}
            </button>
            <button className="button button--ghost" type="button" onClick={onClose} disabled={busy} data-autofocus>
              {t('ownerTransfer.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
