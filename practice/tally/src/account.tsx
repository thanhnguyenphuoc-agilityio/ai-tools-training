// Account context: provides user session, configuration, and refresh triggers.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { ConfigResponse, UserDto } from '../shared/types';
import { useToast } from './toast';

interface AccountContextValue {
  config: ConfigResponse | null;
  user: UserDto | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  version: number;
  requestSignIn: () => void;
  signInRequest: number;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [user, setUser] = useState<UserDto | null>(null);
  const [version, setVersion] = useState(0);
  const [signInRequest, setSignInRequest] = useState(0);
  const notify = useToast();

  const requestSignIn = () => setSignInRequest((n) => n + 1);

  const refresh = async () => {
    try {
      const meRes = await api.getMe();
      setUser(meRes.user);
      setVersion((v) => v + 1);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch(() => {});
    api
      .getMe()
      .then((res) => setUser(res.user))
      .catch(() => {});
  }, []);

  const signOut = async () => {
    await api.signOut();
    setUser(null);
    setVersion((v) => v + 1);
    notify('toast.signedOut');
  };

  return (
    <AccountContext.Provider value={{ config, user, refresh, signOut, version, requestSignIn, signInRequest }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount outside AccountProvider');
  return ctx;
}
