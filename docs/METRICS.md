# Metrics

## Core Metrics

| Metric          | Value      | Notes                                   |
| --------------- | ---------- | --------------------------------------- |
| Code Coverage   | 75.74%     | Docker-validated Jest coverage run      |
| Test Files      | 4          | server.test.js, coverage-boost.test.js, debug-jobs.test.js, basic.test.js |
| Unit Test Cases | 113        | All passing                             |
| E2E Test Files  | 14         | Playwright specs in tests_playwright/   |
| Last Updated    | 2026-08-09 |                                         |

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
- [ ] Valuation script (eBay sold-listings lookup)

## Test Breakdown

| Test Suite            | Tests | Status  |
| --------------------- | ----- | ------- |
| server.test.js        | 47    | ✅ Pass |
| coverage-boost.test.js| 58    | ✅ Pass |
| debug-jobs.test.js    | 1     | ✅ Pass |
| basic.test.js         | 7     | ✅ Pass |
| **Total (unit)**      | **113** | **✅ All Pass** |
| tests_playwright/ (14 specs) | — | E2E; run separately |

## Docker Testing

```bash
# Build
docker compose -f config/docker-compose.yml build

# Unit tests + coverage
docker run --rm vhs-web npx jest --runInBand --coverage
```

**Coverage Details:**
- Statements: 73.1%
- Branches: 70.94%
- Functions: 72.58%
- Lines: 75.74% ✅

**Coverage Target: ≥75% Lines** — **ACHIEVED**
