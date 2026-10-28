import { useState } from 'react';
import { isExpiringSoon } from '../../shared/rules';
import type { GroupDto } from '../../shared/types';
import { useI18n } from '../i18n';
import './GroupExpiry.scss';

export function GroupExpiry({ group }: { group: Pick<GroupDto, 'expiresAt'> }) {
  const { t, localDate } = useI18n();
  const [now] = useState(() => new Date());
  const soon = isExpiringSoon(group.expiresAt, now);

  return (
    <p className={`group-expiry${soon ? ' group-expiry--soon' : ''}`}>
      {t('group.expiry.date', { date: localDate(group.expiresAt) })}
      {soon ? ` ${t('group.expiry.soon')}` : null}
    </p>
  );
}
