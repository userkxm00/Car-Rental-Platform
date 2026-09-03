/**
 * PHASE-08 / 08-B domain: versioned contract templates.
 *
 * - 08-B01/08-B02: a template is a logical identity with append-only
 *   version rows per locale (ar/fr/en) — versions are never updated so
 *   historical signed contracts stay reproducible (docs/06 documents,
 *   architecture/database-domain-model.md).
 * - 08-B03/B04/B05: built-in contract content in Arabic, French and
 *   English. Agencies start from these defaults and release their own
 *   reviewed versions through the API.
 * - 08-B06: substitution over a closed variable whitelist — a template
 *   may reference ONLY the variables below; unknown placeholders fail
 *   loudly at save time and at render time.
 * - 08-B07: deterministic version selection by locale and effective
 *   date with a documented fallback chain.
 */

export const TEMPLATE_LOCALES = ['ar', 'fr', 'en'] as const;
export type TemplateLocale = (typeof TEMPLATE_LOCALES)[number];

export function isTemplateLocale(value: unknown): value is TemplateLocale {
  return typeof value === 'string' && (TEMPLATE_LOCALES as readonly string[]).includes(value);
}

export const TEMPLATE_KIND = 'RENTAL_CONTRACT' as const;
export type TemplateKind = typeof TEMPLATE_KIND;

/** 08-B01: stable tenant-unique template code (uppercase, letters/digits/-/_). */
export const TEMPLATE_CODE_PATTERN = /^[A-Z][A-Z0-9_-]{1,39}$/;

export const TEMPLATE_BODY_MAX_LENGTH = 250_000;
export const TEMPLATE_TITLE_MAX_LENGTH = 200;

/**
 * 08-B06: the closed variable whitelist. Keys ending in `_DATE`/`_TIME`
 * are formatted per locale; `RENTAL_AMOUNT`/`DEPOSIT_AMOUNT` are integer
 * minor units formatted with the currency; `RENTAL_DAYS`/`VEHICLE_YEAR`
 * are integers; everything else is plain text substitution.
 */
export const TEMPLATE_VARIABLES = [
  'AGENCY_NAME',
  'AGENCY_PHONE',
  'BOOKING_NUMBER',
  'CONTRACT_NUMBER',
  'CONTRACT_DATE',
  'CUSTOMER_FIRST_NAME',
  'CUSTOMER_LAST_NAME',
  'CUSTOMER_LICENSE_NUMBER',
  'CUSTOMER_LICENSE_COUNTRY',
  'VEHICLE_MAKE',
  'VEHICLE_MODEL',
  'VEHICLE_YEAR',
  'VEHICLE_PLATE',
  'PICKUP_BRANCH_NAME',
  'RETURN_BRANCH_NAME',
  'PICKUP_DATE',
  'PICKUP_TIME',
  'RETURN_DATE',
  'RETURN_TIME',
  'RENTAL_DAYS',
  'CURRENCY',
  'RENTAL_AMOUNT',
  'DEPOSIT_AMOUNT',
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateValues = Partial<Record<TemplateVariableKey, string | number | Date | null>>;

const VARIABLE_SET: ReadonlySet<string> = new Set(TEMPLATE_VARIABLES);

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/** All placeholder keys referenced by a template body, deduplicated. */
export function extractTemplateVariables(body: string): string[] {
  const keys = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_PATTERN)) {
    keys.add(match[1]);
  }
  return [...keys].sort();
}

/** 08-B06 validation: every referenced placeholder must be whitelisted. */
export function unknownTemplateVariables(body: string): string[] {
  return extractTemplateVariables(body).filter((key) => !VARIABLE_SET.has(key));
}

export interface TemplateSubstitutionResult {
  rendered: string;
  /** Whitelisted variables the body references but the values omitted. */
  missing: string[];
}

const DATE_KEYS: readonly string[] = ['CONTRACT_DATE', 'PICKUP_DATE', 'RETURN_DATE'];
const TIME_KEYS: readonly string[] = ['PICKUP_TIME', 'RETURN_TIME'];
const MONEY_KEYS: readonly string[] = ['RENTAL_AMOUNT', 'DEPOSIT_AMOUNT'];
const NUMBER_KEYS: readonly string[] = ['RENTAL_DAYS', 'VEHICLE_YEAR'];

function formatDate(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(value);
}

function formatTime(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(value);
}

function formatMoney(minor: number, currency: string, locale: string): string {
  const amount = minor / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(amount);
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { useGrouping: false }).format(value);
}

