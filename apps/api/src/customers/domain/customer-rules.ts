import type { CustomerDocumentStatus, CustomerDocumentType } from '@prisma/client';
import { SUPPORTED_LOCALES } from '../../identity/domain/identity-errors';
import {
  CustomerErrorCode,
  DOCUMENT_TYPES,
  DocumentRequirement,
  DocumentRequirements,
} from './customer-contract';

/**
 * Pure customer profile/document rules (07-A).
 *
 * Everything here is deterministic and clock-injected (`now`) so boundary
 * validation and the document-requirements computation are unit-testable
 * without a database. The service layer stays thin: parse → act.
 */

export const NAME_MAX = 80;
export const PHONE_MAX = 20;
export const EMAIL_MAX = 254;
export const LICENSE_NUMBER_MAX = 64;
export const DOCUMENT_NUMBER_MAX = 64;
export const REJECTION_REASON_MAX = 500;

/** Marketplace signal caps (07-A06/07-A07). */
export const RECENTLY_VIEWED_CAP = 20;
export const SEARCH_HISTORY_CAP = 50;

/** R1 baseline: a driving rental requires a valid driver license. */
export const REQUIRED_DOCUMENT_TYPES: readonly CustomerDocumentType[] = ['DRIVER_LICENSE'];

const NAME_SHAPE = /^[\p{L}\p{M}' .-]+$/u;
const PHONE_SHAPE = /^[0-9+()\- ]+$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_COUNTRY_SHAPE = /^[A-Z]{2}$/;
const ISO_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOMER_STATUS_LIST = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;

export interface ParsedCustomerPatch {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  email?: string | null;
  preferredLocale?: string;
  dateOfBirth?: Date | null;
  licenseNumber?: string | null;
  licenseCountry?: string | null;
  licenseIssueDate?: Date | null;
  licenseExpiryDate?: Date | null;
  status?: string;
}

export interface ParsedDocumentPatch {
  type?: CustomerDocumentType;
  number?: string | null;
  issueDate?: Date | null;
  expiryDate?: Date | null;
}

export interface ParseResult<T> {
  value: T;
  failures: Array<{ field: string; code: string; message: string }>;
}

const failure = (field: string, code: string, message: string) => ({ field, code, message });

export function parseISODate(value: unknown): Date | undefined | null {
  if (value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !ISO_DATE_SHAPE.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : undefined;
}

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function validateName(
  value: unknown,
  field: 'firstName' | 'lastName',
  failures: ParseResult<ParsedCustomerPatch>['failures'],
  out: ParsedCustomerPatch,
): void {
  if (typeof value !== 'string') {
    failures.push(failure(field, CustomerErrorCode.CUSTOMER_NAME_INVALID, `${field} is required.`));
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > NAME_MAX || !NAME_SHAPE.test(trimmed)) {
    failures.push(
      failure(
        field,
        CustomerErrorCode.CUSTOMER_NAME_INVALID,
        `${field} must be 1–${NAME_MAX} characters.`,
      ),
    );
    return;
  }
  out[field] = trimmed;
}

function validatePhone(
  value: unknown,
  failures: ParseResult<ParsedCustomerPatch>['failures'],
  out: ParsedCustomerPatch,
): void {
  if (value === null || value === '') {
    out.phone = null;
    return;
  }
  if (typeof value !== 'string') {
    failures.push(
      failure('phone', CustomerErrorCode.CUSTOMER_PHONE_INVALID, 'phone must be a string.'),
    );
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length < 5 || trimmed.length > PHONE_MAX || !PHONE_SHAPE.test(trimmed)) {
    failures.push(
      failure('phone', CustomerErrorCode.CUSTOMER_PHONE_INVALID, 'phone has an invalid format.'),
    );
    return;
  }
  out.phone = trimmed;
}

function validateEmail(
  value: unknown,
  failures: ParseResult<ParsedCustomerPatch>['failures'],
  out: ParsedCustomerPatch,
): void {
  if (value === null || value === '') {
    out.email = null;
    return;
  }
  if (typeof value !== 'string') {
    failures.push(
      failure('email', CustomerErrorCode.CUSTOMER_EMAIL_INVALID, 'email must be a string.'),
    );
    return;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length > EMAIL_MAX || !EMAIL_SHAPE.test(trimmed)) {
    failures.push(
      failure('email', CustomerErrorCode.CUSTOMER_EMAIL_INVALID, 'email has an invalid format.'),
    );
    return;
  }
  out.email = trimmed;
}

function validateLocale(
  value: unknown,
  failures: ParseResult<ParsedCustomerPatch>['failures'],
  out: ParsedCustomerPatch,
): void {
  if (typeof value !== 'string' || !(SUPPORTED_LOCALES as readonly string[]).includes(value)) {
    failures.push(
      failure(
        'preferredLocale',
        CustomerErrorCode.CUSTOMER_LOCALE_INVALID,
        `preferredLocale must be one of: ${SUPPORTED_LOCALES.join(', ')}.`,
      ),
    );
    return;
  }
  out.preferredLocale = value;
}

function validateDateField(
  value: unknown,
  field: string,
  code: string,
  failures: ParseResult<ParsedCustomerPatch>['failures'],
  now: Date,
  allowFuture: boolean,
): Date | null | undefined {
  const parsed = parseISODate(value);
  if (parsed === undefined) {
    failures.push(failure(field, code, `${field} must be a valid YYYY-MM-DD date.`));
    return undefined;
  }
  if (parsed !== null && !allowFuture && parsed.getTime() > dateOnly(now).getTime()) {
    failures.push(failure(field, code, `${field} must not be in the future.`));
    return undefined;
  }
  return parsed;
}

/**
 * Validates the subset of a customer patch actually present on `input`
 * (PATCH semantics: absent keys are left untouched). The two required name
 * fields are enforced separately for CREATE via {@link validateName}.
 */
export function parseCustomerPatch(input: Record<string, unknown>, now: Date): ParseResult<ParsedCustomerPatch> {
  const failures: ParseResult<ParsedCustomerPatch>['failures'] = [];
  const out: ParsedCustomerPatch = {};

  for (const field of ['firstName', 'lastName'] as const) {
    if (field in input) {
      validateName(input[field], field, failures, out);
    }
  }
  if ('phone' in input) {
    validatePhone(input.phone, failures, out);
  }
  if ('email' in input) {
    validateEmail(input.email, failures, out);
  }
  if ('preferredLocale' in input) {
    validateLocale(input.preferredLocale, failures, out);
  }
  if ('dateOfBirth' in input) {
    const parsed = validateDateField(
      input.dateOfBirth,
      'dateOfBirth',
      CustomerErrorCode.CUSTOMER_BIRTHDATE_INVALID,
      failures,
      now,
      false,
    );
    if (parsed !== undefined) {
      out.dateOfBirth = parsed;
    }
  }
  if ('licenseNumber' in input) {
    const value = input.licenseNumber;
    if (value === null || value === '') {
      out.licenseNumber = null;
    } else if (typeof value !== 'string') {
      failures.push(
        failure(
          'licenseNumber',
          CustomerErrorCode.CUSTOMER_LICENSE_INVALID,
          'licenseNumber must be a string.',
        ),
      );
    } else {
      const trimmed = value.trim();
      if (trimmed.length < 1 || trimmed.length > LICENSE_NUMBER_MAX) {
        failures.push(
          failure(
            'licenseNumber',
            CustomerErrorCode.CUSTOMER_LICENSE_INVALID,
            `licenseNumber must be 1–${LICENSE_NUMBER_MAX} characters.`,
          ),
        );
      } else {
        out.licenseNumber = trimmed;
      }
    }
  }
  if ('licenseCountry' in input) {
    const value = input.licenseCountry;
    if (value === null || value === '') {
      out.licenseCountry = null;
    } else if (typeof value !== 'string' || !ISO_COUNTRY_SHAPE.test(value.trim().toUpperCase())) {
      failures.push(
        failure(
          'licenseCountry',
          CustomerErrorCode.CUSTOMER_LICENSE_INVALID,
          'licenseCountry must be an ISO 3166-1 alpha-2 code.',
        ),
      );
    } else {
      out.licenseCountry = value.trim().toUpperCase();
    }
  }
  for (const field of ['licenseIssueDate', 'licenseExpiryDate'] as const) {
    if (field in input) {
      const parsed = validateDateField(
        input[field],
        field,
        CustomerErrorCode.CUSTOMER_LICENSE_INVALID,
        failures,
        now,
        true,
      );
      if (parsed !== undefined) {
        out[field] = parsed;
      }
    }
  }
  if ('status' in input) {
    const value = input.status;
    if (typeof value !== 'string' || !(CUSTOMER_STATUS_LIST as readonly string[]).includes(value)) {
      failures.push(
        failure(
          'status',
          CustomerErrorCode.CUSTOMER_STATUS_INVALID,
          `status must be one of: ${CUSTOMER_STATUS_LIST.join(', ')}.`,
        ),
      );
    } else {
      out.status = value;
    }
  }
  return { value: out, failures };
}

/** Cross-field license-date sanity: issue ≤ expiry when both are set. */
export function licenseDatesAreOrdered(
  current: { licenseIssueDate: Date | null; licenseExpiryDate: Date | null },
  next: { licenseIssueDate?: Date | null; licenseExpiryDate?: Date | null },
): boolean {
  const issue = next.licenseIssueDate !== undefined ? next.licenseIssueDate : current.licenseIssueDate;
  const expiry =
    next.licenseExpiryDate !== undefined ? next.licenseExpiryDate : current.licenseExpiryDate;
  if (issue === undefined || expiry === undefined || issue === null || expiry === null) {
    return true;
  }
  return issue.getTime() <= expiry.getTime();
}

export function parseDocumentPatch(input: Record<string, unknown>, now: Date): ParseResult<ParsedDocumentPatch> {
  const failures: ParseResult<ParsedDocumentPatch>['failures'] = [];
  const out: ParsedDocumentPatch = {};

  if ('type' in input) {
    const value = input.type;
    if (typeof value !== 'string' || !DOCUMENT_TYPES.includes(value as CustomerDocumentType)) {
      failures.push(
        failure(
          'type',
          CustomerErrorCode.DOCUMENT_TYPE_INVALID,
          `type must be one of: ${DOCUMENT_TYPES.join(', ')}.`,
        ),
      );
    } else {
      out.type = value as CustomerDocumentType;
    }
  }
  if ('number' in input) {
    const value = input.number;
    if (value === null || value === '') {
      out.number = null;
    } else if (typeof value !== 'string') {
      failures.push(
        failure('number', CustomerErrorCode.DOCUMENT_NUMBER_INVALID, 'number must be a string.'),
      );
    } else {
      const trimmed = value.trim();
      if (trimmed.length < 1 || trimmed.length > DOCUMENT_NUMBER_MAX) {
        failures.push(
          failure(
            'number',
            CustomerErrorCode.DOCUMENT_NUMBER_INVALID,
            `number must be 1–${DOCUMENT_NUMBER_MAX} characters.`,
          ),
        );
      } else {
        out.number = trimmed;
      }
    }
  }
  for (const field of ['issueDate', 'expiryDate'] as const) {
    if (field in input) {
      const parsed = validateDateField(
        input[field],
        field,
        CustomerErrorCode.DOCUMENT_DATES_INVALID,
        failures,
        now,
        field === 'expiryDate',
      );
      if (parsed !== undefined) {
        out[field] = parsed;
      }
    }
  }
  if (out.issueDate !== undefined && out.expiryDate !== undefined) {
    const issue = out.issueDate ?? null;
    const expiry = out.expiryDate ?? null;
    if (issue !== null && expiry !== null && issue.getTime() > expiry.getTime()) {
      failures.push(
        failure(
          'issueDate',
          CustomerErrorCode.DOCUMENT_DATES_INVALID,
          'issueDate must not be after expiryDate.',
        ),
      );
    }
  }
  return { value: out, failures };
}

/** Verification state machine (07-A04): PENDING is the hub state. */
export function allowedDocumentTransitions(from: CustomerDocumentStatus): readonly CustomerDocumentStatus[] {
  switch (from) {
    case 'PENDING':
      return ['VERIFIED', 'REJECTED'];
    case 'VERIFIED':
      return ['PENDING'];
    case 'REJECTED':
      return ['PENDING'];
  }
}

export function isExpiredDocument(expiryDate: Date | null, now: Date): boolean {
  if (!expiryDate) {
    return false;
  }
  return dateOnly(expiryDate).getTime() < dateOnly(now).getTime();
}

/**
 * 07-A04 baseline computation: a driving rental requires a valid driver
 * license. `satisfied` is true when every required type has a VERIFIED,
 * unexpired document on record.
 */
export function computeDocumentRequirements(
  documents: Array<{ type: CustomerDocumentType; status: CustomerDocumentStatus; expiryDate: Date | null }>,
  now: Date,
): DocumentRequirements {
  const unmet: DocumentRequirement[] = [];
  for (const required of REQUIRED_DOCUMENT_TYPES) {
    const present = documents.find((doc) => doc.type === required);
    if (!present) {
      unmet.push({ type: required, reason: 'MISSING' });
    } else if (present.status === 'PENDING') {
      unmet.push({ type: required, reason: 'PENDING' });
    } else if (present.status === 'REJECTED') {
      unmet.push({ type: required, reason: 'REJECTED' });
    } else if (isExpiredDocument(present.expiryDate, now)) {
      unmet.push({ type: required, reason: 'EXPIRED' });
    }
  }
  return {
    requiredTypes: [...REQUIRED_DOCUMENT_TYPES],
    satisfied: unmet.length === 0,
    unmet,
  };
}
