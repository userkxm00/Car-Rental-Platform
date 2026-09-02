import { act, render, screen } from '@testing-library/react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import i18n, { applyDocumentDirection } from './index';

/**
 * Marketplace i18n / RTL tests: Arabic is first-class — switching to
 * Arabic flips the document direction to RTL; French and English stay LTR.
 */
function SearchTitle(): ReactNode {
  const { t } = useTranslation();
  return <h1>{t('search.title')}</h1>;
}

function renderTitle(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <SearchTitle />
    </I18nextProvider>,
  );
}

async function switchLocale(locale: string): Promise<void> {
  await act(async () => {
    await i18n.changeLanguage(locale);
    applyDocumentDirection(locale);
  });
}

afterEach(async () => {
  await switchLocale('en');
});

describe('marketplace i18n and document direction', () => {
  it('renders English by default with LTR direction', () => {
    applyDocumentDirection('en');
    renderTitle();

    expect(screen.getByRole('heading', { name: 'Find your car' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('renders French and keeps LTR direction', async () => {
    renderTitle();
    await switchLocale('fr');

    expect(screen.getByRole('heading', { name: 'Trouvez votre voiture' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('renders Arabic and flips the document direction to RTL', async () => {
    renderTitle();
    await switchLocale('ar');

    expect(screen.getByRole('heading', { name: 'ابحث عن سيارتك' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('ships complete key sets for every supported locale', () => {
    const locales = ['en', 'fr', 'ar'] as const;
    const reference = Object.keys(i18n.getResourceBundle('en', 'translation') as Record<string, unknown>).sort();
    for (const locale of locales) {
      const keys = Object.keys(i18n.getResourceBundle(locale, 'translation') as Record<string, unknown>).sort();
      expect(keys).toEqual(reference);
    }
    const searchKeys = Object.keys(
      (i18n.getResourceBundle('en', 'translation') as { search: Record<string, unknown> }).search,
    ).sort();
    for (const locale of locales) {
      const keys = Object.keys(
        (i18n.getResourceBundle(locale, 'translation') as { search: Record<string, unknown> }).search,
      ).sort();
      // Arabic adds its language's plural forms (two/few/many) on top of
      // the shared key set — every locale must cover the reference keys.
      expect(keys).toEqual(expect.arrayContaining(searchKeys));
    }
  });
});
