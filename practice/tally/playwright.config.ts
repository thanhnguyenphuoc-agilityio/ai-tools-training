import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  reporter: 'list',
  // Tests read expected text from the Vietnamese locale (e2e/i18n.ts).
  use: { baseURL: 'http://localhost:5173', locale: 'vi-VN', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
