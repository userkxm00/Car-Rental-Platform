import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@kavriqo/ui';
import { createMapProviders, osmFallbackTiles } from '@kavriqo/maps';
import type { VehicleDetailResponseDto } from '../api';
import { createApi } from '../api';
import { MapView } from '../maps/MapView';
import type { MarkerFeature } from '../search/query-state';
import { defaultIntervalIso } from '../search/query-state';

/**
 * Vehicle offer detail (07-D09/07-D10): structured gallery, specs and
 * features, server-authoritative pricing for the selected dates (or the
 * honest not-bookable state), pickup branch with hours and contacts, and
 * the pickup point on a map. The booking CTA lands with 07-E.
 */

function parseErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'UNKNOWN';
  }
  const code: unknown = error.code;
  return typeof code === 'string' ? code : 'UNKNOWN';
}

function CategoryName({ detail }: { detail: VehicleDetailResponseDto }): React.JSX.Element {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const category = detail.vehicle.category;
  const localized =
    locale === 'ar' ? category.nameAr : locale === 'fr' ? category.nameFr : null;
  return <>{localized ?? category.name}</>;
}

function CategoryDescription({ detail }: { detail: VehicleDetailResponseDto }): React.JSX.Element | null {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const category = detail.vehicle.category;
  const localized =
    locale === 'ar' ? category.descriptionAr : locale === 'fr' ? category.descriptionFr : category.description;
  return localized ? <p className="kv-vehicle-desc">{localized}</p> : null;
}

