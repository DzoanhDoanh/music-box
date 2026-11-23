import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/duck-e2e',
  outputDir: 'test-results/duck',
  workers: 1,
  timeout: 90000,
  // Full Chromium new-headless uses the installed GPU; headless-shell uses SwiftShader here.
  use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure', channel: 'chromium' },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js --config vite.game-fixture.config.ts --mode test-duck',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://roomtune-fixture.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key',
      VITE_TURNSTILE_SITE_KEY: '',
      VITE_ENABLE_DUCK_RACE: 'true',
      VITE_ENABLE_LUDO: 'true',
      VITE_ENABLE_BAU_CUA: 'false',
      VITE_ENABLE_WHEEL: 'false',
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
