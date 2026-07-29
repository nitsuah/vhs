'use strict';
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.spec.js'],
  testPathIgnorePatterns: ['/node_modules/', '/app/tests/playwright/', '/tests/playwright/'],
  collectCoverageFrom: ['src/server.js'],
  coverageProvider: 'v8',
  coverageThreshold: {
    global: {
      statements: 60,
      branches:   67,
      functions:  25,
      lines:      60,
    },
  },
};
