#!/usr/bin/env node
/**
 * Development-only JWKS server + token minter.
 *
 * Mirrors `apps/api/test/helpers/jwks-test-server.ts` so a local API can be
 * run without a real Supabase project: start this script, then run the API
 * with
 *   SUPABASE_JWT_ISSUER=http://127.0.0.1:5433/auth/v1
 *   SUPABASE_JWKS_URL=http://127.0.0.1:5433/auth/v1/.well-known/jwks.json
 * The minted access token is written to `apps/agency-web/.dev-token` for the
 * agency web dev sign-in (VITE_DEV_ALLOW_TOKEN_LOGIN=true).
 *
 * Never use this script in production.
 */
'use strict';

const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exportJWK, generateKeyPair, SignJWT } = require('jose');

const PORT = Number(process.env.DEV_JWKS_PORT ?? 5433);
const TOKEN_FILE = path.resolve(__dirname, '..', 'apps/agency-web/.dev-token');
const CUSTOMER_TOKEN_FILE = path.resolve(__dirname, '..', 'apps/customer-web/.dev-token');

async function main() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const kid = 'kavriqo-dev-key';
  const jwks = { keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] };

  const server = createServer((request, response) => {
    if (request.url === '/auth/v1/.well-known/jwks.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(jwks));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  const issuer = `http://127.0.0.1:${PORT}/auth/v1`;
  const mint = async (subject) =>
    new SignJWT({ sub: subject, role: 'authenticated' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(privateKey);

  const token = await mint(`dev-user-${Date.now()}`);
  // 07-E: the customer booking portal needs a customer identity. Distinct
  // subject → distinct application user; the portal creates the per-agency
  // customer record on first booking.
  const customerToken = await mint(`dev-customer-${Date.now()}`);

  fs.writeFileSync(TOKEN_FILE, token, { encoding: 'utf8' });
  fs.writeFileSync(CUSTOMER_TOKEN_FILE, customerToken, { encoding: 'utf8' });

  console.log(`dev-jwks: listening on ${issuer}/.well-known/jwks.json`);
  console.log(`dev-jwks: agency token written to ${TOKEN_FILE}`);
  console.log(`dev-jwks: customer token written to ${CUSTOMER_TOKEN_FILE}`);
  console.log('dev-jwks: press Ctrl+C to stop');
}

main().catch((error) => {
  console.error('dev-jwks:', error.message);
  process.exit(1);
});
