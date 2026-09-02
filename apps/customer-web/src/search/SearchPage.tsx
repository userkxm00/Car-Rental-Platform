import { useEffect, useMemo, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Input, Select } from '@kavriqo/ui';
import { createMapProviders, osmFallbackTiles, providerCapabilityStatus } from '@kavriqo/maps';
import type { GeocodingSuggestion } from '@kavriqo/maps';
import { createApi } from '../api';
import type { SearchSortValue } from '@kavriqo/api-client';
import {
  buildSearchQuery,
  initialState,
  markerFeaturesFromLocations,
  markerFeaturesFromResults,
  marketplaceReducer,
} from './query-state';
import type { MarkerFeature, Viewport } from './query-state';
import { AutocompleteInput } from './AutocompleteInput';
import { MapView } from '../maps/MapView';
import { ResultCard } from './ResultCard';

/**
 * Marketplace search page (07-C07/07-C08): split map/list on large
 * screens, map/list toggle on mobile, synchronized pins and cards,
 * search-this-area over the 07-C09 proximity API.
 */

const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC'] as const;
const FUEL_TYPES = ['PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC', 'LPG'] as const;

function parseErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'UNKNOWN';
  }
  const code: unknown = error.code;
  return typeof code === 'string' ? code : 'UNKNOWN';
}

