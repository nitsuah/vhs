'use strict';
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/ui',
  use: {
    baseURL: 'http://localhost:8082',
    headless: true,
  },
  // Requires app running externally: docker compose --env-file .env up -d
});
