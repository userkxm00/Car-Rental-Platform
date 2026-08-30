import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, Button, Select } from '@kavriqo/ui';
import { applyDocumentDirection } from './i18n';
import { SUPPORTED_LOCALES } from './i18n/resources';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AgencyProvider } from './agency/AgencyContext';
import { RequireAuth } from './auth/RequireAuth';
import { SignInPage } from './auth/SignInPage';
import { FleetListPage } from './fleet/FleetListPage';
import { VehicleFormPage } from './fleet/VehicleFormPage';
import { VehicleDetailPage } from './fleet/VehicleDetailPage';

function Topbar(): ReactNode {
  const { t, i18n } = useTranslation();
  const { token, signOut } = useAuth();

  useEffect(() => {
    applyDocumentDirection(i18n.resolvedLanguage ?? i18n.language);
  }, [i18n.resolvedLanguage, i18n.language]);

  return (
    <header className="kv-topbar">
      <Link className="kv-wordmark" to="/fleet">
        {t('app.name')} <span style={{ fontWeight: 500 }}>{t('app.descriptor')}</span>
      </Link>
      <div className="kv-topbar__actions">
        <Select
          aria-label="Language"
          value={i18n.resolvedLanguage ?? 'en'}
          onChange={(event) => {
            void i18n.changeLanguage(event.target.value);
          }}
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {locale === 'ar' ? 'العربية' : locale === 'fr' ? 'Français' : 'English'}
            </option>
          ))}
        </Select>
        {token ? (
          <Button variant="secondary" onClick={signOut}>
            {t('nav.signOut')}
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function AppRoutes(): ReactNode {
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route
        path="/fleet"
        element={
          <RequireAuth>
            <FleetListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/fleet/new"
        element={
          <RequireAuth>
            <VehicleFormPage />
          </RequireAuth>
        }
      />
      <Route
        path="/fleet/:vehicleId"
        element={
          <RequireAuth>
            <VehicleDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/fleet/:vehicleId/edit"
        element={
          <RequireAuth>
            <VehicleFormPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/fleet" replace />} />
    </Routes>
  );
}

export function App(): ReactNode {
  return (
    <AuthProvider>
      <AgencyProvider>
        <AppShell>
          <Topbar />
          <AppRoutes />
        </AppShell>
      </AgencyProvider>
    </AuthProvider>
  );
}
