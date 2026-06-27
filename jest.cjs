'use strict';
const path = require('path');
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['tests_playwright/'],
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
  testTimeout: 30000,
};