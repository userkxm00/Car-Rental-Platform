import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Field, Input, Main, PageHeader } from '@kavriqo/ui';
import { useAuth } from './AuthContext';

const DEV_TOKEN_LOGIN =
  import.meta.env.DEV && import.meta.env.VITE_DEV_ALLOW_TOKEN_LOGIN === 'true';

/**
 * Sign-in screen.
 *
 * Production: Supabase Auth session flow (its SDK owns the session; the
 * resulting access token is handed to AuthProvider). Development: when
 * VITE_DEV_ALLOW_TOKEN_LOGIN=true, a locally minted token can be pasted —
 * the same signInWithToken path, token source differs only.
 */
export function SignInPage(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signInWithToken } = useAuth();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (token.trim().length === 0) {
      setError(t('auth.tokenRequired'));
      return;
    }
    signInWithToken(token.trim());
    void navigate('/fleet', { replace: true });
  }

  return (
    <Main>
      <PageHeader title={t('auth.signIn')} />
      {DEV_TOKEN_LOGIN ? (
        <form onSubmit={submit} style={{ maxWidth: 480 }}>
          <Alert tone="info">{t('auth.devTokenHint')}</Alert>
          <Field label={t('auth.tokenLabel')} error={error ?? undefined}>
            <Input
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setError(null);
              }}
              autoComplete="off"
            />
          </Field>
          <Button type="submit">{t('auth.signIn')}</Button>
        </form>
      ) : (
        <Alert tone="info">{t('auth.devTokenHint')}</Alert>
      )}
    </Main>
  );
}
