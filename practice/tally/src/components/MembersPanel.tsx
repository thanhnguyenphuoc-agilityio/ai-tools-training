import { useState } from 'react';
import { CURRENCIES, getCurrency } from '../../shared/currency';
import { BANKS, findBank, type GroupDto, type MemberDto } from '../../shared/types';
import { useAccount } from '../account';
import { api } from '../api';
import { useI18n, type UiMessage } from '../i18n';
import { canEditAccount, canReleaseMember, canSetInviteEmail, canTransferTo } from '../ownerTools';
import { useToast } from '../toast';
import { Icon } from './Icon';
import { InviteEmailDialog } from './InviteEmailDialog';
import { KeepGroup } from './KeepGroup';
import { ReleaseMemberDialog } from './ReleaseMemberDialog';
import { RemoveMemberDialog } from './RemoveMemberDialog';
import { TransferOwnerDialog } from './TransferOwnerDialog';
import './MembersPanel.scss';

export function MembersPanel({ group, onChanged }: { group: GroupDto; onChanged: () => void }) {
  const { t, message } = useI18n();
  const notify = useToast();
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<UiMessage | null>(null);
  const [removingMember, setRemovingMember] = useState<MemberDto | null>(null);
  const [releasingMember, setReleasingMember] = useState<MemberDto | null>(null);
  const [transferringMember, setTransferringMember] = useState<MemberDto | null>(null);
  const [invitingMember, setInvitingMember] = useState<MemberDto | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const me = group.members.find((m) => m.id === group.me.memberId);
  const active = group.members.filter((m) => !m.removed);
  const removed = group.members.filter((m) => m.removed);

  const run = (action: Promise<unknown>, done: () => void) =>
    action
      .then(() => {
        setError(null);
        done();
        onChanged();
      })
      .catch((err) => setError({ error: err }));
  return (
    <div className="stack">
      {me && (
        <BankForm
          key={`${me.id}-${me.bankSource}`}
          code={group.code}
          member={me}
          accountLinked={group.me.accountLinked}
          onSaved={onChanged}
        />
      )}

      <section className="card stack">
        <h2 className="card__title">{t('members.listTitle', { count: active.length })}</h2>
        <ul className="list list--divided">
          {active.map((m) => {
            const bank = findBank(m.bankBin);
            return (
              <li key={m.id} className="list__item stack">
                <div className="cluster cluster--between">
                  <span className="cluster">
                    <span className="text text--strong">{m.name}</span>
                    {m.isOwner && <span className="badge">{t('common.ownerBadge')}</span>}
                    {!m.claimed && <span className="text text--muted text--small">{t('members.unclaimed')}</span>}
                    {m.invited && <span className="badge">{t('memberInvite.badge')}</span>}
                  </span>
                  <span className="cluster">
                    <span className="text text--muted text--small">
                      {bank && m.accountNo ? `${bank.shortName} ${m.accountNo}` : t('members.noAccount')}
                    </span>
                    {canEditAccount(group.me, m) && (
                      <button
                        className="button button--ghost button--small"
                        onClick={() => setEditingId(m.id)}
                        aria-label={t('members.editAccountLabel', { name: m.name })}
                      >
                        {t('members.editAccount')}
                      </button>
                    )}
                    {canTransferTo(group.me, m) && (
                      <button
                        className="button button--ghost button--small"
                        onClick={() => setTransferringMember(m)}
                        aria-label={t('ownerTransfer.actionLabel', { name: m.name })}
                      >
                        {t('ownerTransfer.action')}
                      </button>
                    )}
                    {canSetInviteEmail(group.me, m) && (
                      <button
                        className="button button--ghost button--small"
                        onClick={() => setInvitingMember(m)}
                        aria-label={t('memberInvite.set')}
                      >
                        {t('memberInvite.set')}
                      </button>
                    )}
                    {canReleaseMember(group.me, m) && (
                      <button
                        className="button button--ghost button--small"
                        onClick={() => setReleasingMember(m)}
                        aria-label={t('members.releaseLabel', { name: m.name })}
                      >
                        {t('members.release')}
                      </button>
                    )}
                    {group.me.isOwner && !m.isOwner && (
                      <button
                        className="button button--ghost button--small"
                        onClick={() => setRemovingMember(m)}
                        aria-label={t('members.removeLabel', { name: m.name })}
                      >
                        {t('members.remove')}
                      </button>
                    )}
                  </span>
                </div>
                {editingId === m.id && (
                  <BankForm
                    key={m.id}
                    code={group.code}
                    member={m}
                    forOther
                    onSaved={() => {
                      setEditingId(null);
                      onChanged();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </li>
            );
          })}
          {removed.map((m) => (
            <li key={m.id} className="list__item cluster">
              <span className="text text--muted">{m.name}</span>
              <span className="badge">{t('members.removed')}</span>
              {m.removedReason && <span className="text text--muted text--small">{m.removedReason}</span>}
            </li>
          ))}
        </ul>
        {group.me.memberId && (
          <form
            className="stack member-add"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              const email = newEmail.trim();
              run(api.addMember(group.code, name, email === '' ? undefined : email), () => {
                setNewName('');
                setNewEmail('');
                notify('toast.memberAdded', { name });
              });
            }}
          >
            <input
              className="field__control member-add__input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('members.addPlaceholder')}
              aria-label={t('members.addLabel')}
              required
              maxLength={40}
            />
            <input
              type="email"
              className="field__control member-add__input"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t('memberInvite.emailLabel')}
              aria-label={t('memberInvite.emailLabel')}
              maxLength={254}
            />
            <button className="button">
              <Icon name="plus" />
              {t('members.add')}
            </button>
          </form>
        )}
        {error && <p className="text text--error">{message(error)}</p>}
      </section>

      {group.me.isOwner && <OwnerSettings group={group} onSaved={onChanged} />}

      {releasingMember && (
        <ReleaseMemberDialog
          group={group}
          member={releasingMember}
          onClose={() => setReleasingMember(null)}
          onChanged={() => {
            notify('toast.memberReleased', { name: releasingMember.name });
            onChanged();
          }}
        />
      )}

      {removingMember && (
        <RemoveMemberDialog
          group={group}
          member={removingMember}
          onClose={() => setRemovingMember(null)}
          onChanged={() => {
            notify('toast.memberRemoved', { name: removingMember.name });
            onChanged();
          }}
        />
      )}

      {transferringMember && (
        <TransferOwnerDialog
          group={group}
          member={transferringMember}
          onClose={() => setTransferringMember(null)}
          onChanged={() => {
            notify('toast.ownerTransferred', { name: transferringMember.name });
            onChanged();
          }}
        />
      )}

      {invitingMember && (
        <InviteEmailDialog
          group={group}
          member={invitingMember}
          onClose={() => setInvitingMember(null)}
          onChanged={() => {
            notify('memberInvite.saved');
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function BankForm({
  code,
  member,
  accountLinked,
  onSaved,
  forOther,
  onCancel,
}: {
  code: string;
  member: MemberDto;
  accountLinked?: boolean;
  onSaved: () => void;
  forOther?: boolean;
  onCancel?: () => void;
}) {
  const { t, message } = useI18n();
  const { user } = useAccount();
  const isGroup = member.bankSource === 'group';
  const [useDifferent, setUseDifferent] = useState(false);
  const [bankBin, setBankBin] = useState(isGroup ? (member.bankBin ?? '') : '');
  const [accountNo, setAccountNo] = useState(isGroup ? (member.accountNo ?? '') : '');
  const [accountName, setAccountName] = useState(isGroup ? (member.accountName ?? '') : '');
  const [error, setError] = useState<UiMessage | null>(null);
  const notify = useToast();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.updateMember(code, member.id, { bankBin, accountNo, accountName });
      setError(null);
      if (forOther) notify('toast.bankSavedFor', { name: member.name });
      else notify('toast.bankSaved');
      onSaved();
    } catch (err) {
      setError({ error: err });
    }
  }

  async function handleUseSaved() {
    try {
      await api.updateMember(code, member.id, { bankBin: '', accountNo: '', accountName: '' });
      setError(null);
      setUseDifferent(false);
      notify('savedBank.usingSavedNow');
      onSaved();
    } catch (err) {
      setError({ error: err });
    }
  }

  if (!forOther && member.bankSource === 'account' && !useDifferent) {
    return (
      <section className="card stack">
        <h2 className="card__title">{t('members.bankTitle')}</h2>
        <p className="text text--muted text--small">{t('members.bankHint')}</p>
        <p className="text">{t('savedBank.usingSaved')}</p>
        <div className="cluster">
          <button type="button" className="button" onClick={() => setUseDifferent(true)}>
            {t('savedBank.useDifferent')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 className="card__title">
        {forOther ? t('members.bankTitleFor', { name: member.name }) : t('members.bankTitle')}
      </h2>
      <form onSubmit={save} className="stack">
        <p className="text text--muted text--small">{forOther ? t('members.bankHintFor') : t('members.bankHint')}</p>
        <label className="field">
          <span className="field__label">{t('members.bank')}</span>
          <select className="field__control" value={bankBin} onChange={(e) => setBankBin(e.target.value)}>
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
        {error && <p className="text text--error">{message(error)}</p>}
        <div className="cluster">
          <button className="button">{t('common.save')}</button>
          {forOther && onCancel && (
            <button type="button" className="button button--ghost" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          )}
          {!forOther && member.bankSource === 'group' && accountLinked && !!user?.accountNo && (
            <button type="button" className="button button--ghost" onClick={handleUseSaved}>
              {t('savedBank.useSaved')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function OwnerSettings({ group, onSaved }: { group: GroupDto; onSaved: () => void }) {
  const { t, money, currencyName, message } = useI18n();
  const [name, setName] = useState(group.name);
  const [currencyCode, setCurrencyCode] = useState(group.currency);
  const currency = getCurrency(currencyCode) ?? CURRENCIES[group.currency];
  const coarseUnit = currency.roundOptions[currency.roundOptions.length - 1];
  const [roundCoarse, setRoundCoarse] = useState(group.roundTo > 1);
  const [error, setError] = useState<UiMessage | null>(null);
  const notify = useToast();
  const currencyLocked = group.currencyLocked;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api.updateGroup(group.code, {
        name,
        currency: currency.code,
        roundTo: roundCoarse ? coarseUnit : currency.roundOptions[0],
      });
      setError(null);
      if (res.changed) notify('toast.settingsSaved');
      onSaved();
    } catch (err) {
      setError({ error: err });
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">{t('members.settingsTitle')}</h2>
      <form onSubmit={save} className="stack">
        <label className="field">
          <span className="field__label">{t('members.groupName')}</span>
          <input
            className="field__control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </label>
        <label className="field">
          <span className="field__label">{t('members.currency')}</span>
          <select
            className="field__control"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            disabled={currencyLocked}
          >
            {Object.keys(CURRENCIES).map((c) => (
              <option key={c} value={c}>
                {currencyName(c)}
              </option>
            ))}
          </select>
          {currencyLocked && <span className="field__hint">{t('members.currencyLocked')}</span>}
        </label>
        {coarseUnit > 1 && (
          <label className="field field--inline">
            <input type="checkbox" checked={roundCoarse} onChange={(e) => setRoundCoarse(e.target.checked)} />
            {t('members.roundCoarse', { unit: money(coarseUnit, currency) })}
          </label>
        )}
        {error && <p className="text text--error">{message(error)}</p>}
        <div className="cluster">
          <button className="button">{t('common.save')}</button>
        </div>
      </form>
      {group.ownedByAccount && <p className="text text--muted">{t('ownerAccess.tied')}</p>}
      <KeepGroup group={group} onSaved={onSaved} />
    </section>
  );
}
