import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests_playwright',
  use: {
    baseURL: 'http://localhost:8082',
    headless: true,
  },
  // Requires app running externally: docker compose --env-file .env up -d
});
