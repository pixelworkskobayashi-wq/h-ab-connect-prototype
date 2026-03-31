const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'desktop-chrome',
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npx serve . -p 8080 -s',
    port: 8080,
    reuseExistingServer: false,
  },
});
