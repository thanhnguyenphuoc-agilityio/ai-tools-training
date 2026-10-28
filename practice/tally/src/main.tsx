import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountProvider } from './account';
import { App } from './App';
import { I18nProvider } from './i18n';
import './styles/main.scss';
import { applyThemePreference, getThemePreference } from './theme';
import { ToastProvider } from './toast';

applyThemePreference(getThemePreference());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <AccountProvider>
          <App />
        </AccountProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
