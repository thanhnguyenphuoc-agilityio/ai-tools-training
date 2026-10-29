import { useState } from 'react';
import { useAccount } from '../account';
import { api } from '../api';
import { useI18n, type UiMessage } from '../i18n';
import { useToast } from '../toast';
import type { GroupDto } from '../../shared/types';
import './KeepGroup.scss';

export function KeepGroup({ group, onSaved }: { group: Pick<GroupDto, 'code' | 'locked'>; onSaved: () => void }) {
  const { user, requestSignIn } = useAccount();
  const { t, message } = useI18n();
  const notify = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiMessage | null>(null);

  const toggle = async (checked: boolean) => {
    setLoading(true);
    setError(null);
    try {
      if (checked) {
        const res = await api.lockGroup(group.code);
        if (res.changed) notify('keepGroup.kept');
      } else {
        const res = await api.unlockGroup(group.code);
        if (res.changed) notify('keepGroup.released');
      }
      onSaved();
    } catch (err) {
      setError({ error: err });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="keep-group">
      <h3 className="keep-group__title">{t('keepGroup.title')}</h3>
      <label className="field field--inline">
        <input
          type="checkbox"
          checked={group.locked}
          disabled={!user || loading}
          onChange={(e) => toggle(e.target.checked)}
        />
        {t('keepGroup.label')}
      </label>
      <p className="field__hint">{t('keepGroup.hint')}</p>
      {!user && (
        <div className="keep-group__sign-in">
          <span className="text text--muted text--small">{t('keepGroup.signInNote')}</span>
          <button type="button" className="button button--ghost button--small" onClick={requestSignIn}>
            {t('keepGroup.signIn')}
          </button>
        </div>
      )}
      {error && <p className="text text--error">{message(error)}</p>}
    </div>
  );
}
