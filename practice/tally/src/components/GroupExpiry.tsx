import { useState } from 'react';
import { isExpiringSoon } from '../../shared/rules';
import type { GroupDto } from '../../shared/types';
import { useI18n } from '../i18n';
import './GroupExpiry.scss';

export function GroupExpiry({ group }: { group: Pick<GroupDto, 'expiresAt' | 'locked'> }) {
  const { t, localDate } = useI18n();
  const [now] = useState(() => new Date());

  if (group.locked) {
    return <p className="group-expiry">{t('group.expiry.kept')}</p>;
  }

  const soon = group.expiresAt ? isExpiringSoon(group.expiresAt, now) : false;

  return (
    <p className={`group-expiry${soon ? ' group-expiry--soon' : ''}`}>
      {group.expiresAt ? t('group.expiry.date', { date: localDate(group.expiresAt) }) : null}
      {soon ? ` ${t('group.expiry.soon')}` : null}
    </p>
  );
}