/** 08-B06: render a template with the supplied values for the locale. */
export function substituteTemplate(
  body: string,
  values: TemplateValues,
  locale: string,
): TemplateSubstitutionResult {
  const missing: string[] = [];
  const rendered = body.replace(PLACEHOLDER_PATTERN, (placeholder, key: string) => {
    if (!VARIABLE_SET.has(key)) {
      // Unknown placeholders are rejected before rendering; keep the
      // marker so the caller can report it rather than render garbage.
      return placeholder;
    }
    const value = values[key as TemplateVariableKey];
    if (value === undefined || value === null || value === '') {
      missing.push(key);
      return placeholder;
    }
    if (DATE_KEYS.includes(key)) {
      return formatDate(value instanceof Date ? value : new Date(value), locale);
    }
    if (TIME_KEYS.includes(key)) {
      return formatTime(value instanceof Date ? value : new Date(value), locale);
    }
    if (MONEY_KEYS.includes(key)) {
      const currency = typeof values.CURRENCY === 'string' ? values.CURRENCY : 'DZD';
      return formatMoney(Number(value), currency, locale);
    }
    if (NUMBER_KEYS.includes(key)) {
      return formatNumber(Number(value), locale);
    }
    return String(value);
  });
  return { rendered, missing: [...new Set(missing)] };
}

/** 08-B02: minimal version shape for the selection rules. */
export interface TemplateVersionLike {
  version: number;
  locale: string;
  title: string;
  body: string;
  effectiveFrom: Date;
}

/**
 * 08-B07: version selection. For the requested locale, the highest
 * version whose `effectiveFrom` is on or before `asOf` wins. When the
 * requested locale has no such version, the fallback chain is Arabic,
 * French, English (Arabic first-class per docs/40).
 */
export const TEMPLATE_LOCALE_FALLBACK: readonly TemplateLocale[] = ['ar', 'fr', 'en'];

export function templateLocaleFallbackChain(locale: string): string[] {
  return [...new Set([locale, ...TEMPLATE_LOCALE_FALLBACK])];
}

export interface SelectedTemplateVersion<T extends TemplateVersionLike = TemplateVersionLike> {
  locale: string;
  fallback: boolean;
  version: T;
}

export function selectTemplateVersion<T extends TemplateVersionLike>(
  versions: readonly T[],
  locale: string,
  asOf: Date,
): SelectedTemplateVersion<T> | null {
  for (const candidateLocale of templateLocaleFallbackChain(locale)) {
    const candidates = versions
      .filter((v) => v.locale === candidateLocale && v.effectiveFrom.getTime() <= asOf.getTime())
      .sort((a, b) => b.version - a.version);
    if (candidates.length > 0) {
      return { locale: candidateLocale, fallback: candidateLocale !== locale, version: candidates[0] };
    }
  }
  return null;
}

/** Preview samples (08-B06) used to fill omitted values in previews only. */
export function sampleTemplateValues(): Required<TemplateValues> {
  const pickup = new Date(Date.now() + 3 * 24 * 3600_000);
  const returns = new Date(pickup.getTime() + 3 * 24 * 3600_000);
  return {
    AGENCY_NAME: 'Sample Agency',
    AGENCY_PHONE: '+213 00 00 00 00',
    BOOKING_NUMBER: 'BK-2026-000001',
    CONTRACT_NUMBER: 'CT-2026-000001',
    CONTRACT_DATE: new Date(),
    CUSTOMER_FIRST_NAME: 'Sample',
    CUSTOMER_LAST_NAME: 'Customer',
    CUSTOMER_LICENSE_NUMBER: '0123456789',
    CUSTOMER_LICENSE_COUNTRY: 'DZ',
    VEHICLE_MAKE: 'Dacia',
    VEHICLE_MODEL: 'Logan',
    VEHICLE_YEAR: 2024,
    VEHICLE_PLATE: '12345-16-41',
    PICKUP_BRANCH_NAME: 'Main Branch',
    RETURN_BRANCH_NAME: 'Main Branch',
    PICKUP_DATE: pickup,
    PICKUP_TIME: pickup,
    RETURN_DATE: returns,
    RETURN_TIME: returns,
    RENTAL_DAYS: 3,
    CURRENCY: 'DZD',
    RENTAL_AMOUNT: 450000,
    DEPOSIT_AMOUNT: 2000000,
  };
}

/**
 * 08-B03/B04/B05: built-in contract content in Arabic, French and
 * English. These are platform starting points — agencies must review
 * and release their own versions for commercial use (docs/48). Every
 * placeholder below is whitelisted; the unit tests assert that.
 */
