import { useState } from 'react';
import type { MemberDto } from '../../shared/types';
import { api } from '../api';
import { useDialog } from '../hooks/useDialog';
import { useI18n } from '../i18n';

// "I am <name>" needs one more click: nothing is sent until the visitor confirms.
export function ClaimMemberDialog({
  code,
  member,
  onClose,
  onDone,
}: {
  code: string;
  member: MemberDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, errorMessage } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useDialog(onClose, { canClose: !busy });

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.claimMember(code, member.id);
      onClose();
      onDone();
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
      aria-label={t('join.confirmClaimSubmit', { name: member.name })}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div ref={panel} tabIndex={-1} className="dialog__panel card stack">
        <h2 className="card__title">{t('join.confirmClaimSubmit', { name: member.name })}</h2>
        <p className="text text--muted text--small">{t('join.confirmClaim', { name: member.name })}</p>
        <form onSubmit={confirm} className="stack">
          {error && <p className="text text--error">{error}</p>}
          <div className="cluster">
            <button className="button" type="submit" disabled={busy}>
              {t('join.confirmClaimSubmit', { name: member.name })}
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
