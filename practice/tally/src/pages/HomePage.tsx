import { useEffect, useState } from 'react';
import { CURRENCIES } from '../../shared/currency';
import { normalizeGroupCode } from '../../shared/groupCode';
import type { MyGroupDto } from '../../shared/types';
import { useAccount } from '../account';
import { api } from '../api';
import type { Navigate } from '../App';
import { useI18n, type UiMessage } from '../i18n';
import { forgetGroup, readHistory } from '../history';
import './HomePage.scss';

export function HomePage({ navigate }: { navigate: Navigate }) {
  const { t, message, money, currencyName, dateTime, defaultCurrency } = useI18n();
  const { user, version } = useAccount();
  const [accountGroups, setAccountGroups] = useState<MyGroupDto[] | null>(null);
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [roundCoarse, setRoundCoarse] = useState(true);
  const [joinInput, setJoinInput] = useState('');
  const [error, setError] = useState<UiMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(readHistory);

  useEffect(() => {
    // Cleared first so a list fetched for a previous account or session is never shown for the new one.
    setAccountGroups(null);
    if (!user) return;
    let active = true;
    api
      .getMyGroups()
      .then((res) => {
        if (active) setAccountGroups(res.groups);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, version]);

  const visibleHistory =
    user && accountGroups ? history.filter((h) => !accountGroups.some((g) => g.code === h.code)) : history;

  const currency = CURRENCIES[currencyCode];
  const coarseUnit = currency.roundOptions[currency.roundOptions.length - 1];

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { code, ownerKey } = await api.createGroup({
        name,
        ownerName,
        currency: currency.code,
        roundTo: roundCoarse ? coarseUnit : currency.roundOptions[0],
      });
      // The owner key is shown once on the group page, then only the user has it.
      navigate(`/g/${code}`, { ownerKey, created: true });
    } catch (err) {
      setError({ error: err });
    } finally {
      setBusy(false);
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeGroupCode(joinInput);
    if (!code) return setError({ key: 'home.join.invalidCode' });
    navigate(`/g/${code}`);
  }

  return (
    <div className="home-page">
      <section className="card home-page__create">
        <h1 className="card__title">{t('home.create.title')}</h1>
        <form onSubmit={create} className="stack">
          <p className="text text--muted">{t('home.create.intro')}</p>
          <label className="field">
            <span className="field__label">{t('home.create.groupName')}</span>
            <input
              className="field__control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('home.create.groupNamePlaceholder')}
              required
              maxLength={80}
            />
          </label>
          <div className="columns">
            <label className="field">
              <span className="field__label">{t('home.create.yourName')}</span>
              <input
                className="field__control"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={t('home.create.yourNamePlaceholder')}
                required
                maxLength={40}
              />
            </label>
            <label className="field">
              <span className="field__label">{t('home.create.currency')}</span>
              <select className="field__control" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
                {Object.keys(CURRENCIES).map((c) => (
                  <option key={c} value={c}>
                    {currencyName(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {coarseUnit > 1 && (
            <label className="field field--inline">
              <input type="checkbox" checked={roundCoarse} onChange={(e) => setRoundCoarse(e.target.checked)} />
              {t('home.create.roundCoarse', { unit: money(coarseUnit, currency) })}
            </label>
          )}
          <div className="cluster">
            <button className="button" disabled={busy}>
              {t('home.create.submit')}
            </button>
          </div>
        </form>
      </section>

      <div className="stack home-page__side">
        <section className="card">
          <h2 className="card__title">{t('home.join.title')}</h2>
          <form onSubmit={join} className="cluster cluster--nowrap">
            <input
              className="field__control"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder={t('home.join.label')}
              aria-label={t('home.join.label')}
            />
            <button className="button">{t('home.join.submit')}</button>
          </form>
        </section>

        {error && <p className="text text--error">{message(error)}</p>}

        {user && (
          <section className="card home-page__account-groups">
            <h2 className="card__title">{t('home.accountGroups.title')}</h2>
            <p className="text text--muted home-page__hint">{t('home.accountGroups.hint')}</p>
            {accountGroups === null ? null : accountGroups.length === 0 ? (
              <p className="text text--muted">{t('home.accountGroups.empty')}</p>
            ) : (
              <ul className="list list--divided">
                {accountGroups.map((g) => (
                  <li key={g.code} className="list__item cluster cluster--between">
                    <a
                      href={`/g/${g.code}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/g/${g.code}`);
                      }}
                    >
                      <span className="text text--strong">{g.name}</span>{' '}
                      <span className="text text--muted text--mono">{g.code}</span>
                    </a>
                    <span className="cluster">
                      {g.isOwner && <span className="badge">{t('common.ownerBadge')}</span>}
                      <span className="text text--muted text--small">{g.currency}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {visibleHistory.length > 0 && (
          <section className="card">
            <h2 className="card__title">{t('home.history.title')}</h2>
            <ul className="list list--divided">
              {visibleHistory.map((h) => (
                <li key={h.code} className="list__item cluster cluster--between">
                  <a
                    href={`/g/${h.code}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/g/${h.code}`);
                    }}
                  >
                    <span className="text text--strong">{h.name}</span> <span className="text text--muted text--mono">{h.code}</span>
                  </a>
                  <span className="cluster">
                    <span className="text text--muted text--small">{dateTime(h.visitedAt)}</span>
                    <button
                      className="button button--ghost button--small"
                      aria-label={t('home.history.remove', { name: h.name })}
                      onClick={() => {
                        forgetGroup(h.code);
                        setHistory(readHistory());
                      }}
                    >
                      {t('common.remove')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
