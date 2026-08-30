import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Route guard: unauthenticated visitors are redirected to sign-in. */
export function RequireAuth({ children }: { children: ReactNode }): ReactNode {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/signin" replace />;
  }
  return children;
}
