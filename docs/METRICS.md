# Metrics

## Coverage

| Metric     | Coverage | Threshold | Status |
|------------|----------|-----------|--------|
| Statements | 86.86% (2030/2337) | 82% | ✅ |
| Branches   | 81.81% (549/671)   | 77% | ✅ |
| Functions  | 87.87% (58/66)     | 85% | ✅ |
| Lines      | 86.86% (2030/2337) | 82% | ✅ |

Back above the thresholds after adding `tests/tmdb.test.js`. `src/modules/tmdb.js`
(added in #55) went from 7.6% to 100% on all four metrics. Before those tests, the
2026-09-23 run was 79.58 / 79.21 / 81.81 / 79.58.

### Lowest-covered files

| File | Stmts | Branch | Funcs |
|------|-------|--------|-------|
| src/modules/certs.js       | 48.64% | 50%    | 100%   |
| src/server.js              | 73.88% | 75.22% | 100%   |
| src/modules/json-parser.js | 77.41% | 72.22% | 66.66% |
| src/modules/ollama.js      | 80.00% | 44.44% | 66.66% |
| src/modules/activity-log.js | 81.81% | 80%   | 66.66% |

## Tests

| Metric      | Result       |
|-------------|--------------|
| Test Suites | 9 passed / 9 |
| Tests       | 252 passed / 252 |

## CI

Last `CI` workflow run on `main`: ✅ success (#54, 2026-09-11). CI does not currently
enforce the coverage thresholds.

---

Last Validated: 2026-09-23 (Docker `node:22-alpine` image from repo `Dockerfile`, `NODE_ENV=test npx jest --coverage`)
