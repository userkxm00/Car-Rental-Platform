#!/usr/bin/env node
/**
 * PHASE-09 / 09-B live HTTP smoke against the preview API (port 4000).
 *
 * Exercises the financial-ledger + invoice surface end-to-end over real
 * HTTP with JWKS-signed tokens and the real PostgreSQL schema
 * (`car_rental_preview` at migration #27):
 *
 *  - the ledger is read-only over HTTP and starts empty
 *  - the 09-A payments pipeline appends DEPOSIT_HELD / PAYMENT_CONFIRMED
 *  - invoice issuance composes items from the immutable price snapshot
 *  - correction is void-and-reissue (history never deleted)
 *  - explicit void + wrong-state refusals
 *  - BILLING_READ vs BILLING_MANAGE permission boundary (docs/37)
 *  - tenant isolation (403 scope guard / 404 tenant-scoped lookup)
 *  - me-portal own-booking mirrors
 *
 * Usage: node scripts/qa-09b-billing-smoke.cjs
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

let checks = 0;
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  checks += 1;
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
  const grantRole = async (tenantId, userId, role) => {
    const membership = (
      await pg.query(
        `INSERT INTO memberships (id, "tenantId", "userId", status, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', now()) RETURNING id`,
        [tenantId, userId],
      )
    ).rows[0].id;
    await pg.query(`INSERT INTO membership_roles (id, "membershipId", role) VALUES (gen_random_uuid(), $1, $2)`, [
      membership,
      role,
    ]);
    return membership;
  };

  const ownerA = await userIdOf(agencySubject, agencyToken);
  const customerUser = await userIdOf(customerSubject, customerToken);
  const stamp = Date.now();
  const tenantA = (
    await pg.query(`INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`, [
      `Bil Smoke A ${stamp}`,
      `bil-smk-a-${stamp}`,
    ])
  ).rows[0].id;
  const tenantB = (
    await pg.query(`INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`, [
      `Bil Smoke B ${stamp}`,
      `bil-smk-b-${stamp}`,
    ])
  ).rows[0].id;
  await grantRole(tenantA, ownerA, 'AGENCY_OWNER_ADMIN');
  await grantRole(tenantB, customerUser, 'AGENCY_OWNER_ADMIN');

  const customerId = (
    await pg.query(
      `INSERT INTO customers (id, "tenantId", "userId", "firstName", "lastName", "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'Amine', 'Benyoucef', now()) RETURNING id`,
      [tenantA, customerUser],
    )
  ).rows[0].id;
  const bookingNumber = `BIL-${stamp}`;
  const bookingId = (
    await pg.query(
      `INSERT INTO bookings (id, "tenantId", "bookingNumber", channel, "inventoryMode", status, "customerId", "startsAt", "endsAt", currency, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'STAFF', 'VEHICLE', 'CONFIRMED', $3, now() + interval '1 day', now() + interval '1 day 6 hours', 'DZD', now()) RETURNING id`,
      [tenantA, bookingNumber, customerId],
    )
  ).rows[0].id;
  await pg.query(
    `INSERT INTO booking_price_snapshots (id, "bookingId", "pricingJson") VALUES (gen_random_uuid(), $1, $2::jsonb)`,
    [bookingId, JSON.stringify({ currency: 'DZD', totalMinor: 45000, depositMinor: 10000, calculatedAt: new Date().toISOString() })],
  );

  const ledgerUrl = `/agencies/${tenantA}/bookings/${bookingId}/ledger`;
  const invoicesUrl = `/agencies/${tenantA}/bookings/${bookingId}/invoices`;
  const paymentsUrl = `/agencies/${tenantA}/bookings/${bookingId}/payments`;

  // ---- read-only ledger: HTTP exposes no write path at all
  const ledgerWrite = await http('POST', ledgerUrl, { token: agencyToken, body: {} });
  assert(ledgerWrite.status === 404, `ledger has no HTTP write path (${ledgerWrite.status})`);

  // ---- empty until money events happen
  const emptyLedger = await http('GET', ledgerUrl, { token: agencyToken });
  assert(emptyLedger.status === 200 && Array.isArray(emptyLedger.body) && emptyLedger.body.length === 0, `ledger starts empty (${emptyLedger.status})`);
  const emptyInvoices = await http('GET', invoicesUrl, { token: agencyToken });
  assert(emptyInvoices.status === 200 && Array.isArray(emptyInvoices.body) && emptyInvoices.body.length === 0, 'invoices start empty');

  // ---- the 09-A pipeline appends DEPOSIT_HELD then PAYMENT_CONFIRMED
  const opened = await http('GET', paymentsUrl, { token: agencyToken });
  assert(opened.status === 200 && opened.body.depositHold?.status === 'HELD', `intent+deposit opened lazily (${opened.status})`);
  let ledger = (await http('GET', ledgerUrl, { token: agencyToken })).body;
  assert(
    ledger.length === 1 && ledger[0].kind === 'DEPOSIT_HELD' && ledger[0].amountMinor === 10000 && ledger[0].currency === 'DZD',
    'ledger: DEPOSIT_HELD appended at intent creation',
  );

  const cash = await http('POST', `${paymentsUrl}/records`, { token: agencyToken, body: { method: 'CASH', amountMinor: 20000, note: 'counter' } });
  assert(cash.status === 201, `cash record created (${cash.status})`);
  await http('POST', `${paymentsUrl}/records/${cash.body.id}/confirm`, { token: agencyToken });
  ledger = (await http('GET', ledgerUrl, { token: agencyToken })).body;
  const confirmed = ledger.filter((row) => row.kind === 'PAYMENT_CONFIRMED');
  assert(confirmed.length === 1 && confirmed[0].amountMinor === 20000 && confirmed[0].sourceType === 'PAYMENT_RECORD', 'ledger: PAYMENT_CONFIRMED carries the record amount');

  // ---- invoice issuance composes from the immutable snapshot
  const inv1 = await http('POST', invoicesUrl, { token: agencyToken });
  assert(inv1.status === 201 && inv1.body.status === 'ISSUED' && inv1.body.invoiceNumber === `INV-${bookingNumber}-001`, `invoice issued with tenant sequence (${inv1.body?.invoiceNumber})`);
  assert(inv1.body.currency === 'DZD' && inv1.body.totalMinor === 45000, 'invoice totals trace the snapshot');
  const kinds1 = (inv1.body.items ?? []).map((item) => `${item.kind}:${item.amountMinor}`).sort();
  assert(JSON.stringify(kinds1) === JSON.stringify(['DEPOSIT:10000', 'RENTAL:35000']), 'invoice items composed server-side (deposit + rental)');

  // ---- correction is void-and-reissue, never deletion
  const inv2 = await http('POST', invoicesUrl, { token: agencyToken });
  assert(inv2.status === 201 && inv2.body.invoiceNumber === `INV-${bookingNumber}-002`, `reissue gets the next sequence (${inv2.body?.invoiceNumber})`);
  const afterReissue = (await http('GET', invoicesUrl, { token: agencyToken })).body;
  const v1 = afterReissue.find((i) => i.invoiceNumber.endsWith('-001'));
  const v2 = afterReissue.find((i) => i.invoiceNumber.endsWith('-002'));
  assert(afterReissue.length === 2 && v1?.status === 'VOIDED' && v2?.status === 'ISSUED', 'superseded invoice VOIDED, history preserved');
  ledger = (await http('GET', ledgerUrl, { token: agencyToken })).body;
  const kindsSeq = ledger.map((row) => row.kind);
  assert(
    kindsSeq.filter((k) => k === 'INVOICE_ISSUED').length === 2 && kindsSeq.filter((k) => k === 'INVOICE_VOIDED').length === 1,
    'ledger: issued→voided→reissued trail',
  );

  // ---- explicit void + wrong-state refusal
  const voided = await http('POST', `${invoicesUrl}/${v2.id}/void`, { token: agencyToken });
  assert(voided.status === 201 && voided.body.status === 'VOIDED' && voided.body.voidedAt, `invoice voided explicitly (${voided.status})`);
  const dupVoid = await http('POST', `${invoicesUrl}/${v2.id}/void`, { token: agencyToken });
  assert(dupVoid.status === 409 && dupVoid.body?.error?.code === 'BILLING_INVOICE_STATE', `double void refused (${dupVoid.status})`);
  ledger = (await http('GET', ledgerUrl, { token: agencyToken })).body;
  assert(ledger.filter((row) => row.kind === 'INVOICE_VOIDED').length === 2, 'ledger: explicit void appended');

  // ---- eligibility: cancelled bookings never get invoices
  const cancelled = (
    await pg.query(
      `INSERT INTO bookings (id, "tenantId", "bookingNumber", channel, "inventoryMode", status, "customerId", "startsAt", "endsAt", currency, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'STAFF', 'VEHICLE', 'CANCELLED', $3, now() + interval '1 day', now() + interval '1 day 6 hours', 'DZD', now()) RETURNING id`,
      [tenantA, `BIL-C-${stamp}`, customerId],
    )
  ).rows[0].id;
  await pg.query(
    `INSERT INTO booking_price_snapshots (id, "bookingId", "pricingJson") VALUES (gen_random_uuid(), $1, $2::jsonb)`,
    [cancelled, JSON.stringify({ currency: 'DZD', totalMinor: 1000, depositMinor: 0, calculatedAt: new Date().toISOString() })],
  );
  const notEligible = await http('POST', `/agencies/${tenantA}/bookings/${cancelled}/invoices`, { token: agencyToken });
  assert(notEligible.status === 409 && notEligible.body?.error?.code === 'BILLING_BOOKING_NOT_ELIGIBLE', `cancelled booking invoice refused (${notEligible.status})`);
  const unknown = await http('GET', `/agencies/${tenantA}/bookings/4b1c2d87-9b4a-4d9b-9a21-8d1f9d5b0001/ledger`, { token: agencyToken });
  assert(unknown.status === 404 && unknown.body?.error?.code === 'BILLING_BOOKING_NOT_FOUND', `unknown booking 404 (${unknown.status})`);

  // ---- permission boundary: STAFF_AGENT reads but never manages
  const staffMembership = await grantRole(tenantA, customerUser, 'STAFF_AGENT');
  const staffRead = await http('GET', ledgerUrl, { token: customerToken });
  assert(staffRead.status === 200 && staffRead.body.length > 0, `STAFF_AGENT reads ledger (${staffRead.status})`);
  const staffIssue = await http('POST', invoicesUrl, { token: customerToken });
  assert(staffIssue.status === 403, `STAFF_AGENT cannot issue invoices (${staffIssue.status})`);

  // ---- FINANCE manages: reissue continues the tenant sequence
  await pg.query(`UPDATE membership_roles SET role = 'FINANCE' WHERE "membershipId" = $1`, [staffMembership]);
  const inv3 = await http('POST', invoicesUrl, { token: customerToken });
  assert(inv3.status === 201 && inv3.body.invoiceNumber === `INV-${bookingNumber}-003`, `FINANCE issues next sequence (${inv3.body?.invoiceNumber})`);

  // ---- me-portal: own-booking mirrors through the customer binding
  const meLedger = await http('GET', `/me/bookings/${bookingId}/ledger`, { token: customerToken });
  assert(meLedger.status === 200 && meLedger.body.length === ledger.length + 1, `me-portal ledger mirrors (${meLedger.status})`);
  const meInvoices = await http('GET', `/me/bookings/${bookingId}/invoices`, { token: customerToken });
  assert(meInvoices.status === 200 && meInvoices.body.length === 3, 'me-portal invoices mirror');
  const meIntruder = await http('GET', `/me/bookings/${bookingId}/ledger`, { token: agencyToken });
  assert(meIntruder.status === 404, `me-portal stranger booking 404 (${meIntruder.status})`);

  // ---- tenant isolation
  const scopeGuard = await http('GET', `/agencies/${tenantB}/bookings/${bookingId}/ledger`, { token: agencyToken });
  assert(scopeGuard.status === 403, `foreign-agency member refused (${scopeGuard.status})`);
  const cross = await http('GET', `/agencies/${tenantB}/bookings/${bookingId}/ledger`, { token: customerToken });
  assert(cross.status === 404 && cross.body?.error?.code === 'BILLING_BOOKING_NOT_FOUND', `cross-tenant booking 404 (${cross.status})`);
  const unauth = await http('GET', ledgerUrl);
  assert(unauth.status === 401, `unauthenticated 401 (${unauth.status})`);

  await pg.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantA, tenantB]);
  await pg.end();
  console.log(`\n09-B live smoke: ALL CHECKS PASSED (${checks})`);
}

main().catch((error) => {
  console.error('smoke failed:', error);
  process.exit(1);
});
