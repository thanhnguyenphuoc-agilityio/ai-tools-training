import { useCallback, useEffect, useState } from 'react';
import type { ExpenseDto, GroupDto } from '../../shared/types';
import { useAccount } from '../account';
import { api, ApiError } from '../api';
import { copyText } from '../clipboard';
import type { Navigate } from '../App';
import { ExpenseForm } from '../components/ExpenseForm';
import { ExpenseList } from '../components/ExpenseList';
import { GroupExpiry } from '../components/GroupExpiry';
import { GroupSummaryBar } from '../components/GroupSummaryBar';
import { Icon, type IconName } from '../components/Icon';
import { JoinPanel } from '../components/JoinPanel';
import { MembersPanel } from '../components/MembersPanel';
import { OwnerAccessNote, OwnerKeyBanner } from '../components/OwnerKeyBanner';
import { SettlePanel } from '../components/SettlePanel';
import { todayLocal } from '../dates';
import { downloadTextFile } from '../download';
import { buildGroupCsv, csvFileName } from '../groupCsv';
import { forgetGroup, rememberGroup } from '../history';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/types';
import { useToast } from '../toast';
import './GroupPage.scss';

type Tab = 'expenses' | 'settle' | 'members';
const TABS: [Tab, MessageKey, IconName][] = [
  ['expenses', 'group.tabs.expenses', 'receipt'],
  ['settle', 'group.tabs.settle', 'swap'],
  ['members', 'group.tabs.members', 'users'],
];

/** "#owner=KEY" in a recovery link. Read once, then removed from the URL. */
function takeOwnerKeyFromHash(): string | null {
  const match = location.hash.match(/owner=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  history.replaceState(history.state, '', location.pathname);
  return match[1];
}

export function GroupPage({ code, navigate }: { code: string; navigate: Navigate }) {
  const { t, errorMessage } = useI18n();
  const [group, setGroup] = useState<GroupDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('expenses');
  const notify = useToast();
  const [newOwnerKey, setNewOwnerKey] = useState<string | null>(() => history.state?.ownerKey ?? null);
  // Shown after creating a group while signed in: owner access is tied to the account, no recovery link.
  const [showOwnerNote, setShowOwnerNote] = useState<boolean>(
    () => !!history.state?.created && history.state?.ownerKey == null,
  );
  const { version } = useAccount();
  // The expense being edited (edit_expense); null while the form adds a new one.
  const [editing, setEditing] = useState<ExpenseDto | null>(null);

  const reload = useCallback(async () => {
    try {
      const g = await api.getGroup(code);
      setGroup(g);
      // An expense deleted while it was being edited leaves edit mode, so the form cannot save to a missing row.
      setEditing((current) => (current && g.expenses.some((e) => e.id === current.id) ? current : null));
      setError(null);
      rememberGroup(g.code, g.name);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        forgetGroup(code);
        setError(t('group.notFound'));
      } else {
        setError(errorMessage(err));
      }
    }
  }, [code, t, errorMessage]);

  useEffect(() => {
    const key = takeOwnerKeyFromHash();
    // reload() clears the error on success, so a refused link message is kept and set again after the reload.
    let refusal: string | null = null;
    const claim = key
      ? api
          .claimOwner(code, key)
          .then((res) => {
            if (res.attached) notify('toast.ownerAttached');
          })
          .catch((err) => {
            if (err instanceof ApiError && err.status === 404) {
              forgetGroup(code);
              setError(t('group.notFound'));
            } else {
              refusal = t('group.badRecoveryLink', { message: errorMessage(err) });
            }
          })
      : Promise.resolve();
    claim.then(async () => {
      await reload();
      if (refusal) setError(refusal);
    });
    // Run once per group code (the owner key must be claimed only once), not
    // again when reload's identity changes with the locale.
  }, [code]);

  useEffect(() => {
    if (version > 0) reload();
  }, [version, reload]);

  const linkAccount = async () => {
    try {
      await api.linkAccount(code);
      notify('toast.accountLinked');
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const dismissKey = () => {
    history.replaceState(null, '', location.pathname);
    setNewOwnerKey(null);
    setShowOwnerNote(false);
  };

  if (error && !group) {
    return (
      <div className="card stack">
        <p className="text text--error">{error}</p>
        <button className="button" onClick={() => navigate('/')}>
          {t('common.backHome')}
        </button>
      </div>
    );
  }
  if (!group) return <p className="text text--muted">{t('common.loading')}</p>;

  const link = `${location.origin}/g/${group.code}`;
  const exportCsv = () =>
    downloadTextFile(
      csvFileName(group.name, todayLocal(), t('app.title')),
      buildGroupCsv(group, t),
      'text/csv;charset=utf-8',
    );
  return (
    <div className="group-page">
      <section className="group-page__head stack stack--tight">
        <div className="cluster">
          <h1 className="group-page__title">{group.name}</h1>
          {group.me.isOwner && <span className="badge">{t('common.ownerBadge')}</span>}
        </div>
        <div className="cluster">
          <span className="text text--mono text--muted">{group.code}</span>
          <button
            className="button button--ghost button--small"
            onClick={() => copyText(link).then((ok) => ok && notify('toast.inviteCopied'))}
          >
            <Icon name="link" />
            {t('group.copyInvite')}
          </button>
          {/* Joined members only. An interface rule, not a security boundary: anyone with the link sees the same data. */}
          {group.me.memberId && (
            <button className="button button--ghost button--small" onClick={exportCsv}>
              <Icon name="download" />
              {t('csvExport.download')}
            </button>
          )}
          {group.canLinkAccount && (
            <button className="button button--ghost button--small" onClick={linkAccount}>
              <Icon name="user" />
              {t('account.link')}
            </button>
          )}
        </div>
      </section>

      <GroupSummaryBar group={group} />
      <GroupExpiry group={group} />

      {newOwnerKey && group.me.isOwner && (
        <OwnerKeyBanner code={group.code} ownerKey={newOwnerKey} onDismiss={dismissKey} />
      )}
      {showOwnerNote && group.me.isOwner && !newOwnerKey && <OwnerAccessNote onDismiss={dismissKey} />}
      {error && <p className="text text--error">{error}</p>}
      {!group.me.memberId && <JoinPanel group={group} onDone={reload} />}

      {/* Below md the tab list is a bottom bar within thumb reach (ui_redesign); from md up it sits above the content. */}
      <nav className="tabs tabs--bottom-mobile" role="tablist">
        {TABS.map(([id, label, icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`tabs__tab${tab === id ? ' tabs__tab--active' : ''}`}
            onClick={() => {
              setTab(id);
              window.scrollTo(0, 0);
            }}
          >
            <Icon name={icon} className="tabs__icon" />
            {t(label)}
          </button>
        ))}
      </nav>

      {tab === 'expenses' && (
        <div className="group-page__panels">
          {group.me.memberId && (
            <ExpenseForm
              // Keyed by the edited expense, so the fields start from its stored values each time an edit begins.
              key={editing?.id ?? 'new'}
              group={group}
              editing={editing}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                reload();
              }}
              onStale={reload}
            />
          )}
          <ExpenseList
            group={group}
            onChanged={reload}
            onEdit={
              group.me.memberId
                ? (expense) => {
                    setEditing(expense);
                    // On phones the form sits above the list, so bring it into view.
                    window.scrollTo(0, 0);
                  }
                : undefined
            }
          />
        </div>
      )}
      {tab === 'settle' && <SettlePanel group={group} onChanged={reload} />}
      {tab === 'members' && <MembersPanel group={group} onChanged={reload} />}
    </div>
  );
}
