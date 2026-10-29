import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import type { UserDto } from '../../shared/types';
import { createApp, type Env } from '../../worker/app';

const MIGRATIONS = join(import.meta.dirname, '../../migrations');

export async function applyMigrations(db: D1Database, files: string[]): Promise<void> {
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/--.*$/gm, '');
    for (const statement of sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
}

export interface CreateTestEnvOptions {
  beforeMigration?: string;
  seed?: (db: D1Database) => Promise<void>;
}

/** A fresh in-memory D1 database with all migrations applied (or up to beforeMigration, seed, then remaining). */
export async function createTestEnv(
  options?: CreateTestEnvOptions,
): Promise<{ env: Env; dispose: () => Promise<void> }> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default {}',
    d1Databases: ['DB'],
    r2Buckets: ['RECEIPTS'],
  });
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
  const receipts = (await mf.getR2Bucket('RECEIPTS')) as unknown as R2Bucket;
  const allFiles = readdirSync(MIGRATIONS).sort();

  if (options?.beforeMigration) {
    const beforeIndex = allFiles.indexOf(options.beforeMigration);
    const splitIndex = beforeIndex === -1 ? allFiles.findIndex((f) => f >= options.beforeMigration!) : beforeIndex;
    const targetIndex = splitIndex === -1 ? allFiles.length : splitIndex;
    const firstBatch = allFiles.slice(0, targetIndex);
    const secondBatch = allFiles.slice(targetIndex);

    await applyMigrations(db, firstBatch);
    if (options.seed) {
      await options.seed(db);
    }
    await applyMigrations(db, secondBatch);
  } else {
    await applyMigrations(db, allFiles);
    if (options?.seed) {
      await options.seed(db);
    }
  }

  return { env: { DB: db, RECEIPTS: receipts }, dispose: () => mf.dispose() };
}

/** One "browser": keeps its own cookies between requests. */
export class Browser {
  private cookies = new Map<string, string>();
  private app = createApp();

  constructor(
    public env: Env,
    public origin = 'http://localhost',
  ) {}

  async call<T = any>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; json: T }> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined) headers['content-type'] = 'application/json';

    const cookieMap = new Map(this.cookies);
    if (extraHeaders.cookie) {
      for (const pair of extraHeaders.cookie.split('; ')) {
        const eq = pair.indexOf('=');
        if (eq > 0) cookieMap.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
      delete headers.cookie;
    }
    if (cookieMap.size) headers.cookie = [...cookieMap].map(([k, v]) => `${k}=${v}`).join('; ');

    const res = await this.app.request(
      `${this.origin}/api${path}`,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      this.env,
    );
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const val = pair.slice(eq + 1);
      if (val === '') {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, val);
      }
    }
    return { status: res.status, json: (await res.json()) as T };
  }

  /** Sends a binary body (a receipt photo) with its content type. Cookies are handled as in `call`. */
  async sendBytes(
    method: string,
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = { 'content-type': contentType };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await this.app.request(
      `${this.origin}/api${path}`,
      { method, headers, body: bytes.slice().buffer },
      this.env,
    );
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }

  /** Fetches a raw response (for example a receipt photo) with the browser's cookies. */
  async fetchRaw(path: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    return this.app.request(`${this.origin}/api${path}`, { method: 'GET', headers }, this.env);
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  setCookie(name: string, value: string) {
    this.cookies.set(name, value);
  }

  /** The same device (same cookies) talking to another environment, e.g. a database wrapped by `interleave`. */
  withEnv(env: Env): Browser {
    const other = new Browser(env, this.origin);
    other.cookies = this.cookies;
    return other;
  }

  forgetCookies() {
    this.cookies.clear();
  }
}

export async function signIn(browser: Browser, email: string): Promise<{ user: UserDto }> {
  browser.env = { ...browser.env, DEV_LOGIN: 'true' };
  const res = await browser.call<{ user: UserDto }>('POST', '/auth/dev', { email });
  return res.json;
}

export const GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
export const GOOGLE_KID = 'test-key-id';

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const b64urlJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

/** A throwaway RSA key pair that plays the part of Google: signs ID tokens and publishes the matching JWKS. */
export async function createGoogleKey(kid = GOOGLE_KID) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid };
  return {
    jwk,
    jwks: { keys: [jwk] },
    async sign(payload: Record<string, unknown> = {}, header: Record<string, unknown> = {}): Promise<string> {
      const head = b64urlJson({ alg: 'RS256', kid, ...header });
      const body = b64urlJson({
        iss: 'https://accounts.google.com',
        aud: GOOGLE_CLIENT_ID,
        sub: 'google-sub-1',
        email: 'jamie@example.com',
        name: 'Jamie',
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...payload,
      });
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        pair.privateKey,
        new TextEncoder().encode(`${head}.${body}`),
      );
      return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
    },
  };
}

/**
 * A D1 database that runs `before` once, just before the first statement whose SQL matches `match` is executed
 * (alone or in a batch). Simulates another request committing between a route's checks and its write.
 * `before` must use the original database.
 */
export function interleave(db: D1Database, match: RegExp, before: () => Promise<unknown>): D1Database {
  let fired = false;
  const fire = async () => {
    if (fired) return;
    fired = true;
    await before();
  };
  const originals = new WeakMap<object, { stmt: D1PreparedStatement; hit: boolean }>();
  const wrap = (stmt: D1PreparedStatement, hit: boolean): D1PreparedStatement => {
    const proxy = new Proxy(stmt, {
      get(target, prop) {
        if (prop === 'bind') return (...args: unknown[]) => wrap(target.bind(...args), hit);
        const value = Reflect.get(target, prop, target);
        if (typeof value !== 'function') return value;
        if (hit && ['run', 'first', 'all', 'raw'].includes(prop as string)) {
          return async (...args: unknown[]) => {
            await fire();
            return value.apply(target, args);
          };
        }
        return value.bind(target);
      },
    });
    originals.set(proxy, { stmt, hit });
    return proxy;
  };
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql: string) => wrap(target.prepare(sql), match.test(sql));
      if (prop === 'batch') {
        return async (statements: D1PreparedStatement[]) => {
          const hits = statements.some((s) => originals.get(s)?.hit);
          if (hits) await fire();
          return target.batch(statements);
        };
      }
      return Reflect.get(target, prop, target);
    },
  });
}
