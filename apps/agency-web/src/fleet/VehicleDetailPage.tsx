import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { VehicleDocumentDto, VehicleDto, VehicleImageDto } from '@kavriqo/api-client';
import { Badge, Button, Card, Main, PageHeader, Select } from '@kavriqo/ui';
import { createApi, statusTone, VEHICLE_STATUSES } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useAgency } from '../agency/AgencyContext';

/**
 * Vehicle detail (03-D04/05/06/07): identity, status controls, gallery
 * (primary image + ordering) and documents with expiry indication.
 */
export function VehicleDetailPage(): ReactNode {
  const { t } = useTranslation();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const { token } = useAuth();
  const { agencyId } = useAgency();
  const api = useMemo(() => createApi(token), [token]);

  const [vehicle, setVehicle] = useState<VehicleDto | null>(null);
  const [images, setImages] = useState<VehicleImageDto[]>([]);
  const [documents, setDocuments] = useState<VehicleDocumentDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!agencyId || !vehicleId) {
      return;
    }
    api.vehicles
      .get(agencyId, vehicleId)
      .then(setVehicle)
      .catch(() => setError(t('fleet.error')));
    api.vehicles.images
      .list(agencyId, vehicleId)
      .then((result) => setImages(result.images))
      .catch(() => undefined);
    api.vehicles.documents
      .list(agencyId, vehicleId)
      .then((result) => setDocuments(result.documents))
      .catch(() => undefined);
  }, [api, agencyId, vehicleId, t]);

  async function changeStatus(status: string): Promise<void> {
    if (!agencyId || !vehicleId) {
      return;
    }
    try {
      const updated = await api.vehicles.setStatus(
        agencyId,
        vehicleId,
        status as VehicleDto['status'],
      );
      setVehicle(updated);
    } catch {
      setError(t('fleet.saveFailed'));
    }
  }

  async function loadImageUrl(imageId: string): Promise<void> {
    if (!agencyId || !vehicleId || signedUrls[imageId]) {
      return;
    }
    try {
      const result = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/api/v1/agencies/${agencyId}/vehicles/${vehicleId}/images/${imageId}/url`,
        { headers: { authorization: `Bearer ${token ?? ''}` } },
      ).then((response) => response.json() as Promise<{ url: string }>);
      setSignedUrls((previous) => ({ ...previous, [imageId]: result.url }));
    } catch {
      setError(t('fleet.error'));
    }
  }

  if (!vehicle) {
    return (
      <Main>
        <p>{t('fleet.loading')}</p>
      </Main>
    );
  }

  return (
    <Main>
      <PageHeader
        title={`${vehicle.make} ${vehicle.model} (${vehicle.year})`}
        actions={
          <Link to={`/fleet/${vehicle.id}/edit`}>
            <Button variant="secondary">{t('fleet.editTitle')}</Button>
          </Link>
        }
      />
      {error ? (
        <div className="kv-alert kv-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      <Card>
        <p>
          <strong>{t('fleet.plate')}:</strong> {vehicle.plateNumber}
          {vehicle.vin ? ` · VIN: ${vehicle.vin}` : ''}
          {vehicle.color ? ` · ${t('fleet.color')}: ${vehicle.color}` : ''}
        </p>
        <p>
          <Badge tone={statusTone(vehicle.status)}>{t(`fleet.statuses.${vehicle.status}`)}</Badge>
        </p>
        <p style={{ color: 'var(--kv-text-muted)', fontSize: 13 }}>{t('fleet.setStatusHint')}</p>
        <div className="kv-topbar__actions" style={{ maxWidth: 260 }}>
          <Select
            aria-label={t('fleet.setStatus')}
            value={vehicle.status}
            onChange={(event) => {
              void changeStatus(event.target.value);
            }}
          >
            {VEHICLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`fleet.statuses.${status}`)}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <h2 style={{ marginTop: 24 }}>{t('fleet.gallery')}</h2>
      {images.length === 0 ? (
        <p>{t('fleet.noImages')}</p>
      ) : (
        <div className="kv-grid">
          {images
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((image) => (
              <Card key={image.id}>
                {image.isPrimary ? <Badge tone="info">★</Badge> : null}
                <p style={{ fontSize: 13 }}>#{image.position + 1}</p>
                {signedUrls[image.id] ? (
                  <img
                    src={signedUrls[image.id]}
                    alt={`${t('fleet.gallery')} ${image.position + 1}`}
                    style={{ maxWidth: '100%', borderRadius: 4 }}
                  />
                ) : (
                  <Button variant="secondary" onClick={() => void loadImageUrl(image.id)}>
                    {t('fleet.gallery')}
                  </Button>
                )}
                {!image.isPrimary ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void api.vehicles.images
                        .setPrimary(agencyId as string, vehicleId as string, image.id)
                        .then((result) => setImages(result.images))
                    }
                  >
                    ★
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  onClick={() =>
                    void api.vehicles.images
                      .remove(agencyId as string, vehicleId as string, image.id)
                      .then(() =>
                        api.vehicles.images
                          .list(agencyId as string, vehicleId as string)
                          .then((result) => setImages(result.images)),
                      )
                  }
                >
                  {t('fleet.deleteImage')}
                </Button>
              </Card>
            ))}
        </div>
      )}

      <h2 style={{ marginTop: 24 }}>{t('fleet.documents')}</h2>
      {documents.length === 0 ? (
        <p>{t('fleet.noDocuments')}</p>
      ) : (
        <table className="kv-table">
          <thead>
            <tr>
              <th>{t('fleet.documentType')}</th>
              <th>{t('fleet.expiresAt')}</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td>{document.title}</td>
                <td>
                  {document.expired ? (
                    <Badge tone="danger">{t('fleet.expired')}</Badge>
                  ) : (
                    (document.expiresAt ?? '—')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ marginTop: 16 }}>
        <Link to="/fleet">{t('fleet.back')}</Link>
      </p>
    </Main>
  );
}
