import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '@kavriqo/api-client';
import { useAuth } from '../auth/AuthContext';

interface MembershipDto {
  id: string;
  agencyId: string;
  status: string;
  roles: string[];
}

interface AgencyContextValue {
  agencyId: string | null;
  loading: boolean;
}

const AgencyContext = createContext<AgencyContextValue>({ agencyId: null, loading: true });

/**
 * Resolves the caller's agency context from their own memberships
 * (GET /api/v1/me/memberships). Multi-agency users can switch contexts from
 * the header once the picker lands; for now the first active membership is
 * used — the API remains the authority for every scoped call.
 */
export function AgencyProvider({ children }: { children: ReactNode }): ReactNode {
  const { token } = useAuth();
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setAgencyId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const client = new ApiClient({
      baseUrl: String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000'),
      tokenProvider: () => Promise.resolve(token),
    });
    client
      .get<{ memberships: MembershipDto[] }>('/api/v1/me/memberships')
      .then((result) => {
        if (!cancelled) {
          const active = result.memberships.find((m) => m.status === 'ACTIVE');
          setAgencyId(active?.agencyId ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgencyId(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo(() => ({ agencyId, loading }), [agencyId, loading]);
  return <AgencyContext.Provider value={value}>{children}</AgencyContext.Provider>;
}

export function useAgency(): AgencyContextValue {
  return useContext(AgencyContext);
}
