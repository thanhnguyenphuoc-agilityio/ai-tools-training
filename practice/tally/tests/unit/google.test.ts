import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MIN_REFETCH_MS, resetGoogleKeyCache, verifyGoogleIdToken } from '../../worker/google';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeJson(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return base64UrlEncode(bytes);
}

describe('verifyGoogleIdToken (GS-10)', () => {
  const clientId = 'test-client-id.apps.googleusercontent.com';
  const kid = 'test-key-id';
  let privateKey: CryptoKey;
  let publicJwk: JsonWebKey;

  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    privateKey = keyPair.privateKey;
    publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    (publicJwk as any).kid = kid;
  });

  async function makeToken(
    headerOverrides: Record<string, unknown> = {},
    payloadOverrides: Record<string, unknown> = {},
  ): Promise<string> {
    const header = {
      alg: 'RS256',
      kid,
      ...headerOverrides,
    };
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'https://accounts.google.com',
      aud: clientId,
      sub: 'google-sub-123',
      email: 'alex@example.com',
      name: 'Alex Developer',
      email_verified: true,
      exp: nowSec + 3600,
      ...payloadOverrides,
    };
    const headerB64 = base64UrlEncodeJson(header);
    const payloadB64 = base64UrlEncodeJson(payload);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data);
    const sigB64 = base64UrlEncode(new Uint8Array(sig));
    return `${headerB64}.${payloadB64}.${sigB64}`;
  }

  it('accepts a valid token', async () => {
    const token = await makeToken();
    const result = await verifyGoogleIdToken(token, {
      clientId,
      getKey: (k) => (k === kid ? publicJwk : null),
    });
    expect(result).toEqual({
      sub: 'google-sub-123',
      email: 'alex@example.com',
      name: 'Alex Developer',
    });
  });

  it('accepts accounts.google.com issuer without https', async () => {
    const token = await makeToken({}, { iss: 'accounts.google.com' });
    const result = await verifyGoogleIdToken(token, {
      clientId,
      getKey: (k) => (k === kid ? publicJwk : null),
    });
    expect(result.sub).toBe('google-sub-123');
  });

  it('refuses wrong audience', async () => {
    const token = await makeToken({}, { aud: 'other-client-id' });
    await expect(
      verifyGoogleIdToken(token, {
        clientId,
        getKey: (k) => (k === kid ? publicJwk : null),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_GOOGLE_TOKEN' });
  });

  it('refuses wrong issuer', async () => {
    const token = await makeToken({}, { iss: 'https://evil.com' });
    await expect(
      verifyGoogleIdToken(token, {
        clientId,
        getKey: (k) => (k === kid ? publicJwk : null),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_GOOGLE_TOKEN' });
  });

  it('refuses unverified email', async () => {
    const token = await makeToken({}, { email_verified: false });
    await expect(
      verifyGoogleIdToken(token, {
        clientId,
        getKey: (k) => (k === kid ? publicJwk : null),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_GOOGLE_TOKEN' });
  });

  it('refuses expired token', async () => {
    const pastSec = Math.floor(Date.now() / 1000) - 1000;
    const token = await makeToken({}, { exp: pastSec });
    await expect(
      verifyGoogleIdToken(token, {
        clientId,
        getKey: (k) => (k === kid ? publicJwk : null),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_GOOGLE_TOKEN' });
  });

  it('refuses bad signature', async () => {
    const token = await makeToken();
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.tamperedSignature`;
    await expect(
      verifyGoogleIdToken(tampered, {
        clientId,
        getKey: (k) => (k === kid ? publicJwk : null),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_GOOGLE_TOKEN' });
  });

  it('refuses alg other than RS256', async () => {
    const token = await makeToken({ alg: 'HS256' });
    await expect(
      verifyGoogleIdToken(token, {
        clientId,
        getKey: (k) => (k === kid ? publicJwk : null),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_GOOGLE_TOKEN' });
  });

  it('refuses a malformed token and an unknown key id', async () => {
    await expect(verifyGoogleIdToken('not-a-jwt', { clientId, getKey: () => publicJwk })).rejects.toMatchObject({
      code: 'INVALID_GOOGLE_TOKEN',
    });
    const token = await makeToken({ kid: 'other-key' });
    await expect(
      verifyGoogleIdToken(token, { clientId, getKey: (k) => (k === kid ? publicJwk : null) }),
    ).rejects.toMatchObject({ code: 'INVALID_GOOGLE_TOKEN' });
  });

  describe('key cache', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      resetGoogleKeyCache();
    });

    it('fetches the keys once, then refetches for an unknown key id at most once per interval', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-20T10:00:00.000Z'));
      resetGoogleKeyCache();
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { 'cache-control': 'max-age=3600' } }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const known = await makeToken({}, { exp: Math.floor(Date.now() / 1000) + 3600 });
      await verifyGoogleIdToken(known, { clientId });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Forged tokens with random key ids do not cause one outbound request each.
      const forged = await makeToken({ kid: 'forged-1' });
      for (let i = 0; i < 5; i++) {
        await expect(verifyGoogleIdToken(forged, { clientId })).rejects.toMatchObject({ code: 'INVALID_GOOGLE_TOKEN' });
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // After the interval a new unknown key id may refetch once (Google rotated its keys).
      vi.setSystemTime(Date.now() + MIN_REFETCH_MS + 1000);
      await expect(verifyGoogleIdToken(forged, { clientId })).rejects.toMatchObject({ code: 'INVALID_GOOGLE_TOKEN' });
      await expect(verifyGoogleIdToken(forged, { clientId })).rejects.toMatchObject({ code: 'INVALID_GOOGLE_TOKEN' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
