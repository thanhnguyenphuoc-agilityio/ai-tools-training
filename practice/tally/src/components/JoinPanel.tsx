import { useEffect, useState } from 'react';
import type { GroupDto, MemberDto } from '../../shared/types';
import { useAccount } from '../account';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { ClaimMemberDialog } from './ClaimMemberDialog';

/** For visitors who are not a member on this device yet. */
export function JoinPanel({ group, onDone }: { group: GroupDto; onDone: () => void }) {
  const { user } = useAccount();
  const { t, errorMessage } = useI18n();
  const notify = useToast();
  const [name, setName] = useState(user?.name.slice(0, 40) ?? '');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<MemberDto | null>(null);
  const unclaimed = group.members.filter((m) => !m.claimed && !m.removed);

  // The account may load after this panel opens; fill the field then, unless the person already typed.
  useEffect(() => {
    if (!touched && user?.name) setName(user.name.slice(0, 40));
  }, [user?.name, touched]);

  const run = (action: Promise<unknown>) =>
    action
      .then(() => {
        notify('toast.joined');
        onDone();
      })
      .catch((err) => setError(errorMessage(err)));

  return (
    <section className="card stack">
      <h2 className="card__title">{t('join.title')}</h2>
      {unclaimed.length > 0 && (
        <div className="cluster">
          {unclaimed.map((m) => (
            <button key={m.id} className="button button--ghost" onClick={() => setClaiming(m)}>
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
          onChange={(e) => {
            setTouched(true);
            setName(e.target.value);
          }}
          placeholder={t('join.yourName')}
          aria-label={t('join.yourName')}
          required
          maxLength={40}
        />
        <button className="button">{t('join.submit')}</button>
      </form>
      {error && <p className="text text--error">{error}</p>}
      {claiming && (
        <ClaimMemberDialog
          code={group.code}
          member={claiming}
          onClose={() => setClaiming(null)}
          onDone={() => run(Promise.resolve())}
        />
      )}
    </section>
  );
}
