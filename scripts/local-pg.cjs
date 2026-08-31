#!/usr/bin/env node
/**
 * Local PostgreSQL runner for offline sandboxes (see TESTING.md).
 *
 * Uses `@embedded-postgres/linux-x64` (real PostgreSQL binaries bundled in
 * npm) so the API's e2e suites can run against a genuine server without
 * Docker/apt access. Data lives in `apps/api/.pgdata` (git-ignored).
 *
 * Usage:
 *   node scripts/local-pg.cjs start   # init cluster if needed, start server
 *   node scripts/local-pg.cjs stop    # stop server (keeps data)
 *   node scripts/local-pg.cjs drop    # stop + delete data directory
 *   node scripts/local-pg.cjs status  # prints whether the server is listening
 *
 * Default connection string (matches prisma.config.ts / TEST_DATABASE_URL):
 *   postgresql://postgres:postgres@127.0.0.1:5432/car_rental
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawnSync } = require('node:child_process');

const PORT = 5432;
const HOST = '127.0.0.1';
const USER = 'postgres';
const PASSWORD = 'postgres';
const DB = 'car_rental';
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'apps/api/.pgdata');

function portInUse() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/**
 * Stop a cluster that may have been started by a previous process.
 * `EmbeddedPostgres#stop()` only kills its own child, so shell out to the
 * bundled `pg_ctl` binary (exported by @embedded-postgres/linux-x64) instead.
 */
function stopCluster() {
  const platform = require('@embedded-postgres/linux-x64');
  const result = spawnSync(platform.pg_ctl, ['-D', DATA_DIR, 'stop', '-m', 'fast'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  return result.status === 0 || /does not exist|no server running/i.test(result.stderr ?? '');
}

async function main() {
  const command = process.argv[2] ?? 'status';

  if (command === 'status') {
    console.log(portInUse() ? `postgres: listening on ${HOST}:${PORT}` : 'postgres: not running');
    return;
  }

  // embedded-postgres is ESM-only; load it dynamically.
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C.UTF-8'],
  });

  if (command === 'stop') {
    if (!fs.existsSync(DATA_DIR)) {
      console.log('postgres: no data directory — nothing to stop');
      return;
    }
    if (!(await portInUse())) {
      console.log('postgres: not running');
      return;
    }
    console.log(stopCluster() ? 'postgres: stopped' : 'postgres: stop failed (see stderr)');
    return;
  }

  if (command === 'drop') {
    if (fs.existsSync(DATA_DIR)) {
      if (await portInUse()) stopCluster();
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    }
    console.log('postgres: data directory removed');
    return;
  }

  if (command !== 'start') {
    console.error(`unknown command: ${command}`);
    process.exit(2);
  }

  if (await portInUse()) {
    console.log(`postgres: already listening on ${HOST}:${PORT}`);
    return;
  }

  const firstRun = !fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
  if (firstRun) {
    await pg.initialise();
  }

  // Daemonize via pg_ctl so the postmaster survives this script's exit
  // (EmbeddedPostgres#start keeps the server as a child of this process and
  // it is reaped when the runner's process group ends).
  const platform = require('@embedded-postgres/linux-x64');
  const result = spawnSync(
    platform.pg_ctl,
    ['-D', DATA_DIR, '-l', path.join(DATA_DIR, 'server.log'), '-o', `-p ${PORT}`, '-w', 'start'],
    { encoding: 'utf8', timeout: 60_000 },
  );
  if (result.status !== 0) {
    throw new Error(`pg_ctl start failed: ${result.stderr ?? 'unknown error'}`);
  }

  const { Client } = require('pg');
  const client = new Client({
    connectionString: `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/postgres`,
  });
  await client.connect();
  const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB]);
  if (rows.length === 0) {
    await client.query(`CREATE DATABASE "${DB}"`);
  }
  await client.end();

  console.log(
    firstRun
      ? `postgres: cluster initialised at ${DATA_DIR} and listening on ${HOST}:${PORT} (db: ${DB})`
      : `postgres: listening on ${HOST}:${PORT} (db: ${DB})`,
  );
}

main()
  .then(() => {
    // The postgres child process keeps the event loop alive; exit explicitly.
    process.exit(0);
  })
  .catch((error) => {
    console.error('local-pg:', error.message);
    process.exit(1);
  });
