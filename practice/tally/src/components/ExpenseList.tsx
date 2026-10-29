import { useState } from 'react';
import type { ExpenseDto, GroupDto } from '../../shared/types';
import { api } from '../api';
import { involvesRemovedMember, memberName, payerName } from '../expenseRow';
import { useGroupMoney } from '../hooks/useGroupMoney';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
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
  const { t, tp, day, errorMessage } = useI18n();
  const { money } = useGroupMoney(group);
  const notify = useToast();
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string | null) => memberName(group.members, id, t('common.unknownMember'));
  const total = group.expenses.reduce((sum, e) => sum + e.amount, 0);

  async function remove(id: string, description: string) {
    if (!confirm(t('expenseList.confirmDelete', { description }))) return;
    try {
      await api.deleteExpense(group.code, id);
      setError(null);
      notify('toast.expenseDeleted');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="card expense-list">
      <div className="cluster cluster--between">
        <h2 className="card__title">{t('expenseList.title')}</h2>
        <span className="text text--muted">{t('expenseList.total', { amount: money(total) })}</span>
      </div>
      {error && <p className="text text--error">{error}</p>}
      {group.expenses.length === 0 && <p className="text text--muted">{t('expenseList.empty')}</p>}
      <ul className="list list--divided">
        {group.expenses.map((e) => {
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
          return (
            <li key={e.id} className="list__item expense-list__item">
              <div className="expense-list__row">
                <span className="text text--strong">{e.description}</span>
                <span className="expense-list__end">
                  <span className="expense-list__amount">{money(e.amount)}</span>
                  {canDelete && !locked && onEdit && (
                    <button
                      className="button button--icon"
                      onClick={() => onEdit(e)}
                      aria-label={t('expenseList.editLabel', { description: e.description })}
                      title={t('expenseList.edit')}
                    >
                      <Icon name="pencil" />
                    </button>
                  )}
                  {canDelete && !locked && (
                    <button
                      className="button button--icon"
                      onClick={() => remove(e.id, e.description)}
                      aria-label={t('expenseList.deleteLabel', { description: e.description })}
                      title={t('expenseList.delete')}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                  {canDelete && locked && (
                    <span className="text text--muted text--small">{t('expenseList.deleteLocked')}</span>
                  )}
                </span>
              </div>
              <div className="text text--muted text--small">{meta}</div>
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
    </section>
  );
}
