import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { createApp, type Env } from '../../worker/app';

const MIGRATIONS = join(import.meta.dirname, '../../migrations');

/** A fresh in-memory D1 database with all migrations applied. */
export async function createTestEnv(): Promise<{ env: Env; dispose: () => Promise<void> }> {
  const mf = new Miniflare({ modules: true, script: 'export default {}', d1Databases: ['DB'] });
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/--.*$/gm, '');
    for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
  return { env: { DB: db }, dispose: () => mf.dispose() };
}

/** One "browser": keeps its own cookies between requests. */
export class Browser {
  private cookies = new Map<string, string>();
  private app = createApp();

  constructor(private env: Env) {}

  async call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
    const headers: Record<string, string> = {};
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

  forgetCookies() {
    this.cookies.clear();
  }
}
