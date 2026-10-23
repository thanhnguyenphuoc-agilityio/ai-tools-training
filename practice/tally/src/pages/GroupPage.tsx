import { useCallback, useEffect, useState } from 'react';
import type { GroupDto } from '../../shared/types';
import { api, ApiError } from '../api';
import type { Navigate } from '../App';
import { ExpenseForm } from '../components/ExpenseForm';
import { ExpenseList } from '../components/ExpenseList';
import { JoinPanel } from '../components/JoinPanel';
import { MembersPanel } from '../components/MembersPanel';
import { OwnerKeyBanner } from '../components/OwnerKeyBanner';
import { SettlePanel } from '../components/SettlePanel';
import { todayLocal } from '../dates';
import { downloadTextFile } from '../download';
import { buildGroupCsv, csvFileName } from '../groupCsv';
import { rememberGroup } from '../history';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/types';
import './GroupPage.scss';

type Tab = 'expenses' | 'settle' | 'members';
const TABS: [Tab, MessageKey][] = [
  ['expenses', 'group.tabs.expenses'],
  ['settle', 'group.tabs.settle'],
  ['members', 'group.tabs.members'],
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
  const [newOwnerKey, setNewOwnerKey] = useState<string | null>(() => history.state?.ownerKey ?? null);

  const reload = useCallback(async () => {
    try {
      const g = await api.getGroup(code);
      setGroup(g);
      setError(null);
      rememberGroup(g.code, g.name);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? t('group.notFound') : errorMessage(err));
    }
  }, [code, t, errorMessage]);

  useEffect(() => {
    const key = takeOwnerKeyFromHash();
    const claim = key
      ? api.claimOwner(code, key).catch((err) => setError(t('group.badRecoveryLink', { message: errorMessage(err) })))
      : Promise.resolve();
    claim.then(reload);
    // Run once per group code (the owner key must be claimed only once), not
    // again when reload's identity changes with the locale.
  }, [code]);

  const dismissKey = () => {
    history.replaceState(null, '', location.pathname);
    setNewOwnerKey(null);
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
      <section className="card stack stack--tight">
        <div className="cluster cluster--between">
          <h1 className="group-page__title">{group.name}</h1>
          {group.me.isOwner && <span className="badge">{t('common.ownerBadge')}</span>}
        </div>
        <div className="cluster">
          <span className="text text--mono">{group.code}</span>
          <button className="button button--ghost button--small" onClick={() => navigator.clipboard?.writeText(link)}>
            {t('group.copyInvite')}
          </button>
          {/* Joined members only. An interface rule, not a security boundary: anyone with the link sees the same data. */}
          {group.me.memberId && (
            <button className="button button--ghost button--small" onClick={exportCsv}>
              {t('csvExport.download')}
            </button>
          )}
        </div>
      </section>

      {newOwnerKey && group.me.isOwner && (
        <OwnerKeyBanner code={group.code} ownerKey={newOwnerKey} onDismiss={dismissKey} />
      )}
      {error && <p className="text text--error">{error}</p>}
      {!group.me.memberId && <JoinPanel group={group} onDone={reload} />}

      <nav className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`tabs__tab${tab === id ? ' tabs__tab--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {t(label)}
          </button>
        ))}
      </nav>

      {tab === 'expenses' && (
        <div className="group-page__panels">
          {group.me.memberId && <ExpenseForm group={group} onSaved={reload} onStale={reload} />}
          <ExpenseList group={group} onChanged={reload} />
        </div>
      )}
      {tab === 'settle' && <SettlePanel group={group} onChanged={reload} />}
      {tab === 'members' && <MembersPanel group={group} onChanged={reload} />}
    </div>
  );
}
