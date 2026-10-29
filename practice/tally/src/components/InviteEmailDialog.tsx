import { useRef, useState } from 'react';
import type { GroupDto, MemberDto } from '../../shared/types';
import { api } from '../api';
import { useDialog } from '../hooks/useDialog';
import { useI18n } from '../i18n';
import './InviteEmailDialog.scss';

export function InviteEmailDialog({
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
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useDialog(onClose, { canClose: !busy });
  // True when the current press started on the backdrop itself, so a drag that starts in the panel does not close it.
  const pressedOnBackdrop = useRef(false);

  async function save(value: string) {
    setBusy(true);
    setError(null);
    try {
      await api.updateMember(group.code, member.id, { inviteEmail: value });
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
      aria-label={t('memberInvite.title', { name: member.name })}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const onBackdrop = pressedOnBackdrop.current && e.target === e.currentTarget;
        pressedOnBackdrop.current = false;
        if (onBackdrop && !busy) onClose();
      }}
    >
      <div ref={panel} tabIndex={-1} className="dialog__panel card stack invite-email-dialog">
        <h2 className="card__title">{t('memberInvite.title', { name: member.name })}</h2>
        <p className="text text--muted text--small">{t('memberInvite.emailHint')}</p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save(email.trim());
          }}
        >
          <label className="field" htmlFor="invite-email-input">
            <span className="field__label">{t('memberInvite.emailLabel')}</span>
            <input
              id="invite-email-input"
              type="email"
              className="field__control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              data-autofocus
            />
          </label>
          {error && <p className="text text--error">{error}</p>}
          <div className="cluster">
            <button className="button" type="submit" disabled={busy}>
              {t('memberInvite.save')}
            </button>
            {member.invited && (
              <button className="button button--ghost" type="button" onClick={() => void save('')} disabled={busy}>
                {t('memberInvite.clear')}
              </button>
            )}
            <button className="button button--ghost" type="button" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
