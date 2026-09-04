#!/usr/bin/env node
/**
 * PHASE-08 / 08-C live HTTP smoke against the preview API (port 4000).
 *
 * Exercises the rental-contract surface end-to-end over real HTTP with
 * JWKS-signed tokens and the real PostgreSQL schema:
 *
 *  - POST issue a contract (08-C01/08-C02: rendered snapshot + PDF)
 *  - GET  contract/list surfaces (staff + me-portal)
 *  - POST signature boundary (08-C03: evidence, duplicate rejection)
 *  - POST receipt (08-C05: price-snapshot totals trace)
 *  - GET  generated-document download URL (08-C06)
 *  - cross-tenant isolation and permission boundaries
 *
 * Usage: node scripts/qa-08c-contracts-smoke.cjs
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

  const userIdOf = async (subject, token) => {
    await http('GET', '/me', { token });
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

  const ownerA = await userIdOf(agencySubject, agencyToken);
  const customerUser = await userIdOf(customerSubject, customerToken);
  const stamp = Date.now();
  const tenantA = (
    await pg.query(`INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`, [
      `Contract Smoke A ${stamp}`,
      `ctr-smk-a-${stamp}`,
    ])
  ).rows[0].id;
  const tenantB = (
    await pg.query(`INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`, [
      `Contract Smoke B ${stamp}`,
      `ctr-smk-b-${stamp}`,
    ])
  ).rows[0].id;
  await grantOwner(tenantA, ownerA);
  await grantOwner(tenantB, customerUser);

  // Fixtures: branches, vehicle, customer + verified license, booking + snapshot.
  const locationId = (
    await pg.query(
      `INSERT INTO locations (id, name, city, "countryCode", latitude, longitude, "updatedAt") VALUES (gen_random_uuid(), 'Smoke Oran', 'Oran', 'DZ', 35.7, -0.63, now()) RETURNING id`,
    )
  ).rows[0].id;
  const createBranch = async (name, code) =>
    (
      await pg.query(
        `INSERT INTO branches (id, "tenantId", name, code, "locationId", contacts, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, now()) RETURNING id`,
        [tenantA, name, code, locationId, JSON.stringify({ phone: '+213550000001' })],
      )
    ).rows[0].id;
  const pickupBranchId = await createBranch('Smoke Pickup', `SP${stamp}`);
  const returnBranchId = await createBranch('Smoke Return', `SR${stamp}`);
  const categoryId = (
    await pg.query(
      `INSERT INTO vehicle_categories (id, "tenantId", name, code, "updatedAt") VALUES (gen_random_uuid(), $1, 'Sedan', $2, now()) RETURNING id`,
      [tenantA, `SC${stamp}`],
    )
  ).rows[0].id;
  const vehicleId = (
    await pg.query(
      `INSERT INTO vehicles (id, "tenantId", "categoryId", make, model, year, "plateNumber", "currentBranchId", "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'Mercedes', 'C220', 2024, $3, $4, now()) RETURNING id`,
      [tenantA, categoryId, `PLT-${stamp}`, pickupBranchId],
    )
  ).rows[0].id;
  const customerId = (
    await pg.query(
      `INSERT INTO customers (id, "tenantId", "userId", "firstName", "lastName", "preferredLocale", "licenseNumber", "licenseCountry", "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'Amine', 'Benyoucef', 'ar', '11223344', 'DZ', now()) RETURNING id`,
      [tenantA, customerUser],
    )
  ).rows[0].id;
  await pg.query(
    `INSERT INTO customer_documents (id, "customerId", type, number, status, "verifiedAt") VALUES (gen_random_uuid(), $1, 'DRIVER_LICENSE', '11223344', 'VERIFIED', now())`,
    [customerId],
  );
  const bookingNumber = `CTR-${stamp}`;
  const bookingId = (
    await pg.query(
      `INSERT INTO bookings (id, "tenantId", "bookingNumber", channel, "inventoryMode", status, "customerId", "assignedVehicleId", "pickupBranchId", "returnBranchId", "startsAt", "endsAt", currency, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'STAFF', 'VEHICLE', 'CONFIRMED', $3, $4, $5, $6, now() + interval '1 day', now() + interval '1 day 6 hours', 'DZD', now()) RETURNING id`,
      [tenantA, bookingNumber, customerId, vehicleId, pickupBranchId, returnBranchId],
    )
  ).rows[0].id;
  await pg.query(
    `INSERT INTO booking_price_snapshots (id, "bookingId", "pricingJson") VALUES (gen_random_uuid(), $1, $2::jsonb)`,
    [
      bookingId,
      JSON.stringify({
        currency: 'DZD',
        totalMinor: 45000,
        depositMinor: 10000,
        breakdown: [{ code: 'RENTAL', amountMinor: 45000 }],
        calculatedAt: new Date().toISOString(),
      }),
    ],
  );

  const base = `/agencies/${tenantA}`;

  // ---- 08-C01/08-C02: issuance with the rendered snapshot
  const issued = await http('POST', `${base}/bookings/${bookingId}/contracts`, { token: agencyToken, body: {} });
  assert(issued.status === 201, `issue 201 (${issued.status})`);
  assert(issued.body.contractNumber === `CT-${bookingNumber}`, `contractNumber CT-${bookingNumber} (${issued.body.contractNumber})`);
  assert(issued.body.status === 'ISSUED' && issued.body.locale === 'ar', `issued status/locale (${issued.body.status}/${issued.body.locale})`);
  assert(issued.body.snapshot?.templateCode === 'RENTAL_CONTRACT', `snapshot templateCode (${issued.body.snapshot?.templateCode})`);
  assert(/^[a-f0-9]{64}$/.test(issued.body.snapshot?.contentHash ?? ''), 'snapshot sha256 contentHash');
  assert(!issued.body.snapshot?.contentText?.includes('{{'), 'snapshot content fully substituted');
  assert(issued.body.document?.contentType === 'application/pdf' && issued.body.document.sizeBytes > 100, 'generated PDF document metadata');
  const contractId = issued.body.id;

  // ---- 08-C01: one contract per booking
  const dup = await http('POST', `${base}/bookings/${bookingId}/contracts`, { token: agencyToken, body: {} });
  assert(dup.status === 409 && dup.body?.error?.code === 'CONTRACT_EXISTS', `duplicate issuance 409 CONTRACT_EXISTS (${dup.status})`);

  // ---- reads
  const list = await http('GET', `${base}/bookings/${bookingId}/contracts`, { token: agencyToken });
  assert(list.status === 200 && list.body.items?.length === 1, `booking contract list (${list.status})`);
  const get = await http('GET', `${base}/contracts/${contractId}`, { token: agencyToken });
  assert(get.status === 200 && get.body.id === contractId, `contract read (${get.status})`);

  // ---- 08-C03: signature boundary
  const signed = await http('POST', `${base}/contracts/${contractId}/signature`, {
    token: agencyToken,
    body: { method: 'ON_SITE', signerRole: 'AGENCY_REPRESENTATIVE', signerName: 'Brahim' },
  });
  assert(signed.status === 201 && signed.body.status === 'SIGNED', `signature 201 SIGNED (${signed.status})`);
  assert(signed.body.signature?.signerName === 'Brahim' && signed.body.signature?.contentHash === signed.body.snapshot?.contentHash, 'signature attests the snapshot hash');
  const dupSig = await http('POST', `${base}/contracts/${contractId}/signature`, {
    token: agencyToken,
    body: { method: 'ON_SITE', signerRole: 'AGENCY_REPRESENTATIVE', signerName: 'Brahim' },
  });
  assert(dupSig.status === 409 && dupSig.body?.error?.code === 'SIGNATURE_EXISTS', `duplicate signature 409 (${dupSig.status})`);

  // ---- 08-C05: receipt with the price snapshot totals
  const receipt = await http('POST', `${base}/bookings/${bookingId}/receipts`, { token: agencyToken });
  assert(receipt.status === 201, `receipt 201 (${receipt.status})`);
  assert(receipt.body.receiptNumber === `RT-${bookingNumber}`, `receiptNumber RT-${bookingNumber} (${receipt.body.receiptNumber})`);
  assert(
    receipt.body.totals?.totalMinor === 45000 && receipt.body.totals?.depositMinor === 10000 && receipt.body.totals?.currency === 'DZD',
    'receipt totals trace the price snapshot',
  );
  const receiptId = receipt.body.id;

  // ---- 08-C06: signed download URLs
  const download = await http('GET', `${base}/documents/${receipt.body.document.id}/url`, { token: agencyToken });
  assert(download.status === 200 && typeof download.body.url === 'string' && download.body.url.startsWith('http'), `staff download URL (${download.status})`);
  const expires = new Date(download.body.expiresAt).getTime();
  assert(expires > Date.now(), 'download URL expires in the future');

  // ---- me-portal: the booking customer reads + downloads their own documents
  const meContracts = await http('GET', `/me/bookings/${bookingId}/contracts`, { token: customerToken });
  assert(meContracts.status === 200 && meContracts.body.items?.length === 1, `me contracts (${meContracts.status})`);
  assert(meContracts.body.items[0].signature?.signerName === 'Brahim', 'me contract carries the signature evidence');
  const meReceipts = await http('GET', `/me/bookings/${bookingId}/receipts`, { token: customerToken });
  assert(meReceipts.status === 200 && meReceipts.body.items?.length === 1, `me receipts (${meReceipts.status})`);
  const meDownload = await http('GET', `/me/documents/${receipt.body.document.id}/url`, { token: customerToken });
  assert(meDownload.status === 200 && meDownload.body.url.startsWith('http'), `me download URL (${meDownload.status})`);
  const meContract = await http('GET', `/me/contracts/${contractId}`, { token: customerToken });
  assert(meContract.status === 200, `me contract detail (${meContract.status})`);

  // ---- isolation
  const unauth = await http('GET', `${base}/contracts/${contractId}`);
  assert(unauth.status === 401, `unauthenticated 401 (${unauth.status})`);
  const cross = await http('GET', `/agencies/${tenantB}/contracts/${contractId}`, { token: agencyToken });
  assert(cross.status === 403, `cross-tenant contract 403 (${cross.status})`);
  const meForeign = await http('GET', `/me/contracts/${contractId}`, { token: agencyToken });
  assert(meForeign.status === 404, `foreign user me-contract 404 (${meForeign.status})`);

  await pg.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantA, tenantB]);
  await pg.end();
  console.log('\n08-C live smoke: ALL CHECKS PASSED');
}

main().catch((error) => {
  console.error('smoke failed:', error);
  process.exit(1);
});