export const DEFAULT_TEMPLATE_CONTENT: Record<TemplateLocale, { title: string; body: string }> = {
  ar: {
    title: 'عقد إيجار مركبة',
    body: `عقد إيجار مركبة رقم {{CONTRACT_NUMBER}}
صادر بتاريخ {{CONTRACT_DATE}}

الطرف الأول (المؤجّر): {{AGENCY_NAME}}
الهاتف: {{AGENCY_PHONE}}

الطرف الثاني (المستأجر): {{CUSTOMER_FIRST_NAME}} {{CUSTOMER_LAST_NAME}}
رقم رخصة القيادة: {{CUSTOMER_LICENSE_NUMBER}} — بلد الإصدار: {{CUSTOMER_LICENSE_COUNTRY}}

المركبة المؤجّرة: {{VEHICLE_MAKE}} {{VEHICLE_MODEL}}، سنة {{VEHICLE_YEAR}}، رقم اللوحة {{VEHICLE_PLATE}}

مدة الإيجار: {{RENTAL_DAYS}} يومًا
الاستلام: {{PICKUP_DATE}} على الساعة {{PICKUP_TIME}} من فرع {{PICKUP_BRANCH_NAME}}
الإرجاع: {{RETURN_DATE}} على الساعة {{RETURN_TIME}} إلى فرع {{RETURN_BRANCH_NAME}}

المبلغ الإجمالي للإيجار: {{RENTAL_AMOUNT}}
مبلغ الضمان (الكفالة): {{DEPOSIT_AMOUNT}}
العملة: {{CURRENCY}}

الشروط العامة:
1. يلتزم المستأجر بإعادة المركبة في الموعد والمكان المحددين وبالحالة التي استلمها عليها.
2. تُحمَّل أي أضرار ناتجة عن سوء الاستعمال على المستأجر وفق محضر المعاينة.
3. يُعاد مبلغ الضمان بعد الإرجاع والفحص النهائي للمركبة.
4. يخضع هذا العقد للقوانين والأنظمة المعمول بها في الجمهورية الجزائرية.

توقيع المؤجّر: ____________________
توقيع المستأجر: ____________________

رقم الحجز المرجعي: {{BOOKING_NUMBER}}`,
  },
  fr: {
    title: 'Contrat de location de véhicule',
    body: `Contrat de location de véhicule n° {{CONTRACT_NUMBER}}
Émis le {{CONTRACT_DATE}}

Première partie (le loueur) : {{AGENCY_NAME}}
Téléphone : {{AGENCY_PHONE}}

Deuxième partie (le locataire) : {{CUSTOMER_FIRST_NAME}} {{CUSTOMER_LAST_NAME}}
N° de permis de conduire : {{CUSTOMER_LICENSE_NUMBER}} — pays d'émission : {{CUSTOMER_LICENSE_COUNTRY}}

Véhicule loué : {{VEHICLE_MAKE}} {{VEHICLE_MODEL}}, année {{VEHICLE_YEAR}}, immatriculation {{VEHICLE_PLATE}}

Durée de location : {{RENTAL_DAYS}} jour(s)
Prise en charge : le {{PICKUP_DATE}} à {{PICKUP_TIME}} à l'agence {{PICKUP_BRANCH_NAME}}
Restitution : le {{RETURN_DATE}} à {{RETURN_TIME}} à l'agence {{RETURN_BRANCH_NAME}}

Montant total de la location : {{RENTAL_AMOUNT}}
Montant de la caution : {{DEPOSIT_AMOUNT}}
Devise : {{CURRENCY}}

Conditions générales :
1. Le locataire s'engage à restituer le véhicule aux date et lieu convenus, dans l'état de prise en charge.
2. Les dommages résultant d'un usage anormal sont à la charge du locataire selon le procès-verbal d'inspection.
3. La caution est restituée après le retour et l'inspection finale du véhicule.
4. Le présent contrat est régi par les lois et règlements en vigueur en République algérienne.

Signature du loueur : ____________________
Signature du locataire : ____________________

Référence de réservation : {{BOOKING_NUMBER}}`,
  },
  en: {
    title: 'Vehicle rental agreement',
    body: `Vehicle rental agreement no. {{CONTRACT_NUMBER}}
Issued on {{CONTRACT_DATE}}

First party (the lessor): {{AGENCY_NAME}}
Phone: {{AGENCY_PHONE}}

Second party (the lessee): {{CUSTOMER_FIRST_NAME}} {{CUSTOMER_LAST_NAME}}
Driving license no.: {{CUSTOMER_LICENSE_NUMBER}} — issuing country: {{CUSTOMER_LICENSE_COUNTRY}}

Rented vehicle: {{VEHICLE_MAKE}} {{VEHICLE_MODEL}}, year {{VEHICLE_YEAR}}, plate {{VEHICLE_PLATE}}

Rental period: {{RENTAL_DAYS}} day(s)
Pick-up: {{PICKUP_DATE}} at {{PICKUP_TIME}} from {{PICKUP_BRANCH_NAME}}
Return: {{RETURN_DATE}} at {{RETURN_TIME}} to {{RETURN_BRANCH_NAME}}

Total rental amount: {{RENTAL_AMOUNT}}
Security deposit: {{DEPOSIT_AMOUNT}}
Currency: {{CURRENCY}}

General terms:
1. The lessee shall return the vehicle at the agreed time and place, in the condition received.
2. Damage caused by abnormal use is charged to the lessee according to the inspection report.
3. The deposit is refunded after the return and final inspection of the vehicle.
4. This agreement is governed by the laws and regulations in force in the People's Democratic Republic of Algeria.

Lessor signature: ____________________
Lessee signature: ____________________

Booking reference: {{BOOKING_NUMBER}}`,
  },
};
