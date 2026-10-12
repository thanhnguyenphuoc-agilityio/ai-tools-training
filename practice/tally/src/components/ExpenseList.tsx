import { useState } from 'react';
import type { GroupDto } from '../../shared/types';
import { api } from '../api';
import { useGroupMoney } from '../hooks/useGroupMoney';
import { useI18n } from '../i18n';
import './ExpenseList.scss';

export function ExpenseList({ group, onChanged }: { group: GroupDto; onChanged: () => void }) {
  const { t, tp, day, errorMessage } = useI18n();
  const { money } = useGroupMoney(group);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string | null) => group.members.find((m) => m.id === id)?.name ?? t('common.unknownMember');
  const total = group.expenses.reduce((sum, e) => sum + e.amount, 0);

  async function remove(id: string, description: string) {
    if (!confirm(t('expenseList.confirmDelete', { description }))) return;
    try {
      await api.deleteExpense(group.code, id);
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
          const canDelete = group.me.isOwner || (!!group.me.memberId && e.createdBy === group.me.memberId);
          const meta = [
            t('expenseList.meta', { payer: nameOf(e.payerId), date: day(e.spentOn) }),
            tp('expenseList.people', e.shares.length),
            ...(e.splitMode === 'weight' ? [t('expenseList.byWeight')] : []),
          ].join(t('common.separator'));
          return (
            <li key={e.id} className="list__item expense-list__item">
              <div className="expense-list__row">
                <span className="text text--strong">{e.description}</span>
                <span className="expense-list__amount">{money(e.amount)}</span>
              </div>
              <div className="expense-list__row text text--muted text--small">
                <span>{meta}</span>
                {canDelete && (
                  <button className="button button--ghost button--small" onClick={() => remove(e.id, e.description)}>
                    {t('expenseList.delete')}
                  </button>
                )}
              </div>
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
