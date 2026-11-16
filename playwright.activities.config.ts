import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/activities-e2e',
  outputDir: 'test-results/activities',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5176', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 5176 --strictPort --mode test-activities',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://roomtune-fixture.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key',
      VITE_TURNSTILE_SITE_KEY: '',
      VITE_ENABLE_LUDO: 'true',
      VITE_ENABLE_WHEEL: 'true',
    },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
