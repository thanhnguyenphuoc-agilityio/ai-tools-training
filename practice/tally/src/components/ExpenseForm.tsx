import { useMemo, useState } from 'react';
import { exactSplitDifference, splitAmount } from '../../shared/money';
import type { GroupDto, SplitMode } from '../../shared/types';
import { api, ApiError } from '../api';
import { todayLocal } from '../dates';
import { useGroupMoney } from '../hooks/useGroupMoney';
import { useI18n, type UiMessage } from '../i18n';
import { useToast } from '../toast';
import './ExpenseForm.scss';

export function ExpenseForm({
  group,
  onSaved,
  onStale,
}: {
  group: GroupDto;
  onSaved: () => void;
  /** Reloads the group when the API says a chosen member is no longer in it (removed on another device). */
  onStale: () => void;
}) {
  const { t, message } = useI18n();
  const { currency, money, parseMoney, parseShareMoney } = useGroupMoney(group);
  const notify = useToast();
  // Removed members stay in the history but cannot pay or share new expenses.
  const members = group.members.filter((m) => !m.removed);
  const [chosenPayerId, setPayerId] = useState(group.me.memberId ?? members[0].id);
  // A payer removed since the form opened falls back to the user, or to the first current member.
  const fallbackPayerId = members.some((m) => m.id === group.me.memberId) ? group.me.memberId! : members[0].id;
  const payerId = members.some((m) => m.id === chosenPayerId) ? chosenPayerId : fallbackPayerId;
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [spentOn, setSpentOn] = useState(todayLocal);
  const [mode, setMode] = useState<SplitMode>('equal');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  const [weights, setWeights] = useState<Record<string, string>>({});
  // Exact mode: the text typed per member. An empty field means the member owes nothing.
  const [shareTexts, setShareTexts] = useState<Record<string, string>>({});
  const [error, setError] = useState<UiMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = parseMoney(amountText);
  const chosen = members.filter((m) => selected.has(m.id));
  const participants = chosen.map((m) => ({
    memberId: m.id,
    weight: mode === 'weight' ? Number((weights[m.id] ?? '1').replace(',', '.')) : 1,
  }));

  // Exact mode: each typed amount, parsed like the main amount field (null when invalid).
  const typedShares = new Map(chosen.map((m) => [m.id, parseShareMoney(shareTexts[m.id] ?? '')]));
  const invalidShare = chosen.find((m) => typedShares.get(m.id) === null);
  const exactParts = chosen.map((m) => ({ memberId: m.id, amount: typedShares.get(m.id) ?? 0 }));
  const difference = amount ? exactSplitDifference(amount, exactParts) : null;

  const participantsKey = JSON.stringify(participants);
  const computed = useMemo(() => {
    if (!amount || participants.length === 0) return null;
    try {
      return splitAmount(amount, participants, { roundTo: group.roundTo, payerId });
    } catch {
      return null;
    }
    // participantsKey stands in for participants, which is rebuilt every render.
  }, [amount, participantsKey, group.roundTo, payerId]);
  // In exact mode the preview shows each typed amount as parsed (no rounding), e.g. what "150k" became.
  const preview = mode === 'exact' ? typedShares : computed;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) {
      const examplesKey = currency.minorDigits > 0 ? 'expenseForm.amountExamplesDecimal' : 'expenseForm.amountExamples';
      return setError({ key: 'expenseForm.invalidAmount', vars: { examples: { key: examplesKey } } });
    }
    if (mode === 'exact') {
      if (invalidShare) return setError({ key: 'expenseForm.invalidShare', vars: { name: invalidShare.name } });
      if (difference !== 0) return setError({ key: 'expenseForm.exactMismatch' });
    }
    setBusy(true);
    setError(null);
    try {
      await api.addExpense(group.code, {
        payerId,
        amount,
        description,
        spentOn,
        splitMode: mode,
        participants: mode === 'exact' ? exactParts : participants,
      });
      setAmountText('');
      setDescription('');
      setShareTexts({});
      notify('toast.expenseAdded');
      onSaved();
    } catch (err) {
      setError({ error: err });
      if (err instanceof ApiError && (err.code === 'PAYER_NOT_IN_GROUP' || err.code === 'PARTICIPANT_NOT_IN_GROUP')) {
        onStale();
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Exact mode: how far the typed shares are from the total. An invalid share is reported first,
   * because `difference` counts it as zero.
   */
  function exactStatus(): { text: string; modifier: string } {
    if (chosen.length === 0) return { text: '', modifier: '' };
    if (difference === null) return { text: t('expenseForm.exactTotalFirst'), modifier: 'text--muted' };
    if (invalidShare) {
      return { text: t('expenseForm.invalidShare', { name: invalidShare.name }), modifier: 'text--negative' };
    }
    if (difference > 0)
      return { text: t('expenseForm.exactLeft', { amount: money(difference) }), modifier: 'text--negative' };
    if (difference < 0)
      return { text: t('expenseForm.exactOver', { amount: money(-difference) }), modifier: 'text--negative' };
    return { text: t('expenseForm.exactMatches'), modifier: 'text--positive' };
  }
  const status = exactStatus();

  return (
    <section className="card expense-form">
      <h2 className="card__title">{t('expenseForm.title')}</h2>
      <form onSubmit={submit} className="stack">
        <div className="columns">
          <label className="field">
            <span className="field__label">{t('expenseForm.amount')}</span>
            <input
              className="field__control"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder={t('expenseForm.amountPlaceholder')}
              inputMode="decimal"
              required
            />
            <span className="field__hint">{amount ? money(amount) : ''}</span>
          </label>
          <label className="field">
            <span className="field__label">{t('expenseForm.paidBy')}</span>
            <select className="field__control" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="columns">
          <label className="field">
            <span className="field__label">{t('expenseForm.description')}</span>
            <input
              className="field__control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('expenseForm.descriptionPlaceholder')}
              required
              maxLength={120}
            />
          </label>
          <label className="field">
            <span className="field__label">{t('expenseForm.date')}</span>
            <input
              className="field__control"
              type="date"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
              required
            />
          </label>
        </div>

        <fieldset className="fieldset stack stack--tight">
          <legend className="fieldset__legend">{t('expenseForm.splitBetween')}</legend>
          <div className="cluster">
            <label className="field field--inline">
              <input type="radio" checked={mode === 'equal'} onChange={() => setMode('equal')} />{' '}
              {t('expenseForm.equal')}
            </label>
            <label className="field field--inline">
              <input type="radio" checked={mode === 'weight'} onChange={() => setMode('weight')} />{' '}
              {t('expenseForm.byWeight')}
            </label>
            <label className="field field--inline">
              <input type="radio" checked={mode === 'exact'} onChange={() => setMode('exact')} />{' '}
              {t('expenseForm.exact')}
            </label>
          </div>
          <ul className="list">
            {members.map((m) => (
              <li
                key={m.id}
                className={`list__item expense-form__participant${mode === 'exact' ? ' expense-form__participant--exact' : ''}`}
              >
                <label className="field field--inline expense-form__name">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                  {m.name}
                </label>
                {mode === 'weight' && selected.has(m.id) && (
                  <input
                    className="field__control field__control--narrow"
                    aria-label={t('expenseForm.weightOf', { name: m.name })}
                    value={weights[m.id] ?? '1'}
                    onChange={(e) => setWeights({ ...weights, [m.id]: e.target.value })}
                    inputMode="decimal"
                  />
                )}
                {mode === 'exact' && selected.has(m.id) && (
                  <input
                    className={[
                      'field__control',
                      'expense-form__share-input',
                      typedShares.get(m.id) === null ? 'expense-form__share-input--invalid' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={t('expenseForm.shareOf', { name: m.name })}
                    aria-invalid={typedShares.get(m.id) === null}
                    value={shareTexts[m.id] ?? ''}
                    onChange={(e) => setShareTexts({ ...shareTexts, [m.id]: e.target.value })}
                    placeholder={t('expenseForm.sharePlaceholder')}
                    inputMode="decimal"
                  />
                )}
                <span className="text text--muted text--small expense-form__share">
                  {preview?.get(m.id) != null ? money(preview.get(m.id)!) : ''}
                </span>
              </li>
            ))}
          </ul>
          {/* Mounted for the whole time exact mode is on; only its text changes, so screen readers announce it. */}
          {mode === 'exact' && (
            <p
              className={['text text--small expense-form__remaining', status.modifier].filter(Boolean).join(' ')}
              aria-live="polite"
            >
              {status.text}
            </p>
          )}
        </fieldset>

        {error && <p className="text text--error">{message(error)}</p>}
        <button className="button button--block-mobile" disabled={busy || chosen.length === 0}>
          {t('expenseForm.submit')}
        </button>
      </form>
    </section>
  );
}
