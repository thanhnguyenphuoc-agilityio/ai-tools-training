// Figures above the group tabs (ui_redesign): total spent, current members and
// the viewer's own balance. The balance is left out for a visitor who has not joined.
import type { GroupDto } from '../../shared/types';
import { groupSummary } from '../groupSummary';
import { useGroupMoney } from '../hooks/useGroupMoney';
import { useI18n } from '../i18n';

export function GroupSummaryBar({ group }: { group: GroupDto }) {
  const { t } = useI18n();
  const { money } = useGroupMoney(group);
  const { total, members, myBalance } = groupSummary(group);

  return (
    <dl className="group-page__summary" aria-label={t('group.summary.label')}>
      <div className="group-page__figure">
        <dt className="group-page__figure-label">{t('group.summary.total')}</dt>
        <dd className="group-page__figure-value">{money(total)}</dd>
      </div>
      <div className="group-page__figure">
        <dt className="group-page__figure-label">{t('group.summary.members')}</dt>
        <dd className="group-page__figure-value">{members}</dd>
      </div>
      {myBalance !== null && (
        <div className="group-page__figure">
          <dt className="group-page__figure-label">
            {t(myBalance > 0 ? 'group.summary.owed' : myBalance < 0 ? 'group.summary.owe' : 'group.summary.settled')}
          </dt>
          <dd
            className={['group-page__figure-value', myBalance > 0 ? 'text--positive' : myBalance < 0 ? 'text--negative' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {money(Math.abs(myBalance))}
          </dd>
        </div>
      )}
    </dl>
  );
}
