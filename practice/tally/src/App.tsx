// Two pages, so a tiny router: "/" and "/g/:code".
import { useEffect, useState } from 'react';
import './App.scss';
import { ThemePicker } from './components/ThemePicker';
import { useI18n } from './i18n';
import { GroupPage } from './pages/GroupPage';
import { HomePage } from './pages/HomePage';

export type Navigate = (path: string, state?: unknown) => void;

export function App() {
  const { t } = useI18n();
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const navigate: Navigate = (to, state) => {
    history.pushState(state ?? null, '', to);
    setPath(location.pathname);
    scrollTo(0, 0);
  };

  const match = path.match(/^\/g\/([^/]+)\/?$/);
  return (
    <div className="app">
      <header className="app__header">
        <a
          href="/"
          className="app__brand"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          {t('app.title')}
        </a>
        <div className="app__controls">
          <ThemePicker />
        </div>
      </header>
      <main>{match ? <GroupPage key={match[1]} code={match[1]} navigate={navigate} /> : <HomePage navigate={navigate} />}</main>
    </div>
  );
}
