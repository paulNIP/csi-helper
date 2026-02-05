import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,

  use: {
    headless: true,
    proxy: {
      server: 'http://PROXY_HOST:PORT',
      username: 'PROXY_USER',
      password: 'PROXY_PASS',
    },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
});
