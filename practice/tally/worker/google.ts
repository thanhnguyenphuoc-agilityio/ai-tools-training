// Google ID token verification using WebCrypto (no external dependencies).
import { ApiError } from './http';

export interface VerifyGoogleOptions {
  clientId: string;
  now?: Date;
  getKey?: (kid: string) => Promise<JsonWebKey | null> | JsonWebKey | null;
}

export interface GoogleUser {
  sub: string;
  email: string;
  name: string;
}

interface CachedKeys {
  keys: (JsonWebKey & { kid?: string })[];
  expiresAt: number;
}

let cachedKeys: CachedKeys | null = null;
let lastFetchAt = 0;

/** An unknown key id refetches the keys at most this often: /auth/google is open to anyone. */
export const MIN_REFETCH_MS = 60_000;

/** Forgets the cached keys. Tests only. */
export function resetGoogleKeyCache(): void {
  cachedKeys = null;
  lastFetchAt = 0;
}

async function fetchGoogleKeys(): Promise<(JsonWebKey & { kid?: string })[]> {
  lastFetchAt = Date.now();
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('failed to fetch Google certs');
  const cacheControl = res.headers.get('cache-control') ?? '';
  const match = cacheControl.match(/max-age=(\d+)/);
  const maxAge = match ? parseInt(match[1], 10) : 3600;
  const data = (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  cachedKeys = {
    keys: data.keys,
    expiresAt: Date.now() + maxAge * 1000,
  };
  return data.keys;
}

async function defaultGetKey(kid: string): Promise<JsonWebKey | null> {
  const stale = !cachedKeys || Date.now() >= cachedKeys.expiresAt;
  if (stale) {
    try {
      await fetchGoogleKeys();
    } catch {
      return null;
    }
  }
  let key = cachedKeys?.keys.find((k) => k.kid === kid);
  // Google rotates its keys: a kid missing from fresh-looking keys may be new, but forged tokens
  // with random kids must not cause one outbound request each.
  if (!key && !stale && Date.now() - lastFetchAt >= MIN_REFETCH_MS) {
    try {
      await fetchGoogleKeys();
      key = cachedKeys?.keys.find((k) => k.kid === kid);
    } catch {
      return null;
    }
  }
  return key ?? null;
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeJson<T>(str: string): T {
  const bytes = base64UrlDecode(str);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

export async function verifyGoogleIdToken(token: string, options: VerifyGoogleOptions): Promise<GoogleUser> {
  try {
    if (typeof token !== 'string') {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'token must be string');
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'malformed JWT');
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = base64UrlDecodeJson<{ alg?: string; kid?: string }>(headerB64);
    if (header.alg !== 'RS256') {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'algorithm must be RS256');
    }
    if (!header.kid) {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'missing kid in token header');
    }

    const getKey = options.getKey ?? defaultGetKey;
    const jwk = await getKey(header.kid);
    if (!jwk) {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'unknown key id');
    }

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlDecode(signatureB64);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signatureBytes as unknown as BufferSource,
      signedData as unknown as BufferSource,
    );
    if (!valid) {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'signature verification failed');
    }

    const payload = base64UrlDecodeJson<{
      iss?: string;
      aud?: string;
      sub?: string;
      email?: string;
      name?: string;
      email_verified?: boolean;
      exp?: number;
    }>(payloadB64);

    if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'invalid issuer');
    }
    if (payload.aud !== options.clientId) {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'audience mismatch');
    }
    if (payload.email_verified !== true) {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'email not verified');
    }

    const checkTime = options.now ?? new Date();
    const nowSeconds = Math.floor(checkTime.getTime() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp + 60 <= nowSeconds) {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'token expired');
    }

    if (!payload.sub || !payload.email) {
      throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', 'missing sub or email in payload');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email.split('@')[0],
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', (err as Error).message);
  }
}
