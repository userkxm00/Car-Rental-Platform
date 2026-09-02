import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Field, Input } from '@kavriqo/ui';
import { PORTAL_TOKEN_STORAGE_KEY } from '../api';

/**
 * Development-only sign-in for the customer booking portal (07-E).
 *
 * The portal endpoints resolve the caller's identity from the access
 * token; production sign-in arrives with the auth integration (agency-web
 * already exercises the same token path). In development, when
 * VITE_DEV_ALLOW_TOKEN_LOGIN=true, a locally minted token
 * (scripts/dev-jwks.cjs also writes apps/customer-web/.dev-token) can be
 * pasted and is persisted to localStorage — the client never stores
 * credentials server-side.
 */

export function readPortalToken(): string | null {
  return localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY);
}

export function writePortalToken(token: string): void {
  localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, token);
}

export function clearPortalToken(): void {
  localStorage.removeItem(PORTAL_TOKEN_STORAGE_KEY);
}

const DEV_TOKEN_LOGIN =
  import.meta.env.DEV && import.meta.env.VITE_DEV_ALLOW_TOKEN_LOGIN === 'true';

export function PortalTokenGate({ children }: { children: ReactNode }): ReactNode {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(() => readPortalToken());
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token === null) {
      return;
    }
    writePortalToken(token);
  }, [token]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = draft.trim();
      if (trimmed.length === 0) {
        setError(t('portal.tokenRequired'));
        return;
      }
      setToken(trimmed);
      setError(null);
    },
    [draft, t],
  );

  const signOut = useCallback(() => {
    clearPortalToken();
    setToken(null);
    setDraft('');
  }, []);

  if (token) {
    return (
      <div>
        <div className="kv-portal-session">
          <span>{t('portal.signedIn')}</span>
          <Button variant="secondary" onClick={signOut} type="button">
            {t('portal.signOut')}
          </Button>
        </div>
        {children}
      </div>
    );
  }

  if (!DEV_TOKEN_LOGIN) {
    return <Alert tone="info">{t('portal.signInLater')}</Alert>;
  }

  return (
    <main className="kv-profile-page">
      <Alert tone="info">{t('portal.devTokenHint')}</Alert>
      <form onSubmit={submit} className="kv-portal-token-form">
        <Field label={t('portal.tokenLabel')} error={error ?? undefined}>
          <Input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            autoComplete="off"
          />
        </Field>
        <Button type="submit">{t('portal.signIn')}</Button>
      </form>
    </main>
  );
}
