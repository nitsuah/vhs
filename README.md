# VHS Collection Indexer

A personal tool to catalog a VHS collection — capturing what each tape is, what it might be worth, and building a record you can actually use (sell, store, share). Backed by PostgreSQL, served by Express, containerized with Docker.

## What's Shipped

### Core
- **VHS Shelf Scanner** — browser app (`public/`) served via Express (`src/server.js`)
- **Tape Registry** — PostgreSQL backend with immutable `VHS-XXXX` IDs; REST CRUD at `/api/tapes`
- **Status & Condition Tracking** — `in_collection`, `for_sale`, `sold`, `donated`, `missing`, `wanted`; `great/good/fair/poor` with notes
- **Full CRUD** — create, edit, delete with confirm dialog; multi-photo per tape

### Capture & Scanning
- **Barcode Scanning** — webcam-based barcode scanning with auto-confirm and staging flow
- **AI Photo Scanning** — batch upload, AI title recognition via Ollama (llava:7b), accuracy checking
- **Capture Queue** — Space stages webcam frames; Enter sends all to AI at once
- **UPC Lookup** — UPCitemdb.com auto-fills title on barcode scan

### Collection Management
- **Batch AI Metadata Fill** — ⚡ Fill button auto-fills year, label, and value for incomplete tapes
- **OMDb Verification** — cross-check AI scan results against the movie database
- **Tags / Genres** — preset genre chips (Horror, SOV, Anime, etc.) plus custom tags
- **Bulk Selection** — checkbox multi-select, bulk status change, bulk delete
- **Sold Price Tracking** — record actual sale price alongside estimate

### Discovery & Filtering
- **Full-text Search** — searches title, label, barcode, notes, and tags simultaneously
- **Filter Bar** — by status, condition, label, tag, year range
- **Sort** — by date, title, value, condition, ID; sort persists via localStorage
- **Wall View** — masonry grid of tape thumbnails; clicking opens detail
- **Clickable Stats Bar** — status/condition chips filter inventory on click

### Exports & Imports
- **CSV Export** — full collection with all fields; formula-injection safe
- **For-Sale CSV** — filtered export with eBay condition labels
- **JSON Export / Import** — full round-trip backup including photos
- **CSV Import** — accepts the app's own export format or manual spreadsheets
- **Print Price Tags** — printable 2.4" dashed-border tags for `for_sale` tapes
- **Printable HTML List** — clean table sorted by ID with Print button

### Auth & Sharing
- **Google OAuth** — optional; leave `GOOGLE_CLIENT_ID` blank to run as single-user
- **Public Collection Sharing** — toggle a shareable `/c/<uuid>` URL per user
- **Write-gate UI** — Add/Import buttons hidden when auth is enabled and user is not logged in

### Infrastructure
- **Mobile UI** — responsive layout, rear-camera preference, touch crop support
- **HTTPS / Mobile Support** — auto-generated self-signed TLS cert for LAN camera access
- **Playwright E2E Tests** — full coverage of all major features and modals
- **Jest Unit Tests** — server-side logic coverage ≥ 75% lines
- **CI** — Hadolint, Shellcheck, HTMLHint, Docker build smoke test

---

## Running the app

```bash
cp .env.example .env   # fill in DATABASE_URL and HOST_IP at minimum
docker compose -f config/docker-compose.yml up -d --build
```

App at `http://localhost:8080` (or whatever `APP_PORT` you set in `.env`).
HTTPS at `https://localhost:8443`.

### Auth (optional)

Auth is disabled by default — the app runs as a single-user tool with no login required.

To enable Google OAuth:

1. Create an OAuth 2.0 Client ID at [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Add Authorized redirect URI: `http://localhost:8080/auth/google/callback` (or your `APP_BASE_URL`)
3. Set in `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   APP_BASE_URL=http://localhost:8080
   ```
4. Restart the container. A "Sign in with Google" button appears in the top bar.

To migrate existing un-owned tapes to your Google account on first login:

```
LEGACY_OWNER_EMAIL=you@gmail.com
```

---

## Mobile / HTTPS setup

Mobile browsers block camera access on plain HTTP. The app auto-generates a self-signed TLS cert on first boot and serves it for easy installation.

**One-time setup per device:**

1. Set `HOST_IP=<your LAN IP>` in `.env` (e.g. `HOST_IP=192.168.1.171`)
2. Start the app: `docker compose -f config/docker-compose.yml up -d --build`
3. On your phone, open: `http://192.168.1.171:8080/ca.crt`
4. **Android:** tap the downloaded file → Install → name it "VHS Scanner" → OK
   **iOS:** tap Allow → Settings → General → VPN & Device Management → trust it
5. Use `https://192.168.1.171:8443` on your phone — camera will work

**If your IP changes:**

```bash
docker volume rm vhs_certs   # forces cert regeneration with new IP on next start
```

> **Note:** The cert is self-signed by a local CA that only your devices trust. Traffic never leaves your LAN. The cert lasts 10 years.

---

## Repo structure

```
vhs/
├── config/
│   └── docker-compose.yml
├── docs/                    ← CHANGELOG, FEATURES, ROADMAP, TASKS
├── migrations/              ← SQL schema migrations (run on startup)
├── public/                  ← browser app static files
│   └── js/                  ← ES-module frontend
│       └── modules/         ← sub-modules (list-view, wall-view, etc.)
├── src/
│   ├── server.js            ← Express entry point
│   └── modules/             ← auth, config, routes
├── tests/                   ← Jest unit tests
├── tests_playwright/        ← Playwright E2E tests
├── .env.example             ← copy to .env and fill in
└── Dockerfile
```

---

## Data model

Each tape is one row in the PostgreSQL `tapes` table. Key fields:

| Field | Type | Notes |
|---|---|---|
| `id` | `TEXT` | Immutable `VHS-XXXX` identifier |
| `title` | `TEXT` | |
| `year` | `INTEGER` | |
| `label` | `TEXT` | e.g. `Paramount Home Video` |
| `format` | `TEXT` | Always `VHS` |
| `condition` | `TEXT` | `great`, `good`, `fair`, `poor` |
| `condition_notes` | `TEXT` | |
| `status` | `TEXT` | `in_collection`, `for_sale`, `sold`, `donated`, `missing`, `wanted` |
| `tags` | `TEXT[]` | Genre/custom tags |
| `estimated_low/high` | `NUMERIC` | Value range |
| `sold_price` | `NUMERIC` | Actual sale price |
| `photos` | `JSONB` | Base64-encoded compressed images |
| `owner_id` | `TEXT` | Google account `sub`; NULL in single-user mode |
| `scanned_at` | `TIMESTAMPTZ` | |

Immutable IDs: once a tape gets a `VHS-XXXX` ID, it keeps it forever.

---

## Decisions made

- **PostgreSQL over flat JSON** — migrated from `tapes.json` when multi-user auth arrived. PostgreSQL via Neon handles concurrent writes, upserts, and user-scoped queries cleanly. The ID scheme (`VHS-XXXX`) is still immutable.
- **Single-user mode** — auth is optional. If `GOOGLE_CLIENT_ID` is not set, the app runs with no login wall and all tapes are global.
- **Condition** — defaults to `"great"`. Notes field for anything specific.
- **Sold tapes** — stay in the database. `status` field handles everything: `in_collection`, `for_sale`, `sold`, `donated`. No archive table needed.
- **AI for the tedious parts** — photo scanning, title recognition, valuation lookups. Not for the data model.
- **Build incrementally** — don't solve distribution before you've finished cataloging.
