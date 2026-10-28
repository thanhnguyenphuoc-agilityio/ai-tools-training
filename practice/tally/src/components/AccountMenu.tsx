// Account menu control: sign-in popup or account options (sign out, bank details).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAccount } from '../account';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { Icon } from './Icon';
import { SavedBankDialog } from './SavedBankDialog';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import './AccountMenu.scss';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: unknown) => void;
          renderButton: (parent: HTMLElement | null, options: unknown) => void;
        };
      };
    };
  }
}

export function AccountMenu() {
  const { config, user, refresh, signOut, signInRequest } = useAccount();
  const { t, errorMessage } = useI18n();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [bankDetailsOpen, setBankDetailsOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const canSignIn = !!(config?.googleClientId || config?.devLogin);

  function close(refocus = true) {
    setOpen(false);
    setError(null);
    if (refocus) button.current?.focus();
  }

  useEffect(() => {
    if (!signInRequest) return;
    setOpen(true);
    button.current?.focus();
  }, [signInRequest]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Google One-Tap / Identity Services lazy load
  useEffect(() => {
    if (!open || !config?.googleClientId) return;
    const initGoogle = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: async (res: { credential: string }) => {
            try {
              await api.signInGoogle(res.credential);
              await refresh();
              notify('toast.signedIn');
              close(false);
            } catch (err: unknown) {
              setError(errorMessage(err));
            }
          },
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
        });
      }
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else if (!document.getElementById('google-gsi-script')) {
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.body.appendChild(script);
    }
  }, [open, config?.googleClientId, refresh, notify, errorMessage]);

  const handleDevSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.signInDev(email);
      await refresh();
      notify('toast.signedIn');
      close(false);
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  };

  const handleSignOut = async () => {
    close(false);
    await signOut();
  };

  if (!user && !canSignIn) return null;

  return (
    <div className="account-menu" ref={root}>
      {user ? (
        <>
          <button
            ref={button}
            type="button"
            className="account-menu__button"
            aria-expanded={open}
            aria-haspopup="true"
            aria-label={t('account.menuLabel', { name: user.name })}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name="user" className="account-menu__icon" />
            <span className="account-menu__name">{user.name}</span>
            <Icon name="chevronDown" className="account-menu__chevron" />
          </button>
          {open && (
            <div className="account-menu__menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="account-menu__item"
                onClick={() => {
                  close(false);
                  setBankDetailsOpen(true);
                }}
              >
                {t('account.bankDetails')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="account-menu__item"
                onClick={() => {
                  close(false);
                  setDeleteAccountOpen(true);
                }}
              >
                {t('account.deleteAccount')}
              </button>
              <button type="button" role="menuitem" className="account-menu__item" onClick={handleSignOut}>
                {t('account.signOut')}
              </button>
            </div>
          )}
          {bankDetailsOpen && <SavedBankDialog onClose={() => setBankDetailsOpen(false)} />}
          {deleteAccountOpen && <DeleteAccountDialog onClose={() => setDeleteAccountOpen(false)} />}
        </>
      ) : (
        <>
          <button
            ref={button}
            type="button"
            className="account-menu__button"
            aria-expanded={open}
            aria-haspopup="true"
            aria-label={t('account.signIn')}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name="user" className="account-menu__icon" />
            <span className="account-menu__label">{t('account.signIn')}</span>
          </button>
          {open && (
            <div className="account-menu__panel">
              {/* Local development with DEV_LOGIN shows both, so e2e can sign in while a client id is set. */}
              {config?.googleClientId && <div ref={googleBtnRef} />}
              {config?.googleClientId && !config.devLogin && error && <p className="text text--error">{error}</p>}
              {config?.devLogin ? (
                <form onSubmit={handleDevSubmit} className="account-menu__form">
                  <p className="account-menu__dev-title">{t('account.devTitle')}</p>
                  <label className="field">
                    <span className="field__label">{t('account.devEmail')}</span>
                    <input
                      type="email"
                      className="input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('account.devEmailPlaceholder')}
                      required
                      autoFocus
                    />
                  </label>
                  <button type="submit" className="button button--primary button--small">
                    {t('account.devSubmit')}
                  </button>
                  {error && <p className="text text--error">{error}</p>}
                </form>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
