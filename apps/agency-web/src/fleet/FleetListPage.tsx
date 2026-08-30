import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { VehicleDto, VehicleStatus } from '@kavriqo/api-client';
import { Badge, Button, Input, Main, PageHeader, Select } from '@kavriqo/ui';
import { createApi, statusTone, VEHICLE_STATUSES } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useAgency } from '../agency/AgencyContext';

/**
 * Fleet list (03-D01): status filter, text search, status pills, navigation
 * to vehicle detail and creation.
 */
export function FleetListPage(): ReactNode {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { agencyId } = useAgency();
  const api = useMemo(() => createApi(token), [token]);

  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!agencyId) {
      setLoading(false);
      return;
    }
    api.vehicles
      .list(agencyId, { status: (status || undefined) as VehicleStatus | undefined, search })
      .then((result) => {
        if (!cancelled) {
          setVehicles(result.vehicles);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('fleet.error'));
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
  }, [api, agencyId, status, search, t]);

  return (
    <Main>
      <PageHeader
        title={t('fleet.listTitle')}
        actions={
          <Link to="/fleet/new">
            <Button>{t('fleet.createVehicle')}</Button>
          </Link>
        }
      />
      <div className="kv-grid" style={{ gridTemplateColumns: '1fr 220px', marginBottom: 16 }}>
        <Input
          aria-label={t('fleet.searchPlaceholder')}
          placeholder={t('fleet.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          aria-label={t('fleet.status')}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t('fleet.allStatuses')}</option>
          {VEHICLE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`fleet.statuses.${value}`)}
            </option>
          ))}
        </Select>
      </div>

      {loading ? <p>{t('fleet.loading')}</p> : null}
      {error ? (
        <div className="kv-alert kv-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {!loading && !error && vehicles.length === 0 ? <p>{t('fleet.empty')}</p> : null}

      {!loading && vehicles.length > 0 ? (
        <table className="kv-table">
          <thead>
            <tr>
              <th>{t('fleet.make')}</th>
              <th>{t('fleet.model')}</th>
              <th>{t('fleet.year')}</th>
              <th>{t('fleet.plate')}</th>
              <th>{t('fleet.status')}</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td>
                  <Link to={`/fleet/${vehicle.id}`} style={{ color: 'var(--kv-brand)' }}>
                    {vehicle.make}
                  </Link>
                </td>
                <td>{vehicle.model}</td>
                <td>{vehicle.year}</td>
                <td>{vehicle.plateNumber}</td>
                <td>
                  <Badge tone={statusTone(vehicle.status)}>
                    {t(`fleet.statuses.${vehicle.status}`)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Main>
  );
}
