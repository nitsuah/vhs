# Metrics

## Core Metrics

| Metric          | Value      | Notes                                   |
| --------------- | ---------- | --------------------------------------- |
| Code Coverage   | 74.64%     | Docker-validated Jest coverage run (lines) |
| Test Files      | 6          | server.test.js, coverage-boost.test.js, debug-jobs.test.js, basic.test.js, test-omdb-enhancements.spec.js, ebay-valuation.test.js |
| Unit Test Cases | 200        | All passing (6 test files; per-suite counts below) |
| E2E Test Files  | 14         | Playwright specs in tests_playwright/   |
| Last Updated    | 2026-08-27 |                                         |

## Collection Stats

| Metric          | Value | Notes                              |
| --------------- | ----- | ---------------------------------- |
| Tapes Indexed   | —     | Records in PostgreSQL `tapes` table |
| Data Backend    | PostgreSQL (Neon) | Migrated from flat tapes.json |

## Progress

- [ ] First tape scanned and committed
- [x] Export to CSV working (built into web UI)
- [x] Export to JSON working (built into web UI)
- [x] Print price tags working
- [x] Valuation script (eBay sold-listings lookup) — `src/modules/ebay.js` + `POST /api/tapes/:id/valuate`

## Test Breakdown

| Test Suite            | Tests | Status  |
| --------------------- | ----- | ------- |
| server.test.js        | 46    | ✅ Pass |
| coverage-boost.test.js| 77    | ✅ Pass |
| debug-jobs.test.js    | 1     | ✅ Pass |
| basic.test.js         | 1     | ✅ Pass |
| test-omdb-enhancements.spec.js | 41 | ✅ Pass |
| ebay-valuation.test.js | 34   | ✅ Pass |
| **Total (unit)**      | **200** | **✅ All Pass** |
| tests_playwright/ (14 specs) | — | E2E; run separately |

## Docker Testing

```bash
# Build
docker compose -f config/docker-compose.yml build

# Unit tests + coverage
docker run --rm vhs-web npx jest --runInBand --coverage
```

**Coverage Details:**
- Statements: 71.42%
- Branches: 66.56%
- Functions: 63.56%
- Lines: 74.64%

**Coverage Target: ≥75% Lines** — 74.64%, just short.

Note: the previously recorded 75.74% is not reproducible on current `main`. Measured
against the same command, the pre-eBay baseline is **70.82% lines / 166 tests**; adding
the valuation feature moved it to **74.64% lines / 200 tests** (+3.82 pts). The enforced
gate in `jest.config.js` is 60% lines and passes.

New-module coverage (lines): `src/modules/ebay.js` 100%, `src/modules/routes/valuate.js` 95.34%.

Caveat: `jest.config.js` sets `collectCoverageFrom: ['src/server.js']`, so a run that picks
up that config reports **server.js only** (71.94%). The whole-tree numbers above come from
the documented `docker run … npx jest --runInBand --coverage` command, which does not see
`jest.config.js` because the Dockerfile never copies it in.
