import { useState } from 'react';
import { useAccount } from '../account';
import { useDialog } from '../hooks/useDialog';
import { useI18n, type UiMessage } from '../i18n';
import { useToast } from '../toast';
import './DeleteAccountDialog.scss';

export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { deleteAccount } = useAccount();
  const { t, message } = useI18n();
  const notify = useToast();
  const [error, setError] = useState<UiMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const panel = useDialog(onClose, { canClose: !deleting });

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await deleteAccount();
      notify('deleteAccount.done');
      onClose();
    } catch (err) {
      setError({ error: err });
      setDeleting(false);
    }
  }

  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('deleteAccount.title')}
      onClick={() => {
        if (!deleting) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="dialog__panel card stack delete-account"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="card__title">{t('deleteAccount.title')}</h2>
        <p className="text">{t('deleteAccount.deleted')}</p>
        <p className="text">{t('deleteAccount.kept')}</p>
        <p className="text text--muted text--small">{t('deleteAccount.ownerWarning')}</p>
        {error && <p className="text text--error">{message(error)}</p>}
        <div className="cluster">
          <button
            type="button"
            className="button delete-account__danger-button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {t('deleteAccount.confirm')}
          </button>
          <button type="button" className="button button--ghost" onClick={onClose} disabled={deleting}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
