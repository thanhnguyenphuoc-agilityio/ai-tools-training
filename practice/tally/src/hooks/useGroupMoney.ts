import { getCurrency, type CurrencyInfo } from '../../shared/currency';
import type { GroupDto } from '../../shared/types';
import { useI18n } from '../i18n';

/** Money helpers bound to the group's currency and the UI locale. */
export function useGroupMoney(group: Pick<GroupDto, 'currency'>) {
  const { money, parseMoney, parseShareMoney, formatAmount } = useI18n();
  const currency: CurrencyInfo = getCurrency(group.currency) ?? { code: group.currency, minorDigits: 0, roundOptions: [1] };
  return {
    currency,
    money: (amount: number) => money(amount, currency),
    parseMoney: (input: string) => parseMoney(input, currency),
    parseShareMoney: (input: string) => parseShareMoney(input, currency),
    formatAmount: (amount: number) => formatAmount(amount, currency),
  };
}
