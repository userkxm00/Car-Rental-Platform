import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Field, Input } from '@kavriqo/ui';
import type { PortalBookingDto, PublicBranchDto } from '../api';
import { createApi } from '../api';
import { PortalTokenGate } from './PortalTokenGate';
import { bookingStatusLabel } from './MyBookingsPage';

/**
 * Reservation detail (07-E09/E10/E11): lifecycle status with the audit
 * trail, confirmation for DRAFT reservations, customer cancellation with
 * a reason (07-E10) and the agency support/contact surface (07-E11).
 */

const CANCELLABLE_STATUSES = ['DRAFT', 'HOLD', 'PENDING_CONFIRMATION', 'CONFIRMED', 'READY_FOR_PICKUP'];

export function BookingDetailPage(): React.JSX.Element {
  const { bookingId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const api = useMemo(() => createApi(), []);
  const [booking, setBooking] = useState<PortalBookingDto | null>(null);
  const [branches, setBranches] = useState<PublicBranchDto[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    api
      .booking(bookingId)
      .then((response) => {
        setBooking(response);
        if (response.agencySlug) {
          api
            .branches(response.agencySlug)
            .then((branchResponse) => setBranches(branchResponse.items))
            .catch(() => setBranches([]));
        }
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'UNKNOWN');
      });
  };

  useEffect(() => {
    load();
  }, [bookingId, api]);

  const confirm = (): void => {
    if (!booking) {
      return;
    }
    setBusy(true);
    api
      .confirmBooking(booking.bookingId, {})
      .then((updated) => {
        setBooking(updated);
        setBusy(false);
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'UNKNOWN');
        setBusy(false);
      });
  };

  const cancel = (): void => {
    if (!booking || reason.trim().length === 0) {
      return;
    }
    setBusy(true);
    api
      .cancelBooking(booking.bookingId, reason.trim())
      .then((updated) => {
        setBooking(updated);
        setReason('');
        setBusy(false);
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'UNKNOWN');
        setBusy(false);
      });
  };

  return (
    <PortalTokenGate>
      <main className="kv-profile-page">
        <nav className="kv-profile-back">
          <Link to="/bookings">← {t('bookings.title')}</Link>
        </nav>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {!booking && !error ? <Alert tone="info">{t('booking.loading')}</Alert> : null}

        {booking ? (
          <>
            <header className="kv-portal-detail-header">
              <h1>{booking.bookingNumber}</h1>
              <span className={`kv-status kv-status--${booking.status.toLowerCase()}`}>
                {t(bookingStatusLabel(booking.status))}
              </span>
            </header>

            <Card>
              <h2>{t('booking.dates')}</h2>
              <p>
                {new Date(booking.start).toLocaleDateString(i18n.resolvedLanguage ?? 'en')} →{' '}
                {new Date(booking.end).toLocaleDateString(i18n.resolvedLanguage ?? 'en')}
              </p>
              {booking.agencySlug ? (
                <p>
                  {t('bookings.agencyLabel')}:{' '}
                  <Link to={`/${booking.agencySlug}`}>{booking.agencySlug}</Link>
                </p>
              ) : null}
              <p>{t('booking.channel')}: {booking.channel}</p>
            </Card>

            {booking.status === 'DRAFT' ? (
              <Card>
                <h2>{t('booking.confirmTitle')}</h2>
                <p>{t('booking.confirmHint')}</p>
                <Button onClick={confirm} disabled={busy} type="button">
                  {t('booking.confirm')}
                </Button>
              </Card>
            ) : null}

            {CANCELLABLE_STATUSES.includes(booking.status) ? (
              <Card>
                <h2>{t('booking.cancelTitle')}</h2>
                <Field label={t('booking.cancelReason')}>
                  <Input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t('booking.cancelPlaceholder')}
                  />
                </Field>
                <Button
                  variant="danger"
                  onClick={cancel}
                  disabled={busy || reason.trim().length === 0}
                  type="button"
                >
                  {t('booking.cancel')}
                </Button>
              </Card>
            ) : null}

            <Card>
              <h2>{t('booking.history')}</h2>
              <ul className="kv-portal-history">
                {booking.statusHistory.map((entry) => (
                  <li key={entry.historyId}>
                    <span className={`kv-status kv-status--${entry.toStatus.toLowerCase()}`}>
                      {t(bookingStatusLabel(entry.toStatus))}
                    </span>
                    <span>
                      {new Date(entry.createdAt).toLocaleString(i18n.resolvedLanguage ?? 'en')}
                    </span>
                    {entry.reason ? <span className="kv-portal-history__reason">{entry.reason}</span> : null}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h2>{t('booking.support')}</h2>
              {branches.length > 0 ? (
                <ul className="kv-portal-support">
                  {branches.map((branch) => (
                    <li key={branch.id}>
                      <strong>{branch.name}</strong>
                      {branch.contacts.phone ? <span>{t('profile.phone')}: {branch.contacts.phone}</span> : null}
                      {branch.contacts.email ? <span>{t('profile.email')}: {branch.contacts.email}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {booking.agencySlug ? (
                    <>
                      {t('booking.supportHint')}{' '}
                      <Link to={`/${booking.agencySlug}`}>{t('booking.agencyPage')}</Link>
                    </>
                  ) : (
                    t('booking.supportHint')
                  )}
                </p>
              )}
            </Card>
          </>
        ) : null}
      </main>
    </PortalTokenGate>
  );
}
