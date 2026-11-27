import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/billiards-e2e',
  outputDir: 'test-results/billiards',
  use: { baseURL: 'http://127.0.0.1:5179', trace: 'retain-on-failure' },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js --config vite.game-fixture.config.ts --port 5179 --mode test-billiards',
    url: 'http://127.0.0.1:5179',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://roomtune-fixture.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key',
      VITE_TURNSTILE_SITE_KEY: '',
      VITE_ENABLE_LUDO: 'false',
      VITE_ENABLE_WHEEL: 'false',
      VITE_ENABLE_BAU_CUA: 'false',
      VITE_ENABLE_DUCK_RACE: 'false',
      VITE_ENABLE_TY_PHU: 'false',
      VITE_ENABLE_CO_TUONG: 'false',
      VITE_ENABLE_BILLIARDS: 'true',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
