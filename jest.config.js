'use strict';
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/app/tests/playwright/', '/tests/playwright/'],
  collectCoverageFrom: ['server.js'],
  coverageProvider: 'v8',
  coverageThresholds: {
    global: {
      statements: 60,
      branches:   67,
      functions:  25,
      lines:      60,
    },
  },
};
