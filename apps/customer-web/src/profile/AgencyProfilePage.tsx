import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button } from '@kavriqo/ui';
import type { AgencyProfileDto, PublicBranchDto } from '../api';
import { createApi } from '../api';

/**
 * Agency public profile (07-D01/D02/D05/D06/D07): identity + verification
 * badge, honest NEW rating state, service areas, fleet/branch stats,
 * deposit policies and the public branch list with opening hours and
 * contact methods (07-D03/D04). Non-participating agencies 404.
 */

function parseErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'UNKNOWN';
  }
  const code: unknown = error.code;
  return typeof code === 'string' ? code : 'UNKNOWN';
}

function VerificationBadge({ status }: { status: AgencyProfileDto['agency']['verificationStatus'] }): React.JSX.Element {
  const { t } = useTranslation();
  if (status === 'VERIFIED') {
    return <Badge tone="success">{t('profile.verifiedBadge')}</Badge>;
  }
  if (status === 'PENDING') {
    return <Badge tone="warning">{t('profile.pendingBadge')}</Badge>;
  }
  return <Badge tone="info">{t('profile.unverifiedBadge')}</Badge>;
}

function BranchCard({ branch }: { branch: PublicBranchDto }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const established = branch.location.city ? `${branch.name} · ${branch.location.city}` : branch.name;
  const hours = branch.hours.regular.length > 0 ? (
    <ul className="kv-profile-hours">
      {branch.hours.regular.map((day) => (
        <li key={day.dayOfWeek}>
          <span>{t(`profile.day_${day.dayOfWeek}`)}</span>
          <span>{day.opensAt}–{day.closesAt}</span>
        </li>
      ))}
      {branch.hours.exceptions.map((exception) => (
        <li key={exception.date} className="kv-profile-hours__exception">
          <span>{t('profile.exceptionClosed', { date: new Date(`${exception.date}T00:00:00`).toLocaleDateString(locale) })}</span>
          <span>{t('profile.closedDay')}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p>{t('profile.closedDay')}</p>
  );
  return (
    <article className="kv-profile-branch" data-testid="profile-branch">
      <h3>{established}</h3>
      <p className="kv-profile-branch__address">
        {[branch.location.addressLine1, branch.location.region, branch.location.countryCode]
          .filter((part): part is string => typeof part === 'string' && part.length > 0)
          .join(', ')}
      </p>
      <div className="kv-profile-branch__contacts">
        {branch.contacts.phone ? <span>{t('profile.phone')}: {branch.contacts.phone}</span> : null}
        {branch.contacts.email ? <span>{t('profile.email')}: {branch.contacts.email}</span> : null}
        {branch.contacts.whatsapp ? <span>{t('profile.whatsapp')}: {branch.contacts.whatsapp}</span> : null}
      </div>
      <h4>{t('profile.openHours')}</h4>
      {hours}
    </article>
  );
}

export function AgencyProfilePage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<AgencyProfileDto | null>(null);
  const [branches, setBranches] = useState<PublicBranchDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const api = useMemo(() => createApi(), []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([api.profile(slug), api.branches(slug)])
      .then(([profileResponse, branchesResponse]) => {
        if (!cancelled) {
          setProfile(profileResponse);
          setBranches(branchesResponse.items);
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
  if (!profile) {
    return (
      <main className="kv-profile-page">
        <Alert tone="info">{error ? t('search.error') : t('profile.loading')}</Alert>
      </main>
    );
  }

  const locale = i18n.resolvedLanguage ?? 'en';
  const established = new Date(profile.agency.establishedAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
  });

  return (
    <main className="kv-profile-page">
      <header className="kv-profile-hero">
        <div>
          <h1>{profile.agency.name}</h1>
          <p className="kv-profile-hero__meta">
            {profile.agency.legalName ? <span>{profile.agency.legalName} · </span> : null}
            <span>{t('profile.established', { date: established })}</span>
          </p>
        </div>
        <div className="kv-profile-hero__badges">
          <VerificationBadge status={profile.agency.verificationStatus} />
          <Badge tone="info">{t('profile.newAgency')}</Badge>
        </div>
      </header>

      <section className="kv-profile-stats">
        <div>
          <strong>{profile.stats.fleetCount}</strong>
          <span>{t('profile.fleetSize', { count: profile.stats.fleetCount })}</span>
        </div>
        <div>
          <strong>{profile.stats.branchCount}</strong>
          <span>{t('profile.branchCount', { count: profile.stats.branchCount })}</span>
        </div>
        <div>
          <strong>{profile.serviceAreas.length}</strong>
          <span>{t('profile.serviceAreas')}</span>
        </div>
      </section>

      {profile.serviceAreas.length > 0 ? (
        <p className="kv-profile-areas">{profile.serviceAreas.join(' · ')}</p>
      ) : null}

      <section className="kv-profile-policies">
        <h2>{t('profile.policiesTitle')}</h2>
        {profile.depositPolicies.length > 0 ? (
          <ul>
            {profile.depositPolicies.map((policy) => (
              <li key={`${policy.name}-${policy.depositType}`}>
                {policy.depositType === 'FIXED_MINOR'
                  ? t('profile.policyFixed', { value: Math.round(policy.valueMinor / 100).toLocaleString() })
                  : t('profile.policyPercent', { value: Math.round(policy.valueMinor / 100) })}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('profile.noPolicies')}</p>
        )}
      </section>

      <section className="kv-profile-branches">
        <h2>{t('profile.branchesTitle')}</h2>
        {branches.map((branch) => (
          <BranchCard key={branch.id} branch={branch} />
        ))}
        <div className="kv-profile-actions">
          <Link to={`/${slug}/vehicles`}>
            <Button variant="primary">{t('profile.availableCars')} →</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
