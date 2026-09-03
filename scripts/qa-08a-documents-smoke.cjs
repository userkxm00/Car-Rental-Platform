#!/usr/bin/env node
/**
 * PHASE-08 / 08-A live HTTP smoke against the preview API (port 4000).
 *
 * Exercises the new documents surface end-to-end over real HTTP with real
 * JWKS-signed tokens and the real PostgreSQL schema:
 *
 *  - GET  /api/agencies/:agencyId/document-policy            (default policy)
 *  - PUT  /api/agencies/:agencyId/document-policy            (validate + upsert)
 *  - GET  /api/agencies/:agencyId/bookings/:bookingId/documents (walk-in checklist)
 *  - POST /api/agencies/:agencyId/bookings/:bookingId/ready  (walk-in exemption)
 *  - GET  checklist for a foreign-license customer           (passport rule)
 *  - POST ready blocked by BOOKING_DOCUMENTS_INCOMPLETE      (08-A04 gate)
 *  - POST ready succeeds after documents verified            (08-A04 gate)
 *  - unauthenticated 401 and cross-tenant 403                (isolation)
 *
 * Usage: node scripts/qa-08a-documents-smoke.cjs
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
  const agencySubject = subjectOf(agencyToken);
  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  // ---- fixture: user auto-provisions via /api/v1/me, tenant + membership seeded
  await http('GET', '/me', { token: agencyToken });
  const user = await pg.query(
    `SELECT u.id FROM users u JOIN user_identities i ON i."userId" = u.id WHERE i."providerSubject" = $1`,
    [agencySubject],
  );
  assert(user.rowCount === 1, `dev user provisioned (subject ${agencySubject})`);

  const stamp = Date.now();
  const tenantA = (await pg.query(
    `INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
    [`Smoke A ${stamp}`, `smk-a-${stamp}`],
  )).rows[0].id;
  const tenantB = (await pg.query(
    `INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
    [`Smoke B ${stamp}`, `smk-b-${stamp}`],
  )).rows[0].id;
  for (const tenantId of [tenantA, tenantB]) {
    const membership = (
      await pg.query(
        `INSERT INTO memberships (id, "tenantId", "userId", status, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', now()) RETURNING id`,
        [tenantId, user.rows[0].id],
      )
    ).rows[0].id;
    await pg.query(`INSERT INTO membership_roles (id, "membershipId", role) VALUES (gen_random_uuid(), $1, $2)`, [
      membership,
      'AGENCY_OWNER_ADMIN',
    ]);
  }

  const location = (
    await pg.query(
      `INSERT INTO locations (id, name, city, "countryCode", latitude, longitude, "updatedAt") VALUES (gen_random_uuid(), 'Smoke Oran', 'Oran', 'DZ', 35.7, -0.63, now()) RETURNING id`,
    )
  ).rows[0].id;
  const branch = (
    await pg.query(
      `INSERT INTO branches (id, "tenantId", name, code, "locationId", "updatedAt") VALUES (gen_random_uuid(), $1, 'Smoke Branch', $2, $3, now()) RETURNING id`,
      [tenantA, `S${stamp % 100000}`, location],
    )
  ).rows[0].id;
  const category = (
    await pg.query(
      `INSERT INTO vehicle_categories (id, "tenantId", code, name, "updatedAt") VALUES (gen_random_uuid(), $1, 'SMK-ECO', 'Smoke Eco', now()) RETURNING id`,
      [tenantA],
    )
  ).rows[0].id;
  const vehicle = (
    await pg.query(
      `INSERT INTO vehicles (id, "tenantId", "categoryId", "currentBranchId", make, model, year, "plateNumber", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, 'Dacia', 'Logan', 2024, $4, now()) RETURNING id`,
      [tenantA, category, branch, `SMK${stamp % 1000000}`],
    )
  ).rows[0].id;

  const startsAt = new Date(Date.now() + 2 * 24 * 3600_000);
  const endsAt = new Date(startsAt.getTime() + 3 * 3600_000);
  const mkBooking = (customerId, status) =>
    pg.query(
      `INSERT INTO bookings (id, "tenantId", "bookingNumber", channel, "inventoryMode", status, "customerId", "assignedVehicleId", "startsAt", "endsAt", currency, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'STAFF', 'VEHICLE', $3, $4, $5, $6, $7, 'DZD', now()) RETURNING id`,
      [tenantA, `SMK-${Date.now()}${Math.floor(Math.random() * 1000)}`, status, customerId, vehicle, startsAt, endsAt],
    );

  // ---- 08-A02: default policy
  const def = await http('GET', `/agencies/${tenantA}/document-policy`, { token: agencyToken });
  assert(def.status === 200, 'GET document-policy 200');
  assert(JSON.stringify(def.body) === JSON.stringify({ requiredTypes: [], requirePassportForForeignLicense: false, configured: false }), `default policy payload ${JSON.stringify(def.body)}`);

  // ---- 08-A02: policy upsert (dedupe + validation)
  const put = await http('PUT', `/agencies/${tenantA}/document-policy`, {
    token: agencyToken,
    body: { requiredTypes: ['NATIONAL_ID', 'PASSPORT', 'NATIONAL_ID'], requirePassportForForeignLicense: true },
  });
  assert(put.status === 200, 'PUT document-policy 200');
  assert(JSON.stringify(put.body.requiredTypes) === JSON.stringify(['NATIONAL_ID', 'PASSPORT']), `policy deduped ${JSON.stringify(put.body)}`);
  assert(put.body.configured === true, 'policy configured:true');

  const invalid = await http('PUT', `/agencies/${tenantA}/document-policy`, {
    token: agencyToken,
    body: { requiredTypes: ['FAKE_TYPE'] },
  });
  assert(invalid.status === 409 && invalid.body?.error?.code === 'INVALID_DOCUMENT_TYPES', `unknown type 409 INVALID_DOCUMENT_TYPES (${invalid.status})`);

  // ---- 08-A04: walk-in checklist (customerLinked false, all NOT_SUBMITTED)
  const walkin = (await mkBooking(null, 'DRAFT')).rows[0].id;
  const walkChecklist = await http('GET', `/agencies/${tenantA}/bookings/${walkin}/documents`, { token: agencyToken });
  assert(walkChecklist.status === 200, 'walk-in checklist 200');
  assert(walkChecklist.body.customerLinked === false, 'walk-in customerLinked:false');
  assert(
    JSON.stringify(walkChecklist.body.required) === JSON.stringify(['DRIVER_LICENSE', 'NATIONAL_ID', 'PASSPORT']),
    `walk-in requires license + policy types (${JSON.stringify(walkChecklist.body.required)})`,
  );
  assert(walkChecklist.body.complete === false, 'walk-in incomplete');

  // ---- 08-A04: walk-in ready exemption
  await pg.query(`UPDATE bookings SET status = 'CONFIRMED' WHERE id = $1`, [walkin]);
  const walkReady = await http('POST', `/agencies/${tenantA}/bookings/${walkin}/ready`, { token: agencyToken });
  assert(walkReady.status === 201 && walkReady.body.status === 'READY_FOR_PICKUP', `walk-in ready 201 READY_FOR_PICKUP (${walkReady.status})`);

  // ---- 08-A03: foreign-license customer → passport additionally required
  const customer = (
    await pg.query(
      `INSERT INTO customers (id, "tenantId", "firstName", "lastName", "licenseCountry", "updatedAt") VALUES (gen_random_uuid(), $1, 'Smoke', 'Foreign', 'FR', now()) RETURNING id`,
      [tenantA],
    )
  ).rows[0].id;
  const frBooking = (await mkBooking(customer, 'CONFIRMED')).rows[0].id;
  const frChecklist = await http('GET', `/agencies/${tenantA}/bookings/${frBooking}/documents`, { token: agencyToken });
  assert(JSON.stringify(frChecklist.body.required) === JSON.stringify(['DRIVER_LICENSE', 'NATIONAL_ID', 'PASSPORT']), `foreign required = policy + passport rule (${JSON.stringify(frChecklist.body.required)})`);
  assert(frChecklist.body.complete === false, 'foreign customer incomplete before documents');

  // ---- 08-A04 gate: blocked before documents are VERIFIED
  const blocked = await http('POST', `/agencies/${tenantA}/bookings/${frBooking}/ready`, { token: agencyToken });
  assert(blocked.status === 409 && blocked.body?.error?.code === 'BOOKING_DOCUMENTS_INCOMPLETE', `gate 409 BOOKING_DOCUMENTS_INCOMPLETE (${blocked.status})`);
  assert(JSON.stringify(blocked.body.error.details?.missing) === JSON.stringify(['DRIVER_LICENSE', 'NATIONAL_ID', 'PASSPORT']), `missing types listed (${JSON.stringify(blocked.body.error.details?.missing)})`);

  // ---- 08-A04 gate: passes once every required document is VERIFIED
  for (const type of ['DRIVER_LICENSE', 'NATIONAL_ID', 'PASSPORT']) {
    await pg.query(
      `INSERT INTO customer_documents (id, "customerId", type, number, "issueDate", "expiryDate", status)
       VALUES (gen_random_uuid(), $1, $2, $3, '2024-01-01', '2030-01-01', 'VERIFIED')`,
      [customer, type, `NUM-${type}-${stamp}`],
    );
  }
  const ready = await http('POST', `/agencies/${tenantA}/bookings/${frBooking}/ready`, { token: agencyToken });
  assert(ready.status === 201 && ready.body.status === 'READY_FOR_PICKUP', `ready 201 READY_FOR_PICKUP after documents (${ready.status})`);

  // ---- isolation: unauthenticated 401 + cross-tenant 403
  const unauth = await http('GET', `/agencies/${tenantA}/document-policy`);
  assert(unauth.status === 401, `unauthenticated policy read 401 (${unauth.status})`);

  // A second user (customer token) belongs to tenant B only: reading A's
  // policy must be denied by the scope guard (server-side scope, not URL).
  const customerToken = tokenOf('apps/customer-web/.dev-token');
  const customerSubject = subjectOf(customerToken);
  await http('GET', '/me', { token: customerToken });
  const userB = await pg.query(
    `SELECT u.id FROM users u JOIN user_identities i ON i."userId" = u.id WHERE i."providerSubject" = $1`,
    [customerSubject],
  );
  const membershipB = (
    await pg.query(
      `INSERT INTO memberships (id, "tenantId", "userId", status, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', now()) RETURNING id`,
      [tenantB, userB.rows[0].id],
    )
  ).rows[0].id;
  await pg.query(`INSERT INTO membership_roles (id, "membershipId", role) VALUES (gen_random_uuid(), $1, $2)`, [
    membershipB,
    'AGENCY_OWNER_ADMIN',
  ]);
  const ownRead = await http('GET', `/agencies/${tenantB}/document-policy`, { token: customerToken });
  assert(ownRead.status === 200, 'B policy readable by B owner (second user)');
  const crossTenantRead = await http('GET', `/agencies/${tenantA}/document-policy`, { token: customerToken });
  assert(crossTenantRead.status === 403, `cross-tenant policy read 403 (${crossTenantRead.status})`);

  // ---- cleanup
  await pg.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantA, tenantB]);
  await pg.end();
  console.log('\n08-A live smoke: ALL CHECKS PASSED');
}

main().catch((error) => {
  console.error('smoke failed:', error);
  process.exit(1);
});
