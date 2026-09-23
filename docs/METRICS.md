# Metrics

## Coverage

| Metric     | Coverage | Threshold | Status |
|------------|----------|-----------|--------|
| Statements | 79.59% (1860/2337) | 82% | ❌ below |
| Branches   | 79.22% (465/587)   | 77% | ✅ |
| Functions  | 81.82% (54/66)     | 85% | ❌ below |
| Lines      | 79.59% (1860/2337) | 82% | ❌ below |

Percentages are rounded from the counts. Jest's text reporter truncates instead,
so it prints 79.58% for statements.

Down from the 2026-09-02 baseline in `jest.config.js` (85.40 / 79.78 / 88.33 / 85.40,
re-confirmed 2026-09-18). The main cause is `src/modules/tmdb.js`, added in #55,
at **7.6%** statements / **0%** functions: it has no tests yet. Because of it,
`npx jest --coverage` now exits non-zero on the global thresholds in `jest.config.js`.

### Lowest-covered files

| File | Stmts | Branch | Funcs |
|------|-------|--------|-------|
| src/modules/tmdb.js     | 7.60%  | 100%   | 0%     |
| src/modules/certs.js    | 48.64% | 50%    | 100%   |
| src/server.js           | 73.88% | 75.22% | 100%   |
| src/modules/json-parser.js | 77.41% | 72.22% | 66.66% |
| src/modules/ollama.js   | 80.00% | 44.44% | 66.66% |

## Tests

| Metric      | Result       |
|-------------|--------------|
| Test Suites | 8 passed / 8 |
| Tests       | 231 passed / 231 |

## CI

Last `CI` workflow run on `main`: ✅ success (#54, 2026-09-11). CI does not currently
enforce the coverage thresholds.

---

Last Validated: 2026-09-23 (Docker `node:22-alpine` image from repo `Dockerfile`, `NODE_ENV=test npx jest --coverage`)
