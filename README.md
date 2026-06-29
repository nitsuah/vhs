# VHS Collection Indexer

A personal tool to catalog a VHS collection — capturing what each tape is, what it might be worth, and building a record you can actually use (sell, store, share). The whole thing lives in a git repo as flat files.

## What's Shipped

- **VHS Shelf Scanner** — browser app (`src/app.js`, `public/`) served via Docker/Nginx
- **Barcode Scanning** — webcam-based barcode scanning with auto-confirm and staging flow
- **AI Photo Scanning** — batch photo upload, AI title recognition, accuracy checking
- **Mobile UI** — mobile-first layout with queue visualization and retry controls
- **Tape Registry** — append-only `data/tapes.json` with immutable `VHS-XXXX` IDs
- **Status & Condition Tracking** — `in_collection`, `for_sale`, `sold`, `donated`, `missing`; `great/good/fair/poor` with notes
- **Tabbed Edit Form** — expanded tape editing with tabbed UI
- **Review Queue** — queue visualization and management for pending tapes
- **StacksUp Integration** — spine rotation enrichment
- **OMDb Verification** — movie database verification of AI scan results
- **Analytics** — basic collection analytics
- **Zoom Slider** — adjustable zoom for photo capture
- **Easter Eggs** — Akira MP3 + negative buzz on failed barcode scans
- **Test Suite** — automated test coverage
- **HTTPS/Mobile Support** — self-signed cert for LAN HTTPS (camera access on mobile)

## Core philosophy

- Immutable index first — the tape registry is append-only. Once a tape gets an ID, it keeps it forever. You can enrich records over time, but IDs never change.
- Flat files in git — the source of truth is a JSON file you can read, diff, and version. Simple wins.
- AI for the tedious parts — photo scanning, title recognition, valuation lookups. Not for the data model.
- Build incrementally — don't solve distribution before you've finished cataloging.


## Data model

Each tape is one record in data/tapes.json:

```json
{
  "id": "VHS-0001",
  "scanned_at": "2025-04-28",
  "photo": "photos/batch-01.jpg",
  "photo_position": 3,
  "title": "Dirty Dancing",
  "year": 1987,
  "label": "Vestron Video",
  "format": "VHS",
  "condition": "great",
  "condition_notes": "",
  "tags": ["drama", "romance", "80s"],
  "valuation": {
    "estimated_low": 2,
    "estimated_high": 8,
    "source": "ebay_sold",
    "checked_at": "2025-04-28"
  },
  "status": "in_collection"
}
```
status can be: in_collection, for_sale, sold, donated, missing

## Repo structure

```bash
vhs/
├── data/
│   └── tapes.json          ← the index (truth)
├── photos/
│   └── ...
├── public/                 ← browser app static files
├── src/
│   └── app.js              ← VHS Shelf Scanner app
├── scripts/
│   ├── valuate.py          ← eBay sold-listings lookup (planned)
│   └── export.py           ← CSV/HTML/print export (planned)
├── exports/
│   └── collection.csv      ← generated, not edited by hand
└── README.md
```

## Running the app

```bash
cp .env.example .env   # fill in DATABASE_URL and HOST_IP
docker compose -f config/docker-compose.yml up -d --build
```

App at `http://localhost:8080`. HTTPS at `https://localhost:8443`.

## Mobile / HTTPS setup

Mobile browsers block camera access on plain HTTP. The app auto-generates a
self-signed TLS cert on first boot and serves it for easy installation.

**One-time setup per device:**

1. Set `HOST_IP=<your LAN IP>` in `.env` (e.g. `HOST_IP=192.168.1.171`)
2. Start the app: `docker compose -f config/docker-compose.yml up -d --build`
3. On your phone, open: `http://192.168.1.171:8082/ca.crt`
4. Android: tap the downloaded file → Install → name it "VHS Scanner" → OK
   iOS: tap Allow → go to Settings → General → VPN & Device Management → trust it
5. Use `https://192.168.1.171:8443` on your phone — camera will work

**If your IP changes:**

```bash
docker volume rm vhs_certs   # forces cert regeneration with new IP on next start
```

Then update `HOST_IP` in `.env` and restart.

> **Note:** The cert is self-signed by a local CA that only your devices trust.
> Traffic never leaves your LAN. The cert lasts 10 years.

## Decisions made

- **Condition** — track it, defaults to `"great"` since she keeps her stuff well. Notes field for anything specific.
- **Wishlist** — skip it for now. She's in downsize mode, not acquisition mode.
- **Sold tapes** — stay in the file. `status` field handles everything: `in_collection`, `for_sale`, `sold`, `donated`. No separate file needed.
- **Flat JSON vs SQLite** — flat JSON is the right call. Collection is likely under 500, nothing sensitive, can live as a public GitHub repo. Simple is correct here.
