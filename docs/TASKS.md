# Tasks

Last Updated: 2026-08-27

## Todo

### Coverage & Testing

- [ ] **Restore ≥75% line coverage** — currently 74.64%. The old 75.74% figure was not reproducible; the true pre-eBay baseline was 70.82%. Biggest uncovered gaps: `worker.js` (44%), `auth.js` (34%), `system.js` (52%).
- [ ] **Copy `jest.config.js` into the Docker image** — the Dockerfile never copies it, so the documented `docker run … npx jest --coverage` command silently ignores `collectCoverageFrom` and the coverage thresholds. The two measurement bases disagree (71.94% vs 74.64%).
- [ ] **Extend coverage to src/modules/*** — `jest.config.js` targets only `src/server.js`; consider expanding `collectCoverageFrom` to all modules so coverage reflects real posture.

### Tech Debt

- [ ] **state.js read-only exported bindings** — `cards`, `captureQueue`, `uidSeq` are exported `let` bindings that consumers reassign (TypeError in strict ES modules). Refactor to use setter functions (e.g. `setCards`, `setCaptureQueue`) and update all callers. Key files: `public/js/state.js`, `public/js/review.js:79`, `public/js/capture.js:129`.
- [ ] **Circular self-imports** — `review.js:8` imports from `./review.js` itself; `ui.js:5` imports from `./ui.js` itself; `capture.js` imports from `./review.js` for state that should live in `state.js`. Split shared state (cards, uidSeq, seenJobIds) into `state.js` and shared helpers into their own modules.
- [ ] **crop-overlay.js CommonJS→ESM** — uses `require()` but is loaded in a browser ES-module graph; `require` is undefined in the browser. Convert to `import`/`export` syntax matching the other `public/js/modules/` files.
- [ ] **list-view.js stale window listeners** — `_initLongPress()` attaches `window` mousemove/touchmove/mouseup/touchend listeners on every row per `renderList()` call and never removes them. Move global listeners outside the per-row loop so they are attached once.
- [ ] **list-view.js missing imports** — `setSelectedId`, `setIsNewTape`, `updateBulkBar`, `openCropOverlay`, `renderDetailPhotos` are used but not imported in `public/js/modules/list-view.js`. Add the missing imports.
- [ ] **wall-view.js selected state** — cover/spine/stack render branches never apply a selected class even though `selectedId`/`selectedIds` are available. Mirror the `sel`/`bulk-sel` pattern from `list-view.js` so selection is visually reflected in wall mode.
- [ ] **string-utils.js over-aggressive tag stripping** — `normalizeTitle` removes `'film'`, `'title'`, `'video'`, `'tape'` as standalone words, which strips legitimate parts of real titles. Limit these to parenthetical/trailing-only removal or remove them from the list entirely. (Regression test suite added in PR #40.)

### P1

- [ ] Multi-photo batch support — handle multiple photo uploads, show all tapes simultaneously with collapsible form cards
- [ ] GPU performance optimization for AI scanning
- [ ] Multi-tape detection — detect and crop individual tapes from batch photos (OpenCV)

### P2

- [ ] Sell queue export — one-command eBay/Mercari draft template generator from `for_sale` tapes
- [ ] Auto-crop tape thumbnails for wall view (OpenCV/ImageMagick per-tape crop from batch photos)

## Done (recent)

- [x] **eBay sold-listing valuation (Phase 2)** — `src/modules/ebay.js` (OAuth client-credentials + cached app token, Browse API `soldItemsOnly` search, low/high/avg aggregation), `src/modules/routes/valuate.js` (`GET /api/valuate` preview, `POST /api/tapes/:id/valuate` valuate-and-store with `source: "ebay-sold"`), and the previously dead `#d-ebay` button in the detail modal is now wired. 34 new tests.
- [x] **Reconcile test-omdb-enhancements.spec.js counts** — 41 tests; METRICS.md per-suite table now reflects all six suites (200 total).
- [x] **SPA catch-all rate limit** — registered `app.use('/', limiter)` before static/proxy/SPA handlers (PR #40)
- [x] **CSV export / JSON export / print** — shipped in web UI (no Python scripts needed)
- [x] **Google OAuth + multi-user** — optional auth, public sharing via `/c/<uuid>` (PR #38)
- [x] **E2E Playwright test suite** — full coverage of all features and modals (PR #41)
- [x] **Security fixes** — XSS escaping, CSRF state validation, object URL cleanup, SSE leak, CSV formula injection (PR #40, PR #41)
