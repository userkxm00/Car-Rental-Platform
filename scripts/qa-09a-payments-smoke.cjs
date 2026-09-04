#!/usr/bin/env node
/**
 * PHASE-09 / 09-A live HTTP smoke against the preview API (port 4000).
 *
 * Exercises the rental-payment surface end-to-end over real HTTP with
 * JWKS-signed tokens and the real PostgreSQL schema:
 *
 *  - lazy payment intent from the price snapshot (09-A01)
 *  - manual records with bank-transfer evidence (09-A02/09-A03)
 *  - pay-at-agency state + partial payments + balance (09-A04/09-A05)
 *  - the manual confirmation workflow (09-A08)
 *  - the deposit hold lifecycle (09-A06)
 *  - me-portal read + tenant isolation + permission boundary
 *
 * Usage: node scripts/qa-09a-payments-smoke.cjs
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
  };

  const ownerA = await userIdOf(agencySubject, agencyToken);
  const customerUser = await userIdOf(customerSubject, customerToken);
  const stamp = Date.now();
  const tenantA = (
    await pg.query(`INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`, [
      `Pay Smoke A ${stamp}`,
      `pay-smk-a-${stamp}`,
    ])
  ).rows[0].id;
  const tenantB = (
    await pg.query(`INSERT INTO tenants (id, name, slug, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`, [
      `Pay Smoke B ${stamp}`,
      `pay-smk-b-${stamp}`,
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
  const bookingNumber = `PAY-${stamp}`;
  const bookingId = (
    await pg.query(
      `INSERT INTO bookings (id, "tenantId", "bookingNumber", channel, "inventoryMode", status, "customerId", "startsAt", "endsAt", currency, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'STAFF', 'VEHICLE', 'CONFIRMED', $3, now() + interval '1 day', now() + interval '1 day 6 hours', 'DZD', now()) RETURNING id`,
      [tenantA, bookingNumber, customerId],
    )
  ).rows[0].id;
  await pg.query(
    `INSERT INTO booking_price_snapshots (id, "bookingId", "pricingJson") VALUES (gen_random_uuid(), $1, $2::jsonb)`,
    [
      bookingId,
      JSON.stringify({ currency: 'DZD', totalMinor: 45000, depositMinor: 10000, calculatedAt: new Date().toISOString() }),
    ],
  );

  const base = `/agencies/${tenantA}/bookings/${bookingId}/payments`;

  // ---- 09-A01: lazy intent from the immutable snapshot
  const opened = await http('GET', base, { token: agencyToken });
  assert(opened.status === 200 && opened.body.status === 'OPEN', `intent opens lazily (${opened.status})`);
  assert(
    opened.body.totalMinor === 45000 && opened.body.depositMinor === 10000 && opened.body.outstandingMinor === 45000,
    'snapshot totals + outstanding copied server-side',
  );
  assert(opened.body.depositHold?.status === 'HELD' && opened.body.depositHold?.amountMinor === 10000, 'deposit hold created at intent');

  // ---- 09-A02/09-A03: evidence and validation
  const noRef = await http('POST', `${base}/records`, { token: agencyToken, body: { method: 'BANK_TRANSFER', amountMinor: 25000 } });
  assert(noRef.status === 409 && noRef.body?.error?.code === 'PAYMENT_RECORD_INPUT_INVALID', `bank transfer without reference refused (${noRef.status})`);

  const cash = await http('POST', `${base}/records`, { token: agencyToken, body: { method: 'CASH', amountMinor: 20000, note: 'counter' } });
  assert(cash.status === 201 && cash.body.status === 'PENDING_CONFIRMATION', `cash record pending (${cash.status})`);
  const cashId = cash.body.id;

  // ---- 09-A04: pending money does not settle
  const stillOpen = await http('GET', base, { token: agencyToken });
  assert(stillOpen.body.status === 'OPEN' && stillOpen.body.paidMinor === 0, 'pending records do not settle');

  // ---- 09-A08: manual confirmation → partial state (09-A05)
  await http('POST', `${base}/records/${cashId}/confirm`, { token: agencyToken });
  const partial = await http('GET', base, { token: agencyToken });
  assert(partial.body.status === 'PARTIALLY_SETTLED' && partial.body.paidMinor === 20000 && partial.body.outstandingMinor === 25000, `partial settlement projected (${partial.body.paidMinor})`);

  const bank = await http('POST', `${base}/records`, { token: agencyToken, body: { method: 'BANK_TRANSFER', amountMinor: 25000, reference: 'VIR-2026-0001' } });
  assert(bank.status === 201 && bank.body.reference === 'VIR-2026-0001', `bank transfer recorded with evidence (${bank.status})`);
  await http('POST', `${base}/records/${bank.body.id}/confirm`, { token: agencyToken });
  const settled = await http('GET', base, { token: agencyToken });
  assert(settled.body.status === 'SETTLED' && settled.body.paidMinor === 45000 && settled.body.outstandingMinor === 0, 'settled balance derives from confirmed records');

  const over = await http('POST', `${base}/records`, { token: agencyToken, body: { method: 'CASH', amountMinor: 1 } });
  assert(over.status === 409 && over.body?.error?.code === 'PAYMENT_EXCEEDS_OUTSTANDING', `over-outstanding record refused (${over.status})`);
  const dupConfirm = await http('POST', `${base}/records/${cashId}/confirm`, { token: agencyToken });
  assert(dupConfirm.status === 409 && dupConfirm.body?.error?.code === 'PAYMENT_RECORD_STATE', `duplicate confirm refused (${dupConfirm.status})`);

  // ---- 09-A06: deposit lifecycle
  const tooEarly = await http('POST', `/agencies/${tenantA}/bookings/${bookingId}/deposit/release`, { token: agencyToken, body: {} });
  assert(tooEarly.status === 409 && tooEarly.body?.error?.code === 'PAYMENT_DEPOSIT_NOT_RELEASABLE', `deposit not releasable before return (${tooEarly.status})`);
  await pg.query(`UPDATE bookings SET status = 'RETURNED', "updatedAt" = now() WHERE id = $1`, [bookingId]);
  const released = await http('POST', `/agencies/${tenantA}/bookings/${bookingId}/deposit/release`, { token: agencyToken, body: { note: 'good condition' } });
  assert(released.status === 201 && released.body.status === 'RELEASED', `deposit released at return (${released.status})`);
  const dupRelease = await http('POST', `/agencies/${tenantA}/bookings/${bookingId}/deposit/release`, { token: agencyToken, body: {} });
  assert(dupRelease.status === 409 && dupRelease.body?.error?.code === 'PAYMENT_DEPOSIT_STATE', `duplicate release refused (${dupRelease.status})`);

  // ---- me-portal: the booking customer reads their own payment state
  const me = await http('GET', `/me/bookings/${bookingId}/payments`, { token: customerToken });
  assert(me.status === 200 && me.body.status === 'SETTLED' && me.body.depositHold?.status === 'RELEASED', `me-portal payment state (${me.status})`);

  // ---- permission boundary + isolation
  await grantRole(tenantA, customerUser, 'STAFF_AGENT');
  const staffRead = await http('GET', base, { token: customerToken });
  assert(staffRead.status === 200, `STAFF_AGENT can read payments (${staffRead.status})`);
  const staffRecord = await http('POST', `${base}/records`, { token: customerToken, body: { method: 'CASH', amountMinor: 1 } });
  assert(staffRecord.status === 403, `STAFF_AGENT cannot record payments (${staffRecord.status})`);

  const cross = await http('GET', `/agencies/${tenantB}/bookings/${bookingId}/payments`, { token: customerToken });
  assert(cross.status === 404, `cross-tenant payment read 404 (${cross.status})`);
  const unauth = await http('GET', base);
  assert(unauth.status === 401, `unauthenticated 401 (${unauth.status})`);

  await pg.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantA, tenantB]);
  await pg.end();
  console.log('\n09-A live smoke: ALL CHECKS PASSED');
}

main().catch((error) => {
  console.error('smoke failed:', error);
  process.exit(1);
});
