import { copyText } from '../clipboard';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { Icon } from './Icon';

// Shown once after creating a group. The server keeps only a hash of the key,
// so this recovery link is the only way back in from another device.
export function OwnerKeyBanner({ code, ownerKey, onDismiss }: { code: string; ownerKey: string; onDismiss: () => void }) {
  const { t } = useI18n();
  const notify = useToast();
  const recoveryLink = `${location.origin}/g/${code}#owner=${ownerKey}`;
  return (
    <section className="card card--warning stack">
      <h2 className="card__title">{t('ownerKey.title')}</h2>
      <p>{t('ownerKey.body')}</p>
      <input
        className="field__control field__control--mono"
        readOnly
        value={recoveryLink}
        onFocus={(e) => e.target.select()}
        aria-label={t('ownerKey.linkLabel')}
      />
      <div className="cluster">
        <button className="button" onClick={() => copyText(recoveryLink).then((ok) => ok && notify('toast.recoveryCopied'))}>
          <Icon name="link" />
          {t('common.copy')}
        </button>
        <button className="button button--ghost" onClick={onDismiss}>
          {t('ownerKey.done')}
        </button>
      </div>
    </section>
  );
}
