import { act, render, screen } from '@testing-library/react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import i18n, { applyDocumentDirection } from './index';

/**
 * i18n / RTL tests (03-D08): Arabic is first-class — switching the locale to
 * Arabic must flip the document direction to RTL; French and English stay LTR.
 */
function FleetTitle(): ReactNode {
  const { t } = useTranslation();
  return <h1>{t('fleet.listTitle')}</h1>;
}

function renderTitle(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <FleetTitle />
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

describe('i18n and document direction', () => {
  it('renders English by default with LTR direction', () => {
    applyDocumentDirection('en');
    renderTitle();

    expect(screen.getByRole('heading', { name: 'Fleet' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('renders French and keeps LTR direction', async () => {
    renderTitle();
    await switchLocale('fr');

    expect(screen.getByRole('heading', { name: 'Flotte' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('renders Arabic and flips the document direction to RTL', async () => {
    renderTitle();
    await switchLocale('ar');

    expect(screen.getByRole('heading', { name: 'الأسطول' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });
});
