import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgencyProfileDto, PublicBranchDto } from '@kavriqo/api-client';
import i18n from '../i18n';
import { AgencyProfilePage } from './AgencyProfilePage';

/**
 * Agency profile page tests (07-D01..D07): profile composition, badge
 * mapping, NEW rating state, policies and the public branch list — with
 * the api mocked.
 */

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  branches: vi.fn(),
}));

vi.mock('../api', () => ({
  createApi: () => ({ profile: mocks.profile, branches: mocks.branches }),
  ApiError: class ApiError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = 'ApiError';
    }
  },
}));

function profileDto(overrides: Partial<AgencyProfileDto['agency']> = {}): AgencyProfileDto {
  return {
    agency: {
      id: 'a1',
      name: 'Agence Oran',
      slug: 'agence-oran',
      legalName: 'SARL Agence Oran',
      verificationStatus: 'VERIFIED',
      establishedAt: '2025-01-15T00:00:00.000Z',
      defaultCurrency: 'DZD',
      defaultLocale: 'ar',
      ...overrides,
    },
    serviceAreas: ['Oran', 'Algiers'],
    stats: { branchCount: 2, fleetCount: 12 },
    ratingSummary: { state: 'NEW', averageRating: null, reviewCount: 0 },
    depositPolicies: [{ name: 'Standard', depositType: 'FIXED_MINOR', valueMinor: 20000 }],
  };
}

function branchDto(): PublicBranchDto {
  return {
    id: 'b1',
    name: 'Oran Centre',
    code: 'ORN-C',
    timezone: 'Africa/Algiers',
    contacts: { phone: '+213550000001', email: 'center@example.dz' },
    location: {
      id: 'l1',
      name: 'Centre-ville',
      addressLine1: '12 Rue Larbi Ben Mhidi',
      addressLine2: null,
      city: 'Oran',
      region: 'Oran',
      postalCode: '31000',
      countryCode: 'DZ',
      latitude: 35.7041,
      longitude: -0.6401,
    },
    hours: {
      regular: [{ dayOfWeek: 0, opensAt: '08:00', closesAt: '19:00' }],
      exceptions: [{ date: '2026-11-01', opensAt: null, closesAt: null }],
    },
  };
}

function renderPage(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/agence-oran']}>
        <Routes>
          <Route path="/:slug" element={<AgencyProfilePage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('AgencyProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders identity, badges, stats, areas and policies', async () => {
    mocks.profile.mockResolvedValue(profileDto());
    mocks.branches.mockResolvedValue({ items: [branchDto()], total: 1 });
    renderPage();

    expect(await screen.findByText('Agence Oran')).toBeTruthy();
    expect(screen.getByText('Verified agency')).toBeTruthy();
    expect(screen.getByText('New agency — no ratings yet')).toBeTruthy();
    expect(screen.getByText('Oran · Algiers')).toBeTruthy();
    expect(screen.getByText('200 DZD fixed deposit')).toBeTruthy();
    expect(screen.getAllByTestId('profile-branch')).toHaveLength(1);
    expect(screen.getByText(/\+213550000001/)).toBeTruthy();
    expect(screen.getByText('08:00–19:00')).toBeTruthy();
  });

  it('shows the unverified badge for non-verified agencies (07-D02)', async () => {
    mocks.profile.mockResolvedValue(profileDto({ verificationStatus: 'UNVERIFIED' }));
    mocks.branches.mockResolvedValue({ items: [], total: 0 });
    renderPage();

    expect(await screen.findByText('Not yet verified')).toBeTruthy();
  });

  it('shows the not-found state for hidden agencies', async () => {
    mocks.profile.mockRejectedValue(Object.assign(new Error('gone'), { code: 'AGENCY_NOT_FOUND' }));
    mocks.branches.mockRejectedValue(Object.assign(new Error('gone'), { code: 'AGENCY_NOT_FOUND' }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('This agency is not available on the marketplace.')).toBeTruthy();
    });
  });
});
