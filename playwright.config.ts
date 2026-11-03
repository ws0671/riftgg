import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, retries: 0,
  use: { baseURL: 'http://127.0.0.1:5175', channel: process.platform === 'win32' ? 'msedge' : undefined, trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175', reuseExistingServer: false,
    // Test credentials point to an intercepted host; never use a real key in UI tests.
    env: { VITE_SUPABASE_URL: 'https://search-test.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public-key' },
  },
})
