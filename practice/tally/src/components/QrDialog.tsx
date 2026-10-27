import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { VIETQR_CURRENCY } from '../../shared/currency';
import type { Settlement } from '../../shared/settle';
import { findBank, type GroupDto } from '../../shared/types';
import { buildVietQrPayload, sanitizeTransferMessage } from '../../shared/vietqr';
import { QR_OPTIONS, VIETQR_MARK, VIETQR_WORDMARK, bankLogo } from '../qrCard';
import { api } from '../api';
import { useGroupMoney } from '../hooks/useGroupMoney';
import { useI18n } from '../i18n';
import './QrDialog.scss';

export function QrDialog({
  group,
  settlement,
  onClose,
  onRecorded,
}: {
  group: GroupDto;
  settlement: Settlement;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { t, errorMessage } = useI18n();
  const { money } = useGroupMoney(group);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const from = group.members.find((m) => m.id === settlement.fromId)!;
  const to = group.members.find((m) => m.id === settlement.toId)!;
  const bank = findBank(to.bankBin);
  const hasAccount = !!bank && !!to.accountNo;
  const qrSupported = group.currency === VIETQR_CURRENCY;
  // Show exactly what goes into the QR, so people can match it in their bank app.
  const message = sanitizeTransferMessage(
    t('qr.messageTemplate', { code: group.code.slice(0, 4), from: from.name, to: to.name }),
  );

  const [logoFailed, setLogoFailed] = useState(false);
  const showBankLogo = !!bank && !logoFailed;

  useEffect(() => {
    if (!qrSupported || !bank || !to.accountNo || !canvas.current) return;
    try {
      const payload = buildVietQrPayload({
        bin: bank.bin,
        accountNo: to.accountNo,
        amount: settlement.amount,
        message,
      });
      QRCode.toCanvas(canvas.current, payload, QR_OPTIONS).catch(() => setError(t('qr.renderError')));
    } catch {
      setError(t('qr.renderError'));
    }
  }, [qrSupported, bank, to.accountNo, settlement.amount, message, t]);

  async function recordSent() {
    try {
      await api.recordTransfer(group.code, to.id, settlement.amount);
      onRecorded();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('qr.dialogLabel', { name: to.name })}
      onClick={onClose}
    >
      <div className="dialog__panel card stack qr-dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="card__title">{t('qr.title', { name: to.name, amount: money(settlement.amount) })}</h2>
        {!hasAccount && <p>{t('qr.noAccount', { name: to.name })}</p>}
        {hasAccount && (
          <>
            {qrSupported ? (
              <div className="qr-dialog__card">
                <img src={VIETQR_WORDMARK} alt={t('qr.vietqrLogo')} className="qr-dialog__wordmark" />
                <div className="qr-dialog__frame">
                  <div className="qr-dialog__code">
                    <canvas ref={canvas} className="qr-dialog__canvas" aria-label={t('qr.codeLabel')} />
                    <img
                      src={showBankLogo ? bankLogo(bank.bin) : VIETQR_MARK}
                      alt={showBankLogo ? t('qr.bankLogo', { bank: bank.shortName }) : t('qr.vietqrLogo')}
                      className="qr-dialog__mark"
                      onError={() => setLogoFailed(true)}
                    />
                  </div>
                  <p className="qr-dialog__bank">{bank.shortName}</p>
                  <p className="qr-dialog__account text--mono">{to.accountNo}</p>
                  <p className="qr-dialog__amount">{money(settlement.amount)}</p>
                </div>
              </div>
            ) : (
              <p>{t('qr.noQrForCurrency', { amount: money(settlement.amount) })}</p>
            )}
            <dl className="qr-dialog__details">
              {!qrSupported && (
                <>
                  <dt className="qr-dialog__term">{t('qr.bank')}</dt>
                  <dd className="qr-dialog__value">{bank.shortName}</dd>
                  <dt className="qr-dialog__term">{t('qr.accountNo')}</dt>
                  <dd className="qr-dialog__value text--mono">{to.accountNo}</dd>
                </>
              )}
              {to.accountName && (
                <>
                  <dt className="qr-dialog__term">{t('qr.accountName')}</dt>
                  <dd className="qr-dialog__value">{to.accountName}</dd>
                </>
              )}
              <dt className="qr-dialog__term">{t('qr.message')}</dt>
              <dd className="qr-dialog__value text--mono">{message}</dd>
            </dl>
            {qrSupported && <p className="text text--muted text--small">{t('qr.hint')}</p>}
          </>
        )}
        {error && <p className="text text--error">{error}</p>}
        <div className="cluster">
          <button className="button" onClick={recordSent}>
            {t('qr.sent')}
          </button>
          <button className="button button--ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
