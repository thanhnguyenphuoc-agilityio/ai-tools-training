import { useState, type FormEvent } from 'react';
import { useAccount } from '../account';
import { api } from '../api';
import { useDialog } from '../hooks/useDialog';
import { useI18n, type UiMessage } from '../i18n';
import { useToast } from '../toast';
import './AccountNameDialog.scss';

export function AccountNameDialog({ onClose }: { onClose: () => void }) {
  const { user, refresh } = useAccount();
  const { t, message } = useI18n();
  const notify = useToast();

  const [name, setName] = useState(user?.name.slice(0, 40) ?? '');
  const [error, setError] = useState<UiMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const panel = useDialog(onClose, { canClose: !saving });

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.updateMe({ name: name.trim() });
      await refresh();
      notify('accountName.saved');
      onClose();
    } catch (err) {
      setError({ error: err });
      setSaving(false);
    }
  }

  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('accountName.title')}
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="dialog__panel card stack account-name-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="card__title">{t('accountName.title')}</h2>
        <form onSubmit={handleSave} className="stack">
          <p className="text text--muted text--small">{t('accountName.hint')}</p>
          <label className="field">
            <span className="field__label">{t('accountName.label')}</span>
            <input
              data-autofocus
              className="field__control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
            />
          </label>
          {error && <p className="text text--error">{message(error)}</p>}
          <div className="cluster">
            <button type="submit" className="button" disabled={saving}>
              {t('accountName.save')}
            </button>
            <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
              {t('accountName.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
