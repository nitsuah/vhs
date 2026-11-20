'use strict';
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.spec.js'],
  testPathIgnorePatterns: ['/node_modules/', '/app/tests/playwright/', '/tests/playwright/', '/tests/journeys/'],
  collectCoverageFrom: [
    'src/server.js',
    'src/modules/**/*.js',
  ],
  coverageProvider: 'v8',
  // Thresholds are whole-tree (src/server.js + src/modules/**), matching what
  // both `npx jest --coverage` and the Docker image now measure identically
  // (see Dockerfile jest.config.js COPY). Set a few points below the measured
  // 2026-09-02 baseline (85.4% stmts / 79.78% branches / 88.33% funcs / 85.4%
  // lines) to gate real regressions without being brittle to minor drift.
  coverageThreshold: {
    global: {
      statements: 82,
      branches:   77,
      functions:  85,
      lines:      82,
    },
  },
};
