# Metrics

## Core Metrics

| Metric          | Value      | Notes                                   |
| --------------- | ---------- | --------------------------------------- |
| Code Coverage   | 75.74%     | Docker-validated Jest coverage run      |
| Test Files      | 4          | server.test.js, coverage-boost.test.js, debug-jobs.test.js, basic.test.js |
| Test Cases      | 113        | All passing                             |
| Last Updated    | 2026-06-25 | Docker coverage validation              |

## Collection Stats

| Metric          | Value | Notes                              |
| --------------- | ----- | ---------------------------------- |
| Tapes Indexed   | 0     | Records in data/tapes.json         |
| Scripts Written | 0     | Scan, valuate, export not yet built |
| Data Files      | 1     | tapes.json                         |

## Progress

- [ ] First tape scanned and committed
- [ ] Valuation script working
- [ ] Export to CSV working

## Test Breakdown

| Test Suite            | Tests | Status  |
| --------------------- | ----- | ------- |
| server.test.js        | 47    | ✅ Pass |
| coverage-boost.test.js| 58    | ✅ Pass |
| debug-jobs.test.js    | 1     | ✅ Pass |
| basic.test.js         | 7     | ✅ Pass |
| **Total**             | **113** | **✅ All Pass** |

## Docker Testing

```bash
# Run coverage
docker compose -f docker-compose.yml build
docker run --rm vhs-web npx jest --runInBand --coverage
```

**Coverage Details:**
- Statements: 73.1%
- Branches: 70.94%
- Functions: 72.58%
- Lines: 75.74% ✅

**Coverage Target: ≥75% Lines** - **ACHIEVED**