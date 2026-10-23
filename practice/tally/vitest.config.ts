import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // tests/unit/dates.test.ts changes process.env.TZ at run time, which only takes effect in a forked process.
    pool: 'forks',
  },
});
