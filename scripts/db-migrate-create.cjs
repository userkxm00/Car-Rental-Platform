// Create a new Prisma migration from schema drift (01-C tooling).
//
// Usage: node scripts/db-migrate-create.cjs <migration-name>
//
// Diffs prisma/migrations/prev-schema.prisma (the schema state the last
// applied migration produced) against prisma/schema.prisma and writes the
// result as prisma/migrations/<timestamp>_<name>/migration.sql. Apply
// pending migrations with `npm run db:migrate` (prisma migrate deploy).
//
// Environment notes (see TESTING.md):
// - On networked machines this is the canonical flow.
// - In restricted-network sandboxes the CLI's two-datamodel diff needs the
//   query engine binary (unavailable) and the WASM engine's DB-introspection
//   commands are unstable, so the offline fallback is:
//     npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
//   and hand-editing that full-schema script into a migration. Both produce
//   plain SQL migrations applied by the same `migrate deploy` executor.

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'prisma', 'migrations');
const SNAPSHOT = path.join(MIGRATIONS_DIR, 'prev-schema.prisma');
const SCHEMA = path.join(REPO_ROOT, 'prisma', 'schema.prisma');

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('usage: node scripts/db-migrate-create.cjs <snake_case_name>');
  process.exit(1);
}

if (!fs.existsSync(SNAPSHOT)) {
  console.error(
    `${path.relative(REPO_ROOT, SNAPSHOT)} is missing — initialize it by copying the schema state that the last applied migration produced.`,
  );
  process.exit(1);
}

const sql = execFileSync(
  'npx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-schema-datamodel',
    SNAPSHOT,
    '--to-schema-datamodel',
    SCHEMA,
    '--script',
  ],
  { cwd: REPO_ROOT, encoding: 'utf8' },
).trim();

if (sql.length === 0) {
  console.log('No schema drift — nothing to migrate.');
  process.exit(0);
}

const timestamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);
const dir = path.join(MIGRATIONS_DIR, `${timestamp}_${name}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'migration.sql'), `${sql}\n`);
fs.copyFileSync(SCHEMA, SNAPSHOT);

console.log(`Wrote ${path.relative(REPO_ROOT, path.join(dir, 'migration.sql'))}`);
console.log('Review the SQL, then apply with: npm run db:migrate');
