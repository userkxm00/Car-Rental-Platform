import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Field, Input, Select } from '@kavriqo/ui';
import type { AgencyProfileDto, PortalQuoteDto } from '../api';
import { ApiError, createApi } from '../api';
import { defaultIntervalIso } from '../search/query-state';
import { PortalTokenGate } from './PortalTokenGate';

/**
 * Customer booking wizard (07-E04…E08): quote review with refresh
 * (07-E03/E04), the customer record form (07-E05), agency policy
 * presentation (07-E06), payment-method selection (07-E07 — pay at
 * agency until the payments phase) and the reservation confirmation
 * step (07-E08). The server stays authoritative: pricing, expiry,
 * availability and booking state all come from the API.
 */

type WizardState = 'review' | 'reserved';

function parseErrorCode(error: unknown): string {
  if (error instanceof ApiError) {
    return error.code;
  }
  return 'UNKNOWN';
}

export function BookingWizardPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const api = useMemo(() => createApi(), []);

  const vehicleId = searchParams.get('vehicleId');
  const [start, end] = useMemo(() => {
    const defaults = defaultIntervalIso();
    return [searchParams.get('start') ?? defaults.start, searchParams.get('end') ?? defaults.end];
  }, [searchParams]);

  const [profile, setProfile] = useState<AgencyProfileDto | null>(null);
  const [quote, setQuote] = useState<PortalQuoteDto | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<'AT_AGENCY' | 'CASH_ON_DELIVERY'>('AT_AGENCY');
  const [state, setState] = useState<WizardState>('review');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // 07-E06: agency identity + policies for the review screen.
  useEffect(() => {
    let cancelled = false;
    api
      .profile(slug)
      .then((response) => {
        if (!cancelled) {
          setProfile(response);
        }
      })
      .catch(() => {
        // The quote request below reports the real error.
      });
    return () => {
      cancelled = true;
    };
  }, [slug, api]);

  // 07-E04: quote review (re-requested on refresh → 07-E03).
  const requestQuote = (): void => {
    setBusy(true);
    setQuoteError(null);
    api
      .createQuote(slug, { vehicleId: vehicleId ?? undefined, start, end })
      .then((response) => {
        setQuote(response);
        setBusy(false);
      })
      .catch((failure: unknown) => {
        setQuote(null);
        setQuoteError(parseErrorCode(failure));
        setBusy(false);
      });
  };

  useEffect(() => {
    requestQuote();
    // Dates, slug and vehicle drive the quote.
  }, [slug, vehicleId, start, end, api]);

  // 07-E05: resolve-or-create the caller's customer record for this agency.
  useEffect(() => {
    let cancelled = false;
    api
      .ensureCustomer(slug)
      .then((response) => {
        if (!cancelled) {
          setCustomerName(`${response.firstName} ${response.lastName}`.trim());
        }
      })
      .catch(() => {
        // Reserved step surfaces the failure with a retry.
      });
    return () => {
      cancelled = true;
    };
  }, [slug, api]);

  const reserve = (): void => {
    if (!quote || quote.expired) {
      return;
    }
    setBusy(true);
    setError(null);
    api
      .createBooking({ quoteId: quote.quoteId })
      .then((booking) =>
        // 07-E08: confirmation request; the customer record link is
        // server-verified (07-E05).
        api.confirmBooking(booking.bookingId, {}),
      )
      .then((confirmed) => {
        setBookingId(confirmed.bookingId);
        setState('reserved');
        setBusy(false);
      })
      .catch((failure: unknown) => {
        setError(parseErrorCode(failure));
        setBusy(false);
      });
  };

  if (state === 'reserved' && bookingId) {
    return (
      <PortalTokenGate>
        <main className="kv-profile-page">
          <Alert tone="success">{t('booking.success')}</Alert>
          <div className="kv-portal-actions">
            <Link className="kv-button" to={`/bookings/${bookingId}`}>
              {t('booking.viewReservation')}
            </Link>
            <Link className="kv-button kv-button--secondary" to={`/${slug}`}>
              {t('booking.backToAgency')}
            </Link>
          </div>
        </main>
      </PortalTokenGate>
    );
  }

  return (
    <PortalTokenGate>
      <main className="kv-profile-page">
        <nav className="kv-profile-back">
          <Link to={`/${slug}`}>← {t('booking.backToAgency')}</Link>
        </nav>
        <h1>{t('booking.wizardTitle', { agency: profile?.agency.name ?? slug })}</h1>

        {!vehicleId ? (
          <Alert tone="info">{t('booking.categoryNote')}</Alert>
        ) : null}

        <Card>
          <h2>{t('booking.quoteReview')}</h2>
          <Field label={t('search.start')}>
            <Input value={start} readOnly />
          </Field>
          <Field label={t('search.end')}>
            <Input value={end} readOnly />
          </Field>
          {quote ? (
            <div className="kv-portal-quote">
              {quote.pricing ? (
                <p className="kv-vehicle-offer__total">
                  <strong>
                    {Math.round(quote.pricing.totalMinor / 100).toLocaleString()}{' '}
                    {quote.pricing.currency}
                  </strong>
                  <span>{t('search.total')}</span>
                </p>
              ) : (
                <Alert tone="info">{t('booking.pricingUnavailable')}</Alert>
              )}
              {quote.pricing?.depositMinor != null ? (
                <p className="kv-vehicle-offer__deposit">
                  {t('vehicle.deposit')}:{' '}
                  {Math.round(quote.pricing.depositMinor / 100).toLocaleString()} DZD
                </p>
              ) : null}
              {quote.expired ? <Alert tone="error">{t('booking.expired')}</Alert> : null}
            </div>
          ) : null}
          {quoteError ? <Alert tone="error">{t('booking.error')}: {quoteError}</Alert> : null}
          <Button variant="secondary" onClick={requestQuote} disabled={busy} type="button">
            {t('booking.refreshAvailability')}
          </Button>
        </Card>

        <Card>
          <h2>{t('booking.customerSection')}</h2>
          <p>
            {customerName
              ? t('booking.customerName', { name: customerName })
              : t('booking.customerLoading')}
          </p>
          <p className="kv-portal-hint">{t('booking.customerHint')}</p>
        </Card>

        <Card>
          <h2>{t('booking.policiesTitle')}</h2>
          {profile && profile.depositPolicies.length > 0 ? (
            <ul className="kv-portal-policies">
              {profile.depositPolicies.map((policy, index) => (
                <li key={`${policy.name}-${index}`}>
                  {t('booking.depositPolicy', {
                    name: policy.name,
                    amount: Math.round(policy.valueMinor / 100).toLocaleString(),
                  })}
                </li>
              ))}
            </ul>
          ) : (
            <Alert tone="info">{t('booking.policiesEmpty')}</Alert>
          )}
        </Card>

        <Card>
          <h2>{t('booking.paymentMethod')}</h2>
          <Field label={t('booking.paymentMethod')}>
            <Select
              value={payMethod}
              onChange={(event) => setPayMethod(event.target.value as typeof payMethod)}
              disabled
            >
              <option value="AT_AGENCY">{t('booking.payAtAgency')}</option>
              <option value="CASH_ON_DELIVERY">{t('booking.payOnDelivery')}</option>
            </Select>
          </Field>
          <Alert tone="info">{t('booking.payAtAgencyNote')}</Alert>
        </Card>

        {error ? <Alert tone="error">{t('booking.error')}: {error}</Alert> : null}
        <Button onClick={reserve} disabled={busy || !quote || quote.expired || quote.pricing === null}>
          {busy ? t('booking.reserving') : t('booking.reserve')}
        </Button>
      </main>
    </PortalTokenGate>
  );
}
