import { useTranslation } from 'react-i18next';
import type { SearchOfferDto } from '@kavriqo/api-client';

/**
 * Marketplace offer card (07-C07 list side / 07-E01 base). Shows the
 * server-authoritative total, the pickup point (07-C10: branch, city,
 * distance) and the agency.
 */

export interface ResultCardProps {
  offer: SearchOfferDto;
  selected: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}

export function ResultCard({ offer, selected, onSelect, onHover }: ResultCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const category = offer.vehicle.category;
  const priceMinor = offer.pricing.totalMinor;
  const branch = offer.pickupBranch;

  return (
    <article
      className={selected ? 'kv-result-card kv-result-card--selected' : 'kv-result-card'}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      data-testid="result-card"
    >
      <header className="kv-result-card__header">
        <div>
          <h3 className="kv-result-card__title">
            {offer.vehicle.make} {offer.vehicle.model} · {offer.vehicle.year}
          </h3>
          <p className="kv-result-card__agency">
            {t('search.agencyBy', { agency: offer.agency.name })}
          </p>
        </div>
        <div className="kv-result-card__price">
          <strong>{Math.round(priceMinor / 100).toLocaleString()} DZD</strong>
          <span>{t('search.total')}</span>
        </div>
      </header>
      <div className="kv-result-card__meta">
        <span>{category.name}</span>
        {category.seats !== null ? <span>{category.seats} {t('search.seats').toLowerCase()}</span> : null}
        {category.transmission ? <span>{category.transmission}</span> : null}
        {category.fuelType ? <span>{category.fuelType}</span> : null}
      </div>
      {branch ? (
        <p className="kv-result-card__branch">
          {t('search.pickupAt', { branch: branch.name })}
          {branch.location.city ? ` · ${branch.location.city}` : ''}
          {branch.distanceKm !== null
            ? ` · ${t('search.distanceKm', { distance: Math.round(branch.distanceKm) })}`
            : ''}
        </p>
      ) : null}
      {category.features.length > 0 ? (
        <p className="kv-result-card__features">
          {category.features.slice(0, 4).map((feature) => t(`search.features.${feature}`)).join(' · ')}
        </p>
      ) : null}
    </article>
  );
}
