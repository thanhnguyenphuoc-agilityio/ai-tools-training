import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
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
  const mf = new Miniflare({ modules: true, script: 'export default {}', d1Databases: ['DB'] });
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
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

  return { env: { DB: db }, dispose: () => mf.dispose() };
}

/** One "browser": keeps its own cookies between requests. */
export class Browser {
  private cookies = new Map<string, string>();
  private app = createApp();

  constructor(private env: Env) {}

  async call<T = any>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; json: T }> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');

    const res = await this.app.request(
      `http://localhost/api${path}`,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      this.env,
    );
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    return { status: res.status, json: (await res.json()) as T };
  }

  /** The same device (same cookies) talking to another environment, e.g. a database wrapped by `interleave`. */
  withEnv(env: Env): Browser {
    const other = new Browser(env);
    other.cookies = this.cookies;
    return other;
  }

  forgetCookies() {
    this.cookies.clear();
  }
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
        return async (stmts: D1PreparedStatement[]) => {
          const unwrapped = stmts.map((s) => originals.get(s) ?? { stmt: s, hit: false });
          if (unwrapped.some((u) => u.hit)) await fire();
          return target.batch(unwrapped.map((u) => u.stmt));
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
