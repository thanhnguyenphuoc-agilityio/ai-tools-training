import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  reporter: 'list',
  // Tests read expected text from the Vietnamese locale (e2e/i18n.ts).
  use: { baseURL: 'http://localhost:5174', locale: 'vi-VN', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    env: { TALLY_PORT: '5174', TALLY_DEV_LOGIN: 'true' },
    url: 'http://localhost:5174/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
