import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OidcTokenVerifier } from './oidc-token-verifier';

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let server: Server;
let issuer: string;
let privateKey: SigningKey;
let publicJwk: JWK;

beforeAll(async () => {
  const keyPair = await generateKeyPair('RS256');
  privateKey = keyPair.privateKey;
  publicJwk = {
    ...(await exportJWK(keyPair.publicKey)),
    alg: 'RS256',
    kid: 'test-key',
    use: 'sig',
  };

  server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/.well-known/openid-configuration') {
      response.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks` }));
      return;
    }
    if (request.url === '/jwks') {
      response.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  issuer = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('OidcTokenVerifier', () => {
  it('verifies a discovered signing key and returns a bounded identity', async () => {
    const token = await accessToken({
      name: ' Ada Lovelace ',
      email: ' ada@example.com ',
    });

    await expect(
      new OidcTokenVerifier().verify(token, {
        issuer,
        audience: 'evidence-api',
      }),
    ).resolves.toEqual({
      issuer,
      subject: 'provider-user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
  });

  it('rejects a token issued for another audience', async () => {
    const token = await accessToken({});

    await expect(
      new OidcTokenVerifier().verify(token, {
        issuer,
        audience: 'another-api',
      }),
    ).rejects.toThrow();
  });
});

function accessToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer)
    .setAudience('evidence-api')
    .setSubject('provider-user-1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}
