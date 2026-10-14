// @ts-check
// Nightly "AI user" journeys: happy paths a real user takes, one visual
// baseline per step. Run by .github/workflows/journeys.yml through the
// shared nitsuah/.github journeys harness, which files/dedups/closes
// `bot:journey` issues from the JSON report. Contract: nitsuah/.github
// journeys/STANDARD.md. The app is served as static files
// (tests/journeys/serve.js) and every API call is mocked from the demo seed
// (promo/demo-mocks.js), so no Postgres or Ollama is needed.
//
// Run / update baselines (Docker, same image as CI so pixels match):
//   docker build -f config/Dockerfile.playwright -t vhs-journeys .
//   docker run --rm -e CI=true vhs-journeys
//   ...add --update-snapshots and mount tests/journeys to refresh baselines
//   (see tests/journeys/README.md).
const path = require('path');

const PORT = 8090;

module.exports = {
  testDir: '../tests/journeys',
  // One baseline per step, Linux only: CI and local runs both use the
  // Playwright Docker image, so no per-platform suffix.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{testName}/{arg}{ext}',
  // A missing baseline must fail in CI (it would otherwise be written and
  // thrown away every night, so the visual check would never run).
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [
    ['list'],
    ['json', { outputFile: path.resolve(__dirname, '../journeys-report/report.json') }],
  ],
  expect: {
    toHaveScreenshot: {
      // DOM-only app: set from the measured noise in the soak (see
      // tests/journeys/README.md), well below one changed word.
      maxDiffPixels: 20,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node tests/journeys/serve.js ${PORT}`,
    cwd: path.resolve(__dirname, '..'),
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
};