export function SearchPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [state, dispatch] = useReducer(marketplaceReducer, undefined, initialState);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const api = useMemo(() => createApi(), []);
  const providers = useMemo(
    () =>
      createMapProviders({
        apiKey: import.meta.env.VITE_MAPTILER_API_KEY as string | undefined,
        language: i18n.resolvedLanguage ?? 'en',
      }),
    [i18n.resolvedLanguage],
  );
  const capabilities = useMemo(() => providerCapabilityStatus(providers), [providers]);
  const tiles = providers.tiles.enabled ? providers.tiles : osmFallbackTiles;

  // 07-C05/07-C06: pickup-point feed for the initial (pre-search) pins.
  useEffect(() => {
    let cancelled = false;
    api
      .locations()
      .then((response) => {
        if (!cancelled) {
          dispatch({ type: 'LOCATIONS_LOADED', locations: response.items });
        }
      })
      .catch(() => {
        // Pins are a progressive enhancement; search still works.
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Server-authoritative results for the submitted query.
  useEffect(() => {
    const query = state.ui.lastQuery;
    if (!query) {
      return;
    }
    let cancelled = false;
    api
      .offers(query)
      .then((results) => {
        if (!cancelled) {
          dispatch({ type: 'RESULTS_LOADED', results });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({ type: 'RESULTS_FAILED', error: parseErrorCode(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.ui.lastQuery, api]);

  function submit(form: typeof state.form, viewport: Viewport | null): void {
    const query = buildSearchQuery(form, viewport);
    if (!query) {
      dispatch({ type: 'RESULTS_FAILED', error: 'INVALID_INTERVAL' });
      return;
    }
    dispatch({ type: 'SUBMITTED', query });
  }

  // 07-C08: re-run the search over the visible map area.
  function handleSearchThisArea(): void {
    const viewport = state.ui.viewport;
    if (!viewport) {
      return;
    }
    const form = {
      ...state.form,
      pickupLocationId: null,
      pickupCity: null,
      pickupLat: viewport.centerLat,
      pickupLng: viewport.centerLng,
      page: 1,
    };
    dispatch({ type: 'FORM_UPDATED', patch: form });
    submit(form, viewport);
  }

  function handleUseMyLocation(): void {
    if (!('geolocation' in navigator)) {
      setGeoError(t('search.geolocationUnsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setUserLocation(location);
        setGeoError(null);
        dispatch({
          type: 'FORM_UPDATED',
          patch: {
            pickupLocationId: null,
            pickupCity: null,
            pickupLat: location.latitude,
            pickupLng: location.longitude,
          },
        });
      },
      () => setGeoError(t('search.locationDenied')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function handlePickupSelected(suggestion: GeocodingSuggestion): void {
    dispatch({
      type: 'FORM_UPDATED',
      patch: {
        pickupLocationId: null,
        pickupCity: suggestion.city ?? suggestion.name,
        pickupLat: suggestion.latitude,
        pickupLng: suggestion.longitude,
      },
    });
  }

  function handleMarkerSelect(marker: MarkerFeature | null): void {
    dispatch({ type: 'OFFER_SELECTED', index: marker?.offerIndex ?? null });
  }

  const markers = useMemo(
    () =>
      state.ui.results
        ? markerFeaturesFromResults(state.ui.results)
        : markerFeaturesFromLocations(state.ui.locations),
    [state.ui.results, state.ui.locations],
  );

  const results = state.ui.results;
  const total = results?.total ?? 0;
  const lastPage = results ? Math.max(1, Math.ceil(results.total / results.limit)) : 1;

  return (
    <main className="kv-search-page">
      <section className="kv-search-hero">
        <h1>{t('search.title')}</h1>
        <p>{t('search.subtitle')}</p>
      </section>

      <section className="kv-search-form" aria-label={t('search.title')}>
        {capabilities.autocomplete ? (
          <AutocompleteInput
            geocoding={providers.autocomplete}
            value={state.form.pickupCity ?? ''}
            onChange={(value) => dispatch({ type: 'FORM_UPDATED', patch: { pickupCity: value } })}
            onSelect={handlePickupSelected}
            placeholder={t('search.pickupPlaceholder')}
            label={t('search.pickup')}
          />
        ) : (
          <div className="kv-field">
            <label className="kv-field__label" htmlFor="kv-pickup-city">
              {t('search.pickup')}
            </label>
            <Input
              id="kv-pickup-city"
              value={state.form.pickupCity ?? ''}
              onChange={(event) => dispatch({ type: 'FORM_UPDATED', patch: { pickupCity: event.target.value } })}
              placeholder={t('search.pickupPlaceholder')}
            />
          </div>
        )}
        <div className="kv-field">
          <label className="kv-field__label" htmlFor="kv-start">
            {t('search.start')}
          </label>
          <Input
            id="kv-start"
            type="datetime-local"
            value={state.form.start}
            onChange={(event) => dispatch({ type: 'FORM_UPDATED', patch: { start: event.target.value } })}
          />
        </div>
        <div className="kv-field">
          <label className="kv-field__label" htmlFor="kv-end">
            {t('search.end')}
          </label>
          <Input
            id="kv-end"
            type="datetime-local"
            value={state.form.end}
            onChange={(event) => dispatch({ type: 'FORM_UPDATED', patch: { end: event.target.value } })}
          />
        </div>
        <div className="kv-field">
          <label className="kv-field__label" htmlFor="kv-seats">
            {t('search.seats')}
          </label>
          <Select
            id="kv-seats"
            value={state.form.seats}
            onChange={(event) => dispatch({ type: 'FORM_UPDATED', patch: { seats: event.target.value } })}
          >
            <option value="">{t('search.anySeats')}</option>
            {[2, 4, 5, 7, 9].map((seats) => (
              <option key={seats} value={String(seats)}>
                {seats}
              </option>
            ))}
          </Select>
        </div>
        <div className="kv-field">
          <label className="kv-field__label" htmlFor="kv-transmission">
            {t('search.transmission')}
          </label>
          <Select
            id="kv-transmission"
            value={state.form.transmission}
            onChange={(event) => dispatch({ type: 'FORM_UPDATED', patch: { transmission: event.target.value } })}
          >
            <option value="">{t('search.anyTransmission')}</option>
            {TRANSMISSIONS.map((transmission) => (
              <option key={transmission} value={transmission}>
                {transmission}
              </option>
            ))}
          </Select>
        </div>
        <div className="kv-field">
          <label className="kv-field__label" htmlFor="kv-fuel">
            {t('search.fuelType')}
          </label>
          <Select
            id="kv-fuel"
            value={state.form.fuelType}
            onChange={(event) => dispatch({ type: 'FORM_UPDATED', patch: { fuelType: event.target.value } })}
          >
            <option value="">{t('search.anyFuel')}</option>
            {FUEL_TYPES.map((fuelType) => (
              <option key={fuelType} value={fuelType}>
                {fuelType}
              </option>
            ))}
          </Select>
        </div>
        <div className="kv-field">
          <label className="kv-field__label" htmlFor="kv-price">
            {t('search.priceMax')}
          </label>
          <Input
            id="kv-price"
            inputMode="numeric"
            value={state.form.priceMaxMinor}
            onChange={(event) => dispatch({ type: 'FORM_UPDATED', patch: { priceMaxMinor: event.target.value } })}
          />
        </div>
        <div className="kv-search-form__actions">
          <Button variant="primary" disabled={state.ui.pending} onClick={() => submit(state.form, null)}>
            {state.ui.pending ? t('search.searching') : t('search.search')}
          </Button>
        </div>
      </section>

      <section className="kv-search-toolbar">
        <span className="kv-search-toolbar__count">
          {state.ui.pending
            ? t('search.loading')
            : total === 0
              ? t('search.resultsZero')
              : t('search.resultsCount', { count: total })}
        </span>
        <div className="kv-search-toolbar__controls">
          <label className="kv-field__label" htmlFor="kv-sort">
            {t('search.sort')}
          </label>
          <Select
            id="kv-sort"
            value={state.form.sort}
            onChange={(event) => dispatch({ type: 'FORM_UPDATED', patch: { sort: event.target.value as SearchSortValue } })}
          >
            <option value="price_asc">{t('search.sortPriceAsc')}</option>
            <option value="price_desc">{t('search.sortPriceDesc')}</option>
            <option value="distance_asc">{t('search.sortDistanceAsc')}</option>
          </Select>
          <Button variant="secondary" onClick={() => dispatch({ type: 'MODE_TOGGLED' })}>
            {state.ui.mode === 'map' ? t('search.viewList') : t('search.viewOnMap')}
          </Button>
        </div>
      </section>

      {state.ui.error ? <Alert tone="error">{state.ui.error === 'INVALID_INTERVAL' ? t('search.validation.intervalOrder') : t('search.error')}</Alert> : null}

      <section className="kv-search-split" data-mode={state.ui.mode}>
        <div className="kv-map-pane">
          <MapView
            tiles={tiles}
            viewport={state.ui.viewport}
            markers={markers}
            selectedOfferIndex={state.ui.selectedOfferIndex}
            userLocation={userLocation}
            onViewportChange={(viewport) => dispatch({ type: 'VIEWPORT_CHANGED', viewport })}
            onMarkerSelect={handleMarkerSelect}
          />
          <div className="kv-map-controls">
            {state.ui.mapMoved ? (
              <Button variant="primary" onClick={handleSearchThisArea}>
                {t('search.searchThisArea')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={handleUseMyLocation}>
              {t('search.useMyLocation')}
            </Button>
          </div>
        </div>
        <aside className="kv-list-pane">
          {geoError ? <Alert tone="info">{geoError}</Alert> : null}
          {results && results.items.length === 0 && !state.ui.pending ? (
            <p className="kv-list-pane__empty">{t('search.resultsZero')}</p>
          ) : (
            <ul className="kv-result-list">
              {(results?.items ?? []).map((offer, index) => (
                <li key={offer.vehicle.id + offer.agency.id}>
                  <ResultCard
                    offer={offer}
                    selected={state.ui.selectedOfferIndex === index}
                    onSelect={() => dispatch({ type: 'OFFER_SELECTED', index })}
                    onHover={(hovered) => dispatch({ type: 'OFFER_HOVERED', index: hovered ? index : null })}
                  />
                </li>
              ))}
            </ul>
          )}
          {results && results.total > results.limit ? (
            <nav className="kv-pagination" aria-label="Pagination">
              <Button
                variant="secondary"
                disabled={state.form.page <= 1}
                onClick={() => submit({ ...state.form, page: state.form.page - 1 }, null)}
              >
                ←
              </Button>
              <span>
                {state.form.page} / {lastPage}
              </span>
              <Button
                variant="secondary"
                disabled={state.form.page >= lastPage}
                onClick={() => submit({ ...state.form, page: state.form.page + 1 }, null)}
              >
                →
              </Button>
            </nav>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
