#!/usr/bin/env node
/**
 * PHASE-08 / 08-B live HTTP smoke against the preview API (port 4000).
 *
 * Exercises the contract-template surface end-to-end over real HTTP with
 * JWKS-signed tokens and the real PostgreSQL schema:
 *
 *  - GET  list built-in defaults (configured:false, ar/fr/en)
 *  - POST preview of the built-in Arabic contract (08-B03/08-B06)
 *  - POST create template (code normalization) + TEMPLATE_CODE_EXISTS
 *  - POST create with unknown variable → 409 INVALID_TEMPLATE_VARIABLES
 *  - GET  template with its versions
 *  - POST addVersion (append-only v2)
 *  - POST preview with asOf → 08-B07 selection + ar→fr fallback
 *  - unauthenticated 401 and cross-tenant 403/404 isolation
 *
 * Usage: node scripts/qa-08b-templates-smoke.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const API = 'http://127.0.0.1:4000/api/v1';
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental_preview';
const ROOT = path.resolve(__dirname, '..');

const tokenOf = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').trim();
const subjectOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;

async function http(method, url, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: json ?? text };
}

const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`ok: ${message}`);
};

async function main() {
  const agencyToken = tokenOf('apps/agency-web/.dev-token');
  const customerToken = tokenOf('apps/customer-web/.dev-token');
  const agencySubject = subjectOf(agencyToken);
  const customerSubject = subjectOf(customerToken);

  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  const userIdOf = async (subject) => {
    await http('GET', '/me', { token: subject === agencySubject ? agencyToken : customerToken });
    const rows = await pg.query(
      `SELECT u.id FROM users u JOIN user_identities i ON i."userId" = u.id WHERE i."providerSubject" = $1`,
      [subject],
    );
    return rows.rows[0].id;
  };
  const grantOwner = async (tenantId, userId) => {
    const membership = (
      await pg.query(
        `INSERT INTO memberships (id, "tenantId", "userId", status, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', now()) RETURNING id`,
        [tenantId, userId],
      )
    ).rows[0].id;
    await pg.query(`INSERT INTO membership_roles (id, "membershipId", role) VALUES (gen_random_uuid(), $1, $2)`, [
      membership,
      'AGENCY_OWNER_ADMIN',
    ]);
  };

  const ownerA = await userIdOf(agencySubject);
  const ownerB = await userIdOf(customerSubject);
  const stamp = Date.now();
  const tenantA = (
    await pg.query(`INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`, [
      `Tpl Smoke A ${stamp}`,
      `tpl-smk-a-${stamp}`,
    ])
  ).rows[0].id;
  const tenantB = (
    await pg.query(`INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`, [
      `Tpl Smoke B ${stamp}`,
      `tpl-smk-b-${stamp}`,
    ])
  ).rows[0].id;
  await grantOwner(tenantA, ownerA);
  await grantOwner(tenantB, ownerB);

  const base = `/agencies/${tenantA}/document-templates`;

  // ---- 08-B01: built-in defaults until the agency releases a template
  const list = await http('GET', base, { token: agencyToken });
  assert(list.status === 200, `list 200 (${list.status})`);
  assert(list.body.configured === false, 'list configured:false');
  assert(JSON.stringify(list.body.builtInLocales) === JSON.stringify(['ar', 'fr', 'en']), 'builtInLocales ar/fr/en');

  // ---- 08-B03/08-B06: built-in Arabic preview with sample-filled variables
  const builtIn = await http('POST', `${base}/preview`, { token: agencyToken, body: { locale: 'ar' } });
  assert(builtIn.status === 201 && builtIn.body.version === null, `built-in preview 201 version null (${builtIn.status})`);
  assert(builtIn.body.title === 'عقد إيجار مركبة', `built-in Arabic title (${builtIn.body.title})`);
  assert(builtIn.body.body.includes('Sample Agency') && !builtIn.body.body.includes('{{'), 'built-in body substituted, no placeholders');

  // ---- 08-B01: create with normalization
  const VERSIONS = [
    { locale: 'ar', title: 'عقد إيجار مركبة', body: '{{AGENCY_NAME}} {{BOOKING_NUMBER}}' },
    { locale: 'fr', title: 'Contrat de location', body: '{{AGENCY_NAME}} {{VEHICLE_MAKE}}' },
    { locale: 'en', title: 'Rental agreement', body: '{{AGENCY_NAME}} {{VEHICLE_MODEL}}' },
  ];
  const created = await http('POST', base, { token: agencyToken, body: { code: ' rental_contract ', versions: VERSIONS } });
  assert(created.status === 201, `create 201 (${created.status})`);
  assert(created.body.code === 'RENTAL_CONTRACT', `code normalized (${created.body.code})`);
  assert(created.body.versions.length === 3, 'three locale versions in release 1');
  const templateId = created.body.templateId;

  // ---- 08-B01: code conflict + unknown variables
  const dup = await http('POST', base, { token: agencyToken, body: { code: 'RENTAL_CONTRACT', versions: VERSIONS } });
  assert(dup.status === 409 && dup.body?.error?.code === 'TEMPLATE_CODE_EXISTS', `duplicate code 409 TEMPLATE_CODE_EXISTS (${dup.status})`);
  const unknown = await http('POST', base, {
    token: agencyToken,
    body: { code: 'BROKEN', versions: [{ locale: 'ar', title: 't', body: '{{NOT_WHITELISTED}}' }] },
  });
  assert(unknown.status === 409 && unknown.body?.error?.code === 'INVALID_TEMPLATE_VARIABLES', `unknown variable 409 INVALID_TEMPLATE_VARIABLES (${unknown.status})`);

  // ---- 08-B02: append-only release v2 (French only, effective tomorrow)
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
  const v2 = await http('POST', `${base}/${templateId}/versions`, {
    token: agencyToken,
    body: { effectiveFrom: tomorrow, versions: [{ locale: 'fr', title: 'Contrat v2', body: '{{AGENCY_NAME}} V2-{{BOOKING_NUMBER}}' }] },
  });
  assert(v2.status === 201, `addVersion 201 (${v2.status})`);
  assert(v2.body.versions.length === 4, `four version rows, earlier rows intact (${v2.body.versions.length})`);

  // ---- 08-B06/08-B07: substitution + selection with asOf and ar→fr fallback.
  // A French-only template makes the fallback observable (the 3-locale
  // template above always resolves Arabic directly).
  const selection = await http('POST', base, {
    token: agencyToken,
    body: {
      code: 'SELECTION_TEST',
      effectiveFrom: new Date(Date.now() - 24 * 3600_000).toISOString(),
      versions: [{ locale: 'fr', title: 'Contrat v1', body: '{{AGENCY_NAME}} {{BOOKING_NUMBER}}' }],
    },
  });
  assert(selection.status === 201, `selection template created (${selection.status})`);
  const selectionId = selection.body.templateId;

  const variables = { AGENCY_NAME: 'Warda Rent', BOOKING_NUMBER: 'BK-2026-000042' };
  const now = await http('POST', `${base}/preview`, { token: agencyToken, body: { templateId: selectionId, locale: 'ar', variables } });
  assert(now.status === 201 && now.body.version === 1 && now.body.fallback === true && now.body.locale === 'fr', `today resolves ar→fr v1 (${JSON.stringify({ v: now.body.version, f: now.body.fallback, l: now.body.locale })})`);
  assert(now.body.body === 'Warda Rent BK-2026-000042', `v1 body substituted (${now.body.body})`);

  await http('POST', `${base}/${selectionId}/versions`, {
    token: agencyToken,
    body: { effectiveFrom: tomorrow, versions: [{ locale: 'fr', title: 'Contrat v2', body: '{{AGENCY_NAME}} V2-{{BOOKING_NUMBER}}' }] },
  });

  const future = await http('POST', `${base}/preview`, {
    token: agencyToken,
    body: { templateId: selectionId, locale: 'ar', asOf: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(), variables },
  });
  assert(future.body.version === 2 && future.body.locale === 'fr' && future.body.fallback === true, `future asOf resolves ar→fr v2 (${JSON.stringify({ v: future.body.version, f: future.body.fallback, l: future.body.locale })})`);
  assert(future.body.body === 'Warda Rent V2-BK-2026-000042', `v2 body substituted (${future.body.body})`);

  // ---- isolation
  const unauth = await http('GET', base);
  assert(unauth.status === 401, `unauthenticated list 401 (${unauth.status})`);
  const cross = await http('GET', base, { token: customerToken });
  assert(cross.status === 403, `cross-tenant list 403 (${cross.status})`);
  const crossRead = await http('GET', `/agencies/${tenantB}/document-templates/${templateId}`, { token: customerToken });
  assert(crossRead.status === 404 && crossRead.body?.error?.code === 'TEMPLATE_NOT_FOUND', `A-template through B path 404 (${crossRead.status})`);

  await pg.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantA, tenantB]);
  await pg.end();
  console.log('\n08-B live smoke: ALL CHECKS PASSED');
}

main().catch((error) => {
  console.error('smoke failed:', error);
  process.exit(1);
});
