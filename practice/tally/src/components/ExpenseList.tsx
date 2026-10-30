import { useState } from 'react';
import type { ExpenseDto, GroupDto } from '../../shared/types';
import { api } from '../api';
import { involvesRemovedMember, memberName, payerName, sessionLabel } from '../expenseRow';
import { useGroupMoney } from '../hooks/useGroupMoney';
import { useI18n, type UiMessage } from '../i18n';
import { useToast } from '../toast';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import './ExpenseList.scss';

export function ExpenseList({
  group,
  onChanged,
  onEdit,
}: {
  group: GroupDto;
  onChanged: () => void;
  /** Opens the expense in the form for editing (edit_expense). Omitted: no edit action. */
  onEdit?: (expense: ExpenseDto) => void;
}) {
  const { t, tp, day, message } = useI18n();
  const { money } = useGroupMoney(group);
  const notify = useToast();
  const [pendingDelete, setPendingDelete] = useState<ExpenseDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<UiMessage | null>(null);
  // Per viewer and never sent to the server (delete_settled_expense): hidden expenses are left out until this is on.
  const [showAll, setShowAll] = useState(false);
  const [hideBusy, setHideBusy] = useState<string | null>(null);
  const [hideError, setHideError] = useState<UiMessage | null>(null);
  const nameOf = (id: string | null) => memberName(group.members, id, t('common.unknownMember'));
  const anyHidden = group.expenses.some((e) => e.hiddenAt);
  // With nothing hidden the toggle is gone, so a stale "All expenses" choice must not carry over to the next hide.
  if (showAll && !anyHidden) setShowAll(false);
  const rows = showAll && anyHidden ? group.expenses : group.expenses.filter((e) => !e.hiddenAt);
  const total = rows.reduce((sum, e) => sum + e.amount, 0);

  async function confirmDelete(expense: ExpenseDto) {
    setDeleteBusy(true);
    try {
      await api.deleteExpense(group.code, expense.id);
      setPendingDelete(null);
      notify('toast.expenseDeleted');
      onChanged();
    } catch (err) {
      setDeleteError({ error: err });
    } finally {
      setDeleteBusy(false);
    }
  }

  // Hiding is reversible, so it needs no dialog; an error stays next to the list.
  async function toggleHidden(expense: ExpenseDto) {
    const hidden = !expense.hiddenAt;
    setHideBusy(expense.id);
    setHideError(null);
    try {
      await api.hideExpense(group.code, expense.id, hidden);
      notify(hidden ? 'toast.expenseHidden' : 'toast.expenseUnhidden');
      onChanged();
    } catch (err) {
      setHideError({ error: err });
    } finally {
      setHideBusy(null);
    }
  }

  return (
    <section className="card expense-list">
      <div className="cluster cluster--between expense-list__header">
        <h2 className="card__title">{t('expenseList.title')}</h2>
        <span className="text text--muted">{t('expenseList.total', { amount: money(total) })}</span>
      </div>
      {anyHidden && (
        <div className="expense-list__filter" role="group" aria-label={t('expenseList.filterLabel')}>
          <button
            type="button"
            className={showAll ? 'button button--small button--ghost' : 'button button--small'}
            aria-pressed={!showAll}
            onClick={() => setShowAll(false)}
          >
            {t('expenseList.showVisible')}
          </button>
          <button
            type="button"
            className={showAll ? 'button button--small' : 'button button--small button--ghost'}
            aria-pressed={showAll}
            onClick={() => setShowAll(true)}
          >
            {t('expenseList.showAll')}
          </button>
        </div>
      )}
      {hideError && <p className="text text--error">{message(hideError)}</p>}
      {rows.length === 0 && <p className="text text--muted">{t('expenseList.empty')}</p>}
      <ul className="list list--divided">
        {rows.map((e) => {
          const isAuthor = !!group.me.memberId && e.createdBy === group.me.memberId;
          const canDelete = group.me.isOwner || isAuthor;
          const locked = involvesRemovedMember(e, group.members);
          const meta = [
            t('expenseList.meta', {
              payer: payerName(e, group.members, t('common.unknownMember')),
              date: day(e.spentOn),
            }),
            tp('expenseList.people', e.shares.length),
            ...(e.splitMode === 'weight' ? [t('expenseList.byWeight')] : []),
            ...(e.splitMode === 'exact' ? [t('expenseList.exact')] : []),
          ].join(t('common.separator'));
          const session = e.sessionId ? group.sessions.find((s) => s.id === e.sessionId) : undefined;
          return (
            <li key={e.id} className="list__item expense-list__item">
              <div className="expense-list__row">
                <span className="text text--strong">{e.description}</span>
                <span className="expense-list__end">
                  <span className="expense-list__amount">{money(e.amount)}</span>
                  {e.receipt && (
                    <a
                      className="button button--icon"
                      href={api.receiptUrl(group.code, e.id, e.receipt.id)}
                      target="_blank"
                      rel="noopener"
                      aria-label={t('expenses.receipt.view')}
                      title={t('expenses.receipt.view')}
                    >
                      <Icon name="receipt" />
                    </a>
                  )}
                  {canDelete && !locked && !e.paidToward && onEdit && (
                    <button
                      className="button button--icon"
                      onClick={() => onEdit(e)}
                      aria-label={t('expenseList.editLabel', { description: e.description })}
                      title={t('expenseList.edit')}
                    >
                      <Icon name="pencil" />
                    </button>
                  )}
                  {canDelete && !locked && !e.paidToward && (
                    <button
                      className="button button--icon"
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDelete(e);
                      }}
                      aria-label={t('expenseList.deleteLabel', { description: e.description })}
                      title={t('expenseList.delete')}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                  {canDelete && locked && (
                    <span className="text text--muted text--small">{t('expenseList.deleteLocked')}</span>
                  )}
                  {!locked && e.paidToward && (
                    <span className="text text--muted text--small">{t('expenseList.paidTowardLocked')}</span>
                  )}
                  {canDelete && !locked && e.paidToward && (
                    <button
                      className="button button--icon"
                      onClick={() => toggleHidden(e)}
                      disabled={hideBusy === e.id}
                      aria-label={
                        e.hiddenAt
                          ? t('expenseList.unhideLabel', { description: e.description })
                          : t('expenseList.hideLabel', { description: e.description })
                      }
                      title={e.hiddenAt ? t('expenseList.unhide') : t('expenseList.hide')}
                    >
                      <Icon name={e.hiddenAt ? 'eye' : 'eyeOff'} />
                    </button>
                  )}
                </span>
              </div>
              <div className="text text--muted text--small">{meta}</div>
              {session && (
                <div>
                  <span className="badge expense-list__session">
                    {t('expenseList.sessionBadge', { label: sessionLabel(session, t, day) })}
                  </span>
                </div>
              )}
              {showAll && e.hiddenAt && (
                <div>
                  <span className="badge expense-list__hidden">{t('expenseList.hiddenBadge')}</span>
                </div>
              )}
              {e.editedAt && (
                <span className="text text--muted text--small expense-list__edited">{t('expenseList.edited')}</span>
              )}
              <div className="text text--muted text--small">
                {e.shares.map((s) => `${nameOf(s.memberId)} ${money(s.amount)}`).join(t('common.separator'))}
              </div>
            </li>
          );
        })}
      </ul>
      {pendingDelete && (
        <ConfirmDialog
          title={t('expenseList.deleteTitle')}
          detail={[pendingDelete.description, money(pendingDelete.amount), day(pendingDelete.spentOn)].join(
            t('common.separator'),
          )}
          message={t('expenseList.confirmDelete')}
          confirmLabel={t('expenseList.confirmDeleteButton')}
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => confirmDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
