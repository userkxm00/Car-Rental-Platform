#!/usr/bin/env node
/**
 * 04-D live smoke (dev only): seeds an agency with a vehicle carrying a
 * block + hold, then hits the real timeline endpoint and prints the JSON.
 * Run with the dev stack up (dev-jwks + API on 4000). Never production.
 */
'use strict';

const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

async function main() {
  const pool = new Pool({ connectionString: DB });
  const token = fs.readFileSync(path.resolve(__dirname, '..', 'apps/agency-web/.dev-token'), 'utf8').trim();

  const me = await fetch(`${API}/api/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!me.ok) throw new Error(`/me failed: ${me.status}`);
  const user = await me.json();

  const tenantId = await pool.query(`INSERT INTO tenants (id, name, slug, "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'QA 04-D', 'qa-04d-${Date.now()}', now(), now()) RETURNING id`).then((r) => r.rows[0].id);
  const categoryId = await pool.query(`INSERT INTO vehicle_categories (id, "tenantId", code, name, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, 'BASE', 'Base', now(), now()) RETURNING id`, [tenantId]).then((r) => r.rows[0].id);
  const vehicleId = await pool.query(
    `INSERT INTO vehicles (id, "tenantId", "categoryId", make, model, year, "plateNumber", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'Dacia', 'Logan', 2024, 'QA-04D-001', now(), now()) RETURNING id`,
    [tenantId, categoryId],
  ).then((r) => r.rows[0].id);
  const membershipId = await pool.query(
    `INSERT INTO memberships (id, "tenantId", "userId", status, "invitedAt", "joinedAt", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', now(), now(), now(), now()) RETURNING id`,
    [tenantId, user.id],
  ).then((r) => r.rows[0].id);
  await pool.query(`INSERT INTO membership_roles (id, "membershipId", role) VALUES (gen_random_uuid(), $1, 'AGENCY_OWNER_ADMIN')`, [membershipId]);

  const start = new Date(Date.now() + 36e5);
  const end = new Date(Date.now() + 12 * 36e5);
  await pool.query(
    `INSERT INTO vehicle_blocks (id, "tenantId", "vehicleId", "blockType", "startsAt", "endsAt", reason, "createdAt") VALUES (gen_random_uuid(), $1, $2, 'MAINTENANCE', $3, $4, 'QA service', now())`,
    [tenantId, vehicleId, start, new Date(start.getTime() + 4 * 36e5)],
  );
  await pool.query(
    `INSERT INTO booking_holds (id, "tenantId", "vehicleId", "startsAt", "endsAt", "expiresAt", channel, "createdAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $4, 'MARKETPLACE', now())`,
    [tenantId, vehicleId, new Date(start.getTime() + 3 * 36e5), new Date(end.getTime() - 36e5)],
  );

  const qs = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  });
  const res = await fetch(`${API}/api/v1/agencies/${tenantId}/availability/timeline?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  console.log(`timeline HTTP ${res.status}`);
  console.log(JSON.stringify(body, null, 2));

  const badQs = new URLSearchParams({ start: end.toISOString(), end: start.toISOString() });
  const bad = await fetch(`${API}/api/v1/agencies/${tenantId}/availability/timeline?${badQs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const badBody = await bad.json();
  console.log(`invalid interval HTTP ${bad.status}:`, JSON.stringify(badBody));

  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
