import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, SUPPORTED_LOCALES, RTL_LOCALES } from './resources';

/**
 * KAVRIQO marketplace i18n: Arabic, French, English. Arabic is
 * first-class — the document direction flips to RTL automatically.
 */
void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LOCALES],
  interpolation: { escapeValue: false },
});

export function applyDocumentDirection(locale: string): void {
  document.documentElement.dir = RTL_LOCALES.includes(locale as never) ? 'rtl' : 'ltr';
  document.documentElement.lang = locale;
}

export default i18n;
