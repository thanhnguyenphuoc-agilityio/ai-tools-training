import { useState, type FormEvent } from 'react';
import { BANKS } from '../../shared/types';
import { useAccount } from '../account';
import { api } from '../api';
import { useDialog } from '../hooks/useDialog';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import './SavedBankDialog.scss';

export function SavedBankDialog({ onClose }: { onClose: () => void }) {
  const { user, refresh } = useAccount();
  const { t, errorMessage } = useI18n();
  const notify = useToast();

  const [bankBin, setBankBin] = useState(user?.bankBin ?? '');
  const [accountNo, setAccountNo] = useState(user?.accountNo ?? '');
  const [accountName, setAccountName] = useState(user?.accountName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panel = useDialog(onClose, { canClose: !saving });

  async function save(
    details: { bankBin: string; accountNo: string; accountName: string },
    done: 'savedBank.saved' | 'savedBank.cleared',
  ) {
    setError(null);
    setSaving(true);
    try {
      await api.updateMe(details);
      await refresh();
      notify(done);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    void save({ bankBin, accountNo, accountName }, 'savedBank.saved');
  }

  function handleClear() {
    void save({ bankBin: '', accountNo: '', accountName: '' }, 'savedBank.cleared');
  }

  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('savedBank.title')}
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="dialog__panel card stack saved-bank"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="card__title">{t('savedBank.title')}</h2>
        <form onSubmit={handleSave} className="stack">
          <p className="text text--muted text--small">{t('savedBank.hint')}</p>
          <label className="field">
            <span className="field__label">{t('members.bank')}</span>
            <select
              data-autofocus
              className="field__control"
              value={bankBin}
              onChange={(e) => setBankBin(e.target.value)}
            >
              <option value="">{t('members.chooseBank')}</option>
              {BANKS.map((b) => (
                <option key={b.bin} value={b.bin}>
                  {b.shortName}
                </option>
              ))}
            </select>
          </label>
          <div className="columns">
            <label className="field">
              <span className="field__label">{t('members.accountNo')}</span>
              <input
                className="field__control"
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value.trim())}
                inputMode="numeric"
                maxLength={19}
              />
            </label>
            <label className="field">
              <span className="field__label">{t('members.accountName')}</span>
              <input
                className="field__control"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={t('members.accountNamePlaceholder')}
                maxLength={60}
              />
            </label>
          </div>
          {error && <p className="text text--error">{error}</p>}
          <div className="cluster">
            <button type="submit" className="button" disabled={saving}>
              {t('savedBank.save')}
            </button>
            <button type="button" className="button button--ghost" onClick={handleClear} disabled={saving}>
              {t('savedBank.clear')}
            </button>
            <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
              {t('common.close')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
