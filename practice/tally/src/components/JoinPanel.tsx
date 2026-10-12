import { useState } from 'react';
import type { GroupDto } from '../../shared/types';
import { api } from '../api';
import { useI18n } from '../i18n';

/** For visitors who are not a member on this device yet. */
export function JoinPanel({ group, onDone }: { group: GroupDto; onDone: () => void }) {
  const { t, errorMessage } = useI18n();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const unclaimed = group.members.filter((m) => !m.claimed);

  const run = (action: Promise<unknown>) => action.then(onDone).catch((err) => setError(errorMessage(err)));

  return (
    <section className="card stack">
      <h2 className="card__title">{t('join.title')}</h2>
      {unclaimed.length > 0 && (
        <div className="cluster">
          {unclaimed.map((m) => (
            <button key={m.id} className="button button--ghost" onClick={() => run(api.claimMember(group.code, m.id))}>
              {t('join.iAm', { name: m.name })}
            </button>
          ))}
        </div>
      )}
      <form
        className="cluster cluster--nowrap"
        onSubmit={(e) => {
          e.preventDefault();
          run(api.join(group.code, name));
        }}
      >
        <input
          className="field__control"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('join.yourName')}
          aria-label={t('join.yourName')}
          required
          maxLength={40}
        />
        <button className="button">{t('join.submit')}</button>
      </form>
      {error && <p className="text text--error">{error}</p>}
    </section>
  );
}
