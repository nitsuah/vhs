# VHS Collection Indexer — Features

Status guide: `[shipped]` is available now, `[planned]` is backlog work.

## Browser App

- `[shipped]` **VHS Shelf Scanner** — web UI served via Docker/Nginx (`src/app.js`, `public/`)
- `[shipped]` **Mobile UI** — mobile-first layout with queue visualization and retry controls
- `[shipped]` **HTTPS/Mobile Support** — self-signed cert for LAN HTTPS (camera access on mobile)
- `[shipped]` **Zoom Slider** — adjustable zoom for photo capture
- `[shipped]` **Tape Wall Gallery** — scrollable masonry grid of tape thumbnails

## Scanning

- `[shipped]` **Barcode Scanning** — webcam-based barcode scanning with auto-confirm and staging flow
- `[shipped]` **AI Photo Scanning** — batch photo upload, AI title recognition, accuracy checking
- `[shipped]` **Multi-tape Detection** — detect and crop individual tapes from batch photos (OpenCV)
- `[shipped]` **GPU Performance Optimization** - for AI scanning

## Data & Registry

- `[shipped]` **Tape Registry** — append-only `data/tapes.json` with immutable `VHS-XXXX` IDs
- `[shipped]` **Status Tracking** — `in_collection`, `for_sale`, `sold`, `donated`, `missing`
- `[shipped]` **Condition Tracking** — `great`, `good`, `fair`, `poor` with free-text notes
- `[planned]` **Valuation** — eBay sold-listings lookup via `scripts/valuate.py`

## UI & Editing

- `[shipped]` **Tabbed Edit Form** — expanded tape editing with tabbed UI
- `[shipped]` **Review Queue** — queue visualization and management for pending tapes

## Enrichment & Verification

- `[shipped]` **StacksUp Integration** — spine rotation enrichment
- `[shipped]` **OMDb Verification** — movie database verification of AI scan results
- `[shipped]` **Analytics** — basic collection analytics

## Fun

- `[shipped]` **Easter Eggs** — Akira MP3 + negative buzz sound on failed barcode scans

## Quality

- `[shipped]` **Test Suite** — automated test coverage

## Scripts

- `[planned]` **Valuate** — `scripts/valuate.py` — eBay sold-listings lookup for price estimates
- `[shipped]` **Export** — `scripts/export.js` — CSV, HTML, or printable list from registry

## Export & Sharing

- `[shipped]` **CSV Export** — machine-readable export for spreadsheets
- `[shipped]` **Sell Queue Export** — one-command workflow that auto-populates eBay/Mercari draft templates for each `for_sale` tape
