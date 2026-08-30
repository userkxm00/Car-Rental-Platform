import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export interface JwksTestServer {
  baseUrl: string;
  issuer: string;
  jwksUrl: string;
  audience: string;
  /** Sign an access token with the test key. */
  signToken: (claims: Record<string, unknown>, options?: { expiresIn?: string }) => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Local JWKS + token-signing server for auth integration tests.
 *
 * The server publishes the public part of a generated keypair at
 * `/auth/v1/.well-known/jwks.json` (mimicking the Supabase Auth endpoint
 * layout) and signs RS256 access tokens with the private key. This exercises
 * the real verification path in `SupabaseAuthProvider` — including expired
 * and wrong-issuer cases — with no external network access.
 */
export async function startJwksTestServer(port: number): Promise<JwksTestServer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');

  const publicJwk = await exportJWK(publicKey);
  const kid = 'kavriqo-test-key';

  const jwks = { keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] };

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url === '/auth/v1/.well-known/jwks.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(jwks));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const issuer = `${baseUrl}/auth/v1`;
  const jwksUrl = `${issuer}/.well-known/jwks.json`;

  const signToken = async (
    claims: Record<string, unknown>,
    options: { expiresIn?: string } = {},
  ): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = { iss: issuer, aud: 'authenticated', ...claims };
    if (payload.iat === undefined) {
      payload.iat = now;
    }
    const jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt(payload.iat as number);
    if (typeof payload.exp === 'number') {
      jwt.setExpirationTime(payload.exp);
    } else {
      jwt.setExpirationTime(options.expiresIn ?? '5m');
    }
    return jwt.sign(privateKey);
  };

  return {
    baseUrl,
    issuer,
    jwksUrl,
    audience: 'authenticated',
    signToken,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
