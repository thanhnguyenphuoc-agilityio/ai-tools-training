import { useState } from 'react';
import type { Settlement } from '../../shared/settle';
import type { GroupDto } from '../../shared/types';
import { api } from '../api';
import { useGroupMoney } from '../hooks/useGroupMoney';
import { useI18n, type UiMessage } from '../i18n';
import { payAction } from '../ownerTools';
import { settleView } from '../settleView';
import { useToast } from '../toast';
import { QrDialog } from './QrDialog';

export function SettlePanel({ group, onChanged }: { group: GroupDto; onChanged: () => void }) {
  const { t, dateTime, message } = useI18n();
  const { money } = useGroupMoney(group);
  const notify = useToast();
  const [paying, setPaying] = useState<Settlement | null>(null);
  // show_qr_again: the payer reopens the QR of a transfer they already marked as sent, without recording it again.
  const [viewing, setViewing] = useState<Settlement | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<UiMessage | null>(null);
  const nameOf = (id: string) => group.members.find((m) => m.id === id)?.name ?? t('common.unknownMember');

  // A removed member has settled up (remove_member), so only current members are listed and suggested.
  const { balances, activeMembers, plan, removedWithBalance } = settleView(group);
  const pending = group.transfers.filter((t) => t.status === 'sent');
  const confirmed = group.transfers.filter((t) => t.status === 'confirmed');

  // The QR shown again carries the amount that was marked as sent, which is what the bank app should show.
  const sentAs = (s: Settlement): Settlement => {
    const tr = pending.find((p) => p.fromId === s.fromId && p.toId === s.toId);
    return tr ? { ...s, amount: tr.amount } : s;
  };

  async function confirmTransfer(id: string) {
    setConfirmingId(id);
    try {
      await api.confirmTransfer(group.code, id);
      setError(null);
      notify('toast.transferConfirmed');
      onChanged();
    } catch (err) {
      setError({ error: err });
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2 className="card__title">{t('settle.balancesTitle')}</h2>
        <ul className="list">
          {activeMembers.map((m) => {
            const b = balances.get(m.id) ?? 0;
            return (
              <li key={m.id} className="list__item cluster cluster--between">
                <span>{m.name}</span>
                {b > 0 && <span className="text text--positive">{t('settle.gets', { amount: money(b) })}</span>}
                {b < 0 && <span className="text text--negative">{t('settle.owes', { amount: money(-b) })}</span>}
                {b === 0 && <span className="text text--muted">{t('settle.even')}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card stack">
        <h2 className="card__title">{t('settle.planTitle')}</h2>
        {plan.length === 0 && <p className="text text--muted">{t('settle.allEven')}</p>}
        <ul className="list">
          {plan.map((s) => {
            const action = payAction(group.me, s, group.transfers);
            return (
              <li key={`${s.fromId}-${s.toId}`} className="list__item cluster cluster--between">
                <span className="text text--strong">
                  {t('settle.transferLine', { from: nameOf(s.fromId), to: nameOf(s.toId), amount: money(s.amount) })}
                </span>
                {action === 'pay' && (
                  <button className="button" onClick={() => setPaying(s)}>
                    {t('settle.pay')}
                  </button>
                )}
                {action === 'recordFor' && (
                  <button
                    className="button button--ghost"
                    onClick={() => setPaying(s)}
                    aria-label={t('settle.recordForLabel', { from: nameOf(s.fromId), to: nameOf(s.toId) })}
                  >
                    {t('settle.recordFor')}
                  </button>
                )}
                {action === 'waiting' && (
                  <span className="cluster">
                    <span className="text text--muted text--small">
                      {t('settle.waitingFor', { to: nameOf(s.toId) })}
                    </span>
                    {s.fromId === group.me.memberId && (
                      <button className="button button--ghost button--small" onClick={() => setViewing(sentAs(s))}>
                        {t('settle.showQrAgain')}
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {pending.length > 0 && <p className="text text--muted text--small">{t('settle.pendingNote')}</p>}
        {removedWithBalance.map((m) => (
          <p key={m.id} className="text text--muted text--small">
            {t('settle.removedWithBalance', { name: m.name, amount: money(Math.abs(balances.get(m.id) ?? 0)) })}
          </p>
        ))}
      </section>

      {error && <p className="text text--error">{message(error)}</p>}

      {pending.length > 0 && (
        <section className="card">
          <h2 className="card__title">{t('settle.pendingTitle')}</h2>
          <ul className="list list--divided">
            {pending.map((tr) => (
              <li key={tr.id} className="list__item cluster cluster--between">
                <span>
                  {t('settle.pendingItem', { from: nameOf(tr.fromId), to: nameOf(tr.toId), amount: money(tr.amount) })}
                  <span className="text text--muted text--small">
                    {t('common.separator')}
                    {dateTime(tr.createdAt)}
                  </span>
                </span>
                {(tr.toId === group.me.memberId || group.me.isOwner) && (
                  <button className="button" onClick={() => confirmTransfer(tr.id)} disabled={confirmingId === tr.id}>
                    {t('settle.confirm')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmed.length > 0 && (
        <section className="card">
          <h2 className="card__title">{t('settle.doneTitle')}</h2>
          <ul className="list text text--muted text--small">
            {confirmed.map((tr) => (
              <li key={tr.id} className="list__item">
                {t('settle.transferLine', { from: nameOf(tr.fromId), to: nameOf(tr.toId), amount: money(tr.amount) })}
                {t('common.separator')}
                {dateTime(tr.confirmedAt ?? tr.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {viewing && <QrDialog group={group} settlement={viewing} viewOnly onClose={() => setViewing(null)} />}

      {paying && (
        <QrDialog
          group={group}
          settlement={paying}
          onClose={() => setPaying(null)}
          onRecorded={() => {
            notify('toast.transferRecorded', { name: nameOf(paying.toId) });
            setPaying(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
