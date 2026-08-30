import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

/**
 * Session state for the agency web app.
 *
 * The access token is kept in memory only (short-lived, provider-managed):
 * the platform must not persist long-lived credentials in local storage
 * (architecture/authentication-authorization.md). Production sign-in goes
 * through Supabase Auth (its SDK owns the session); the development build
 * additionally allows pasting a locally minted token behind a flag.
 */

interface AuthState {
  token: string | null;
  signInWithToken: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [token, setToken] = useState<string | null>(null);

  const value = useMemo<AuthState>(
    () => ({
      token,
      signInWithToken: (next: string) => setToken(next),
      signOut: () => setToken(null),
    }),
    [token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return state;
}
