import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VehicleDto } from '@kavriqo/api-client';
import { AuthProvider } from '../auth/AuthContext';
import i18n from '../i18n';
import { FleetListPage } from './FleetListPage';

/**
 * FleetListPage UI tests (03-D08): list rendering, translated status badges,
 * and the empty state — all against the real i18n instance.
 */
const { listVehicles } = vi.hoisted(() => ({ listVehicles: vi.fn() }));

vi.mock('../api', () => ({
  createApi: () => ({ vehicles: { list: listVehicles } }),
  VEHICLE_STATUSES: ['AVAILABLE', 'RESERVED', 'RENTED', 'MAINTENANCE', 'INSPECTION', 'ARCHIVED'],
  statusTone: (status: string): 'success' | 'warning' | 'danger' | 'info' =>
    status === 'AVAILABLE' ? 'success' : status === 'MAINTENANCE' ? 'warning' : status === 'ARCHIVED' ? 'danger' : 'info',
}));

vi.mock('../agency/AgencyContext', () => ({
  useAgency: () => ({ agencyId: 'ag_1', loading: false }),
}));

const AVAILABLE: VehicleDto = {
  id: 'v_1',
  agencyId: 'ag_1',
  categoryId: 'cat_1',
  currentBranchId: null,
  make: 'Toyota',
  model: 'Corolla',
  year: 2023,
  plateNumber: '12345-17',
  vin: null,
  color: null,
  status: 'AVAILABLE',
  acquisitionDate: null,
  acquisitionCost: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const RENTED: VehicleDto = {
  ...AVAILABLE,
  id: 'v_2',
  make: 'Hyundai',
  model: 'Accent',
  plateNumber: '98765-16',
  status: 'RENTED',
};

function renderPage(): void {
  render(
    <AuthProvider>
      <MemoryRouter>
        <I18nextProvider i18n={i18n}>
          <FleetListPage />
        </I18nextProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('FleetListPage', () => {
  beforeEach(() => {
    listVehicles.mockReset();
  });

  it('renders the fleet title and vehicle rows with translated status badges', async () => {
    listVehicles.mockResolvedValue({ vehicles: [AVAILABLE, RENTED] });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Fleet' })).toBeInTheDocument();
    expect(await screen.findByText('Toyota')).toBeInTheDocument();
    expect(screen.getByText('Corolla')).toBeInTheDocument();
    expect(screen.getByText('12345-17')).toBeInTheDocument();
    expect(screen.getByText('Hyundai')).toBeInTheDocument();

    // i18n status labels (en), scoped to the table badges (the same words
    // also appear in the status filter options).
    expect(screen.getByText('Available', { selector: '.kv-badge--success' })).toBeInTheDocument();
    expect(screen.getByText('Rented', { selector: '.kv-badge--info' })).toBeInTheDocument();
    expect(listVehicles).toHaveBeenCalledWith('ag_1', expect.objectContaining({ status: undefined, search: '' }));
  });

  it('shows the translated empty state when the agency has no matching vehicles', async () => {
    listVehicles.mockResolvedValue({ vehicles: [] });

    renderPage();

    expect(await screen.findByText('No vehicles match the current filters.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the search and status filter controls with accessible labels', async () => {
    listVehicles.mockResolvedValue({ vehicles: [] });

    renderPage();

    expect(await screen.findByText('No vehicles match the current filters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Search make, model, plate or VIN')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add vehicle' })).toHaveAttribute('href', '/fleet/new');
  });
});
