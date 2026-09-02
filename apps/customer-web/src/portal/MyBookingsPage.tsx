import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Card } from '@kavriqo/ui';
import type { PortalBookingDto } from '../api';
import { createApi } from '../api';
import { PortalTokenGate } from './PortalTokenGate';

/**
 * My reservations (07-E09): the caller's bookings across agencies,
 * newest first, with the agency link and the current lifecycle status.
 */

export function bookingStatusLabel(status: string): string {
  return `booking.status.${status}`;
}

export function MyBookingsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const api = useMemo(() => createApi(), []);
  const [bookings, setBookings] = useState<PortalBookingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .listBookings()
      .then((response) => {
        if (!cancelled) {
          setBookings(response);
        }
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : 'UNKNOWN');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <PortalTokenGate>
      <main className="kv-profile-page">
        <h1>{t('bookings.title')}</h1>
        {error ? <Alert tone="error">{t('bookings.error')}</Alert> : null}
        {bookings !== null && bookings.length === 0 ? (
          <Alert tone="info">{t('bookings.empty')}</Alert>
        ) : null}
        {bookings === null && !error ? <Alert tone="info">{t('bookings.loading')}</Alert> : null}
        <ul className="kv-portal-booking-list">
          {(bookings ?? []).map((booking) => (
            <li key={booking.bookingId}>
              <Card>
                <Link className="kv-portal-booking-link" to={`/bookings/${booking.bookingId}`}>
                  <span className="kv-portal-booking-number">{booking.bookingNumber}</span>
                  <span className={`kv-status kv-status--${booking.status.toLowerCase()}`}>
                    {t(bookingStatusLabel(booking.status))}
                  </span>
                  <span className="kv-portal-booking-dates">
                    {new Date(booking.start).toLocaleDateString(i18n.resolvedLanguage ?? 'en')} →{' '}
                    {new Date(booking.end).toLocaleDateString(i18n.resolvedLanguage ?? 'en')}
                  </span>
                  {booking.agencySlug ? (
                    <span className="kv-portal-booking-agency">
                      {t('bookings.agency', { agency: booking.agencySlug })}
                    </span>
                  ) : null}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </main>
    </PortalTokenGate>
  );
}
