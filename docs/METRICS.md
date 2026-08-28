# Metrics

## Core Metrics

| Metric          | Value      | Notes                                   |
| --------------- | ---------- | --------------------------------------- |
| Code Coverage   | 74.88%     | Docker whole-tree measurement (lines) — see caveat below |
| Test Files      | 6          | server.test.js, coverage-boost.test.js, debug-jobs.test.js, basic.test.js, test-omdb-enhancements.spec.js, ebay-valuation.test.js |
| Unit Test Cases | 205        | All passing (6 test files; per-suite counts below) |
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
- [x] Valuation script (eBay **active-listing** lookup) — `src/modules/ebay.js` + `POST /api/tapes/:id/valuate`. Asking prices, not sold prices; true sold data needs the Marketplace Insights API (see TASKS.md).

## Test Breakdown

| Test Suite            | Tests | Status  |
| --------------------- | ----- | ------- |
| server.test.js        | 46    | ✅ Pass |
| coverage-boost.test.js| 77    | ✅ Pass |
| debug-jobs.test.js    | 1     | ✅ Pass |
| basic.test.js         | 1     | ✅ Pass |
| test-omdb-enhancements.spec.js | 41 | ✅ Pass |
| ebay-valuation.test.js | 39   | ✅ Pass |
| **Total (unit)**      | **205** | **✅ All Pass** |
| tests_playwright/ (14 specs) | — | E2E; run separately |

## Docker Testing

```bash
# Build
docker compose -f config/docker-compose.yml build

# Unit tests
docker run --rm vhs-web npx jest --runInBand

# Whole-tree coverage — MEASUREMENT ONLY (see warning below)
docker run --rm vhs-web npx jest --runInBand --coverage
```

### ⚠️ Two different coverage bases — do not compare them

The Dockerfile never copies `jest.config.js` into the image, and `package.json` defines no
inline Jest config. So the two numbers below measure different things and are **not**
comparable to each other:

| Basis | Command | Scope | Lines | Gate |
| ----- | ------- | ----- | ----- | ---- |
| **Measurement only** | `docker run … npx jest --coverage` | Whole tree (config ignored) | **74.88%** | none applied |
| **Config-backed gate** | `npx jest --coverage` with `jest.config.js` | `src/server.js` only | **71.94%** | 60% lines — passes |

The whole-tree run silently ignores both `collectCoverageFrom` and `coverageThreshold`,
so it never enforces anything. Never check the whole-tree figure against the configured
threshold. Fix tracked in TASKS.md (copy `jest.config.js` into the image).

**Whole-tree measurement detail:**
- Statements: 71.7%
- Branches: 66.96%
- Functions: 63.84%
- Lines: 74.88%

**Aspirational target: ≥75% lines (whole tree)** — 74.88%, just short. This is a
documentation goal, not an enforced gate.

Note: the previously recorded 75.74% is not reproducible on current `main`. Measured
against the same command, the pre-eBay baseline is **70.82% lines / 166 tests**; adding
the valuation feature moved it to **74.88% lines / 205 tests** (+4.06 pts).

New-module coverage (lines): `src/modules/ebay.js` 100%, `src/modules/routes/valuate.js` 96%.
