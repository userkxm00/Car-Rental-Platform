import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, Select } from '@kavriqo/ui';
import { applyDocumentDirection } from './i18n';
import { SUPPORTED_LOCALES } from './i18n/resources';
import { SearchPage } from './search/SearchPage';

function Topbar(): ReactNode {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    applyDocumentDirection(i18n.resolvedLanguage ?? i18n.language);
  }, [i18n.resolvedLanguage, i18n.language]);

  return (
    <header className="kv-topbar">
      <Link className="kv-wordmark" to="/">
        {t('app.name')} <span style={{ fontWeight: 500 }}>{t('app.descriptor')}</span>
      </Link>
      <div className="kv-topbar__actions">
        <Select
          aria-label={t('nav.language')}
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
      </div>
    </header>
  );
}

function AppRoutes(): ReactNode {
  return (
    <Routes>
      <Route path="/" element={<SearchPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App(): ReactNode {
  return (
    <AppShell>
      <Topbar />
      <AppRoutes />
    </AppShell>
  );
}
