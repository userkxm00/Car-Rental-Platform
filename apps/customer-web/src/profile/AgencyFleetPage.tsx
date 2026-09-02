import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert } from '@kavriqo/ui';
import { createApi } from '../api';
import { SearchPage } from '../search/SearchPage';

/**
 * Agency fleet page (07-D08): this agency's bookable inventory through
 * the same offer pipeline as marketplace search, scoped server-side to
 * the agency. The reusable SearchPage drives the form/map/list.
 */

function parseErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'UNKNOWN';
  }
  const code: unknown = error.code;
  return typeof code === 'string' ? code : 'UNKNOWN';
}

export function AgencyFleetPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = useMemo(() => createApi(), []);

  useEffect(() => {
    let cancelled = false;
    api
      .profile(slug)
      .then((profile) => {
        if (!cancelled) {
          setAgencyName(profile.agency.name);
        }
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(parseErrorCode(failure));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, api]);

  if (error === 'AGENCY_NOT_FOUND') {
    return (
      <main className="kv-profile-page">
        <Alert tone="error">{t('profile.notFound')}</Alert>
      </main>
    );
  }
  if (!agencyName) {
    return (
      <main className="kv-profile-page">
        <Alert tone="info">{error ? t('search.error') : t('profile.loading')}</Alert>
      </main>
    );
  }

  return (
    <div>
      <nav className="kv-profile-back">
        <Link to={`/${slug}`}>← {agencyName}</Link>
      </nav>
      <SearchPage agencySlug={slug} agencyName={agencyName} />
    </div>
  );
}
