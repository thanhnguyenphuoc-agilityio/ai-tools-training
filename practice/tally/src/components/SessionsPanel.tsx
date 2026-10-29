import { useState } from 'react';
import { attendanceMatches, endsNextDay, sessionMinutes } from '../../shared/sessions';
import type { ExpenseDto, GroupDto, SessionDto } from '../../shared/types';
import { api } from '../api';
import { todayLocal } from '../dates';
import { useGroupMoney } from '../hooks/useGroupMoney';
import { useI18n, type UiMessage } from '../i18n';
import { involvesRemovedMember } from '../expenseRow';
import { useToast } from '../toast';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import './SessionsPanel.scss';

/**
 * Lists the group's sessions (attendance_split): the owner takes attendance, every member adds a cost to a session.
 * A cost is an ordinary expense; the session only preselects its participants (see ExpenseForm).
 */
export function SessionsPanel({
  group,
  onChanged,
  onAddCost,
  onEditCost,
}: {
  group: GroupDto;
  onChanged: () => void;
  onAddCost: (session: SessionDto) => void;
  onEditCost: (expense: ExpenseDto) => void;
}) {
  const { t, day: formatDay, message } = useI18n();
  const { money } = useGroupMoney(group);
  const notify = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SessionDto | null>(null);

  const activeMembers = group.members.filter((m) => !m.removed);
  const removedIds = group.members.filter((m) => m.removed).map((m) => m.id);
  const latestSession = group.sessions[0];

  const [day, setDay] = useState(todayLocal());
  const [startsAt, setStartsAt] = useState('19:00');
  const [endsAt, setEndsAt] = useState('21:00');
  const [note, setNote] = useState('');
  const [presentSet, setPresentSet] = useState<Set<string>>(new Set());
  const [error, setError] = useState<UiMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const nameOf = (id: string) => group.members.find((m) => m.id === id)?.name ?? t('common.unknownMember');

  function openNewForm() {
    const activeIds = new Set(activeMembers.map((m) => m.id));
    setEditingSession(null);
    setDay(todayLocal());
    setStartsAt(latestSession?.startsAt ?? '19:00');
    setEndsAt(latestSession?.endsAt ?? '21:00');
    setNote('');
    // A new session starts from the latest one's attendance, limited to members who are still active.
    setPresentSet(
      latestSession
        ? new Set(latestSession.presentIds.filter((id) => activeIds.has(id)))
        : new Set(activeMembers.map((m) => m.id)),
    );
    setError(null);
    setFormOpen(true);
  }

  function openEditForm(session: SessionDto) {
    const activeIds = new Set(activeMembers.map((m) => m.id));
    setEditingSession(session);
    setDay(session.day);
    setStartsAt(session.startsAt);
    setEndsAt(session.endsAt);
    setNote(session.note);
    setPresentSet(new Set(session.presentIds.filter((id) => activeIds.has(id))));
    setError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingSession(null);
    setError(null);
  }

  function toggleMember(id: string) {
    const next = new Set(presentSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPresentSet(next);
  }

  async function handleSaveSession(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { day, startsAt, endsAt, note, presentIds: Array.from(presentSet) };
      if (editingSession) {
        await api.updateSession(group.code, editingSession.id, payload);
      } else {
        await api.createSession(group.code, payload);
      }
      notify('toast.sessionSaved');
      closeForm();
      onChanged();
    } catch (err) {
      setError({ error: err });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(session: SessionDto) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteSession(group.code, session.id);
      setPendingDelete(null);
      notify('toast.sessionDeleted');
      onChanged();
    } catch (err) {
      setError({ error: err });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sessions-panel stack">
      {group.me.isOwner && !formOpen && (
        <div className="cluster">
          <button className="button" onClick={openNewForm}>
            <Icon name="plus" />
            {t('sessions.new')}
          </button>
        </div>
      )}

      {formOpen && (
        <section className="card sessions-panel__form">
          <h2 className="card__title">{t(editingSession ? 'sessions.edit' : 'sessions.new')}</h2>
          <form onSubmit={handleSaveSession} className="stack">
            <div className="columns">
              <label className="field">
                <span className="field__label">{t('sessions.day')}</span>
                <input
                  type="date"
                  className="field__control"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">{t('sessions.start')}</span>
                <input
                  type="time"
                  className="field__control"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">{t('sessions.end')}</span>
                <input
                  type="time"
                  className="field__control"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  required
                />
              </label>
            </div>

            <label className="field">
              <span className="field__label">{t('sessions.note')}</span>
              <input
                type="text"
                className="field__control"
                value={note}
                maxLength={80}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <fieldset className="field">
              <legend className="field__label">{t('sessions.present')}</legend>
              <ul className="list">
                {activeMembers.map((m) => (
                  <li key={m.id} className="list__item">
                    <label className="field field--inline">
                      <input type="checkbox" checked={presentSet.has(m.id)} onChange={() => toggleMember(m.id)} />
                      {m.name}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            {error && <p className="text text--error">{message(error)}</p>}

            <div className="cluster">
              <button className="button" disabled={busy}>
                {t('common.save')}
              </button>
              <button type="button" className="button button--ghost" onClick={closeForm} disabled={busy}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </section>
      )}

      {error && !formOpen && !pendingDelete && <p className="text text--error">{message(error)}</p>}

      {group.sessions.length === 0 ? (
        <p className="text text--muted">{t('sessions.empty')}</p>
      ) : (
        <ul className="list sessions-panel__list">
          {group.sessions.map((session) => {
            const nextDay = endsNextDay(session.startsAt, session.endsAt);
            const mins = sessionMinutes(session.startsAt, session.endsAt);
            const sessionCosts = group.expenses.filter((e) => e.sessionId === session.id);
            const totalCost = sessionCosts.reduce((acc, e) => acc + e.amount, 0);

            return (
              <li key={session.id} className="card sessions-panel__session stack">
                <div className="cluster cluster--between sessions-panel__header">
                  <div className="stack stack--tight">
                    <div className="cluster">
                      <span className="text text--strong">{formatDay(session.day)}</span>
                      <span className="text">{t('sessions.range', { start: session.startsAt, end: session.endsAt })}</span>
                      {nextDay && <span className="badge">{t('sessions.nextDay')}</span>}
                      <span className="text text--muted text--small">
                        {t('sessions.duration', { hours: Math.floor(mins / 60), minutes: mins % 60 })}
                      </span>
                    </div>
                    {session.note && <p className="text text--muted">{session.note}</p>}
                    <p className="text text--small text--muted">
                      {t('sessions.presentList', {
                        count: session.presentIds.length,
                        names: session.presentIds.map(nameOf).join(t('common.separator')),
                      })}
                    </p>
                  </div>

                  {group.me.isOwner && (
                    <div className="cluster">
                      <button
                        className="button button--ghost button--small"
                        onClick={() => openEditForm(session)}
                        aria-label={t('sessions.edit')}
                      >
                        <Icon name="pencil" />
                        {t('sessions.edit')}
                      </button>
                      <button
                        className="button button--ghost button--small text--negative"
                        onClick={() => {
                          setError(null);
                          setPendingDelete(session);
                        }}
                        aria-label={t('sessions.delete')}
                      >
                        <Icon name="trash" />
                        {t('sessions.delete')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="sessions-panel__costs stack stack--tight">
                  <div className="cluster cluster--between">
                    <span className="text text--strong">{t('sessions.total', { amount: money(totalCost) })}</span>
                    {group.me.memberId && (
                      <button className="button button--small" onClick={() => onAddCost(session)}>
                        <Icon name="plus" />
                        {t('sessions.addCost')}
                      </button>
                    )}
                  </div>

                  {sessionCosts.length > 0 && (
                    <ul className="list">
                      {sessionCosts.map((e) => {
                        const matches = attendanceMatches(session.presentIds, e.shares, removedIds);
                        // Same rule as the expense list: an expense that involves a removed member is never edited.
                        const canEdit =
                          (group.me.isOwner || (!!group.me.memberId && e.createdBy === group.me.memberId)) &&
                          !involvesRemovedMember(e, group.members);

                        return (
                          <li key={e.id} className="list__item cluster cluster--between">
                            <div className="stack stack--tight">
                              <div className="cluster">
                                <span className="text text--strong">{e.description}</span>
                                <span className="text text--positive">{money(e.amount)}</span>
                                <span className="text text--muted text--small">
                                  {t('sessions.paidBy', { name: nameOf(e.payerId) })}
                                </span>
                              </div>
                              {!matches && <span className="badge badge--warning">{t('sessions.mismatch')}</span>}
                            </div>
                            {canEdit && (
                              <button
                                className="button button--ghost button--small"
                                onClick={() => onEditCost(e)}
                                aria-label={t('expenseList.edit')}
                              >
                                <Icon name="pencil" />
                                {t('expenseList.edit')}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('sessions.deleteTitle')}
          detail={
            <>
              {formatDay(pendingDelete.day)}
              {t('common.separator')}
              {t('sessions.range', { start: pendingDelete.startsAt, end: pendingDelete.endsAt })}
            </>
          }
          message={t('sessions.confirmDelete')}
          confirmLabel={t('sessions.confirmDeleteButton')}
          busy={busy}
          error={error}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => confirmDelete(pendingDelete)}
        />
      )}
    </div>
  );
}
