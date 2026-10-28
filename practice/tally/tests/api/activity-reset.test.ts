import { describe, expect, it } from 'vitest';
import { createTestEnv } from './helpers';

describe('0003_activity_reset migration (PG-9)', () => {
  it('resets last_activity_at of existing groups to current time', async () => {
    const startTime = new Date(Date.now() - 1000).toISOString();

    const { env, dispose } = await createTestEnv({
      beforeMigration: '0003_activity_reset.sql',
      seed: async (db) => {
        await db
          .prepare(
            `INSERT INTO groups (code, name, currency, round_to, owner_key_hash, last_activity_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind('group-1', 'Trip 1', 'USD', 1, 'hash1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
          .run();

        await db
          .prepare(
            `INSERT INTO groups (code, name, currency, round_to, owner_key_hash, last_activity_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind('group-2', 'Trip 2', 'VND', 1000, 'hash2', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
          .run();
      },
    });

    try {
      const endTime = new Date(Date.now() + 2000).toISOString();
      const rows = await env.DB.prepare('SELECT last_activity_at FROM groups ORDER BY code').all<{
        last_activity_at: string;
      }>();

      expect(rows.results).toHaveLength(2);
      for (const row of rows.results) {
        expect(row.last_activity_at >= startTime).toBe(true);
        expect(row.last_activity_at <= endTime).toBe(true);
      }
    } finally {
      await dispose();
    }
  });
});