export function VehicleDetailPage(): React.JSX.Element {
  const { slug = '', vehicleId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState<VehicleDetailResponseDto | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const api = useMemo(() => createApi(), []);

  const [start, end] = useMemo(() => {
    const defaults = defaultIntervalIso();
    return [searchParams.get('start') ?? defaults.start, searchParams.get('end') ?? defaults.end];
  }, [searchParams]);

  const providers = useMemo(
    () =>
      createMapProviders({
        apiKey: import.meta.env.VITE_MAPTILER_API_KEY as string | undefined,
        language: i18n.resolvedLanguage ?? 'en',
      }),
    [i18n.resolvedLanguage],
  );
  const tiles = providers.tiles.enabled ? providers.tiles : osmFallbackTiles;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .vehicle(slug, vehicleId, { start, end })
      .then((response) => {
        if (!cancelled) {
          setDetail(response);
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
  }, [slug, vehicleId, start, end, api]);

  // 07-D10: signed gallery URLs (progressive — failures leave placeholders).
  useEffect(() => {
    if (!detail || detail.vehicle.gallery.length === 0) {
      return;
    }
    let cancelled = false;
    for (const image of detail.vehicle.gallery) {
      api
        .vehicleImageUrl(slug, vehicleId, image.id)
        .then((signed) => {
          if (!cancelled) {
            setImageUrls((current) => ({ ...current, [image.id]: signed.url }));
          }
        })
        .catch(() => {
          // Placeholder stays.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [detail, slug, vehicleId, api]);

  if (error === 'VEHICLE_NOT_FOUND' || error === 'AGENCY_NOT_FOUND') {
    return (
      <main className="kv-profile-page">
        <Alert tone="error">{t('vehicle.notFound')}</Alert>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="kv-profile-page">
        <Alert tone="info">{error ? t('search.error') : t('vehicle.loading')}</Alert>
      </main>
    );
  }

  const { vehicle, offer } = detail;
  const branch = vehicle.pickupBranch;
  const branchMarker: MarkerFeature | null =
    branch && branch.location.latitude !== null && branch.location.longitude !== null
      ? {
          id: `branch-${branch.id}`,
          latitude: branch.location.latitude,
          longitude: branch.location.longitude,
          kind: 'location',
          title: branch.name,
          city: branch.location.city,
          agencyName: '',
          offerIndex: null,
          priceMinor: null,
          distanceKm: offer?.pickupBranch?.distanceKm ?? null,
        }
      : null;
  const viewport =
    branchMarker !== null
      ? {
          west: branchMarker.longitude - 0.05,
          south: branchMarker.latitude - 0.05,
          east: branchMarker.longitude + 0.05,
          north: branchMarker.latitude + 0.05,
          centerLat: branchMarker.latitude,
          centerLng: branchMarker.longitude,
        }
      : null;

  return (
    <main className="kv-vehicle-page">
      <nav className="kv-profile-back">
        <Link to={`/${slug}/vehicles`}>← {t('vehicle.backToFleet')}</Link>
      </nav>

      <header className="kv-vehicle-header">
        <div>
          <h1>
            {vehicle.make} {vehicle.model} · {vehicle.year}
          </h1>
          <p>
            <CategoryName detail={detail} /> · {vehicle.year}
          </p>
        </div>
        {offer ? (
          <div className="kv-vehicle-price">
            <strong>{Math.round(offer.pricing.totalMinor / 100).toLocaleString()} DZD</strong>
            <span>{t('search.total')}</span>
          </div>
        ) : null}
      </header>

      {vehicle.gallery.length > 0 ? (
        <section className="kv-vehicle-gallery" aria-label={t('vehicle.gallery')}>
          {vehicle.gallery.map((image) => (
            <figure key={image.id} className={image.isPrimary ? 'kv-vehicle-gallery__primary' : undefined}>
              {imageUrls[image.id] ? (
                <img src={imageUrls[image.id]} alt={`${vehicle.make} ${vehicle.model}`} loading="lazy" />
              ) : (
                <div className="kv-vehicle-gallery__placeholder">KAVRIQO</div>
              )}
            </figure>
          ))}
        </section>
      ) : null}

      <CategoryDescription detail={detail} />

      <section className="kv-vehicle-specs">
        <div>
          <span>{t('vehicle.year')}</span>
          <strong>{vehicle.year}</strong>
        </div>
        <div>
          <span>{t('vehicle.seatsLabel')}</span>
          <strong>{vehicle.category.seats ?? '—'}</strong>
        </div>
        <div>
          <span>{t('vehicle.transmissionLabel')}</span>
          <strong>{vehicle.category.transmission ?? '—'}</strong>
        </div>
        <div>
          <span>{t('vehicle.fuelLabel')}</span>
          <strong>{vehicle.category.fuelType ?? '—'}</strong>
        </div>
      </section>

      {vehicle.category.features.length > 0 ? (
        <section className="kv-vehicle-features">
          <h2>{t('vehicle.featuresTitle')}</h2>
          <ul>
            {vehicle.category.features.map((feature) => (
              <li key={feature}>{t(`search.features.${feature}`)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="kv-vehicle-offer">
        <h2>{t('vehicle.pricingTitle')}</h2>
        {offer ? (
          <div>
            <p className="kv-vehicle-offer__total">
              <strong>{Math.round(offer.pricing.totalMinor / 100).toLocaleString()} {offer.pricing.currency}</strong>
              <span>
                {new Date(start).toLocaleDateString(i18n.resolvedLanguage ?? 'en')} →{' '}
                {new Date(end).toLocaleDateString(i18n.resolvedLanguage ?? 'en')}
              </span>
            </p>
            {offer.pricing.breakdown.length > 0 ? (
              <ul className="kv-vehicle-offer__breakdown">
                {offer.pricing.breakdown.map((line) => (
                  <li key={line.code}>
                    <span>{line.code}</span>
                    <span>{Math.round(line.amountMinor / 100).toLocaleString()} DZD</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {offer.pricing.depositMinor !== null ? (
              <p className="kv-vehicle-offer__deposit">
                {t('vehicle.deposit')}: {Math.round(offer.pricing.depositMinor / 100).toLocaleString()} DZD
              </p>
            ) : null}
          </div>
        ) : (
          <Alert tone="info">{t('vehicle.pricingUnavailable')}</Alert>
        )}
        {offer ? (
          <Link
            className="kv-button"
            to={`/book/${encodeURIComponent(slug)}?vehicleId=${encodeURIComponent(vehicleId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}
          >
            {t('vehicle.bookCta')}
          </Link>
        ) : (
          <Button variant="primary" disabled title={t('vehicle.pricingUnavailable')}>
            {t('vehicle.bookCta')}
          </Button>
        )}
      </section>

      <section className="kv-vehicle-pickup">
        <h2>{t('vehicle.pickupTitle')}</h2>
        {branch ? (
          <article className="kv-profile-branch">
            <h3>
              {branch.name}
              {branch.location.city ? ` · ${branch.location.city}` : ''}
            </h3>
            <p className="kv-profile-branch__address">
              {[branch.location.addressLine1, branch.location.addressLine2, branch.location.region]
                .filter((part): part is string => typeof part === 'string' && part.length > 0)
                .join(', ')}
            </p>
            <div className="kv-profile-branch__contacts">
              {branch.contacts.phone ? <span>{t('profile.phone')}: {branch.contacts.phone}</span> : null}
              {branch.contacts.email ? <span>{t('profile.email')}: {branch.contacts.email}</span> : null}
              {branch.contacts.whatsapp ? <span>{t('profile.whatsapp')}: {branch.contacts.whatsapp}</span> : null}
            </div>
            {branch.hours.regular.length > 0 ? (
              <ul className="kv-profile-hours">
                {branch.hours.regular.slice(0, 3).map((day) => (
                  <li key={day.dayOfWeek}>
                    <span>{t(`profile.day_${day.dayOfWeek}`)}</span>
                    <span>{day.opensAt}–{day.closesAt}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ) : null}
        {branchMarker && viewport ? (
          <div className="kv-vehicle-map">
            <MapView
              tiles={tiles}
              viewport={viewport}
              markers={[branchMarker]}
              selectedOfferIndex={null}
              userLocation={null}
              onViewportChange={() => undefined}
              onMarkerSelect={() => undefined}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
